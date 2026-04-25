"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import "xterm/css/xterm.css";
import { useCatalogStore } from "@/store/useCatalogStore";
import { cn } from "@/lib/utils";
import { Terminal as TerminalIcon, Wifi, WifiOff, AlertCircle, Maximize2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RemoteTerminalProps {
  executionId: string;
  className?: string;
}

export function RemoteTerminal({ executionId, className }: RemoteTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const { sendMessage, onMessage, wsConnected } = useCatalogStore();
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected" | "error">("disconnected");

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      theme: {
        background: "#09090b", // Matches zinc-950
        foreground: "#a1a1aa", // Matches zinc-400
        cursor: "#e5a820", // Crucible accent
        selectionBackground: "#3f3f46",
      },
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());

    term.open(terminalRef.current);

    termInstance.current = term;
    fitAddon.current = fit;

    let disposed = false;
    const safeFit = () => {
      if (disposed) return;
      const el = terminalRef.current;
      if (!el || !el.isConnected) return;
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      try {
        fit.fit();
      } catch {
        // Renderer not ready yet; the ResizeObserver will retry on next layout tick.
      }
    };

    const raf = requestAnimationFrame(safeFit);
    const ro = new ResizeObserver(safeFit);
    ro.observe(terminalRef.current);

    // Initial welcome
    term.writeln("\x1b[33mCrucible Remote Terminal\x1b[0m");
    term.writeln("Connecting to sandbox environment...");

    // Connect logic
    setStatus("connecting");
    sendMessage({
      type: "TERMINAL_START",
      payload: { executionId, cols: term.cols, rows: term.rows }
    });

    // Listen for output
    const unsubscribe = onMessage((msg) => {
      if (msg.type === "TERMINAL_OUTPUT" && msg.payload.executionId === executionId) {
        term.write(msg.payload.data);
        if (status !== "connected") setStatus("connected");
      }
    });

    // Send input
    const onData = term.onData((data) => {
      sendMessage({
        type: "TERMINAL_DATA",
        payload: { executionId, data }
      });
    });

    // Resize handling
    const onResize = (size: { cols: number; rows: number }) => {
      sendMessage({
        type: "TERMINAL_RESIZE",
        payload: { executionId, cols: size.cols, rows: size.rows }
      });
    };
    term.onResize(onResize);

    window.addEventListener("resize", safeFit);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      unsubscribe();
      onData.dispose();
      window.removeEventListener("resize", safeFit);
      sendMessage({ type: "TERMINAL_STOP", payload: { executionId } });
      term.dispose();
      termInstance.current = null;
      fitAddon.current = null;
    };
  }, [executionId, sendMessage, onMessage]);

  const handleClear = () => {
    termInstance.current?.clear();
  };

  const handleReset = () => {
    sendMessage({ type: "TERMINAL_STOP", payload: { executionId } });
    termInstance.current?.clear();
    termInstance.current?.writeln("Resetting session...");
    sendMessage({
      type: "TERMINAL_START",
      payload: { 
        executionId, 
        cols: termInstance.current?.cols || 80, 
        rows: termInstance.current?.rows || 24 
      }
    });
  };

  return (
    <div className={cn("flex flex-col h-full bg-zinc-950 rounded-xl border border-border overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/50 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-2 h-2 rounded-full",
            status === "connected" ? "bg-success" : status === "connecting" ? "bg-warning animate-pulse" : "bg-muted-foreground"
          )} />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <TerminalIcon className="h-3 w-3" />
            Sandbox Terminal
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {!wsConnected && (
            <span className="text-[9px] text-destructive font-bold flex items-center gap-1 uppercase">
              <WifiOff className="h-3 w-3" /> WS Offline
            </span>
          )}
          <Button variant="ghost" size="xs" onClick={handleClear} className="h-6 text-[10px] px-2">Clear</Button>
          <Button variant="ghost" size="xs" onClick={handleReset} className="h-6 text-[10px] px-2 text-warning">Reset</Button>
        </div>
      </div>

      {/* Terminal Container */}
      <div className="flex-1 p-2 relative">
        <div ref={terminalRef} className="absolute inset-2" />
      </div>

      {/* Footer */}
      <div className="px-4 py-1.5 bg-zinc-900/30 border-t border-border/20 flex items-center justify-between">
        <div className="text-[9px] text-zinc-500 font-mono">
          EXEC_ID: {executionId.slice(0, 8)}...
        </div>
        <div className="text-[9px] text-zinc-500 font-mono uppercase">
          VT100 / XTERM-COLOR
        </div>
      </div>
    </div>
  );
}
