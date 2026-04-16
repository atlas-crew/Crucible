"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import type { Scenario } from "@crucible/catalog"
import { useCatalogStore } from "@/store/useCatalogStore"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import { ScenarioDetailDialog } from "@/components/scenario-detail-dialog"
import { Play, ClipboardList, Search, Loader2, Crosshair, Radio } from "lucide-react"
import { cn } from "@/lib/utils"

export default function ScenariosPage() {
  const router = useRouter()
  const {
    scenarios,
    isLoading,
    error,
    targetUrl,
    targetStatus,
    fetchScenarios,
    startSimulation,
    startAssessment,
    setTargetUrl,
    clearError,
  } = useCatalogStore()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null)
  const [launching, setLaunching] = useState<{ scenarioId: string; mode: "simulation" | "assessment" } | null>(null)

  useEffect(() => {
    fetchScenarios()
  }, [fetchScenarios])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return scenarios
    const q = searchQuery.toLowerCase()
    return scenarios.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q) ||
      s.category?.toLowerCase().includes(q) ||
      s.tags?.some((t) => t.toLowerCase().includes(q))
    )
  }, [scenarios, searchQuery])

  const handleTargetChange = (value: string) => {
    if (error) {
      clearError()
    }
    const trimmed = value.trim()
    setTargetUrl(trimmed.length > 0 ? trimmed : null)
  }

  const handleLaunch = async (scenarioId: string, mode: "simulation" | "assessment") => {
    clearError()
    setLaunching({ scenarioId, mode })

    try {
      if (mode === "simulation") {
        await startSimulation(scenarioId, targetUrl)
        router.push("/simulations")
      } else {
        await startAssessment(scenarioId, targetUrl)
        router.push("/assessments")
      }
    } catch {
      // The store already captures the launch error for inline display.
    } finally {
      setLaunching(null)
    }
  }

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-[250px] w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="type-display">Scenario Catalog</h1>
        <p className="type-body text-muted-foreground">
          Browse and execute security attack scenarios against your target environment.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, category, tag, or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="type-heading flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-muted-foreground" />
            Launch Target
          </CardTitle>
          <CardDescription>
            Set the URL used for the next simulation or assessment run from the catalog.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="scenario-target-url">Target URL</Label>
            <Input
              id="scenario-target-url"
              placeholder="http://localhost:8880"
              value={targetUrl ?? ""}
              onChange={(e) => handleTargetChange(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Radio className={cn(
                "h-3.5 w-3.5",
                targetStatus === "online"
                  ? "text-success"
                  : targetStatus === "offline"
                    ? "text-destructive"
                    : "text-muted-foreground"
              )} />
              <span className="uppercase tracking-wide">
                {targetStatus === "online" ? "Reachable" : targetStatus === "offline" ? "Offline" : "Unchecked"}
              </span>
            </div>
            <span>Leave blank to fall back to the server default target.</span>
          </div>
          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No scenarios match &ldquo;{searchQuery}&rdquo;
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((scenario) => (
            <Card
              key={scenario.id}
              className="flex flex-col cursor-pointer transition-shadow hover:shadow-md hover:border-foreground/20"
              onClick={() => setSelectedScenario(scenario)}
            >
              <CardHeader>
                <div className="flex justify-between items-start mb-2">
                  <Badge variant={getDifficultyVariant(scenario.difficulty)}>
                    {scenario.difficulty || "Beginner"}
                  </Badge>
                  <span className="type-timestamp text-muted-foreground uppercase">
                    {scenario.category}
                  </span>
                </div>
                <CardTitle className="line-clamp-1 text-base">{scenario.name}</CardTitle>
                <CardDescription className="line-clamp-2 h-10">
                  {scenario.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="text-sm text-muted-foreground">
                  <span className="type-data text-foreground font-semibold">{scenario.steps.length}</span> attack steps
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {scenario.tags?.slice(0, 3).map((tag: string) => (
                    <Badge key={tag} variant="outline" className="type-tag">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
              <CardFooter className="gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={launching?.scenarioId === scenario.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleLaunch(scenario.id, "simulation")
                  }}
                >
                  {launching?.scenarioId === scenario.id && launching.mode === "simulation" ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {launching?.scenarioId === scenario.id && launching.mode === "simulation" ? "Starting…" : "Simulate"}
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={launching?.scenarioId === scenario.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleLaunch(scenario.id, "assessment")
                  }}
                >
                  {launching?.scenarioId === scenario.id && launching.mode === "assessment" ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {launching?.scenarioId === scenario.id && launching.mode === "assessment" ? "Starting…" : "Assess"}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <ScenarioDetailDialog
        scenario={selectedScenario}
        open={selectedScenario !== null}
        onOpenChange={(open) => { if (!open) setSelectedScenario(null) }}
      />
    </div>
  )
}

function getDifficultyVariant(difficulty?: string): "default" | "secondary" | "destructive" | "outline" {
  switch (difficulty?.toLowerCase()) {
    case 'advanced':
    case 'expert':
      return 'destructive'
    case 'intermediate':
      return 'default'
    case 'basic':
    case 'beginner':
    case 'easy':
      return 'secondary'
    default:
      return 'outline'
  }
}
