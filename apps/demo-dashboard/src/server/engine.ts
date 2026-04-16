import { EventEmitter } from 'events';
import { BlockList, isIP } from 'node:net';
import { nanoid } from 'nanoid';
import { CatalogService, ExecutionRepository } from '@crucible/catalog';
import {
  isScenarioHttpStep,
  type Extract,
  type Scenario,
  type ScenarioHttpStep,
  type ScenarioStep,
} from '@crucible/catalog';
import { ReportService } from './reports.js';
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

// ── Per-execution runtime state ──────────────────────────────────────
// Non-persisted, lifetime-scoped to a single execution. Holds the effective
// target URL and SSRF allowlist so they cannot diverge from what the operator
// explicitly chose when the run was launched, and so that concurrent executions
// pointing at different targets do not share a single mutable allowlist.

interface ExecutionRuntimeState {
  targetUrl: string;
  outboundAllowlist: OutboundAllowlist;
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

type StepBatchMode = 'legacy' | 'sequential' | 'parallel';

interface ActiveBatch {
  mode: StepBatchMode;
  parallelGroup: number | null;
}

interface OutboundAllowlist {
  exactHosts: Set<string>;
  exactHostPorts: Set<string>;
  wildcardRules: Array<{ suffix: string; port: number | null }>;
  ipBlockList: BlockList;
}

export interface ScenarioEngineOptions {
  targetUrl?: string;
  maxConcurrency?: number;
  stepBodyRetention?: StepBodyRetentionPolicy;
  stepBodyMaxBytes?: number;
  outboundAllowlist?: string;
}

// ── Constants ────────────────────────────────────────────────────────

const DEFAULT_TARGET_URL = 'http://localhost:8880';
const DEFAULT_MAX_CONCURRENCY = 3;
const CACHE_EVICT_DELAY_MS = 5_000;
const DEFAULT_STEP_BODY_RETENTION: StepBodyRetentionPolicy = 'all';
const DEFAULT_STEP_BODY_MAX_BYTES = 64 * 1024;
const ALLOWED_REQUEST_PROTOCOLS = new Set(['http:', 'https:']);

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export class ScenarioEngine extends EventEmitter {
  private catalog: CatalogService;
  private repo: ExecutionRepository | null;
  private reportService: ReportService | null = null;
  private executions: Map<string, ScenarioExecution>;
  private controls: Map<string, ExecutionControl> = new Map();
  private runtimeStates: Map<string, ExecutionRuntimeState> = new Map();

  // Target URL for scenario execution
  readonly targetUrl: string;

  // Concurrency semaphore
  private maxConcurrency: number;
  private activeCount = 0;
  private queue: QueuedWaiter[] = [];
  private stepBodyRetention: StepBodyRetentionPolicy;
  private stepBodyMaxBytes: number;
  private outboundAllowlist: OutboundAllowlist;

  constructor(
    catalog: CatalogService,
    repo?: ExecutionRepository,
    reportService?: ReportService,
    options: ScenarioEngineOptions = {},
  ) {
    super();
    this.catalog = catalog;
    this.repo = repo ?? null;
    this.reportService = reportService ?? null;
    this.executions = new Map();
    this.targetUrl = normalizeConfiguredTargetUrl(
      options.targetUrl ?? process.env.CRUCIBLE_TARGET_URL ?? DEFAULT_TARGET_URL,
    );
    const configuredMaxConcurrency = parseInt(
      process.env.CRUCIBLE_MAX_CONCURRENCY ?? '',
      10,
    ) || DEFAULT_MAX_CONCURRENCY;
    this.maxConcurrency = options.maxConcurrency ?? configuredMaxConcurrency;
    this.stepBodyRetention = options.stepBodyRetention
      ?? parseStepBodyRetention(process.env.CRUCIBLE_STEP_BODY_RETENTION);
    this.stepBodyMaxBytes = options.stepBodyMaxBytes
      ?? parsePositiveInteger(
        process.env.CRUCIBLE_STEP_BODY_MAX_BYTES,
        DEFAULT_STEP_BODY_MAX_BYTES,
      );
    this.outboundAllowlist = parseOutboundAllowlist(
      options.outboundAllowlist ?? process.env.CRUCIBLE_OUTBOUND_ALLOWLIST,
      this.targetUrl,
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
      this.runtimeStates.delete(id);
    }, CACHE_EVICT_DELAY_MS);
  }

