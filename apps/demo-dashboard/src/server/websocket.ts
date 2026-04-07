import { WebSocket, WebSocketServer } from 'ws';
import { isDeepStrictEqual } from 'node:util';
import { ScenarioEngine } from './engine.js';
import { TerminalService } from './terminal.js';
import type {
  DashboardCommand,
  DashboardEvent,
  ExecutionStepDelta,
  ExecutionStepResult,
  ScenarioExecution,
  ScenarioExecutionDelta,
  WebSocketMessage,
} from '../shared/types.js';

export function setupWebSocket(wss: WebSocketServer, engine: ScenarioEngine, terminal: TerminalService): void {
  const executionSnapshots = new Map<string, ScenarioExecution>();

  // Periodic cleanup of stale snapshots (P1-001)
  const SNAPSHOT_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 mins
  setInterval(() => {
    const activeIds = new Set(engine.listExecutions().map((e) => e.id));
    for (const id of executionSnapshots.keys()) {
      if (!activeIds.has(id)) {
        executionSnapshots.delete(id);
      }
    }
  }, SNAPSHOT_CLEANUP_INTERVAL);

  terminal.on('terminal:output', ({ id, data }) => {
    broadcast(wss, {
      type: 'TERMINAL_OUTPUT',
      payload: { executionId: id, data },
      timestamp: Date.now(),
    });
  });

  engine.on('execution:started', (execution) => {
    executionSnapshots.set(execution.id, cloneExecution(execution));
    broadcast(wss, createSnapshotEvent('EXECUTION_STARTED', execution));
  });

  engine.on('execution:updated', (execution) => {
    const previousSnapshot = executionSnapshots.get(execution.id);
    const currentSnapshot = cloneExecution(execution);
    executionSnapshots.set(execution.id, currentSnapshot);

    if (!previousSnapshot) {
      broadcast(wss, createSnapshotEvent('EXECUTION_UPDATED', execution));
      return;
    }

    const delta = buildExecutionDelta(previousSnapshot, currentSnapshot);
    if (!hasExecutionChanges(delta)) {
      return;
    }

    broadcast(wss, {
      type: 'EXECUTION_DELTA',
      payload: delta,
      format: 'delta',
      timestamp: Date.now(),
    });
  });

  engine.on('execution:completed', (execution) => {
    executionSnapshots.delete(execution.id);
    broadcast(wss, createSnapshotEvent('EXECUTION_COMPLETED', execution));
  });

  engine.on('execution:failed', (execution) => {
    executionSnapshots.delete(execution.id);
    broadcast(wss, createSnapshotEvent('EXECUTION_FAILED', execution));
  });

  engine.on('execution:paused', (execution) => {
    executionSnapshots.set(execution.id, cloneExecution(execution));
    broadcast(wss, createSnapshotEvent('EXECUTION_PAUSED', execution));
  });

  engine.on('execution:cancelled', (execution) => {
    executionSnapshots.delete(execution.id);
    broadcast(wss, createSnapshotEvent('EXECUTION_CANCELLED', execution));
  });

  engine.on('execution:resumed', (execution) => {
    executionSnapshots.set(execution.id, cloneExecution(execution));
    broadcast(wss, createSnapshotEvent('EXECUTION_RESUMED', execution));
  });

  wss.on('connection', (ws: WebSocket) => {
    console.log('Client connected');

    for (const execution of engine.listExecutions()) {
      if (!executionSnapshots.has(execution.id)) {
        executionSnapshots.set(execution.id, cloneExecution(execution));
      }
      ws.send(JSON.stringify(createSnapshotEvent('STATUS_UPDATE', execution)));
    }

    ws.on('message', async (message: string) => {
      try {
        const data: WebSocketMessage = JSON.parse(message);
        const command = data as DashboardCommand;

        switch (command.type) {
          case 'SCENARIO_START':
            if (command.payload.scenarioId) {
              try {
                const executionId = await engine.startScenario(
                  command.payload.scenarioId,
                  'simulation',
                  command.payload.filters,
                );
                ws.send(
                  JSON.stringify({
                    type: 'EXECUTION_STARTED',
                    payload: { executionId },
                    timestamp: Date.now(),
                  } as DashboardEvent),
                );
              } catch (err) {
                ws.send(
                  JSON.stringify({
                    type: 'EXECUTION_FAILED',
                    payload: { error: err instanceof Error ? err.message : String(err) },
                    timestamp: Date.now(),
                  } as DashboardEvent),
                );
              }
            }
            break;

          case 'SCENARIO_PAUSE':
            if (command.payload.executionId) {
              engine.pauseExecution(command.payload.executionId);
            }
            break;

          case 'SCENARIO_RESUME':
            if (command.payload.executionId) {
              engine.resumeExecution(command.payload.executionId);
            }
            break;

          case 'SCENARIO_STOP':
            if (command.payload.executionId) {
              engine.cancelExecution(command.payload.executionId);
            }
            break;

          case 'SCENARIO_RESTART':
            if (command.payload.executionId) {
              const newId = await engine.restartExecution(command.payload.executionId);
              if (newId) {
                ws.send(
                  JSON.stringify({
                    type: 'EXECUTION_STARTED',
                    payload: { executionId: newId },
                    timestamp: Date.now(),
                  } as DashboardEvent),
                );
              }
            }
            break;

          case 'PAUSE_ALL':
            engine.pauseAll();
            break;

          case 'RESUME_ALL':
            engine.resumeAll();
            break;

          case 'CANCEL_ALL':
            engine.cancelAll();
            break;

          case 'TERMINAL_START':
            if (command.payload.executionId && canAccessTerminal(engine, command.payload.executionId)) {
              const cols = clamp(command.payload.cols || 80, 10, 500);
              const rows = clamp(command.payload.rows || 24, 5, 200);
              terminal.startSession(command.payload.executionId, cols, rows);
            }
            break;

          case 'TERMINAL_DATA':
            if (command.payload.executionId && command.payload.data && canAccessTerminal(engine, command.payload.executionId)) {
              // Limit data size to prevent resource exhaustion (P1-002)
              const data = command.payload.data.slice(0, 8192);
              terminal.sendInput(command.payload.executionId, data);
            }
            break;

          case 'TERMINAL_RESIZE':
            if (command.payload.executionId && command.payload.cols && command.payload.rows && canAccessTerminal(engine, command.payload.executionId)) {
              const cols = clamp(command.payload.cols, 10, 500);
              const rows = clamp(command.payload.rows, 5, 200);
              terminal.resize(command.payload.executionId, cols, rows);
            }
            break;

          case 'TERMINAL_STOP':
            if (command.payload.executionId && canAccessTerminal(engine, command.payload.executionId)) {
              terminal.stopSession(command.payload.executionId);
            }
            break;

          case 'GET_STATUS':
            if (command.payload.executionId) {
              const execution = engine.getExecution(command.payload.executionId);
              if (execution) {
                ws.send(
                  JSON.stringify({
                    type: 'STATUS_UPDATE',
                    payload: execution,
                    format: 'snapshot',
                    timestamp: Date.now(),
                  } as DashboardEvent),
                );
              } else {
                ws.send(
                  JSON.stringify({
                    type: 'STATUS_UPDATE',
                    payload: { error: 'Execution not found' },
                    timestamp: Date.now(),
                  } as DashboardEvent),
                );
              }
            }
            break;

          default:
            console.warn('Unknown command type:', command.type);
        }
      } catch (err) {
        console.error('WebSocket error:', err);
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected');
    });
  });
}

function broadcast(wss: WebSocketServer, message: DashboardEvent) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

function createSnapshotEvent(
  type: DashboardEvent['type'],
  payload: ScenarioExecution,
): DashboardEvent {
  return {
    type,
    payload,
    format: 'snapshot',
    timestamp: Date.now(),
  };
}

function hasExecutionChanges(delta: ScenarioExecutionDelta): boolean {
  return Object.keys(delta.changes).length > 0;
}

function buildExecutionDelta(
  previous: ScenarioExecution,
  current: ScenarioExecution,
): ScenarioExecutionDelta {
  const changes: ScenarioExecutionDelta['changes'] = {};

  for (const key of Object.keys(current) as Array<keyof ScenarioExecution>) {
    if (key === 'id' || key === 'steps') {
      continue;
    }

    if (!isDeepStrictEqual(previous[key], current[key])) {
      changes[key] = cloneValue(current[key]) as never;
    }
  }

  const previousSteps = new Map(previous.steps.map((step) => [step.stepId, step]));
  const changedSteps = current.steps
    .map((step) => buildStepDelta(previousSteps.get(step.stepId), step))
    .filter((stepDelta): stepDelta is ExecutionStepDelta => stepDelta !== null);

  if (changedSteps.length > 0) {
    changes.steps = changedSteps;
  }

  return {
    id: current.id,
    changes,
  };
}

function buildStepDelta(
  previous: ExecutionStepResult | undefined,
  current: ExecutionStepResult,
): ExecutionStepDelta | null {
  if (!previous) {
    return cloneExecution(current);
  }

  const stepDelta: ExecutionStepDelta = { stepId: current.stepId };

  for (const key of Object.keys(current) as Array<keyof ExecutionStepResult>) {
    if (key === 'stepId') {
      continue;
    }

    if (!isDeepStrictEqual(previous[key], current[key])) {
      stepDelta[key] = cloneValue(current[key]) as never;
    }
  }

  return Object.keys(stepDelta).length > 1 ? stepDelta : null;
}

function cloneExecution<T>(value: T): T {
  return structuredClone(value);
}

function cloneValue<T>(value: T): T {
  if (value == null || typeof value !== 'object') {
    return value;
  }
  return structuredClone(value);
}

function canAccessTerminal(engine: ScenarioEngine, executionId: string): boolean {
  // In a real multi-tenant system, we'd check session ownership here.
  // For the local dashboard, we just verify the execution actually exists.
  return !!engine.getExecution(executionId);
}

function clamp(val: number | undefined, min: number, max: number): number {
  if (val === undefined) return min;
  return Math.min(Math.max(val, min), max);
}
