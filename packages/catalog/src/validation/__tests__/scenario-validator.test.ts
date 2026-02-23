import { validateScenario } from '../scenario-validator.js';

function step(overrides: Record<string, unknown> = {}) {
  return {
    id: 'step-1',
    name: 'Default Step',
    stage: 'main',
    request: { method: 'GET', url: 'https://api.example.com/health' },
    ...overrides,
  };
}

function scenario(overrides: Record<string, unknown> = {}) {
  return {
    id: 'scenario-1',
    name: 'Test Scenario',
    steps: [step()],
    ...overrides,
  } as any;
}

describe('validateScenario', () => {
  describe('valid scenarios', () => {
    it('returns valid for a single-step scenario', () => {
      const result = validateScenario(scenario());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('returns valid for multi-step with correct dependsOn', () => {
      const result = validateScenario(
        scenario({
          steps: [
            step({ id: 'login' }),
            step({ id: 'fetch', dependsOn: ['login'] }),
          ],
        }),
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('missing references', () => {
    it('errors when dependsOn references nonexistent step', () => {
      const result = validateScenario(
        scenario({ steps: [step({ id: 'a', dependsOn: ['nonexistent'] })] }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('nonexistent'))).toBe(true);
    });

    it('errors when when.step references nonexistent step', () => {
      const result = validateScenario(
        scenario({ steps: [step({ id: 'a', when: { step: 'ghost', succeeded: true } })] }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('ghost'))).toBe(true);
    });
  });

  describe('cycle detection', () => {
    it('detects a two-node cycle', () => {
      const result = validateScenario(
        scenario({
          steps: [
            step({ id: 'a', dependsOn: ['b'] }),
            step({ id: 'b', dependsOn: ['a'] }),
          ],
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => /cycle/i.test(e))).toBe(true);
    });

    it('detects a three-node cycle', () => {
      const result = validateScenario(
        scenario({
          steps: [
            step({ id: 'x', dependsOn: ['z'] }),
            step({ id: 'y', dependsOn: ['x'] }),
            step({ id: 'z', dependsOn: ['y'] }),
          ],
        }),
      );
      expect(result.valid).toBe(false);
      const cycleError = result.errors.find((e: string) => /cycle/i.test(e));
      expect(cycleError).toBeDefined();
      expect(cycleError).toMatch(/x/);
      expect(cycleError).toMatch(/y/);
      expect(cycleError).toMatch(/z/);
    });
  });

  describe('template warnings', () => {
    it('warns for unresolved template variable', () => {
      const result = validateScenario(
        scenario({
          steps: [
            step({
              id: 'call',
              request: { method: 'GET', url: '/users/{{userId}}' },
            }),
          ],
        }),
      );
      expect(result.valid).toBe(true); // warnings don't invalidate
      expect(result.warnings.some((w: string) => w.includes('userId'))).toBe(true);
    });

    it('warns for template in headers', () => {
      const result = validateScenario(
        scenario({
          steps: [
            step({
              id: 'call',
              request: { method: 'GET', url: '/health', headers: { Authorization: 'Bearer {{accessToken}}' } },
            }),
          ],
        }),
      );
      expect(result.warnings.some((w: string) => w.includes('accessToken'))).toBe(true);
    });

    it('does not warn for built-in variables', () => {
      const result = validateScenario(
        scenario({
          steps: [
            step({
              id: 'call',
              request: {
                method: 'POST',
                url: '/test/{{random}}',
                headers: { 'X-Id': '{{timestamp}}' },
                body: '{"ip":"{{random_ip}}","i":"{{iteration}}"}',
              },
            }),
          ],
        }),
      );
      expect(result.warnings).toEqual([]);
    });

    it('does not warn when prior step extracts the variable', () => {
      const result = validateScenario(
        scenario({
          steps: [
            step({ id: 'login', extract: { authToken: { from: 'body', path: 'token' } } }),
            step({
              id: 'call',
              dependsOn: ['login'],
              request: { method: 'GET', url: '/me', headers: { Authorization: 'Bearer {{authToken}}' } },
            }),
          ],
        }),
      );
      expect(result.warnings).toEqual([]);
    });
  });

  describe('combined errors and warnings', () => {
    it('reports multiple errors and warnings together', () => {
      const result = validateScenario(
        scenario({
          steps: [
            step({ id: 'a', dependsOn: ['missing'], request: { method: 'GET', url: '/{{unresolved}}' } }),
            step({ id: 'b', when: { step: 'phantom', succeeded: true } }),
          ],
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    });
  });
});
