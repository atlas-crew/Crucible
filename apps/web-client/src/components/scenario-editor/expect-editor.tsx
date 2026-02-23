"use client"

import { FormField } from "./form-field"
import { KvEditor, type KvPair } from "./kv-editor"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ChevronDown } from "lucide-react"

export interface ExpectDraft {
  enabled: boolean
  status: string
  blocked: string
  bodyContains: string
  bodyNotContains: string
  headerPresent: string
  headerEqualsPairs: KvPair[]
}

interface ExpectEditorProps {
  draft: ExpectDraft
  onChange: (draft: ExpectDraft) => void
}

export function ExpectEditor({ draft, onChange }: ExpectEditorProps) {
  const set = <K extends keyof ExpectDraft>(key: K, value: ExpectDraft[K]) =>
    onChange({ ...draft, [key]: value })

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
            Assertions
          </button>
        </CollapsibleTrigger>
        <div className="flex items-center gap-2">
          <Label htmlFor="expect-toggle" className="text-xs text-muted-foreground">
            {draft.enabled ? "Enabled" : "Disabled"}
          </Label>
          <Switch
            id="expect-toggle"
            checked={draft.enabled}
            onCheckedChange={(c) => set("enabled", c)}
          />
        </div>
      </div>
      <CollapsibleContent>
        <div className="space-y-3 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Expected Status"
              value={draft.status}
              onChange={(v) => set("status", v)}
              placeholder="200"
              inputProps={{ type: "number", min: 100, max: 599 }}
            />
            <div className="space-y-1.5">
              <Label>Blocked</Label>
              <div className="flex items-center gap-2 h-9">
                <Switch
                  checked={draft.blocked === "true"}
                  onCheckedChange={(c) => set("blocked", c ? "true" : "")}
                />
                <span className="text-sm text-muted-foreground">
                  {draft.blocked === "true" ? "Expect blocked" : "Not set"}
                </span>
              </div>
            </div>
          </div>

          <FormField
            label="Body Contains"
            value={draft.bodyContains}
            onChange={(v) => set("bodyContains", v)}
            placeholder="Expected substring in body"
            mono
          />
          <FormField
            label="Body Not Contains"
            value={draft.bodyNotContains}
            onChange={(v) => set("bodyNotContains", v)}
            placeholder="Substring that must NOT appear"
            mono
          />
          <FormField
            label="Header Present"
            value={draft.headerPresent}
            onChange={(v) => set("headerPresent", v)}
            placeholder="X-Header-Name"
            mono
          />
          <KvEditor
            label="Header Equals"
            pairs={draft.headerEqualsPairs}
            onChange={(p) => set("headerEqualsPairs", p)}
            keyPlaceholder="Header name"
            valuePlaceholder="Expected value"
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
