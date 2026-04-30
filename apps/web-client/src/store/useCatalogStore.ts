'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { normalizeScenarioTargetUrl, ScenarioTargetUrlError } from '@crucible/catalog/client';
import type { Scenario } from '@crucible/catalog';

// ── Types (mirrors demo-dashboard/shared/types.ts) ──────────────────

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused'
  | 'skipped';

export interface PausedState {
  pendingStepIds: string[];
  completedStepIds: string[];
  context: Record<string, unknown>;
  passedSteps: number;
  stepResults: Record<string, ExecutionStepResult>;
}

export interface AssertionResult {
  field: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
  overridden?: boolean;
  authoredExpected?: unknown;
}

export interface SimulationTriggerData extends Record<string, unknown> {
  expectWafBlocking?: boolean;
}

// RunnerSummary and RunnerFindingSeverity are canonical in @crucible/catalog.
// Re-exported here so existing local imports keep working without churn.
import type { RunnerFindingSeverity, RunnerSummary } from '@crucible/catalog';
export type { RunnerFindingSeverity, RunnerSummary };

export interface ExecutionStepResult {
  stepId: string;
  status: ExecutionStatus;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  result?: Record<string, unknown>;
  details?: {
    response?: {
      status: number;
      headers: Record<string, string>;
      body: unknown;
    };
    retention?: {
      policy: string;
      truncated: boolean;
      contentType: string;
      originalBytes: number;
      storedBytes: number;
      bodyFormat: 'json' | 'text';
    };
    runner?: RunnerSummary;
  };
  error?: string;
  logs?: string[];
  attempts: number;
  assertions?: AssertionResult[];
}

export interface ExecutionStepDelta extends Partial<Omit<ExecutionStepResult, 'stepId'>> {
  stepId: string;
}

export interface ScenarioExecution {
  id: string;
  scenarioId: string;
  mode: 'simulation' | 'assessment';
  status: ExecutionStatus;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  steps: ExecutionStepResult[];
  error?: string;
  triggerData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  context?: Record<string, unknown>;
  pausedState?: PausedState;
  parentExecutionId?: string;
  targetUrl?: string;
  report?: {
    summary: string;
    passed: boolean;
    score: number;
    artifacts: string[];
  };
}

export interface ScenarioExecutionDelta {
  id: string;
  changes: Partial<Omit<ScenarioExecution, 'id' | 'steps'>> & {
    steps?: ExecutionStepDelta[];
  };
}

export interface ExecutionMetricsPoint {
  timestamp: number;
  activeExecutions: number;
  completedExecutions: number;
  failedExecutions: number;
  runningSteps: number;
  completedSteps: number;
  failedSteps: number;
}

export interface ExecutionHistoryFilters {
  scenarioId: string;
  status: '' | ExecutionStatus;
  mode: '' | ScenarioExecution['mode'];
  dateFrom: string;
  dateTo: string;
}

interface SimulationLaunchOptions {
  targetUrl?: string | null;
  expectWafBlocking?: SimulationTriggerData['expectWafBlocking'];
}

type ExecutionMetricsSnapshot = Omit<ExecutionMetricsPoint, 'timestamp'>;

const DEFAULT_METRICS_HISTORY_LIMIT = 60;
const DEFAULT_METRICS_THROTTLE_MS = 500;
const DEFAULT_HISTORY_PAGE_SIZE = 10;
const noopStorage: Storage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  clear: () => undefined,
  key: () => null,
  get length() {
    return 0;
  },
};

export const defaultExecutionHistoryFilters: ExecutionHistoryFilters = {
  scenarioId: '',
  status: '',
  mode: '',
  dateFrom: '',
  dateTo: '',
};

// ── Store ────────────────────────────────────────────────────────────

