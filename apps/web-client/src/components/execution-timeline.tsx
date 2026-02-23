"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  Circle,
  Loader2,
  MinusCircle,
  PauseCircle,
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  Square,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import { useCatalogStore } from "@/store/useCatalogStore";
import type { ExecutionStepResult, ExecutionStatus, ScenarioExecution } from "@/store/useCatalogStore";

// ── Status helpers ──────────────────────────────────────────────────

const statusConfig: Record<ExecutionStatus, {
  icon: typeof CheckCircle2;
  color: string;
  label: string;
  dotClass: string;
}> = {
  pending:   { icon: Circle,       color: "text-muted-foreground", label: "Pending",   dotClass: "bg-muted-foreground" },
  running:   { icon: Loader2,      color: "text-primary",          label: "Running",   dotClass: "bg-primary" },
  completed: { icon: CheckCircle2, color: "text-success",          label: "Completed", dotClass: "bg-success" },
  failed:    { icon: XCircle,      color: "text-destructive",      label: "Failed",    dotClass: "bg-destructive" },
  cancelled: { icon: MinusCircle,  color: "text-muted-foreground", label: "Cancelled", dotClass: "bg-muted-foreground" },
  paused:    { icon: PauseCircle,  color: "text-warning",          label: "Paused",    dotClass: "bg-warning" },
  skipped:   { icon: MinusCircle,  color: "text-muted-foreground", label: "Skipped",   dotClass: "bg-muted-foreground" },
};

function formatDuration(ms?: number): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Step card ───────────────────────────────────────────────────────

