// Client
export { CrucibleClient } from './client.js';
export { CrucibleSocket } from './socket.js';
export { CrucibleApiError } from './errors.js';

// Types (client-specific + domain types — all self-contained)
export type {
  CrucibleClientOptions,
  CrucibleSocketOptions,
  HealthResponse,
  SimulationResponse,
  AssessmentResponse,
  BulkActionResponse,
  OkResponse,
  RestartResponse,
  ListExecutionsParams,
  GetReportOptions,
  TriggerData,
  WebSocketCommand,
  WebSocketCommandType,
  WebSocketEventMap,
  WebSocketEventName,
  ScenarioExecutionDelta,
  ExecutionStepDelta,
  Scenario,
  ScenarioStep,
  Request,
  ExecutionConfig,
  Expect,
  Extract,
  ExtractRule,
  WhenCondition,
  StepExecutionMode,
  ScenarioExecution,
  ExecutionStepResult,
  ExecutionStatus,
  ExecutionMode,
  ExecutionFilters,
  AssertionResult,
  PausedState,
} from './types.js';
