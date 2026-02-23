import {
  RequestSchema,
  ExecutionConfigSchema,
  ExpectSchema,
  ExtractRuleSchema,
  ExtractSchema,
  WhenConditionSchema,
  ScenarioStepSchema,
  ScenarioSchema,
} from '../types.js';

function minimalStep(overrides: Record<string, unknown> = {}) {
  return {
    id: 'step-1',
    name: 'Send request',
    stage: 'attack',
    request: { method: 'GET', url: 'https://example.com' },
    ...overrides,
  };
}

function minimalScenario(overrides: Record<string, unknown> = {}) {
  return {
    id: 'scenario-1',
    name: 'Basic scenario',
    steps: [minimalStep()],
    ...overrides,
  };
}

describe('ScenarioSchema', () => {
  it('accepts a valid minimal scenario', () => {
    expect(ScenarioSchema.safeParse(minimalScenario()).success).toBe(true);
  });

  it('accepts a full scenario with all fields', () => {
    const full = minimalScenario({
      description: 'Full test',
      category: 'injection',
      difficulty: 'Advanced',
      version: 2,
      tags: ['sql'],
      rule_ids: ['rule-1'],
      target: 'https://target.local',
      sourceIp: '10.0.0.1',
      kind: 'exploit',
      steps: [
        {
          id: 's1',
          name: 'Probe',
          stage: 'recon',
          request: {
            method: 'POST',
            url: '/api',
            headers: { 'Content-Type': 'application/json' },
            body: '{"q":"test"}',
            params: { page: '1' },
          },
          execution: { delayMs: 500, retries: 3, jitter: 100, iterations: 5 },
          expect: { status: 200, blocked: false, bodyContains: 'ok', headerPresent: 'X-Id' },
          extract: { token: { from: 'body', path: 'data.token' } },
          dependsOn: [],
          when: { step: 'prev', succeeded: true },
        },
      ],
    });
    const result = ScenarioSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  it('rejects name shorter than 3 chars', () => {
    expect(ScenarioSchema.safeParse(minimalScenario({ name: 'AB' })).success).toBe(false);
  });

  it('rejects name longer than 255 chars', () => {
    expect(ScenarioSchema.safeParse(minimalScenario({ name: 'x'.repeat(256) })).success).toBe(false);
  });

  it('rejects invalid difficulty (Easy no longer valid)', () => {
    expect(ScenarioSchema.safeParse(minimalScenario({ difficulty: 'Easy' })).success).toBe(false);
  });

  it('preserves unknown fields via passthrough', () => {
    const result = ScenarioSchema.safeParse(minimalScenario({ customField: 42, phases: [] }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('customField', 42);
      expect(result.data).toHaveProperty('phases');
    }
  });
});

describe('RequestSchema', () => {
  it('rejects invalid HTTP method', () => {
    expect(RequestSchema.safeParse({ method: 'TRACE', url: '/' }).success).toBe(false);
  });

  it('accepts all valid HTTP methods', () => {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
      expect(RequestSchema.safeParse({ method, url: '/' }).success).toBe(true);
    }
  });

  it('accepts a string body', () => {
    const r = RequestSchema.safeParse({ method: 'POST', url: '/', body: 'raw' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.body).toBe('raw');
  });

  it('accepts an object body', () => {
    const r = RequestSchema.safeParse({ method: 'POST', url: '/', body: { key: 'val' } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.body).toEqual({ key: 'val' });
  });
});

describe('ExecutionConfigSchema', () => {
  it('rejects negative retries', () => {
    expect(ExecutionConfigSchema.safeParse({ retries: -1 }).success).toBe(false);
  });

  it('rejects iterations < 1', () => {
    expect(ExecutionConfigSchema.safeParse({ iterations: 0 }).success).toBe(false);
  });

  it('accepts empty object (all optional)', () => {
    expect(ExecutionConfigSchema.safeParse({}).success).toBe(true);
  });

  it('rejects negative jitter', () => {
    expect(ExecutionConfigSchema.safeParse({ jitter: -1 }).success).toBe(false);
  });
});

describe('ExtractRuleSchema', () => {
  it('rejects invalid from value', () => {
    expect(ExtractRuleSchema.safeParse({ from: 'cookie' }).success).toBe(false);
  });

  it('accepts body, header, and status', () => {
    for (const from of ['body', 'header', 'status']) {
      expect(ExtractRuleSchema.safeParse({ from }).success).toBe(true);
    }
  });
});

describe('ScenarioStepSchema', () => {
  it('accepts step without optional execution/expect/extract', () => {
    const r = ScenarioStepSchema.safeParse(minimalStep());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.execution).toBeUndefined();
      expect(r.data.expect).toBeUndefined();
      expect(r.data.extract).toBeUndefined();
    }
  });
});

describe('WhenConditionSchema', () => {
  it('requires step field', () => {
    expect(WhenConditionSchema.safeParse({ succeeded: true }).success).toBe(false);
  });

  it('accepts step with optional succeeded and status', () => {
    expect(WhenConditionSchema.safeParse({ step: 's1', succeeded: false, status: 403 }).success).toBe(true);
  });
});
