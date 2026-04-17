import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogInitialState, useCatalogStore } from '../useCatalogStore';

// ── TASK-15: useCatalogStore operations and error handling ────────────

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

function mockJsonResponse(status: number, data: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

describe('useCatalogStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useCatalogStore.getState().resetMetricsHistory();
    useCatalogStore.setState({
      ...catalogInitialState,
    });
  });

  afterEach(() => {
    useCatalogStore.getState().resetMetricsHistory();
    localStorage.clear();
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('has empty initial state', () => {
      const state = useCatalogStore.getState();
      expect(state.scenarios).toEqual([]);
      expect(state.executions).toEqual([]);
      expect(state.activeExecution).toBeNull();
      expect(state.historyExecutions).toEqual([]);
      expect(state.historyOffset).toBe(0);
      expect(state.historyHasNextPage).toBe(false);
      expect(state.historyInitialized).toBe(false);
      expect(state.metricsHistory).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.wsConnected).toBe(false);
    });

    it('normalizes persisted target URLs during rehydration', async () => {
      localStorage.setItem('crucible-storage', JSON.stringify({
        state: {
          targetUrl: 'http://demo.local/#/app',
          pinnedScenarioIds: ['scenario-1'],
        },
        version: 0,
      }));

      await useCatalogStore.persist.rehydrate();

      const state = useCatalogStore.getState();
      expect(state.targetUrl).toBe('http://demo.local');
      expect(state.pinnedScenarioIds).toEqual(['scenario-1']);
    });
  });

  describe('execution history pagination', () => {
    it('fetches the newest execution history page into the dedicated history slice', async () => {
      const executions = [
        { id: 'exec-1', scenarioId: 'a', mode: 'assessment', status: 'completed', steps: [] },
        { id: 'exec-2', scenarioId: 'b', mode: 'assessment', status: 'failed', steps: [] },
      ];
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, executions));

      await useCatalogStore.getState().fetchExecutionHistory({ reset: true });

      const state = useCatalogStore.getState();
      expect(state.historyExecutions).toEqual(executions);
      expect(state.historyOffset).toBe(2);
      expect(state.historyInitialized).toBe(true);
      expect(state.historyHasNextPage).toBe(false);
      expect(state.executions).toEqual([]);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/executions?limit=10&offset=0'),
      );
    });

    it('loads older execution history on demand without polluting the live executions slice', async () => {
      mockFetch
        .mockResolvedValueOnce(mockJsonResponse(200, [
          { id: 'exec-1', scenarioId: 'a', mode: 'assessment', status: 'completed', steps: [] },
          { id: 'exec-2', scenarioId: 'b', mode: 'assessment', status: 'failed', steps: [] },
          { id: 'exec-3', scenarioId: 'c', mode: 'assessment', status: 'completed', steps: [] },
          { id: 'exec-4', scenarioId: 'd', mode: 'assessment', status: 'failed', steps: [] },
          { id: 'exec-5', scenarioId: 'e', mode: 'assessment', status: 'completed', steps: [] },
          { id: 'exec-6', scenarioId: 'f', mode: 'assessment', status: 'failed', steps: [] },
          { id: 'exec-7', scenarioId: 'g', mode: 'assessment', status: 'completed', steps: [] },
          { id: 'exec-8', scenarioId: 'h', mode: 'assessment', status: 'failed', steps: [] },
          { id: 'exec-9', scenarioId: 'i', mode: 'assessment', status: 'completed', steps: [] },
          { id: 'exec-10', scenarioId: 'j', mode: 'assessment', status: 'failed', steps: [] },
        ]))
        .mockResolvedValueOnce(mockJsonResponse(200, [
          { id: 'exec-11', scenarioId: 'k', mode: 'assessment', status: 'completed', steps: [] },
        ]));

      await useCatalogStore.getState().fetchExecutionHistory({ reset: true });
      await useCatalogStore.getState().loadOlderExecutionHistory();

      const state = useCatalogStore.getState();
      expect(state.historyExecutions.map((execution) => execution.id)).toEqual([
        'exec-1',
        'exec-2',
        'exec-3',
        'exec-4',
        'exec-5',
        'exec-6',
        'exec-7',
        'exec-8',
        'exec-9',
        'exec-10',
        'exec-11',
      ]);
      expect(state.historyOffset).toBe(11);
      expect(state.historyHasNextPage).toBe(false);
      expect(state.executions).toEqual([]);
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('/executions?limit=10&offset=10'),
      );
    });

    it('ignores stale history responses when filters change quickly', async () => {
      let resolveFirstRequest: (value: unknown) => void;
      let resolveSecondRequest: (value: unknown) => void;

      mockFetch
        .mockReturnValueOnce(new Promise((resolve) => {
          resolveFirstRequest = resolve;
        }))
        .mockReturnValueOnce(new Promise((resolve) => {
          resolveSecondRequest = resolve;
        }));

      const firstRequest = useCatalogStore.getState().fetchExecutionHistory({ reset: true });
      const secondRequest = useCatalogStore.getState().updateHistoryFilters({ status: 'failed' });

      resolveSecondRequest!(mockJsonResponse(200, [
        { id: 'exec-new', scenarioId: 'fresh', mode: 'assessment', status: 'failed', steps: [] },
      ]));
      await secondRequest;

      resolveFirstRequest!(mockJsonResponse(200, [
        { id: 'exec-stale', scenarioId: 'stale', mode: 'assessment', status: 'completed', steps: [] },
      ]));
      await firstRequest;

      const state = useCatalogStore.getState();
      expect(state.historyExecutions).toEqual([
        expect.objectContaining({ id: 'exec-new', status: 'failed' }),
      ]);
      expect(state.historyFilters.status).toBe('failed');
    });
  });

  describe('fetchScenarios', () => {
    it('fetches and sets scenarios', async () => {
      const scenarios = [
        { id: 'a', name: 'Alpha', steps: [] },
        { id: 'b', name: 'Beta', steps: [] },
      ];
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, scenarios));

      await useCatalogStore.getState().fetchScenarios();

      const state = useCatalogStore.getState();
      expect(state.scenarios).toEqual(scenarios);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('sets loading state during fetch', async () => {
      let resolvePromise: (v: any) => void;
      mockFetch.mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
      );

      const fetchPromise = useCatalogStore.getState().fetchScenarios();

      expect(useCatalogStore.getState().isLoading).toBe(true);

      resolvePromise!(mockJsonResponse(200, []));
      await fetchPromise;

      expect(useCatalogStore.getState().isLoading).toBe(false);
    });

    it('sets error on fetch failure', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(500, {}));

      await useCatalogStore.getState().fetchScenarios();

      const state = useCatalogStore.getState();
      expect(state.error).toBe('Failed to fetch scenarios');
      expect(state.isLoading).toBe(false);
    });

    it('sets error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await useCatalogStore.getState().fetchScenarios();

      expect(useCatalogStore.getState().error).toBe('Failed to fetch scenarios');
    });
  });

  describe('updateExecution', () => {
    it('adds a new execution', () => {
      const execution = {
        id: 'exec-1',
        scenarioId: 'a',
        mode: 'simulation' as const,
        status: 'running' as const,
        steps: [],
        attempts: 0,
      };

      useCatalogStore.getState().updateExecution(execution as any);

      expect(useCatalogStore.getState().executions).toHaveLength(1);
    });

    it('updates an existing execution in place', () => {
      const exec = {
        id: 'exec-1',
        scenarioId: 'a',
        mode: 'simulation' as const,
        status: 'running' as const,
        steps: [],
      };
      useCatalogStore.setState({ executions: [exec as any] });

      const updated = { ...exec, status: 'completed' as const };
      useCatalogStore.getState().updateExecution(updated as any);

      const state = useCatalogStore.getState();
      expect(state.executions).toHaveLength(1);
      expect(state.executions[0].status).toBe('completed');
    });

    it('updates activeExecution when it matches', () => {
      const exec = {
        id: 'exec-1',
        scenarioId: 'a',
        mode: 'simulation' as const,
        status: 'running' as const,
        steps: [],
      };
      useCatalogStore.setState({
        executions: [exec as any],
        activeExecution: exec as any,
      });

      const updated = { ...exec, status: 'completed' as const };
      useCatalogStore.getState().updateExecution(updated as any);

      expect(useCatalogStore.getState().activeExecution?.status).toBe('completed');
    });

    it('records a telemetry sample for the first live update', () => {
      const execution = {
        id: 'exec-1',
        scenarioId: 'a',
        mode: 'simulation' as const,
        status: 'running' as const,
        steps: [
          { stepId: 'step-a', status: 'running' as const, attempts: 1 },
          { stepId: 'step-b', status: 'completed' as const, attempts: 1 },
        ],
      };

      useCatalogStore.getState().updateExecution(execution as any);

      expect(useCatalogStore.getState().metricsHistory).toEqual([
        expect.objectContaining({
          activeExecutions: 1,
          completedExecutions: 0,
          failedExecutions: 0,
          runningSteps: 1,
          completedSteps: 1,
          failedSteps: 0,
        }),
      ]);
    });

    it('caps the telemetry buffer at the configured history limit', () => {
      useCatalogStore.setState({ metricsThrottleMs: 1, metricsHistoryLimit: 2 });

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-12T05:00:00.000Z'));

      useCatalogStore.getState().updateExecution({
        id: 'exec-1',
        scenarioId: 'a',
        mode: 'simulation',
        status: 'running',
        steps: [{ stepId: 'step-1', status: 'running', attempts: 1 }],
      } as any);

      vi.advanceTimersByTime(2);
      useCatalogStore.getState().updateExecution({
        id: 'exec-2',
        scenarioId: 'b',
        mode: 'simulation',
        status: 'completed',
        steps: [{ stepId: 'step-2', status: 'completed', attempts: 1 }],
      } as any);

      vi.advanceTimersByTime(2);
      useCatalogStore.getState().updateExecution({
        id: 'exec-3',
        scenarioId: 'c',
        mode: 'simulation',
        status: 'failed',
        steps: [{ stepId: 'step-3', status: 'failed', attempts: 1 }],
      } as any);

      const history = useCatalogStore.getState().metricsHistory;
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual(
        expect.objectContaining({
          completedExecutions: 1,
          completedSteps: 1,
        }),
      );
      expect(history[1]).toEqual(
        expect.objectContaining({
          failedExecutions: 1,
          failedSteps: 1,
        }),
      );

      vi.useRealTimers();
    });

    it('throttles telemetry sampling and flushes the latest state on a trailing timer', () => {
      useCatalogStore.setState({ metricsThrottleMs: 500, metricsHistoryLimit: 6 });

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-12T05:10:00.000Z'));

      useCatalogStore.getState().updateExecution({
        id: 'exec-1',
        scenarioId: 'a',
        mode: 'simulation',
        status: 'running',
        steps: [{ stepId: 'step-1', status: 'running', attempts: 1 }],
      } as any);

      expect(useCatalogStore.getState().metricsHistory).toHaveLength(1);

      useCatalogStore.getState().updateExecution({
        id: 'exec-1',
        scenarioId: 'a',
        mode: 'simulation',
        status: 'running',
        steps: [{ stepId: 'step-1', status: 'completed', attempts: 1 }],
      } as any);

      expect(useCatalogStore.getState().metricsHistory).toHaveLength(1);

      vi.advanceTimersByTime(499);
      expect(useCatalogStore.getState().metricsHistory).toHaveLength(1);

      vi.advanceTimersByTime(1);
      expect(useCatalogStore.getState().metricsHistory).toHaveLength(2);
      expect(useCatalogStore.getState().metricsHistory[1]).toEqual(
        expect.objectContaining({
          activeExecutions: 1,
          completedSteps: 1,
          runningSteps: 0,
        }),
      );
    });
  });

  describe('applyExecutionDelta', () => {
    it('merges top-level execution fields and existing step updates in place', () => {
      useCatalogStore.setState({
        executions: [
          {
            id: 'exec-1',
            scenarioId: 'scenario-a',
            mode: 'simulation',
            status: 'running',
            steps: [
              {
                stepId: 'step-1',
                status: 'running',
                attempts: 1,
                startedAt: 100,
              },
            ],
          } as any,
        ],
      });

      useCatalogStore.getState().applyExecutionDelta({
        id: 'exec-1',
        changes: {
          status: 'completed',
          duration: 1200,
          steps: [
            {
              stepId: 'step-1',
              status: 'completed',
              duration: 900,
              attempts: 1,
            },
          ],
        },
      });

      const execution = useCatalogStore.getState().executions[0];
      expect(execution.status).toBe('completed');
      expect(execution.duration).toBe(1200);
      expect(execution.steps[0]).toEqual(
        expect.objectContaining({
          stepId: 'step-1',
          status: 'completed',
          duration: 900,
          startedAt: 100,
        }),
      );
    });

    it('appends new step deltas and samples telemetry from the merged execution state', () => {
      useCatalogStore.setState({
        executions: [
          {
            id: 'exec-1',
            scenarioId: 'scenario-a',
            mode: 'simulation',
            status: 'running',
            steps: [{ stepId: 'step-1', status: 'completed', attempts: 1 }],
          } as any,
        ],
      });

      useCatalogStore.getState().applyExecutionDelta({
        id: 'exec-1',
        changes: {
          steps: [{ stepId: 'step-2', status: 'failed', attempts: 1, error: 'boom' }],
        },
      });

      const execution = useCatalogStore.getState().executions[0];
      expect(execution.steps).toHaveLength(2);
      expect(execution.steps[1]).toEqual(
        expect.objectContaining({
          stepId: 'step-2',
          status: 'failed',
          error: 'boom',
        }),
      );
      expect(useCatalogStore.getState().metricsHistory.at(-1)).toEqual(
        expect.objectContaining({
          completedSteps: 1,
          failedSteps: 1,
        }),
      );
    });

    it('ignores deltas for unknown executions', () => {
      useCatalogStore.getState().applyExecutionDelta({
        id: 'missing-exec',
        changes: {
          status: 'completed',
        },
      });

      expect(useCatalogStore.getState().executions).toEqual([]);
      expect(useCatalogStore.getState().metricsHistory).toEqual([]);
    });

    it('keeps activeExecution synchronized when merging a delta for the selected execution', () => {
      const execution = {
        id: 'exec-1',
        scenarioId: 'scenario-a',
        mode: 'simulation',
        status: 'running',
        steps: [{ stepId: 'step-1', status: 'running', attempts: 1 }],
      } as any;

      useCatalogStore.setState({
        executions: [execution],
        activeExecution: execution,
      });

      useCatalogStore.getState().applyExecutionDelta({
        id: 'exec-1',
        changes: {
          status: 'completed',
        },
      });

      expect(useCatalogStore.getState().activeExecution).toEqual(
        expect.objectContaining({
          id: 'exec-1',
          status: 'completed',
        }),
      );
    });
  });

  describe('setActiveExecution', () => {
    it('sets active execution by ID', () => {
      const exec = { id: 'exec-1', scenarioId: 'a', status: 'running', steps: [] };
      useCatalogStore.setState({ executions: [exec as any] });

      useCatalogStore.getState().setActiveExecution('exec-1');

      expect(useCatalogStore.getState().activeExecution?.id).toBe('exec-1');
    });

    it('clears active execution with null', () => {
      useCatalogStore.setState({ activeExecution: { id: 'x' } as any });

      useCatalogStore.getState().setActiveExecution(null);

      expect(useCatalogStore.getState().activeExecution).toBeNull();
    });
  });

  describe('clearError', () => {
    it('clears the error state', () => {
      useCatalogStore.setState({ error: 'Something went wrong' });

      useCatalogStore.getState().clearError();

      expect(useCatalogStore.getState().error).toBeNull();
    });
  });

  describe('startSimulation', () => {
    it('returns execution ID on success', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, { executionId: 'exec-123' }));

      const id = await useCatalogStore.getState().startSimulation('scenario-1');

      expect(id).toBe('exec-123');
    });

    it('includes the simulation blocked-expectation override in launch payloads', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, { executionId: 'exec-123' }));

      await useCatalogStore.getState().startSimulation('scenario-1', {
        targetUrl: 'http://demo.local',
        expectWafBlocking: false,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/simulations'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            scenarioId: 'scenario-1',
            targetUrl: 'http://demo.local',
            triggerData: {
              expectWafBlocking: false,
            },
          }),
        }),
      );
    });

    it('sets error and throws on failure', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(500, {}));

      await expect(useCatalogStore.getState().startSimulation('scenario-1')).rejects.toThrow(
        'HTTP 500',
      );

      expect(useCatalogStore.getState().error).toBe('HTTP 500');
    });

    it('clears an invalid saved target URL and falls back to the server default target', async () => {
      useCatalogStore.setState({ targetUrl: 'ftp://bad.local', targetStatus: 'online' });
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, { executionId: 'exec-123' }));

      await expect(useCatalogStore.getState().startSimulation('scenario-1')).resolves.toBe('exec-123');

      const state = useCatalogStore.getState();
      expect(state.targetUrl).toBeNull();
      expect(state.targetStatus).toBe('unknown');
      expect(state.error).toBe('Saved target URL was invalid and has been cleared. Launching against the server default target.');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/simulations'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ scenarioId: 'scenario-1' }),
        }),
      );
    });
  });

  describe('execution controls', () => {
    it('pauseExecution calls the correct endpoint', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, {}));

      await useCatalogStore.getState().pauseExecution('exec-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/executions/exec-1/pause'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('sets error when pause fails', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(400, { error: 'Not running' }));

      await useCatalogStore.getState().pauseExecution('exec-1');

      expect(useCatalogStore.getState().error).toBe('Not running');
    });
  });
});

describe('launch seeding', () => {
  it('does not overwrite a newer execution that already arrived over WebSocket', async () => {
    const existingExecution = {
      id: 'exec-1',
      scenarioId: 'sc-1',
      mode: 'simulation' as const,
      status: 'running' as const,
      startedAt: 123,
      steps: [
        {
          stepId: 'step-1',
          status: 'running' as const,
          attempts: 1,
        },
      ],
      targetUrl: 'http://target.local',
    };

    useCatalogStore.setState({
      executions: [existingExecution as any],
      activeExecution: null,
      targetUrl: 'http://target.local',
    });

    mockFetch.mockResolvedValueOnce(mockJsonResponse(200, { executionId: 'exec-1' }));

    await useCatalogStore.getState().startSimulation('scenario-1');

    const state = useCatalogStore.getState();
    expect(state.executions).toHaveLength(1);
    expect(state.executions[0]).toEqual(existingExecution);
    expect(state.activeExecution).toEqual(existingExecution);
  });
});
