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
  overridden?: boolean;
  authoredExpected?: unknown;
}

export interface SimulationTriggerData extends Record<string, unknown> {
  expectWafBlocking?: boolean;
}

export type RunnerFindingSeverity =
  | 'info'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'
  | 'unknown';

export interface RunnerSummary {
  type: 'k6' | 'nuclei';
  summary?: string;
  /** True when the captured summary exceeded the runner's stdout cap. */
  summaryTruncated?: boolean;
  exitCode?: number;
  targetUrl?: string;
  artifacts?: string[];
  metrics?: {
    checksPassed?: number;
    checksFailed?: number;
    thresholdsPassed?: number;
    thresholdsFailed?: number;
    httpReqDurationP95Ms?: number;
    iterations?: number;
    requests?: number;
  };
  findings?: {
    total: number;
    bySeverity?: Partial<Record<RunnerFindingSeverity, number>>;
  };
}

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
  targetUrl: string;
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
    | 'CANCEL_ALL'
    | 'TERMINAL_START'
    | 'TERMINAL_DATA'
    | 'TERMINAL_RESIZE'
    | 'TERMINAL_STOP';
  payload: {
    scenarioId?: string;
    executionId?: string;
    filters?: Record<string, unknown>;
    data?: string;
    cols?: number;
    rows?: number;
  };
}

export interface DashboardEvent {
  type:
    | 'EXECUTION_STARTED'
    | 'EXECUTION_DELTA'
    | 'EXECUTION_UPDATED'
    | 'EXECUTION_COMPLETED'
    | 'EXECUTION_FAILED'
    | 'EXECUTION_PAUSED'
    | 'EXECUTION_CANCELLED'
    | 'EXECUTION_RESUMED'
    | 'STATUS_UPDATE'
    | 'SCENARIOS_LIST'
    | 'TERMINAL_OUTPUT';
  payload: ScenarioExecution | ScenarioExecutionDelta | Record<string, unknown>;
  format?: 'snapshot' | 'delta';
  timestamp: number;
}
