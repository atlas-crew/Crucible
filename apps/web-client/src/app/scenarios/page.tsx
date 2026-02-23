"use client"

import { useEffect, useState, useMemo } from "react"
import type { Scenario } from "@crucible/catalog"
import { useCatalogStore } from "@/store/useCatalogStore"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ScenarioDetailDialog } from "@/components/scenario-detail-dialog"
import { Play, ClipboardList, Search } from "lucide-react"

export default function ScenariosPage() {
  const { scenarios, isLoading, fetchScenarios, startSimulation, startAssessment } = useCatalogStore()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null)

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
                  onClick={(e) => { e.stopPropagation(); startSimulation(scenario.id) }}
                >
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  Simulate
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={(e) => { e.stopPropagation(); startAssessment(scenario.id) }}
                >
                  <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
                  Assess
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
