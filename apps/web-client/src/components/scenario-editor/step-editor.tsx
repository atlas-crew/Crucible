"use client"

import { useState } from "react"
import { FormField } from "./form-field"
import { TagInput } from "./tag-input"
import { RequestEditor, type RequestDraft } from "./request-editor"
import { ExecutionEditor, type ExecutionDraft } from "./execution-editor"
import { ExpectEditor, type ExpectDraft } from "./expect-editor"
import { ExtractEditor, type ExtractDraft } from "./extract-editor"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ChevronDown, ChevronRight } from "lucide-react"

const STAGE_SUGGESTIONS = [
  "initialization",
  "reconnaissance",
  "weaponization",
  "delivery",
  "exploitation",
  "installation",
  "command-and-control",
  "actions-on-objectives",
  "exfiltration",
  "cleanup",
]

export interface StepDraft {
  _key: string
  id: string
  name: string
  stage: string
  request: RequestDraft
  execution: ExecutionDraft
  expect: ExpectDraft
  extract: ExtractDraft
  dependsOn: string[]
}

interface StepEditorProps {
  draft: StepDraft
  onChange: (draft: StepDraft) => void
  index: number
  /** All step IDs for dependsOn selection */
  allStepIds: string[]
}

export function StepEditor({
  draft,
  onChange,
  index,
  allStepIds,
}: StepEditorProps) {
  const [expanded, setExpanded] = useState(false)

  const set = <K extends keyof StepDraft>(key: K, value: StepDraft[K]) =>
    onChange({ ...draft, [key]: value })

  return (
    <div className="rounded-md border">
      {/* Header — always visible */}
      <button
        type="button"
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="type-timestamp text-muted-foreground w-6">
          {index + 1}
        </span>
        <span className="text-sm font-medium flex-1 truncate">
          {draft.name || "(untitled step)"}
        </span>
        {draft.stage && (
          <Badge variant="outline" className="type-tag shrink-0">
            {draft.stage}
          </Badge>
        )}
        <span className="type-timestamp text-muted-foreground shrink-0">
          {draft.request.method}{" "}
          {draft.request.url.length > 30
            ? draft.request.url.slice(0, 30) + "..."
            : draft.request.url || "…"}
        </span>
      </button>

      {/* Body — expandable */}
      {expanded && (
        <div className="px-3 pb-4 pt-2 space-y-4 border-t">
          {/* Identity fields */}
          <div className="grid grid-cols-3 gap-3">
            <FormField
              label="Step ID"
              value={draft.id}
              onChange={(v) => set("id", v)}
              placeholder="unique-step-id"
              mono
            />
            <FormField
              label="Step Name"
              value={draft.name}
              onChange={(v) => set("name", v)}
              placeholder="Human-readable name"
            />
            <div className="space-y-1.5">
              <Label htmlFor={`stage-${draft._key}`}>Stage</Label>
              <Input
                id={`stage-${draft._key}`}
                list={`stage-suggestions-${draft._key}`}
                value={draft.stage}
                onChange={(e) => set("stage", e.target.value)}
                placeholder="e.g. exploitation"
                className="font-mono text-sm"
              />
              <datalist id={`stage-suggestions-${draft._key}`}>
                {STAGE_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Request */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Request
            </h4>
            <RequestEditor
              draft={draft.request}
              onChange={(r) => set("request", r)}
            />
          </div>

          {/* Execution Config */}
          <ExecutionEditor
            draft={draft.execution}
            onChange={(e) => set("execution", e)}
          />

          {/* Assertions */}
          <ExpectEditor
            draft={draft.expect}
            onChange={(e) => set("expect", e)}
          />

          {/* Variable Extraction */}
          <ExtractEditor
            draft={draft.extract}
            onChange={(e) => set("extract", e)}
          />

          {/* Dependencies */}
          <TagInput
            label="Depends On (step IDs)"
            tags={draft.dependsOn}
            onChange={(t) => set("dependsOn", t)}
            placeholder="Type a step ID and press Enter"
            variant="secondary"
          />
          {allStepIds.length > 0 && (
            <div className="flex flex-wrap gap-1 -mt-2">
              <span className="text-[10px] text-muted-foreground">
                Available:
              </span>
              {allStepIds
                .filter((sid) => sid !== draft.id && !draft.dependsOn.includes(sid))
                .map((sid) => (
                  <button
                    key={sid}
                    type="button"
                    className="type-timestamp text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                    onClick={() => set("dependsOn", [...draft.dependsOn, sid])}
                  >
                    {sid}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
