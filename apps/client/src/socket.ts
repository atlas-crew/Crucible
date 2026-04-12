import type {
  CrucibleSocketOptions,
  WebSocketCommand,
  WebSocketEventMap,
  WebSocketEventName,
} from './types.js';

const DEFAULT_MIN_RECONNECT_DELAY = 1_000;
const DEFAULT_MAX_RECONNECT_DELAY = 30_000;

type Listener<K extends WebSocketEventName> = (data: WebSocketEventMap[K]) => void;

/**
 * Server event type → client event name mapping.
 *
 * The server sends `{ type: "EXECUTION_STARTED", payload, ... }`.
 * We emit `"execution:started"` with the payload.
 */
const SERVER_EVENT_MAP: Record<string, WebSocketEventName> = {
  EXECUTION_STARTED: 'execution:started',
  EXECUTION_UPDATED: 'execution:updated',
  EXECUTION_COMPLETED: 'execution:completed',
  EXECUTION_FAILED: 'execution:failed',
  EXECUTION_PAUSED: 'execution:paused',
  EXECUTION_CANCELLED: 'execution:cancelled',
  EXECUTION_RESUMED: 'execution:resumed',
  EXECUTION_DELTA: 'execution:delta',
  STATUS_UPDATE: 'status:update',
  TERMINAL_OUTPUT: 'terminal:output',
};

/**
 * Typed WebSocket client for the Crucible event stream.
 *
 * ```ts
 * const socket = new CrucibleSocket({ url: 'ws://localhost:3000' });
 * const unsub = socket.on('execution:completed', (exec) => console.log(exec.id));
 * socket.send({ type: 'SCENARIO_START', payload: { scenarioId: 'my-scenario' } });
 * // later...
 * unsub();
 * socket.close();
 * ```
 */
export class CrucibleSocket {
  private ws: WebSocket | null = null;
  private listeners = new Map<WebSocketEventName, Set<Listener<any>>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempts = 0;
  private closed = false;

  private readonly url: string;
  private readonly minDelay: number;
  private readonly maxDelay: number;
  private readonly autoReconnect: boolean;

  constructor(options: CrucibleSocketOptions & { url: string }) {
    this.url = options.url;
    this.minDelay = options.minReconnectDelay ?? DEFAULT_MIN_RECONNECT_DELAY;
    this.maxDelay = options.maxReconnectDelay ?? DEFAULT_MAX_RECONNECT_DELAY;
    this.autoReconnect = options.autoReconnect ?? true;
    this.connect();
  }

  /**
   * Subscribe to a typed event. Returns an unsubscribe function.
   *
   * ```ts
   * const unsub = socket.on('execution:started', (exec) => { ... });
   * unsub(); // stop listening
   * ```
   */
  on<K extends WebSocketEventName>(event: K, listener: Listener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => { set!.delete(listener); };
  }

  /** Send a command to the server. Returns `true` if sent, `false` if not connected. */
  send(command: WebSocketCommand): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.ws.send(JSON.stringify({
      ...command,
      timestamp: command.timestamp ?? Date.now(),
    }));
    return true;
  }

  /** Close the connection, stop auto-reconnecting, and remove all listeners. */
  close(): void {
    this.closed = true;
    clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.listeners.clear();
  }

  /** Whether the underlying WebSocket is currently open. */
  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ── Internal ────────────────────────────────────────────────────────

  private connect(): void {
    if (this.closed) return;

    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.emit('open', undefined);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        const clientEvent = SERVER_EVENT_MAP[msg.type];
        if (clientEvent) {
          this.emit(clientEvent, msg.payload);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = (event) => {
      this.ws = null;
      this.emit('close', { code: event.code, reason: event.reason });

      if (this.autoReconnect && !this.closed) {
        const baseDelay = Math.min(
          this.maxDelay,
          this.minDelay * Math.pow(2, this.reconnectAttempts),
        );
        // Add jitter (50-100% of base delay) to prevent thundering herd
        const delay = baseDelay * (0.5 + Math.random() * 0.5);
        this.reconnectAttempts++;
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
      }
    };

    ws.onerror = (event) => {
      this.emit('error', event);
      ws.close();
    };
  }

  private emit<K extends WebSocketEventName>(event: K, data: WebSocketEventMap[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        try {
          listener(data);
        } catch {
          // Prevent a throwing listener from breaking event processing
        }
      }
    }
  }
}
