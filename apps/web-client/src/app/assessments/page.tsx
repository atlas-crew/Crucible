"use client";

import { useCatalogStore } from "@/store/useCatalogStore";
import { ExecutionTimeline } from "@/components/execution-timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Circle,
  ClipboardList,
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

export default function AssessmentsPage() {
  const { executions, activeExecution, setActiveExecution } = useCatalogStore();

  const assessments = executions.filter((e) => e.mode === "assessment");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="type-display">Assessments</h1>
        <p className="type-body text-muted-foreground">
          Security assessment results with pass/fail scoring and detailed reports.
        </p>
      </div>

      {assessments.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* Assessment list sidebar */}
          <Card className="lg:sticky lg:top-20 lg:self-start">
            <CardHeader className="pb-3">
              <CardTitle className="type-label text-muted-foreground">
                Assessments
                <Badge variant="outline" className="ml-2 type-tag">
                  {assessments.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-260px)]">
                <div className="space-y-px px-2 pb-2">
                  {assessments.map((exec) => {
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
                          <div className="flex items-center gap-2">
                            <p className="type-timestamp text-muted-foreground truncate">
                              {exec.id.slice(0, 12)}
                            </p>
                            {exec.report && (
                              <span className={cn(
                                "type-tag",
                                exec.report.passed ? "text-success" : "text-destructive"
                              )}>
                                {exec.report.score}%
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant={
                            exec.status === "completed" && exec.report?.passed ? "secondary" :
                            exec.status === "completed" && !exec.report?.passed ? "destructive" :
                            exec.status === "running" ? "default" :
                            "outline"
                          }
                          className="type-tag shrink-0"
                        >
                          {exec.report
                            ? (exec.report.passed ? "PASS" : "FAIL")
                            : exec.status.toUpperCase()
                          }
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
                  Select an assessment to view its results
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
        <ClipboardList className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="type-heading mb-1">No assessments yet</h3>
      <p className="type-body text-muted-foreground text-center max-w-md">
        Start an assessment from the Scenarios catalog. Results include pass/fail scoring
        and detailed assertion reports for each attack step.
      </p>
    </Card>
  );
}
