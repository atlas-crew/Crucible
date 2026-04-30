import { spawn as defaultSpawn, spawnSync, type ChildProcess } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { extname, isAbsolute, join, relative as relativePath, resolve as resolvePath } from 'node:path';
import type { ScenarioK6Step } from '@crucible/catalog';
import type { RunnerSummary } from '../../shared/types.js';

const STDOUT_MAX_BYTES = 2 * 1024 * 1024;
const SUMMARY_MAX_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const KILL_GRACE_MS = 5_000;
const DEFAULT_DOCKER_IMAGE = 'grafana/k6:0.50.0';
const DEFAULT_DOCKER_NETWORK = 'host';

export type RunnerExecutionMode = 'native' | 'docker';

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
  /** Wall-clock timeout per execution in milliseconds. Defaults to 10 minutes. */
  timeoutMs?: number;
  /** Default execution mode when a step does not specify one. Defaults to 'native'. */
  defaultMode?: RunnerExecutionMode;
  /** Docker image to use in docker mode. Defaults to grafana/k6:0.50.0. */
  dockerImage?: string;
  /** Docker network argument. Defaults to 'host' so curated scripts can reach the engine target. */
  dockerNetwork?: string;
  /**
   * Probe used to verify the k6 binary is installed when native mode runs.
   * Defaults to spawnSync('k6', ['--version']) returning true on exit code 0.
   * Overridable for tests.
   */
  probeBinary?: () => boolean;
}

export interface K6ExecuteInput {
  step: ScenarioK6Step;
  targetUrl: string;
  /** Filesystem dir where the runner writes summary.json, stdout.log, stderr.log. Engine creates it. */
  artifactDir: string;
  /** URL prefix mapped to artifactDir. Runner returns artifacts as `${artifactUrlBase}/${file}`. */
  artifactUrlBase: string;
  signal?: AbortSignal;
}

export class K6ScriptResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'K6ScriptResolutionError';
  }
}

function defaultProbeK6Binary(): boolean {
  try {
    const result = spawnSync('k6', ['--version'], { stdio: 'ignore' });
    return result.status === 0;
  } catch {
    return false;
  }
}

