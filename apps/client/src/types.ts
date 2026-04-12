// ── Domain types (standalone — no external dependency) ──────────────

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused'
  | 'skipped';

export type ExecutionMode = 'simulation' | 'assessment';

export type StepExecutionMode = 'sequential' | 'parallel';

export interface Request {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  url: string;
  headers?: Record<string, string>;
  body?: string | Record<string, unknown> | unknown[];
  params?: Record<string, string>;
}

export interface ExecutionConfig {
  delayMs?: number;
  retries?: number;
  jitter?: number;
  iterations?: number;
}

export interface Expect {
  status?: number;
  blocked?: boolean;
  bodyContains?: string;
  bodyNotContains?: string;
  headerPresent?: string;
  headerEquals?: Record<string, string>;
}

export interface ExtractRule {
  from: 'body' | 'header' | 'status';
  path?: string;
}

export type Extract = Record<string, ExtractRule>;

export interface WhenCondition {
  step: string;
  succeeded?: boolean;
  status?: number;
}

export interface ScenarioStep {
  id: string;
  name: string;
  stage: string;
  request: Request;
  execution?: ExecutionConfig;
  expect?: Expect;
  extract?: Extract;
  executionMode?: StepExecutionMode;
  parallelGroup?: number;
  dependsOn?: string[];
  when?: WhenCondition;
}

export interface Scenario {
  id: string;
  name: string;
  description?: string;
  category?: string;
  difficulty?: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  steps: ScenarioStep[];
  version?: number;
  tags?: string[];
  rule_ids?: string[];
  target?: string;
  sourceIp?: string;
  kind?: string;
  [key: string]: unknown;
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
  };
  error?: string;
  logs?: string[];
  attempts: number;
  assertions?: AssertionResult[];
}

export interface PausedState {
  pendingStepIds: string[];
  completedStepIds: string[];
  context: Record<string, unknown>;
  passedSteps: number;
  stepResults: Record<string, ExecutionStepResult>;
}

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
  targetUrl?: string;
  report?: {
    summary: string;
    passed: boolean;
    score: number;
    artifacts: string[];
  };
}

export interface ExecutionFilters {
  scenarioId?: string;
  status?: ExecutionStatus | ExecutionStatus[];
  mode?: ExecutionMode;
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
  targetUrl?: string;
}

// ── Client options ──────────────────────────────────────────────────

export interface CrucibleClientOptions {
  /** Base URL of the Crucible server (e.g. "http://localhost:3000"). */
  baseUrl: string;
  /** Extra headers to send with every request. */
  headers?: Record<string, string>;
  /** Custom fetch implementation (defaults to globalThis.fetch). */
  fetch?: typeof globalThis.fetch;
  /** Request timeout in milliseconds. Applied via AbortSignal.timeout(). */
  timeout?: number;
}

// ── REST response types ─────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  timestamp: number;
  scenarios: number;
  targetUrl: string;
}

export interface SimulationResponse {
  executionId: string;
  mode: 'simulation';
  wsUrl: string;
}

export interface AssessmentResponse {
  executionId: string;
  mode: 'assessment';
  reportUrl: string;
}

export interface BulkActionResponse {
  count: number;
}

export interface OkResponse {
  ok: true;
}

export interface RestartResponse {
  executionId: string;
}

// ── Query parameters ────────────────────────────────────────────────

export interface ListExecutionsParams {
  scenarioId?: string;
  status?: ExecutionStatus | ExecutionStatus[];
  mode?: ExecutionMode;
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
}

// ── WebSocket types ─────────────────────────────────────────────────

export interface ExecutionStepDelta extends Partial<Omit<ExecutionStepResult, 'stepId'>> {
  stepId: string;
}

export interface ScenarioExecutionDelta {
  id: string;
  changes: Partial<Omit<ScenarioExecution, 'id' | 'steps'>> & {
    steps?: ExecutionStepDelta[];
  };
}

export interface WebSocketEventMap {
  'execution:started': ScenarioExecution;
  'execution:updated': ScenarioExecution;
  'execution:completed': ScenarioExecution;
  'execution:failed': ScenarioExecution;
  'execution:paused': ScenarioExecution;
  'execution:cancelled': ScenarioExecution;
  'execution:resumed': ScenarioExecution;
  'execution:delta': ScenarioExecutionDelta;
  'status:update': ScenarioExecution;
  'terminal:output': { executionId: string; data: string };
  open: undefined;
  close: { code: number; reason: string };
  error: Event;
}

export type WebSocketEventName = keyof WebSocketEventMap;

/** Known command types accepted by the Crucible WebSocket server. */
export type WebSocketCommandType =
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

/** Outgoing command sent over WebSocket. */
export interface WebSocketCommand {
  type: WebSocketCommandType;
  payload?: Record<string, unknown>;
  timestamp?: number;
}

// ── Trigger data ────────────────────────────────────────────────────

export type TriggerData = Record<string, unknown>;

// ── Report options ──────────────────────────────────────────────────

export interface GetReportOptions {
  format?: 'json' | 'html';
}

// ── Socket options ──────────────────────────────────────────────────

export interface CrucibleSocketOptions {
  /** WebSocket URL. If omitted, derived from the client's baseUrl. */
  url?: string;
  /** Minimum reconnect delay in ms (default: 1000). */
  minReconnectDelay?: number;
  /** Maximum reconnect delay in ms (default: 30000). */
  maxReconnectDelay?: number;
  /** Whether to auto-reconnect on close (default: true). */
  autoReconnect?: boolean;
}
