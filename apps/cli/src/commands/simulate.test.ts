import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CrucibleClient } from '@atlascrew/crucible-client';
import { simulateCommand } from './simulate.js';
import type { GlobalOptions } from '../parse.js';

const globals: GlobalOptions = {
  server: 'http://localhost:3000',
  timeout: 30,
  format: 'json',
};

function makeClient() {
  const start = vi.fn().mockResolvedValue({
    executionId: 'exec-1',
    mode: 'simulation',
    wsUrl: 'ws://localhost:3000/',
  });
  return {
    client: { simulations: { start } } as unknown as CrucibleClient,
    start,
  };
}

describe('simulateCommand', () => {
  let writeOut: ReturnType<typeof vi.spyOn>;
  let writeErr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeOut = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    writeErr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  it('starts a scenario without a target override when --target is omitted', async () => {
    const { client, start } = makeClient();
    const code = await simulateCommand(client, globals, ['scenario-1']);
    expect(code).toBe(0);
    expect(start).toHaveBeenCalledWith('scenario-1', undefined);
  });

  it('forwards --target to the client launch call', async () => {
    const { client, start } = makeClient();
    const code = await simulateCommand(client, globals, [
      'scenario-1',
      '--target',
      'http://staging.example:8080',
    ]);
    expect(code).toBe(0);
    expect(start).toHaveBeenCalledWith('scenario-1', { targetUrl: 'http://staging.example:8080' });
  });

  it('forwards the -t shorthand to the client launch call', async () => {
    const { client, start } = makeClient();
    const code = await simulateCommand(client, globals, [
      'scenario-1',
      '-t',
      'https://prod.example.com',
    ]);
    expect(code).toBe(0);
    expect(start).toHaveBeenCalledWith('scenario-1', { targetUrl: 'https://prod.example.com' });
  });

  it('accepts the --target=value equals form', async () => {
    const { client, start } = makeClient();
    const code = await simulateCommand(client, globals, [
      'scenario-1',
      '--target=http://staging.example:8080',
    ]);
    expect(code).toBe(0);
    expect(start).toHaveBeenCalledWith('scenario-1', { targetUrl: 'http://staging.example:8080' });
  });

  it('rejects -t at end of argv with no value', async () => {
    const { client, start } = makeClient();
    await expect(
      simulateCommand(client, globals, ['scenario-1', '-t']),
    ).rejects.toThrow('--target requires a value');
    expect(start).not.toHaveBeenCalled();
  });

  it('rejects an unparseable --target before any network call', async () => {
    const { client, start } = makeClient();
    const code = await simulateCommand(client, globals, ['scenario-1', '--target', 'notaurl']);
    expect(code).toBe(1);
    expect(start).not.toHaveBeenCalled();
    expect(writeErr.mock.calls.flat().join('')).toContain('valid URL');
  });

  it('rejects a non-http(s) --target scheme before any network call', async () => {
    const { client, start } = makeClient();
    const code = await simulateCommand(client, globals, [
      'scenario-1',
      '--target',
      'ftp://example.com',
    ]);
    expect(code).toBe(1);
    expect(start).not.toHaveBeenCalled();
    expect(writeErr.mock.calls.flat().join('')).toContain('http or https');
  });

  it('exits 1 when no scenario id is supplied', async () => {
    const { client, start } = makeClient();
    const code = await simulateCommand(client, globals, []);
    expect(code).toBe(1);
    expect(start).not.toHaveBeenCalled();
  });

  void writeOut;
});
