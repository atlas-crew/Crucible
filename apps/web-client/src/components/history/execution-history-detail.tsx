"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ExecutionTimeline } from "@/components/execution-timeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ScenarioExecution } from "@/store/useCatalogStore";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

interface ExecutionHistoryDetailProps {
  executionId: string;
}

export function ExecutionHistoryDetail({ executionId }: ExecutionHistoryDetailProps) {
  const [execution, setExecution] = useState<ScenarioExecution | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadExecution() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_BASE}/executions/${executionId}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data: ScenarioExecution = await response.json();
        if (!isCancelled) {
          setExecution(data);
        }
      } catch {
        if (!isCancelled) {
          setExecution(null);
          setError("Execution details could not be loaded.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadExecution();

    return () => {
      isCancelled = true;
    };
  }, [executionId]);

  return (
    <div className="space-y-6">
      <Button asChild variant="outline" className="w-fit">
        <Link href="/history">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to History
        </Link>
      </Button>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-14 w-56" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : error ? (
        <Card className="border-destructive/30">
          <CardContent className="py-10 text-center text-destructive">{error}</CardContent>
        </Card>
      ) : execution ? (
        <ExecutionTimeline execution={execution} />
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Execution not found.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
