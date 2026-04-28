import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CrucibleClient } from '@atlascrew/crucible-client';
import { assessCommand } from './assess.js';
import type { GlobalOptions } from '../parse.js';

const globals: GlobalOptions = {
  server: 'http://localhost:3000',
  timeout: 30,
  format: 'json',
};

function makeClient(executionOverrides: Record<string, unknown> = {}) {
  const start = vi.fn().mockResolvedValue({
    executionId: 'exec-1',
    mode: 'assessment',
    reportUrl: '/api/reports/exec-1',
  });
  const get = vi.fn().mockResolvedValue({
    id: 'exec-1',
    scenarioId: 'scenario-1',
    mode: 'assessment',
    status: 'completed',
    steps: [],
    duration: 1000,
    report: { summary: 'ok', passed: true, score: 95, artifacts: [] },
    ...executionOverrides,
  });
  return {
    client: {
      assessments: { start },
      executions: { get },
    } as unknown as CrucibleClient,
    start,
    get,
  };
}

describe('assessCommand', () => {
  let writeOut: ReturnType<typeof vi.spyOn>;
  let writeErr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeOut = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    writeErr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  it('starts an assessment without a target override when --target is omitted', async () => {
    const { client, start } = makeClient();
    const code = await assessCommand(client, globals, ['scenario-1']);
    expect(code).toBe(0);
    expect(start).toHaveBeenCalledWith('scenario-1', undefined);
  });

  it('forwards --target to client.assessments.start', async () => {
    const { client, start } = makeClient();
    const code = await assessCommand(client, globals, [
      'scenario-1',
      '--target',
      'http://staging.example:8080',
    ]);
    expect(code).toBe(0);
    expect(start).toHaveBeenCalledWith('scenario-1', {
      targetUrl: 'http://staging.example:8080',
    });
  });

  it('forwards -t shorthand to client.assessments.start', async () => {
    const { client, start } = makeClient();
    const code = await assessCommand(client, globals, [
      'scenario-1',
      '-t',
      'https://prod.example.com',
    ]);
    expect(code).toBe(0);
    expect(start).toHaveBeenCalledWith('scenario-1', {
      targetUrl: 'https://prod.example.com',
    });
  });

  it('accepts the --target=value equals form', async () => {
    const { client, start } = makeClient();
    const code = await assessCommand(client, globals, [
      'scenario-1',
      '--target=http://staging.example:8080',
    ]);
    expect(code).toBe(0);
    expect(start).toHaveBeenCalledWith('scenario-1', {
      targetUrl: 'http://staging.example:8080',
    });
  });

  it('applies the same --target to every scenario in a multi-scenario assess', async () => {
    const { client, start } = makeClient();
    const code = await assessCommand(client, globals, [
      '--scenario',
      'scenario-1,scenario-2',
      '--target',
      'http://staging.example:8080',
    ]);
    expect(code).toBe(0);
    expect(start).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenNthCalledWith(1, 'scenario-1', {
      targetUrl: 'http://staging.example:8080',
    });
    expect(start).toHaveBeenNthCalledWith(2, 'scenario-2', {
      targetUrl: 'http://staging.example:8080',
    });
  });

  it('rejects an unparseable --target before any network call', async () => {
    const { client, start } = makeClient();
    const code = await assessCommand(client, globals, ['scenario-1', '--target', 'notaurl']);
    expect(code).toBe(1);
    expect(start).not.toHaveBeenCalled();
    expect(writeErr.mock.calls.flat().join('')).toContain('valid URL');
  });

  it('rejects a non-http(s) --target scheme before any network call', async () => {
    const { client, start } = makeClient();
    const code = await assessCommand(client, globals, [
      'scenario-1',
      '--target',
      'ftp://example.com',
    ]);
    expect(code).toBe(1);
    expect(start).not.toHaveBeenCalled();
    expect(writeErr.mock.calls.flat().join('')).toContain('http or https');
  });

  void writeOut;
});
