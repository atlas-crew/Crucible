import { z } from 'zod';

/**
 * Runbook category enum
 */
export const RunbookCategoryEnum = z.enum([
  'gauntlet',
  'orchestrator',
  'catalog-api',
  'platform',
  'general',
]);

export type RunbookCategory = z.infer<typeof RunbookCategoryEnum>;

/**
 * Runbook difficulty enum
 */
export const RunbookDifficultyEnum = z.enum([
  'beginner',
  'intermediate',
  'advanced',
]);

export type RunbookDifficulty = z.infer<typeof RunbookDifficultyEnum>;

/**
 * Runbook frontmatter schema (YAML at the top of markdown files)
 */
export const RunbookFrontmatterSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  category: RunbookCategoryEnum.optional().default('general'),
  pages: z.array(z.string()).optional(),
  estimatedTime: z.string().optional(),
  difficulty: RunbookDifficultyEnum.optional().default('intermediate'),
  version: z.string().optional(),
  lastUpdated: z.string().optional(),
  tags: z.array(z.string()).optional(),
  layout: z.string().optional(),
  permalink: z.string().optional(),
  nav_order: z.number().optional(),
});

export type RunbookFrontmatter = z.infer<typeof RunbookFrontmatterSchema>;

/**
 * Runbook substep (checkbox item)
 */
export const RunbookSubstepSchema = z.object({
  id: z.string(),
  text: z.string(),
  order: z.number(),
  checked: z.boolean().default(false),
});

export type RunbookSubstep = z.infer<typeof RunbookSubstepSchema>;

/**
 * Runbook step (main section)
 */
export const RunbookStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  phase: z.string().optional(),
  order: z.number(),
  substeps: z.array(RunbookSubstepSchema).optional(),
});

export type RunbookStep = z.infer<typeof RunbookStepSchema>;

/**
 * Complete runbook model
 */
export const RunbookSchema = z.object({
  id: z.string(),
  slug: z.string(),
  meta: RunbookFrontmatterSchema,
  steps: z.array(RunbookStepSchema),
  rawContent: z.string(),
  filePath: z.string(),
  loadedAt: z.date(),
});

export type Runbook = z.infer<typeof RunbookSchema>;

/**
 * Runbook list item (summary without full content)
 */
export const RunbookSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().optional(),
  category: RunbookCategoryEnum,
  difficulty: RunbookDifficultyEnum,
  estimatedTime: z.string().optional(),
  stepCount: z.number(),
  tags: z.array(z.string()).optional(),
});

export type RunbookSummary = z.infer<typeof RunbookSummarySchema>;

/**
 * Search runbooks query schema
 */
export const SearchRunbooksSchema = z.object({
  q: z.string().optional(),
  category: RunbookCategoryEnum.optional(),
  difficulty: RunbookDifficultyEnum.optional(),
  tags: z.array(z.string()).optional(),
});

export type SearchRunbooksQuery = z.infer<typeof SearchRunbooksSchema>;
