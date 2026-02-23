"use client"

import { useState, useEffect, useCallback } from "react"
import type { Scenario, ScenarioStep } from "@crucible/catalog"
import { useCatalogStore } from "@/store/useCatalogStore"
import { MetadataForm, type ScenarioDraft } from "./metadata-form"
import { StepsList, emptyRequestDraft, emptyExecutionDraft, emptyExpectDraft, emptyExtractDraft } from "./steps-list"
import type { StepDraft } from "./step-editor"
import type { BodyMode, RequestDraft } from "./request-editor"
import type { ExecutionDraft } from "./execution-editor"
import type { ExpectDraft } from "./expect-editor"
import type { ExtractDraft, ExtractRow } from "./extract-editor"
import { recordToKvPairs, kvPairsToRecord, type KvPair } from "./kv-editor"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Code, Eye, Save } from "lucide-react"

/* ── Known scenario-level keys (everything else is "unknown") ──────── */

const KNOWN_SCENARIO_KEYS = new Set([
  "id", "name", "description", "category", "difficulty",
  "steps", "version", "tags", "rule_ids",
  "target", "sourceIp", "kind",
])

const KNOWN_STEP_KEYS = new Set([
  "id", "name", "stage", "request", "execution",
  "expect", "extract", "dependsOn", "when",
])

/* ── Props ──────────────────────────────────────────────────────────── */

interface ScenarioEditorTabProps {
  scenario: Scenario
  onSaveSuccess: () => void
}