export class K6Runner {
  private readonly scriptsDir: string;
  private readonly spawn: SpawnFn;
  private readonly binary: string;
  private readonly timeoutMs: number;
  private readonly defaultMode: RunnerExecutionMode;
  private readonly dockerImage: string;
  private readonly dockerNetwork: string;
  private readonly nativeAvailable: boolean;

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
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.defaultMode = config.defaultMode ?? 'native';
    this.dockerImage = config.dockerImage ?? DEFAULT_DOCKER_IMAGE;
    this.dockerNetwork = config.dockerNetwork ?? DEFAULT_DOCKER_NETWORK;
    const probe = config.probeBinary ?? defaultProbeK6Binary;
    // Cache the probe at construction. Native mode availability rarely changes
    // mid-process, and the alternative (probing per call) adds spawnSync cost
    // to every k6 step.
    this.nativeAvailable = probe();
  }

  async execute(input: K6ExecuteInput): Promise<RunnerSummary> {
    const mode: RunnerExecutionMode = input.step.runner.mode ?? this.defaultMode;

    if (mode === 'native' && !this.nativeAvailable) {
      throw new Error(
        'k6 binary not found on PATH. Install k6 (https://k6.io/docs/get-started/installation/) or set runner.mode to "docker".',
      );
    }

    const { absolute: scriptAbsolute, relative: scriptRelative } =
      this.resolveScriptRef(input.step.runner.scriptRef);

    mkdirSync(input.artifactDir, { recursive: true });
    const summaryPath = join(input.artifactDir, 'summary.json');
    const stdoutPath = join(input.artifactDir, 'stdout.log');
    const stderrPath = join(input.artifactDir, 'stderr.log');

    const stepEnv = { ...input.step.runner.env, TARGET_URL: input.targetUrl };

    let bin: string;
    let args: string[];
    let env: NodeJS.ProcessEnv;

    if (mode === 'docker') {
      bin = 'docker';
      const envFlags = Object.entries(stepEnv).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
      args = [
        'run', '--rm',
        '--network', this.dockerNetwork,
        '-v', `${this.scriptsDir}:/scripts:ro`,
        '-v', `${input.artifactDir}:/artifacts`,
        ...envFlags,
        this.dockerImage,
        'run',
        '--summary-export=/artifacts/summary.json',
        ...(input.step.runner.args ?? []),
        `/scripts/${scriptRelative}`,
      ];
      // Docker itself runs in process.env; container env is set via -e flags.
      env = process.env;
    } else {
      bin = this.binary;
      // Inject TARGET_URL so curated scripts can read it via __ENV.TARGET_URL.
      // This is the v0 SSRF mitigation — k6 issues HTTP itself, bypassing the
      // engine's outbound allowlist, so curated scripts must rely on this env
      // rather than hardcoding a host.
      env = { ...process.env, ...stepEnv };
      args = [
        'run',
        `--summary-export=${summaryPath}`,
        ...(input.step.runner.args ?? []),
        scriptAbsolute,
      ];
    }

    const { exitCode, stdout, stderr, stdoutTruncated } = await this.runChild(bin, args, env, input.signal);
    const metrics = readSummaryMetrics(summaryPath);

    // Persist captured streams so operators can pull them via the artifact
    // URL even when k6 itself didn't write a summary (script error, etc.).
    writeFileSync(stdoutPath, stdout, 'utf8');
    if (stderr.length > 0) {
      writeFileSync(stderrPath, stderr, 'utf8');
    }

    const artifacts: string[] = [];
    if (existsSync(summaryPath)) {
      artifacts.push(`${input.artifactUrlBase}/summary.json`);
    }
    artifacts.push(`${input.artifactUrlBase}/stdout.log`);
    if (stderr.length > 0) {
      artifacts.push(`${input.artifactUrlBase}/stderr.log`);
    }

    return {
      type: 'k6',
      exitCode,
      targetUrl: input.targetUrl,
      summary: stdout.length > 0 ? stdout : undefined,
      ...(stdoutTruncated ? { summaryTruncated: true } : {}),
      metrics,
      artifacts,
    };
  }

  private resolveScriptRef(scriptRef: string): { absolute: string; relative: string } {
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
    return { absolute: real, relative: relativePath(this.scriptsDir, real) };
  }

  private runChild(
    bin: string,
    args: ReadonlyArray<string>,
    env: NodeJS.ProcessEnv,
    signal: AbortSignal | undefined,
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    stdoutTruncated: boolean;
  }> {
    return new Promise((resolveExit, reject) => {
      let child: ChildProcess;
      try {
        child = this.spawn(bin, args, { env, signal });
      } catch (err) {
        reject(err);
        return;
      }

      let stdout = '';
      let stderr = '';
      let stdoutTruncated = false;
      const captureChunk = (
        target: 'stdout' | 'stderr',
        chunk: Buffer | string,
      ): void => {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        const current = target === 'stdout' ? stdout : stderr;
        if (current.length >= STDOUT_MAX_BYTES) {
          if (target === 'stdout') stdoutTruncated = true;
          return;
        }
        const remaining = STDOUT_MAX_BYTES - current.length;
        if (text.length <= remaining) {
          if (target === 'stdout') stdout += text;
          else stderr += text;
        } else {
          if (target === 'stdout') {
            stdout += text.slice(0, remaining);
            stdoutTruncated = true;
          } else {
            stderr += text.slice(0, remaining);
          }
        }
      };
      child.stdout?.on('data', (chunk) => captureChunk('stdout', chunk));
      child.stderr?.on('data', (chunk) => captureChunk('stderr', chunk));

      // Wall-clock timeout: SIGTERM, then SIGKILL after a grace period.
      let timedOut = false;
      let killTimer: NodeJS.Timeout | null = null;
      const timeoutTimer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill('SIGTERM');
        } catch {
          // child may already be dead; ignore
        }
        killTimer = setTimeout(() => {
          try {
            if (!child.killed) child.kill('SIGKILL');
          } catch {
            // ignore
          }
        }, KILL_GRACE_MS);
      }, this.timeoutMs);

      child.once('error', (err) => {
        clearTimeout(timeoutTimer);
        if (killTimer) clearTimeout(killTimer);
        reject(err);
      });
      child.once('exit', (code, signalName) => {
        clearTimeout(timeoutTimer);
        if (killTimer) clearTimeout(killTimer);
        if (timedOut) {
          reject(new Error(`k6 timeout exceeded after ${this.timeoutMs}ms`));
          return;
        }
        if (signal?.aborted) {
          reject(new Error('k6 step aborted'));
          return;
        }
        const exitCode = signalName ? -1 : (code ?? -1);
        resolveExit({ exitCode, stdout, stderr, stdoutTruncated });
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
  // Refuse to parse oversized summary files. The artifact is still on disk;
  // operators can inspect it directly. Keeps the runner from OOM'ing on a
  // pathological k6 export (e.g. a misconfigured handleSummary).
  let stat;
  try {
    stat = statSync(summaryPath);
  } catch {
    return undefined;
  }
  if (stat.size > SUMMARY_MAX_BYTES) {
    return undefined;
  }

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