interface CatalogState {
  scenarios: Scenario[];
  executions: ScenarioExecution[];
  activeExecution: ScenarioExecution | null;
  historyExecutions: ScenarioExecution[];
  historyFilters: ExecutionHistoryFilters;
  historyPageSize: number;
  historyOffset: number;
  historyHasNextPage: boolean;
  historyIsLoading: boolean;
  historyIsRefreshing: boolean;
  historyError: string | null;
  historyInitialized: boolean;
  metricsHistory: ExecutionMetricsPoint[];
  metricsHistoryLimit: number;
  metricsThrottleMs: number;
  isLoading: boolean;
  error: string | null;
  wsConnected: boolean;
  targetUrl: string | null;
  targetStatus: 'online' | 'offline' | 'unknown';
  pinnedScenarioIds: string[];
  dismissedExecutionIds: string[];

  fetchScenarios: () => Promise<void>;
  fetchExecutionHistory: (options?: {
    reset?: boolean;
    filters?: Partial<ExecutionHistoryFilters>;
  }) => Promise<void>;
  updateHistoryFilters: (updates: Partial<ExecutionHistoryFilters>) => Promise<void>;
  loadOlderExecutionHistory: () => Promise<void>;
  resetExecutionHistory: () => void;
  fetchHealth: () => Promise<void>;
  updateScenario: (id: string, data: Scenario) => Promise<void>;
  startSimulation: (scenarioId: string, options?: SimulationLaunchOptions) => Promise<string>;
  startAssessment: (scenarioId: string, targetUrl?: string | null) => Promise<string>;
  updateExecution: (execution: ScenarioExecution) => void;
  applyExecutionDelta: (delta: ScenarioExecutionDelta) => void;
  setActiveExecution: (executionId: string | null) => void;
  setWsConnected: (connected: boolean) => void;
  clearError: () => void;
  resetMetricsHistory: () => void;

  sendMessage: (msg: any) => void;
  onMessage: (handler: (msg: any) => void) => () => void;

  pauseExecution: (id: string) => Promise<void>;
  resumeExecution: (id: string) => Promise<void>;
  cancelExecution: (id: string) => Promise<void>;
  restartExecution: (id: string) => Promise<string>;
  pauseAll: () => Promise<number>;
  resumeAll: () => Promise<number>;
  cancelAll: () => Promise<number>;

  togglePinnedScenario: (id: string) => void;
  setTargetUrl: (url: string | null) => void;
  dismissExecution: (id: string) => void;
  clearFinishedExecutions: (mode: ScenarioExecution['mode']) => void;
  sanitizeTransientState: () => void;
  destroy: () => void;
}

const TERMINAL_EXECUTION_STATUSES: ReadonlySet<ExecutionStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
  'skipped',
]);

const MAX_DISMISSED_EXECUTION_IDS = 1000;

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const METRICS_HISTORY_LIMIT = parsePositiveInteger(
  process.env.NEXT_PUBLIC_METRICS_HISTORY_LIMIT,
  DEFAULT_METRICS_HISTORY_LIMIT,
);
const METRICS_THROTTLE_MS = parsePositiveInteger(
  process.env.NEXT_PUBLIC_METRICS_THROTTLE_MS,
  DEFAULT_METRICS_THROTTLE_MS,
);

type CatalogStateSnapshot = Pick<
  CatalogState,
  | 'scenarios'
  | 'executions'
  | 'activeExecution'
  | 'historyExecutions'
  | 'historyFilters'
  | 'historyPageSize'
  | 'historyOffset'
  | 'historyHasNextPage'
  | 'historyIsLoading'
  | 'historyIsRefreshing'
  | 'historyError'
  | 'historyInitialized'
  | 'metricsHistory'
  | 'metricsHistoryLimit'
  | 'metricsThrottleMs'
  | 'isLoading'
  | 'error'
  | 'wsConnected'
  | 'targetUrl'
  | 'targetStatus'
  | 'pinnedScenarioIds'
  | 'dismissedExecutionIds'
>;

