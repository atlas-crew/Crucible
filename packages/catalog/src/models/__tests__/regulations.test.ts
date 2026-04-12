import { describe, it, expect } from 'vitest';
import { resolveRule, RegulationRegistry } from '../regulations.js';

describe('Regulations Registry', () => {
  describe('resolveRule', () => {
    it('should resolve a valid HIPAA rule key', () => {
      const result = resolveRule('164.312-a-1');
      expect(result).not.toBeNull();
      expect(result?.framework).toBe('HIPAA');
      expect(result?.id).toBe('164.312(a)(1)');
      expect(result?.title).toBe('Access Control');
    });

    it('should resolve a valid PCI-DSS rule key', () => {
      const result = resolveRule('3.5.1');
      expect(result).not.toBeNull();
      expect(result?.framework).toBe('PCI-DSS');
      expect(result?.title).toBe('Restrict Access to Stored PAN');
    });

    it('should return null for an invalid rule key', () => {
      const result = resolveRule('invalid-key');
      expect(result).toBeNull();
    });

    it('should be case-sensitive for keys', () => {
      const result = resolveRule('cc6.1'); // SOC2 uses uppercase 'CC6.1'
      expect(result).toBeNull();
    });
  });

  describe('Registry Integrity', () => {
    it('should have HIPAA framework defined', () => {
      expect(RegulationRegistry.HIPAA).toBeDefined();
      expect(RegulationRegistry.HIPAA.name).toBe('HIPAA');
    });

    it('should have SOC2 framework defined', () => {
      expect(RegulationRegistry.SOC2).toBeDefined();
      expect(RegulationRegistry.SOC2.name).toBe('SOC 2');
    });
  });
});
