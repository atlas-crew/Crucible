import type { CrucibleClient, ScenarioExecution } from '@atlascrew/crucible-client';
import { renderTable, formatDuration } from '../format.js';
import { readFlag } from '../parse.js';
import type { GlobalOptions } from '../parse.js';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const DEFAULT_FAIL_BELOW = 80;
const DEFAULT_POLL_INTERVAL = 2;

interface AssessOptions {
  scenarioIds: string[];
  failBelow: number;
  pollInterval: number;
}

interface AssessScenarioResult {
  scenarioId: string;
  executionId: string;
  status: string;
  score: number | null;
  meetsThreshold: boolean;
  failBelow: number;
  durationMs?: number;
  summary: string;
  error?: string;
  stepCount: number;
  failedStepCount: number;
}

interface AssessResult {
  command: 'assess';
  server: string;
  failBelow: number;
  scenarioCount: number;
  passed: boolean;
  exitCode: 0 | 1;
  results: AssessScenarioResult[];
}

export async function assessCommand(
  client: CrucibleClient,
  globals: GlobalOptions,
  args: string[],
): Promise<number> {
  let options: AssessOptions;
  try {
    options = parseAssessArgs(args);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.stderr.write(renderAssessHelp());
    return 1;
  }

  const results: AssessScenarioResult[] = [];

  for (const scenarioId of options.scenarioIds) {
    if (globals.format === 'table') {
      process.stderr.write(`Assessing ${scenarioId}...\n`);
    }

    const { executionId } = await client.assessments.start(scenarioId);
    const execution = await pollUntilDone(client, executionId, options.pollInterval);
    results.push(buildResult(execution, options.failBelow));
  }

  const passed = results.every((r) => r.meetsThreshold);
  const output: AssessResult = {
    command: 'assess',
    server: globals.server,
    failBelow: options.failBelow,
    scenarioCount: results.length,
    passed,
    exitCode: passed ? 0 : 1,
    results,
  };

  if (globals.format === 'json') {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    writeAssessTable(output);
  }

  return output.exitCode;
}

function parseAssessArgs(argv: string[]): AssessOptions {
  const scenarioIds: string[] = [];
  let failBelow = DEFAULT_FAIL_BELOW;
  let pollInterval = DEFAULT_POLL_INTERVAL;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--scenario' || arg.startsWith('--scenario=')) {
      const val = readFlag(arg, argv[i + 1], '--scenario');
      if (arg === '--scenario') i++;
      scenarioIds.push(...val.split(',').map((s) => s.trim()).filter(Boolean));
      continue;
    }

    if (arg === '--fail-below' || arg.startsWith('--fail-below=')) {
      const val = readFlag(arg, argv[i + 1], '--fail-below');
      if (arg === '--fail-below') i++;
      const parsed = Number(val);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        throw new Error('--fail-below must be a number between 0 and 100');
      }
      failBelow = parsed;
      continue;
    }

    if (arg === '--poll-interval' || arg.startsWith('--poll-interval=')) {
      const val = readFlag(arg, argv[i + 1], '--poll-interval');
      if (arg === '--poll-interval') i++;
      const parsed = Number(val);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error('--poll-interval must be a positive number of seconds');
      }
      pollInterval = parsed;
      continue;
    }

    if (!arg.startsWith('-')) {
      scenarioIds.push(...arg.split(',').map((s) => s.trim()).filter(Boolean));
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (scenarioIds.length === 0) {
    throw new Error('At least one scenario ID is required');
  }

  return { scenarioIds, failBelow, pollInterval };
}

async function pollUntilDone(
  client: CrucibleClient,
  executionId: string,
  intervalSec: number,
): Promise<ScenarioExecution> {
  const intervalMs = intervalSec * 1000;

  while (true) {
    const execution = await client.executions.get(executionId);
    if (TERMINAL_STATUSES.has(execution.status)) {
      return execution;
    }
    await sleep(intervalMs);
  }
}

function buildResult(execution: ScenarioExecution, failBelow: number): AssessScenarioResult {
  const score = execution.report?.score ?? null;
  const failedStepCount = execution.steps.filter((s) => s.status === 'failed').length;
  const meetsThreshold = execution.status === 'completed' && score !== null && score >= failBelow;

  return {
    scenarioId: execution.scenarioId,
    executionId: execution.id,
    status: execution.status,
    score,
    meetsThreshold,
    failBelow,
    durationMs: execution.duration,
    summary: execution.report?.summary ?? execution.error ?? 'No summary.',
    error: execution.error,
    stepCount: execution.steps.length,
    failedStepCount,
  };
}

function writeAssessTable(result: AssessResult): void {
  const rows = result.results.map((r) => ({
    Scenario: r.scenarioId,
    Status: r.status,
    Score: r.score === null ? 'n/a' : `${r.score}%`,
    Threshold: `${r.failBelow}%`,
    Verdict: r.meetsThreshold ? 'PASS' : 'FAIL',
    Duration: formatDuration(r.durationMs),
  }));

  process.stdout.write(renderTable(rows));
  process.stdout.write(
    `\nOverall: ${result.passed ? 'PASS' : 'FAIL'} (${result.results.filter((r) => r.meetsThreshold).length}/${result.results.length} met threshold)\n`,
  );
}

function renderAssessHelp(): string {
  return [
    '',
    'Usage: crucible-cli assess <scenario-id> [options]',
    '',
    'Options:',
    '  --scenario <id>          Scenario ID(s). Repeat or comma-separate.',
    '  --fail-below <score>     Exit non-zero if score below this. Default: 80.',
    '  --poll-interval <sec>    Polling interval in seconds. Default: 2.',
    '',
  ].join('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
