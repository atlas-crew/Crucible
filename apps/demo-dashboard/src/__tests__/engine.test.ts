import { ScenarioEngine } from '../server/engine.js';

// ── Mocks ─────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

function mockResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const headerMap = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
      forEach: (cb: (v: string, k: string) => void) =>
        headerMap.forEach((v, k) => cb(v, k)),
    },
    json: () => Promise.resolve(body),
    text: () =>
      Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function waitForEvent(engine: ScenarioEngine, event: string, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
    engine.once(event, (data: any) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

const mockCatalog = { getScenario: vi.fn() } as any;

/** Helper: returns a simple multi-step scenario with configurable step count. */
function makeScenario(id: string, stepCount: number) {
  const steps = Array.from({ length: stepCount }, (_, i) => ({
    id: `step-${i}`,
    name: `Step ${i}`,
    stage: 'main',
    request: { method: 'GET', url: `http://localhost/step-${i}` },
    ...(i > 0 ? { dependsOn: [`step-${i - 1}`] } : {}),
  }));
  return { id, name: `Scenario ${id}`, steps };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('ScenarioEngine', () => {
  let engine: ScenarioEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Reset env between tests
    delete process.env.CRUCIBLE_MAX_CONCURRENCY;
    engine = new ScenarioEngine(mockCatalog);
  });

  afterEach(() => {
    engine.destroy();
    vi.useRealTimers();
  });

  describe('context resolution', () => {
    it('extracts a variable and resolves it in a subsequent step', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'ctx-test',
        name: 'Context Test',
        steps: [
          {
            id: 'login',
            name: 'Login',
            stage: 'auth',
            request: { method: 'POST', url: 'http://localhost/login', body: { user: 'admin' } },
            extract: { token: { from: 'body', path: 'access_token' } },
          },
          {
            id: 'get-data',
            name: 'Get Data',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/data', headers: { Authorization: 'Bearer {{token}}' } },
            dependsOn: ['login'],
          },
        ],
      });

      mockFetch
        .mockResolvedValueOnce(mockResponse(200, { access_token: 'jwt-abc-123' }, { 'content-type': 'application/json' }))
        .mockResolvedValueOnce(mockResponse(200, { items: [] }, { 'content-type': 'application/json' }));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('ctx-test');
      const execution = await done;

      // Verify the second fetch got the resolved token
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const secondCall = mockFetch.mock.calls[1];
      expect(secondCall[1].headers.Authorization).toBe('Bearer jwt-abc-123');

      expect(execution.status).toBe('completed');
      expect(execution.context).toHaveProperty('token', 'jwt-abc-123');
    });
  });

  describe('assertions', () => {
    it('step passes when expect.status matches response', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'assert-pass',
        name: 'Assert Pass',
        steps: [
          {
            id: 'health',
            name: 'Health',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/health' },
            expect: { status: 200 },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('assert-pass');
      const execution = await done;

      expect(execution.steps[0].status).toBe('completed');
      expect(execution.steps[0].assertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'status', passed: true }),
        ]),
      );
    });

    it('step fails when expect.blocked is true but response is 200', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'assert-fail',
        name: 'Assert Fail',
        steps: [
          {
            id: 'check',
            name: 'Check',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/resource' },
            expect: { blocked: true },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(mockResponse(200, 'allowed'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('assert-fail');
      const execution = await done;

      // Step should be failed (assertion mismatch)
      expect(execution.steps[0].status).toBe('failed');
      expect(execution.steps[0].assertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'blocked', passed: false }),
        ]),
      );
    });
  });

  describe('conditionals', () => {
    it('skips a step when its when.succeeded condition is not met', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'cond-test',
        name: 'Conditional Test',
        steps: [
          {
            id: 'step-a',
            name: 'Step A (will fail)',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/a' },
            expect: { status: 200 },
          },
          {
            id: 'step-b',
            name: 'Step B (conditional)',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/b' },
            dependsOn: ['step-a'],
            when: { step: 'step-a', succeeded: true },
          },
        ],
      });

      // Step A gets 500 → assertion fails → status = 'failed'
      mockFetch.mockResolvedValueOnce(mockResponse(500, 'error'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('cond-test');
      const execution = await done;

      const stepB = execution.steps.find((s: any) => s.stepId === 'step-b');
      expect(stepB).toBeDefined();
      expect(stepB!.status).toBe('skipped');

      // Only 1 fetch call — step B was skipped
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('retries', () => {
    it('retries a failing step and succeeds on the last attempt', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'retry-test',
        name: 'Retry Test',
        steps: [
          {
            id: 'flaky',
            name: 'Flaky',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/flaky' },
            expect: { status: 200 },
            execution: { retries: 2 },
          },
        ],
      });

      // Fail twice, succeed on third (1 initial + 2 retries = 3)
      mockFetch
        .mockResolvedValueOnce(mockResponse(500, 'fail'))
        .mockResolvedValueOnce(mockResponse(500, 'fail'))
        .mockResolvedValueOnce(mockResponse(200, 'ok'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('retry-test');
      const execution = await done;

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(execution.steps[0].status).toBe('completed');
      expect(execution.steps[0].attempts).toBe(3);
    });

    it('fails after exhausting retries', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'retry-exhaust',
        name: 'Retry Exhaust',
        steps: [
          {
            id: 'down',
            name: 'Down',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/down' },
            expect: { status: 200 },
            execution: { retries: 1 },
          },
        ],
      });

      mockFetch
        .mockResolvedValueOnce(mockResponse(500, 'fail'))
        .mockResolvedValueOnce(mockResponse(500, 'fail'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('retry-exhaust');
      const execution = await done;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(execution.steps[0].status).toBe('failed');
      expect(execution.steps[0].attempts).toBe(2);
    });
  });

  // ── New test suites ─────────────────────────────────────────────────

  describe('concurrency', () => {
    it('limits concurrent executions to maxConcurrency', async () => {
      process.env.CRUCIBLE_MAX_CONCURRENCY = '2';
      engine.destroy();
      engine = new ScenarioEngine(mockCatalog);

      // Create a scenario with one slow step
      const scenario = makeScenario('conc-test', 1);
      mockCatalog.getScenario.mockReturnValue(scenario);

      // Each fetch takes a while (we'll use a deferred approach)
      let resolvers: Array<(v: any) => void> = [];
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(mockResponse(200, 'ok')));
        }),
      );

      // Start 3 executions — only 2 should run immediately
      const id1 = await engine.startScenario('conc-test');
      const id2 = await engine.startScenario('conc-test');
      const id3 = await engine.startScenario('conc-test');

      // Give microtasks time to resolve
      await vi.advanceTimersByTimeAsync(10);

      // First two should be running (fetch was called), third should still be pending
      expect(resolvers.length).toBe(2);

      const exec3 = engine.getExecution(id3);
      expect(exec3?.status).toBe('pending');

      // Complete first execution
      const done1 = waitForEvent(engine, 'execution:completed');
      resolvers[0](undefined);
      await done1;

      // Give the queue time to dequeue
      await vi.advanceTimersByTimeAsync(10);

      // Now the third should have started (fetch called)
      expect(resolvers.length).toBe(3);
    });

    it('queued execution starts when a slot opens', async () => {
      process.env.CRUCIBLE_MAX_CONCURRENCY = '1';
      engine.destroy();
      engine = new ScenarioEngine(mockCatalog);

      const scenario = makeScenario('queue-test', 1);
      mockCatalog.getScenario.mockReturnValue(scenario);

      let resolvers: Array<(v: any) => void> = [];
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(mockResponse(200, 'ok')));
        }),
      );

      await engine.startScenario('queue-test');
      const id2 = await engine.startScenario('queue-test');

      await vi.advanceTimersByTimeAsync(10);
      expect(resolvers.length).toBe(1);

      // Complete first
      const done1 = waitForEvent(engine, 'execution:completed');
      resolvers[0](undefined);
      await done1;

      await vi.advanceTimersByTimeAsync(10);

      // Second should have started
      expect(resolvers.length).toBe(2);

      // Complete second
      const done2 = waitForEvent(engine, 'execution:completed');
      resolvers[1](undefined);
      const exec2 = await done2;
      expect(exec2.status).toBe('completed');
    });
  });

  describe('pause/resume', () => {
    it('pauses between steps and preserves pausedState', async () => {
      const scenario = makeScenario('pause-test', 3);
      mockCatalog.getScenario.mockReturnValue(scenario);

      // Use deferred fetches so we can control timing precisely
      const resolvers: Array<() => void> = [];
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(mockResponse(200, 'ok')));
        }),
      );

      const pausedPromise = waitForEvent(engine, 'execution:paused');
      const id = await engine.startScenario('pause-test');

      // Wait for step-0's fetch to be called
      await vi.advanceTimersByTimeAsync(10);
      expect(resolvers.length).toBe(1);

      // Set pause WHILE step-0 is in-flight (before resolving)
      // After step-0 completes, the loop will check pause at the top of the next iteration
      engine.pauseExecution(id);

      // Complete step-0
      resolvers[0]();

      const paused = await pausedPromise;
      expect(paused.status).toBe('paused');
      expect(paused.pausedState).toBeDefined();
      expect(paused.pausedState.completedStepIds).toContain('step-0');
      expect(paused.pausedState.pendingStepIds).toContain('step-1');
      expect(paused.pausedState.pendingStepIds).toContain('step-2');
    });

    it('resume completes execution after pause', async () => {
      const scenario = makeScenario('resume-test', 2);
      mockCatalog.getScenario.mockReturnValue(scenario);

      const resolvers: Array<() => void> = [];
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(mockResponse(200, 'ok')));
        }),
      );

      const pausedPromise = waitForEvent(engine, 'execution:paused');
      const id = await engine.startScenario('resume-test');

      await vi.advanceTimersByTimeAsync(10);

      // Pause while step-0 is in-flight
      engine.pauseExecution(id);
      resolvers[0]();
      await pausedPromise;

      // Resume — engine will continue the while loop
      const completedPromise = waitForEvent(engine, 'execution:completed');
      engine.resumeExecution(id);

      // Engine resumes, finds step-1 executable, starts fetch
      await vi.advanceTimersByTimeAsync(10);
      resolvers[1]();

      const completed = await completedPromise;
      expect(completed.status).toBe('completed');
    });
  });

  describe('cancel', () => {
    it('cancels a running execution', async () => {
      const scenario = makeScenario('cancel-run', 3);
      mockCatalog.getScenario.mockReturnValue(scenario);

      let resolvers: Array<(v: any) => void> = [];
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(mockResponse(200, 'ok')));
        }),
      );

      const cancelledPromise = waitForEvent(engine, 'execution:cancelled');
      const id = await engine.startScenario('cancel-run');

      await vi.advanceTimersByTimeAsync(5);

      engine.cancelExecution(id);

      // Resolve any pending fetches so the loop can proceed to the cancel check
      resolvers.forEach((r) => r(undefined));

      const cancelled = await cancelledPromise;
      expect(cancelled.status).toBe('cancelled');
    });

    it('cancels a paused execution', async () => {
      const scenario = makeScenario('cancel-pause', 3);
      mockCatalog.getScenario.mockReturnValue(scenario);

      const resolvers: Array<() => void> = [];
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(mockResponse(200, 'ok')));
        }),
      );

      const pausedPromise = waitForEvent(engine, 'execution:paused');
      const id = await engine.startScenario('cancel-pause');

      await vi.advanceTimersByTimeAsync(10);

      // Pause while step-0 is in-flight
      engine.pauseExecution(id);
      resolvers[0]();
      await pausedPromise;

      // Now cancel the paused execution
      const cancelledPromise = waitForEvent(engine, 'execution:cancelled');
      engine.cancelExecution(id);

      const cancelled = await cancelledPromise;
      expect(cancelled.status).toBe('cancelled');
    });

    it('passes AbortSignal to fetch', async () => {
      const scenario = makeScenario('abort-signal', 1);
      mockCatalog.getScenario.mockReturnValue(scenario);

      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          resolve(mockResponse(200, 'ok'));
        }),
      );

      await engine.startScenario('abort-signal');
      await vi.advanceTimersByTimeAsync(5);

      // Verify fetch was called with a signal
      expect(mockFetch).toHaveBeenCalled();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1]).toHaveProperty('signal');
      expect(callArgs[1].signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('restart', () => {
    it('creates a new execution with parentExecutionId', async () => {
      const scenario = makeScenario('restart-test', 1);
      mockCatalog.getScenario.mockReturnValue(scenario);

      mockFetch.mockImplementation(() =>
        Promise.resolve(mockResponse(200, 'ok')),
      );

      const done = waitForEvent(engine, 'execution:completed');
      const id1 = await engine.startScenario('restart-test');
      await done;

      const done2 = waitForEvent(engine, 'execution:completed');
      const id2 = await engine.restartExecution(id1);

      expect(id2).toBeTruthy();
      expect(id2).not.toBe(id1);

      const exec2 = await done2;
      expect(exec2.parentExecutionId).toBe(id1);
    });

    it('cancels active execution before restart', async () => {
      const scenario = makeScenario('restart-active', 3);
      mockCatalog.getScenario.mockReturnValue(scenario);

      let resolvers: Array<(v: any) => void> = [];
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(mockResponse(200, 'ok')));
        }),
      );

      const id1 = await engine.startScenario('restart-active');
      await vi.advanceTimersByTimeAsync(5);

      // Restart while running
      const id2 = await engine.restartExecution(id1);

      // Resolve pending fetches
      resolvers.forEach((r) => r(undefined));
      await vi.advanceTimersByTimeAsync(10);

      expect(id2).toBeTruthy();
      expect(id2).not.toBe(id1);

      const exec1 = engine.getExecution(id1);
      expect(exec1?.status).toBe('cancelled');
    });
  });

  describe('cleanup', () => {
    it('evicts terminal executions older than TTL', async () => {
      const scenario = makeScenario('ttl-test', 1);
      mockCatalog.getScenario.mockReturnValue(scenario);

      mockFetch.mockImplementation(() =>
        Promise.resolve(mockResponse(200, 'ok')),
      );

      const done = waitForEvent(engine, 'execution:completed');
      const id = await engine.startScenario('ttl-test');
      await done;

      expect(engine.getExecution(id)).toBeDefined();

      // Advance past TTL (30 min) + cleanup interval (60s)
      await vi.advanceTimersByTimeAsync(31 * 60_000);

      expect(engine.getExecution(id)).toBeUndefined();
    });

    it('enforces max execution count', async () => {
      const scenario = makeScenario('count-test', 1);
      mockCatalog.getScenario.mockReturnValue(scenario);

      mockFetch.mockImplementation(() =>
        Promise.resolve(mockResponse(200, 'ok')),
      );

      // Create 55 completed executions
      const ids: string[] = [];
      for (let i = 0; i < 55; i++) {
        const done = waitForEvent(engine, 'execution:completed');
        const id = await engine.startScenario('count-test');
        ids.push(id);
        await done;
      }

      // Trigger cleanup
      await vi.advanceTimersByTimeAsync(61_000);

      // Should be at most 50
      let remaining = 0;
      for (const id of ids) {
        if (engine.getExecution(id)) remaining++;
      }
      expect(remaining).toBeLessThanOrEqual(50);
    });
  });

  describe('global controls', () => {
    it('pauseAll pauses all running executions', async () => {
      const scenario = makeScenario('global-pause', 3);
      mockCatalog.getScenario.mockReturnValue(scenario);

      let resolvers: Array<(v: any) => void> = [];
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(mockResponse(200, 'ok')));
        }),
      );

      const id1 = await engine.startScenario('global-pause');
      const id2 = await engine.startScenario('global-pause');

      // Let them start running
      await vi.advanceTimersByTimeAsync(5);
      resolvers.forEach((r) => r(undefined));
      await vi.advanceTimersByTimeAsync(5);

      const count = engine.pauseAll();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('resumeAll resumes all paused executions', async () => {
      const scenario = makeScenario('global-resume', 3);
      mockCatalog.getScenario.mockReturnValue(scenario);

      const resolvers: Array<() => void> = [];
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(mockResponse(200, 'ok')));
        }),
      );

      const id1 = await engine.startScenario('global-resume');
      const id2 = await engine.startScenario('global-resume');

      // Wait for both step-0 fetches to be called
      await vi.advanceTimersByTimeAsync(10);

      // Pause both while their step-0 is in-flight
      engine.pauseExecution(id1);
      engine.pauseExecution(id2);

      // Resolve fetches so they hit the pause checkpoint
      resolvers.forEach((r) => r());
      await vi.advanceTimersByTimeAsync(10);

      // Both should be paused now
      expect(engine.getExecution(id1)?.status).toBe('paused');
      expect(engine.getExecution(id2)?.status).toBe('paused');

      const count = engine.resumeAll();
      expect(count).toBe(2);
    });

    it('cancelAll cancels all active executions', async () => {
      const scenario = makeScenario('global-cancel', 3);
      mockCatalog.getScenario.mockReturnValue(scenario);

      let resolvers: Array<(v: any) => void> = [];
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(mockResponse(200, 'ok')));
        }),
      );

      await engine.startScenario('global-cancel');
      await engine.startScenario('global-cancel');

      await vi.advanceTimersByTimeAsync(5);

      const count = engine.cancelAll();
      expect(count).toBeGreaterThanOrEqual(1);

      // Resolve fetches
      resolvers.forEach((r) => r(undefined));
    });
  });
});
