"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ChevronDown, Plus, Trash2 } from "lucide-react"

export interface ExtractRow {
  varName: string
  from: string
  path: string
}

export interface ExtractDraft {
  enabled: boolean
  rows: ExtractRow[]
}

interface ExtractEditorProps {
  draft: ExtractDraft
  onChange: (draft: ExtractDraft) => void
}

const EXTRACT_SOURCES = ["body", "header", "status"] as const

export function ExtractEditor({ draft, onChange }: ExtractEditorProps) {
  const set = <K extends keyof ExtractDraft>(key: K, value: ExtractDraft[K]) =>
    onChange({ ...draft, [key]: value })

  const updateRow = (index: number, field: keyof ExtractRow, val: string) => {
    const next = draft.rows.map((r, i) =>
      i === index ? { ...r, [field]: val } : r
    )
    set("rows", next)
  }

  const addRow = () =>
    set("rows", [...draft.rows, { varName: "", from: "body", path: "" }])

  const removeRow = (index: number) =>
    set("rows", draft.rows.filter((_, i) => i !== index))

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
            Variable Extraction
          </button>
        </CollapsibleTrigger>
        <div className="flex items-center gap-2">
          <Label htmlFor="extract-toggle" className="text-xs text-muted-foreground">
            {draft.enabled ? "Enabled" : "Disabled"}
          </Label>
          <Switch
            id="extract-toggle"
            checked={draft.enabled}
            onCheckedChange={(c) => set("enabled", c)}
          />
        </div>
      </div>
      <CollapsibleContent>
        <div className="space-y-2 pt-3">
          {draft.rows.map((row, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                value={row.varName}
                onChange={(e) => updateRow(idx, "varName", e.target.value)}
                placeholder="Variable name"
                className="flex-1 font-mono text-sm"
              />
              <Select
                value={row.from}
                onValueChange={(v) => updateRow(idx, "from", v)}
              >
                <SelectTrigger className="w-28" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXTRACT_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={row.path}
                onChange={(e) => updateRow(idx, "path", e.target.value)}
                placeholder="JSONPath (e.g. data.token)"
                className="flex-1 font-mono text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => removeRow(idx)}
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            className="w-full"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Extraction Rule
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
