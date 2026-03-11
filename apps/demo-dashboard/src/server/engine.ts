import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';
import { CatalogService, ExecutionRepository } from '@crucible/catalog';
import type { Scenario, ScenarioStep } from '@crucible/catalog';
import type {
  ScenarioExecution,
  ExecutionStepResult,
  AssertionResult,
  PausedState,
} from '../shared/types.js';

// ── Per-execution control state ──────────────────────────────────────

interface ExecutionControl {
  abortController: AbortController;
  paused: boolean;
  pausePromise: Promise<void> | null;
  pauseResolve: (() => void) | null;
}

// ── Concurrency semaphore types ──────────────────────────────────────

interface QueuedWaiter {
  resolve: () => void;
}

type StepBodyRetentionPolicy = 'all' | 'failed-only' | 'none';

interface StepHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  bodyText: string;
  contentType: string;
}

// ── Constants ────────────────────────────────────────────────────────

const DEFAULT_TARGET_URL = 'http://localhost:8880';
const DEFAULT_MAX_CONCURRENCY = 3;
const CACHE_EVICT_DELAY_MS = 5_000;
const DEFAULT_STEP_BODY_RETENTION: StepBodyRetentionPolicy = 'all';
const DEFAULT_STEP_BODY_MAX_BYTES = 64 * 1024;

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export class ScenarioEngine extends EventEmitter {
  private catalog: CatalogService;
  private repo: ExecutionRepository | null;
  private executions: Map<string, ScenarioExecution>;
  private controls: Map<string, ExecutionControl> = new Map();

  // Target URL for scenario execution
  readonly targetUrl: string;

  // Concurrency semaphore
  private maxConcurrency: number;
  private activeCount = 0;
  private queue: QueuedWaiter[] = [];
  private stepBodyRetention: StepBodyRetentionPolicy;
  private stepBodyMaxBytes: number;

  constructor(catalog: CatalogService, repo?: ExecutionRepository) {
    super();
    this.catalog = catalog;
    this.repo = repo ?? null;
    this.executions = new Map();
    this.targetUrl = (process.env.CRUCIBLE_TARGET_URL ?? DEFAULT_TARGET_URL).replace(/\/+$/, '');
    this.maxConcurrency = parseInt(
      process.env.CRUCIBLE_MAX_CONCURRENCY ?? '',
      10,
    ) || DEFAULT_MAX_CONCURRENCY;
    this.stepBodyRetention = parseStepBodyRetention(process.env.CRUCIBLE_STEP_BODY_RETENTION);
    this.stepBodyMaxBytes = parsePositiveInteger(
      process.env.CRUCIBLE_STEP_BODY_MAX_BYTES,
      DEFAULT_STEP_BODY_MAX_BYTES,
    );
  }

  destroy(): void {
    // Reserved for future cleanup
  }

  // ── Concurrency semaphore ────────────────────────────────────────

  private acquireSlot(): Promise<void> {
    if (this.activeCount < this.maxConcurrency) {
      this.activeCount++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push({ resolve });
    });
  }

  private releaseSlot(): void {
    const next = this.queue.shift();
    if (next) {
      next.resolve();
    } else {
      this.activeCount--;
    }
  }

  // ── Cache eviction ──────────────────────────────────────────────

  /** Remove a terminal execution from the hot cache after a delay. */
  private scheduleEviction(id: string): void {
    setTimeout(() => {
      this.executions.delete(id);
      this.controls.delete(id);
    }, CACHE_EVICT_DELAY_MS);
  }

  // ── Start scenario ───────────────────────────────────────────────

  async startScenario(
    scenarioId: string,
    mode: 'simulation' | 'assessment' = 'simulation',
    triggerData?: Record<string, unknown>,
    parentExecutionId?: string,
  ): Promise<string> {
    const scenario = this.catalog.getScenario(scenarioId);
    if (!scenario) {
      throw new Error(`Scenario ${scenarioId} not found`);
    }

    const executionId = nanoid();
    const execution: ScenarioExecution = {
      id: executionId,
      scenarioId: scenario.id,
      mode,
      status: 'pending',
      startedAt: Date.now(),
      steps: [],
      triggerData: triggerData || {},
      context: {},
      ...(parentExecutionId ? { parentExecutionId } : {}),
    };

    this.executions.set(executionId, execution);
    this.repo?.insertExecution(execution);

    // Create control state for this execution
    this.controls.set(executionId, {
      abortController: new AbortController(),
      paused: false,
      pausePromise: null,
      pauseResolve: null,
    });

    this.executeScenario(execution, scenario).catch((err) => {
      console.error(`Execution ${executionId} failed:`, err);
      execution.status = 'failed';
      execution.error = err instanceof Error ? err.message : String(err);
      execution.completedAt = Date.now();
      this.repo?.updateExecution(executionId, {
        status: 'failed',
        error: execution.error,
        completedAt: execution.completedAt,
      });
      this.emit('execution:failed', execution);
      this.scheduleEviction(executionId);
    });

    return executionId;
  }

  // ── Main execution loop ──────────────────────────────────────────

  private async executeScenario(execution: ScenarioExecution, scenario: Scenario): Promise<void> {
    await this.acquireSlot();

    try {
      execution.status = 'running';
      this.repo?.updateExecution(execution.id, { status: 'running' });
      this.emit('execution:started', execution);

      const ctrl = this.controls.get(execution.id);

      const context = new Map<string, unknown>();
      const pendingSteps = new Set(scenario.steps.map((s) => s.id));
      const completedSteps = new Set<string>();
      const stepResults = new Map<string, ExecutionStepResult>();
      let passedSteps = 0;

      while (pendingSteps.size > 0) {
        // ── Cancel checkpoint ──────────────────────────────────────
        if (ctrl?.abortController.signal.aborted) {
          execution.status = 'cancelled';
          execution.completedAt = Date.now();
          this.repo?.updateExecution(execution.id, { status: 'cancelled', completedAt: execution.completedAt });
          this.emit('execution:cancelled', execution);
          this.scheduleEviction(execution.id);
          return;
        }

        // ── Pause checkpoint ───────────────────────────────────────
        if (ctrl?.paused) {
          execution.status = 'paused';
          execution.pausedState = {
            pendingStepIds: [...pendingSteps],
            completedStepIds: [...completedSteps],
            context: Object.fromEntries(context),
            passedSteps,
            stepResults: Object.fromEntries(
              [...stepResults.entries()].map(([k, v]) => [k, { ...v }]),
            ),
          };
          this.repo?.updateExecution(execution.id, { status: 'paused', pausedState: execution.pausedState });
          this.emit('execution:paused', execution);

          // Wait for resume signal
          if (ctrl.pausePromise) {
            await ctrl.pausePromise;
          }

          // After resume, check for cancel
          if (ctrl.abortController.signal.aborted) {
            execution.status = 'cancelled';
            execution.completedAt = Date.now();
            this.repo?.updateExecution(execution.id, { status: 'cancelled', completedAt: execution.completedAt });
            this.emit('execution:cancelled', execution);
            this.scheduleEviction(execution.id);
            return;
          }

          execution.status = 'running';
          execution.pausedState = undefined;
          this.repo?.updateExecution(execution.id, { status: 'running', pausedState: undefined });
          this.emit('execution:resumed', execution);
        }

        const executableSteps = scenario.steps.filter(
          (step) =>
            pendingSteps.has(step.id) &&
            (step.dependsOn || []).every((dep) => completedSteps.has(dep)),
        );

        if (executableSteps.length === 0) {
          throw new Error('Deadlock detected or invalid dependencies');
        }

        await Promise.all(
          executableSteps.map(async (step) => {
            pendingSteps.delete(step.id);

            // ── Evaluate `when` conditional ───────────────────────────
            if (step.when) {
              const refResult = stepResults.get(step.when.step);
              if (!this.evaluateWhen(step.when, refResult)) {
                const skipped: ExecutionStepResult = {
                  stepId: step.id,
                  status: 'skipped',
                  attempts: 0,
                };
                stepResults.set(step.id, skipped);
                execution.steps.push(skipped);
                completedSteps.add(step.id);
                this.repo?.upsertStep(execution.id, skipped);
                this.emit('execution:updated', execution);
                return;
              }
            }

            const result: ExecutionStepResult = {
              stepId: step.id,
              status: 'running',
              startedAt: Date.now(),
              attempts: 0,
            };
            stepResults.set(step.id, result);
            execution.steps.push(result);
            this.repo?.upsertStep(execution.id, result);
            this.emit('execution:updated', execution);

            const maxAttempts = (step.execution?.retries ?? 0) + 1;
            const signal = ctrl?.abortController.signal;
            let latestResponse: StepHttpResponse | undefined;

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              result.attempts = attempt;

              try {
                const response = await this.executeStep(step, context, signal);
                latestResponse = response;

                // ── Run extract rules ─────────────────────────────────
                if (step.extract) {
                  this.runExtract(step.extract, response, context);
                }

                // ── Evaluate assertions ───────────────────────────────
                const assertions = this.evaluateAssertions(step, response);
                if (assertions.length > 0) {
                  result.assertions = assertions;
                }

                const allPassed = assertions.every((a) => a.passed);

                if (!allPassed) {
                  const failedAssertions = assertions.filter((a) => !a.passed);
                  throw new Error(
                    `Assertion failed: ${failedAssertions.map((a) => `${a.field}: expected ${JSON.stringify(a.expected)}, got ${JSON.stringify(a.actual)}`).join('; ')}`,
                  );
                }

                result.status = 'completed';
                result.result = this.buildPersistedStepResult(response, 'completed');
                result.completedAt = Date.now();
                result.duration = result.completedAt - result.startedAt!;
                completedSteps.add(step.id);
                passedSteps++;
                this.repo?.upsertStep(execution.id, result);
                this.emit('execution:updated', execution);
                break; // success — no more retries
              } catch (err) {
                // If aborted, propagate immediately
                if (signal?.aborted) {
                  result.status = 'cancelled';
                  result.completedAt = Date.now();
                  completedSteps.add(step.id);
                  this.repo?.upsertStep(execution.id, result);
                  this.emit('execution:updated', execution);
                  return;
                }

                if (attempt >= maxAttempts) {
                  result.status = 'failed';
                  result.error = err instanceof Error ? err.message : String(err);
                  result.result = latestResponse
                    ? this.buildPersistedStepResult(latestResponse, 'failed')
                    : undefined;
                  result.completedAt = Date.now();
                  result.duration = result.completedAt - result.startedAt!;
                  completedSteps.add(step.id);
                  this.repo?.upsertStep(execution.id, result);
                  this.emit('execution:updated', execution);
                }
                // else: retry
              }
            }

            // Snapshot context into execution for observability
            execution.context = Object.fromEntries(context);
            this.repo?.updateExecution(execution.id, { context: execution.context });
          }),
        );
      }

      // Check one more time after all steps complete
      if (ctrl?.abortController.signal.aborted) {
        execution.status = 'cancelled';
        execution.completedAt = Date.now();
        this.repo?.updateExecution(execution.id, { status: 'cancelled', completedAt: execution.completedAt });
        this.emit('execution:cancelled', execution);
        this.scheduleEviction(execution.id);
        return;
      }

      execution.status = 'completed';
      execution.completedAt = Date.now();
      execution.duration = execution.completedAt - execution.startedAt!;

      if (execution.mode === 'assessment') {
        const totalSteps = scenario.steps.length;
        const score = Math.round((passedSteps / totalSteps) * 100);
        execution.report = {
          summary: `Executed ${totalSteps} steps. ${passedSteps} passed.`,
          passed: score >= 80,
          score,
          artifacts: [`/api/reports/${execution.id}.pdf`, `/api/reports/${execution.id}.json`],
        };
      }

      this.repo?.updateExecution(execution.id, {
        status: 'completed',
        completedAt: execution.completedAt,
        duration: execution.duration,
        report: execution.report,
      });
      this.emit('execution:completed', execution);
      this.scheduleEviction(execution.id);
    } finally {
      this.releaseSlot();
    }
  }

  /**
   * Execute a single step: apply delay + jitter, resolve templates, make request.
   * Returns a lightweight response object for assertions and extraction.
   */
  private async executeStep(
    step: ScenarioStep,
    context: Map<string, unknown>,
    signal?: AbortSignal,
  ): Promise<StepHttpResponse> {
    console.log(`Executing step ${step.id}: ${step.name}`);

    // ── Delay + jitter ──────────────────────────────────────────────
    const delayMs = step.execution?.delayMs ?? 0;
    const jitter = step.execution?.jitter ?? 0;
    const totalDelay = delayMs + (jitter > 0 ? Math.random() * jitter : 0);
    if (totalDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, totalDelay));
    }

    // ── Resolve templates ───────────────────────────────────────────
    const resolvedUrl = resolveTemplates(step.request.url, context, this.targetUrl);
    // Prepend target URL to relative paths
    const url = resolvedUrl.startsWith('/') ? `${this.targetUrl}${resolvedUrl}` : resolvedUrl;
    const headers: Record<string, string> = {};
    if (step.request.headers) {
      for (const [k, v] of Object.entries(step.request.headers)) {
        headers[k] = resolveTemplates(v, context, this.targetUrl);
      }
    }

    let rawBody: string | undefined;
    if (step.request.body !== undefined) {
      rawBody = typeof step.request.body === 'string'
        ? resolveTemplates(step.request.body, context, this.targetUrl)
        : resolveTemplates(JSON.stringify(step.request.body), context, this.targetUrl);
    }

    // ── Iterations ──────────────────────────────────────────────────
    const iterations = step.execution?.iterations ?? 1;
    let lastResponse: StepHttpResponse | undefined;

    for (let i = 0; i < iterations; i++) {
      try {
        const response = await fetch(url, {
          method: step.request.method,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
          body: rawBody,
          signal,
        });

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((v, k) => {
          responseHeaders[k] = v;
        });

        const contentType = response.headers.get('content-type') ?? '';
        const responseText = await response.text();
        let responseBody: unknown = responseText;
        if (contentType.includes('application/json')) {
          try {
            responseBody = responseText.length > 0 ? JSON.parse(responseText) : null;
          } catch {
            responseBody = responseText;
          }
        }

        lastResponse = {
          status: response.status,
          headers: responseHeaders,
          body: responseBody,
          bodyText: responseText,
          contentType,
        };

        console.log(`Step ${step.id} iteration ${i + 1}/${iterations}: ${response.status}`);
      } catch (err) {
        // Re-throw abort errors immediately
        if (signal?.aborted) throw err;
        console.error(`Step ${step.id} iteration ${i + 1} failed:`, err);
        if (i === iterations - 1 && !lastResponse) throw err;
      }
    }

    if (!lastResponse) {
      throw new Error(`Step ${step.id}: all iterations failed`);
    }

    return lastResponse;
  }

  private buildPersistedStepResult(
    response: StepHttpResponse,
    outcome: 'completed' | 'failed',
  ): ExecutionStepResult['result'] | undefined {
    if (this.stepBodyRetention === 'none') {
      return undefined;
    }
    if (this.stepBodyRetention === 'failed-only' && outcome !== 'failed') {
      return undefined;
    }

    const originalBytes = Buffer.byteLength(response.bodyText, 'utf8');
    const truncated = originalBytes > this.stepBodyMaxBytes;
    const bodyFormat = response.contentType.includes('application/json') && !truncated ? 'json' : 'text';
    const storedBody = truncated
      ? truncateUtf8(response.bodyText, this.stepBodyMaxBytes)
      : bodyFormat === 'json'
        ? response.body
        : response.bodyText;
    const storedBytes = Buffer.byteLength(
      typeof storedBody === 'string' ? storedBody : JSON.stringify(storedBody ?? ''),
      'utf8',
    );

    return {
      response: {
        status: response.status,
        headers: response.headers,
        body: storedBody,
      },
      retention: {
        policy: this.stepBodyRetention,
        truncated,
        contentType: response.contentType,
        originalBytes,
        storedBytes,
        bodyFormat,
      },
    };
  }

  /** Evaluate the `when` condition against a prior step's result. */
  private evaluateWhen(
    when: NonNullable<ScenarioStep['when']>,
    refResult: ExecutionStepResult | undefined,
  ): boolean {
    if (!refResult) return false;

    if (when.succeeded !== undefined) {
      const stepSucceeded = refResult.status === 'completed';
      if (stepSucceeded !== when.succeeded) return false;
    }

    if (when.status !== undefined && refResult.assertions) {
      const statusAssertion = refResult.assertions.find((a) => a.field === 'status');
      if (statusAssertion && statusAssertion.actual !== when.status) return false;
    }

    return true;
  }

  /** Run extract rules against a response and populate context. */
  private runExtract(
    extract: NonNullable<ScenarioStep['extract']>,
    response: { status: number; headers: Record<string, string>; body: unknown },
    context: Map<string, unknown>,
  ): void {
    for (const [varName, rule] of Object.entries(extract)) {
      let value: unknown;

      if (rule.from === 'status') {
        value = response.status;
      } else if (rule.from === 'header') {
        value = rule.path ? response.headers[rule.path.toLowerCase()] : response.headers;
      } else if (rule.from === 'body') {
        value = rule.path ? getJsonPath(response.body, rule.path) : response.body;
      }

      context.set(varName, value);
    }
  }

  /** Evaluate assertions from the step's `expect` block. */
  private evaluateAssertions(
    step: ScenarioStep,
    response: { status: number; headers: Record<string, string>; body: unknown },
  ): AssertionResult[] {
    const results: AssertionResult[] = [];
    const expect = step.expect;
    if (!expect) return results;

    if (expect.status !== undefined) {
      results.push({
        field: 'status',
        expected: expect.status,
        actual: response.status,
        passed: response.status === expect.status,
      });
    }

    if (expect.blocked !== undefined) {
      // A blocked request returns 403 or 429
      const isBlocked = response.status === 403 || response.status === 429;
      results.push({
        field: 'blocked',
        expected: expect.blocked,
        actual: isBlocked,
        passed: expect.blocked === isBlocked,
      });
    }

    const bodyStr = typeof response.body === 'string'
      ? response.body
      : JSON.stringify(response.body ?? '');

    if (expect.bodyContains !== undefined) {
      results.push({
        field: 'bodyContains',
        expected: expect.bodyContains,
        actual: bodyStr.includes(expect.bodyContains) ? expect.bodyContains : `(not found in body)`,
        passed: bodyStr.includes(expect.bodyContains),
      });
    }

    if (expect.bodyNotContains !== undefined) {
      results.push({
        field: 'bodyNotContains',
        expected: expect.bodyNotContains,
        actual: bodyStr.includes(expect.bodyNotContains) ? `(found in body)` : expect.bodyNotContains,
        passed: !bodyStr.includes(expect.bodyNotContains),
      });
    }

    if (expect.headerPresent !== undefined) {
      const present = expect.headerPresent.toLowerCase() in response.headers;
      results.push({
        field: 'headerPresent',
        expected: expect.headerPresent,
        actual: present ? expect.headerPresent : '(missing)',
        passed: present,
      });
    }

    if (expect.headerEquals !== undefined) {
      for (const [header, expectedValue] of Object.entries(expect.headerEquals)) {
        const actual = response.headers[header.toLowerCase()];
        results.push({
          field: `headerEquals.${header}`,
          expected: expectedValue,
          actual: actual ?? '(missing)',
          passed: actual === expectedValue,
        });
      }
    }

    return results;
  }

  // ── Execution control methods ────────────────────────────────────

  pauseExecution(id: string): boolean {
    const execution = this.executions.get(id);
    const ctrl = this.controls.get(id);
    if (!execution || !ctrl || execution.status !== 'running') return false;

    ctrl.paused = true;
    ctrl.pausePromise = new Promise<void>((resolve) => {
      ctrl.pauseResolve = resolve;
    });
    return true;
  }

  resumeExecution(id: string): boolean {
    const execution = this.executions.get(id);
    const ctrl = this.controls.get(id);
    if (!execution || !ctrl || execution.status !== 'paused') return false;

    ctrl.paused = false;
    if (ctrl.pauseResolve) {
      ctrl.pauseResolve();
      ctrl.pauseResolve = null;
      ctrl.pausePromise = null;
    }
    return true;
  }

  cancelExecution(id: string): boolean {
    const execution = this.executions.get(id);
    const ctrl = this.controls.get(id);
    if (!execution || !ctrl) return false;

    const activeStatuses = new Set(['running', 'pending', 'paused']);
    if (!activeStatuses.has(execution.status)) return false;

    // If paused, unblock the loop first so it can hit the cancel checkpoint
    if (ctrl.paused) {
      ctrl.paused = false;
      if (ctrl.pauseResolve) {
        ctrl.pauseResolve();
        ctrl.pauseResolve = null;
        ctrl.pausePromise = null;
      }
    }

    ctrl.abortController.abort();
    return true;
  }

  async restartExecution(id: string): Promise<string | null> {
    const execution = this.getExecution(id);
    if (!execution) return null;

    // Cancel if active
    const activeStatuses = new Set(['running', 'pending', 'paused']);
    if (activeStatuses.has(execution.status)) {
      this.cancelExecution(id);
    }

    return this.startScenario(
      execution.scenarioId,
      execution.mode,
      execution.triggerData,
      id,
    );
  }

  pauseAll(): number {
    let count = 0;
    for (const [id, exec] of this.executions) {
      if (exec.status === 'running' && this.pauseExecution(id)) count++;
    }
    return count;
  }

  resumeAll(): number {
    let count = 0;
    for (const [id, exec] of this.executions) {
      if (exec.status === 'paused' && this.resumeExecution(id)) count++;
    }
    return count;
  }

  cancelAll(): number {
    let count = 0;
    const activeStatuses = new Set(['running', 'pending', 'paused']);
    for (const [id, exec] of this.executions) {
      if (activeStatuses.has(exec.status) && this.cancelExecution(id)) count++;
    }
    return count;
  }

  // ── Queries ──────────────────────────────────────────────────────

  getExecution(executionId: string): ScenarioExecution | undefined {
    return this.executions.get(executionId) ?? this.repo?.getExecution(executionId);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

const TEMPLATE_RE = /\{\{(\w+)\}\}/g;

/** Replace {{varName}} tokens in a string using context values. */
function resolveTemplates(input: string, context: Map<string, unknown>, targetUrl: string): string {
  return input.replace(TEMPLATE_RE, (match, varName: string) => {
    // Built-in variables
    if (varName === 'target') return targetUrl;
    if (varName === 'random') return Math.random().toString(36).slice(2, 10);
    if (varName === 'random_ip') {
      return [1, 2, 3, 4].map(() => Math.floor(Math.random() * 255) + 1).join('.');
    }
    if (varName === 'timestamp') return Date.now().toString();

    const value = context.get(varName);
    if (value !== undefined) return String(value);
    return match; // leave unresolved templates as-is
  });
}

/** Simple dot-path accessor for JSON objects (e.g. "data.token"). */
function getJsonPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function parseStepBodyRetention(value: string | undefined): StepBodyRetentionPolicy {
  switch (value) {
    case 'all':
    case 'failed-only':
    case 'none':
      return value;
    default:
      return DEFAULT_STEP_BODY_RETENTION;
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function truncateUtf8(value: string, maxBytes: number): string {
  return Buffer.from(value, 'utf8').subarray(0, maxBytes).toString('utf8');
}
