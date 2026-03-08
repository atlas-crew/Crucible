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

    // ── TASK-2: bodyContains ──────────────────────────────────────────

    it('bodyContains passes when substring is present', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'body-contains-pass',
        name: 'Body Contains Pass',
        steps: [
          {
            id: 'check',
            name: 'Check',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/api' },
            expect: { bodyContains: 'success' },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(mockResponse(200, 'operation success completed'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('body-contains-pass');
      const execution = await done;

      expect(execution.steps[0].status).toBe('completed');
      expect(execution.steps[0].assertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'bodyContains', passed: true }),
        ]),
      );
    });

    it('bodyContains fails when substring is absent', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'body-contains-fail',
        name: 'Body Contains Fail',
        steps: [
          {
            id: 'check',
            name: 'Check',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/api' },
            expect: { bodyContains: 'missing-text' },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(mockResponse(200, 'some other content'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('body-contains-fail');
      const execution = await done;

      expect(execution.steps[0].status).toBe('failed');
      expect(execution.steps[0].assertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'bodyContains', passed: false }),
        ]),
      );
    });

    // ── TASK-2: bodyNotContains ───────────────────────────────────────

    it('bodyNotContains passes when substring is absent', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'body-not-contains-pass',
        name: 'Body Not Contains Pass',
        steps: [
          {
            id: 'check',
            name: 'Check',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/api' },
            expect: { bodyNotContains: 'error' },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(mockResponse(200, 'all good'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('body-not-contains-pass');
      const execution = await done;

      expect(execution.steps[0].status).toBe('completed');
      expect(execution.steps[0].assertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'bodyNotContains', passed: true }),
        ]),
      );
    });

    it('bodyNotContains fails when substring is present', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'body-not-contains-fail',
        name: 'Body Not Contains Fail',
        steps: [
          {
            id: 'check',
            name: 'Check',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/api' },
            expect: { bodyNotContains: 'error' },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(mockResponse(200, 'error occurred'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('body-not-contains-fail');
      const execution = await done;

      expect(execution.steps[0].status).toBe('failed');
      expect(execution.steps[0].assertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'bodyNotContains', passed: false }),
        ]),
      );
    });

    // ── TASK-2: headerPresent ─────────────────────────────────────────

    it('headerPresent passes when header exists (case-insensitive)', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'header-present-pass',
        name: 'Header Present Pass',
        steps: [
          {
            id: 'check',
            name: 'Check',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/api' },
            expect: { headerPresent: 'X-Request-Id' },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(
        mockResponse(200, 'ok', { 'X-Request-Id': 'abc-123' }),
      );

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('header-present-pass');
      const execution = await done;

      expect(execution.steps[0].status).toBe('completed');
      expect(execution.steps[0].assertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'headerPresent', passed: true }),
        ]),
      );
    });

    it('headerPresent fails when header is missing', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'header-present-fail',
        name: 'Header Present Fail',
        steps: [
          {
            id: 'check',
            name: 'Check',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/api' },
            expect: { headerPresent: 'X-Missing-Header' },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('header-present-fail');
      const execution = await done;

      expect(execution.steps[0].status).toBe('failed');
      expect(execution.steps[0].assertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'headerPresent', passed: false }),
        ]),
      );
    });

    // ── TASK-2: headerEquals ──────────────────────────────────────────

    it('headerEquals passes on exact value match', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'header-equals-pass',
        name: 'Header Equals Pass',
        steps: [
          {
            id: 'check',
            name: 'Check',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/api' },
            expect: { headerEquals: { 'Content-Type': 'application/json' } },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(
        mockResponse(200, 'ok', { 'Content-Type': 'application/json' }),
      );

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('header-equals-pass');
      const execution = await done;

      expect(execution.steps[0].status).toBe('completed');
      expect(execution.steps[0].assertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'headerEquals.Content-Type', passed: true }),
        ]),
      );
    });

    it('headerEquals fails on value mismatch', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'header-equals-fail',
        name: 'Header Equals Fail',
        steps: [
          {
            id: 'check',
            name: 'Check',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/api' },
            expect: { headerEquals: { 'Content-Type': 'text/html' } },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(
        mockResponse(200, 'ok', { 'Content-Type': 'application/json' }),
      );

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('header-equals-fail');
      const execution = await done;

      expect(execution.steps[0].status).toBe('failed');
      expect(execution.steps[0].assertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'headerEquals.Content-Type', passed: false }),
        ]),
      );
    });

    // ── TASK-2: Multiple assertions on same step ──────────────────────

    it('evaluates multiple assertions on the same step', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'multi-assert',
        name: 'Multi Assert',
        steps: [
          {
            id: 'check',
            name: 'Check',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/api' },
            expect: {
              status: 200,
              bodyContains: 'success',
              headerPresent: 'x-request-id',
            },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(
        mockResponse(200, 'operation success', { 'x-request-id': '123' }),
      );

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('multi-assert');
      const execution = await done;

      expect(execution.steps[0].status).toBe('completed');
      expect(execution.steps[0].assertions).toHaveLength(3);
      expect(execution.steps[0].assertions!.every((a: any) => a.passed)).toBe(true);
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

  describe('cache eviction', () => {
    it('evicts terminal executions from hot cache after delay', async () => {
      const scenario = makeScenario('evict-test', 1);
      mockCatalog.getScenario.mockReturnValue(scenario);

      mockFetch.mockImplementation(() =>
        Promise.resolve(mockResponse(200, 'ok')),
      );

      const done = waitForEvent(engine, 'execution:completed');
      const id = await engine.startScenario('evict-test');
      await done;

      // Still in cache immediately after completion
      expect(engine.getExecution(id)).toBeDefined();

      // Advance past cache eviction delay (5s)
      await vi.advanceTimersByTimeAsync(6_000);

      // Evicted from hot cache
      expect(engine.getExecution(id)).toBeUndefined();
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

  // ── TASK-3: Extract rules ──────────────────────────────────────────

  describe('extract rules', () => {
    it('extracts value from response body via JSON path', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'extract-body',
        name: 'Extract Body',
        steps: [
          {
            id: 'login',
            name: 'Login',
            stage: 'main',
            request: { method: 'POST', url: 'http://localhost/login' },
            extract: { userId: { from: 'body', path: 'data.user.id' } },
          },
          {
            id: 'use-id',
            name: 'Use ID',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/users/{{userId}}' },
            dependsOn: ['login'],
          },
        ],
      });

      mockFetch
        .mockResolvedValueOnce(
          mockResponse(200, { data: { user: { id: 42 } } }, { 'content-type': 'application/json' }),
        )
        .mockResolvedValueOnce(mockResponse(200, 'ok'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('extract-body');
      const execution = await done;

      expect(execution.context).toHaveProperty('userId', 42);
      // Verify the extracted value was used in the second step's URL
      const secondCall = mockFetch.mock.calls[1];
      expect(secondCall[0]).toBe('http://localhost/users/42');
    });

    it('extracts value from response header', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'extract-header',
        name: 'Extract Header',
        steps: [
          {
            id: 'req',
            name: 'Request',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/api' },
            extract: { reqId: { from: 'header', path: 'x-request-id' } },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(
        mockResponse(200, 'ok', { 'X-Request-Id': 'req-abc-789' }),
      );

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('extract-header');
      const execution = await done;

      expect(execution.context).toHaveProperty('reqId', 'req-abc-789');
    });

    it('extracts HTTP status code from response', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'extract-status',
        name: 'Extract Status',
        steps: [
          {
            id: 'req',
            name: 'Request',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/api' },
            extract: { code: { from: 'status' } },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(mockResponse(201, 'created'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('extract-status');
      const execution = await done;

      expect(execution.context).toHaveProperty('code', 201);
    });

    it('extracts undefined for missing body path', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'extract-missing',
        name: 'Extract Missing',
        steps: [
          {
            id: 'req',
            name: 'Request',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/api' },
            extract: { val: { from: 'body', path: 'deeply.nested.missing' } },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(
        mockResponse(200, { other: 'data' }, { 'content-type': 'application/json' }),
      );

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('extract-missing');
      const execution = await done;

      expect(execution.context).toHaveProperty('val', undefined);
    });

    it('extracts multiple values from different sources on same step', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'extract-multi',
        name: 'Extract Multi',
        steps: [
          {
            id: 'req',
            name: 'Request',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/api' },
            extract: {
              token: { from: 'body', path: 'access_token' },
              server: { from: 'header', path: 'x-served-by' },
              statusCode: { from: 'status' },
            },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(
        mockResponse(200, { access_token: 'jwt-xyz' }, {
          'content-type': 'application/json',
          'X-Served-By': 'node-3',
        }),
      );

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('extract-multi');
      const execution = await done;

      expect(execution.context).toHaveProperty('token', 'jwt-xyz');
      expect(execution.context).toHaveProperty('server', 'node-3');
      expect(execution.context).toHaveProperty('statusCode', 200);
    });
  });

  // ── TASK-4: Template variables ─────────────────────────────────────

  describe('template variables', () => {
    it('{{random}} resolves to a string value', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'tpl-random',
        name: 'Template Random',
        steps: [
          {
            id: 'req',
            name: 'Request',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/api?nonce={{random}}' },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('tpl-random');
      await done;

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toMatch(/^http:\/\/localhost\/api\?nonce=.+$/);
      expect(calledUrl).not.toContain('{{random}}');
    });

    it('{{random_ip}} resolves to a valid IP format', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'tpl-ip',
        name: 'Template IP',
        steps: [
          {
            id: 'req',
            name: 'Request',
            stage: 'main',
            request: {
              method: 'GET',
              url: 'http://localhost/api',
              headers: { 'X-Forwarded-For': '{{random_ip}}' },
            },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('tpl-ip');
      await done;

      const calledHeaders = mockFetch.mock.calls[0][1].headers;
      const ip = calledHeaders['X-Forwarded-For'];
      expect(ip).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
    });

    it('{{timestamp}} resolves to a Unix timestamp', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'tpl-ts',
        name: 'Template Timestamp',
        steps: [
          {
            id: 'req',
            name: 'Request',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/api?t={{timestamp}}' },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('tpl-ts');
      await done;

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      const tsMatch = calledUrl.match(/t=(\d+)/);
      expect(tsMatch).not.toBeNull();
      const ts = parseInt(tsMatch![1], 10);
      expect(ts).toBeGreaterThan(1_000_000_000_000); // after year 2001 in ms
    });

    it('resolves template variables in URL, headers, and body', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'tpl-all',
        name: 'Template All Locations',
        steps: [
          {
            id: 'login',
            name: 'Login',
            stage: 'main',
            request: { method: 'POST', url: 'http://localhost/login', body: { user: 'admin' } },
            extract: { token: { from: 'body', path: 'access_token' } },
          },
          {
            id: 'req',
            name: 'Request',
            stage: 'main',
            dependsOn: ['login'],
            request: {
              method: 'POST',
              url: 'http://localhost/api?ts={{timestamp}}',
              headers: { Authorization: 'Bearer {{token}}' },
              body: '{"ref":"{{token}}"}',
            },
          },
        ],
      });

      mockFetch
        .mockResolvedValueOnce(
          mockResponse(200, { access_token: 'my-jwt' }, { 'content-type': 'application/json' }),
        )
        .mockResolvedValueOnce(mockResponse(200, 'ok'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('tpl-all');
      await done;

      const secondCall = mockFetch.mock.calls[1];
      const url = secondCall[0] as string;
      const opts = secondCall[1];

      // URL has timestamp resolved
      expect(url).toMatch(/ts=\d+/);
      expect(url).not.toContain('{{timestamp}}');
      // Header has token resolved
      expect(opts.headers.Authorization).toBe('Bearer my-jwt');
      // Body has token resolved
      expect(opts.body).toContain('"my-jwt"');
      expect(opts.body).not.toContain('{{token}}');
    });
  });

  // ── TASK-5: Assessment report score calculation ─────────────────────

  describe('assessment report', () => {
    it('scores 100% when all steps pass', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'assess-all-pass',
        name: 'All Pass',
        steps: [
          {
            id: 'step-0',
            name: 'Step 0',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/a' },
            expect: { status: 200 },
          },
          {
            id: 'step-1',
            name: 'Step 1',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/b' },
            expect: { status: 200 },
            dependsOn: ['step-0'],
          },
        ],
      });

      mockFetch
        .mockResolvedValueOnce(mockResponse(200, 'ok'))
        .mockResolvedValueOnce(mockResponse(200, 'ok'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('assess-all-pass', 'assessment');
      const execution = await done;

      expect(execution.report).toBeDefined();
      expect(execution.report!.score).toBe(100);
      expect(execution.report!.passed).toBe(true);
    });

    it('scores proportionally for mixed pass/fail', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'assess-mixed',
        name: 'Mixed',
        steps: [
          {
            id: 'step-0',
            name: 'Step 0 (pass)',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/a' },
            expect: { status: 200 },
          },
          {
            id: 'step-1',
            name: 'Step 1 (fail)',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/b' },
            expect: { status: 200 },
            dependsOn: ['step-0'],
          },
        ],
      });

      mockFetch
        .mockResolvedValueOnce(mockResponse(200, 'ok'))
        .mockResolvedValueOnce(mockResponse(500, 'error'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('assess-mixed', 'assessment');
      const execution = await done;

      expect(execution.report).toBeDefined();
      expect(execution.report!.score).toBe(50); // 1/2 = 50%
      expect(execution.report!.passed).toBe(false); // below 80%
    });

    it('scores 0% when all steps fail', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'assess-all-fail',
        name: 'All Fail',
        steps: [
          {
            id: 'step-0',
            name: 'Step 0',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/a' },
            expect: { status: 200 },
          },
          {
            id: 'step-1',
            name: 'Step 1',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/b' },
            expect: { status: 200 },
            dependsOn: ['step-0'],
          },
        ],
      });

      mockFetch
        .mockResolvedValueOnce(mockResponse(500, 'error'))
        .mockResolvedValueOnce(mockResponse(500, 'error'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('assess-all-fail', 'assessment');
      const execution = await done;

      expect(execution.report).toBeDefined();
      expect(execution.report!.score).toBe(0);
      expect(execution.report!.passed).toBe(false);
    });

    it('skipped steps reduce the score', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'assess-skip',
        name: 'With Skip',
        steps: [
          {
            id: 'step-0',
            name: 'Step 0 (will fail)',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/a' },
            expect: { status: 200 },
          },
          {
            id: 'step-1',
            name: 'Step 1 (skipped)',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/b' },
            dependsOn: ['step-0'],
            when: { step: 'step-0', succeeded: true },
          },
        ],
      });

      // step-0 gets 500 → fails assertion → step-1 skipped
      mockFetch.mockResolvedValueOnce(mockResponse(500, 'error'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('assess-skip', 'assessment');
      const execution = await done;

      expect(execution.report).toBeDefined();
      // passedSteps = 0 (step-0 failed, step-1 skipped), totalSteps = 2
      expect(execution.report!.score).toBe(0);
      expect(execution.report!.passed).toBe(false);
    });

    it('generates report only in assessment mode', async () => {
      const scenario = makeScenario('no-report', 1);
      mockCatalog.getScenario.mockReturnValue(scenario);
      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('no-report'); // default mode = simulation
      const execution = await done;

      expect(execution.report).toBeUndefined();
    });
  });

  // ── TASK-6: Deadlock detection ──────────────────────────────────────

  describe('deadlock detection', () => {
    it('detects circular dependency (A→B→A)', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'deadlock-circular',
        name: 'Circular',
        steps: [
          {
            id: 'step-a',
            name: 'Step A',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/a' },
            dependsOn: ['step-b'],
          },
          {
            id: 'step-b',
            name: 'Step B',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/b' },
            dependsOn: ['step-a'],
          },
        ],
      });

      const failed = waitForEvent(engine, 'execution:failed');
      await engine.startScenario('deadlock-circular');
      const execution = await failed;

      expect(execution.status).toBe('failed');
      expect(execution.error).toContain('Deadlock');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('detects self-dependency (A→A)', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'deadlock-self',
        name: 'Self Dep',
        steps: [
          {
            id: 'step-a',
            name: 'Step A',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/a' },
            dependsOn: ['step-a'],
          },
        ],
      });

      const failed = waitForEvent(engine, 'execution:failed');
      await engine.startScenario('deadlock-self');
      const execution = await failed;

      expect(execution.status).toBe('failed');
      expect(execution.error).toContain('Deadlock');
    });

    it('detects deep circular chain (A→B→C→A)', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'deadlock-deep',
        name: 'Deep Circular',
        steps: [
          {
            id: 'step-a',
            name: 'Step A',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/a' },
            dependsOn: ['step-c'],
          },
          {
            id: 'step-b',
            name: 'Step B',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/b' },
            dependsOn: ['step-a'],
          },
          {
            id: 'step-c',
            name: 'Step C',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/c' },
            dependsOn: ['step-b'],
          },
        ],
      });

      const failed = waitForEvent(engine, 'execution:failed');
      await engine.startScenario('deadlock-deep');
      const execution = await failed;

      expect(execution.status).toBe('failed');
      expect(execution.error).toContain('Deadlock');
    });

    // ── TASK-9: Conditional execution edge cases ──────────────────────

    it('when.status evaluates against referenced step status assertion', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'when-status',
        name: 'When Status',
        steps: [
          {
            id: 'step-a',
            name: 'Step A',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/a' },
            expect: { status: 200 },
          },
          {
            id: 'step-b',
            name: 'Step B (runs when A got 200)',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/b' },
            dependsOn: ['step-a'],
            when: { step: 'step-a', status: 200 },
          },
        ],
      });

      // Step A gets 200 — assertion passes, status assertion actual = 200
      mockFetch
        .mockResolvedValueOnce(mockResponse(200, 'ok'))
        .mockResolvedValueOnce(mockResponse(200, 'ok'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('when-status');
      const execution = await done;

      const stepB = execution.steps.find((s: any) => s.stepId === 'step-b');
      expect(stepB).toBeDefined();
      expect(stepB!.status).toBe('completed');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('when.status skips step when assertion actual does not match', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'when-status-skip',
        name: 'When Status Skip',
        steps: [
          {
            id: 'step-a',
            name: 'Step A',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/a' },
            expect: { status: 200 },
          },
          {
            id: 'step-b',
            name: 'Step B (expects A got 200)',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/b' },
            dependsOn: ['step-a'],
            when: { step: 'step-a', status: 200 },
          },
        ],
      });

      // Step A gets 500 — assertion actual = 500, does not match when.status = 200
      mockFetch.mockResolvedValueOnce(mockResponse(500, 'error'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('when-status-skip');
      const execution = await done;

      const stepB = execution.steps.find((s: any) => s.stepId === 'step-b');
      expect(stepB).toBeDefined();
      expect(stepB!.status).toBe('skipped');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('when clause with missing referenced step skips the step', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'when-missing-ref',
        name: 'When Missing Ref',
        steps: [
          {
            id: 'step-a',
            name: 'Step A',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/a' },
          },
          {
            id: 'step-b',
            name: 'Step B (refs non-existent step)',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/b' },
            dependsOn: ['step-a'],
            when: { step: 'non-existent-step', succeeded: true },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('when-missing-ref');
      const execution = await done;

      const stepB = execution.steps.find((s: any) => s.stepId === 'step-b');
      expect(stepB!.status).toBe('skipped');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('when.succeeded=true executes step when referenced step succeeded', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'when-succeeded-positive',
        name: 'When Succeeded Positive',
        steps: [
          {
            id: 'step-a',
            name: 'Step A (succeeds)',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/a' },
            expect: { status: 200 },
          },
          {
            id: 'step-b',
            name: 'Step B (runs if A succeeded)',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/b' },
            dependsOn: ['step-a'],
            when: { step: 'step-a', succeeded: true },
          },
        ],
      });

      mockFetch
        .mockResolvedValueOnce(mockResponse(200, 'ok'))
        .mockResolvedValueOnce(mockResponse(200, 'ok'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('when-succeeded-positive');
      const execution = await done;

      const stepB = execution.steps.find((s: any) => s.stepId === 'step-b');
      expect(stepB!.status).toBe('completed');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('valid dependency chain does NOT trigger deadlock', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'no-deadlock',
        name: 'Valid Chain',
        steps: [
          {
            id: 'step-a',
            name: 'Step A',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/a' },
          },
          {
            id: 'step-b',
            name: 'Step B',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/b' },
            dependsOn: ['step-a'],
          },
          {
            id: 'step-c',
            name: 'Step C',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/c' },
            dependsOn: ['step-b'],
          },
        ],
      });

      mockFetch
        .mockResolvedValueOnce(mockResponse(200, 'ok'))
        .mockResolvedValueOnce(mockResponse(200, 'ok'))
        .mockResolvedValueOnce(mockResponse(200, 'ok'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('no-deadlock');
      const execution = await done;

      expect(execution.status).toBe('completed');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  // ── TASK-10: Step execution edge cases ───────────────────────────────

  describe('step execution edge cases', () => {
    it('step with iterations=3 calls fetch 3 times', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'iter-test',
        name: 'Iterations',
        steps: [
          {
            id: 'multi',
            name: 'Multi',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/api' },
            execution: { iterations: 3 },
          },
        ],
      });

      mockFetch
        .mockResolvedValueOnce(mockResponse(200, 'ok'))
        .mockResolvedValueOnce(mockResponse(200, 'ok'))
        .mockResolvedValueOnce(mockResponse(200, 'ok'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('iter-test');
      await done;

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('delay is applied before step execution', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'delay-test',
        name: 'Delay',
        steps: [
          {
            id: 'slow',
            name: 'Slow',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/api' },
            execution: { delayMs: 1000 },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('delay-test');

      // Fetch should not have been called yet (delay not elapsed)
      await vi.advanceTimersByTimeAsync(500);
      expect(mockFetch).not.toHaveBeenCalled();

      // Advance past the delay
      await vi.advanceTimersByTimeAsync(600);
      await done;

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('startScenario with non-existent ID throws error', async () => {
      mockCatalog.getScenario.mockReturnValue(undefined);

      await expect(
        engine.startScenario('non-existent'),
      ).rejects.toThrow('Scenario non-existent not found');
    });

    it('destroy() can be called without error', () => {
      expect(() => engine.destroy()).not.toThrow();
    });

    it('AbortSignal on fetch propagates immediately without retry', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'abort-propagate',
        name: 'Abort',
        steps: [
          {
            id: 'req',
            name: 'Request',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/api' },
            execution: { retries: 3 },
          },
        ],
      });

      // Simulate an abort error on the first call
      const abortError = new DOMException('The operation was aborted.', 'AbortError');
      mockFetch.mockRejectedValueOnce(abortError);

      const id = await engine.startScenario('abort-propagate');

      // Cancel immediately to set the signal as aborted
      engine.cancelExecution(id);

      await vi.advanceTimersByTimeAsync(100);

      // Should only call fetch once (no retries after abort)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ── TASK-11: Strengthen global control tests ─────────────────────────

  describe('global controls (verified state)', () => {
    it('pauseAll sets each targeted execution to paused status', async () => {
      const scenario = makeScenario('gp-verify', 3);
      mockCatalog.getScenario.mockReturnValue(scenario);

      const resolvers: Array<() => void> = [];
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(mockResponse(200, 'ok')));
        }),
      );

      const id1 = await engine.startScenario('gp-verify');
      const id2 = await engine.startScenario('gp-verify');

      // Let step-0 fetches start
      await vi.advanceTimersByTimeAsync(10);

      // Pause both while step-0 is in-flight
      engine.pauseExecution(id1);
      engine.pauseExecution(id2);

      // Resolve step-0 fetches so they hit the pause checkpoint
      resolvers.forEach((r) => r());
      await vi.advanceTimersByTimeAsync(10);

      // Verify actual state
      expect(engine.getExecution(id1)?.status).toBe('paused');
      expect(engine.getExecution(id2)?.status).toBe('paused');
    });

    it('resumeAll transitions each paused execution back to running', async () => {
      const scenario = makeScenario('gr-verify', 3);
      mockCatalog.getScenario.mockReturnValue(scenario);

      const resolvers: Array<() => void> = [];
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(mockResponse(200, 'ok')));
        }),
      );

      const id1 = await engine.startScenario('gr-verify');
      const id2 = await engine.startScenario('gr-verify');

      await vi.advanceTimersByTimeAsync(10);

      engine.pauseExecution(id1);
      engine.pauseExecution(id2);
      resolvers.forEach((r) => r());
      await vi.advanceTimersByTimeAsync(10);

      expect(engine.getExecution(id1)?.status).toBe('paused');
      expect(engine.getExecution(id2)?.status).toBe('paused');

      // Resume all — verify status transitions
      const count = engine.resumeAll();
      expect(count).toBe(2);

      // After resume, the execution loop continues → status becomes 'running'
      await vi.advanceTimersByTimeAsync(10);

      const s1 = engine.getExecution(id1)?.status;
      const s2 = engine.getExecution(id2)?.status;

      // Both should have transitioned past 'paused' (either running or completed)
      expect(s1).not.toBe('paused');
      expect(s2).not.toBe('paused');
    });

    it('cancelAll transitions each active execution to cancelled', async () => {
      const scenario = makeScenario('gc-verify', 3);
      mockCatalog.getScenario.mockReturnValue(scenario);

      let resolvers: Array<(v: any) => void> = [];
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(mockResponse(200, 'ok')));
        }),
      );

      const id1 = await engine.startScenario('gc-verify');
      const id2 = await engine.startScenario('gc-verify');

      await vi.advanceTimersByTimeAsync(5);

      const count = engine.cancelAll();
      expect(count).toBeGreaterThanOrEqual(2);

      // Resolve pending fetches so the loops can reach the cancel checkpoint
      resolvers.forEach((r) => r(undefined));
      await vi.advanceTimersByTimeAsync(10);

      expect(engine.getExecution(id1)?.status).toBe('cancelled');
      expect(engine.getExecution(id2)?.status).toBe('cancelled');
    });
  });
});
