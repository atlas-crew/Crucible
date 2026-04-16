import { z } from 'zod';

// ── HTTP Request ────────────────────────────────────────────────────

export const RequestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  url: z.string(),
  headers: z.record(z.string()).optional(),
  body: z.union([z.string(), z.record(z.unknown()), z.array(z.unknown())]).optional(),
  params: z.record(z.string()).optional(),
});

export type Request = z.infer<typeof RequestSchema>;

// ── Execution Config ────────────────────────────────────────────────

export const ExecutionConfigSchema = z.object({
  delayMs: z.number().optional(),
  retries: z.number().int().min(0).optional(),
  jitter: z.number().min(0).optional(),
  iterations: z.number().int().min(1).optional(),
});

export type ExecutionConfig = z.infer<typeof ExecutionConfigSchema>;

// ── Assertions ──────────────────────────────────────────────────────

export const ExpectSchema = z.object({
  status: z.number().int().optional(),
  blocked: z.boolean().optional(),
  bodyContains: z.string().optional(),
  bodyNotContains: z.string().optional(),
  headerPresent: z.string().optional(),
  headerEquals: z.record(z.string()).optional(),
});

export type Expect = z.infer<typeof ExpectSchema>;

// ── Variable Extraction ─────────────────────────────────────────────

export const ExtractRuleSchema = z.object({
  from: z.enum(['body', 'header', 'status']),
  path: z.string().optional(),
});

export type ExtractRule = z.infer<typeof ExtractRuleSchema>;

export const ExtractSchema = z.record(ExtractRuleSchema);

export type Extract = z.infer<typeof ExtractSchema>;

// ── Conditional Execution ───────────────────────────────────────────

export const WhenConditionSchema = z.object({
  step: z.string(),
  succeeded: z.boolean().optional(),
  status: z.number().int().optional(),
});

export type WhenCondition = z.infer<typeof WhenConditionSchema>;

export const StepExecutionModeSchema = z.enum(['sequential', 'parallel']);

export type StepExecutionMode = z.infer<typeof StepExecutionModeSchema>;

export const ScenarioStepTypeSchema = z.enum(['http', 'k6', 'nuclei']);

export type ScenarioStepType = z.infer<typeof ScenarioStepTypeSchema>;

export const ScenarioRunnerTypeSchema = z.enum(['k6', 'nuclei']);

export type ScenarioRunnerType = z.infer<typeof ScenarioRunnerTypeSchema>;

export const RunnerExecutionModeSchema = z.enum(['native', 'docker']);

export type RunnerExecutionMode = z.infer<typeof RunnerExecutionModeSchema>;

export const RunnerFindingSeveritySchema = z.enum([
  'info',
  'low',
  'medium',
  'high',
  'critical',
  'unknown',
]);

export type RunnerFindingSeverity = z.infer<typeof RunnerFindingSeveritySchema>;

// ── Scenario Step ───────────────────────────────────────────────────

const ScenarioStepBaseSchema = z.object({
  // identity
  id: z.string(),
  name: z.string(),
  stage: z.string(),

  // flow control
  executionMode: StepExecutionModeSchema.optional(),
  parallelGroup: z.number().int().min(0).optional(),
  dependsOn: z.array(z.string()).optional(),
  when: WhenConditionSchema.optional(),
});

function validateParallelConfiguration(
  step: z.infer<typeof ScenarioStepBaseSchema>,
  ctx: z.RefinementCtx,
) {
  if (step.parallelGroup !== undefined && step.executionMode !== 'parallel') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['parallelGroup'],
      message: 'parallelGroup requires executionMode "parallel"',
    });
  }
}

export const ScenarioHttpStepSchema = ScenarioStepBaseSchema.extend({
  type: z.literal('http').optional(),

  // request
  request: RequestSchema,

  // execution config
  execution: ExecutionConfigSchema.optional(),

  // assertions
  expect: ExpectSchema.optional(),

  // variable extraction
  extract: ExtractSchema.optional(),
}).superRefine(validateParallelConfiguration);

