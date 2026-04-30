import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  artifactContentType,
  isArtifactExposable,
  parseAssessmentLaunchRequest,
  parseSimulationLaunchRequest,
  resolveArtifactPath,
} from '../server/backend.js';

describe('backend launch request parsing', () => {
  it('accepts simulation triggerData overrides under the triggerData envelope', () => {
    const result = parseSimulationLaunchRequest({
      scenarioId: 'scenario-1',
      targetUrl: 'http://demo.local',
      triggerData: { expectWafBlocking: false },
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.triggerData?.expectWafBlocking).toBe(false);
  });

  it('accepts legacy top-level simulation triggerData fields and normalizes them into triggerData', () => {
    const result = parseSimulationLaunchRequest({
      scenarioId: 'scenario-1',
      targetUrl: 'http://demo.local',
      expectWafBlocking: false,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.triggerData).toEqual({
      expectWafBlocking: false,
    });
  });

  it('rejects malformed simulation triggerData values', () => {
    const result = parseSimulationLaunchRequest({
      scenarioId: 'scenario-1',
      triggerData: { expectWafBlocking: 'false' },
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.error.issues[0]?.message).toContain('Expected boolean');
  });

  it('reports every validation issue on malformed simulation requests', () => {
    const result = parseSimulationLaunchRequest({
      scenarioId: '',
      targetUrl: 'ftp://demo.local',
      triggerData: { expectWafBlocking: 'false' },
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.error.issues).toHaveLength(3);
  });

  it('accepts simulation overrides sent outside the triggerData envelope for backward compatibility', () => {
    const result = parseSimulationLaunchRequest({
      scenarioId: 'scenario-1',
      expectWafBlocking: false,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.triggerData?.expectWafBlocking).toBe(false);
  });

  it('rejects mixed legacy and nested simulation blocking overrides', () => {
    const result = parseSimulationLaunchRequest({
      scenarioId: 'scenario-1',
      expectWafBlocking: false,
      triggerData: { expectWafBlocking: true },
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.error.issues[0]?.message).toContain('not both');
    expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(
      expect.arrayContaining(['expectWafBlocking', 'triggerData.expectWafBlocking']),
    );
  });

  it('accepts a nested undefined simulation override alongside a defined top-level override', () => {
    const result = parseSimulationLaunchRequest({
      scenarioId: 'scenario-1',
      expectWafBlocking: true,
      triggerData: { expectWafBlocking: undefined },
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.triggerData?.expectWafBlocking).toBe(true);
  });

  it('accepts assessment launch requests with non-simulation triggerData payloads', () => {
    const result = parseAssessmentLaunchRequest({
      scenarioId: 'scenario-1',
      triggerData: { note: 'nested-compatible' },
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data).toEqual({
      scenarioId: 'scenario-1',
      triggerData: { note: 'nested-compatible' },
    });
  });

  it('rejects simulation-only blocking overrides in assessment launches', () => {
    const result = parseAssessmentLaunchRequest({
      scenarioId: 'scenario-1',
      triggerData: { expectWafBlocking: false },
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.error.issues[0]?.message).toContain('only supported for simulation');
  });

  it('rejects unknown top-level assessment launch keys', () => {
    const result = parseAssessmentLaunchRequest({
      scenarioId: 'scenario-1',
      note: 'legacy-compatible',
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.error.issues[0]?.code).toBe('unrecognized_keys');
  });

  it('rejects invalid target URLs at the request boundary', () => {
    const result = parseSimulationLaunchRequest({
      scenarioId: 'scenario-1',
      targetUrl: 'ftp://demo.local',
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.error.issues[0]?.message).toContain('http or https');
  });
});

describe('resolveArtifactPath', () => {
  let reportsDir: string;
  let escapeDir: string;
  const executionId = 'exec-abc';
  const stepId = 'load';

  beforeAll(() => {
    reportsDir = mkdtempSync(join(tmpdir(), 'crucible-artifact-tests-'));
    mkdirSync(join(reportsDir, executionId, stepId), { recursive: true });
    writeFileSync(
      join(reportsDir, executionId, stepId, 'summary.json'),
      JSON.stringify({ ok: true }),
    );
    writeFileSync(join(reportsDir, executionId, stepId, 'stdout.log'), 'ok\n');

    // Symlink that points at a file outside reportsDir to verify the realpath
    // guard rejects symlink-based escapes.
    escapeDir = mkdtempSync(join(tmpdir(), 'crucible-artifact-escape-'));
    writeFileSync(join(escapeDir, 'secret.log'), 'pretend secret\n');
    symlinkSync(
      join(escapeDir, 'secret.log'),
      join(reportsDir, executionId, stepId, 'evil.log'),
    );
  });

  afterAll(() => {
    rmSync(reportsDir, { recursive: true, force: true });
    rmSync(escapeDir, { recursive: true, force: true });
  });

  it('resolves a normal artifact under reportsDir', () => {
    const result = resolveArtifactPath(reportsDir, executionId, stepId, 'summary.json');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path).toBe(join(reportsDir, executionId, stepId, 'summary.json'));
    }
  });

  it('returns 404 when the artifact does not exist', () => {
    const result = resolveArtifactPath(reportsDir, executionId, stepId, 'missing.log');
    expect(result).toEqual({ ok: false, status: 404 });
  });

  it('strips path-traversal segments via basename', () => {
    // basename of '../../etc/passwd' is 'passwd' — which doesn't exist under
    // <reports>/<exec>/<step>/, so we end up with a 404 rather than a leak.
    const result = resolveArtifactPath(reportsDir, executionId, stepId, '../../etc/passwd');
    expect(result).toEqual({ ok: false, status: 404 });
  });

  it('rejects symlink-based escapes with 403', () => {
    const result = resolveArtifactPath(reportsDir, executionId, stepId, 'evil.log');
    expect(result).toEqual({ ok: false, status: 403 });
  });

  it('returns 400 when any path segment is empty after basename', () => {
    expect(resolveArtifactPath(reportsDir, '/', stepId, 'summary.json')).toEqual({
      ok: false,
      status: 400,
    });
    expect(resolveArtifactPath(reportsDir, executionId, '', 'summary.json')).toEqual({
      ok: false,
      status: 400,
    });
  });
});

describe('isArtifactExposable', () => {
  const baseStep = { stepId: 'load' };

  it('returns true for an assessment execution that owns the step', () => {
    expect(
      isArtifactExposable({ mode: 'assessment', steps: [baseStep] }, 'load'),
    ).toBe(true);
  });

  it('refuses simulation-mode executions even when the step exists', () => {
    expect(
      isArtifactExposable({ mode: 'simulation', steps: [baseStep] }, 'load'),
    ).toBe(false);
  });

  it('refuses missing executions', () => {
    expect(isArtifactExposable(undefined, 'load')).toBe(false);
  });

  it('refuses unknown step ids', () => {
    expect(
      isArtifactExposable({ mode: 'assessment', steps: [baseStep] }, 'other'),
    ).toBe(false);
  });
});

describe('artifactContentType', () => {
  it('maps known artifact extensions', () => {
    expect(artifactContentType('summary.json')).toBe('application/json; charset=utf-8');
    expect(artifactContentType('stdout.log')).toBe('text/plain; charset=utf-8');
    expect(artifactContentType('notes.txt')).toBe('text/plain; charset=utf-8');
  });

  it('falls back to application/octet-stream for unknown or extensionless files', () => {
    expect(artifactContentType('README')).toBe('application/octet-stream');
    expect(artifactContentType('weird.xyz')).toBe('application/octet-stream');
  });
});