function StepCard({ step, index }: { step: ExecutionStepResult; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const config = statusConfig[step.status];
  const Icon = config.icon;
  const passedAssertions = step.assertions?.filter((a) => a.passed).length ?? 0;
  const totalAssertions = step.assertions?.length ?? 0;
  const hasDetail = step.error || step.logs?.length || step.assertions?.length || step.result;

  return (
    <div className="relative pl-8 pb-6 last:pb-0 group">
      {/* Timeline line */}
      <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border group-last:hidden" />

      {/* Status dot */}
      <div className={cn(
        "absolute left-0 top-1 flex h-[23px] w-[23px] items-center justify-center rounded-full border-2 border-background",
        config.dotClass,
        step.status === "running" && "animate-pulse"
      )}>
        <span className="block h-2 w-2 rounded-full bg-background/80" />
      </div>

      {/* Step content */}
      <div className={cn(
        "rounded-lg border bg-card p-4 transition-colors",
        step.status === "running" && "border-primary/30 glow-blue",
        step.status === "failed" && "border-destructive/30",
        step.status === "completed" && "border-success/20",
      )}>
        {/* Header row */}
        <div className="flex items-center gap-3">
          <Icon className={cn("h-4 w-4 shrink-0", config.color, step.status === "running" && "animate-spin")} />
          <span className="type-body font-medium flex-1 truncate">
            <span className="type-timestamp text-muted-foreground mr-2">{String(index + 1).padStart(2, "0")}</span>
            {step.stepId}
          </span>
          <span className="type-timestamp text-muted-foreground">
            {formatDuration(step.duration)}
          </span>
          {step.attempts > 1 && (
            <Badge variant="outline" className="type-tag">
              {step.attempts}x
            </Badge>
          )}
        </div>

        {/* Assertions summary */}
        {totalAssertions > 0 && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className={passedAssertions === totalAssertions ? "text-success" : "text-destructive"}>
              {passedAssertions}/{totalAssertions} assertions passed
            </span>
          </div>
        )}

        {/* Error preview */}
        {step.error && !expanded && (
          <p className="mt-2 type-code text-destructive truncate">{step.error}</p>
        )}

        {/* Expand toggle */}
        {hasDetail && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {expanded ? "Collapse" : "Details"}
          </button>
        )}

        {/* Expanded detail */}
        {expanded && (
          <div className="mt-3 space-y-3 border-t border-border/50 pt-3">
            {/* Error */}
            {step.error && (
              <div>
                <p className="type-label text-muted-foreground mb-1">Error</p>
                <pre className="type-code text-destructive bg-destructive/5 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                  {step.error}
                </pre>
              </div>
            )}

            {/* Assertions detail */}
            {step.assertions && step.assertions.length > 0 && (
              <div>
                <p className="type-label text-muted-foreground mb-1">Assertions</p>
                <div className="space-y-1">
                  {step.assertions.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 type-data">
                      <span className={a.passed ? "text-success" : "text-destructive"}>
                        {a.passed ? "PASS" : "FAIL"}
                      </span>
                      <span className="text-muted-foreground">{a.field}:</span>
                      {!a.passed && (
                        <span className="text-destructive">
                          expected {JSON.stringify(a.expected)}, got {JSON.stringify(a.actual)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Logs */}
            {step.logs && step.logs.length > 0 && (
              <div>
                <p className="type-label text-muted-foreground mb-1">Logs</p>
                <pre className="type-code text-muted-foreground bg-muted/30 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap">
                  {step.logs.join("\n")}
                </pre>
              </div>
            )}

            {/* Result data */}
            {step.result && Object.keys(step.result).length > 0 && (
              <div>
                <p className="type-label text-muted-foreground mb-1">Response</p>
                <pre className="type-code text-muted-foreground bg-muted/30 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap">
                  {JSON.stringify(step.result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Timeline ────────────────────────────────────────────────────────

interface ExecutionTimelineProps {
  execution: ScenarioExecution;
}

export function ExecutionTimeline({ execution }: ExecutionTimelineProps) {
  const config = statusConfig[execution.status];
  const Icon = config.icon;
  const { pauseExecution, resumeExecution, cancelExecution, restartExecution } = useCatalogStore();

  const isRunning = execution.status === "running";
  const isPaused = execution.status === "paused";
  const isTerminal = execution.status === "completed" || execution.status === "failed" || execution.status === "cancelled";

  return (
    <div className="space-y-6">
      {/* Execution header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Icon className={cn("h-5 w-5", config.color, execution.status === "running" && "animate-spin")} />
            <h2 className="type-heading">{execution.scenarioId}</h2>
          </div>
          <p className="type-timestamp text-muted-foreground pl-8">
            {execution.id} · {execution.mode}
            {execution.duration != null && ` · ${formatDuration(execution.duration)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <>
              <Button variant="ghost" size="icon-xs" onClick={() => pauseExecution(execution.id)} title="Pause">
                <Pause />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => cancelExecution(execution.id)} title="Cancel">
                <Square />
              </Button>
            </>
          )}
          {isPaused && (
            <>
              <Button variant="ghost" size="icon-xs" onClick={() => resumeExecution(execution.id)} title="Resume">
                <Play />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => cancelExecution(execution.id)} title="Cancel">
                <Square />
              </Button>
            </>
          )}
          {isTerminal && (
            <Button variant="ghost" size="icon-xs" onClick={() => restartExecution(execution.id)} title="Restart">
              <RotateCcw />
            </Button>
          )}
          <Badge
            variant={execution.status === "completed" ? "secondary" : execution.status === "failed" ? "destructive" : "default"}
            className="type-tag"
          >
            {execution.status.toUpperCase()}
          </Badge>
        </div>
      </div>

      {/* Context variables */}
      {execution.context && Object.keys(execution.context).length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <p className="type-label text-muted-foreground mb-2">Execution Context</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            {Object.entries(execution.context).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 type-data overflow-hidden">
                <span className="text-primary shrink-0">{key}</span>
                <span className="text-muted-foreground">=</span>
                <span className="text-foreground truncate">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step timeline */}
      <div>
        {execution.steps.length > 0 ? (
          execution.steps.map((step, i) => (
            <StepCard key={step.stepId} step={step} index={i} />
          ))
        ) : (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Waiting for steps...
          </div>
        )}
      </div>

      {/* Report (for assessments) */}
      {execution.report && (
        <div className={cn(
          "rounded-lg border p-4",
          execution.report.passed ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"
        )}>
          <div className="flex items-center justify-between mb-2">
            <p className="type-label text-muted-foreground">Assessment Report</p>
            <span className={cn("type-metric", execution.report.passed ? "text-success" : "text-destructive")}>
              {execution.report.score}%
            </span>
          </div>
          <p className="type-body">{execution.report.summary}</p>
        </div>
      )}
    </div>
  );
}
