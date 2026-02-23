import { randomUUID } from 'crypto';
import {
  RunbookFrontmatterSchema,
  type RunbookStep,
  type RunbookSubstep,
  type RunbookFrontmatter,
} from '../models/runbook-types.js';

/**
 * Parse YAML frontmatter from markdown content.
 * Frontmatter is delimited by --- at the start and end.
 */
export function parseFrontmatter(content: string): {
  frontmatter: RunbookFrontmatter;
  body: string;
} {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return {
      frontmatter: RunbookFrontmatterSchema.parse({
        title: 'Untitled Runbook',
      }),
      body: content,
    };
  }

  const yamlContent = match[1];
  const body = content.slice(match[0].length);

  const parsed: Record<string, unknown> = {};
  const lines = yamlContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    let value: unknown = trimmed.slice(colonIndex + 1).trim();

    if (value === '' || value === '[]') {
      const arrayItems: string[] = [];
      const startIdx = lines.indexOf(line);
      for (let i = startIdx + 1; i < lines.length; i++) {
        const nextLine = lines[i];
        if (nextLine.startsWith('  -') || nextLine.startsWith('- ')) {
          arrayItems.push(nextLine.replace(/^\s*-\s*/, '').trim());
        } else if (!nextLine.startsWith(' ') && nextLine.includes(':')) {
          break;
        }
      }
      if (arrayItems.length > 0) {
        value = arrayItems;
      } else {
        value = [];
      }
    } else if (typeof value === 'string') {
      let strValue: string = value;
      if (
        (strValue.startsWith('"') && strValue.endsWith('"')) ||
        (strValue.startsWith("'") && strValue.endsWith("'"))
      ) {
        strValue = strValue.slice(1, -1);
      }
      if (/^\d+$/.test(strValue)) {
        value = parseInt(strValue, 10);
      } else if (strValue === 'true') value = true;
      else if (strValue === 'false') value = false;
      else value = strValue;
    }

    parsed[key] = value;
  }

  if (!parsed.title) {
    parsed.title = 'Untitled Runbook';
  }

  const frontmatter = RunbookFrontmatterSchema.parse(parsed);

  return { frontmatter, body };
}

/**
 * Extract title from the first H1 heading in the body
 */
export function extractTitle(body: string): string | undefined {
  const h1Match = body.match(/^#\s+(.+)$/m);
  return h1Match ? h1Match[1].trim() : undefined;
}

/**
 * Slugify a string for use as an ID
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
}

/**
 * Parse substeps (checkbox items) from step content
 */
function parseSubsteps(content: string): RunbookSubstep[] {
  const substeps: RunbookSubstep[] = [];
  const checkboxRegex = /^[-*]\s*\[([ xX])\]\s+(.+)$/gm;
  let match;
  let order = 0;

  while ((match = checkboxRegex.exec(content)) !== null) {
    const checked = match[1].toLowerCase() === 'x';
    const text = match[2].trim();
    substeps.push({
      id: `substep-${slugify(text).slice(0, 30)}-${order}`,
      text,
      order,
      checked,
    });
    order++;
  }

  return substeps;
}

/**
 * Parse steps from markdown body.
 *
 * Steps are identified by:
 * - ## Phase N: [Phase Name] - groups subsequent steps
 * - ## or ### headings become steps
 * - Checkbox items within steps become substeps
 */
export function parseSteps(body: string): RunbookStep[] {
  const steps: RunbookStep[] = [];
  let currentPhase: string | undefined;

  const sections = body.split(/(?=^##\s)/m);

  for (const section of sections) {
    if (!section.trim()) continue;

    const phaseMatch = section.match(/^##\s+Phase\s+(\d+)[:\s]+(.+)$/im);
    if (phaseMatch) {
      currentPhase = `Phase ${phaseMatch[1]}: ${phaseMatch[2].trim()}`;
      continue;
    }

    const headingMatch = section.match(/^(#{2,3})\s+(.+)$/m);
    if (!headingMatch) continue;

    const title = headingMatch[2]
      .trim()
      .replace(/\{:.*?\}/g, '')
      .replace(/^\s*☑️?\s*/, '')
      .trim();

    if (title.toLowerCase().includes('table of contents') || title.toLowerCase() === 'toc') {
      continue;
    }

    const contentStart = section.indexOf('\n') + 1;
    const content = section.slice(contentStart).trim();

    const substeps = parseSubsteps(content);

    const step: RunbookStep = {
      id: `step-${slugify(title).slice(0, 40)}-${steps.length}`,
      title,
      content,
      phase: currentPhase,
      order: steps.length,
      substeps: substeps.length > 0 ? substeps : undefined,
    };

    steps.push(step);
  }

  return steps;
}

/**
 * Parse a complete runbook from markdown content
 */
export function parseRunbook(
  content: string,
  filePath: string,
): {
  meta: RunbookFrontmatter;
  steps: RunbookStep[];
  rawContent: string;
} {
  const { frontmatter, body } = parseFrontmatter(content);

  if (!frontmatter.title || frontmatter.title === 'Untitled Runbook') {
    const extractedTitle = extractTitle(body);
    if (extractedTitle) {
      frontmatter.title = extractedTitle;
    }
  }

  if (!frontmatter.id) {
    const filename = filePath.split('/').pop() || 'unknown';
    frontmatter.id = slugify(filename.replace(/\.md$/, ''));
  }

  const steps = parseSteps(body);

  return {
    meta: frontmatter,
    steps,
    rawContent: content,
  };
}

/**
 * Generate a unique runbook ID
 */
export function generateRunbookId(): string {
  return randomUUID();
}
