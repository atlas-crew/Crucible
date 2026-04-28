import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupWebSocket } from '../server/websocket.js';
import type { ScenarioEngine } from '../server/engine.js';

// ── TASK-12: WebSocket and HTTP API error handling ──────────────────

// Minimal mock WebSocket
function createMockWs() {
  const handlers = new Map<string, Function[]>();
  return {
    on(event: string, handler: Function) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
    },
    send: vi.fn(),
    readyState: 1, // WebSocket.OPEN
    _trigger(event: string, ...args: any[]) {
      for (const h of handlers.get(event) ?? []) h(...args);
    },
  };
}

function createMockWss() {
  const connectionHandlers: Function[] = [];
  return {
    on(event: string, handler: Function) {
      if (event === 'connection') connectionHandlers.push(handler);
    },
    clients: new Set<any>(),
    _simulateConnection(ws: any) {
      this.clients.add(ws);
      for (const h of connectionHandlers) h(ws);
    },
  };
}

function createMockEngine() {
  const handlers = new Map<string, Function[]>();
  return {
    on(event: string, handler: Function) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
    },
    emit(event: string, ...args: any[]) {
      for (const h of handlers.get(event) ?? []) h(...args);
    },
    startScenario: vi.fn(),
    pauseExecution: vi.fn(),
    resumeExecution: vi.fn(),
    cancelExecution: vi.fn(),
    restartExecution: vi.fn(),
    getExecution: vi.fn(),
    listExecutions: vi.fn(() => []),
    pauseAll: vi.fn(),
    resumeAll: vi.fn(),
    cancelAll: vi.fn(),
  } as unknown as ScenarioEngine & { emit: Function };
}

function createMockTerminal() {
  const handlers = new Map<string, Function[]>();
  return {
    on(event: string, handler: Function) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
    },
    startSession: vi.fn(),
    sendInput: vi.fn(),
    stopSession: vi.fn(),
    resize: vi.fn(),
  };
}

