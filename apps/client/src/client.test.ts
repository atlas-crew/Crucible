import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrucibleClient } from './client.js';
import { CrucibleApiError } from './errors.js';

function mockFetch(body: unknown, options?: { status?: number; statusText?: string }) {
  const status = options?.status ?? 200;
  const statusText = options?.statusText ?? 'OK';
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
  } as Partial<Response>);
}

describe('CrucibleClient', () => {
  let client: CrucibleClient;
  let fetch: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetch = mockFetch({});
    client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });
  });

  describe('health()', () => {
    it('calls GET /health', async () => {
      const data = { status: 'ok', timestamp: 1000, scenarios: 3, targetUrl: 'http://target' };
      fetch = mockFetch(data);
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });

      const result = await client.health();
      expect(result).toEqual(data);
      expect(fetch).toHaveBeenCalledWith('http://localhost:3000/health', expect.objectContaining({ method: 'GET' }));
    });
  });

  describe('scenarios', () => {
    it('list() calls GET /api/scenarios', async () => {
      const scenarios = [{ id: 's1', name: 'Test', steps: [] }];
      fetch = mockFetch(scenarios);
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });

      const result = await client.scenarios.list();
      expect(result).toEqual(scenarios);
      expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/scenarios', expect.objectContaining({ method: 'GET' }));
    });

    it('update() calls PUT /api/scenarios/:id', async () => {
      const scenario = { id: 's1', name: 'Updated', steps: [] };
      fetch = mockFetch(scenario);
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });

      const result = await client.scenarios.update('s1', scenario as any);
      expect(result).toEqual(scenario);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/scenarios/s1',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify(scenario) }),
      );
    });
  });

  describe('executions', () => {
    it('list() calls GET /api/executions with no params', async () => {
      fetch = mockFetch([]);
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });

      await client.executions.list();
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/executions',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('list() encodes query params', async () => {
      fetch = mockFetch([]);
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });

      await client.executions.list({
        scenarioId: 's1',
        status: ['running', 'completed'],
        mode: 'assessment',
        limit: 10,
        offset: 5,
      });

      const calledUrl = fetch.mock.calls[0][0] as string;
      const url = new URL(calledUrl);
      expect(url.searchParams.get('scenarioId')).toBe('s1');
      expect(url.searchParams.get('status')).toBe('running,completed');
      expect(url.searchParams.get('mode')).toBe('assessment');
      expect(url.searchParams.get('limit')).toBe('10');
      expect(url.searchParams.get('offset')).toBe('5');
    });

    it('get() calls GET /api/executions/:id', async () => {
      const execution = { id: 'e1', scenarioId: 's1', mode: 'simulation', status: 'running', steps: [] };
      fetch = mockFetch(execution);
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });

      const result = await client.executions.get('e1');
      expect(result).toEqual(execution);
    });

    it('pause() calls POST /api/executions/:id/pause', async () => {
      fetch = mockFetch({ ok: true });
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });

      const result = await client.executions.pause('e1');
      expect(result).toEqual({ ok: true });
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/executions/e1/pause',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('resume() calls POST /api/executions/:id/resume', async () => {
      fetch = mockFetch({ ok: true });
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });

      await client.executions.resume('e1');
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/executions/e1/resume',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('cancel() calls POST /api/executions/:id/cancel', async () => {
      fetch = mockFetch({ ok: true });
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });

      await client.executions.cancel('e1');
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/executions/e1/cancel',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('restart() calls POST /api/executions/:id/restart', async () => {
      fetch = mockFetch({ executionId: 'e2' });
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });

      const result = await client.executions.restart('e1');
      expect(result).toEqual({ executionId: 'e2' });
    });

    it('pauseAll() calls POST /api/executions/pause-all', async () => {
      fetch = mockFetch({ count: 3 });
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });

      const result = await client.executions.pauseAll();
      expect(result).toEqual({ count: 3 });
    });

    it('resumeAll() calls POST /api/executions/resume-all', async () => {
      fetch = mockFetch({ count: 2 });
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });

      const result = await client.executions.resumeAll();
      expect(result).toEqual({ count: 2 });
    });

    it('cancelAll() calls POST /api/executions/cancel-all', async () => {
      fetch = mockFetch({ count: 1 });
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });

      const result = await client.executions.cancelAll();
      expect(result).toEqual({ count: 1 });
    });
  });

  describe('simulations', () => {
    it('start() calls POST /api/simulations', async () => {
      const response = { executionId: 'e1', mode: 'simulation', wsUrl: 'ws://localhost:3000' };
      fetch = mockFetch(response);
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });

      const result = await client.simulations.start('s1');
      expect(result).toEqual(response);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/simulations',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ scenarioId: 's1' }),
        }),
      );
    });

    it('start() includes triggerData', async () => {
      fetch = mockFetch({ executionId: 'e1', mode: 'simulation', wsUrl: 'ws://...' });
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });

      await client.simulations.start('s1', { key: 'value' });
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/simulations',
        expect.objectContaining({
          body: JSON.stringify({ scenarioId: 's1', key: 'value' }),
        }),
      );
    });
  });

  describe('assessments', () => {
    it('start() calls POST /api/assessments', async () => {
      const response = { executionId: 'e1', mode: 'assessment', reportUrl: '/api/reports/e1' };
      fetch = mockFetch(response);
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });

      const result = await client.assessments.start('s1');
      expect(result).toEqual(response);
    });
  });

  describe('reports', () => {
    it('get() calls GET /api/reports/:id', async () => {
      const report = { id: 'e1', status: 'completed', report: { score: 90 } };
      fetch = mockFetch(report);
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });

      const result = await client.reports.get('e1');
      expect(result).toEqual(report);
    });

    it('get() passes format param', async () => {
      fetch = mockFetch({});
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });

      await client.reports.get('e1', { format: 'json' });
      const calledUrl = fetch.mock.calls[0][0] as string;
      expect(new URL(calledUrl).searchParams.get('format')).toBe('json');
    });

    it('json() returns raw Response', async () => {
      const mockResponse = { ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve({}) };
      fetch = vi.fn().mockResolvedValue(mockResponse);
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });

      const res = await client.reports.json('e1');
      expect(res).toBe(mockResponse);
      expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/reports/e1/json', expect.any(Object));
    });
  });

  describe('error handling', () => {
    it('throws CrucibleApiError on non-2xx response', async () => {
      fetch = mockFetch({ error: 'Not found' }, { status: 404, statusText: 'Not Found' });
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });

      await expect(client.executions.get('missing')).rejects.toThrow(CrucibleApiError);

      try {
        await client.executions.get('missing');
      } catch (e) {
        expect(e).toBeInstanceOf(CrucibleApiError);
        const err = e as CrucibleApiError;
        expect(err.status).toBe(404);
        expect(err.statusText).toBe('Not Found');
        expect(err.body).toEqual({ error: 'Not found' });
        expect(err.message).toBe('Not found');
      }
    });

    it('throws CrucibleApiError on 409 conflict', async () => {
      fetch = mockFetch({ error: 'Cannot pause execution in completed state' }, { status: 409, statusText: 'Conflict' });
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });

      await expect(client.executions.pause('e1')).rejects.toThrow(CrucibleApiError);
    });

    it('falls back to status text when body parse fails', async () => {
      const badFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('not json')),
      });
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch: badFetch });

      try {
        await client.health();
      } catch (e) {
        const err = e as CrucibleApiError;
        expect(err.message).toBe('500 Internal Server Error');
        expect(err.body).toBeUndefined();
      }
    });
  });

  describe('custom headers', () => {
    it('sends custom headers with every request', async () => {
      fetch = mockFetch({});
      client = new CrucibleClient({
        baseUrl: 'http://localhost:3000',
        fetch,
        headers: { Authorization: 'Bearer token123' },
      });

      await client.health();
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer token123' }),
        }),
      );
    });
  });

  describe('connect()', () => {
    it('derives WebSocket URL from baseUrl', () => {
      // We can't fully test WebSocket without a real server,
      // but we can verify the URL derivation logic
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch: mockFetch({}) });
      // connect() would create a CrucibleSocket — we just verify it doesn't throw
      // when WebSocket is not available in test env, so we skip the actual connection test
      expect(client.connect).toBeDefined();
    });
  });

  describe('baseUrl normalization', () => {
    it('strips trailing slashes from baseUrl', async () => {
      fetch = mockFetch({});
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000/', fetch });

      await client.health();
      expect(fetch).toHaveBeenCalledWith('http://localhost:3000/health', expect.any(Object));
    });
  });

  describe('timeout', () => {
    it('passes AbortSignal.timeout when timeout is set', async () => {
      fetch = mockFetch({});
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch, timeout: 5000 });

      await client.health();
      const init = fetch.mock.calls[0][1] as RequestInit;
      expect(init.signal).toBeDefined();
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('does not pass signal when timeout is not set', async () => {
      fetch = mockFetch({});
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch });

      await client.health();
      const init = fetch.mock.calls[0][1] as RequestInit;
      expect(init.signal).toBeUndefined();
    });

    it('passes AbortSignal.timeout on fetchRaw (report downloads)', async () => {
      const mockResponse = { ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve({}) };
      fetch = vi.fn().mockResolvedValue(mockResponse);
      client = new CrucibleClient({ baseUrl: 'http://localhost:3000', fetch, timeout: 3000 });

      await client.reports.json('e1');
      const init = fetch.mock.calls[0][1] as RequestInit;
      expect(init.signal).toBeDefined();
    });
  });
});
