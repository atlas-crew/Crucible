import { eq, and, gte, lte, inArray, desc, sql } from 'drizzle-orm';
import type { CrucibleDb } from './client.js';
import { executions, executionSteps } from './schema.js';

// ── Types matching demo-dashboard's shared/types.ts ─────────────────

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused'
  | 'skipped';

export interface AssertionResult {
  field: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
  overridden?: boolean;
  authoredExpected?: unknown;
}

export type RunnerFindingSeverity =
  | 'info'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'
  | 'unknown';

export interface RunnerSummary {
  type: 'k6' | 'nuclei';
  summary?: string;
  exitCode?: number;
  targetUrl?: string;
  artifacts?: string[];
  metrics?: {
    checksPassed?: number;
    checksFailed?: number;
    thresholdsPassed?: number;
    thresholdsFailed?: number;
    httpReqDurationP95Ms?: number;
    iterations?: number;
    requests?: number;
  };
  findings?: {
    total: number;
    bySeverity?: Partial<Record<RunnerFindingSeverity, number>>;
  };
}

export interface ExecutionStepResult {
  stepId: string;
  status: ExecutionStatus;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  result?: Record<string, unknown>;
  details?: {
    response?: {
      status: number;
      headers: Record<string, string>;
      body: unknown;
    };
    retention?: {
      policy: string;
      truncated: boolean;
      contentType: string;
      originalBytes: number;
      storedBytes: number;
      bodyFormat: 'json' | 'text';
    };
    runner?: RunnerSummary;
  };
  error?: string;
  logs?: string[];
  attempts: number;
  assertions?: AssertionResult[];
}

export interface PausedState {
  pendingStepIds: string[];
  completedStepIds: string[];
  context: Record<string, unknown>;
  passedSteps: number;
  stepResults: Record<string, ExecutionStepResult>;
}

export type ExecutionMode = 'simulation' | 'assessment';

export interface ScenarioExecution {
  id: string;
  scenarioId: string;
  mode: ExecutionMode;
  status: ExecutionStatus;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  steps: ExecutionStepResult[];
  error?: string;
  triggerData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  context?: Record<string, unknown>;
  pausedState?: PausedState;
  parentExecutionId?: string;
  targetUrl: string;
  report?: {
    summary: string;
    passed: boolean;
    score: number;
    artifacts: string[];
  };
}

// ── Query filters ───────────────────────────────────────────────────

export interface ExecutionFilters {
  scenarioId?: string;
  status?: ExecutionStatus | ExecutionStatus[];
  mode?: ExecutionMode;
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
  targetUrl?: string;
}

// ── Repository ──────────────────────────────────────────────────────

export class ExecutionRepository {
  constructor(private db: CrucibleDb) {}