describe('setupWebSocket', () => {
  let wss: ReturnType<typeof createMockWss>;
  let engine: ReturnType<typeof createMockEngine>;
  let terminal: ReturnType<typeof createMockTerminal>;

  beforeEach(() => {
    vi.clearAllMocks();
    wss = createMockWss();
    engine = createMockEngine();
    terminal = createMockTerminal();
    setupWebSocket(wss as any, engine as any, terminal as any);
  });

  describe('incoming messages', () => {
    it('handles invalid JSON without crashing', () => {
      const ws = createMockWs();
      wss._simulateConnection(ws);

      // Should not throw
      expect(() => {
        ws._trigger('message', 'not valid json');
      }).not.toThrow();

      // Connection still usable — no errors sent
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('handles unknown command type gracefully', () => {
      const ws = createMockWs();
      wss._simulateConnection(ws);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      ws._trigger('message', JSON.stringify({
        type: 'TOTALLY_UNKNOWN_COMMAND',
        payload: {},
        timestamp: Date.now(),
      }));

      expect(warnSpy).toHaveBeenCalledWith(
        'Unknown command type:',
        'TOTALLY_UNKNOWN_COMMAND',
      );
      warnSpy.mockRestore();
    });

    it('silently ignores SCENARIO_PAUSE without executionId', () => {
      const ws = createMockWs();
      wss._simulateConnection(ws);

      ws._trigger('message', JSON.stringify({
        type: 'SCENARIO_PAUSE',
        payload: {},
        timestamp: Date.now(),
      }));

      expect(engine.pauseExecution).not.toHaveBeenCalled();
    });

    it('silently ignores SCENARIO_RESUME without executionId', () => {
      const ws = createMockWs();
      wss._simulateConnection(ws);

      ws._trigger('message', JSON.stringify({
        type: 'SCENARIO_RESUME',
        payload: {},
        timestamp: Date.now(),
      }));

      expect(engine.resumeExecution).not.toHaveBeenCalled();
    });

    it('silently ignores SCENARIO_STOP without executionId', () => {
      const ws = createMockWs();
      wss._simulateConnection(ws);

      ws._trigger('message', JSON.stringify({
        type: 'SCENARIO_STOP',
        payload: {},
        timestamp: Date.now(),
      }));

      expect(engine.cancelExecution).not.toHaveBeenCalled();
    });

    it('silently ignores SCENARIO_START without scenarioId', () => {
      const ws = createMockWs();
      wss._simulateConnection(ws);

      ws._trigger('message', JSON.stringify({
        type: 'SCENARIO_START',
        payload: {},
        timestamp: Date.now(),
      }));

      expect(engine.startScenario).not.toHaveBeenCalled();
    });

    it('calls engine.startScenario when SCENARIO_START has scenarioId', async () => {
      const ws = createMockWs();
      wss._simulateConnection(ws);

      (engine.startScenario as any).mockResolvedValue('exec-123');

      ws._trigger('message', JSON.stringify({
        type: 'SCENARIO_START',
        payload: { scenarioId: 'sc-1' },
        timestamp: Date.now(),
      }));

      // Wait for async handler to settle
      await new Promise((r) => setTimeout(r, 10));

      expect(engine.startScenario).toHaveBeenCalledWith('sc-1', 'simulation', undefined);
    });

    it('sends EXECUTION_FAILED when startScenario throws', async () => {
      const ws = createMockWs();
      wss._simulateConnection(ws);

      (engine.startScenario as any).mockRejectedValue(new Error('Scenario not found'));

      ws._trigger('message', JSON.stringify({
        type: 'SCENARIO_START',
        payload: { scenarioId: 'bad-id' },
        timestamp: Date.now(),
      }));

      await new Promise((r) => setTimeout(r, 10));

      expect(ws.send).toHaveBeenCalled();
      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('EXECUTION_FAILED');
      expect(sent.payload.error).toBe('Scenario not found');
    });
  });

  describe('broadcast', () => {
    it('only sends to OPEN clients', () => {
      const openWs = createMockWs();
      openWs.readyState = 1; // OPEN

      const closedWs = createMockWs();
      closedWs.readyState = 3; // CLOSED

      wss._simulateConnection(openWs);
      wss.clients.add(closedWs);

      // Trigger a broadcast via engine event
      engine.emit('execution:completed', { id: 'exec-1', status: 'completed' });

      expect(openWs.send).toHaveBeenCalled();
      expect(closedWs.send).not.toHaveBeenCalled();
    });

    it('preserves targetUrl on the EXECUTION_STARTED snapshot payload', () => {
      const openWs = createMockWs();
      wss._simulateConnection(openWs);

      engine.emit('execution:started', {
        id: 'exec-target',
        scenarioId: 'scenario-a',
        mode: 'simulation',
        status: 'running',
        targetUrl: 'http://staging.example:8080',
        steps: [],
      });

      expect(openWs.send).toHaveBeenCalled();
      const sent = JSON.parse(openWs.send.mock.calls[0][0]);
      expect(sent.type).toBe('EXECUTION_STARTED');
      expect(sent.format).toBe('snapshot');
      expect(sent.payload.targetUrl).toBe('http://staging.example:8080');
    });

    it('sends a full snapshot for the first execution update when no prior state exists', () => {
      const openWs = createMockWs();
      wss._simulateConnection(openWs);

      engine.emit('execution:updated', {
        id: 'exec-1',
        scenarioId: 'scenario-a',
        mode: 'simulation',
        status: 'running',
        steps: [{ stepId: 'step-1', status: 'running', attempts: 1 }],
      });

      const sent = JSON.parse(openWs.send.mock.calls[0][0]);
      expect(sent.type).toBe('EXECUTION_UPDATED');
      expect(sent.format).toBe('snapshot');
      expect(sent.payload).toEqual(
        expect.objectContaining({
          id: 'exec-1',
          scenarioId: 'scenario-a',
        }),
      );
    });

    it('sends deltas for repeated execution updates after the initial snapshot', () => {
      const openWs = createMockWs();
      wss._simulateConnection(openWs);

      engine.emit('execution:started', {
        id: 'exec-1',
        scenarioId: 'scenario-a',
        mode: 'simulation',
        status: 'running',
        steps: [],
      });

      engine.emit('execution:updated', {
        id: 'exec-1',
        scenarioId: 'scenario-a',
        mode: 'simulation',
        status: 'running',
        context: { token: 'abc' },
        steps: [{ stepId: 'step-1', status: 'running', attempts: 1 }],
      });

      const sent = JSON.parse(openWs.send.mock.calls[1][0]);
      expect(sent.type).toBe('EXECUTION_DELTA');
      expect(sent.format).toBe('delta');
      expect(sent.payload).toEqual({
        id: 'exec-1',
        changes: {
          context: { token: 'abc' },
          steps: [{ stepId: 'step-1', status: 'running', attempts: 1 }],
        },
      });
    });

    it('seeds new connections with snapshot status updates for existing executions', () => {
      (engine.listExecutions as any).mockReturnValue([
        {
          id: 'exec-1',
          scenarioId: 'scenario-a',
          mode: 'simulation',
          status: 'running',
          steps: [{ stepId: 'step-1', status: 'running', attempts: 1 }],
        },
      ]);

      const openWs = createMockWs();
      wss._simulateConnection(openWs);

      expect(openWs.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(openWs.send.mock.calls[0][0]);
      expect(sent.type).toBe('STATUS_UPDATE');
      expect(sent.format).toBe('snapshot');
      expect(sent.payload).toEqual(
        expect.objectContaining({
          id: 'exec-1',
          scenarioId: 'scenario-a',
        }),
      );
    });

    it('uses the seeded connection snapshot as the baseline for the next execution delta', () => {
      (engine.listExecutions as any).mockReturnValue([
        {
          id: 'exec-1',
          scenarioId: 'scenario-a',
          mode: 'simulation',
          status: 'running',
          steps: [{ stepId: 'step-1', status: 'running', attempts: 1 }],
        },
      ]);

      const openWs = createMockWs();
      wss._simulateConnection(openWs);

      engine.emit('execution:updated', {
        id: 'exec-1',
        scenarioId: 'scenario-a',
        mode: 'simulation',
        status: 'running',
        context: { token: 'abc' },
        steps: [{ stepId: 'step-1', status: 'completed', attempts: 1 }],
      });

      expect(openWs.send).toHaveBeenCalledTimes(2);
      const sent = JSON.parse(openWs.send.mock.calls[1][0]);
      expect(sent.type).toBe('EXECUTION_DELTA');
      expect(sent.format).toBe('delta');
      expect(sent.payload).toEqual({
        id: 'exec-1',
        changes: {
          context: { token: 'abc' },
          steps: [{ stepId: 'step-1', status: 'completed' }],
        },
      });
    });
  });
});
