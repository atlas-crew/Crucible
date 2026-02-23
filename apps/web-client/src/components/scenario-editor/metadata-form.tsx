"use client"

import { FormField } from "./form-field"
import { TagInput } from "./tag-input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const DIFFICULTIES = ["Beginner", "Intermediate", "Advanced", "Expert"] as const
const DIFFICULTY_NONE = "__none__"

export interface ScenarioDraft {
  id: string
  name: string
  description: string
  category: string
  difficulty: string
  tags: string[]
  rule_ids: string[]
  target: string
  sourceIp: string
  kind: string
  version: string
}

interface MetadataFormProps {
  draft: ScenarioDraft
  onChange: (draft: ScenarioDraft) => void
}

export function MetadataForm({ draft, onChange }: MetadataFormProps) {
  const set = <K extends keyof ScenarioDraft>(key: K, value: ScenarioDraft[K]) =>
    onChange({ ...draft, [key]: value })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <FormField
          label="Scenario ID"
          value={draft.id}
          onChange={(v) => set("id", v)}
          placeholder="unique-scenario-id"
          mono
        />
        <FormField
          label="Name"
          value={draft.name}
          onChange={(v) => set("name", v)}
          placeholder="Scenario display name"
        />
      </div>

      <FormField
        label="Description"
        value={draft.description}
        onChange={(v) => set("description", v)}
        placeholder="Brief description of what this scenario tests"
        multiline
      />

      <div className="grid grid-cols-3 gap-3">
        <FormField
          label="Category"
          value={draft.category}
          onChange={(v) => set("category", v)}
          placeholder="e.g. Identity, VP Demo"
        />
        <div className="space-y-1.5">
          <Label>Difficulty</Label>
          <Select
            value={draft.difficulty || DIFFICULTY_NONE}
            onValueChange={(v) => set("difficulty", v === DIFFICULTY_NONE ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DIFFICULTY_NONE}>None</SelectItem>
              {DIFFICULTIES.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <FormField
          label="Kind"
          value={draft.kind}
          onChange={(v) => set("kind", v)}
          placeholder="e.g. campaign, probe"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField
          label="Target"
          value={draft.target}
          onChange={(v) => set("target", v)}
          placeholder="Target URL or identifier"
          mono
        />
        <FormField
          label="Source IP"
          value={draft.sourceIp}
          onChange={(v) => set("sourceIp", v)}
          placeholder="e.g. 203.0.113.45"
          mono
        />
      </div>

      <FormField
        label="Version"
        value={draft.version}
        onChange={(v) => set("version", v)}
        placeholder="1"
        inputProps={{ type: "number", min: 1 }}
      />

      <TagInput
        label="Tags"
        tags={draft.tags}
        onChange={(t) => set("tags", t)}
        placeholder="Add tag and press Enter"
        variant="outline"
      />

      <TagInput
        label="Rule IDs"
        tags={draft.rule_ids}
        onChange={(t) => set("rule_ids", t)}
        placeholder="Add rule ID and press Enter"
        variant="secondary"
      />
    </div>
  )
}
