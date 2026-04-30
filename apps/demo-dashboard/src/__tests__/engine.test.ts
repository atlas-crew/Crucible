import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ScenarioEngine } from '../server/engine.js';
import { K6Runner } from '../server/runners/k6-runner.js';

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
    delete process.env.CRUCIBLE_TARGET_URL;
    delete process.env.CRUCIBLE_OUTBOUND_ALLOWLIST;
    delete process.env.CRUCIBLE_MAX_CONCURRENCY;
    delete process.env.CRUCIBLE_STEP_BODY_RETENTION;
    delete process.env.CRUCIBLE_STEP_BODY_MAX_BYTES;
    process.env.CRUCIBLE_TARGET_URL = 'http://localhost';
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

  describe('outbound request validation', () => {
    it('rejects invalid CRUCIBLE_TARGET_URL values', () => {
      process.env.CRUCIBLE_TARGET_URL = 'ftp://localhost:8888';

      expect(() => new ScenarioEngine(mockCatalog)).toThrow(
        'CRUCIBLE_TARGET_URL must use http or https',
      );
    });

    it('blocks absolute URLs outside the default allowlist', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'ssrf-blocked',
        name: 'SSRF Blocked',
        steps: [
          {
            id: 'blocked',
            name: 'Blocked',
            stage: 'main',
            request: { method: 'GET', url: 'http://evil.example/internal' },
          },
        ],
      });

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('ssrf-blocked');
      const execution = await done;

      expect(mockFetch).not.toHaveBeenCalled();
      expect(execution.steps[0].status).toBe('failed');
      expect(execution.steps[0].error).toContain('Outbound request blocked');
    });

    it('blocks step URLs with embedded credentials', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'ssrf-credentials',
        name: 'SSRF Credentials',
        steps: [
          {
            id: 'blocked',
            name: 'Blocked',
            stage: 'main',
            request: { method: 'GET', url: 'http://user:pass@localhost/private' },
          },
        ],
      });

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('ssrf-credentials');
      const execution = await done;

      expect(mockFetch).not.toHaveBeenCalled();
      expect(execution.steps[0].status).toBe('failed');
      expect(execution.steps[0].error).toContain('must not include credentials');
    });

    it('allows configured domains and CIDR ranges', async () => {
      process.env.CRUCIBLE_OUTBOUND_ALLOWLIST = 'evil.example,10.0.0.0/8';
      engine.destroy();
      engine = new ScenarioEngine(mockCatalog);

      mockCatalog.getScenario.mockReturnValue({
        id: 'ssrf-allowlist',
        name: 'SSRF Allowlist',
        steps: [
          {
            id: 'domain-step',
            name: 'Domain Step',
            stage: 'main',
            request: { method: 'GET', url: 'http://evil.example/internal' },
          },
          {
            id: 'cidr-step',
            name: 'CIDR Step',
            stage: 'main',
            request: { method: 'GET', url: 'http://10.24.8.9/status' },
            dependsOn: ['domain-step'],
          },
        ],
      });

      mockFetch
        .mockResolvedValueOnce(mockResponse(200, 'ok'))
        .mockResolvedValueOnce(mockResponse(200, 'ok'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('ssrf-allowlist');
      const execution = await done;

      expect(execution.status).toBe('completed');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0][0]).toBe('http://evil.example/internal');
      expect(mockFetch.mock.calls[1][0]).toBe('http://10.24.8.9/status');
    });

    it('allows explicit host:port entries without allowing the default port', async () => {
      process.env.CRUCIBLE_OUTBOUND_ALLOWLIST = 'evil.example:8443';
      engine.destroy();
      engine = new ScenarioEngine(mockCatalog);

      mockCatalog.getScenario.mockReturnValue({
        id: 'ssrf-explicit-port',
        name: 'SSRF Explicit Port',
        steps: [
          {
            id: 'allowed-port',
            name: 'Allowed Port',
            stage: 'main',
            request: { method: 'GET', url: 'http://evil.example:8443/internal' },
          },
          {
            id: 'blocked-default-port',
            name: 'Blocked Default Port',
            stage: 'main',
            request: { method: 'GET', url: 'http://evil.example/internal' },
            dependsOn: ['allowed-port'],
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('ssrf-explicit-port');
      const execution = await done;
      const blockedStep = execution.steps.find((step) => step.stepId === 'blocked-default-port');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe('http://evil.example:8443/internal');
      expect(blockedStep?.status).toBe('failed');
      expect(blockedStep?.error).toContain('evil.example:80');
    });

    it('supports wildcard domains and IPv6 allowlist entries', async () => {
      process.env.CRUCIBLE_OUTBOUND_ALLOWLIST = '*.example.com,http://[::1]:8080';
      engine.destroy();
      engine = new ScenarioEngine(mockCatalog);

      mockCatalog.getScenario.mockReturnValue({
        id: 'ssrf-wildcard-ipv6',
        name: 'SSRF Wildcard IPv6',
        steps: [
          {
            id: 'wildcard-step',
            name: 'Wildcard Step',
            stage: 'main',
            request: { method: 'GET', url: 'http://api.example.com/status' },
          },
          {
            id: 'ipv6-step',
            name: 'IPv6 Step',
            stage: 'main',
            request: { method: 'GET', url: 'http://[::1]:8080/health' },
            dependsOn: ['wildcard-step'],
          },
        ],
      });

      mockFetch
        .mockResolvedValueOnce(mockResponse(200, 'ok'))
        .mockResolvedValueOnce(mockResponse(200, 'ok'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('ssrf-wildcard-ipv6');
      const execution = await done;

      expect(execution.status).toBe('completed');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0][0]).toBe('http://api.example.com/status');
      expect(mockFetch.mock.calls[1][0]).toBe('http://[::1]:8080/health');
    });

    it('blocks allowlisted hosts on unexpected ports', async () => {
      process.env.CRUCIBLE_OUTBOUND_ALLOWLIST = 'evil.example';
      engine.destroy();
      engine = new ScenarioEngine(mockCatalog);

      mockCatalog.getScenario.mockReturnValue({
        id: 'ssrf-port-blocked',
        name: 'SSRF Port Blocked',
        steps: [
          {
            id: 'blocked',
            name: 'Blocked',
            stage: 'main',
            request: { method: 'GET', url: 'http://evil.example:8443/internal' },
          },
        ],
      });

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('ssrf-port-blocked');
      const execution = await done;

      expect(mockFetch).not.toHaveBeenCalled();
      expect(execution.steps[0].status).toBe('failed');
      expect(execution.steps[0].error).toContain('evil.example:8443');
    });

    it('blocks CIDR allowlist entries on non-default ports', async () => {
      process.env.CRUCIBLE_OUTBOUND_ALLOWLIST = '10.0.0.0/8';
      engine.destroy();
      engine = new ScenarioEngine(mockCatalog);

      mockCatalog.getScenario.mockReturnValue({
        id: 'ssrf-cidr-port-blocked',
        name: 'SSRF CIDR Port Blocked',
        steps: [
          {
            id: 'blocked',
            name: 'Blocked',
            stage: 'main',
            request: { method: 'GET', url: 'http://10.24.8.9:8080/status' },
          },
        ],
      });

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('ssrf-cidr-port-blocked');
      const execution = await done;

      expect(mockFetch).not.toHaveBeenCalled();
      expect(execution.steps[0].status).toBe('failed');
      expect(execution.steps[0].error).toContain('10.24.8.9:8080');
    });

    it('implicitly allowlists the configured https target origin only', async () => {
      process.env.CRUCIBLE_TARGET_URL = 'https://target.example:8443/';
      engine.destroy();
      engine = new ScenarioEngine(mockCatalog);

      mockCatalog.getScenario.mockReturnValue({
        id: 'ssrf-https-target',
        name: 'SSRF HTTPS Target',
        steps: [
          {
            id: 'allowed-target',
            name: 'Allowed Target',
            stage: 'main',
            request: { method: 'GET', url: '/secure' },
          },
          {
            id: 'blocked-default-origin',
            name: 'Blocked Default Origin',
            stage: 'main',
            request: { method: 'GET', url: 'https://target.example/secure' },
            dependsOn: ['allowed-target'],
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(mockResponse(200, 'ok'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('ssrf-https-target');
      const execution = await done;
      const blockedStep = execution.steps.find((step) => step.stepId === 'blocked-default-origin');

      expect(engine.targetUrl).toBe('https://target.example:8443');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe('https://target.example:8443/secure');
      expect(blockedStep?.status).toBe('failed');
      expect(blockedStep?.error).toContain('target.example:443');
    });

    it('validates the final resolved URL after template substitution', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'ssrf-template-bypass',
        name: 'SSRF Template Bypass',
        steps: [
          {
            id: 'prepare',
            name: 'Prepare',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/prepare' },
            extract: { nextUrl: { from: 'body', path: 'next_url' } },
          },
          {
            id: 'follow-up',
            name: 'Follow Up',
            stage: 'main',
            request: { method: 'GET', url: '{{nextUrl}}' },
            dependsOn: ['prepare'],
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(
        mockResponse(
          200,
          { next_url: 'http://evil.example/metadata' },
          { 'content-type': 'application/json' },
        ),
      );

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('ssrf-template-bypass');
      const execution = await done;
      const followUpStep = execution.steps.find((step) => step.stepId === 'follow-up');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(followUpStep?.status).toBe('failed');
      expect(followUpStep?.error).toContain('Outbound request blocked');
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

    it('simulation mode can override blocked expectations to allow attack success', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'assert-sim-override',
        name: 'Assert Simulation Override',
        steps: [
          {
            id: 'check',
            name: 'Check',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/resource' },
            expect: { blocked: true, blockedOverridableInSimulation: true },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(mockResponse(200, 'allowed'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('assert-sim-override', 'simulation', { expectWafBlocking: false });
      const execution = await done;

      expect(execution.steps[0].status).toBe('completed');
      expect(execution.steps[0].assertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'blocked',
            expected: false,
            actual: false,
            passed: true,
            overridden: true,
            authoredExpected: true,
          }),
        ]),
      );
    });

    it('simulation mode does not override blocked expectations that are not author-approved', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'assert-sim-no-override',
        name: 'Assert Simulation No Override',
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
      await engine.startScenario('assert-sim-no-override', 'simulation', { expectWafBlocking: false });
      const execution = await done;

      expect(execution.steps[0].status).toBe('failed');
      expect(execution.steps[0].assertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'blocked',
            expected: true,
            actual: false,
            passed: false,
          }),
        ]),
      );
    });

    it('simulation mode relaxes paired block status assertions when the block expectation is overridden', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'assert-sim-status-override',
        name: 'Assert Simulation Status Override',
        steps: [
          {
            id: 'check',
            name: 'Check',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/resource' },
            expect: {
              status: 403,
              blocked: true,
              blockedOverridableInSimulation: true,
            },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(mockResponse(200, 'allowed'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('assert-sim-status-override', 'simulation', { expectWafBlocking: false });
      const execution = await done;

      expect(execution.steps[0].status).toBe('completed');
      expect(execution.steps[0].assertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'status',
            expected: [403, 'any non-blocking status'],
            actual: 200,
            passed: true,
            overridden: true,
            authoredExpected: 403,
          }),
          expect.objectContaining({
            field: 'blocked',
            expected: false,
            actual: false,
            passed: true,
            overridden: true,
            authoredExpected: true,
          }),
        ]),
      );
    });

    it('simulation mode treats non-blocking server errors as a successful bypass when blocking is not expected', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'assert-sim-status-non-success',
        name: 'Assert Simulation Status Non Success',
        steps: [
          {
            id: 'check',
            name: 'Check',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/resource' },
            expect: {
              status: 403,
              blockedOverridableInSimulation: true,
            },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(mockResponse(500, 'broken'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('assert-sim-status-non-success', 'simulation', { expectWafBlocking: false });
      const execution = await done;

      expect(execution.steps[0].status).toBe('completed');
      expect(execution.steps[0].assertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'status',
            expected: [403, 'any non-blocking status'],
            actual: 500,
            passed: true,
            overridden: true,
            authoredExpected: 403,
          }),
        ]),
      );
    });

    it('simulation mode accepts non-blocking success statuses for status-only overrides', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'assert-sim-status-created',
        name: 'Assert Simulation Status Created',
        steps: [
          {
            id: 'check',
            name: 'Check',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/resource' },
            expect: {
              status: 403,
              blockedOverridableInSimulation: true,
            },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(mockResponse(201, 'created'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('assert-sim-status-created', 'simulation', { expectWafBlocking: false });
      const execution = await done;

      expect(execution.steps[0].status).toBe('completed');
      expect(execution.steps[0].assertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'status',
            expected: [403, 'any non-blocking status'],
            actual: 201,
            passed: true,
            overridden: true,
            authoredExpected: 403,
          }),
        ]),
      );
    });

    it('simulation mode still accepts authored block statuses for status-only overridable checks', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'assert-sim-status-still-blocked',
        name: 'Assert Simulation Status Still Blocked',
        steps: [
          {
            id: 'check',
            name: 'Check',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/resource' },
            expect: {
              status: 403,
              blockedOverridableInSimulation: true,
            },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(mockResponse(403, 'still blocked'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('assert-sim-status-still-blocked', 'simulation', { expectWafBlocking: false });
      const execution = await done;

      expect(execution.steps[0].status).toBe('completed');
      expect(execution.steps[0].assertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'status',
            expected: [403, 'any non-blocking status'],
            actual: 403,
            passed: true,
            overridden: true,
            authoredExpected: 403,
          }),
        ]),
      );
    });

    it('assessment mode ignores the simulation blocked-expectation override', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'assert-assessment-override',
        name: 'Assert Assessment Override',
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
      await engine.startScenario('assert-assessment-override', 'assessment', { expectWafBlocking: false });
      const execution = await done;

      expect(execution.steps[0].status).toBe('failed');
      expect(execution.steps[0].assertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'blocked', expected: true, actual: false, passed: false }),
        ]),
      );
    });

    it('rejects a simulation override when it is not boolean', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'assert-invalid-sim-override',
        name: 'Assert Invalid Simulation Override',
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
      await expect(engine.startScenario('assert-invalid-sim-override', 'simulation', {
        expectWafBlocking: 'false',
      } as any)).rejects.toThrow('must be a boolean');
      expect(mockFetch).not.toHaveBeenCalled();
      expect(engine.listExecutions()).toHaveLength(0);
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

    it("inherits the originating execution's target URL on restart", async () => {
      const scenario = makeScenario('restart-target', 1);
      mockCatalog.getScenario.mockReturnValue(scenario);

      mockFetch.mockImplementation(() =>
        Promise.resolve(mockResponse(200, 'ok')),
      );

      const done1 = waitForEvent(engine, 'execution:completed');
      const id1 = await engine.startScenario(
        'restart-target',
        'simulation',
        undefined,
        undefined,
        'http://staging.example:8080',
      );
      await done1;

      const done2 = waitForEvent(engine, 'execution:completed');
      const id2 = await engine.restartExecution(id1);
      await done2;

      expect(id2).toBeTruthy();
      expect(engine.getExecution(id2!)?.targetUrl).toBe('http://staging.example:8080');
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

  describe('response body retention', () => {
    it('captures successful step response bodies by default', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'retain-success',
        name: 'Retain Success',
        steps: [
          {
            id: 'fetch-profile',
            name: 'Fetch Profile',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/profile' },
            expect: { status: 200 },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(
        mockResponse(200, { profile: { id: 'user-1' } }, { 'content-type': 'application/json' }),
      );

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('retain-success');
      const execution = await done;

      expect(execution.steps[0].result).toEqual({
        response: {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { profile: { id: 'user-1' } },
        },
        retention: expect.objectContaining({
          policy: 'all',
          truncated: false,
          contentType: 'application/json',
          bodyFormat: 'json',
        }),
      });
    });

    it('can limit body capture to failed steps only', async () => {
      process.env.CRUCIBLE_STEP_BODY_RETENTION = 'failed-only';
      engine.destroy();
      engine = new ScenarioEngine(mockCatalog);

      mockCatalog.getScenario.mockReturnValue({
        id: 'retain-failed-only',
        name: 'Retain Failed Only',
        steps: [
          {
            id: 'ok-step',
            name: 'OK Step',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/ok' },
            expect: { status: 200 },
          },
          {
            id: 'blocked-step',
            name: 'Blocked Step',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/blocked' },
            expect: { blocked: true },
            dependsOn: ['ok-step'],
          },
        ],
      });

      mockFetch
        .mockResolvedValueOnce(mockResponse(200, 'ok'))
        .mockResolvedValueOnce(mockResponse(200, 'still allowed'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('retain-failed-only');
      const execution = await done;

      expect(execution.steps[0].result).toBeUndefined();
      expect(execution.steps[1].result).toEqual({
        response: {
          status: 200,
          headers: {},
          body: 'still allowed',
        },
        retention: expect.objectContaining({
          policy: 'failed-only',
          truncated: false,
          bodyFormat: 'text',
        }),
      });
    });

    it('truncates retained bodies when they exceed the configured byte cap', async () => {
      process.env.CRUCIBLE_STEP_BODY_MAX_BYTES = '12';
      engine.destroy();
      engine = new ScenarioEngine(mockCatalog);

      mockCatalog.getScenario.mockReturnValue({
        id: 'retain-truncated',
        name: 'Retain Truncated',
        steps: [
          {
            id: 'download',
            name: 'Download',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/download' },
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(mockResponse(200, 'abcdefghijklmnop'));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('retain-truncated');
      const execution = await done;
      const result = execution.steps[0].result as {
        response: { body: string };
        retention: { truncated: boolean; storedBytes: number; originalBytes: number; bodyFormat: string };
      };

      expect(result.response.body).toBe('abcdefghijkl');
      expect(result.retention).toEqual(expect.objectContaining({
        policy: 'all',
        truncated: true,
        storedBytes: 12,
        originalBytes: 16,
        bodyFormat: 'text',
      }));
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
      expect(execution.error).toContain('Dependency cycle detected');
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
      expect(execution.error).toContain('Dependency cycle detected');
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
      expect(execution.error).toContain('Dependency cycle detected');
    });

    it('fails gracefully when a dependency references a missing step', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'deadlock-missing',
        name: 'Missing Dependency',
        steps: [
          {
            id: 'step-a',
            name: 'Step A',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/a' },
            dependsOn: ['step-missing'],
          },
        ],
      });

      const failed = waitForEvent(engine, 'execution:failed');
      await engine.startScenario('deadlock-missing');
      const execution = await failed;

      expect(execution.status).toBe('failed');
      expect(execution.error).toContain('Unknown dependency reference');
      expect(mockFetch).not.toHaveBeenCalled();
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

  describe('execution groups', () => {
    it('keeps pure legacy ready steps concurrent', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'legacy-ready',
        name: 'Legacy Ready',
        steps: [
          {
            id: 'step-a',
            name: 'Step A',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/legacy-a' },
          },
          {
            id: 'step-b',
            name: 'Step B',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/legacy-b' },
          },
        ],
      });

      const startedUrls: string[] = [];
      const resolvers = new Map<string, Array<() => void>>();
      mockFetch.mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        startedUrls.push(url);
        const urlResolvers = resolvers.get(url) ?? [];
        return new Promise((resolve) => {
          urlResolvers.push(() => resolve(mockResponse(200, 'ok')));
          resolvers.set(url, urlResolvers);
        });
      });

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('legacy-ready');

      await vi.advanceTimersByTimeAsync(10);
      expect(startedUrls).toEqual(
        expect.arrayContaining([
          'http://localhost/legacy-a',
          'http://localhost/legacy-b',
        ]),
      );

      resolvers.get('http://localhost/legacy-a')?.shift()?.();
      resolvers.get('http://localhost/legacy-b')?.shift()?.();
      const execution = await done;

      expect(execution.status).toBe('completed');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('runs sequential-mode ready steps one at a time', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'sequential-ready',
        name: 'Sequential Ready',
        steps: [
          {
            id: 'step-a',
            name: 'Step A',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/a' },
            executionMode: 'sequential',
          },
          {
            id: 'step-b',
            name: 'Step B',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/b' },
            executionMode: 'sequential',
          },
        ],
      });

      const resolvers: Array<() => void> = [];
      mockFetch.mockImplementation(() =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(mockResponse(200, 'ok')));
        }),
      );

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('sequential-ready');

      await vi.advanceTimersByTimeAsync(10);
      expect(resolvers).toHaveLength(1);

      resolvers[0]();
      await vi.advanceTimersByTimeAsync(10);
      expect(resolvers).toHaveLength(2);

      resolvers[1]();
      const execution = await done;

      expect(execution.status).toBe('completed');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('runs same parallelGroup steps concurrently after dependencies complete', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'parallel-group',
        name: 'Parallel Group',
        steps: [
          {
            id: 'setup',
            name: 'Setup',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/setup' },
          },
          {
            id: 'step-a',
            name: 'Step A',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/a' },
            dependsOn: ['setup'],
            executionMode: 'parallel',
            parallelGroup: 1,
          },
          {
            id: 'step-b',
            name: 'Step B',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/b' },
            dependsOn: ['setup'],
            executionMode: 'parallel',
            parallelGroup: 1,
          },
          {
            id: 'final',
            name: 'Final',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/final' },
            dependsOn: ['step-a', 'step-b'],
          },
        ],
      });

      const startedUrls: string[] = [];
      const resolvers = new Map<string, Array<() => void>>();
      mockFetch.mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        startedUrls.push(url);
        return new Promise((resolve) => {
          const urlResolvers = resolvers.get(url) ?? [];
          urlResolvers.push(() => resolve(mockResponse(200, 'ok')));
          resolvers.set(url, urlResolvers);
        });
      });

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('parallel-group');

      await vi.advanceTimersByTimeAsync(10);
      expect(startedUrls).toEqual(['http://localhost/setup']);

      resolvers.get('http://localhost/setup')?.shift()?.();
      await vi.advanceTimersByTimeAsync(10);

      expect(startedUrls).toEqual(
        expect.arrayContaining([
          'http://localhost/setup',
          'http://localhost/a',
          'http://localhost/b',
        ]),
      );
      expect(startedUrls).not.toContain('http://localhost/final');

      resolvers.get('http://localhost/a')?.shift()?.();
      resolvers.get('http://localhost/b')?.shift()?.();
      await vi.advanceTimersByTimeAsync(10);

      expect(startedUrls).toContain('http://localhost/final');

      resolvers.get('http://localhost/final')?.shift()?.();
      const execution = await done;

      expect(execution.status).toBe('completed');
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('serializes distinct parallel groups into separate scheduling ticks', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'parallel-groups-separate',
        name: 'Parallel Groups Separate',
        steps: [
          {
            id: 'group-1-a',
            name: 'Group 1 A',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/g1-a' },
            executionMode: 'parallel',
            parallelGroup: 1,
          },
          {
            id: 'group-1-b',
            name: 'Group 1 B',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/g1-b' },
            executionMode: 'parallel',
            parallelGroup: 1,
          },
          {
            id: 'group-2-a',
            name: 'Group 2 A',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/g2-a' },
            executionMode: 'parallel',
            parallelGroup: 2,
          },
        ],
      });

      const startedUrls: string[] = [];
      const resolvers = new Map<string, Array<() => void>>();
      mockFetch.mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        startedUrls.push(url);
        const urlResolvers = resolvers.get(url) ?? [];
        return new Promise((resolve) => {
          urlResolvers.push(() => resolve(mockResponse(200, 'ok')));
          resolvers.set(url, urlResolvers);
        });
      });

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('parallel-groups-separate');

      await vi.advanceTimersByTimeAsync(10);
      expect(startedUrls).toEqual(
        expect.arrayContaining([
          'http://localhost/g1-a',
          'http://localhost/g1-b',
        ]),
      );
      expect(startedUrls).not.toContain('http://localhost/g2-a');

      resolvers.get('http://localhost/g1-a')?.shift()?.();
      resolvers.get('http://localhost/g1-b')?.shift()?.();
      await vi.advanceTimersByTimeAsync(10);

      expect(startedUrls).toContain('http://localhost/g2-a');

      resolvers.get('http://localhost/g2-a')?.shift()?.();
      const execution = await done;

      expect(execution.status).toBe('completed');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('batches parallel-mode steps without a group together', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'parallel-no-group',
        name: 'Parallel No Group',
        steps: [
          {
            id: 'parallel-a',
            name: 'Parallel A',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/no-group-a' },
            executionMode: 'parallel',
          },
          {
            id: 'parallel-b',
            name: 'Parallel B',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/no-group-b' },
            executionMode: 'parallel',
          },
        ],
      });

      const startedUrls: string[] = [];
      const resolvers = new Map<string, Array<() => void>>();
      mockFetch.mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        startedUrls.push(url);
        const urlResolvers = resolvers.get(url) ?? [];
        return new Promise((resolve) => {
          urlResolvers.push(() => resolve(mockResponse(200, 'ok')));
          resolvers.set(url, urlResolvers);
        });
      });

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('parallel-no-group');

      await vi.advanceTimersByTimeAsync(10);
      expect(startedUrls).toEqual(
        expect.arrayContaining([
          'http://localhost/no-group-a',
          'http://localhost/no-group-b',
        ]),
      );

      resolvers.get('http://localhost/no-group-a')?.shift()?.();
      resolvers.get('http://localhost/no-group-b')?.shift()?.();
      const execution = await done;

      expect(execution.status).toBe('completed');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('segregates mixed legacy, sequential, and parallel-ready steps by batch mode', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'mixed-modes',
        name: 'Mixed Modes',
        steps: [
          {
            id: 'legacy',
            name: 'Legacy',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/legacy' },
          },
          {
            id: 'sequential',
            name: 'Sequential',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/sequential' },
            executionMode: 'sequential',
          },
          {
            id: 'parallel-a',
            name: 'Parallel A',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/parallel-a' },
            executionMode: 'parallel',
            parallelGroup: 1,
          },
          {
            id: 'parallel-b',
            name: 'Parallel B',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/parallel-b' },
            executionMode: 'parallel',
            parallelGroup: 1,
          },
        ],
      });

      const startedUrls: string[] = [];
      const resolvers = new Map<string, Array<() => void>>();
      mockFetch.mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        startedUrls.push(url);
        const urlResolvers = resolvers.get(url) ?? [];
        return new Promise((resolve) => {
          urlResolvers.push(() => resolve(mockResponse(200, 'ok')));
          resolvers.set(url, urlResolvers);
        });
      });

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('mixed-modes');

      await vi.advanceTimersByTimeAsync(10);
      expect(startedUrls).toEqual(['http://localhost/legacy']);

      resolvers.get('http://localhost/legacy')?.shift()?.();
      await vi.advanceTimersByTimeAsync(10);
      expect(startedUrls).toEqual([
        'http://localhost/legacy',
        'http://localhost/sequential',
      ]);

      resolvers.get('http://localhost/sequential')?.shift()?.();
      await vi.advanceTimersByTimeAsync(10);
      expect(startedUrls).toEqual(
        expect.arrayContaining([
          'http://localhost/legacy',
          'http://localhost/sequential',
          'http://localhost/parallel-a',
          'http://localhost/parallel-b',
        ]),
      );

      resolvers.get('http://localhost/parallel-a')?.shift()?.();
      resolvers.get('http://localhost/parallel-b')?.shift()?.();
      const execution = await done;

      expect(execution.status).toBe('completed');
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('reactively starts newly unblocked legacy work before the previous batch fully drains', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'reactive-legacy',
        name: 'Reactive Legacy',
        steps: [
          {
            id: 'seed-a',
            name: 'Seed A',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/reactive-a' },
          },
          {
            id: 'peer-b',
            name: 'Peer B',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/reactive-b' },
          },
          {
            id: 'follow-up',
            name: 'Follow Up',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/reactive-c' },
            dependsOn: ['seed-a'],
          },
        ],
      });

      const startedUrls: string[] = [];
      const resolvers = new Map<string, Array<() => void>>();
      mockFetch.mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        startedUrls.push(url);
        const urlResolvers = resolvers.get(url) ?? [];
        return new Promise((resolve) => {
          urlResolvers.push(() => resolve(mockResponse(200, 'ok')));
          resolvers.set(url, urlResolvers);
        });
      });

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('reactive-legacy');

      await vi.advanceTimersByTimeAsync(10);
      expect(startedUrls).toEqual(
        expect.arrayContaining([
          'http://localhost/reactive-a',
          'http://localhost/reactive-b',
        ]),
      );
      expect(startedUrls).not.toContain('http://localhost/reactive-c');

      resolvers.get('http://localhost/reactive-a')?.shift()?.();
      await vi.advanceTimersByTimeAsync(10);

      expect(startedUrls).toEqual(
        expect.arrayContaining([
          'http://localhost/reactive-a',
          'http://localhost/reactive-b',
          'http://localhost/reactive-c',
        ]),
      );

      resolvers.get('http://localhost/reactive-b')?.shift()?.();
      resolvers.get('http://localhost/reactive-c')?.shift()?.();
      const execution = await done;

      expect(execution.status).toBe('completed');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('reactively starts newly unblocked parallel-group work before sibling steps finish', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'reactive-parallel-group',
        name: 'Reactive Parallel Group',
        steps: [
          {
            id: 'setup',
            name: 'Setup',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/reactive-setup' },
          },
          {
            id: 'group-a',
            name: 'Group A',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/reactive-group-a' },
            dependsOn: ['setup'],
            executionMode: 'parallel',
            parallelGroup: 1,
          },
          {
            id: 'group-b',
            name: 'Group B',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/reactive-group-b' },
            dependsOn: ['setup'],
            executionMode: 'parallel',
            parallelGroup: 1,
          },
          {
            id: 'group-c',
            name: 'Group C',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/reactive-group-c' },
            dependsOn: ['group-a'],
            executionMode: 'parallel',
            parallelGroup: 1,
          },
          {
            id: 'final',
            name: 'Final',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/reactive-final' },
            dependsOn: ['group-b', 'group-c'],
          },
        ],
      });

      const startedUrls: string[] = [];
      const resolvers = new Map<string, Array<() => void>>();
      mockFetch.mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        startedUrls.push(url);
        const urlResolvers = resolvers.get(url) ?? [];
        return new Promise((resolve) => {
          urlResolvers.push(() => resolve(mockResponse(200, 'ok')));
          resolvers.set(url, urlResolvers);
        });
      });

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('reactive-parallel-group');

      await vi.advanceTimersByTimeAsync(10);
      expect(startedUrls).toEqual(['http://localhost/reactive-setup']);

      resolvers.get('http://localhost/reactive-setup')?.shift()?.();
      await vi.advanceTimersByTimeAsync(10);

      expect(startedUrls).toEqual(
        expect.arrayContaining([
          'http://localhost/reactive-setup',
          'http://localhost/reactive-group-a',
          'http://localhost/reactive-group-b',
        ]),
      );
      expect(startedUrls).not.toContain('http://localhost/reactive-group-c');

      resolvers.get('http://localhost/reactive-group-a')?.shift()?.();
      await vi.advanceTimersByTimeAsync(10);

      expect(startedUrls).toContain('http://localhost/reactive-group-c');
      expect(startedUrls).not.toContain('http://localhost/reactive-final');

      resolvers.get('http://localhost/reactive-group-b')?.shift()?.();
      resolvers.get('http://localhost/reactive-group-c')?.shift()?.();
      await vi.advanceTimersByTimeAsync(10);

      expect(startedUrls).toContain('http://localhost/reactive-final');

      resolvers.get('http://localhost/reactive-final')?.shift()?.();
      const execution = await done;

      expect(execution.status).toBe('completed');
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it('re-anchors on declaration order after a sequential group drains', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'sequential-group-anchor',
        name: 'Sequential Group Anchor',
        steps: [
          {
            id: 'seq-group-1',
            name: 'Sequential Group 1',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/seq-group-1' },
            executionMode: 'sequential',
            parallelGroup: 1,
          },
          {
            id: 'legacy-next',
            name: 'Legacy Next',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/legacy-next' },
          },
          {
            id: 'seq-group-2',
            name: 'Sequential Group 2',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/seq-group-2' },
            executionMode: 'sequential',
            parallelGroup: 2,
          },
        ],
      });

      const startedUrls: string[] = [];
      const resolvers = new Map<string, Array<() => void>>();
      mockFetch.mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        startedUrls.push(url);
        const urlResolvers = resolvers.get(url) ?? [];
        return new Promise((resolve) => {
          urlResolvers.push(() => resolve(mockResponse(200, 'ok')));
          resolvers.set(url, urlResolvers);
        });
      });

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('sequential-group-anchor');

      await vi.advanceTimersByTimeAsync(10);
      expect(startedUrls).toEqual(['http://localhost/seq-group-1']);

      resolvers.get('http://localhost/seq-group-1')?.shift()?.();
      await vi.advanceTimersByTimeAsync(10);

      expect(startedUrls).toEqual([
        'http://localhost/seq-group-1',
        'http://localhost/legacy-next',
      ]);

      resolvers.get('http://localhost/legacy-next')?.shift()?.();
      await vi.advanceTimersByTimeAsync(10);

      expect(startedUrls).toEqual([
        'http://localhost/seq-group-1',
        'http://localhost/legacy-next',
        'http://localhost/seq-group-2',
      ]);

      resolvers.get('http://localhost/seq-group-2')?.shift()?.();
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

    it('rejects unsupported runner steps before creating execution state', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'runner-step',
        name: 'Runner Step',
        steps: [
          {
            id: 'scan-check',
            name: 'Nuclei Scan',
            type: 'nuclei',
            stage: 'main',
            runner: {
              templateRef: 'cves/2021/cve-2021-44228.yaml',
            },
          },
        ],
      });

      await expect(engine.startScenario('runner-step')).rejects.toThrow(
        'Scenario runner-step contains runner steps that are not executable yet: scan-check (nuclei)',
      );

      expect(engine.listExecutions()).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
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

  // ── TASK-65.2: k6 runner step execution ──────────────────────────────

  describe('k6 runner steps', () => {
    let scriptsDir: string;
    let reportsDir: string;
    let mockSpawn: ReturnType<typeof vi.fn>;
    let k6Engine: ScenarioEngine;

    beforeAll(() => {
      scriptsDir = mkdtempSync(join(tmpdir(), 'crucible-k6-tests-'));
      writeFileSync(join(scriptsDir, 'baseline-smoke.js'), '// fake k6 script\n');
      mkdirSync(join(scriptsDir, 'sub'));
      writeFileSync(join(scriptsDir, 'sub', 'nested.js'), '// fake nested\n');
      // Symlink that points outside the scripts dir to test traversal defense.
      const escapeDir = mkdtempSync(join(tmpdir(), 'crucible-k6-escape-'));
      writeFileSync(join(escapeDir, 'evil.js'), '// outside\n');
      symlinkSync(join(escapeDir, 'evil.js'), join(scriptsDir, 'symlink-escape.js'));
    });

    afterAll(() => {
      rmSync(scriptsDir, { recursive: true, force: true });
    });

    beforeEach(() => {
      reportsDir = mkdtempSync(join(tmpdir(), 'crucible-k6-reports-'));
      mockSpawn = vi.fn();
      const k6Runner = new K6Runner({ scriptsDir, spawn: mockSpawn as any });
      k6Engine = new ScenarioEngine(mockCatalog, undefined, undefined, {
        k6Runner,
        reportsDir,
      });
    });

    afterEach(() => {
      k6Engine.destroy();
      rmSync(reportsDir, { recursive: true, force: true });
    });

    interface FakeChildOpts {
      exitCode: number | null;
      signalName?: NodeJS.Signals | null;
      stdout?: string;
      stderr?: string;
      summaryPath?: string;
      summary?: object;
    }

    function fakeChild(opts: FakeChildOpts) {
      const child = new EventEmitter() as any;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      process.nextTick(() => {
        if (opts.summaryPath && opts.summary !== undefined) {
          writeFileSync(opts.summaryPath, JSON.stringify(opts.summary));
        }
        if (opts.stdout) {
          child.stdout.emit('data', Buffer.from(opts.stdout, 'utf8'));
        }
        if (opts.stderr) {
          child.stderr.emit('data', Buffer.from(opts.stderr, 'utf8'));
        }
        child.emit('exit', opts.exitCode, opts.signalName ?? null);
      });
      return child;
    }

    function spawnWith(opts: Omit<FakeChildOpts, 'summaryPath'>) {
      return (_bin: string, args: ReadonlyArray<string>) => {
        const flag = args.find((a) => a.startsWith('--summary-export='));
        const summaryPath = flag?.slice('--summary-export='.length);
        return fakeChild({ ...opts, summaryPath });
      };
    }

    it('executes a k6 step successfully when k6 exits 0', async () => {
      mockSpawn.mockImplementation(spawnWith({
        exitCode: 0,
        stdout: 'iteration 1/1 ok\n',
        summary: {
          metrics: {
            http_reqs: { values: { count: 50 } },
            iterations: { values: { count: 50 } },
            http_req_duration: { values: { 'p(95)': 187.5 } },
            checks: { values: { passes: 50, fails: 0 } },
            http_req_failed: {
              values: { rate: 0 },
              thresholds: { 'rate<0.01': { ok: true } },
            },
          },
        },
      }));
      mockCatalog.getScenario.mockReturnValue({
        id: 'k6-success',
        name: 'k6 Success',
        steps: [
          {
            id: 'load',
            name: 'Load',
            type: 'k6',
            stage: 'main',
            runner: { scriptRef: 'baseline-smoke.js' },
          },
        ],
      });

      const done = waitForEvent(k6Engine, 'execution:completed');
      const executionId = await k6Engine.startScenario('k6-success');
      await done;

      const execution = k6Engine.getExecution(executionId);
      expect(execution?.steps[0].status).toBe('completed');
      const runner = execution?.steps[0].details?.runner;
      expect(runner?.type).toBe('k6');
      expect(runner?.exitCode).toBe(0);
      expect(runner?.targetUrl).toBe('http://localhost');
      expect(runner?.summary).toBe('iteration 1/1 ok\n');
      expect(runner?.metrics).toEqual({
        requests: 50,
        iterations: 50,
        httpReqDurationP95Ms: 187.5,
        checksPassed: 50,
        checksFailed: 0,
        thresholdsPassed: 1,
        thresholdsFailed: 0,
      });
      const expectedUrlBase = `/api/reports/${executionId}/artifacts/load`;
      expect(runner?.artifacts).toEqual([
        `${expectedUrlBase}/summary.json`,
        `${expectedUrlBase}/stdout.log`,
      ]);
      // Files persisted under reportsDir/<executionId>/<stepId>/.
      const stepDir = join(reportsDir!, executionId, 'load');
      expect(existsSync(join(stepDir, 'summary.json'))).toBe(true);
      expect(existsSync(join(stepDir, 'stdout.log'))).toBe(true);
      expect(readFileSync(join(stepDir, 'stdout.log'), 'utf8')).toBe('iteration 1/1 ok\n');
      expect(mockSpawn).toHaveBeenCalledTimes(1);
      const [bin, args, options] = mockSpawn.mock.calls[0];
      expect(bin).toBe('k6');
      expect(args[0]).toBe('run');
      expect(args.some((a: string) => a.startsWith('--summary-export='))).toBe(true);
      expect(args[args.length - 1]).toMatch(/baseline-smoke\.js$/);
      expect((options as any).env.TARGET_URL).toBe('http://localhost');
    });

    it('flips the step to failed when k6 exits 0 but thresholds breached', async () => {
      mockSpawn.mockImplementation(spawnWith({
        exitCode: 0,
        summary: {
          metrics: {
            http_reqs: { values: { count: 100 } },
            http_req_failed: {
              values: { rate: 0.12 },
              thresholds: { 'rate<0.01': { ok: false } },
            },
            http_req_duration: {
              values: { 'p(95)': 920 },
              thresholds: { 'p(95)<500': { ok: false } },
            },
          },
        },
      }));
      mockCatalog.getScenario.mockReturnValue({
        id: 'k6-thresholds-soft',
        name: 'k6 Thresholds Soft Fail',
        steps: [
          {
            id: 'load',
            name: 'Load',
            type: 'k6',
            stage: 'main',
            runner: { scriptRef: 'baseline-smoke.js' },
          },
        ],
      });

      const done = waitForEvent(k6Engine, 'execution:completed');
      await k6Engine.startScenario('k6-thresholds-soft');
      await done;

      const execution = k6Engine.listExecutions()[0];
      expect(execution.steps[0].status).toBe('failed');
      expect(execution.steps[0].error).toBe('k6 thresholds failed: 2 threshold(s) breached');
      expect(execution.steps[0].details?.runner?.metrics?.thresholdsFailed).toBe(2);
    });

    it('marks the step failed when k6 exits non-zero and surfaces the exit code', async () => {
      mockSpawn.mockImplementation(spawnWith({ exitCode: 99 }));
      mockCatalog.getScenario.mockReturnValue({
        id: 'k6-thresholds',
        name: 'k6 Thresholds',
        steps: [
          {
            id: 'load',
            name: 'Load',
            type: 'k6',
            stage: 'main',
            runner: { scriptRef: 'baseline-smoke.js' },
          },
        ],
      });

      const done = waitForEvent(k6Engine, 'execution:completed');
      const executionId = await k6Engine.startScenario('k6-thresholds');
      await done;

      const execution = k6Engine.getExecution(executionId);
      // Engine treats execution-level status as 'completed' once all steps
      // settle; per-step status is the failure signal. Mirrors how HTTP
      // assertion failures are reported today.
      expect(execution?.steps[0].status).toBe('failed');
      expect(execution?.steps[0].error).toBe('k6 exited with code 99');
      expect(execution?.steps[0].details?.runner?.exitCode).toBe(99);
    });

    it('rejects path-traversal scriptRef before invoking spawn', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'k6-traversal',
        name: 'k6 Traversal',
        steps: [
          {
            id: 'load',
            name: 'Load',
            type: 'k6',
            stage: 'main',
            runner: { scriptRef: '../etc/passwd.js' },
          },
        ],
      });

      const done = waitForEvent(k6Engine, 'execution:completed');
      await k6Engine.startScenario('k6-traversal');
      await done;

      expect(mockSpawn).not.toHaveBeenCalled();
      const execution = k6Engine.listExecutions()[0];
      expect(execution.steps[0].status).toBe('failed');
      expect(execution.steps[0].error).toMatch(/k6 script ".*" not found|resolves outside scripts dir/);
    });

    it('rejects symlink-based escape from the scripts dir', async () => {
      mockCatalog.getScenario.mockReturnValue({
        id: 'k6-symlink',
        name: 'k6 Symlink',
        steps: [
          {
            id: 'load',
            name: 'Load',
            type: 'k6',
            stage: 'main',
            runner: { scriptRef: 'symlink-escape.js' },
          },
        ],
      });

      const done = waitForEvent(k6Engine, 'execution:completed');
      await k6Engine.startScenario('k6-symlink');
      await done;

      expect(mockSpawn).not.toHaveBeenCalled();
      const execution = k6Engine.listExecutions()[0];
      expect(execution.steps[0].status).toBe('failed');
      expect(execution.steps[0].error).toContain('resolves outside scripts dir');
    });

    it('fails the step when no k6 runner is configured', async () => {
      const noRunnerEngine = new ScenarioEngine(mockCatalog, undefined, undefined, {
        k6Runner: null,
        reportsDir,
      });
      mockCatalog.getScenario.mockReturnValue({
        id: 'k6-no-runner',
        name: 'k6 No Runner',
        steps: [
          {
            id: 'load',
            name: 'Load',
            type: 'k6',
            stage: 'main',
            runner: { scriptRef: 'baseline-smoke.js' },
          },
        ],
      });

      const done = waitForEvent(noRunnerEngine, 'execution:completed');
      await noRunnerEngine.startScenario('k6-no-runner');
      await done;

      const execution = noRunnerEngine.listExecutions()[0];
      expect(execution.steps[0].status).toBe('failed');
      expect(execution.steps[0].error).toContain('k6 runner not configured');
      noRunnerEngine.destroy();
    });

    it('fails the step when reportsDir is not configured', async () => {
      const noReportsEngine = new ScenarioEngine(mockCatalog, undefined, undefined, {
        k6Runner: new K6Runner({ scriptsDir, spawn: mockSpawn as any }),
        // reportsDir intentionally omitted
      });
      mockCatalog.getScenario.mockReturnValue({
        id: 'k6-no-reports',
        name: 'k6 No Reports',
        steps: [
          {
            id: 'load',
            name: 'Load',
            type: 'k6',
            stage: 'main',
            runner: { scriptRef: 'baseline-smoke.js' },
          },
        ],
      });

      const done = waitForEvent(noReportsEngine, 'execution:completed');
      await noReportsEngine.startScenario('k6-no-reports');
      await done;

      const execution = noReportsEngine.listExecutions()[0];
      expect(execution.steps[0].status).toBe('failed');
      expect(execution.steps[0].error).toContain('reportsDir');
      expect(mockSpawn).not.toHaveBeenCalled();
      noReportsEngine.destroy();
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

  describe('per-run target override', () => {
    const singleStepScenario = {
      id: 'target-override',
      name: 'Target Override',
      steps: [
        {
          id: 'probe',
          name: 'Probe',
          stage: 'main',
          request: { method: 'GET', url: '/health' },
        },
      ],
    };

    it('uses the per-run override when one is supplied', async () => {
      mockCatalog.getScenario.mockReturnValue(singleStepScenario);
      mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true }, { 'content-type': 'application/json' }));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario(
        'target-override',
        'simulation',
        undefined,
        undefined,
        'http://127.0.0.1:5555',
      );
      const execution = await done;

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('http://127.0.0.1:5555/health');
      expect(execution.status).toBe('completed');
      expect(execution.targetUrl).toBe('http://127.0.0.1:5555');
    });

    it('falls back to the engine default when no override is supplied', async () => {
      mockCatalog.getScenario.mockReturnValue(singleStepScenario);
      mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true }, { 'content-type': 'application/json' }));

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario('target-override');
      const execution = await done;

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost/health');
      expect(execution.targetUrl).toBe('http://localhost');
    });

    it('scopes the outbound allowlist to the per-run target', async () => {
      // Scenario tries to hit the engine default host (localhost) via an
      // explicit absolute URL, but the operator launched with an override
      // targeting 127.0.0.1:5555. The per-execution allowlist must reject
      // localhost even though localhost is what the engine was configured
      // with — the whole point of rescoping the allowlist per run.
      mockCatalog.getScenario.mockReturnValue({
        id: 'target-override-ssrf',
        name: 'Target Override SSRF',
        steps: [
          {
            id: 'pivot',
            name: 'Pivot to engine default',
            stage: 'main',
            request: { method: 'GET', url: 'http://localhost/secret' },
          },
        ],
      });

      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario(
        'target-override-ssrf',
        'simulation',
        undefined,
        undefined,
        'http://127.0.0.1:5555',
      );
      const execution = await done;

      expect(mockFetch).not.toHaveBeenCalled();
      expect(execution.steps[0].status).toBe('failed');
      expect(execution.steps[0].error).toContain('Outbound request blocked');
    });

    it('rejects an invalid override before creating any execution state', async () => {
      mockCatalog.getScenario.mockReturnValue(singleStepScenario);

      await expect(
        engine.startScenario(
          'target-override',
          'simulation',
          undefined,
          undefined,
          'ftp://evil.example',
        ),
      ).rejects.toThrow('Scenario target URL must use http or https');

      // Engine state is untouched
      expect(engine.listExecutions()).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects an unparseable override', async () => {
      mockCatalog.getScenario.mockReturnValue(singleStepScenario);
      await expect(
        engine.startScenario('target-override', 'simulation', undefined, undefined, 'not-a-url'),
      ).rejects.toThrow('Scenario target URL must be a valid absolute URL');
      expect(engine.listExecutions()).toHaveLength(0);
    });

    it('rejects an override containing credentials', async () => {
      mockCatalog.getScenario.mockReturnValue(singleStepScenario);
      await expect(
        engine.startScenario(
          'target-override',
          'simulation',
          undefined,
          undefined,
          'http://user:pass@example.test',
        ),
      ).rejects.toThrow('Scenario target URL must not include credentials');
    });

    it('strips fragments from per-run target overrides', async () => {
      mockCatalog.getScenario.mockReturnValue(singleStepScenario);
      mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true }, { 'content-type': 'application/json' }));
      const done = waitForEvent(engine, 'execution:completed');
      await engine.startScenario(
        'target-override',
        'simulation',
        undefined,
        undefined,
        'http://example.test#frag',
      );
      const execution = await done;
      expect(execution.targetUrl).toBe('http://example.test');
    });

    it('preserves per-run allowlist isolation between concurrent executions', async () => {
      // Two concurrent runs, each pointing at a different target. Neither run
      // should see the other run's host in its own allowlist.
      const resolvers: Array<(v: unknown) => void> = [];
      mockFetch.mockImplementation(() => new Promise((resolve) => {
        resolvers.push((v) => resolve(v));
      }));
      mockCatalog.getScenario.mockReturnValue(singleStepScenario);

      const id1 = await engine.startScenario(
        'target-override',
        'simulation',
        undefined,
        undefined,
        'http://10.0.0.1:9000',
      );
      const id2 = await engine.startScenario(
        'target-override',
        'simulation',
        undefined,
        undefined,
        'http://10.0.0.2:9000',
      );

      // Let both scheduler loops advance and hit the fetch call
      await vi.advanceTimersByTimeAsync(5);

      // Resolve in order they were scheduled
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const urls = mockFetch.mock.calls.map((c) => c[0]);
      expect(urls).toContain('http://10.0.0.1:9000/health');
      expect(urls).toContain('http://10.0.0.2:9000/health');

      resolvers.forEach((r) =>
        r(mockResponse(200, { ok: true }, { 'content-type': 'application/json' })),
      );
      await vi.advanceTimersByTimeAsync(10);

      expect(engine.getExecution(id1)?.targetUrl).toBe('http://10.0.0.1:9000');
      expect(engine.getExecution(id2)?.targetUrl).toBe('http://10.0.0.2:9000');
    });
  });
});