export const catalogInitialState: CatalogStateSnapshot = {
  scenarios: [],
  executions: [],
  activeExecution: null,
  historyExecutions: [],
  historyFilters: defaultExecutionHistoryFilters,
  historyPageSize: DEFAULT_HISTORY_PAGE_SIZE,
  historyOffset: 0,
  historyHasNextPage: false,
  historyIsLoading: false,
  historyIsRefreshing: false,
  historyError: null,
  historyInitialized: false,
  metricsHistory: [],
  metricsHistoryLimit: METRICS_HISTORY_LIMIT,
  metricsThrottleMs: METRICS_THROTTLE_MS,
  isLoading: false,
  error: null,
  wsConnected: false,
  targetUrl: null,
  targetStatus: 'unknown',
  pinnedScenarioIds: [],
  dismissedExecutionIds: [],
};

export const useCatalogStore = create<CatalogState>()(
  persist(
    (set, get) => {
      let metricsFlushTimer: ReturnType<typeof setTimeout> | null = null;
      const messageHandlers = new Set<(msg: any) => void>();
      let latestHistoryRequestId = 0;

      const clearMetricsFlushTimer = (): void => {
        if (metricsFlushTimer) {
          clearTimeout(metricsFlushTimer);
          metricsFlushTimer = null;
        }
      };

      const captureMetricsSample = (timestamp: number): void => {
        clearMetricsFlushTimer();

        set((state) => {
          const point: ExecutionMetricsPoint = {
            timestamp,
            ...deriveMetricsSnapshot(state.executions),
          };

          return {
            metricsHistory: appendMetricsPoint(state.metricsHistory, point, state.metricsHistoryLimit),
          };
        });
      };

      const scheduleMetricsSample = (): void => {
        const now = Date.now();
        let nextDelayMs: number | null = null;

        set((state) => {
          const lastPoint = state.metricsHistory.at(-1);

          if (!lastPoint || now - lastPoint.timestamp >= state.metricsThrottleMs) {
            return {
              metricsHistory: appendMetricsPoint(
                state.metricsHistory,
                { timestamp: now, ...deriveMetricsSnapshot(state.executions) },
                state.metricsHistoryLimit,
              ),
            };
          }

          if (!metricsFlushTimer) {
            nextDelayMs = state.metricsThrottleMs - (now - lastPoint.timestamp);
          }

          return {};
        });

        if (nextDelayMs != null && !metricsFlushTimer) {
          // Keep a trailing sample so the chart settles on the latest execution state.
          metricsFlushTimer = setTimeout(() => {
            metricsFlushTimer = null;
            captureMetricsSample(Date.now());
          }, nextDelayMs);
        }
      };

      const seedPendingExecution = (
        executionId: string,
        scenarioId: string,
        mode: ScenarioExecution['mode'],
        targetUrl?: string,
      ): void => {
        const execution: ScenarioExecution = {
          id: executionId,
          scenarioId,
          mode,
          status: 'pending',
          startedAt: Date.now(),
          steps: [],
          ...(targetUrl ? { targetUrl } : {}),
        };

        set((state: CatalogState) => {
          const existingExecution = state.executions.find((existing) => existing.id === executionId);
          const seededExecution = existingExecution ?? execution;
          const executions = existingExecution ? state.executions : [execution, ...state.executions];
          const dismissedExecutionIds = state.dismissedExecutionIds.includes(executionId)
            ? state.dismissedExecutionIds.filter((id) => id !== executionId)
            : state.dismissedExecutionIds;
          const existingHistoryExecution =
            mode === 'assessment'
              ? state.historyExecutions.find((existing) => existing.id === executionId)
              : undefined;
          const historyExecutions =
            mode === 'assessment'
              ? existingHistoryExecution
                ? state.historyExecutions
                : [seededExecution, ...state.historyExecutions]
              : state.historyExecutions;

          const preservedError = state.error?.startsWith('Saved target URL was invalid')
            ? state.error
            : null;

          return {
            executions,
            historyExecutions,
            activeExecution: seededExecution,
            error: preservedError,
            dismissedExecutionIds,
          };
        });
      };

      return {
        ...catalogInitialState,
        fetchHealth: async () => {
          try {
            const base = API_BASE.replace(/\/api$/, '');
            const response = await fetch(`${base}/health`);
            if (!response.ok) {
              set({ targetStatus: 'unknown' });
              return;
            }
            const data = await response.json();
            
            // Update targetUrl from health if not already set locally
            let currentTarget = get().targetUrl;
            if (data.targetUrl && !currentTarget) {
              currentTarget = data.targetUrl;
              set({ targetUrl: currentTarget });
            }

            // Check target liveness if we have a URL
            if (currentTarget) {
              try {
                // Background liveness check
                const targetRes = await fetch(currentTarget, { 
                  method: 'HEAD', 
                  mode: 'no-cors',
                  signal: AbortSignal.timeout(2000) 
                });
                set({ targetStatus: 'online' });
              } catch {
                set({ targetStatus: 'offline' });
              }
            } else {
              set({ targetStatus: 'unknown' });
            }
          } catch {
            set({ targetStatus: 'unknown' });
          }
        },

        fetchScenarios: async () => {
          set({ isLoading: true, error: null });
          try {
            const response = await fetch(`${API_BASE}/scenarios`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            set({ scenarios: data, isLoading: false });
          } catch {
            set({ error: 'Failed to fetch scenarios', isLoading: false });
          }
        },

        fetchExecutionHistory: async (options) => {
          const reset = options?.reset ?? false;
          const state = get();
          const requestId = ++latestHistoryRequestId;
          const filters: ExecutionHistoryFilters = {
            ...state.historyFilters,
            ...options?.filters,
          };
          const offset = reset ? 0 : state.historyOffset;
          const isInitialLoad = !state.historyInitialized;

          set({
            historyFilters: filters,
            historyError: null,
            historyIsLoading: isInitialLoad,
            historyIsRefreshing: !isInitialLoad,
            ...(reset
              ? {
                  historyExecutions: [],
                  historyOffset: 0,
                  historyHasNextPage: false,
                }
              : {}),
          });

          try {
            const response = await fetch(buildExecutionHistoryUrl(filters, state.historyPageSize, offset));
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data: ScenarioExecution[] = await response.json();
            if (requestId !== latestHistoryRequestId) {
              return;
            }

            set((current) => ({
              historyExecutions: reset
                ? data
                : [...current.historyExecutions, ...data.filter((execution) => (
                    !current.historyExecutions.some((existing) => existing.id === execution.id)
                  ))],
              historyOffset: offset + data.length,
              historyHasNextPage: data.length === current.historyPageSize,
              historyIsLoading: false,
              historyIsRefreshing: false,
              historyError: null,
              historyInitialized: true,
              historyFilters: filters,
            }));
          } catch {
            if (requestId !== latestHistoryRequestId) {
              return;
            }

            set((current) => ({
              historyExecutions: reset ? [] : current.historyExecutions,
              historyOffset: reset ? 0 : current.historyOffset,
              historyHasNextPage: false,
              historyIsLoading: false,
              historyIsRefreshing: false,
              historyError: 'Failed to load execution history.',
              historyInitialized: true,
              historyFilters: filters,
            }));
          }
        },

        updateHistoryFilters: async (updates) => {
          await get().fetchExecutionHistory({
            reset: true,
            filters: updates,
          });
        },

        loadOlderExecutionHistory: async () => {
          const state = get();
          if (state.historyIsLoading || state.historyIsRefreshing || !state.historyHasNextPage) {
            return;
          }

          await get().fetchExecutionHistory();
        },

        resetExecutionHistory: () => {
          set({
            historyExecutions: [],
            historyFilters: defaultExecutionHistoryFilters,
            historyOffset: 0,
            historyHasNextPage: false,
            historyIsLoading: false,
            historyIsRefreshing: false,
            historyError: null,
            historyInitialized: false,
          });
        },

        updateScenario: async (id: string, data: Scenario) => {
          const response = await fetch(`${API_BASE}/scenarios/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          if (!response.ok) {
            const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
            throw new Error(err.error || `HTTP ${response.status}`);
          }
          const updated: Scenario = await response.json();
          set((state) => ({
            scenarios: state.scenarios.map((s) => (s.id === id ? updated : s)),
          }));
        },

        startSimulation: async (scenarioId: string, options: SimulationLaunchOptions = {}) => {
          try {
            const usingSavedTarget = options.targetUrl === undefined;
            let launchTargetUrl: string | undefined;
            try {
              launchTargetUrl = normalizeLaunchTargetUrl(
                usingSavedTarget ? get().targetUrl : options.targetUrl,
              );
            } catch (error) {
              if (usingSavedTarget && error instanceof ScenarioTargetUrlError) {
                set({
                  targetUrl: null,
                  targetStatus: 'unknown',
                  error: 'Saved target URL was invalid and has been cleared. Launching against the server default target.',
                });
                launchTargetUrl = undefined;
              } else {
                throw error;
              }
            }
            const triggerData =
              options.expectWafBlocking !== undefined
                ? { expectWafBlocking: options.expectWafBlocking }
                : undefined;
            const response = await fetch(`${API_BASE}/simulations`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                scenarioId,
                ...(launchTargetUrl ? { targetUrl: launchTargetUrl } : {}),
                ...(triggerData ? { triggerData } : {}),
              }),
            });
            if (!response.ok) {
              const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
              throw new Error(err.error || `HTTP ${response.status}`);
            }
            const { executionId } = await response.json();
            seedPendingExecution(executionId, scenarioId, 'simulation', launchTargetUrl);
            return executionId;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to start simulation';
            set({ error: message });
            throw new Error(message);
          }
        },

        startAssessment: async (scenarioId: string, targetUrl?: string | null) => {
          try {
            const usingSavedTarget = targetUrl === undefined;
            let launchTargetUrl: string | undefined;
            try {
              launchTargetUrl = normalizeLaunchTargetUrl(
                usingSavedTarget ? get().targetUrl : targetUrl,
              );
            } catch (error) {
              if (usingSavedTarget && error instanceof ScenarioTargetUrlError) {
                set({
                  targetUrl: null,
                  targetStatus: 'unknown',
                  error: 'Saved target URL was invalid and has been cleared. Launching against the server default target.',
                });
                launchTargetUrl = undefined;
              } else {
                throw error;
              }
            }
            const response = await fetch(`${API_BASE}/assessments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ scenarioId, ...(launchTargetUrl ? { targetUrl: launchTargetUrl } : {}) }),
            });
            if (!response.ok) {
              const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
              throw new Error(err.error || `HTTP ${response.status}`);
            }
            const { executionId } = await response.json();
            seedPendingExecution(executionId, scenarioId, 'assessment', launchTargetUrl);
            return executionId;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to start assessment';
            set({ error: message });
            throw new Error(message);
          }
        },

        updateExecution: (execution: ScenarioExecution) => {
          set((state) => {
            const alreadyListed = state.executions.some((e) => e.id === execution.id);
            if (!alreadyListed && state.dismissedExecutionIds.includes(execution.id)) {
              // Row was dismissed from the sidebar; drop late snapshots rather than resurrect it.
              return {};
            }
            const newExecutions = alreadyListed
              ? state.executions.map((e) => (e.id === execution.id ? execution : e))
              : [execution, ...state.executions];
            const historyExecutions = state.historyExecutions.some((e) => e.id === execution.id)
              ? state.historyExecutions.map((e) => (e.id === execution.id ? execution : e))
              : state.historyExecutions;

            const activeExecution =
              state.activeExecution?.id === execution.id ? execution : state.activeExecution;

            return { executions: newExecutions, activeExecution, historyExecutions };
          });

          scheduleMetricsSample();
        },

        applyExecutionDelta: (delta: ScenarioExecutionDelta) => {
          let appliedDelta = false;

          set((state) => {
            const targetExecution = state.executions.find((execution) => execution.id === delta.id);
            if (!targetExecution) {
              return {};
            }

            appliedDelta = true;

            const mergedExecution = mergeExecutionDelta(targetExecution, delta);
            const executions = state.executions.map((execution) =>
              execution.id === delta.id ? mergedExecution : execution,
            );
            const historyExecutions = state.historyExecutions.some((execution) => execution.id === delta.id)
              ? state.historyExecutions.map((execution) => (
                  execution.id === delta.id ? mergeExecutionDelta(execution, delta) : execution
                ))
              : state.historyExecutions;
            const activeExecution =
              state.activeExecution?.id === delta.id ? mergedExecution : state.activeExecution;

            return {
              executions,
              historyExecutions,
              activeExecution,
            };
          });

          if (appliedDelta) {
            scheduleMetricsSample();
          }
        },

        setActiveExecution: (executionId: string | null) => {
          if (!executionId) {
            set({ activeExecution: null });
            return;
          }
          const execution = get().executions.find((e) => e.id === executionId) ?? null;
          set({ activeExecution: execution });
        },

        setWsConnected: (connected: boolean) => set({ wsConnected: connected }),
        clearError: () => set({ error: null }),
        resetMetricsHistory: () => {
          clearMetricsFlushTimer();
          set({ metricsHistory: [] });
        },

        sendMessage: (msg: any) => {
          window.dispatchEvent(new CustomEvent('ws:send', { detail: msg }));
        },

        onMessage: (handler: (msg: any) => void) => {
          const listener = (e: any) => handler(e.detail);
          window.addEventListener('ws:message', listener);
          return () => {
            window.removeEventListener('ws:message', listener);
          };
        },

        pauseExecution: async (id: string) => {
          const res = await fetch(`${API_BASE}/executions/${id}/pause`, { method: 'POST' });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            set({ error: err.error });
          }
        },

        resumeExecution: async (id: string) => {
          const res = await fetch(`${API_BASE}/executions/${id}/resume`, { method: 'POST' });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            set({ error: err.error });
          }
        },

        cancelExecution: async (id: string) => {
          const res = await fetch(`${API_BASE}/executions/${id}/cancel`, { method: 'POST' });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            set({ error: err.error });
          }
        },

        restartExecution: async (id: string) => {
          const res = await fetch(`${API_BASE}/executions/${id}/restart`, { method: 'POST' });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            set({ error: err.error });
            throw new Error(err.error);
          }
          const { executionId } = await res.json();
          return executionId;
        },

        pauseAll: async () => {
          const res = await fetch(`${API_BASE}/executions/pause-all`, { method: 'POST' });
          if (!res.ok) {
            set({ error: 'Failed to pause all executions' });
            return 0;
          }
          const { count } = await res.json();
          return count;
        },

        resumeAll: async () => {
          const res = await fetch(`${API_BASE}/executions/resume-all`, { method: 'POST' });
          if (!res.ok) {
            set({ error: 'Failed to resume all executions' });
            return 0;
          }
          const { count } = await res.json();
          return count;
        },

        cancelAll: async () => {
          const res = await fetch(`${API_BASE}/executions/cancel-all`, { method: 'POST' });
          if (!res.ok) {
            set({ error: 'Failed to cancel all executions' });
            return 0;
          }
          const { count } = await res.json();
          return count;
        },

        dismissExecution: (id: string) => {
          set((state) => {
            const target = state.executions.find((e) => e.id === id);
            if (!target || !TERMINAL_EXECUTION_STATUSES.has(target.status)) {
              return {};
            }
            const executions = state.executions.filter((e) => e.id !== id);
            const activeExecution =
              state.activeExecution?.id === id ? null : state.activeExecution;
            const dismissedExecutionIds = state.dismissedExecutionIds.includes(id)
              ? state.dismissedExecutionIds
              : [...state.dismissedExecutionIds, id].slice(-MAX_DISMISSED_EXECUTION_IDS);
            return { executions, activeExecution, dismissedExecutionIds };
          });
        },

        clearFinishedExecutions: (mode: ScenarioExecution['mode']) => {
          set((state) => {
            const removedIds: string[] = [];
            const executions = state.executions.filter((e) => {
              const shouldRemove = e.mode === mode && TERMINAL_EXECUTION_STATUSES.has(e.status);
              if (shouldRemove) removedIds.push(e.id);
              return !shouldRemove;
            });
            if (removedIds.length === 0) return {};
            const activeExecution =
              state.activeExecution && removedIds.includes(state.activeExecution.id)
                ? null
                : state.activeExecution;
            const merged = [...state.dismissedExecutionIds];
            for (const id of removedIds) {
              if (!merged.includes(id)) merged.push(id);
            }
            const dismissedExecutionIds = merged.slice(-MAX_DISMISSED_EXECUTION_IDS);
            return { executions, activeExecution, dismissedExecutionIds };
          });
        },

        togglePinnedScenario: (id: string) => {
          set((state) => ({
            pinnedScenarioIds: state.pinnedScenarioIds.includes(id)
              ? state.pinnedScenarioIds.filter((pid) => pid !== id)
              : [...state.pinnedScenarioIds, id],
          }));
        },

        setTargetUrl: (url: string | null) => set({ targetUrl: url, targetStatus: 'unknown' }),

        sanitizeTransientState: () => {
          set((state) => {
            const needsUpdate = state.executions.some(e => e.status === 'running' || e.status === 'paused');
            if (!needsUpdate) return {};

            return {
              executions: state.executions.map(e => (
                (e.status === 'running' || e.status === 'paused')
                  ? { ...e, status: 'cancelled' as const }
                  : e
              ))
            };
          });
        },

        destroy: () => {
          clearMetricsFlushTimer();
        },
      };
    },
    {
      name: 'crucible-storage',
      storage: createJSONStorage(resolvePersistentStorage),
      partialize: (state) => ({
        targetUrl: state.targetUrl,
        pinnedScenarioIds: state.pinnedScenarioIds,
        dismissedExecutionIds: state.dismissedExecutionIds,
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<CatalogStateSnapshot>;
        return {
          ...currentState,
          ...persisted,
          targetUrl: normalizePersistedTargetUrl(persisted.targetUrl),
          pinnedScenarioIds: Array.isArray(persisted.pinnedScenarioIds)
            ? persisted.pinnedScenarioIds
            : currentState.pinnedScenarioIds,
          dismissedExecutionIds: Array.isArray(persisted.dismissedExecutionIds)
            ? persisted.dismissedExecutionIds.slice(-MAX_DISMISSED_EXECUTION_IDS)
            : currentState.dismissedExecutionIds,
        };
      },
      // Defer rehydration until after React mounts so SSR output and the
      // first client render match. AppInitializer triggers rehydrate().
      skipHydration: true,
    },
  ),
);

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolvePersistentStorage(): Storage {
  if (
    typeof localStorage !== 'undefined' &&
    typeof localStorage.getItem === 'function' &&
    typeof localStorage.setItem === 'function' &&
    typeof localStorage.removeItem === 'function'
  ) {
    return localStorage;
  }

  return noopStorage;
}

