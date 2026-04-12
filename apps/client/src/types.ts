import type {
  ExecutionMode,
  ExecutionStatus,
  ExecutionStepResult,
  Scenario,
  ScenarioExecution,
} from '@crucible/catalog';

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
