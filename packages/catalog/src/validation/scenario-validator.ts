import {
  type Scenario,
  type ScenarioStep,
  isScenarioHttpStep,
  isScenarioK6Step,
  isScenarioNucleiStep,
} from '../models/types.js';
import { resolveRule } from '../models/regulations.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a parsed scenario for structural correctness:
 * - Cycle detection in dependsOn graph
 * - Missing step references in dependsOn / when.step
 * - Template variables without matching extract rules
 */
export function validateScenario(scenario: Scenario): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const stepIds = new Set(scenario.steps.map((s) => s.id));

  // ── Regulatory reference detection ────────────────────────────────

  if (scenario.rule_ids) {
    for (const ruleId of scenario.rule_ids) {
      if (!resolveRule(ruleId)) {
        errors.push(`Scenario "${scenario.id}" references unknown regulation rule ID "${ruleId}"`);
      }
    }
  }

  // ── Missing reference detection ───────────────────────────────────

  for (const step of scenario.steps) {
    if (step.dependsOn) {
      for (const dep of step.dependsOn) {
        if (!stepIds.has(dep)) {
          errors.push(`Step "${step.id}" depends on unknown step "${dep}"`);
        }
      }
    }
    if (step.when && !stepIds.has(step.when.step)) {
      errors.push(`Step "${step.id}" has when condition referencing unknown step "${step.when.step}"`);
    }
  }

  // ── Cycle detection (Kahn's algorithm) ────────────────────────────

  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const step of scenario.steps) {
    inDegree.set(step.id, 0);
    adjacency.set(step.id, []);
  }

  for (const step of scenario.steps) {
    if (step.dependsOn) {
      for (const dep of step.dependsOn) {
        if (stepIds.has(dep)) {
          adjacency.get(dep)!.push(step.id);
          inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
        }
      }
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  let sorted = 0;
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted++;
    for (const neighbor of adjacency.get(node) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  if (sorted < scenario.steps.length) {
    const cycleSteps = [...inDegree.entries()]
      .filter(([, d]) => d > 0)
      .map(([id]) => id);
    errors.push(`Dependency cycle detected among steps: ${cycleSteps.join(', ')}`);
  }

  // ── Extract / template consistency ────────────────────────────────

  const extractedVars = new Set<string>();
  // Built-in variables the engine can resolve without an extract rule
  const builtinVars = new Set(['random', 'random_ip', 'timestamp', 'iteration']);

  for (const step of scenario.steps) {
    // Collect variables extracted by prior steps (order-dependent)
    if (isScenarioHttpStep(step) && step.extract) {
      for (const varName of Object.keys(step.extract)) {
        extractedVars.add(varName);
      }
    }

    // Scan for {{varName}} templates in url, headers, body
    const templates = collectTemplateVars(step);
    for (const varName of templates) {
      if (!extractedVars.has(varName) && !builtinVars.has(varName)) {
        warnings.push(
          `Step "${step.id}" uses template "{{${varName}}}" but no prior step extracts "${varName}"`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/** Collect all {{varName}} references from a step's request fields. */
function collectTemplateVars(step: ScenarioStep): Set<string> {
  const vars = new Set<string>();
  const templateRe = /\{\{(\w+)\}\}/g;

  const addTemplateVars = (value: unknown): void => {
    if (value == null) {
      return;
    }

    if (typeof value === 'string') {
      for (const m of value.matchAll(templateRe)) {
        vars.add(m[1]);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        addTemplateVars(item);
      }
      return;
    }

    if (typeof value === 'object') {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        addTemplateVars(nested);
      }
    }
  };

  if (isScenarioHttpStep(step)) {
    addTemplateVars(step.request.url);
    addTemplateVars(step.request.headers);
    addTemplateVars(step.request.body);
  } else if (isScenarioK6Step(step)) {
    addTemplateVars(step.runner.scriptRef);
    addTemplateVars(step.runner.args);
    addTemplateVars(step.runner.env);
    addTemplateVars(step.runner.thresholds);
  } else if (isScenarioNucleiStep(step)) {
    addTemplateVars(step.runner.templateRef);
    addTemplateVars(step.runner.workflowRef);
    addTemplateVars(step.runner.tags);
    addTemplateVars(step.runner.vars);
    addTemplateVars(step.runner.args);
  }

  return vars;
}