  /**
   * Ensure tables exist. Call once at startup.
   * Uses the raw SQL from the generated migration for simplicity.
   */
  ensureTables(): void {
    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY NOT NULL,
        scenario_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        duration INTEGER,
        error TEXT,
        trigger_data TEXT,
        metadata TEXT,
        context TEXT,
        paused_state TEXT,
        parent_execution_id TEXT,
        target_url TEXT NOT NULL,
        report TEXT
      )
    `);
    this.db.run(sql`
      CREATE TABLE IF NOT EXISTS execution_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
        step_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        duration INTEGER,
        error TEXT,
        logs TEXT,
        result TEXT,
        details TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        assertions TEXT
      )
    `);
    try {
      this.db.run(sql`ALTER TABLE execution_steps ADD COLUMN result TEXT`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const causeMessage =
        error && typeof error === 'object' && 'cause' in error
          ? String((error as { cause?: unknown }).cause ?? '')
          : '';
      if (
        !message.includes('duplicate column name')
        && !causeMessage.includes('duplicate column name')
      ) {
        throw error;
      }
    }
    try {
      this.db.run(sql`ALTER TABLE executions ADD COLUMN target_url TEXT`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const causeMessage =
        error && typeof error === 'object' && 'cause' in error
          ? String((error as { cause?: unknown }).cause ?? '')
          : '';
      if (
        !message.includes('duplicate column name')
        && !causeMessage.includes('duplicate column name')
      ) {
        throw error;
      }
    }
    // Pre-existing DBs may still have NULL target_url values from before this
    // column was required. Backfill with a clear sentinel so the subsequent
    // NOT NULL rebuild cannot fail and so historical rows are distinguishable.
    this.db.run(sql`UPDATE executions SET target_url = 'unknown' WHERE target_url IS NULL`);
    // SQLite cannot tighten a column from nullable to NOT NULL in place, so we
    // rebuild the executions table only if PRAGMA reports target_url is still
    // nullable. Gated so this runs at most once per DB.
    this.tightenTargetUrlNotNull();
    try {
      this.db.run(sql`ALTER TABLE execution_steps ADD COLUMN details TEXT`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const causeMessage =
        error && typeof error === 'object' && 'cause' in error
          ? String((error as { cause?: unknown }).cause ?? '')
          : '';
      if (
        !message.includes('duplicate column name')
        && !causeMessage.includes('duplicate column name')
      ) {
        throw error;
      }
    }
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_executions_scenario_started ON executions(scenario_id, started_at)`);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_executions_status_started ON executions(status, started_at)`);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_executions_target_url ON executions(target_url)`);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_steps_execution_id ON execution_steps(execution_id)`);
  }

  // ── Stats ────────────────────────────────────────────────────────

  /**
   * Get total storage size of all persisted step results and assertions.
   * Useful for validating retention policy impact.
   */
  getStorageStats(): { totalResultBytes: number; totalAssertionBytes: number } {
    const stats = this.db
      .select({
        totalResultBytes: sql<number>`SUM(LENGTH(${executionSteps.details}))`,
        totalAssertionBytes: sql<number>`SUM(LENGTH(${executionSteps.assertions}))`,
      })
      .from(executionSteps)
      .get();

    return {
      totalResultBytes: stats?.totalResultBytes ?? 0,
      totalAssertionBytes: stats?.totalAssertionBytes ?? 0,
    };
  }

  // ── Write operations ────────────────────────────────────────────

  insertExecution(exec: ScenarioExecution): void {
    this.db.transaction((tx) => {
      tx.insert(executions).values({
        id: exec.id,
        scenarioId: exec.scenarioId,
        mode: exec.mode,
        status: exec.status,
        startedAt: exec.startedAt ?? null,
        completedAt: exec.completedAt ?? null,
        duration: exec.duration ?? null,
        error: exec.error ?? null,
        triggerData: exec.triggerData ?? null,
        metadata: exec.metadata ?? null,
        context: exec.context ?? null,
        pausedState: exec.pausedState ?? null,
        parentExecutionId: exec.parentExecutionId ?? null,
        targetUrl: exec.targetUrl,
        report: exec.report ?? null,
      }).run();

      for (const step of exec.steps) {
        tx.insert(executionSteps).values({
          executionId: exec.id,
          stepId: step.stepId,
          status: step.status,
          startedAt: step.startedAt ?? null,
          completedAt: step.completedAt ?? null,
          duration: step.duration ?? null,
          error: step.error ?? null,
          logs: step.logs ?? null,
          details: coercePersistedStepDetails(step),
          attempts: step.attempts,
          assertions: step.assertions ?? null,
        }).run();
      }
    });
  }

  updateExecution(id: string, fields: Partial<Omit<ScenarioExecution, 'id' | 'steps'>>): void {
    const updates: Record<string, unknown> = {};

    if (fields.scenarioId !== undefined) updates.scenarioId = fields.scenarioId;
    if (fields.mode !== undefined) updates.mode = fields.mode;
    if (fields.status !== undefined) updates.status = fields.status;
    if (fields.startedAt !== undefined) updates.startedAt = fields.startedAt;
    if (fields.completedAt !== undefined) updates.completedAt = fields.completedAt;
    if (fields.duration !== undefined) updates.duration = fields.duration;
    if (fields.error !== undefined) updates.error = fields.error;
    if (fields.triggerData !== undefined) updates.triggerData = fields.triggerData;
    if (fields.metadata !== undefined) updates.metadata = fields.metadata;
    if (fields.context !== undefined) updates.context = fields.context;
    if (fields.pausedState !== undefined) updates.pausedState = fields.pausedState;
    if (fields.parentExecutionId !== undefined) updates.parentExecutionId = fields.parentExecutionId;
    if (fields.targetUrl !== undefined) updates.targetUrl = fields.targetUrl;
    if (fields.report !== undefined) updates.report = fields.report;

    if (Object.keys(updates).length === 0) return;

    this.db.update(executions).set(updates).where(eq(executions.id, id)).run();
  }

  /**
   * Insert or update a step result. Keyed on (executionId, stepId).
   */
  upsertStep(executionId: string, step: ExecutionStepResult): void {
    const existing = this.db
      .select({ id: executionSteps.id })
      .from(executionSteps)
      .where(
        and(
          eq(executionSteps.executionId, executionId),
          eq(executionSteps.stepId, step.stepId),
        ),
      )
      .get();

    if (existing) {
      this.db
        .update(executionSteps)
        .set({
          status: step.status,
          startedAt: step.startedAt ?? null,
          completedAt: step.completedAt ?? null,
          duration: step.duration ?? null,
          error: step.error ?? null,
          logs: step.logs ?? null,
          details: coercePersistedStepDetails(step),
          attempts: step.attempts,
          assertions: step.assertions ?? null,
        })
        .where(eq(executionSteps.id, existing.id))
        .run();
    } else {
      this.insertStep(executionId, step);
    }
  }

  deleteExecution(id: string): boolean {
    const result = this.db.delete(executions).where(eq(executions.id, id)).run();
    return result.changes > 0;
  }

  // ── Read operations ─────────────────────────────────────────────

  getExecution(id: string): ScenarioExecution | undefined {
    const row = this.db
      .select()
      .from(executions)
      .where(eq(executions.id, id))
      .get();

    if (!row) return undefined;

    const stepRows = this.db
      .select()
      .from(executionSteps)
      .where(eq(executionSteps.executionId, id))
      .all();

    return this.fromRows(row, stepRows);
  }

  listExecutions(filters?: ExecutionFilters): ScenarioExecution[] {
    const conditions = [];

    if (filters?.scenarioId) {
      conditions.push(eq(executions.scenarioId, filters.scenarioId));
    }
    if (filters?.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      conditions.push(inArray(executions.status, statuses));
    }
    if (filters?.mode) {
      conditions.push(eq(executions.mode, filters.mode));
    }
    if (filters?.since) {
      conditions.push(gte(executions.startedAt, filters.since));
    }
    if (filters?.until) {
      conditions.push(lte(executions.startedAt, filters.until));
    }
    if (filters?.targetUrl) {
      conditions.push(eq(executions.targetUrl, filters.targetUrl));
    }

    let query = this.db
      .select()
      .from(executions)
      .orderBy(desc(executions.startedAt))
      .$dynamic();

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.offset(filters.offset);
    }

    const rows = query.all();

    // Batch-fetch all steps for the returned executions
    if (rows.length === 0) return [];

    const executionIds = rows.map((r) => r.id);
    const allSteps = this.db
      .select()
      .from(executionSteps)
      .where(inArray(executionSteps.executionId, executionIds))
      .all();

    const stepsByExecution = new Map<string, typeof allSteps>();
    for (const step of allSteps) {
      const list = stepsByExecution.get(step.executionId) ?? [];
      list.push(step);
      stepsByExecution.set(step.executionId, list);
    }

    return rows.map((row) => this.fromRows(row, stepsByExecution.get(row.id) ?? []));
  }

  // ── Private helpers ─────────────────────────────────────────────

  /**
   * Rebuild `executions` with `target_url` NOT NULL if the current schema still
   * reports it as nullable. SQLite has no ALTER COLUMN, so we copy rows to a
   * fresh table with the tightened constraint, swap names, and recreate indexes.
   * Callers MUST have backfilled NULLs before invoking this, or the rebuild
   * will fail with a NOT NULL constraint violation.
   */
  private tightenTargetUrlNotNull(): void {
    const columns = this.db.all(sql`PRAGMA table_info(executions)`) as Array<{
      name: string;
      notnull: number;
    }>;
    const targetUrlColumn = columns.find((c) => c.name === 'target_url');
    if (!targetUrlColumn || targetUrlColumn.notnull === 1) {
      return;
    }
    this.db.transaction(() => {
      this.db.run(sql`
        CREATE TABLE executions_new (
          id TEXT PRIMARY KEY NOT NULL,
          scenario_id TEXT NOT NULL,
          mode TEXT NOT NULL,
          status TEXT NOT NULL,
          started_at INTEGER,
          completed_at INTEGER,
          duration INTEGER,
          error TEXT,
          trigger_data TEXT,
          metadata TEXT,
          context TEXT,
          paused_state TEXT,
          parent_execution_id TEXT,
          target_url TEXT NOT NULL,
          report TEXT
        )
      `);
      this.db.run(sql`
        INSERT INTO executions_new (
          id, scenario_id, mode, status, started_at, completed_at, duration,
          error, trigger_data, metadata, context, paused_state,
          parent_execution_id, target_url, report
        )
        SELECT
          id, scenario_id, mode, status, started_at, completed_at, duration,
          error, trigger_data, metadata, context, paused_state,
          parent_execution_id, target_url, report
        FROM executions
      `);
      this.db.run(sql`DROP TABLE executions`);
      this.db.run(sql`ALTER TABLE executions_new RENAME TO executions`);
    });
  }

  private insertStep(executionId: string, step: ExecutionStepResult): void {
    this.db.insert(executionSteps).values({
      executionId,
      stepId: step.stepId,
      status: step.status,
      startedAt: step.startedAt ?? null,
      completedAt: step.completedAt ?? null,
      duration: step.duration ?? null,
      error: step.error ?? null,
      logs: step.logs ?? null,
      details: coercePersistedStepDetails(step),
      attempts: step.attempts,
      assertions: step.assertions ?? null,
    }).run();
  }

  private fromRows(
    row: typeof executions.$inferSelect,
    stepRows: (typeof executionSteps.$inferSelect)[],
  ): ScenarioExecution {
    const exec: ScenarioExecution = {
      id: row.id,
      scenarioId: row.scenarioId,
      mode: row.mode as ExecutionMode,
      status: row.status as ExecutionStatus,
      // Defensive fallback for any row that somehow survived migration with a
      // NULL target_url. Post-migration this should never trigger.
      targetUrl: row.targetUrl ?? 'unknown',
      steps: stepRows.map((s) => ({
        stepId: s.stepId,
        status: s.status as ExecutionStatus,
        startedAt: s.startedAt ?? undefined,
        completedAt: s.completedAt ?? undefined,
        duration: s.duration ?? undefined,
        error: s.error ?? undefined,
        logs: (s.logs as string[] | null) ?? undefined,
        details: (s.details as ExecutionStepResult['details']) ?? undefined,
        result: (s.details as Record<string, unknown> | null) ?? undefined, // Legacy fallback
        attempts: s.attempts,
        assertions: (s.assertions as AssertionResult[] | null) ?? undefined,
      })),
    };

    if (row.startedAt != null) exec.startedAt = row.startedAt;
    if (row.completedAt != null) exec.completedAt = row.completedAt;
    if (row.duration != null) exec.duration = row.duration;
    if (row.error != null) exec.error = row.error;
    if (row.triggerData != null) exec.triggerData = row.triggerData as Record<string, unknown>;
    if (row.metadata != null) exec.metadata = row.metadata as Record<string, unknown>;
    if (row.context != null) exec.context = row.context as Record<string, unknown>;
    if (row.pausedState != null) exec.pausedState = row.pausedState as PausedState;
    if (row.parentExecutionId != null) exec.parentExecutionId = row.parentExecutionId;
    if (row.report != null) exec.report = row.report as ScenarioExecution['report'];

    return exec;
  }
}

function coercePersistedStepDetails(step: ExecutionStepResult): ExecutionStepResult['details'] | null {
  if (step.details) {
    return step.details;
  }

  return isPersistedStepDetails(step.result) ? step.result : null;
}

function isPersistedStepDetails(value: unknown): value is ExecutionStepResult['details'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return 'response' in value || 'retention' in value;
}
