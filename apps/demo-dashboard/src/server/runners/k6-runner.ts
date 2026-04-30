import { spawn as defaultSpawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, isAbsolute, join, resolve as resolvePath } from 'node:path';
import type { ScenarioK6Step } from '@crucible/catalog';
import type { RunnerSummary } from '../../shared/types.js';

// Soft cap for stdout/stderr buffering; commit 4 tightens this with a
// truncation flag on the summary. The cap is high enough that normal k6
// human-readable summaries (~5–20 KiB) fit comfortably.
const STDOUT_SOFT_CAP_BYTES = 1024 * 1024;

export type SpawnFn = (
  command: string,
  args: ReadonlyArray<string>,
  options: { env?: NodeJS.ProcessEnv; signal?: AbortSignal },
) => ChildProcess;

export interface K6RunnerConfig {
  /** Absolute filesystem root under which scriptRef must resolve. */
  scriptsDir: string;
  /** Override spawn for tests. Defaults to node:child_process spawn. */
  spawn?: SpawnFn;
  /** Override binary name. Defaults to 'k6'. */
  binary?: string;
}

export interface K6ExecuteInput {
  step: ScenarioK6Step;
  targetUrl: string;
  signal?: AbortSignal;
}

export class K6ScriptResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'K6ScriptResolutionError';
  }
}

export class K6Runner {
  private readonly scriptsDir: string;
  private readonly spawn: SpawnFn;
  private readonly binary: string;

  constructor(config: K6RunnerConfig) {
    if (!isAbsolute(config.scriptsDir)) {
      throw new Error(
        `K6Runner scriptsDir must be absolute, got "${config.scriptsDir}"`,
      );
    }
    if (!existsSync(config.scriptsDir)) {
      throw new Error(
        `K6Runner scriptsDir does not exist: ${config.scriptsDir}`,
      );
    }
    this.scriptsDir = realpathSync(config.scriptsDir);
    this.spawn = config.spawn ?? defaultSpawn;
    this.binary = config.binary ?? 'k6';
  }

  async execute(input: K6ExecuteInput): Promise<RunnerSummary> {
    const scriptPath = this.resolveScriptRef(input.step.runner.scriptRef);

    // Inject TARGET_URL so curated scripts can read it via __ENV.TARGET_URL.
    // This is the v0 SSRF mitigation — k6 issues HTTP itself, bypassing the
    // engine's outbound allowlist, so curated scripts must rely on this env
    // rather than hardcoding a host.
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...input.step.runner.env,
      TARGET_URL: input.targetUrl,
    };

    const summaryDir = mkdtempSync(join(tmpdir(), 'crucible-k6-'));
    const summaryPath = join(summaryDir, 'summary.json');
    try {
      const args = [
        'run',
        `--summary-export=${summaryPath}`,
        ...(input.step.runner.args ?? []),
        scriptPath,
      ];

      const { exitCode, stdout } = await this.runChild(args, env, input.signal);
      const metrics = readSummaryMetrics(summaryPath);

      return {
        type: 'k6',
        exitCode,
        targetUrl: input.targetUrl,
        summary: stdout.length > 0 ? stdout : undefined,
        metrics,
      };
    } finally {
      rmSync(summaryDir, { recursive: true, force: true });
    }
  }

  private resolveScriptRef(scriptRef: string): string {
    if (isAbsolute(scriptRef)) {
      throw new K6ScriptResolutionError(
        `k6 scriptRef must be relative to the scripts dir, got absolute path "${scriptRef}"`,
      );
    }
    if (extname(scriptRef) !== '.js') {
      throw new K6ScriptResolutionError(
        `k6 scriptRef must have .js extension, got "${scriptRef}"`,
      );
    }
    const resolved = resolvePath(this.scriptsDir, scriptRef);
    if (!existsSync(resolved)) {
      throw new K6ScriptResolutionError(
        `k6 script "${scriptRef}" not found under ${this.scriptsDir}`,
      );
    }
    // realpath defeats symlink-based traversal that plain startsWith misses.
    const real = realpathSync(resolved);
    const rootWithSep = this.scriptsDir.endsWith('/')
      ? this.scriptsDir
      : `${this.scriptsDir}/`;
    if (real !== this.scriptsDir && !real.startsWith(rootWithSep)) {
      throw new K6ScriptResolutionError(
        `k6 scriptRef "${scriptRef}" resolves outside scripts dir (${real})`,
      );
    }
    return real;
  }

  private runChild(
    args: ReadonlyArray<string>,
    env: NodeJS.ProcessEnv,
    signal: AbortSignal | undefined,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolveExit, reject) => {
      let child: ChildProcess;
      try {
        child = this.spawn(this.binary, args, { env, signal });
      } catch (err) {
        reject(err);
        return;
      }

      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk: Buffer | string) => {
        if (stdout.length >= STDOUT_SOFT_CAP_BYTES) return;
        stdout += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      });
      child.stderr?.on('data', (chunk: Buffer | string) => {
        if (stderr.length >= STDOUT_SOFT_CAP_BYTES) return;
        stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      });

      child.once('error', (err) => reject(err));
      child.once('exit', (code, signalName) => {
        const exitCode = signalName ? -1 : (code ?? -1);
        resolveExit({ exitCode, stdout, stderr });
      });
    });
  }
}

interface K6SummaryMetricEntry {
  values?: Record<string, number>;
  thresholds?: Record<string, { ok: boolean }>;
}

interface K6SummaryShape {
  metrics?: Record<string, K6SummaryMetricEntry>;
}

/**
 * Parse k6's `--summary-export` JSON into the runner-summary metrics shape.
 * Returns undefined when the file is missing or malformed — k6 may exit
 * before producing the summary on script errors, and we don't want to fail
 * the whole step if the only issue is the metric serialization.
 */
function readSummaryMetrics(summaryPath: string): RunnerSummary['metrics'] | undefined {
  let raw: K6SummaryShape;
  try {
    raw = JSON.parse(readFileSync(summaryPath, 'utf8')) as K6SummaryShape;
  } catch {
    return undefined;
  }

  const metrics: NonNullable<RunnerSummary['metrics']> = {};
  const m = raw.metrics ?? {};

  const requests = m.http_reqs?.values?.count;
  if (typeof requests === 'number') metrics.requests = requests;

  const iterations = m.iterations?.values?.count;
  if (typeof iterations === 'number') metrics.iterations = iterations;

  const p95 = m.http_req_duration?.values?.['p(95)'];
  if (typeof p95 === 'number') metrics.httpReqDurationP95Ms = p95;

  const passes = m.checks?.values?.passes;
  if (typeof passes === 'number') metrics.checksPassed = passes;

  const fails = m.checks?.values?.fails;
  if (typeof fails === 'number') metrics.checksFailed = fails;

  let thresholdsPassed = 0;
  let thresholdsFailed = 0;
  for (const metric of Object.values(m)) {
    for (const t of Object.values(metric.thresholds ?? {})) {
      if (t.ok) thresholdsPassed++;
      else thresholdsFailed++;
    }
  }
  if (thresholdsPassed > 0 || thresholdsFailed > 0) {
    metrics.thresholdsPassed = thresholdsPassed;
    metrics.thresholdsFailed = thresholdsFailed;
  }

  return Object.keys(metrics).length > 0 ? metrics : undefined;
}