function buildExecutionHistoryUrl(
  filters: ExecutionHistoryFilters,
  limit: number,
  offset: number,
): string {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  if (filters.scenarioId) params.set('scenarioId', filters.scenarioId);
  if (filters.status) params.set('status', filters.status);
  if (filters.mode) params.set('mode', filters.mode);

  const since = toStartOfDayTimestamp(filters.dateFrom);
  const until = toEndOfDayTimestamp(filters.dateTo);
  if (since !== undefined) params.set('since', String(since));
  if (until !== undefined) params.set('until', String(until));

  return `${API_BASE}/executions?${params.toString()}`;
}

function normalizeLaunchTargetUrl(value: string | null | undefined): string | undefined {
  return normalizeScenarioTargetUrl(value);
}

function normalizePersistedTargetUrl(value: string | null | undefined): string | null {
  try {
    return normalizeScenarioTargetUrl(value) ?? null;
  } catch {
    return null;
  }
}

function toStartOfDayTimestamp(value: string): number | undefined {
  if (!value) return undefined;
  return new Date(`${value}T00:00:00`).getTime();
}

function toEndOfDayTimestamp(value: string): number | undefined {
  if (!value) return undefined;
  return new Date(`${value}T23:59:59.999`).getTime();
}

function appendMetricsPoint(
  history: ExecutionMetricsPoint[],
  point: ExecutionMetricsPoint,
  limit: number,
): ExecutionMetricsPoint[] {
  return history.length >= limit ? [...history.slice(1), point] : [...history, point];
}

