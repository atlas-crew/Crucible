"use client";

import { useCatalogStore } from "@/store/useCatalogStore";
import { ExecutionTimeline } from "@/components/execution-timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Circle,
  Radio,
  Pause,
  Play,
  Square,
} from "lucide-react";
import type { ExecutionStatus } from "@/store/useCatalogStore";

const statusIcon: Record<ExecutionStatus, typeof CheckCircle2> = {
  pending: Circle,
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: Circle,
  paused: Circle,
  skipped: Circle,
};

const statusColor: Record<ExecutionStatus, string> = {
  pending: "text-muted-foreground",
  running: "text-primary",
  completed: "text-success",
  failed: "text-destructive",
  cancelled: "text-muted-foreground",
  paused: "text-warning",
  skipped: "text-muted-foreground",
};

export default function SimulationsPage() {
  const { executions, activeExecution, setActiveExecution, wsConnected, pauseAll, resumeAll, cancelAll } = useCatalogStore();

  const simulations = executions.filter((e) => e.mode === "simulation");
  const hasRunning = simulations.some((e) => e.status === "running");
  const hasPaused = simulations.some((e) => e.status === "paused");
  const hasActive = simulations.some((e) => e.status === "running" || e.status === "pending" || e.status === "paused");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="type-display">Simulations</h1>
          <p className="type-body text-muted-foreground">
            Live execution timeline and step-by-step results.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(hasRunning || hasPaused || hasActive) && (
            <div className="flex items-center gap-1">
              {hasRunning && (
                <Button variant="outline" size="sm" onClick={() => pauseAll()}>
                  <Pause className="h-3.5 w-3.5 mr-1" />
                  Pause All
                </Button>
              )}
              {hasPaused && (
                <Button variant="outline" size="sm" onClick={() => resumeAll()}>
                  <Play className="h-3.5 w-3.5 mr-1" />
                  Resume All
                </Button>
              )}
              {hasActive && (
                <Button variant="outline" size="sm" className="text-destructive" onClick={() => cancelAll()}>
                  <Square className="h-3.5 w-3.5 mr-1" />
                  Cancel All
                </Button>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 type-timestamp">
            <Radio className={cn("h-3.5 w-3.5", wsConnected ? "text-success" : "text-muted-foreground")} />
            <span className={wsConnected ? "text-success" : "text-muted-foreground"}>
              {wsConnected ? "LIVE" : "OFFLINE"}
            </span>
          </div>
        </div>
      </div>

      {simulations.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* Execution list sidebar */}
          <Card className="lg:sticky lg:top-20 lg:self-start">
            <CardHeader className="pb-3">
              <CardTitle className="type-label text-muted-foreground">
                Executions
                <Badge variant="outline" className="ml-2 type-tag">
                  {simulations.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-260px)]">
                <div className="space-y-px px-2 pb-2">
                  {simulations.map((exec) => {
                    const Icon = statusIcon[exec.status];
                    const isActive = activeExecution?.id === exec.id;
                    return (
                      <button
                        key={exec.id}
                        onClick={() => setActiveExecution(exec.id)}
                        className={cn(
                          "w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                          isActive
                            ? "bg-primary/10 border border-primary/20"
                            : "hover:bg-secondary border border-transparent"
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            statusColor[exec.status],
                            exec.status === "running" && "animate-spin"
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="type-body font-medium truncate">
                            {exec.scenarioId}
                          </p>
                          <p className="type-timestamp text-muted-foreground truncate">
                            {exec.id.slice(0, 12)}
                            {exec.steps.length > 0 && ` · ${exec.steps.length} steps`}
                          </p>
                        </div>
                        <Badge
                          variant={
                            exec.status === "running" ? "default" :
                            exec.status === "failed" ? "destructive" :
                            "outline"
                          }
                          className="type-tag shrink-0"
                        >
                          {exec.status.toUpperCase()}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Timeline detail */}
          <div>
            {activeExecution ? (
              <ExecutionTimeline execution={activeExecution} />
            ) : (
              <Card className="flex items-center justify-center h-[400px]">
                <p className="text-muted-foreground text-sm">
                  Select an execution to view its timeline
                </p>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="flex flex-col items-center justify-center py-20">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Loader2 className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="type-heading mb-1">No simulations yet</h3>
      <p className="type-body text-muted-foreground text-center max-w-md">
        Start a simulation from the Scenarios catalog. Results will appear here in real-time
        via WebSocket as steps execute.
      </p>
    </Card>
  );
}
