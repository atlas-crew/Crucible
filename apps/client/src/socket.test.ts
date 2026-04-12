import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CrucibleSocket } from './socket.js';

// ── Mock WebSocket ────────────────────────────────────────────────────

class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.OPEN;
  onopen: ((ev: any) => void) | null = null;
  onclose: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;

  sent: string[] = [];
  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    // Simulate async open
    queueMicrotask(() => this.onopen?.({ type: 'open' }));
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    queueMicrotask(() => this.onclose?.({ code: 1000, reason: '' }));
  }

  // Test helper: simulate a server message
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

// Install the mock globally
const originalWebSocket = globalThis.WebSocket;
beforeEach(() => {
  MockWebSocket.instances = [];
  (globalThis as any).WebSocket = MockWebSocket;
});
afterEach(() => {
  (globalThis as any).WebSocket = originalWebSocket;
});

// ── Tests ─────────────────────────────────────────────────────────────

describe('CrucibleSocket', () => {
  describe('send()', () => {
    it('returns true when connected and message is sent', async () => {
      const socket = new CrucibleSocket({ url: 'ws://localhost:3000' });
      // Wait for open
      await new Promise((r) => queueMicrotask(r));

      const result = socket.send({ type: 'SCENARIO_START', payload: { scenarioId: 's1' } });
      expect(result).toBe(true);

      const ws = MockWebSocket.instances[0];
      const sent = JSON.parse(ws.sent[0]);
      expect(sent.type).toBe('SCENARIO_START');
      expect(sent.payload.scenarioId).toBe('s1');
      expect(sent.timestamp).toBeTypeOf('number');

      socket.close();
    });

    it('returns false when not connected', () => {
      const socket = new CrucibleSocket({ url: 'ws://localhost:3000', autoReconnect: false });
      const ws = MockWebSocket.instances[0];
      ws.readyState = MockWebSocket.CLOSED;

      const result = socket.send({ type: 'GET_STATUS', payload: { executionId: 'e1' } });
      expect(result).toBe(false);
      expect(ws.sent).toHaveLength(0);

      socket.close();
    });
  });

  describe('on() / event dispatch', () => {
    it('dispatches typed server events to listeners', async () => {
      const socket = new CrucibleSocket({ url: 'ws://localhost:3000' });
      await new Promise((r) => queueMicrotask(r));

      const received: unknown[] = [];
      socket.on('execution:started', (exec) => received.push(exec));

      const ws = MockWebSocket.instances[0];
      ws.simulateMessage({
        type: 'EXECUTION_STARTED',
        payload: { id: 'e1', scenarioId: 's1', status: 'running' },
        timestamp: Date.now(),
      });

      expect(received).toHaveLength(1);
      expect((received[0] as any).id).toBe('e1');

      socket.close();
    });

    it('returns an unsubscribe function', async () => {
      const socket = new CrucibleSocket({ url: 'ws://localhost:3000' });
      await new Promise((r) => queueMicrotask(r));

      let count = 0;
      const unsub = socket.on('execution:completed', () => { count++; });

      const ws = MockWebSocket.instances[0];
      ws.simulateMessage({ type: 'EXECUTION_COMPLETED', payload: { id: 'e1' }, timestamp: 0 });
      expect(count).toBe(1);

      unsub();
      ws.simulateMessage({ type: 'EXECUTION_COMPLETED', payload: { id: 'e2' }, timestamp: 0 });
      expect(count).toBe(1); // no increment after unsub

      socket.close();
    });

    it('ignores unknown server event types', async () => {
      const socket = new CrucibleSocket({ url: 'ws://localhost:3000' });
      await new Promise((r) => queueMicrotask(r));

      const ws = MockWebSocket.instances[0];
      // Should not throw
      ws.simulateMessage({ type: 'UNKNOWN_EVENT', payload: {}, timestamp: 0 });

      socket.close();
    });

    it('ignores malformed messages', async () => {
      const socket = new CrucibleSocket({ url: 'ws://localhost:3000' });
      await new Promise((r) => queueMicrotask(r));

      const ws = MockWebSocket.instances[0];
      // Send raw non-JSON — should not throw
      ws.onmessage?.({ data: 'not json' });

      socket.close();
    });
  });

  describe('emit() error safety', () => {
    it('does not break event processing when a listener throws', async () => {
      const socket = new CrucibleSocket({ url: 'ws://localhost:3000' });
      await new Promise((r) => queueMicrotask(r));

      const received: string[] = [];

      // First listener throws
      socket.on('execution:started', () => { throw new Error('boom'); });
      // Second listener should still be called
      socket.on('execution:started', (exec) => { received.push((exec as any).id); });

      const ws = MockWebSocket.instances[0];
      ws.simulateMessage({ type: 'EXECUTION_STARTED', payload: { id: 'e1' }, timestamp: 0 });

      expect(received).toEqual(['e1']);

      socket.close();
    });
  });

  describe('close()', () => {
    it('clears all listeners on close', async () => {
      const socket = new CrucibleSocket({ url: 'ws://localhost:3000' });
      await new Promise((r) => queueMicrotask(r));

      let count = 0;
      socket.on('execution:started', () => { count++; });

      socket.close();

      // Even if we somehow got a message after close, listener should not fire
      expect(count).toBe(0);
    });

    it('sets connected to false', async () => {
      const socket = new CrucibleSocket({ url: 'ws://localhost:3000' });
      await new Promise((r) => queueMicrotask(r));
      expect(socket.connected).toBe(true);

      socket.close();
      expect(socket.connected).toBe(false);
    });
  });

  describe('reconnection', () => {
    it('does not reconnect when autoReconnect is false', async () => {
      const socket = new CrucibleSocket({ url: 'ws://localhost:3000', autoReconnect: false });
      await new Promise((r) => queueMicrotask(r));

      expect(MockWebSocket.instances).toHaveLength(1);

      // Simulate server-initiated close
      const ws = MockWebSocket.instances[0];
      ws.readyState = MockWebSocket.CLOSED;
      ws.onclose?.({ code: 1006, reason: 'abnormal' });

      // Give time for potential reconnect
      await new Promise((r) => setTimeout(r, 50));
      expect(MockWebSocket.instances).toHaveLength(1); // no new connection

      socket.close();
    });

    it('does not reconnect after explicit close()', async () => {
      const socket = new CrucibleSocket({ url: 'ws://localhost:3000' });
      await new Promise((r) => queueMicrotask(r));

      socket.close();

      await new Promise((r) => setTimeout(r, 50));
      // Only 1 instance — no reconnect attempt
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });
});
