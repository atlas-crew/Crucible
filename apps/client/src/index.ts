// Client
export { CrucibleClient } from './client.js';
export { CrucibleSocket } from './socket.js';
export { CrucibleApiError } from './errors.js';

// Client-specific types
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
} from './types.js';

// Re-export domain types from catalog so consumers only need @crucible/client
export type {
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
} from '@crucible/catalog';
