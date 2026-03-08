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
}

export interface ExecutionStepResult {
  stepId: string;
  status: ExecutionStatus;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  result?: Record<string, unknown>;
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
        attempts INTEGER NOT NULL DEFAULT 0,
        assertions TEXT
      )
    `);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_executions_scenario_started ON executions(scenario_id, started_at)`);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_executions_status_started ON executions(status, started_at)`);
    this.db.run(sql`CREATE INDEX IF NOT EXISTS idx_steps_execution_id ON execution_steps(execution_id)`);
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
      steps: stepRows.map((s) => ({
        stepId: s.stepId,
        status: s.status as ExecutionStatus,
        startedAt: s.startedAt ?? undefined,
        completedAt: s.completedAt ?? undefined,
        duration: s.duration ?? undefined,
        error: s.error ?? undefined,
        logs: (s.logs as string[] | null) ?? undefined,
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