export function ScenarioEditorTab({
  scenario,
  onSaveSuccess,
}: ScenarioEditorTabProps) {
  const updateScenario = useCatalogStore((s) => s.updateScenario)

  // View mode: visual form or raw JSON
  const [viewMode, setViewMode] = useState<"visual" | "json">("visual")

  // Draft state
  const [metadata, setMetadata] = useState<ScenarioDraft>(() =>
    scenarioToMetadataDraft(scenario)
  )
  const [steps, setSteps] = useState<StepDraft[]>(() =>
    scenario.steps.map(stepToStepDraft)
  )

  // Unknown keys preservation
  const [unknownScenarioKeys, setUnknownScenarioKeys] = useState<Record<string, unknown>>(() =>
    extractUnknownKeys(scenario, KNOWN_SCENARIO_KEYS)
  )
  const [unknownStepKeys, setUnknownStepKeys] = useState<Map<string, Record<string, unknown>>>(() => {
    const map = new Map<string, Record<string, unknown>>()
    for (const step of scenario.steps) {
      const extra = extractUnknownKeys(step, KNOWN_STEP_KEYS)
      if (Object.keys(extra).length > 0) map.set(step.id, extra)
    }
    return map
  })

  // JSON view state
  const [jsonText, setJsonText] = useState("")
  const [jsonError, setJsonError] = useState<string | null>(null)

  // Save state
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Build scenario from draft state
  const buildScenario = useCallback((): Scenario => {
    return draftToScenario(metadata, steps, unknownScenarioKeys, unknownStepKeys)
  }, [metadata, steps, unknownScenarioKeys, unknownStepKeys])

  // Sync JSON text when switching to JSON view
  useEffect(() => {
    if (viewMode === "json") {
      setJsonText(JSON.stringify(buildScenario(), null, 2))
      setJsonError(null)
    }
  }, [viewMode, buildScenario])

  // Reset drafts when scenario identity changes (e.g. after save)
  const scenarioId = scenario.id
  useEffect(() => {
    setMetadata(scenarioToMetadataDraft(scenario))
    setSteps((prev) => reconcileStepKeys(prev, scenario.steps.map(stepToStepDraft)))
    setUnknownScenarioKeys(extractUnknownKeys(scenario, KNOWN_SCENARIO_KEYS))
    const map = new Map<string, Record<string, unknown>>()
    for (const step of scenario.steps) {
      const extra = extractUnknownKeys(step, KNOWN_STEP_KEYS)
      if (Object.keys(extra).length > 0) map.set(step.id, extra)
    }
    setUnknownStepKeys(map)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId])

  // Switch from JSON back to visual
  const switchToVisual = () => {
    if (viewMode === "json") {
      try {
        const parsed = JSON.parse(jsonText) as Scenario
        setMetadata(scenarioToMetadataDraft(parsed))
        setSteps((prev) => reconcileStepKeys(prev, (parsed.steps ?? []).map(stepToStepDraft)))
        setUnknownScenarioKeys(extractUnknownKeys(parsed, KNOWN_SCENARIO_KEYS))
        const map = new Map<string, Record<string, unknown>>()
        for (const step of parsed.steps ?? []) {
          const extra = extractUnknownKeys(step, KNOWN_STEP_KEYS)
          if (Object.keys(extra).length > 0) map.set(step.id, extra)
        }
        setUnknownStepKeys(map)
        setJsonError(null)
      } catch {
        setJsonError("Invalid JSON — fix syntax before switching to visual mode")
        return
      }
    }
    setViewMode("visual")
  }

  // Save handler
  const handleSave = async () => {
    setSaveError(null)
    let data: Scenario

    if (viewMode === "json") {
      try {
        data = JSON.parse(jsonText)
      } catch {
        setSaveError("Invalid JSON syntax")
        return
      }
    } else {
      data = buildScenario()
    }

    if (!data.id || !data.name || !data.steps) {
      setSaveError("ID, name, and steps are required")
      return
    }

    setSaving(true)
    try {
      await updateScenario(scenario.id, data)
      onSaveSuccess()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <Button
            type="button"
            variant={viewMode === "visual" ? "default" : "outline"}
            size="sm"
            onClick={() =>
              viewMode === "json" ? switchToVisual() : setViewMode("visual")
            }
          >
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            Visual
          </Button>
          <Button
            type="button"
            variant={viewMode === "json" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("json")}
          >
            <Code className="mr-1.5 h-3.5 w-3.5" />
            JSON
          </Button>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm">
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      {(saveError || jsonError) && (
        <p className="text-sm text-destructive font-medium">
          {saveError || jsonError}
        </p>
      )}

      {/* Content */}
      {viewMode === "visual" ? (
        <ScrollArea className="h-[58vh]">
          <div className="space-y-6 pr-4">
            <MetadataForm draft={metadata} onChange={setMetadata} />
            <Separator />
            <StepsList steps={steps} onChange={setSteps} />
          </div>
        </ScrollArea>
      ) : (
        <Textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          className="font-mono text-sm min-h-[400px] max-h-[58vh] resize-y"
          spellCheck={false}
        />
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   Conversion: Scenario → Draft
   ══════════════════════════════════════════════════════════════════════ */

function scenarioToMetadataDraft(s: Scenario): ScenarioDraft {
  return {
    id: s.id ?? "",
    name: s.name ?? "",
    description: s.description ?? "",
    category: s.category ?? "",
    difficulty: s.difficulty ?? "",
    tags: s.tags ?? [],
    rule_ids: s.rule_ids ?? [],
    target: (s as Record<string, unknown>).target as string ?? "",
    sourceIp: (s as Record<string, unknown>).sourceIp as string ?? "",
    kind: (s as Record<string, unknown>).kind as string ?? "",
    version: s.version != null ? String(s.version) : "",
  }
}

function stepToStepDraft(step: ScenarioStep): StepDraft {
  return {
    _key: crypto.randomUUID(),
    id: step.id,
    name: step.name,
    stage: step.stage,
    request: requestToRequestDraft(step.request),
    execution: executionToExecutionDraft(step.execution),
    expect: expectToExpectDraft(step.expect),
    extract: extractToExtractDraft(step.extract),
    dependsOn: step.dependsOn ?? [],
  }
}

function requestToRequestDraft(req: ScenarioStep["request"]): RequestDraft {
  const body = req.body
  let bodyMode: BodyMode = "none"
  let bodyJson = ""
  let bodyRaw = ""

  if (body != null) {
    if (typeof body === "string") {
      bodyMode = "raw"
      bodyRaw = body
    } else {
      bodyMode = "json"
      bodyJson = JSON.stringify(body, null, 2)
    }
  }

  return {
    method: req.method,
    url: req.url,
    headerPairs: recordToKvPairs(req.headers),
    paramPairs: recordToKvPairs(req.params),
    bodyMode,
    bodyJson,
    bodyRaw,
  }
}

function executionToExecutionDraft(exec?: ScenarioStep["execution"]): ExecutionDraft {
  if (!exec) return emptyExecutionDraft()
  return {
    enabled: true,
    delayMs: exec.delayMs != null ? String(exec.delayMs) : "",
    retries: exec.retries != null ? String(exec.retries) : "",
    jitter: exec.jitter != null ? String(exec.jitter) : "",
    iterations: exec.iterations != null ? String(exec.iterations) : "",
  }
}

function expectToExpectDraft(exp?: ScenarioStep["expect"]): ExpectDraft {
  if (!exp) return emptyExpectDraft()
  return {
    enabled: true,
    status: exp.status != null ? String(exp.status) : "",
    blocked: exp.blocked != null ? String(exp.blocked) : "",
    bodyContains: exp.bodyContains ?? "",
    bodyNotContains: exp.bodyNotContains ?? "",
    headerPresent: exp.headerPresent ?? "",
    headerEqualsPairs: recordToKvPairs(exp.headerEquals),
  }
}

function extractToExtractDraft(ext?: ScenarioStep["extract"]): ExtractDraft {
  if (!ext) return emptyExtractDraft()
  const rows: ExtractRow[] = Object.entries(ext).map(([varName, rule]) => ({
    varName,
    from: rule.from,
    path: rule.path ?? "",
  }))
  return { enabled: true, rows }
}

/* ══════════════════════════════════════════════════════════════════════
   Conversion: Draft → Scenario
   ══════════════════════════════════════════════════════════════════════ */

function draftToScenario(
  meta: ScenarioDraft,
  steps: StepDraft[],
  unknownScenario: Record<string, unknown>,
  unknownSteps: Map<string, Record<string, unknown>>
): Scenario {
  // Spread unknown keys first so known keys override
  const result: Record<string, unknown> = { ...unknownScenario }

  result.id = meta.id
  result.name = meta.name
  if (meta.description) result.description = meta.description
  if (meta.category) result.category = meta.category
  if (meta.difficulty) result.difficulty = meta.difficulty
  if (meta.tags.length > 0) result.tags = meta.tags
  if (meta.rule_ids.length > 0) result.rule_ids = meta.rule_ids
  if (meta.target) result.target = meta.target
  if (meta.sourceIp) result.sourceIp = meta.sourceIp
  if (meta.kind) result.kind = meta.kind
  if (meta.version) result.version = toNum(meta.version)

  result.steps = steps.map((s) => stepDraftToStep(s, unknownSteps.get(s.id)))

  return result as unknown as Scenario
}

function stepDraftToStep(
  draft: StepDraft,
  unknownKeys?: Record<string, unknown>
): ScenarioStep {
  const step: Record<string, unknown> = { ...(unknownKeys ?? {}) }

  step.id = draft.id
  step.name = draft.name
  step.stage = draft.stage

  // Request
  const req: Record<string, unknown> = {
    method: draft.request.method,
    url: draft.request.url,
  }
  const headers = kvPairsToRecord(draft.request.headerPairs)
  if (headers) req.headers = headers
  const params = kvPairsToRecord(draft.request.paramPairs)
  if (params) req.params = params
  if (draft.request.bodyMode === "json" && draft.request.bodyJson.trim()) {
    try {
      req.body = JSON.parse(draft.request.bodyJson)
    } catch {
      req.body = draft.request.bodyJson
    }
  } else if (draft.request.bodyMode === "raw" && draft.request.bodyRaw.trim()) {
    req.body = draft.request.bodyRaw
  }
  step.request = req

  // Execution
  if (draft.execution.enabled) {
    const exec: Record<string, unknown> = {}
    const delayMs = toNum(draft.execution.delayMs)
    if (delayMs != null) exec.delayMs = delayMs
    const retries = toNum(draft.execution.retries)
    if (retries != null) exec.retries = retries
    const jitter = toNum(draft.execution.jitter)
    if (jitter != null) exec.jitter = jitter
    const iterations = toNum(draft.execution.iterations)
    if (iterations != null) exec.iterations = iterations
    // Only include if at least one field is set
    if (Object.values(exec).some((v) => v != null)) step.execution = exec
  }

  // Expect
  if (draft.expect.enabled) {
    const exp: Record<string, unknown> = {}
    const status = toNum(draft.expect.status)
    if (status != null) exp.status = status
    if (draft.expect.blocked === "true") exp.blocked = true
    if (draft.expect.bodyContains) exp.bodyContains = draft.expect.bodyContains
    if (draft.expect.bodyNotContains) exp.bodyNotContains = draft.expect.bodyNotContains
    if (draft.expect.headerPresent) exp.headerPresent = draft.expect.headerPresent
    const headerEquals = kvPairsToRecord(draft.expect.headerEqualsPairs)
    if (headerEquals) exp.headerEquals = headerEquals
    if (Object.keys(exp).length > 0) step.expect = exp
  }

  // Extract
  if (draft.extract.enabled && draft.extract.rows.length > 0) {
    const ext: Record<string, unknown> = {}
    for (const row of draft.extract.rows) {
      if (row.varName.trim()) {
        const rule: Record<string, unknown> = { from: row.from }
        if (row.path) rule.path = row.path
        ext[row.varName] = rule
      }
    }
    if (Object.keys(ext).length > 0) step.extract = ext
  }

  // Dependencies
  if (draft.dependsOn.length > 0) step.dependsOn = draft.dependsOn

  return step as unknown as ScenarioStep
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"])

function extractUnknownKeys(
  obj: Record<string, unknown>,
  knownKeys: Set<string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (!knownKeys.has(key) && !DANGEROUS_KEYS.has(key)) {
      result[key] = value
    }
  }
  return result
}

/** Preserve existing _keys for steps matched by id to avoid DOM teardown. */
function reconcileStepKeys(prev: StepDraft[], next: StepDraft[]): StepDraft[] {
  const keyById = new Map<string, string>()
  for (const s of prev) {
    if (s.id) keyById.set(s.id, s._key)
  }
  return next.map((s) => {
    const existingKey = keyById.get(s.id)
    return existingKey ? { ...s, _key: existingKey } : s
  })
}

/** Convert string to number, returning undefined for empty/NaN. Preserves zero. */
function toNum(s: string): number | undefined {
  const trimmed = s.trim()
  if (trimmed === "") return undefined
  const n = Number(trimmed)
  return Number.isNaN(n) ? undefined : n
}
