"use client"

import { StepEditor, type StepDraft } from "./step-editor"
import type { RequestDraft } from "./request-editor"
import type { ExecutionDraft } from "./execution-editor"
import type { ExpectDraft } from "./expect-editor"
import type { ExtractDraft } from "./extract-editor"
import { Button } from "@/components/ui/button"
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react"

interface StepsListProps {
  steps: StepDraft[]
  onChange: (steps: StepDraft[]) => void
}

export function StepsList({ steps, onChange }: StepsListProps) {
  const allStepIds = steps.map((s) => s.id).filter(Boolean)

  const updateStep = (index: number, updated: StepDraft) => {
    onChange(steps.map((s, i) => (i === index ? updated : s)))
  }

  const removeStep = (index: number) => {
    onChange(steps.filter((_, i) => i !== index))
  }

  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= steps.length) return
    const next = [...steps]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  const duplicateStep = (index: number) => {
    const source = steps[index]
    const copy: StepDraft = {
      ...structuredClone(source),
      _key: crypto.randomUUID(),
      id: `${source.id}-copy`,
      name: `${source.name} (copy)`,
    }
    const next = [...steps]
    next.splice(index + 1, 0, copy)
    onChange(next)
  }

  const addStep = () => {
    const newStep: StepDraft = {
      _key: crypto.randomUUID(),
      id: "",
      name: "",
      stage: "",
      request: emptyRequestDraft(),
      execution: emptyExecutionDraft(),
      expect: emptyExpectDraft(),
      extract: emptyExtractDraft(),
      dependsOn: [],
    }
    onChange([...steps, newStep])
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          Steps ({steps.length})
        </h3>
        <Button type="button" variant="outline" size="sm" onClick={addStep}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Step
        </Button>
      </div>

      {steps.map((step, idx) => (
        <div key={step._key} className="group relative">
          <StepEditor
            draft={step}
            onChange={(s) => updateStep(idx, s)}
            index={idx}
            allStepIds={allStepIds}
          />
          {/* Action strip */}
          <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => moveStep(idx, -1)}
              disabled={idx === 0}
              title="Move up"
              aria-label={`Move step ${idx + 1} up`}
            >
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => moveStep(idx, 1)}
              disabled={idx === steps.length - 1}
              title="Move down"
              aria-label={`Move step ${idx + 1} down`}
            >
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => duplicateStep(idx)}
              title="Duplicate"
              aria-label={`Duplicate step ${idx + 1}`}
            >
              <Copy className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => removeStep(idx)}
              title="Remove"
              aria-label={`Remove step ${idx + 1}`}
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        </div>
      ))}

      {steps.length === 0 && (
        <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
          No steps yet. Click &quot;Add Step&quot; to create one.
        </div>
      )}
    </div>
  )
}

/* ── Empty draft factories ──────────────────────────────────────────── */

export function emptyRequestDraft(): RequestDraft {
  return {
    method: "GET",
    url: "",
    headerPairs: [],
    paramPairs: [],
    bodyMode: "none",
    bodyJson: "",
    bodyRaw: "",
  }
}

export function emptyExecutionDraft(): ExecutionDraft {
  return { enabled: false, delayMs: "", retries: "", jitter: "", iterations: "" }
}

export function emptyExpectDraft(): ExpectDraft {
  return {
    enabled: false,
    status: "",
    blocked: "",
    bodyContains: "",
    bodyNotContains: "",
    headerPresent: "",
    headerEqualsPairs: [],
  }
}

export function emptyExtractDraft(): ExtractDraft {
  return { enabled: false, rows: [] }
}
