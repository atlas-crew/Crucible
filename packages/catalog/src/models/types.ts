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

// ── Scenario Step ───────────────────────────────────────────────────

export const ScenarioStepSchema = z.object({
  // identity
  id: z.string(),
  name: z.string(),
  stage: z.string(),

  // request
  request: RequestSchema,

  // execution config
  execution: ExecutionConfigSchema.optional(),

  // assertions
  expect: ExpectSchema.optional(),

  // variable extraction
  extract: ExtractSchema.optional(),

  // flow control
  dependsOn: z.array(z.string()).optional(),
  when: WhenConditionSchema.optional(),
});

export type ScenarioStep = z.infer<typeof ScenarioStepSchema>;

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
