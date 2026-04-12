import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from '../client.js';
import { ExecutionRepository } from '../execution-repository.js';
import type { ScenarioExecution, ExecutionStepResult } from '../execution-repository.js';

function makeExecution(overrides?: Partial<ScenarioExecution>): ScenarioExecution {
  return {
    id: `exec-${Math.random().toString(36).slice(2, 8)}`,
    scenarioId: 'chimera-sqli-auth-bypass',
    mode: 'simulation',
    status: 'pending',
    startedAt: Date.now(),
    targetUrl: 'http://127.0.0.1:8880',
    steps: [],
    ...overrides,
  };
}

function makeStep(overrides?: Partial<ExecutionStepResult>): ExecutionStepResult {
  return {
    stepId: `step-${Math.random().toString(36).slice(2, 8)}`,
    status: 'completed',
    startedAt: Date.now() - 100,
    completedAt: Date.now(),
    duration: 100,
    attempts: 1,
    ...overrides,
  };
}

describe('ExecutionRepository', () => {
  let repo: ExecutionRepository;

  beforeEach(() => {
    const db = createDb(); // :memory:
    repo = new ExecutionRepository(db);
    repo.ensureTables();
  });

  // ── Insert + retrieve ───────────────────────────────────────────

  it('inserts and retrieves an execution', () => {
    const exec = makeExecution();
    repo.insertExecution(exec);

    const retrieved = repo.getExecution(exec.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(exec.id);
    expect(retrieved!.scenarioId).toBe(exec.scenarioId);
    expect(retrieved!.mode).toBe('simulation');
    expect(retrieved!.status).toBe('pending');
  });

  it('inserts execution with steps', () => {
    const steps = [
      makeStep({ stepId: 'login', status: 'completed' }),
      makeStep({ stepId: 'inject', status: 'failed', error: 'Blocked' }),
    ];
    const exec = makeExecution({ steps });
    repo.insertExecution(exec);

    const retrieved = repo.getExecution(exec.id);
    expect(retrieved!.steps).toHaveLength(2);
    expect(retrieved!.steps[0].stepId).toBe('login');
    expect(retrieved!.steps[1].status).toBe('failed');
    expect(retrieved!.steps[1].error).toBe('Blocked');
  });

  it('returns undefined for non-existent execution', () => {
    expect(repo.getExecution('nope')).toBeUndefined();
  });

  it('ensureTables is idempotent when new columns already exist', () => {
    expect(() => repo.ensureTables()).not.toThrow();
  });

  // ── Update ──────────────────────────────────────────────────────

  it('updates execution fields', () => {
    const exec = makeExecution({ status: 'running' });
    repo.insertExecution(exec);

    repo.updateExecution(exec.id, {
      status: 'completed',
      completedAt: Date.now(),
      duration: 5000,
    });

    const updated = repo.getExecution(exec.id);
    expect(updated!.status).toBe('completed');
    expect(updated!.completedAt).toBeDefined();
    expect(updated!.duration).toBe(5000);
  });

  it('updates with no fields is a no-op', () => {
    const exec = makeExecution();
    repo.insertExecution(exec);
    repo.updateExecution(exec.id, {});
    expect(repo.getExecution(exec.id)!.status).toBe('pending');
  });

  // ── Upsert step ─────────────────────────────────────────────────

  it('upserts a new step', () => {
    const exec = makeExecution();
    repo.insertExecution(exec);

    const step = makeStep({ stepId: 'recon', status: 'running', attempts: 1 });
    repo.upsertStep(exec.id, step);

    const retrieved = repo.getExecution(exec.id);
    expect(retrieved!.steps).toHaveLength(1);
    expect(retrieved!.steps[0].stepId).toBe('recon');
    expect(retrieved!.steps[0].status).toBe('running');
  });

  it('upserts an existing step (updates in place)', () => {
    const exec = makeExecution();
    repo.insertExecution(exec);

    repo.upsertStep(exec.id, makeStep({ stepId: 'recon', status: 'running', attempts: 1 }));
    repo.upsertStep(exec.id, makeStep({ stepId: 'recon', status: 'completed', attempts: 1 }));

    const retrieved = repo.getExecution(exec.id);
    expect(retrieved!.steps).toHaveLength(1);
    expect(retrieved!.steps[0].status).toBe('completed');
  });

  // ── Query with filters ──────────────────────────────────────────

  it('queries by scenarioId', () => {
    repo.insertExecution(makeExecution({ id: 'a', scenarioId: 'sqli' }));
    repo.insertExecution(makeExecution({ id: 'b', scenarioId: 'xss' }));
    repo.insertExecution(makeExecution({ id: 'c', scenarioId: 'sqli' }));

    const results = repo.listExecutions({ scenarioId: 'sqli' });
    expect(results).toHaveLength(2);
    expect(results.every((e) => e.scenarioId === 'sqli')).toBe(true);
  });

  it('queries by status', () => {
    repo.insertExecution(makeExecution({ id: 'a', status: 'completed' }));
    repo.insertExecution(makeExecution({ id: 'b', status: 'failed' }));
    repo.insertExecution(makeExecution({ id: 'c', status: 'completed' }));

    const results = repo.listExecutions({ status: 'completed' });
    expect(results).toHaveLength(2);
  });

  it('queries by multiple statuses', () => {
    repo.insertExecution(makeExecution({ id: 'a', status: 'completed' }));
    repo.insertExecution(makeExecution({ id: 'b', status: 'failed' }));
    repo.insertExecution(makeExecution({ id: 'c', status: 'running' }));

    const results = repo.listExecutions({ status: ['completed', 'failed'] });
    expect(results).toHaveLength(2);
  });

  it('queries by mode', () => {
    repo.insertExecution(makeExecution({ id: 'a', mode: 'simulation' }));
    repo.insertExecution(makeExecution({ id: 'b', mode: 'assessment' }));

    const results = repo.listExecutions({ mode: 'assessment' });
    expect(results).toHaveLength(1);
    expect(results[0].mode).toBe('assessment');
  });

  it('queries by date range', () => {
    const now = Date.now();
    repo.insertExecution(makeExecution({ id: 'old', startedAt: now - 100_000 }));
    repo.insertExecution(makeExecution({ id: 'recent', startedAt: now - 1_000 }));
    repo.insertExecution(makeExecution({ id: 'future', startedAt: now + 100_000 }));

    const results = repo.listExecutions({ since: now - 50_000, until: now + 50_000 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('recent');
  });

  it('supports limit and offset', () => {
    for (let i = 0; i < 10; i++) {
      repo.insertExecution(makeExecution({ id: `e-${i}`, startedAt: Date.now() + i }));
    }

    const page1 = repo.listExecutions({ limit: 3 });
    expect(page1).toHaveLength(3);

    const page2 = repo.listExecutions({ limit: 3, offset: 3 });
    expect(page2).toHaveLength(3);
    expect(page2[0].id).not.toBe(page1[0].id);
  });

  it('returns all executions when no filters are given', () => {
    repo.insertExecution(makeExecution({ id: 'a' }));
    repo.insertExecution(makeExecution({ id: 'b' }));

    const results = repo.listExecutions();
    expect(results).toHaveLength(2);
  });

  it('batch-fetches steps for listed executions', () => {
    const exec1 = makeExecution({ id: 'e1', steps: [makeStep({ stepId: 's1' })] });
    const exec2 = makeExecution({ id: 'e2', steps: [makeStep({ stepId: 's2' }), makeStep({ stepId: 's3' })] });
    repo.insertExecution(exec1);
    repo.insertExecution(exec2);

    const results = repo.listExecutions();
    const byId = new Map(results.map((e) => [e.id, e]));
    expect(byId.get('e1')!.steps).toHaveLength(1);
    expect(byId.get('e2')!.steps).toHaveLength(2);
  });

  // ── JSON round-trip ─────────────────────────────────────────────

  it('round-trips triggerData and context', () => {
    const triggerData = { userId: 'admin', ip: '10.0.0.1' };
    const context = { token: 'abc123', extracted: { nested: true } };
    const exec = makeExecution({ triggerData, context });
    repo.insertExecution(exec);

    const retrieved = repo.getExecution(exec.id);
    expect(retrieved!.triggerData).toEqual(triggerData);
    expect(retrieved!.context).toEqual(context);
  });

  it('round-trips report', () => {
    const report = { summary: '5/5 passed', passed: true, score: 100, artifacts: ['/report.json'] };
    const exec = makeExecution({ report, status: 'completed' });
    repo.insertExecution(exec);

    const retrieved = repo.getExecution(exec.id);
    expect(retrieved!.report).toEqual(report);
  });

  it('fresh DB has NOT NULL target_url from CREATE TABLE', () => {
    const db = createDb();
    new ExecutionRepository(db).ensureTables();
    const columns = db.all(sql`PRAGMA table_info(executions)`) as Array<{ name: string; notnull: number }>;
    const targetUrlColumn = columns.find((c) => c.name === 'target_url');
    expect(targetUrlColumn).toBeDefined();
    expect(targetUrlColumn!.notnull).toBe(1);
  });

  it('rejects inserting a NULL target_url after migration', () => {
    const db = createDb();
    new ExecutionRepository(db).ensureTables();
    expect(() =>
      db.run(sql`
        INSERT INTO executions (id, scenario_id, mode, status, target_url)
        VALUES ('bad', 'scenario-x', 'simulation', 'pending', NULL)
      `),
    ).toThrow();
  });

  it('backfills NULL target_url and tightens constraint on a pre-existing DB', () => {
    // Simulate a pre-existing DB: executions table that predates the NOT NULL
    // tightening, with a row whose target_url is NULL.
    const db = createDb();
    db.run(sql`
      CREATE TABLE executions (
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
        target_url TEXT,
        report TEXT
      )
    `);
    db.run(sql`
      CREATE TABLE execution_steps (
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
    db.run(sql`
      INSERT INTO executions (id, scenario_id, mode, status, target_url)
      VALUES ('historical-null', 'scenario-y', 'assessment', 'completed', NULL)
    `);

    const repo = new ExecutionRepository(db);
    repo.ensureTables();

    const historical = repo.getExecution('historical-null');
    expect(historical).toBeDefined();
    expect(historical!.targetUrl).toBe('unknown');

    const columns = db.all(sql`PRAGMA table_info(executions)`) as Array<{ name: string; notnull: number }>;
    const targetUrlColumn = columns.find((c) => c.name === 'target_url');
    expect(targetUrlColumn!.notnull).toBe(1);
  });

  it('is idempotent when ensureTables runs twice on a migrated DB', () => {
    const db = createDb();
    const repo = new ExecutionRepository(db);
    repo.ensureTables();
    // Running the migration path again must not rebuild the table or throw.
    expect(() => repo.ensureTables()).not.toThrow();
    const columns = db.all(sql`PRAGMA table_info(executions)`) as Array<{ name: string; notnull: number }>;
    const targetUrlColumn = columns.find((c) => c.name === 'target_url');
    expect(targetUrlColumn!.notnull).toBe(1);
  });

  it('round-trips targetUrl and stored step details', () => {
    const details = {
      response: {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: { ok: true },
      },
      retention: {
        policy: 'all',
        truncated: false,
        contentType: 'application/json',
        originalBytes: 12,
        storedBytes: 12,
        bodyFormat: 'json' as const,
      },
    };
    const exec = makeExecution({
      targetUrl: 'http://127.0.0.1:4545',
      steps: [makeStep({ stepId: 'health', details })],
    });

    repo.insertExecution(exec);

    const retrieved = repo.getExecution(exec.id);
    expect(retrieved!.targetUrl).toBe('http://127.0.0.1:4545');
    expect(retrieved!.steps[0].details).toEqual(details);
  });

  it('round-trips pausedState', () => {
    const pausedState = {
      pendingStepIds: ['step-3', 'step-4'],
      completedStepIds: ['step-1', 'step-2'],
      context: { token: 'xyz' },
      passedSteps: 2,
      stepResults: { 'step-1': { stepId: 'step-1', status: 'completed' as const, attempts: 1 } },
    };
    const exec = makeExecution({ pausedState, status: 'paused' });
    repo.insertExecution(exec);

    const retrieved = repo.getExecution(exec.id);
    expect(retrieved!.pausedState).toEqual(pausedState);
  });

  it('round-trips step assertions', () => {
    const assertions = [
      { field: 'status', expected: 200, actual: 200, passed: true },
      { field: 'bodyContains', expected: 'token', actual: '(not found)', passed: false },
    ];
    const step = makeStep({ stepId: 'check', assertions });
    const exec = makeExecution({ steps: [step] });
    repo.insertExecution(exec);

    const retrieved = repo.getExecution(exec.id);
    expect(retrieved!.steps[0].assertions).toEqual(assertions);
  });

  it('round-trips step response result payloads', () => {
    const result = {
      response: {
        status: 403,
        headers: { 'content-type': 'application/json' },
        body: { error: 'blocked' },
      },
      retention: {
        policy: 'all',
        truncated: false,
        contentType: 'application/json',
        originalBytes: 19,
        storedBytes: 19,
        bodyFormat: 'json',
      },
    };
    const step = makeStep({ stepId: 'blocked', result });
    const exec = makeExecution({ steps: [step] });
    repo.insertExecution(exec);

    const retrieved = repo.getExecution(exec.id);
    expect(retrieved!.steps[0].result).toEqual(result);
  });

  // ── Delete + cascade ────────────────────────────────────────────

  it('deletes execution and cascades to steps', () => {
    const exec = makeExecution({ steps: [makeStep({ stepId: 's1' }), makeStep({ stepId: 's2' })] });
    repo.insertExecution(exec);

    const deleted = repo.deleteExecution(exec.id);
    expect(deleted).toBe(true);
    expect(repo.getExecution(exec.id)).toBeUndefined();
  });

  it('returns false when deleting non-existent execution', () => {
    expect(repo.deleteExecution('nope')).toBe(false);
  });
});
