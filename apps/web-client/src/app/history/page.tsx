"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Scenario } from "@crucible/catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ExecutionStatus, ScenarioExecution } from "@/store/useCatalogStore";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Filter,
  History,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
const PAGE_SIZE = 10;

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

interface HistoryFilters {
  scenarioId: string;
  status: string;
  mode: string;
  dateFrom: string;
  dateTo: string;
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

function toStartOfDayTimestamp(value: string): number | undefined {
  if (!value) return undefined;
  return new Date(`${value}T00:00:00`).getTime();
}

function toEndOfDayTimestamp(value: string): number | undefined {
  if (!value) return undefined;
  return new Date(`${value}T23:59:59.999`).getTime();
}

export default function HistoryPage() {
  const hasLoadedHistory = useRef(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [executions, setExecutions] = useState<ScenarioExecution[]>([]);
  const [filters, setFilters] = useState<HistoryFilters>({
    scenarioId: "",
    status: "",
    mode: "",
    dateFrom: "",
    dateTo: "",
  });
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function loadScenarios() {
      try {
        const response = await fetch(`${API_BASE}/scenarios`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data: Scenario[] = await response.json();
        if (!isCancelled) {
          setScenarios(data);
        }
      } catch {
        if (!isCancelled) {
          setScenarios([]);
        }
      }
    }

    void loadScenarios();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function loadExecutions() {
      const isInitialRequest = !hasLoadedHistory.current;

      setError(null);
      setIsLoading(isInitialRequest);
      setIsRefreshing(!isInitialRequest);

      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(page * PAGE_SIZE),
        });

        if (filters.scenarioId) params.set("scenarioId", filters.scenarioId);
        if (filters.status) params.set("status", filters.status);
        if (filters.mode) params.set("mode", filters.mode);

        const since = toStartOfDayTimestamp(filters.dateFrom);
        const until = toEndOfDayTimestamp(filters.dateTo);
        if (since !== undefined) params.set("since", String(since));
        if (until !== undefined) params.set("until", String(until));

        const response = await fetch(`${API_BASE}/executions?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data: ScenarioExecution[] = await response.json();
        if (!isCancelled) {
          setExecutions(data);
          setHasNextPage(data.length === PAGE_SIZE);
          hasLoadedHistory.current = true;
        }
      } catch {
        if (!isCancelled) {
          setExecutions([]);
          setHasNextPage(false);
          setError("Failed to load execution history.");
          hasLoadedHistory.current = true;
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }

    void loadExecutions();

    return () => {
      isCancelled = true;
    };
  }, [filters.dateFrom, filters.dateTo, filters.mode, filters.scenarioId, filters.status, page]);

  function updateFilter<K extends keyof HistoryFilters>(key: K, value: HistoryFilters[K]) {
    setPage(0);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const scenarioNames = new Map(scenarios.map((scenario) => [scenario.id, scenario.name]));
  const rangeStart = executions.length === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = page * PAGE_SIZE + executions.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="type-display">Execution History</h1>
          <p className="type-body text-muted-foreground">
            Browse prior simulations and assessments, filter by scenario or outcome, and jump into full execution detail.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
          <History className="h-4 w-4" />
          <span>{executions.length} results on this page</span>
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
              value={filters.scenarioId}
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
              value={filters.status}
              onChange={(event) => updateFilter("status", event.target.value)}
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
              value={filters.mode}
              onChange={(event) => updateFilter("mode", event.target.value)}
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
              value={filters.dateFrom}
              onChange={(event) => updateFilter("dateFrom", event.target.value)}
            />
          </label>

          <label className="space-y-2">
            <span className="type-label text-muted-foreground">To</span>
            <Input
              aria-label="To"
              type="date"
              value={filters.dateTo}
              onChange={(event) => updateFilter("dateTo", event.target.value)}
            />
          </label>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarRange className="h-4 w-4" />
          <span>
            Showing {rangeStart}-{rangeEnd} of the current result window
          </span>
        </div>
        {isRefreshing && !isLoading && (
          <span className="type-timestamp text-muted-foreground">Refreshing history…</span>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-44 w-full" />
          ))}
        </div>
      ) : error ? (
        <Card className="border-destructive/30">
          <CardContent className="py-10 text-center">
            <p className="type-body text-destructive">{error}</p>
          </CardContent>
        </Card>
      ) : executions.length === 0 ? (
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
          {executions.map((execution) => {
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
        <Button
          variant="outline"
          onClick={() => setPage((current) => Math.max(0, current - 1))}
          disabled={page === 0}
        >
          <ChevronLeft className="mr-1.5 h-4 w-4" />
          Previous
        </Button>

        <span className="type-timestamp text-muted-foreground">Page {page + 1}</span>

        <Button
          variant="outline"
          onClick={() => setPage((current) => current + 1)}
          disabled={!hasNextPage}
        >
          Next
          <ChevronRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
