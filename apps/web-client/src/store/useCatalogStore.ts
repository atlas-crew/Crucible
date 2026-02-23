import { create } from 'zustand';
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
}

export interface ExecutionStepResult {
  stepId: string;
  status: ExecutionStatus;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  result?: Record<string, unknown>;
  error?: string;
  logs?: string[];
  attempts: number;
  assertions?: AssertionResult[];
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
  report?: {
    summary: string;
    passed: boolean;
    score: number;
    artifacts: string[];
  };
}

// ── Store ────────────────────────────────────────────────────────────

interface CatalogState {
  scenarios: Scenario[];
  executions: ScenarioExecution[];
  activeExecution: ScenarioExecution | null;
  isLoading: boolean;
  error: string | null;
  wsConnected: boolean;

  fetchScenarios: () => Promise<void>;
  updateScenario: (id: string, data: Scenario) => Promise<void>;
  startSimulation: (scenarioId: string) => Promise<string>;
  startAssessment: (scenarioId: string) => Promise<string>;
  updateExecution: (execution: ScenarioExecution) => void;
  setActiveExecution: (executionId: string | null) => void;
  setWsConnected: (connected: boolean) => void;
  clearError: () => void;

  pauseExecution: (id: string) => Promise<void>;
  resumeExecution: (id: string) => Promise<void>;
  cancelExecution: (id: string) => Promise<void>;
  restartExecution: (id: string) => Promise<string>;
  pauseAll: () => Promise<number>;
  resumeAll: () => Promise<number>;
  cancelAll: () => Promise<number>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const useCatalogStore = create<CatalogState>((set, get) => ({
  scenarios: [],
  executions: [],
  activeExecution: null,
  isLoading: false,
  error: null,
  wsConnected: false,

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

  startSimulation: async (scenarioId: string) => {
    try {
      const response = await fetch(`${API_BASE}/simulations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { executionId } = await response.json();
      return executionId;
    } catch {
      set({ error: 'Failed to start simulation' });
      throw new Error('Failed to start simulation');
    }
  },

  startAssessment: async (scenarioId: string) => {
    try {
      const response = await fetch(`${API_BASE}/assessments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { executionId } = await response.json();
      return executionId;
    } catch {
      set({ error: 'Failed to start assessment' });
      throw new Error('Failed to start assessment');
    }
  },

  updateExecution: (execution: ScenarioExecution) => {
    set((state) => {
      const newExecutions = state.executions.some((e) => e.id === execution.id)
        ? state.executions.map((e) => (e.id === execution.id ? execution : e))
        : [execution, ...state.executions];

      const activeExecution =
        state.activeExecution?.id === execution.id ? execution : state.activeExecution;

      return { executions: newExecutions, activeExecution };
    });
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
}));
