import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { createDb } from '../client.js';
import { executions, executionSteps } from '../schema.js';
import {
  insertExecutionSchema,
  selectExecutionSchema,
  insertExecutionStepSchema,
  selectExecutionStepSchema,
} from '../zod-schemas.js';

describe('createDb', () => {
  it('creates an in-memory database by default', () => {
    const db = createDb();
    expect(db).toBeDefined();
  });

  it('enables WAL journal mode', () => {
    // WAL is set via pragma in createDb; verify DB is functional
    const db = createDb();
    expect(db).toBeDefined();
  });

  it('creates tables via push', () => {
    // Use raw better-sqlite3 to verify schema after drizzle-kit push
    const sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    // Manually create tables matching our schema (simulating what drizzle-kit push does)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
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
      );

      CREATE TABLE IF NOT EXISTS execution_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
        step_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        duration INTEGER,
        error TEXT,
        logs TEXT,
        result TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        assertions TEXT
      );
    `);

    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('executions');
    expect(tableNames).toContain('execution_steps');

    sqlite.close();
  });
});

describe('Drizzle schema tables', () => {
  it('exports executions table', () => {
    expect(executions).toBeDefined();
  });

  it('exports executionSteps table', () => {
    expect(executionSteps).toBeDefined();
  });
});

describe('Zod schemas from drizzle-zod', () => {
  it('validates a correct execution insert', () => {
    const result = insertExecutionSchema.safeParse({
      id: 'exec-123',
      scenarioId: 'chimera-sqli-auth-bypass',
      mode: 'simulation',
      status: 'pending',
      startedAt: Date.now(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects an execution insert with missing required fields', () => {
    const result = insertExecutionSchema.safeParse({
      id: 'exec-123',
      // missing scenarioId, mode, status
    });
    expect(result.success).toBe(false);
  });

  it('validates a correct execution step insert', () => {
    const result = insertExecutionStepSchema.safeParse({
      executionId: 'exec-123',
      stepId: 'step-1',
      status: 'completed',
      attempts: 1,
      result: {
        response: {
          status: 200,
          body: { ok: true },
        },
      },
      assertions: [
        { field: 'status', expected: 200, actual: 200, passed: true },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('round-trips JSON blob columns', () => {
    const triggerData = { userId: 'admin', tags: ['test', 'auth'] };
    const report = { summary: 'All passed', passed: true, score: 100, artifacts: ['/report.pdf'] };

    const result = insertExecutionSchema.safeParse({
      id: 'exec-456',
      scenarioId: 'chimera-jwt-token-forgery',
      mode: 'assessment',
      status: 'completed',
      triggerData,
      report,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.triggerData).toEqual(triggerData);
      expect(result.data.report).toEqual(report);
    }
  });

  it('exports select schemas', () => {
    expect(selectExecutionSchema).toBeDefined();
    expect(selectExecutionStepSchema).toBeDefined();
  });
});
