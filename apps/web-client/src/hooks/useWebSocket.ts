"use client";

import { useEffect, useRef } from "react";
import { useCatalogStore } from "@/store/useCatalogStore";

const MIN_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

function resolveWebSocketUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (configuredUrl && configuredUrl !== "auto") {
    return configuredUrl;
  }

  if (configuredUrl === "auto" && typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws`;
  }

  return "ws://localhost:3001";
}

/**
 * Maintains a singleton WebSocket connection to the demo-dashboard server.
 * Dispatches incoming execution events to the Zustand store.
 * Auto-reconnects on disconnect with exponential backoff.
 */
export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reconnectAttempts = useRef(0);
  const { updateExecution, applyExecutionDelta, setWsConnected } = useCatalogStore();

  useEffect(() => {
    function connect() {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      const ws = new WebSocket(resolveWebSocketUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          // Core store updates
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
                if (msg.format === "delta") {
                  applyExecutionDelta(msg.payload);
                } else {
                  updateExecution(msg.payload);
                }
              }
              break;
            case "EXECUTION_DELTA":
              if (msg.payload && msg.payload.id) {
                applyExecutionDelta(msg.payload);
              }
              break;
          }

          // Dispatch to any other listeners (like Terminal)
          // We use the store's internal messageHandlers indirectly
          // by letting the store implement its own onmessage logic or
          // by dispatching a custom event that components can listen to.
          // For simplicity with Zustand, we'll use a DOM event.
          window.dispatchEvent(new CustomEvent('ws:message', { detail: msg }));
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        
        const delay = Math.min(
          MAX_RECONNECT_DELAY,
          MIN_RECONNECT_DELAY * Math.pow(2, reconnectAttempts.current)
        );
        
        reconnectAttempts.current++;
        reconnectTimer.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    // Listener for outgoing messages
    const handleSend = (e: any) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(e.detail));
      }
    };

    window.addEventListener('ws:send', handleSend);
    connect();

    return () => {
      window.removeEventListener('ws:send', handleSend);
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [applyExecutionDelta, updateExecution, setWsConnected]);
}
