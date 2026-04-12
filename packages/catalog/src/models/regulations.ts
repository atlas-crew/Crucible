/**
 * Central registry for regulatory frameworks and their control mappings.
 * Maps technical rule IDs to human-readable regulatory citations.
 */

export interface RegulationControl {
  /** The human-readable ID (e.g., '164.312(a)(1)') */
  id: string;
  /** Short title of the control */
  title: string;
  /** Detailed description of the requirement */
  description?: string;
}

export interface RegulationFramework {
  /** Framework name (e.g., 'HIPAA') */
  name: string;
  /** Framework version or section */
  version?: string;
  /** Map of machine-safe control keys to their definitions */
  controls: Record<string, RegulationControl>;
}

/**
 * Resolved rule information including its parent framework.
 */
export interface ResolvedRule extends RegulationControl {
  /** The name of the framework this rule belongs to */
  framework: string;
}

export const RegulationRegistry = {
  HIPAA: {
    name: 'HIPAA',
    version: 'Technical Safeguards (164.312)',
    controls: {
      '164.312-a-1': {
        id: '164.312(a)(1)',
        title: 'Access Control',
        description: 'Implement technical policies and procedures for electronic information systems that maintain ePHI to allow access only to those persons or software programs that have been granted access rights.',
      },
      '164.312-c-1': {
        id: '164.312(c)(1)',
        title: 'Integrity',
        description: 'Implement policies and procedures to protect ePHI from improper alteration or destruction.',
      },
      '164.312-e-1': {
        id: '164.312(e)(1)',
        title: 'Transmission Security',
        description: 'Implement technical security measures to guard against unauthorized access to ePHI that is being transmitted over an electronic communications network.',
      },
      '164.312-b': {
        id: '164.312(b)',
        title: 'Audit Controls',
        description: 'Implement hardware, software, and/or procedural mechanisms that record and examine activity in information systems that contain or use ePHI.',
      },
    },
  },
  'PCI-DSS': {
    name: 'PCI DSS',
    version: '4.0',
    controls: {
      '3.5.1': {
        id: '3.5.1',
        title: 'Restrict Access to Stored PAN',
        description: 'Restrict access to stored primary account number (PAN) to only those with a legitimate business need.',
      },
      '4.2.1': {
        id: '4.2.1',
        title: 'Strong Cryptography for PAN Transmission',
        description: 'Primary account number (PAN) is confirmed to be unreadable or even better, encrypted using strong cryptography whenever it is transmitted.',
      },
      '11.3.1': {
        id: '11.3.1',
        title: 'Vulnerability Scanning',
        description: 'Establish a process to identify and report security vulnerabilities.',
      },
    },
  },
  'SOC2': {
    name: 'SOC 2',
    version: 'Trust Services Criteria 2017',
    controls: {
      'CC6.1': {
        id: 'CC6.1',
        title: 'Logical Access to Assets',
        description: 'The entity restricts logical access to relevant, authorized software, and other assets to the appropriate users and software.',
      },
      'CC7.1': {
        id: 'CC7.1',
        title: 'System Operations: Monitoring and Detection',
        description: 'The entity properly monitors system operations to help ensure that it can detect any potential security events.',
      },
      'CC8.1': {
        id: 'CC8.1',
        title: 'Change Management',
        description: 'The entity authorizes, designs, develops or acquires, configures, documents, tests, approves, and implements changes to infrastructure, data, software, and procedures to meet its objectives.',
      },
    },
  },
  'PRIVACY': {
    name: 'Privacy',
    version: 'GDPR / CCPA',
    controls: {
      'GDPR-ART-17': {
        id: 'GDPR-Art-17',
        title: 'Right to Erasure (Forget Me)',
        description: 'The data subject shall have the right to obtain from the controller the erasure of personal data concerning him or her without undue delay.',
      },
      'GDPR-ART-21': {
        id: 'GDPR-Art-21',
        title: 'Right to Object (Consent)',
        description: 'The data subject shall have the right to object, on grounds relating to his or her particular situation, at any time to processing of personal data concerning him or her.',
      },
    },
  },
  'OWASP-LLM': {
    name: 'OWASP Top 10 for LLM',
    version: '1.1',
    controls: {
      'LLM01': {
        id: 'LLM01',
        title: 'Prompt Injection',
        description: 'Direct or indirect manipulation of LLM input to execute unauthorized actions or bypass safety filters.',
      },
      'LLM02': {
        id: 'LLM02',
        title: 'Insecure Output Handling',
        description: 'Failure to validate or sanitize LLM outputs before passing them to downstream systems.',
      },
      'LLM06': {
        id: 'LLM06',
        title: 'Sensitive Information Disclosure',
        description: 'Revealing sensitive data, PII, or proprietary information through LLM responses.',
      },
      'LLM07': {
        id: 'LLM07',
        title: 'Insecure Plugin Design',
        description: 'LLM plugins having insecure inputs or insufficient access controls.',
      },
    },
  },
} as const satisfies Record<string, RegulationFramework>;

/**
 * Helper to resolve a rule key to its regulatory information.
 *
 * @param ruleKey - The machine-safe key used in the registry (e.g., '164.312-a-1').
 *                  Note: This is NOT the human-readable display ID.
 */
export function resolveRule(ruleKey: string): ResolvedRule | null {
  for (const [frameworkKey, framework] of Object.entries(RegulationRegistry)) {
    const control = (framework.controls as Record<string, RegulationControl>)[ruleKey];
    if (control) {
      return {
        framework: frameworkKey,
        ...control,
      };
    }
  }
  return null;
}
