import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';
import { CatalogService } from '@crucible/catalog';
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

// ── Constants ────────────────────────────────────────────────────────

const DEFAULT_MAX_CONCURRENCY = 3;
const CLEANUP_INTERVAL_MS = 60_000;
const CLEANUP_TTL_MS = 30 * 60_000; // 30 minutes
const CLEANUP_MAX_EXECUTIONS = 50;

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export class ScenarioEngine extends EventEmitter {
  private catalog: CatalogService;
  private executions: Map<string, ScenarioExecution>;
  private controls: Map<string, ExecutionControl> = new Map();

  // Concurrency semaphore
  private maxConcurrency: number;
  private activeCount = 0;
  private queue: QueuedWaiter[] = [];

  // Cleanup interval
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(catalog: CatalogService) {
    super();
    this.catalog = catalog;
    this.executions = new Map();
    this.maxConcurrency = parseInt(
      process.env.CRUCIBLE_MAX_CONCURRENCY ?? '',
      10,
    ) || DEFAULT_MAX_CONCURRENCY;

    this.cleanupTimer = setInterval(() => this.cleanupExecutions(), CLEANUP_INTERVAL_MS);
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
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

  // ── Cleanup ──────────────────────────────────────────────────────

  private cleanupExecutions(): void {
    const now = Date.now();

    // TTL pass: remove terminal executions older than TTL
    for (const [id, exec] of this.executions) {
      if (TERMINAL_STATUSES.has(exec.status) && exec.completedAt) {
        if (now - exec.completedAt > CLEANUP_TTL_MS) {
          this.executions.delete(id);
          this.controls.delete(id);
        }
      }
    }

    // Max-count pass: evict oldest terminal executions until under limit
    if (this.executions.size > CLEANUP_MAX_EXECUTIONS) {
      const terminal = [...this.executions.entries()]
        .filter(([, e]) => TERMINAL_STATUSES.has(e.status))
        .sort((a, b) => (a[1].completedAt ?? 0) - (b[1].completedAt ?? 0));

      let excess = this.executions.size - CLEANUP_MAX_EXECUTIONS;
      for (const [id] of terminal) {
        if (excess <= 0) break;
        this.executions.delete(id);
        this.controls.delete(id);
        excess--;
      }
    }
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
      this.emit('execution:failed', execution);
    });

    return executionId;
  }

  // ── Main execution loop ──────────────────────────────────────────

  private async executeScenario(execution: ScenarioExecution, scenario: Scenario): Promise<void> {
    await this.acquireSlot();

    try {
      execution.status = 'running';
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
          this.emit('execution:cancelled', execution);
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
          this.emit('execution:paused', execution);

          // Wait for resume signal
          if (ctrl.pausePromise) {
            await ctrl.pausePromise;
          }

          // After resume, check for cancel
          if (ctrl.abortController.signal.aborted) {
            execution.status = 'cancelled';
            execution.completedAt = Date.now();
            this.emit('execution:cancelled', execution);
            return;
          }

          execution.status = 'running';
          execution.pausedState = undefined;
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
            this.emit('execution:updated', execution);

            const maxAttempts = (step.execution?.retries ?? 0) + 1;
            const signal = ctrl?.abortController.signal;

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              result.attempts = attempt;

              try {
                const response = await this.executeStep(step, context, signal);

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
                result.completedAt = Date.now();
                result.duration = result.completedAt - result.startedAt!;
                completedSteps.add(step.id);
                passedSteps++;
                this.emit('execution:updated', execution);
                break; // success — no more retries
              } catch (err) {
                // If aborted, propagate immediately
                if (signal?.aborted) {
                  result.status = 'cancelled';
                  result.completedAt = Date.now();
                  completedSteps.add(step.id);
                  this.emit('execution:updated', execution);
                  return;
                }

                if (attempt >= maxAttempts) {
                  result.status = 'failed';
                  result.error = err instanceof Error ? err.message : String(err);
                  result.completedAt = Date.now();
                  completedSteps.add(step.id);
                  this.emit('execution:updated', execution);
                }
                // else: retry
              }
            }

            // Snapshot context into execution for observability
            execution.context = Object.fromEntries(context);
          }),
        );
      }

      // Check one more time after all steps complete
      if (ctrl?.abortController.signal.aborted) {
        execution.status = 'cancelled';
        execution.completedAt = Date.now();
        this.emit('execution:cancelled', execution);
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

      this.emit('execution:completed', execution);
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
  ): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
    console.log(`Executing step ${step.id}: ${step.name}`);

    // ── Delay + jitter ──────────────────────────────────────────────
    const delayMs = step.execution?.delayMs ?? 0;
    const jitter = step.execution?.jitter ?? 0;
    const totalDelay = delayMs + (jitter > 0 ? Math.random() * jitter : 0);
    if (totalDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, totalDelay));
    }

    // ── Resolve templates ───────────────────────────────────────────
    const url = resolveTemplates(step.request.url, context);
    const headers: Record<string, string> = {};
    if (step.request.headers) {
      for (const [k, v] of Object.entries(step.request.headers)) {
        headers[k] = resolveTemplates(v, context);
      }
    }

    let rawBody: string | undefined;
    if (step.request.body !== undefined) {
      rawBody = typeof step.request.body === 'string'
        ? resolveTemplates(step.request.body, context)
        : resolveTemplates(JSON.stringify(step.request.body), context);
    }

    // ── Iterations ──────────────────────────────────────────────────
    const iterations = step.execution?.iterations ?? 1;
    let lastResponse: { status: number; headers: Record<string, string>; body: unknown } | undefined;

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

        let responseBody: unknown;
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          responseBody = await response.json();
        } else {
          responseBody = await response.text();
        }

        lastResponse = { status: response.status, headers: responseHeaders, body: responseBody };

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
    const execution = this.executions.get(id);
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
    return this.executions.get(executionId);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

const TEMPLATE_RE = /\{\{(\w+)\}\}/g;

/** Replace {{varName}} tokens in a string using context values. */
function resolveTemplates(input: string, context: Map<string, unknown>): string {
  return input.replace(TEMPLATE_RE, (match, varName: string) => {
    // Built-in variables
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