// Runner steps intentionally do not define a dedicated target field.
// They inherit the effective execution target URL so TASK-63 remains the
// single launch-time target contract across HTTP and runner-backed steps.

export const K6StepRunnerSchema = z.object({
  scriptRef: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  mode: RunnerExecutionModeSchema.optional(),
  thresholds: z.record(z.string()).optional(),
});

export type K6StepRunner = z.infer<typeof K6StepRunnerSchema>;

export const ScenarioK6StepSchema = ScenarioStepBaseSchema.extend({
  type: z.literal('k6'),
  execution: ExecutionConfigSchema.optional(),
  runner: K6StepRunnerSchema,
}).superRefine(validateParallelConfiguration);

export const NucleiStepRunnerSchema = z.object({
  templateRef: z.string().min(1).optional(),
  workflowRef: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  severity: z.array(RunnerFindingSeveritySchema).optional(),
  vars: z.record(z.string()).optional(),
  args: z.array(z.string()).optional(),
}).superRefine((runner, ctx) => {
  if (!runner.templateRef && !runner.workflowRef) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['templateRef'],
      message: 'nuclei runner requires templateRef or workflowRef',
    });
  }
});

export type NucleiStepRunner = z.infer<typeof NucleiStepRunnerSchema>;

export const ScenarioNucleiStepSchema = ScenarioStepBaseSchema.extend({
  type: z.literal('nuclei'),
  execution: ExecutionConfigSchema.optional(),
  runner: NucleiStepRunnerSchema,
}).superRefine(validateParallelConfiguration);

export const ScenarioStepSchema = z.union([
  ScenarioHttpStepSchema,
  ScenarioK6StepSchema,
  ScenarioNucleiStepSchema,
]);

export type ScenarioHttpStep = z.infer<typeof ScenarioHttpStepSchema>;
export type ScenarioK6Step = z.infer<typeof ScenarioK6StepSchema>;
export type ScenarioNucleiStep = z.infer<typeof ScenarioNucleiStepSchema>;
export type ScenarioRunnerStep = ScenarioK6Step | ScenarioNucleiStep;
export type ScenarioStep = z.infer<typeof ScenarioStepSchema>;

export function getScenarioStepType(step: ScenarioStep): ScenarioStepType {
  switch (step.type) {
    case 'k6':
      return 'k6';
    case 'nuclei':
      return 'nuclei';
    case 'http':
    case undefined:
    default:
      return 'http';
  }
}

export function isScenarioHttpStep(step: ScenarioStep): step is ScenarioHttpStep {
  return step.type === undefined || step.type === 'http';
}

export function isScenarioK6Step(step: ScenarioStep): step is ScenarioK6Step {
  return step.type === 'k6';
}

export function isScenarioNucleiStep(step: ScenarioStep): step is ScenarioNucleiStep {
  return step.type === 'nuclei';
}

export function isScenarioRunnerStep(step: ScenarioStep): step is ScenarioRunnerStep {
  return isScenarioK6Step(step) || isScenarioNucleiStep(step);
}

// ── Scenario ────────────────────────────────────────────────────────

export const ScenarioSchema = z
  .object({
    id: z.string(),
    name: z.string().min(3).max(255),
    description: z.string().optional(),
    category: z.string().optional(),
    difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced', 'Expert']).optional(),
    steps: z.array(ScenarioStepSchema),
    version: z.number().optional(),
    tags: z.array(z.string()).optional(),
    rule_ids: z.array(z.string()).optional(),

    // Fields that exist in JSON files — previously stripped by Zod
    target: z.string().optional(),
    sourceIp: z.string().optional(),
    kind: z.string().optional(),
  })
  .passthrough();

export type Scenario = z.infer<typeof ScenarioSchema>;
