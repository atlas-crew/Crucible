"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import dynamic from "next/dynamic";
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
  Copy,
  Terminal,
  FileJson,
  FileText,
  AlertCircle,
  Info,
  Clock,
  Layers,
} from "lucide-react";
import { useState } from "react";
import { useCatalogStore } from "@/store/useCatalogStore";
import type { ExecutionStepResult, ExecutionStatus, ScenarioExecution } from "@/store/useCatalogStore";
import { getScenarioStepType, isScenarioHttpStep, isScenarioRunnerStep } from "@crucible/catalog/models/types";
import type { Scenario, ScenarioStep } from "@crucible/catalog/models/types";

const RemoteTerminal = dynamic(
  () => import("@/components/remote-terminal").then((mod) => mod.RemoteTerminal),
  { ssr: false },
);

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

function generateCurl(step: ScenarioStep, targetUrl?: string): string {
  if (!isScenarioHttpStep(step)) {
    return `# ${getScenarioStepType(step)} runner steps do not have an equivalent cURL request`;
  }
  const { method, url, headers, body } = step.request;
  const resolvedUrl = url.startsWith("/") ? `${targetUrl || "<target-url>"}${url}` : url;
  
  let curl = `curl -X ${method} "${resolvedUrl}"`;
  
  if (headers) {
    Object.entries(headers).forEach(([k, v]) => {
      curl += ` \\\n  -H "${k}: ${v}"`;
    });
  }
  
  if (body) {
    const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
    // Escape single quotes for shell safety (P2-001)
    const escapedBody = bodyStr.replace(/'/g, "'\\''");
    curl += ` \\\n  -d '${escapedBody}'`;
  }
  
  return curl;
}

function getArtifactPresentation(url: string): { label: string; icon: typeof FileText } {
  try {
    const [pathname, queryString = ""] = url.split("?");
    const format = new URLSearchParams(queryString).get("format") ?? pathname.split("/").pop() ?? "";

    if (format === "json") {
      return { label: "Download JSON report", icon: FileJson };
    }
    if (format === "html") {
      return { label: "Download HTML report", icon: FileText };
    }
    if (format === "pdf") {
      return { label: "Download PDF report", icon: FileText };
    }
  } catch {
    // Fall through to a generic label when the artifact URL is malformed.
  }

  return { label: "Download report artifact", icon: FileText };
}

function formatDefinitionSummary(step: ScenarioStep): string {
  if (isScenarioHttpStep(step)) {
    return `${step.request.method} ${step.request.url}`;
  }

  if (step.type === "k6") {
    return `K6 ${step.runner.scriptRef}`;
  }

  const reference = step.runner.templateRef ?? step.runner.workflowRef ?? "configured runner";
  return `NUCLEI ${reference}`;
}

// ── Step card ───────────────────────────────────────────────────────

function StepCard({ 
  step, 
  index, 
  definition,
  targetUrl,
  executionId,
  executionStatus
}: { 
  step: ExecutionStepResult; 
  index: number;
  definition?: ScenarioStep;
  targetUrl?: string;
  executionId: string;
  executionStatus: ExecutionStatus;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const config = statusConfig[step.status];
  const Icon = config.icon;
  const passedAssertions = step.assertions?.filter((a) => a.passed).length ?? 0;
  const totalAssertions = step.assertions?.length ?? 0;
  
  const hasResult = step.details?.response;
  const hasRunnerSummary = step.details?.runner;
  const hasLogs = step.logs && step.logs.length > 0;
  const hasError = !!step.error;
  const hasDetail = hasResult || hasRunnerSummary || hasLogs || hasError || step.assertions?.length;

  const copyCurl = () => {
    if (!definition) return;
    navigator.clipboard.writeText(generateCurl(definition, targetUrl));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
        "rounded-lg border bg-card p-4 transition-all duration-200",
        step.status === "running" && "border-primary/40 shadow-sm ring-1 ring-primary/10",
        step.status === "failed" && "border-destructive/30",
        step.status === "completed" && "border-success/20",
        expanded && "shadow-md"
      )}>
        {/* Header row */}
        <div className="flex items-center gap-3">
          <Icon className={cn("h-4 w-4 shrink-0", config.color, step.status === "running" && "animate-spin")} />
          <div className="flex-1 flex flex-col min-w-0">
            <span className="type-body font-semibold truncate flex items-center gap-2">
              <span className="type-timestamp text-muted-foreground font-normal">{String(index + 1).padStart(2, "0")}</span>
              {definition?.name || step.stepId}
              {definition?.executionMode === 'parallel' && (
                <Badge variant="outline" className="text-[10px] h-4 px-1 font-normal text-muted-foreground uppercase">
                  Parallel {definition.parallelGroup !== undefined ? `G${definition.parallelGroup}` : ''}
                </Badge>
              )}
            </span>
            <span className="type-timestamp text-muted-foreground truncate">
              {definition ? formatDefinitionSummary(definition) : "Definition unavailable"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end shrink-0">
              <span className="type-timestamp font-medium">
                {formatDuration(step.duration)}
              </span>
              {step.attempts > 1 && (
                <span className="text-[10px] text-muted-foreground">
                  {step.attempts} attempts
                </span>
              )}
            </div>
            {hasDetail && (
              <Button 
                variant="ghost" 
                size="icon-xs" 
                onClick={() => setExpanded(!expanded)}
                className="text-muted-foreground hover:text-foreground"
              >
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>

        {/* Assertions summary bar */}
        {totalAssertions > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden flex">
              <div 
                className="h-full bg-success transition-all duration-500" 
                style={{ width: `${(passedAssertions / totalAssertions) * 100}%` }} 
              />
              <div 
                className="h-full bg-destructive transition-all duration-500" 
                style={{ width: `${((totalAssertions - passedAssertions) / totalAssertions) * 100}%` }} 
              />
            </div>
            <span className={cn(
              "text-[10px] font-medium whitespace-nowrap uppercase tracking-wider",
              passedAssertions === totalAssertions ? "text-success" : "text-destructive"
            )}>
              {passedAssertions}/{totalAssertions} assertions
            </span>
          </div>
        )}

        {/* Quick error preview */}
        {step.error && !expanded && (
          <div className="mt-3 p-2 bg-destructive/5 rounded border border-destructive/10">
            <p className="type-code text-destructive text-[11px] line-clamp-2">{step.error}</p>
          </div>
        )}

        {/* Expanded detail */}
        {expanded && (
          <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <Tabs defaultValue={hasError ? "error" : "response"} className="w-full">
              <TabsList className="w-full justify-start h-8 bg-muted/50 p-1 mb-2">
                <TabsTrigger value="request" className="text-[11px] px-3 h-6">Request</TabsTrigger>
                <TabsTrigger value="response" className="text-[11px] px-3 h-6" disabled={!hasResult}>Response</TabsTrigger>
                <TabsTrigger value="logs" className="text-[11px] px-3 h-6" disabled={!hasLogs}>Logs</TabsTrigger>
                <TabsTrigger value="terminal" className="text-[11px] px-3 h-6">Terminal</TabsTrigger>
                {hasError && <TabsTrigger value="error" className="text-[11px] px-3 h-6 text-destructive">Error</TabsTrigger>}
              </TabsList>

              <TabsContent value="request" className="mt-0 space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Definition</span>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={copyCurl}
                    disabled={!definition || !isScenarioHttpStep(definition)}
                    className={cn("h-6 text-[10px] gap-1.5 transition-colors", copied && "text-success")}
                  >
                    {copied ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied!" : "Copy as cURL"}
                  </Button>
                </div>
                {definition && (
                  <div className="space-y-3">
                    {isScenarioHttpStep(definition) ? (
                      <>
                        <div className="grid grid-cols-1 gap-2">
                          <div className="bg-muted/30 p-2 rounded border border-border/50">
                            <div className="flex gap-2 text-[11px] mb-1">
                              <span className="font-bold text-primary">{definition.request.method}</span>
                              <span className="text-muted-foreground break-all">{definition.request.url}</span>
                            </div>
                          </div>
                        </div>
                        {definition.request.headers && Object.keys(definition.request.headers).length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Headers</p>
                            <div className="bg-muted/30 p-2 rounded border border-border/50 space-y-1">
                              {Object.entries(definition.request.headers).map(([k, v]) => (
                                <div key={k} className="flex gap-2 text-[11px]">
                                  <span className="text-muted-foreground shrink-0">{k}:</span>
                                  <span className="text-foreground break-all">{v}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {definition.request.body && (
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Body</p>
                            <pre className="type-code bg-muted/30 p-2 rounded border border-border/50 overflow-x-auto text-[11px]">
                              {typeof definition.request.body === "string" 
                                ? definition.request.body 
                                : JSON.stringify(definition.request.body, null, 2)}
                            </pre>
                          </div>
                        )}
                      </>
                    ) : (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Runner</p>
                        <pre className="type-code bg-muted/30 p-2 rounded border border-border/50 overflow-x-auto text-[11px]">
                          {JSON.stringify(definition.runner, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

                <TabsContent value="response" className="mt-0 space-y-4">
                {step.details?.runner && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Runner Summary</p>
                    <pre className="type-code bg-muted/30 p-2 rounded border border-border/50 overflow-x-auto text-[11px]">
                      {JSON.stringify(step.details.runner, null, 2)}
                    </pre>
                  </div>
                )}
                {step.details?.response && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Status</span>
                        <Badge 
                          variant={step.details.response.status < 400 ? "secondary" : "destructive"}
                          className="text-[10px] h-4 py-0"
                        >
                          {step.details.response.status}
                        </Badge>
                      </div>
                      {step.details.retention && (
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          {step.details.retention.truncated ? (
                            <span className="flex items-center gap-1 text-warning">
                              <AlertCircle className="h-3 w-3" /> Truncated ({Math.round(step.details.retention.storedBytes/1024)}KB of {Math.round(step.details.retention.originalBytes/1024)}KB)
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Info className="h-3 w-3" /> Full Body ({Math.round(step.details.retention.storedBytes/1024)}KB)
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Assertions detail */}
                    {step.assertions && step.assertions.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Assertions</p>
                        <div className="space-y-1">
                          {step.assertions.map((a, i) => (
                            <div key={i} className="flex items-center gap-2 bg-muted/20 p-1.5 px-2 rounded border border-border/30">
                              {a.passed ? <CheckCircle2 className="h-3 w-3 text-success shrink-0" /> : <XCircle className="h-3 w-3 text-destructive shrink-0" />}
                              <span className="text-[11px] font-medium min-w-[80px]">{a.field}</span>
                              {!a.passed && (
                                <span className="text-[11px] text-destructive italic">
                                  expected {JSON.stringify(a.expected)}, got {JSON.stringify(a.actual)}
                                </span>
                              )}
                              {a.passed && <span className="text-[11px] text-muted-foreground">Passed</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Response Headers */}
                    {step.details.response.headers && Object.keys(step.details.response.headers).length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Response Headers</p>
                        <div className="bg-muted/30 p-2 rounded border border-border/50 max-h-32 overflow-y-auto space-y-1">
                          {Object.entries(step.details.response.headers).map(([k, v]) => (
                            <div key={k} className="flex gap-2 text-[11px]">
                              <span className="text-muted-foreground shrink-0">{k}:</span>
                              <span className="text-foreground break-all">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Response Body */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Body</p>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[9px] h-4 py-0 text-muted-foreground">
                            {step.details.retention?.bodyFormat.toUpperCase() || 'TEXT'}
                          </Badge>
                        </div>
                      </div>
                      <pre className="type-code bg-black/90 text-success/90 p-3 rounded border border-border/50 overflow-x-auto max-h-[400px] text-[11px] leading-relaxed scrollbar-thin">
                        {typeof step.details.response.body === "string" 
                          ? step.details.response.body 
                          : JSON.stringify(step.details.response.body, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="logs" className="mt-0">
                <div className="bg-black/95 rounded border border-border/50 p-3 overflow-hidden font-mono text-[11px] leading-relaxed">
                  <div className="flex items-center gap-2 mb-3 border-b border-white/10 pb-2">
                    <Terminal className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground uppercase text-[10px] tracking-widest">Execution Logs</span>
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto scrollbar-thin">
                    {step.logs?.map((log, i) => (
                      <div key={i} className="flex gap-3">
                        <span className="text-white/20 shrink-0 select-none">[{String(i+1).padStart(3, '0')}]</span>
                        <span className="text-white/80 whitespace-pre-wrap">{log}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="terminal" className="mt-0">
                {(executionStatus === 'running' || executionStatus === 'paused') ? (
                  <div className="h-80">
                    <RemoteTerminal executionId={executionId} />
                  </div>
                ) : (
                  <div className="bg-muted/30 border border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center">
                    <Terminal className="h-8 w-8 text-muted-foreground/20 mb-3" />
                    <p className="text-xs font-medium text-muted-foreground">Sandbox terminal only available during active execution</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">This execution has ended and the sandbox has been reclaimed.</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="error" className="mt-0">
                <div className="bg-destructive/10 border border-destructive/20 rounded p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                    <div className="space-y-1">
                      <p className="text-[11px] font-bold text-destructive uppercase tracking-widest">Fatal Execution Error</p>
                      <pre className="type-code text-destructive text-[11px] whitespace-pre-wrap leading-relaxed">
                        {step.error}
                      </pre>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Timeline ────────────────────────────────────────────────────────

interface ExecutionTimelineProps {
  execution: ScenarioExecution;
  scenario?: Scenario;
}

export function ExecutionTimeline({ execution, scenario }: ExecutionTimelineProps) {
  const config = statusConfig[execution.status];
  const Icon = config.icon;
  const { pauseExecution, resumeExecution, cancelExecution, restartExecution } = useCatalogStore();

  const isRunning = execution.status === "running";
  const isPaused = execution.status === "paused";
  const isTerminal = execution.status === "completed" || execution.status === "failed" || execution.status === "cancelled";

  // Calculate stats
  const totalSteps = scenario?.steps.length || execution.steps.length;
  const completedCount = execution.steps.filter(s => s.status === 'completed').length;
  const failedCount = execution.steps.filter(s => s.status === 'failed').length;
  const progressPercent = totalSteps > 0 ? (execution.steps.length / totalSteps) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Execution header */}
      <div className="relative overflow-hidden rounded-xl border bg-card/50 shadow-sm p-6">
        {/* Progress background */}
        <div 
          className="absolute bottom-0 left-0 h-1 bg-primary/20 transition-all duration-1000" 
          style={{ width: `${progressPercent}%` }} 
        />
        
        <div className="flex items-start justify-between relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg bg-background border shadow-inner",
                isRunning && "animate-pulse ring-1 ring-primary/20"
              )}>
                <Icon className={cn("h-5 w-5", config.color, execution.status === "running" && "animate-spin")} />
              </div>
              <div>
                <h2 className="type-heading leading-tight">{scenario?.name || execution.scenarioId}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-[10px] font-mono px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{execution.id}</code>
                  <span className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold">· {execution.mode}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-2">
              {isRunning && (
                <>
                  <Button variant="outline" size="xs" onClick={() => pauseExecution(execution.id)} className="h-7 px-2 gap-1.5">
                    <Pause className="h-3.5 w-3.5" /> Pause
                  </Button>
                  <Button variant="outline" size="xs" onClick={() => cancelExecution(execution.id)} className="h-7 px-2 gap-1.5 text-destructive hover:bg-destructive/5">
                    <Square className="h-3.5 w-3.5" /> Stop
                  </Button>
                </>
              )}
              {isPaused && (
                <>
                  <Button variant="outline" size="xs" onClick={() => resumeExecution(execution.id)} className="h-7 px-2 gap-1.5 border-primary text-primary hover:bg-primary/5">
                    <Play className="h-3.5 w-3.5" /> Resume
                  </Button>
                  <Button variant="outline" size="xs" onClick={() => cancelExecution(execution.id)} className="h-7 px-2 gap-1.5 text-destructive hover:bg-destructive/5">
                    <Square className="h-3.5 w-3.5" /> Stop
                  </Button>
                </>
              )}
              {isTerminal && (
                <Button variant="outline" size="xs" onClick={() => restartExecution(execution.id)} className="h-7 px-2 gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" /> Restart
                </Button>
              )}
              <Badge
                variant={execution.status === "completed" ? "secondary" : execution.status === "failed" ? "destructive" : "default"}
                className="type-tag px-3 h-7"
              >
                {execution.status.toUpperCase()}
              </Badge>
            </div>
            
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground font-medium">
              <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> {formatDuration(execution.duration)}</span>
              <span className="flex items-center gap-1.5"><Layers className="h-3 w-3" /> {completedCount}/{totalSteps} Steps</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          {/* Step timeline */}
          <div className="space-y-1">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/80 flex items-center gap-2">
                Execution Flow
                <span className="h-px w-12 bg-border/50" />
              </h3>
            </div>
            {execution.steps.length > 0 ? (
              execution.steps.map((step, i) => (
                <StepCard 
                  key={step.stepId} 
                  step={step} 
                  index={i} 
                  definition={scenario?.steps.find(s => s.id === step.stepId)}
                  targetUrl={execution.targetUrl}
                  executionId={execution.id}
                  executionStatus={execution.status}
                />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-20 border rounded-xl border-dashed bg-muted/5">
                <Loader2 className="h-8 w-8 text-muted-foreground/20 animate-spin mb-4" />
                <p className="text-muted-foreground text-sm font-medium">Initializing execution engine...</p>
                <p className="text-muted-foreground/60 text-xs mt-1">Preparing target environment and scenario context</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* Metadata Sidebar */}
          <div className="space-y-6 sticky top-6">
            {/* Target Card */}
            {execution.targetUrl && (
              <div className="rounded-xl border bg-card p-5 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                  Active Target
                </p>
                <div className="flex flex-col gap-1 overflow-hidden">
                  <span className="text-xs font-mono text-primary truncate">{execution.targetUrl}</span>
                  <span className="text-[10px] text-muted-foreground">Traffic is routed to this endpoint</span>
                </div>
              </div>
            )}

            {/* Context variables */}
            {execution.context && Object.keys(execution.context).length > 0 && (
              <div className="rounded-xl border bg-card p-5 space-y-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                  Session Context
                </p>
                <div className="space-y-2">
                  {Object.entries(execution.context).map(([key, value]) => (
                    <div key={key} className="flex flex-col gap-0.5 overflow-hidden pb-2 border-b border-border/30 last:border-0">
                      <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">{key}</span>
                      <span className="text-xs font-mono text-foreground break-all">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Report (for assessments) */}
            {execution.report && (
              <div className={cn(
                "rounded-xl border p-5 shadow-sm transition-all duration-300",
                execution.report.passed 
                  ? "border-success/30 bg-success/5 shadow-success/5" 
                  : "border-destructive/30 bg-destructive/5 shadow-destructive/5"
              )}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Assessment Result
                  </p>
                  <Badge variant={execution.report.passed ? "secondary" : "destructive"} className="text-xs">
                    {execution.report.passed ? "PASSED" : "FAILED"}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-4 mb-4">
                  <div className={cn(
                    "text-3xl font-black tracking-tighter",
                    execution.report.passed ? "text-success" : "text-destructive"
                  )}>
                    {execution.report.score}%
                  </div>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden flex">
                    <div 
                      className={cn("h-full transition-all duration-1000", execution.report.passed ? "bg-success" : "bg-destructive")}
                      style={{ width: `${execution.report.score}%` }} 
                    />
                  </div>
                </div>

                <p className="text-xs leading-relaxed text-muted-foreground font-medium">{execution.report.summary}</p>
                
                {execution.report.artifacts.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border/50 space-y-2">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Artifacts</p>
                    <div className="flex flex-wrap gap-2">
                      {execution.report.artifacts.map((art, i) => {
                        const presentation = getArtifactPresentation(art);
                        const ArtifactIcon = presentation.icon;

                        return (
                          <Button key={i} asChild variant="outline" size="xs" className="gap-1.5">
                            <a href={art} download>
                              <ArtifactIcon className="h-3 w-3" />
                              {presentation.label}
                            </a>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