function isActiveExecution(status: ExecutionStatus): boolean {
  return status === 'pending' || status === 'running' || status === 'paused';
}

function deriveMetricsSnapshot(executions: ScenarioExecution[]): ExecutionMetricsSnapshot {
  let activeExecutions = 0;
  let completedExecutions = 0;
  let failedExecutions = 0;
  let runningSteps = 0;
  let completedSteps = 0;
  let failedSteps = 0;

  for (const execution of executions) {
    if (isActiveExecution(execution.status)) activeExecutions += 1;
    if (execution.status === 'completed') completedExecutions += 1;
    // Cancelled runs are grouped into the fault lane so operator charts show non-success exits together.
    if (execution.status === 'failed' || execution.status === 'cancelled') failedExecutions += 1;

    for (const step of execution.steps) {
      if (step.status === 'running') runningSteps += 1;
      if (step.status === 'completed') completedSteps += 1;
      if (step.status === 'failed' || step.status === 'cancelled') failedSteps += 1;
    }
  }

  return {
    activeExecutions,
    completedExecutions,
    failedExecutions,
    runningSteps,
    completedSteps,
    failedSteps,
  };
}

function mergeExecutionDelta(
  execution: ScenarioExecution,
  delta: ScenarioExecutionDelta,
): ScenarioExecution {
  const { steps: stepChanges, ...topLevelChanges } = delta.changes;

  return {
    ...execution,
    ...topLevelChanges,
    steps: stepChanges ? mergeExecutionSteps(execution.steps, stepChanges) : execution.steps,
  };
}

function mergeExecutionSteps(
  existingSteps: ExecutionStepResult[],
  stepChanges: ExecutionStepDelta[],
): ExecutionStepResult[] {
  const stepsById = new Map(existingSteps.map((step) => [step.stepId, step]));
  const order: string[] = existingSteps.map((s) => s.stepId);

  for (const stepChange of stepChanges) {
    const existingStep = stepsById.get(stepChange.stepId);
    if (existingStep) {
      stepsById.set(stepChange.stepId, { ...existingStep, ...stepChange });
    } else {
      // New step from delta - provide safe defaults for required fields
      const newStep: ExecutionStepResult = {
        status: 'pending',
        attempts: 0,
        logs: [],
        assertions: [],
        details: {},
        ...stepChange,
      };
      stepsById.set(stepChange.stepId, newStep);
      order.push(stepChange.stepId);
    }
  }

  return order.map((id) => stepsById.get(id)!);
}
