"use client";

import { useEffect, useRef } from "react";
import { useCatalogStore } from "@/store/useCatalogStore";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001";
const RECONNECT_DELAY = 3000;

/**
 * Maintains a singleton WebSocket connection to the demo-dashboard server.
 * Dispatches incoming execution events to the Zustand store.
 * Auto-reconnects on disconnect.
 */
export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { updateExecution, setWsConnected } = useCatalogStore();

  useEffect(() => {
    function connect() {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case "EXECUTION_STARTED":
            case "EXECUTION_UPDATED":
            case "EXECUTION_COMPLETED":
            case "EXECUTION_FAILED":
            case "EXECUTION_PAUSED":
            case "EXECUTION_CANCELLED":
            case "EXECUTION_RESUMED":
            case "STATUS_UPDATE":
              if (msg.payload && msg.payload.id) {
                updateExecution(msg.payload);
              }
              break;
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [updateExecution, setWsConnected]);
}