  // ── Start scenario ───────────────────────────────────────────────

  async startScenario(
    scenarioId: string,
    mode: 'simulation' | 'assessment' = 'simulation',
    triggerData?: Record<string, unknown>,
    parentExecutionId?: string,
    targetUrl?: string,
  ): Promise<string> {
    const scenario = this.catalog.getScenario(scenarioId);
    if (!scenario) {
      throw new Error(`Scenario ${scenarioId} not found`);
    }
    const unsupportedStepTypes = scenario.steps
      .filter((step) => !isScenarioHttpStep(step))
      .map((step) => `${step.id} (${step.type})`);
    if (unsupportedStepTypes.length > 0) {
      throw new Error(
        `Scenario ${scenarioId} contains runner steps that are not executable yet: ${unsupportedStepTypes.join(', ')}`,
      );
    }

    // Resolve the effective target for this run. Validation runs before any
    // execution state is created so invalid overrides throw without leaving
    // orphan rows, controls, or runtime state behind.
    const effectiveTarget =
      targetUrl !== undefined
        ? normalizeConfiguredTargetUrl(targetUrl, 'Scenario target URL')
        : this.targetUrl;
    const outboundAllowlist = parseOutboundAllowlist(
      process.env.CRUCIBLE_OUTBOUND_ALLOWLIST,
      effectiveTarget,
    );

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
      targetUrl: effectiveTarget,
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
    this.runtimeStates.set(executionId, {
      targetUrl: effectiveTarget,
      outboundAllowlist,
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
    validateScenarioDependencies(scenario);

    await this.acquireSlot();

    try {
      execution.status = 'running';
      this.repo?.updateExecution(execution.id, { status: 'running' });
      this.emit('execution:started', execution);

      const ctrl = this.controls.get(execution.id);
      const runtime = this.runtimeStates.get(execution.id);
      if (!runtime) {
        throw new Error(`Runtime state missing for execution ${execution.id}`);
      }

      const context = new Map<string, unknown>();
      const stepOrder = new Map(scenario.steps.map((step, index) => [step.id, index]));
      const stepById = new Map(scenario.steps.map((step) => [step.id, step]));
      const dependents = buildDependentsMap(scenario.steps);
      const unresolvedDependencies = new Map(
        scenario.steps.map((step) => [step.id, (step.dependsOn ?? []).length]),
      );
      const pendingSteps = new Set(scenario.steps.map((s) => s.id));
      const completedSteps = new Set<string>();
      const stepResults = new Map<string, ExecutionStepResult>();
      const readyQueue = scenario.steps
        .filter((step) => (step.dependsOn ?? []).length === 0)
        .map((step) => step.id);
      const queuedReadySteps = new Set(readyQueue);
      const activeSteps = new Set<string>();
      let activeBatch: ActiveBatch | null = null;
      let fatalExecutionError: Error | null = null;
      let passedSteps = 0;
      let schedulerVersion = 0;
      let schedulerWaiter: (() => void) | null = null;

      const notifyScheduler = (): void => {
        schedulerVersion++;
        const waiter = schedulerWaiter;
        schedulerWaiter = null;
        waiter?.();
      };

      const waitForSchedulerChange = async (seenVersion: number): Promise<void> => {
        if (schedulerVersion !== seenVersion) {
          return;
        }
        // Single-consumer: only the main scheduler loop awaits scheduler changes.
        await new Promise<void>((resolve) => {
          schedulerWaiter = resolve;
        });
      };

      const insertReadyStep = (stepId: string): void => {
        if (!pendingSteps.has(stepId) || activeSteps.has(stepId) || queuedReadySteps.has(stepId)) {
          return;
        }

        const insertIndex = readyQueue.findIndex(
          (queuedStepId) =>
            (stepOrder.get(queuedStepId) ?? Number.MAX_SAFE_INTEGER)
            > (stepOrder.get(stepId) ?? Number.MAX_SAFE_INTEGER),
        );

        if (insertIndex === -1) {
          readyQueue.push(stepId);
        } else {
          readyQueue.splice(insertIndex, 0, stepId);
        }

        queuedReadySteps.add(stepId);
      };

      const completeStep = (stepId: string): void => {
        pendingSteps.delete(stepId);
        activeSteps.delete(stepId);
        completedSteps.add(stepId);

        for (const dependentId of dependents.get(stepId) ?? []) {
          const remainingDependencies = (unresolvedDependencies.get(dependentId) ?? 0) - 1;
          unresolvedDependencies.set(dependentId, remainingDependencies);
          if (remainingDependencies === 0) {
            insertReadyStep(dependentId);
          }
        }

        execution.context = Object.fromEntries(context);
        this.repo?.updateExecution(execution.id, { context: execution.context });
        notifyScheduler();
      };

      const startStep = (step: ScenarioStep): void => {
        queuedReadySteps.delete(step.id);
        const readyIndex = readyQueue.indexOf(step.id);
        if (readyIndex !== -1) {
          readyQueue.splice(readyIndex, 1);
        }

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
            this.repo?.upsertStep(execution.id, skipped);
            this.emit('execution:updated', execution);
            completeStep(step.id);
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
        activeSteps.add(step.id);
        this.repo?.upsertStep(execution.id, result);
        this.emit('execution:updated', execution);
        notifyScheduler();

        void (async () => {
          try {
            const maxAttempts = (step.execution?.retries ?? 0) + 1;
            const signal = ctrl?.abortController.signal;
            let latestResponse: StepHttpResponse | undefined;

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              result.attempts = attempt;

              try {
                const response = await this.executeStep(step, context, runtime, signal);
                latestResponse = response;
                const httpStep = isScenarioHttpStep(step) ? step : null;

                if (httpStep?.extract) {
                  this.runExtract(httpStep.extract, response, context);
                }

                const assertions = httpStep ? this.evaluateAssertions(httpStep, response) : [];
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
                result.details = this.buildPersistedStepResult(response, 'completed');
                result.result = result.details as any; // Mirror for backward compatibility
                result.completedAt = Date.now();
                result.duration = result.completedAt - result.startedAt!;
                passedSteps++;
                this.repo?.upsertStep(execution.id, result);
                this.emit('execution:updated', execution);
                completeStep(step.id);
                return;
              } catch (err) {
                if (signal?.aborted) {
                  result.status = 'cancelled';
                  result.completedAt = Date.now();
                  this.repo?.upsertStep(execution.id, result);
                  this.emit('execution:updated', execution);
                  completeStep(step.id);
                  return;
                }

                if (attempt >= maxAttempts) {
                  result.status = 'failed';
                  result.error = err instanceof Error ? err.message : String(err);
                  result.details = latestResponse
                    ? this.buildPersistedStepResult(latestResponse, 'failed')
                    : undefined;
                  result.result = result.details as any; // Mirror for backward compatibility
                  result.completedAt = Date.now();
                  result.duration = result.completedAt - result.startedAt!;
                  this.repo?.upsertStep(execution.id, result);
                  this.emit('execution:updated', execution);
                  completeStep(step.id);
                  return;
                }
              }
            }
          } catch (err) {
            fatalExecutionError = err instanceof Error ? err : new Error(String(err));
            notifyScheduler();
          }
        })();
      };

      const dispatchReadySteps = (): void => {
        if (ctrl?.paused || ctrl?.abortController.signal.aborted) {
          return;
        }

        while (readyQueue.length > 0) {
          if (!activeBatch) {
            activeBatch = getBatchState(stepById.get(readyQueue[0])!);
          }

          const nextReadyIds = readyQueue.filter((stepId) =>
            isStepCompatibleWithBatch(stepById.get(stepId)!, activeBatch!),
          );

          if (nextReadyIds.length === 0) {
            if (activeSteps.size === 0) {
              activeBatch = null;
              continue;
            }
            return;
          }

          const stepsToStart = activeBatch.mode === 'sequential'
            ? (activeSteps.size === 0 ? nextReadyIds.slice(0, 1) : [])
            : nextReadyIds;

          if (stepsToStart.length === 0) {
            return;
          }

          for (const stepId of stepsToStart) {
            startStep(stepById.get(stepId)!);
          }

          if (activeBatch.mode === 'sequential') {
            return;
          }
        }
      };

      while (pendingSteps.size > 0) {
        if (fatalExecutionError) {
          throw fatalExecutionError;
        }

        if (ctrl?.paused && activeSteps.size === 0) {
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

          if (ctrl.pausePromise) {
            await ctrl.pausePromise;
          }

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

        dispatchReadySteps();

        if (pendingSteps.size === 0) {
          break;
        }

        if (ctrl?.abortController.signal.aborted && activeSteps.size === 0) {
          execution.status = 'cancelled';
          execution.completedAt = Date.now();
          this.repo?.updateExecution(execution.id, { status: 'cancelled', completedAt: execution.completedAt });
          this.emit('execution:cancelled', execution);
          this.scheduleEviction(execution.id);
          return;
        }

        if (activeSteps.size === 0) {
          if (readyQueue.length === 0) {
            const remainingSteps = scenario.steps
              .filter((step) => pendingSteps.has(step.id))
              .map((step) => step.id);
            throw new Error(
              `Deadlock detected while resolving scenario graph. Remaining steps: ${remainingSteps.join(', ')}`,
            );
          }

          activeBatch = null;
          continue;
        }

        const seenVersion = schedulerVersion;
        await waitForSchedulerChange(seenVersion);
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
          artifacts: [
            `/api/reports/${execution.id}?format=${ReportService.HTML_SUFFIX}`,
            `/api/reports/${execution.id}?format=${ReportService.JSON_SUFFIX}`,
          ],
        };

        if (this.reportService) {
          try {
            await this.reportService.generateReports(execution, scenario);
          } catch (err) {
            console.error(`Failed to generate reports for ${execution.id}:`, err);
            // Update summary to reflect missing artifacts if generation failed
            execution.report.summary += ' (Report artifact generation failed)';
            execution.report.artifacts = [];
          }
        }
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
    runtime: ExecutionRuntimeState,
    signal?: AbortSignal,
  ): Promise<StepHttpResponse> {
    if (!isScenarioHttpStep(step)) {
      throw new Error(`Step ${step.id} uses unsupported runner type "${step.type}" in the HTTP executor`);
    }

    const httpStep = step;
    console.log(`Executing step ${step.id}: ${step.name}`);

    // ── Delay + jitter ──────────────────────────────────────────────
    const delayMs = httpStep.execution?.delayMs ?? 0;
    const jitter = httpStep.execution?.jitter ?? 0;
    const totalDelay = delayMs + (jitter > 0 ? Math.random() * jitter : 0);
    if (totalDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, totalDelay));
    }

    // ── Resolve templates ───────────────────────────────────────────
    const resolvedUrl = resolveTemplates(httpStep.request.url, context, runtime.targetUrl);
    // Prepend target URL to relative paths
    const url = validateOutboundRequestUrl(
      resolvedUrl.startsWith('/') ? `${runtime.targetUrl}${resolvedUrl}` : resolvedUrl,
      runtime.outboundAllowlist,
    );
    const headers: Record<string, string> = {};
    if (httpStep.request.headers) {
      for (const [k, v] of Object.entries(httpStep.request.headers)) {
        headers[k] = resolveTemplates(v, context, runtime.targetUrl);
      }
    }

    let rawBody: string | undefined;
    if (httpStep.request.body !== undefined) {
      rawBody = typeof httpStep.request.body === 'string'
        ? resolveTemplates(httpStep.request.body, context, runtime.targetUrl)
        : resolveTemplates(JSON.stringify(httpStep.request.body), context, runtime.targetUrl);
    }

    // ── Iterations ──────────────────────────────────────────────────
    const iterations = httpStep.execution?.iterations ?? 1;
    let lastResponse: StepHttpResponse | undefined;

    for (let i = 0; i < iterations; i++) {
      try {
        const response = await fetch(url, {
          method: httpStep.request.method,
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
  ): ExecutionStepResult['details'] | undefined {
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
    extract: Extract,
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
    step: ScenarioHttpStep,
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

  listExecutions(): ScenarioExecution[] {
    const active = Array.from(this.executions.values());
    if (!this.repo) return active;

    // Fetch recent historical executions from repo
    const persisted = this.repo.listExecutions({ limit: 50 });
    
    // Merge, preferring active in-memory state for same ID
    const activeIds = new Set(active.map(e => e.id));
    const merged = [...active];
    
    for (const p of persisted) {
      if (!activeIds.has(p.id)) {
        merged.push(p);
      }
    }

    // Sort by startedAt desc and limit to top 100
    return merged
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
      .slice(0, 100);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

const TEMPLATE_RE = /\{\{(\w+)\}\}/g;

function validateScenarioDependencies(scenario: Scenario): void {
  const stepIds = new Set(scenario.steps.map((step) => step.id));
  const missingDependencies: string[] = [];

  for (const step of scenario.steps) {
    for (const dependency of step.dependsOn ?? []) {
      if (!stepIds.has(dependency)) {
        missingDependencies.push(`${step.id} -> ${dependency}`);
      }
    }
  }

  if (missingDependencies.length > 0) {
    throw new Error(
      `Unknown dependency reference(s): ${missingDependencies.join(', ')}`,
    );
  }

  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const step of scenario.steps) {
    inDegree.set(step.id, 0);
    adjacency.set(step.id, []);
  }

  for (const step of scenario.steps) {
    for (const dependency of step.dependsOn ?? []) {
      adjacency.get(dependency)!.push(step.id);
      inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
    }
  }

  const queue = [...inDegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([stepId]) => stepId);

  let visitedCount = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    visitedCount++;

    for (const neighbor of adjacency.get(current) ?? []) {
      const nextDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, nextDegree);
      if (nextDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (visitedCount !== scenario.steps.length) {
    const cycleSteps = [...inDegree.entries()]
      .filter(([, degree]) => degree > 0)
      .map(([stepId]) => stepId);
    throw new Error(`Dependency cycle detected among steps: ${cycleSteps.join(', ')}`);
  }
}

function buildDependentsMap(steps: ScenarioStep[]): Map<string, string[]> {
  const dependents = new Map<string, string[]>();

  for (const step of steps) {
    dependents.set(step.id, []);
  }

  for (const step of steps) {
    for (const dependency of step.dependsOn ?? []) {
      dependents.get(dependency)!.push(step.id);
    }
  }

  return dependents;
}

function getBatchState(step: ScenarioStep): ActiveBatch {
  return {
    mode: getStepBatchMode(step),
    parallelGroup: normalizeParallelGroup(step),
  };
}

function getStepBatchMode(step: ScenarioStep): StepBatchMode {
  if (step.executionMode === 'parallel') {
    return 'parallel';
  }

  if (step.executionMode === 'sequential') {
    return 'sequential';
  }

  return 'legacy';
}

function normalizeParallelGroup(step: ScenarioStep): number | null {
  return step.parallelGroup ?? null;
}

function isStepCompatibleWithBatch(
  candidateStep: ScenarioStep,
  batch: ActiveBatch,
): boolean {
  if (batch.mode === 'parallel') {
    return candidateStep.executionMode === 'parallel'
      && normalizeParallelGroup(candidateStep) === batch.parallelGroup;
  }

  if (batch.mode === 'legacy') {
    return getStepBatchMode(candidateStep) === 'legacy';
  }

  return candidateStep.executionMode === 'sequential'
    && normalizeParallelGroup(candidateStep) === batch.parallelGroup;
}

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

function normalizeConfiguredTargetUrl(rawTargetUrl: string, label: string = 'CRUCIBLE_TARGET_URL'): string {
  const trimmedTargetUrl = rawTargetUrl.trim();
  if (!trimmedTargetUrl) {
    throw new Error(`${label} must not be empty`);
  }

  parseValidatedAbsoluteUrl(trimmedTargetUrl, label);
  return trimmedTargetUrl.replace(/\/+$/, '');
}

function parseValidatedAbsoluteUrl(rawUrl: string, label: string): URL {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error(`${label} must be a valid absolute URL`);
  }

  if (!ALLOWED_REQUEST_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new Error(`${label} must use http or https`);
  }

  if (!parsedUrl.hostname) {
    throw new Error(`${label} must include a hostname`);
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error(`${label} must not include credentials`);
  }

  if (parsedUrl.hash) {
    throw new Error(`${label} must not include a fragment`);
  }

  return parsedUrl;
}

function parseOutboundAllowlist(
  rawAllowlist: string | undefined,
  targetUrl: string,
): OutboundAllowlist {
  const allowlist: OutboundAllowlist = {
    exactHosts: new Set(),
    exactHostPorts: new Set(),
    wildcardRules: [],
    ipBlockList: new BlockList(),
  };

  const target = parseValidatedAbsoluteUrl(targetUrl, 'CRUCIBLE_TARGET_URL');
  addExactHostPort(
    normalizeHostname(target.hostname),
    getNormalizedPort(target),
    allowlist,
  );

  for (const entry of (rawAllowlist ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)) {
    addAllowlistEntry(entry, allowlist, 'CRUCIBLE_OUTBOUND_ALLOWLIST');
  }

  return allowlist;
}

function addAllowlistEntry(
  rawEntry: string,
  allowlist: OutboundAllowlist,
  sourceLabel: string,
): void {
  const normalizedEntry = rawEntry.toLowerCase();

  if (normalizedEntry.includes('://')) {
    const parsedUrl = parseValidatedAbsoluteUrl(rawEntry, sourceLabel);
    addExactHostPort(
      normalizeHostname(parsedUrl.hostname),
      getNormalizedPort(parsedUrl),
      allowlist,
    );
    return;
  }

  const hostPortEntry = parseHostPortEntry(normalizedEntry);
  if (hostPortEntry) {
    const family = toIpFamily(hostPortEntry.host);
    if (family) {
      addExactHostPort(hostPortEntry.host, hostPortEntry.port, allowlist);
    } else if (hostPortEntry.host.startsWith('*.')) {
      allowlist.wildcardRules.push({
        suffix: `.${hostPortEntry.host.slice(2)}`,
        port: hostPortEntry.port,
      });
    } else if (!/^[a-z0-9.-]+$/.test(hostPortEntry.host)) {
      throw new Error(`${sourceLabel} entry "${rawEntry}" must be a hostname, wildcard domain, IP, or CIDR`);
    } else {
      allowlist.exactHostPorts.add(formatHostPortKey(hostPortEntry.host, hostPortEntry.port));
    }
    return;
  }

  const cidrMatch = normalizedEntry.match(/^(.+)\/(\d{1,3})$/);
  if (cidrMatch) {
    const [, network, prefix] = cidrMatch;
    const normalizedNetwork = normalizeHostname(network);
    const family = toIpFamily(normalizedNetwork);
    if (!family) {
      throw new Error(`${sourceLabel} entry "${rawEntry}" must use a valid IP or CIDR`);
    }
    allowlist.ipBlockList.addSubnet(normalizedNetwork, Number(prefix), family);
    return;
  }

  const normalizedHost = normalizeHostname(normalizedEntry);
  const family = toIpFamily(normalizedHost);
  if (family) {
    allowlist.ipBlockList.addAddress(normalizedHost, family);
    return;
  }

  if (normalizedHost.startsWith('*.') && normalizedHost.length > 2) {
    allowlist.wildcardRules.push({
      suffix: `.${normalizedHost.slice(2)}`,
      port: null,
    });
    return;
  }

  if (!/^[a-z0-9.-]+$/.test(normalizedHost)) {
    throw new Error(`${sourceLabel} entry "${rawEntry}" must be a hostname, wildcard domain, IP, or CIDR`);
  }

  allowlist.exactHosts.add(normalizedHost);
}

function validateOutboundRequestUrl(rawUrl: string, allowlist: OutboundAllowlist): string {
  const parsedUrl = parseValidatedAbsoluteUrl(rawUrl, 'Resolved step URL');
  const hostname = normalizeHostname(parsedUrl.hostname);
  const port = getNormalizedPort(parsedUrl);

  // This validation runs before fetch performs DNS resolution. Prefer exact IP
  // or CIDR allowlist entries plus network-layer controls for sensitive targets.
  if (!isAllowedEndpoint(hostname, parsedUrl.protocol, port, allowlist)) {
    throw new Error(`Outbound request blocked for endpoint "${formatHostPortKey(hostname, port)}"`);
  }

  return rawUrl;
}

function isAllowedEndpoint(
  hostname: string,
  protocol: string,
  port: number,
  allowlist: OutboundAllowlist,
): boolean {
  if (allowlist.exactHostPorts.has(formatHostPortKey(hostname, port))) {
    return true;
  }

  const usesDefaultPort = port === defaultPortForProtocol(protocol);
  const family = toIpFamily(hostname);
  if (family) {
    return usesDefaultPort && allowlist.ipBlockList.check(hostname, family);
  }

  if (usesDefaultPort && allowlist.exactHosts.has(hostname)) {
    return true;
  }

  return allowlist.wildcardRules.some(
    (rule) => hostname.endsWith(rule.suffix) && (rule.port === null ? usesDefaultPort : rule.port === port),
  );
}

function addExactHostPort(hostname: string, port: number, allowlist: OutboundAllowlist): void {
  allowlist.exactHostPorts.add(formatHostPortKey(hostname, port));
}

function parseHostPortEntry(rawEntry: string): { host: string; port: number } | null {
  const ipv6Match = rawEntry.match(/^\[([^\]]+)\]:(\d{1,5})$/);
  if (ipv6Match) {
    return {
      host: normalizeHostname(ipv6Match[1]),
      port: parsePort(ipv6Match[2], rawEntry),
    };
  }

  const hostMatch = rawEntry.match(/^([^/:]+):(\d{1,5})$/);
  if (!hostMatch) {
    return null;
  }

  return {
    host: normalizeHostname(hostMatch[1]),
    port: parsePort(hostMatch[2], rawEntry),
  };
}

function parsePort(rawPort: string, rawEntry: string): number {
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`CRUCIBLE_OUTBOUND_ALLOWLIST entry "${rawEntry}" must use a valid port`);
  }
  return port;
}

function normalizeHostname(value: string): string {
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).toLowerCase();
  }

  return value.toLowerCase();
}

function formatHostPortKey(hostname: string, port: number): string {
  return hostname.includes(':') ? `[${hostname}]:${port}` : `${hostname}:${port}`;
}

function getNormalizedPort(parsedUrl: URL): number {
  if (parsedUrl.port) {
    return Number(parsedUrl.port);
  }

  return defaultPortForProtocol(parsedUrl.protocol);
}

function defaultPortForProtocol(protocol: string): number {
  switch (protocol) {
    case 'http:':
      return 80;
    case 'https:':
      return 443;
    default:
      throw new Error(`Unsupported protocol "${protocol}"`);
  }
}

function toIpFamily(value: string): 'ipv4' | 'ipv6' | null {
  const version = isIP(normalizeHostname(value));
  if (version === 4) return 'ipv4';
  if (version === 6) return 'ipv6';
  return null;
}
