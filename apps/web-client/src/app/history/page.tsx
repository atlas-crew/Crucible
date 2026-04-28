"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  type ExecutionHistoryFilters,
  type ExecutionStatus,
  useCatalogStore,
} from "@/store/useCatalogStore";
import {
  CalendarRange,
  ExternalLink,
  Filter,
  History,
  Loader2,
} from "lucide-react";

const STATUS_OPTIONS: Array<{ label: string; value: "" | ExecutionStatus }> = [
  { label: "All statuses", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Running", value: "running" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Paused", value: "paused" },
  { label: "Skipped", value: "skipped" },
];

const MODE_OPTIONS = [
  { label: "All modes", value: "" },
  { label: "Simulation", value: "simulation" },
  { label: "Assessment", value: "assessment" },
] as const;

function isHistoryStatusValue(value: string): value is ExecutionHistoryFilters["status"] {
  return STATUS_OPTIONS.some((option) => option.value === value);
}

function isHistoryModeValue(value: string): value is ExecutionHistoryFilters["mode"] {
  return MODE_OPTIONS.some((option) => option.value === value);
}

function formatTimestamp(value?: number): string {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatDuration(value?: number): string {
  if (value == null) return "In progress";
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function getStatusVariant(status: ExecutionStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "secondary";
  if (status === "failed") return "destructive";
  if (status === "running") return "default";
  return "outline";
}

export default function HistoryPage() {
  const scenarios = useCatalogStore((state) => state.scenarios);
  const historyExecutions = useCatalogStore((state) => state.historyExecutions);
  const historyFilters = useCatalogStore((state) => state.historyFilters);
  const historyHasNextPage = useCatalogStore((state) => state.historyHasNextPage);
  const historyIsLoading = useCatalogStore((state) => state.historyIsLoading);
  const historyIsRefreshing = useCatalogStore((state) => state.historyIsRefreshing);
  const historyError = useCatalogStore((state) => state.historyError);
  const historyInitialized = useCatalogStore((state) => state.historyInitialized);
  const fetchScenarios = useCatalogStore((state) => state.fetchScenarios);
  const fetchExecutionHistory = useCatalogStore((state) => state.fetchExecutionHistory);
  const updateHistoryFilters = useCatalogStore((state) => state.updateHistoryFilters);
  const loadOlderExecutionHistory = useCatalogStore((state) => state.loadOlderExecutionHistory);

  useEffect(() => {
    if (scenarios.length === 0) {
      void fetchScenarios();
    }
  }, [fetchScenarios, scenarios.length]);

  useEffect(() => {
    if (!historyInitialized) {
      void fetchExecutionHistory({ reset: true });
    }
  }, [fetchExecutionHistory, historyInitialized]);

  function updateFilter<K extends keyof ExecutionHistoryFilters>(
    key: K,
    value: ExecutionHistoryFilters[K],
  ) {
    void updateHistoryFilters({ [key]: value });
  }

  const scenarioNames = new Map(scenarios.map((scenario) => [scenario.id, scenario.name]));
  const loadedCount = historyExecutions.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="type-display">Execution History</h1>
          <p className="type-body text-muted-foreground">
            Browse prior simulations and assessments, filter by scenario or outcome, and load older execution pages on demand.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
          <History className="h-4 w-4" />
          <span>{loadedCount} results loaded</span>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
          <CardDescription>Refine execution history by scenario, mode, status, or date window.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-2">
            <span className="type-label text-muted-foreground">Scenario</span>
            <select
              aria-label="Scenario"
              value={historyFilters.scenarioId}
              onChange={(event) => updateFilter("scenarioId", event.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">All scenarios</option>
              {[...scenarios]
                .sort((left, right) => left.name.localeCompare(right.name))
                .map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="type-label text-muted-foreground">Status</span>
            <select
              aria-label="Status"
              value={historyFilters.status}
              onChange={(event) => updateFilter("status", isHistoryStatusValue(event.target.value) ? event.target.value : "")}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="type-label text-muted-foreground">Mode</span>
            <select
              aria-label="Mode"
              value={historyFilters.mode}
              onChange={(event) => updateFilter("mode", isHistoryModeValue(event.target.value) ? event.target.value : "")}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {MODE_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="type-label text-muted-foreground">From</span>
            <Input
              aria-label="From"
              type="date"
              value={historyFilters.dateFrom}
              onChange={(event) => updateFilter("dateFrom", event.target.value)}
            />
          </label>

          <label className="space-y-2">
            <span className="type-label text-muted-foreground">To</span>
            <Input
              aria-label="To"
              type="date"
              value={historyFilters.dateTo}
              onChange={(event) => updateFilter("dateTo", event.target.value)}
            />
          </label>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarRange className="h-4 w-4" />
          <span>Loaded newest {loadedCount} matching executions</span>
        </div>
        {historyIsRefreshing && !historyIsLoading && (
          <span className="type-timestamp text-muted-foreground">Refreshing history…</span>
        )}
      </div>

      {historyIsLoading ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-44 w-full" />
          ))}
        </div>
      ) : historyError ? (
        <Card className="border-destructive/30">
          <CardContent className="py-10 text-center">
            <p className="type-body text-destructive">{historyError}</p>
          </CardContent>
        </Card>
      ) : historyExecutions.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <p className="type-heading">No executions match the current filters.</p>
            <p className="type-body text-muted-foreground">
              Try widening the date range or clearing one of the filter values.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {historyExecutions.map((execution) => {
            const scenarioName = scenarioNames.get(execution.scenarioId) ?? execution.scenarioId;
            return (
              <Card key={execution.id} className="overflow-hidden">
                <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={getStatusVariant(execution.status)} className="type-tag">
                        {execution.status.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="type-tag">
                        {execution.mode.toUpperCase()}
                      </Badge>
                      {execution.report && (
                        <Badge
                          variant={execution.report.passed ? "secondary" : "destructive"}
                          className="type-tag"
                        >
                          {execution.report.score}% {execution.report.passed ? "PASS" : "FAIL"}
                        </Badge>
                      )}
                    </div>

                    <div>
                      <h2 className="type-heading">{scenarioName}</h2>
                      <p className="type-timestamp break-all text-muted-foreground">{execution.id}</p>
                      {execution.targetUrl && (
                        <p className="type-timestamp break-all text-muted-foreground">
                          Target: <span className="text-foreground">{execution.targetUrl}</span>
                        </p>
                      )}
                    </div>

                    <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <p className="type-label">Started</p>
                        <p>{formatTimestamp(execution.startedAt)}</p>
                      </div>
                      <div>
                        <p className="type-label">Duration</p>
                        <p>{formatDuration(execution.duration)}</p>
                      </div>
                      <div>
                        <p className="type-label">Steps</p>
                        <p>{execution.steps.length}</p>
                      </div>
                      <div>
                        <p className="type-label">Scenario ID</p>
                        <p className="break-all">{execution.scenarioId}</p>
                      </div>
                    </div>

                    {execution.error && (
                      <p className="rounded-md bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {execution.error}
                      </p>
                    )}
                  </div>

                  <div className="flex min-w-[180px] flex-col gap-3 lg:items-end">
                    <div className="rounded-lg border bg-muted/20 px-3 py-2 text-right">
                      <p className="type-label text-muted-foreground">Assessment Score</p>
                      <p className={cn("type-display text-2xl", execution.report?.passed ? "text-success" : "text-foreground")}>
                        {execution.report ? `${execution.report.score}%` : "—"}
                      </p>
                    </div>
                    <Button asChild className="w-full lg:w-auto">
                      <Link href={`/history/${execution.id}`}>
                        View Details
                        <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border/50 pt-4">
        <span className="type-timestamp text-muted-foreground">
          {historyHasNextPage
            ? `Loaded ${loadedCount} executions so far`
            : historyInitialized && loadedCount > 0
              ? "All matching executions loaded"
              : "Waiting for history data"}
        </span>

        <Button
          variant="outline"
          onClick={() => void loadOlderExecutionHistory()}
          disabled={!historyHasNextPage || historyIsLoading || historyIsRefreshing}
        >
          {historyIsRefreshing ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Loading…
            </>
          ) : (
            "Load Older"
          )}
        </Button>
      </div>
    </div>
  );
}
