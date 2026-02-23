"use client";

import { useCatalogStore } from "@/store/useCatalogStore";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, ShieldCheck, Database, Zap, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function Dashboard() {
  const { scenarios, executions, fetchScenarios } = useCatalogStore();

  useEffect(() => {
    fetchScenarios();
  }, [fetchScenarios]);

  const categories = Array.from(new Set(scenarios.map(s => s.category).filter(Boolean)));
  const runningCount = executions.filter(e => e.status === "running").length;
  const lastExecution = executions[0];

  return (
    <div className="space-y-8">
      {/* Stats row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="type-label text-muted-foreground">Total Scenarios</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="type-metric">{scenarios.length}</div>
            <p className="type-body text-muted-foreground">Across {categories.length} categories</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="type-label text-muted-foreground">Active Simulations</CardTitle>
            <Zap className={runningCount > 0 ? "h-4 w-4 text-primary" : "h-4 w-4 text-muted-foreground"} />
          </CardHeader>
          <CardContent>
            <div className="type-metric">{runningCount}</div>
            <p className="type-body text-muted-foreground">Running in real-time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="type-label text-muted-foreground">System Health</CardTitle>
            <ShieldCheck className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="type-metric text-success">Optimal</div>
            <p className="type-body text-muted-foreground">Defense monitoring active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="type-label text-muted-foreground">Last Execution</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="type-metric">
              {lastExecution ? lastExecution.status.toUpperCase() : "N/A"}
            </div>
            <p className="type-body text-muted-foreground">
              {lastExecution ? `Scenario ${lastExecution.scenarioId}` : "No recent activity"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main content row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Overview</CardTitle>
            <CardDescription>Performance metrics across attack vectors</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center border-t border-dashed border-border/50 mt-4 bg-muted/30 rounded-lg">
            <p className="type-data text-muted-foreground">TELEMETRY_FEED :: AWAITING_DATA</p>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Scenarios</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {scenarios.slice(0, 5).map(scenario => (
                <div key={scenario.id} className="flex items-center">
                  <div className="space-y-1">
                    <p className="type-body font-medium leading-none">{scenario.name}</p>
                    <p className="type-timestamp text-muted-foreground">{scenario.category}</p>
                  </div>
                  <div className="ml-auto">
                    <Badge variant="outline" className="type-tag">
                      {scenario.difficulty || "Beginner"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 flex justify-center">
              <Link href="/scenarios" className="w-full">
                <Button variant="outline" className="w-full group">
                  View All Scenarios
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
