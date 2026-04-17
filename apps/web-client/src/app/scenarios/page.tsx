"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  countScenarioBlockingExpectations,
  getScenarioTargetCompatibility,
  inferScenarioTargetFamily,
  inferTargetFamilyFromUrl,
} from "@crucible/catalog"
import type {
  Scenario,
  ScenarioTargetCompatibility,
  ScenarioTargetFamily,
} from "@crucible/catalog"
import { useCatalogStore } from "@/store/useCatalogStore"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ScenarioDetailDialog } from "@/components/scenario-detail-dialog"
import { Play, ClipboardList, Search, Loader2 } from "lucide-react"

interface LaunchDialogState {
  scenario: Scenario
  mode: "simulation" | "assessment"
  targetUrl: string
}

interface LaunchTargetState {
  normalized: string | null
  error: string | null
}

export default function ScenariosPage() {
  const router = useRouter()
  const {
    scenarios,
    isLoading,
    targetUrl,
    targetStatus,
    fetchScenarios,
    startSimulation,
    startAssessment,
    setTargetUrl,
  } = useCatalogStore()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null)
  const [launchDialog, setLaunchDialog] = useState<LaunchDialogState | null>(null)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [launchTargetDraft, setLaunchTargetDraft] = useState<string | null>(null)
  const [launching, setLaunching] = useState<{ scenarioId: string; mode: "simulation" | "assessment" } | null>(null)
  const catalogTargetFamily = useMemo(() => inferTargetFamilyFromUrl(targetUrl), [targetUrl])

  useEffect(() => {
    fetchScenarios()
  }, [fetchScenarios])

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase()
    const matches = searchQuery.trim()
      ? scenarios.filter((s) =>
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.description?.toLowerCase().includes(q) ||
          s.category?.toLowerCase().includes(q) ||
          s.tags?.some((t) => t.toLowerCase().includes(q))
        )
      : scenarios

    if (!catalogTargetFamily) {
      return matches
    }

    return [...matches].sort((left, right) =>
      compareScenarioPriority(left, right, targetUrl, catalogTargetFamily),
    )
  }, [catalogTargetFamily, scenarios, searchQuery, targetUrl])

  const launchTargetState = useMemo<LaunchTargetState>(
    () => validateLaunchTargetInput(launchDialog?.targetUrl ?? ""),
    [launchDialog?.targetUrl],
  )
  const effectiveLaunchTarget = launchTargetState.normalized ?? targetUrl ?? null
  const launchTargetFamily = useMemo(
    () => inferTargetFamilyFromUrl(effectiveLaunchTarget),
    [effectiveLaunchTarget],
  )
  const launchScenarioFamily = launchDialog
    ? inferScenarioTargetFamily(launchDialog.scenario)
    : null
  const launchCompatibility = launchDialog
    ? getScenarioTargetCompatibility(launchDialog.scenario, effectiveLaunchTarget)
    : "unknown"
  const launchBlockingChecks = launchDialog
    ? countScenarioBlockingExpectations(launchDialog.scenario)
    : 0

  const openLaunchDialog = (scenario: Scenario, mode: "simulation" | "assessment") => {
    if (launching) {
      return
    }
    setLaunchError(null)

    setLaunchDialog({
      scenario,
      mode,
      targetUrl: launchTargetDraft ?? targetUrl ?? "",
    })
  }

  const closeLaunchDialog = () => {
    if (launching) {
      return
    }

    setLaunchDialog(null)
    setLaunchError(null)
  }

  const handleLaunch = async () => {
    if (!launchDialog) {
      return
    }

    const submission = validateLaunchTargetInput(launchDialog.targetUrl)
    if (submission.error) {
      setLaunchError(submission.error)
      return
    }

    setLaunchError(null)
    const scenarioId = launchDialog.scenario.id
    const launchMode = launchDialog.mode
    setLaunching({ scenarioId, mode: launchMode })

    try {
      if (launchMode === "simulation") {
        await startSimulation(scenarioId, submission.normalized)
        if (submission.normalized) {
          setTargetUrl(submission.normalized)
        }
        setLaunchTargetDraft(submission.normalized ?? null)
        setLaunchDialog(null)
        router.push("/simulations")
      } else {
        await startAssessment(scenarioId, submission.normalized)
        if (submission.normalized) {
          setTargetUrl(submission.normalized)
        }
        setLaunchTargetDraft(submission.normalized ?? null)
        setLaunchDialog(null)
        router.push("/assessments")
      }
    } catch (caughtError) {
      setLaunchError(caughtError instanceof Error ? caughtError.message : "Failed to start scenario")
      console.error("[scenarios] launch failed", caughtError)
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

      {catalogTargetFamily && (
        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          Current target profile: <span className="font-medium text-foreground">{getTargetFamilyLabel(catalogTargetFamily)}</span>. Matching scenarios are shown first, and known cross-lab scenarios are deprioritized.
        </div>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, category, tag, or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {launching && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
        >
          Starting the {launching.mode} run for this scenario. Additional launches will be available once the request finishes.
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No scenarios match &ldquo;{searchQuery}&rdquo;
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((scenario) => (
            <ScenarioCatalogCard
              key={scenario.id}
              scenario={scenario}
              catalogTargetUrl={targetUrl}
              launching={launching}
              onCardOpen={() => setSelectedScenario(scenario)}
              onLaunch={openLaunchDialog}
            />
          ))}
        </div>
      )}

      <ScenarioDetailDialog
        scenario={selectedScenario}
        open={selectedScenario !== null}
        onOpenChange={(open) => { if (!open) setSelectedScenario(null) }}
      />

      <Dialog
        open={launchDialog !== null}
        onOpenChange={(open) => {
          if (!open && !launching) {
            closeLaunchDialog()
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {launchDialog ? `Launch ${launchDialog.scenario.name}` : "Launch Scenario"}
            </DialogTitle>
            <DialogDescription>
              Choose how to start this scenario and optionally override the target URL for this run.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <fieldset className="space-y-2">
                <legend id="launch-mode-label" className="text-sm font-medium">Launch mode</legend>
                <div className="grid grid-cols-2 gap-2" aria-labelledby="launch-mode-label">
                  <label
                    className={launchDialog?.mode === "simulation"
                      ? "flex cursor-pointer items-center justify-center rounded-md border border-primary bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                      : "flex cursor-pointer items-center justify-center rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground"
                    }
                  >
                    <input
                      type="radio"
                      name="launch-mode"
                      className="sr-only"
                      checked={launchDialog?.mode === "simulation"}
                      onChange={() => {
                        if (!launchDialog || launching) {
                          return
                        }
                        setLaunchError(null)
                        setLaunchDialog({ ...launchDialog, mode: "simulation" })
                      }}
                      disabled={launching !== null}
                    />
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    Simulation
                  </label>
                  <label
                    className={launchDialog?.mode === "assessment"
                      ? "flex cursor-pointer items-center justify-center rounded-md border border-primary bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                      : "flex cursor-pointer items-center justify-center rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground"
                    }
                  >
                    <input
                      type="radio"
                      name="launch-mode"
                      className="sr-only"
                      checked={launchDialog?.mode === "assessment"}
                      onChange={() => {
                        if (!launchDialog || launching) {
                          return
                        }
                        setLaunchError(null)
                        setLaunchDialog({ ...launchDialog, mode: "assessment" })
                      }}
                      disabled={launching !== null}
                    />
                    <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
                    Assessment
                  </label>
                </div>
              </fieldset>
            </div>

            <div className="space-y-2">
              <label htmlFor="scenario-launch-target" className="text-sm font-medium">
                Target URL
              </label>
              <Input
                id="scenario-launch-target"
                placeholder="http://localhost:8880"
                value={launchDialog?.targetUrl ?? ""}
                aria-invalid={launchTargetState.error ? true : undefined}
                onChange={(event) => {
                  if (!launchDialog || launching) {
                    return
                  }
                  setLaunchError(null)
                  setLaunchTargetDraft(event.target.value)
                  setLaunchDialog({ ...launchDialog, targetUrl: event.target.value })
                }}
                disabled={launching !== null}
              />
              <p className="text-sm text-muted-foreground">
                Leave blank to fall back to the server default target for this run. Successful launches with an override also update the saved catalog target used for future launches. Saved catalog target status:{" "}
                {getTargetStatusLabel(targetStatus)}.
              </p>
            </div>

            {launchTargetState.error && (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {launchTargetState.error}
              </div>
            )}

            {launchCompatibility === "incompatible" && launchTargetFamily && launchScenarioFamily && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                This scenario is labeled for <span className="font-medium">{getTargetFamilyLabel(launchScenarioFamily)}</span>, but the target URL looks like <span className="font-medium">{getTargetFamilyLabel(launchTargetFamily)}</span>. It may fail because the endpoint families do not line up.
              </div>
            )}

            {launchTargetFamily === "chimera" && launchBlockingChecks > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                This scenario includes <span className="font-medium">{launchBlockingChecks}</span> blocking {launchBlockingChecks === 1 ? "assertion" : "assertions"}. Live Chimera is intentionally vulnerable, so assessments may fail by design when those attacks succeed.
              </div>
            )}

            {launchError && (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {launchError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeLaunchDialog} disabled={launching !== null}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                void handleLaunch()
              }}
              disabled={
                launchDialog
                  ? launching !== null || launchTargetState.error !== null
                  : false
              }
            >
              {launchDialog && launching?.scenarioId === launchDialog.scenario.id ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Starting…
                </>
              ) : launchDialog?.mode === "assessment" ? (
                "Start assessment"
              ) : (
                "Start simulation"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface ScenarioCatalogCardProps {
  scenario: Scenario
  catalogTargetUrl: string | null
  launching: { scenarioId: string; mode: "simulation" | "assessment" } | null
  onCardOpen: () => void
  onLaunch: (scenario: Scenario, mode: "simulation" | "assessment") => void
}

function ScenarioCatalogCard({
  scenario,
  catalogTargetUrl,
  launching,
  onCardOpen,
  onLaunch,
}: ScenarioCatalogCardProps) {
  const targetFamily = inferScenarioTargetFamily(scenario)
  const compatibility = getScenarioTargetCompatibility(scenario, catalogTargetUrl)
  const blockingChecks = countScenarioBlockingExpectations(scenario)

  return (
    <Card
      className="flex flex-col cursor-pointer transition-shadow hover:shadow-md hover:border-foreground/20"
      onClick={onCardOpen}
    >
      <CardHeader>
        <div className="mb-2 flex items-start justify-between gap-3">
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
          <span className="type-data font-semibold text-foreground">{scenario.steps.length}</span> attack steps
          {blockingChecks > 0 ? ` - ${blockingChecks} blocking check${blockingChecks === 1 ? "" : "s"}` : ""}
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {targetFamily !== "unknown" && targetFamily !== "generic" && (
            <Badge variant={compatibility === "incompatible" ? "destructive" : "secondary"} className="type-tag">
              {getTargetFamilyLabel(targetFamily)}
            </Badge>
          )}
          {compatibility === "unknown" && blockingChecks > 0 && (
            <Badge variant="outline" className="type-tag">
              control checks
            </Badge>
          )}
          {scenario.tags?.slice(0, 3).map((tag: string) => (
            <Badge key={tag} variant="outline" className="type-tag">
              {tag}
            </Badge>
          ))}
        </div>
        {compatibility === "incompatible" && (
          <p className="mt-3 text-xs text-muted-foreground">
            Known mismatch with the current target family.
          </p>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={launching !== null}
          onClick={(e) => {
            e.stopPropagation()
            onLaunch(scenario, "simulation")
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
          disabled={launching !== null}
          onClick={(e) => {
            e.stopPropagation()
            onLaunch(scenario, "assessment")
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
  )
}

function validateLaunchTargetInput(value: string): LaunchTargetState {
  const trimmed = value.trim()
  if (!trimmed) {
    return {
      normalized: null,
      error: null,
    }
  }

  try {
    const parsed = new URL(trimmed)
    parsed.username = ""
    parsed.password = ""
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        normalized: null,
        error: "Enter an http:// or https:// target URL.",
      }
    }

    const normalized = parsed.toString()

    return {
      normalized: parsed.pathname === "/"
        ? normalized.replace(/\/(?=(?:[?#]|$))/, "")
        : normalized,
      error: null,
    }
  } catch {
    return {
      normalized: null,
      error: "Enter a valid target URL before starting the scenario.",
    }
  }
}

function getTargetStatusLabel(status: "online" | "offline" | "unknown"): string {
  switch (status) {
    case "online":
      return "Reachable"
    case "offline":
      return "Offline"
    case "unknown":
      return "Unchecked"
  }
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

function compareScenarioPriority(
  left: Scenario,
  right: Scenario,
  targetUrl: string | null,
  targetFamily: ScenarioTargetFamily,
): number {
  const leftCompatibility = getScenarioTargetCompatibility(left, targetUrl)
  const rightCompatibility = getScenarioTargetCompatibility(right, targetUrl)

  const leftRank = getCompatibilityRank(leftCompatibility, inferScenarioTargetFamily(left), targetFamily)
  const rightRank = getCompatibilityRank(rightCompatibility, inferScenarioTargetFamily(right), targetFamily)

  if (leftRank !== rightRank) {
    return leftRank - rightRank
  }

  return left.name.localeCompare(right.name)
}

function getCompatibilityRank(
  compatibility: ScenarioTargetCompatibility,
  scenarioFamily: ScenarioTargetFamily,
  targetFamily: ScenarioTargetFamily,
): number {
  if (compatibility === "compatible") {
    return 0
  }

  if (compatibility === "unknown") {
    return scenarioFamily === targetFamily ? 0 : 1
  }

  return 2
}

function getTargetFamilyLabel(targetFamily: ScenarioTargetFamily): string {
  switch (targetFamily) {
    case "chimera":
      return "Chimera-first"
    case "crapi":
      return "crAPI"
    case "vampi":
      return "VAmPI"
    case "vp-demo":
      return "VP demo"
    case "generic":
      return "Generic"
    case "unknown":
      return "Unclassified"
    default: {
      const exhaustiveCheck: never = targetFamily
      throw new Error(`Unhandled target family: ${exhaustiveCheck}`)
    }
  }
}
