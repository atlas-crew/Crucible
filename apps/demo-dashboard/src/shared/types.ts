// Scenario and ScenarioStep types come from the catalog package
export type { Scenario, ScenarioStep } from '@crucible/catalog';

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused' | 'skipped';

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

export type ExecutionMode = 'simulation' | 'assessment';

export interface ScenarioExecution {
  id: string;
  scenarioId: string;
  mode: ExecutionMode;
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

export interface WebSocketMessage {
  type: string;
  payload?: Record<string, unknown>;
  timestamp: number;
}

export interface DashboardCommand extends WebSocketMessage {
  type:
    | 'SCENARIO_START'
    | 'SCENARIO_STOP'
    | 'SCENARIO_PAUSE'
    | 'SCENARIO_RESUME'
    | 'SCENARIO_RESTART'
    | 'GET_STATUS'
    | 'GET_SCENARIOS'
    | 'PAUSE_ALL'
    | 'RESUME_ALL'
    | 'CANCEL_ALL';
  payload: {
    scenarioId?: string;
    executionId?: string;
    filters?: Record<string, unknown>;
  };
}

export interface DashboardEvent {
  type:
    | 'EXECUTION_STARTED'
    | 'EXECUTION_UPDATED'
    | 'EXECUTION_COMPLETED'
    | 'EXECUTION_FAILED'
    | 'EXECUTION_PAUSED'
    | 'EXECUTION_CANCELLED'
    | 'EXECUTION_RESUMED'
    | 'STATUS_UPDATE'
    | 'SCENARIOS_LIST';
  payload: ScenarioExecution | Record<string, unknown>;
  timestamp: number;
}
