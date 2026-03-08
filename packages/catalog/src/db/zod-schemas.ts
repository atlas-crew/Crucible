import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { executions, executionSteps } from './schema.js';

// ── Execution schemas ───────────────────────────────────────────────

export const insertExecutionSchema = createInsertSchema(executions);
export const selectExecutionSchema = createSelectSchema(executions);

// ── Execution step schemas ──────────────────────────────────────────

export const insertExecutionStepSchema = createInsertSchema(executionSteps);
export const selectExecutionStepSchema = createSelectSchema(executionSteps);
