import { WebSocket, WebSocketServer } from 'ws';
import { ScenarioEngine } from './engine.js';
import type { DashboardCommand, DashboardEvent, WebSocketMessage } from '../shared/types.js';

export function setupWebSocket(wss: WebSocketServer, engine: ScenarioEngine): void {
  engine.on('execution:started', (execution) => {
    broadcast(wss, {
      type: 'EXECUTION_STARTED',
      payload: execution,
      timestamp: Date.now(),
    });
  });

  engine.on('execution:updated', (execution) => {
    broadcast(wss, {
      type: 'EXECUTION_UPDATED',
      payload: execution,
      timestamp: Date.now(),
    });
  });

  engine.on('execution:completed', (execution) => {
    broadcast(wss, {
      type: 'EXECUTION_COMPLETED',
      payload: execution,
      timestamp: Date.now(),
    });
  });

  engine.on('execution:failed', (execution) => {
    broadcast(wss, {
      type: 'EXECUTION_FAILED',
      payload: execution,
      timestamp: Date.now(),
    });
  });

  engine.on('execution:paused', (execution) => {
    broadcast(wss, {
      type: 'EXECUTION_PAUSED',
      payload: execution,
      timestamp: Date.now(),
    });
  });

  engine.on('execution:cancelled', (execution) => {
    broadcast(wss, {
      type: 'EXECUTION_CANCELLED',
      payload: execution,
      timestamp: Date.now(),
    });
  });

  engine.on('execution:resumed', (execution) => {
    broadcast(wss, {
      type: 'EXECUTION_RESUMED',
      payload: execution,
      timestamp: Date.now(),
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    console.log('Client connected');

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

          case 'GET_STATUS':
            if (command.payload.executionId) {
              const execution = engine.getExecution(command.payload.executionId);
              if (execution) {
                ws.send(
                  JSON.stringify({
                    type: 'STATUS_UPDATE',
                    payload: execution,
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
