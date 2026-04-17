import { describe, expect, it } from 'vitest';
import { parseAssessmentLaunchRequest, parseSimulationLaunchRequest } from '../server/backend.js';

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
