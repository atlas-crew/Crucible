import { spawn as defaultSpawn, type ChildProcess } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { extname, isAbsolute, resolve as resolvePath } from 'node:path';
import type { ScenarioK6Step } from '@crucible/catalog';
import type { RunnerSummary } from '../../shared/types.js';

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

    const args = ['run', ...(input.step.runner.args ?? []), scriptPath];

    const exitCode = await this.runChild(args, env, input.signal);

    return {
      type: 'k6',
      exitCode,
      targetUrl: input.targetUrl,
    };
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
  ): Promise<number> {
    return new Promise<number>((resolveExit, reject) => {
      let child: ChildProcess;
      try {
        child = this.spawn(this.binary, args, { env, signal });
      } catch (err) {
        reject(err);
        return;
      }
      child.once('error', (err) => reject(err));
      child.once('exit', (code, signalName) => {
        if (signalName) {
          // Killed by signal — convention matches archive adapter (-1).
          resolveExit(-1);
        } else {
          resolveExit(code ?? -1);
        }
      });
    });
  }
}
