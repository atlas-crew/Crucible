import type {
  CrucibleClient,
  ExecutionStepResult,
  RunnerSummary,
  ScenarioExecution,
} from '@atlascrew/crucible-client';
import { renderTable, formatDuration } from '../format.js';
import { readFlag, validateTargetUrlInput } from '../parse.js';
import type { GlobalOptions } from '../parse.js';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const DEFAULT_FAIL_BELOW = 80;
const DEFAULT_POLL_INTERVAL = 2;

interface AssessOptions {
  scenarioIds: string[];
  failBelow: number;
  pollInterval: number;
  targetUrl?: string;
}

interface AssessStepDetail {
  stepId: string;
  status: string;
  durationMs?: number;
  attempts: number;
  error?: string;
  runner?: RunnerSummary;
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
  steps: AssessStepDetail[];
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

    const { executionId } = await client.assessments.start(
      scenarioId,
      options.targetUrl !== undefined ? { targetUrl: options.targetUrl } : undefined,
    );
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
  let targetUrl: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--scenario' || arg.startsWith('--scenario=')) {
      const val = readFlag(arg, argv[i + 1], '--scenario');
      if (arg === '--scenario') i++;
      scenarioIds.push(...val.split(',').map((s) => s.trim()).filter(Boolean));
      continue;
    }

    if (arg === '--target' || arg === '-t' || arg.startsWith('--target=')) {
      const val = readFlag(arg, argv[i + 1], '--target');
      if (arg === '--target' || arg === '-t') i++;
      targetUrl = validateTargetUrlInput(val);
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

  return { scenarioIds, failBelow, pollInterval, targetUrl };
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
    steps: execution.steps.map(buildStepDetail),
  };
}

function buildStepDetail(step: ExecutionStepResult): AssessStepDetail {
  const detail: AssessStepDetail = {
    stepId: step.stepId,
    status: step.status,
    durationMs: step.duration,
    attempts: step.attempts,
  };
  if (step.error) detail.error = step.error;
  if (step.details?.runner) detail.runner = step.details.runner;
  return detail;
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

  const failedBlocks = result.results
    .map((r) => formatScenarioStepBlock(r, (s) => s.status === 'failed'))
    .filter((block) => block.length > 0);
  if (failedBlocks.length > 0) {
    process.stdout.write('\nFailed steps:\n');
    process.stdout.write(failedBlocks.join('\n'));
    process.stdout.write('\n');
  }

  // Passing runner steps go in their own block so CI can see metrics without
  // misreading the "Failed" header. Skipped when there are no runner steps
  // or when every runner step already showed up under "Failed".
  const passingRunnerBlocks = result.results
    .map((r) =>
      formatScenarioStepBlock(r, (s) => s.runner !== undefined && s.status !== 'failed'),
    )
    .filter((block) => block.length > 0);
  if (passingRunnerBlocks.length > 0) {
    process.stdout.write('\nRunner steps:\n');
    process.stdout.write(passingRunnerBlocks.join('\n'));
    process.stdout.write('\n');
  }
}

function formatScenarioStepBlock(
  scenario: AssessScenarioResult,
  predicate: (step: AssessStepDetail) => boolean,
): string {
  const interesting = scenario.steps.filter(predicate);
  if (interesting.length === 0) return '';

  return interesting
    .map((step) => {
      const lines = [
        `  ${scenario.scenarioId} / ${step.stepId} (${step.runner?.type ?? 'http'}) — ${step.status}`,
      ];
      if (step.error) lines.push(`    error: ${step.error}`);
      if (step.runner) {
        if (step.runner.exitCode !== undefined) {
          lines.push(`    exit code: ${step.runner.exitCode}`);
        }
        const m = step.runner.metrics;
        if (m) {
          const parts: string[] = [];
          if (m.requests !== undefined) parts.push(`requests=${m.requests}`);
          if (m.httpReqDurationP95Ms !== undefined) parts.push(`p95=${m.httpReqDurationP95Ms}ms`);
          if (m.thresholdsPassed !== undefined || m.thresholdsFailed !== undefined) {
            parts.push(`thresholds=${m.thresholdsPassed ?? 0}/${m.thresholdsFailed ?? 0}`);
          }
          if (m.checksPassed !== undefined || m.checksFailed !== undefined) {
            parts.push(`checks=${m.checksPassed ?? 0}/${m.checksFailed ?? 0}`);
          }
          if (parts.length > 0) lines.push(`    metrics: ${parts.join(', ')}`);
        }
        if (step.runner.findings) {
          lines.push(`    findings: ${step.runner.findings.total}`);
        }
        if (step.runner.artifacts && step.runner.artifacts.length > 0) {
          lines.push('    artifacts:');
          for (const url of step.runner.artifacts) {
            lines.push(`      ${url}`);
          }
        }
      }
      return lines.join('\n');
    })
    .join('\n');
}

function renderAssessHelp(): string {
  return [
    '',
    'Usage: crucible-cli assess <scenario-id> [options]',
    '',
    'Options:',
    '  --scenario <id>          Scenario ID(s). Repeat or comma-separate.',
    '  --target, -t <url>       Per-run target URL. Falls back to server default if omitted.',
    '  --fail-below <score>     Exit non-zero if score below this. Default: 80.',
    '  --poll-interval <sec>    Polling interval in seconds. Default: 2.',
    '',
  ].join('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
