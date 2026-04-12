import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

// ── Executions ──────────────────────────────────────────────────────

export const executions = sqliteTable('executions', {
  id: text('id').primaryKey(),
  scenarioId: text('scenario_id').notNull(),
  mode: text('mode', { enum: ['simulation', 'assessment'] }).notNull(),
  status: text('status', {
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled', 'paused', 'skipped'],
  }).notNull(),
  startedAt: integer('started_at'),
  completedAt: integer('completed_at'),
  duration: integer('duration'),
  error: text('error'),
  triggerData: text('trigger_data', { mode: 'json' }).$type<Record<string, unknown>>(),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  context: text('context', { mode: 'json' }).$type<Record<string, unknown>>(),
  pausedState: text('paused_state', { mode: 'json' }).$type<{
    pendingStepIds: string[];
    completedStepIds: string[];
    context: Record<string, unknown>;
    passedSteps: number;
    stepResults: Record<string, unknown>;
  }>(),
  parentExecutionId: text('parent_execution_id'),
  targetUrl: text('target_url').notNull(),
  report: text('report', { mode: 'json' }).$type<{
    summary: string;
    passed: boolean;
    score: number;
    artifacts: string[];
  }>(),
}, (table) => [
  index('idx_executions_scenario_started').on(table.scenarioId, table.startedAt),
  index('idx_executions_status_started').on(table.status, table.startedAt),
  index('idx_executions_target_url').on(table.targetUrl),
]);

// ── Execution Steps ─────────────────────────────────────────────────

export const executionSteps = sqliteTable('execution_steps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  executionId: text('execution_id')
    .notNull()
    .references(() => executions.id, { onDelete: 'cascade' }),
  stepId: text('step_id').notNull(),
  status: text('status', {
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled', 'paused', 'skipped'],
  }).notNull(),
  startedAt: integer('started_at'),
  completedAt: integer('completed_at'),
  duration: integer('duration'),
  error: text('error'),
  logs: text('logs', { mode: 'json' }).$type<string[]>(),
  result: text('result', { mode: 'json' }).$type<Record<string, unknown>>(),
  details: text('details', { mode: 'json' }).$type<{
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
  }>(),
  attempts: integer('attempts').notNull().default(0),
  assertions: text('assertions', { mode: 'json' }).$type<
    { field: string; expected: unknown; actual: unknown; passed: boolean }[]
  >(),
}, (table) => [
  index('idx_steps_execution_id').on(table.executionId),
]);
