/**
 * Adapters module - transforms scenarios to different output formats
 */

export {
  parseFrontmatter,
  parseSteps,
  parseRunbook,
  extractTitle,
  slugify as runbookSlugify,
  generateRunbookId,
} from './runbook-parser.js';
