import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseGlobals } from './parse.js';

describe('parseGlobals', () => {
  const originalEnv = process.env.CRUCIBLE_URL;
  const originalIsTTY = process.stdout.isTTY;

  beforeEach(() => {
    delete process.env.CRUCIBLE_URL;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true, configurable: true });
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CRUCIBLE_URL = originalEnv;
    } else {
      delete process.env.CRUCIBLE_URL;
    }
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true, configurable: true });
  });

  it('parses command with no global options', () => {
    const result = parseGlobals(['health']);
    expect(result.command).toBe('health');
    expect(result.globals.server).toBe('http://localhost:3000');
    expect(result.globals.timeout).toBe(30);
    expect(result.args).toEqual([]);
  });

  it('parses --server flag before command', () => {
    const result = parseGlobals(['--server', 'http://remote:4000', 'scenarios']);
    expect(result.globals.server).toBe('http://remote:4000');
    expect(result.command).toBe('scenarios');
  });

  it('parses --server=value syntax', () => {
    const result = parseGlobals(['--server=http://remote:4000', 'health']);
    expect(result.globals.server).toBe('http://remote:4000');
  });

  it('strips trailing slashes from server', () => {
    const result = parseGlobals(['--server', 'http://remote:4000/', 'health']);
    expect(result.globals.server).toBe('http://remote:4000');
  });

  it('uses CRUCIBLE_URL env var as default', () => {
    process.env.CRUCIBLE_URL = 'http://env-server:5000';
    const result = parseGlobals(['health']);
    expect(result.globals.server).toBe('http://env-server:5000');
  });

  it('--server overrides CRUCIBLE_URL', () => {
    process.env.CRUCIBLE_URL = 'http://env-server:5000';
    const result = parseGlobals(['--server', 'http://flag:6000', 'health']);
    expect(result.globals.server).toBe('http://flag:6000');
  });

  it('parses --timeout', () => {
    const result = parseGlobals(['--timeout', '60', 'health']);
    expect(result.globals.timeout).toBe(60);
  });

  it('throws on invalid --timeout', () => {
    expect(() => parseGlobals(['--timeout', 'abc', 'health'])).toThrow('positive number');
  });

  it('parses --format json', () => {
    const result = parseGlobals(['--format', 'json', 'health']);
    expect(result.globals.format).toBe('json');
  });

  it('parses --format table', () => {
    const result = parseGlobals(['--format', 'table', 'health']);
    expect(result.globals.format).toBe('table');
  });

  it('throws on invalid --format', () => {
    expect(() => parseGlobals(['--format', 'xml', 'health'])).toThrow('"json" or "table"');
  });

  it('defaults to table format for TTY', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true });
    const result = parseGlobals(['health']);
    expect(result.globals.format).toBe('table');
  });

  it('defaults to json format for non-TTY', () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: undefined });
    const result = parseGlobals(['health']);
    expect(result.globals.format).toBe('json');
  });

  it('passes remaining args to command', () => {
    const result = parseGlobals(['assess', 'my-scenario', '--fail-below', '90']);
    expect(result.command).toBe('assess');
    expect(result.args).toEqual(['my-scenario', '--fail-below', '90']);
  });

  it('recognizes --help as help command', () => {
    const result = parseGlobals(['--help']);
    expect(result.command).toBe('help');
  });

  it('recognizes -h as help command', () => {
    const result = parseGlobals(['-h']);
    expect(result.command).toBe('help');
  });

  it('returns empty command when no args', () => {
    const result = parseGlobals([]);
    expect(result.command).toBe('');
  });
});
