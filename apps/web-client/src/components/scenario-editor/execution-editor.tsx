"use client"

import { FormField } from "./form-field"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ChevronDown } from "lucide-react"

export interface ExecutionDraft {
  enabled: boolean
  delayMs: string
  retries: string
  jitter: string
  iterations: string
}

interface ExecutionEditorProps {
  draft: ExecutionDraft
  onChange: (draft: ExecutionDraft) => void
}

export function ExecutionEditor({ draft, onChange }: ExecutionEditorProps) {
  const set = <K extends keyof ExecutionDraft>(
    key: K,
    value: ExecutionDraft[K]
  ) => onChange({ ...draft, [key]: value })

  return (
    <Collapsible open={draft.enabled} onOpenChange={(o) => set("enabled", o)}>
      <div className="flex items-center justify-between rounded-md border px-3 py-2">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-medium"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                draft.enabled ? "" : "-rotate-90"
              }`}
            />
            Execution Config
          </button>
        </CollapsibleTrigger>
        <div className="flex items-center gap-2">
          <Label htmlFor="exec-toggle" className="text-xs text-muted-foreground">
            {draft.enabled ? "Enabled" : "Disabled"}
          </Label>
          <Switch
            id="exec-toggle"
            checked={draft.enabled}
            onCheckedChange={(c) => set("enabled", c)}
          />
        </div>
      </div>
      <CollapsibleContent>
        <div className="grid grid-cols-2 gap-3 pt-3">
          <FormField
            label="Delay (ms)"
            value={draft.delayMs}
            onChange={(v) => set("delayMs", v)}
            placeholder="0"
            inputProps={{ type: "number", min: 0 }}
          />
          <FormField
            label="Retries"
            value={draft.retries}
            onChange={(v) => set("retries", v)}
            placeholder="0"
            inputProps={{ type: "number", min: 0 }}
          />
          <FormField
            label="Jitter (ms)"
            value={draft.jitter}
            onChange={(v) => set("jitter", v)}
            placeholder="0"
            inputProps={{ type: "number", min: 0 }}
          />
          <FormField
            label="Iterations"
            value={draft.iterations}
            onChange={(v) => set("iterations", v)}
            placeholder="1"
            inputProps={{ type: "number", min: 1 }}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
