"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Trash2 } from "lucide-react"

export interface KvPair {
  key: string
  value: string
}

interface KvEditorProps {
  label: string
  pairs: KvPair[]
  onChange: (pairs: KvPair[]) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
}

export function KvEditor({
  label,
  pairs,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
}: KvEditorProps) {
  const update = (index: number, field: "key" | "value", val: string) => {
    const next = pairs.map((p, i) =>
      i === index ? { ...p, [field]: val } : p
    )
    onChange(next)
  }

  const add = () => onChange([...pairs, { key: "", value: "" }])

  const remove = (index: number) =>
    onChange(pairs.filter((_, i) => i !== index))

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {pairs.map((pair, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <Input
            value={pair.key}
            onChange={(e) => update(idx, "key", e.target.value)}
            placeholder={keyPlaceholder}
            className="flex-1 font-mono text-sm"
          />
          <Input
            value={pair.value}
            onChange={(e) => update(idx, "value", e.target.value)}
            placeholder={valuePlaceholder}
            className="flex-1 font-mono text-sm"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => remove(idx)}
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={add}
        className="w-full"
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add {label.replace(/s$/, "")}
      </Button>
    </div>
  )
}

/* ── Helpers: convert between KvPair[] and Record<string,string> ────── */

export function recordToKvPairs(record?: Record<string, string>): KvPair[] {
  if (!record) return []
  return Object.entries(record).map(([key, value]) => ({ key, value }))
}

export function kvPairsToRecord(pairs: KvPair[]): Record<string, string> | undefined {
  const filtered = pairs.filter((p) => p.key.trim() !== "")
  if (filtered.length === 0) return undefined
  return Object.fromEntries(filtered.map((p) => [p.key, p.value]))
}
