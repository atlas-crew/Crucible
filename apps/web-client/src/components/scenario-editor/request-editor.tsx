"use client"

import { FormField } from "./form-field"
import { KvEditor, type KvPair } from "./kv-editor"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

export type BodyMode = "none" | "json" | "raw"

const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const

export interface RequestDraft {
  method: string
  url: string
  headerPairs: KvPair[]
  paramPairs: KvPair[]
  bodyMode: BodyMode
  bodyJson: string
  bodyRaw: string
}

interface RequestEditorProps {
  draft: RequestDraft
  onChange: (draft: RequestDraft) => void
}

export function RequestEditor({ draft, onChange }: RequestEditorProps) {
  const set = <K extends keyof RequestDraft>(key: K, value: RequestDraft[K]) =>
    onChange({ ...draft, [key]: value })

  return (
    <div className="space-y-4">
      {/* Method + URL */}
      <div className="flex items-end gap-2">
        <div className="w-32 space-y-1.5">
          <Label>Method</Label>
          <Select value={draft.method} onValueChange={(v) => set("method", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HTTP_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <FormField
            label="URL"
            value={draft.url}
            onChange={(v) => set("url", v)}
            placeholder="https://example.com/api/endpoint"
            mono
          />
        </div>
      </div>

      {/* Headers */}
      <KvEditor
        label="Headers"
        pairs={draft.headerPairs}
        onChange={(p) => set("headerPairs", p)}
        keyPlaceholder="Header name"
        valuePlaceholder="Header value"
      />

      {/* Params */}
      <KvEditor
        label="Query Params"
        pairs={draft.paramPairs}
        onChange={(p) => set("paramPairs", p)}
        keyPlaceholder="Param name"
        valuePlaceholder="Param value"
      />

      {/* Body */}
      <div className="space-y-1.5">
        <Label>Body</Label>
        <Tabs
          value={draft.bodyMode}
          onValueChange={(v) => set("bodyMode", v as BodyMode)}
        >
          <TabsList>
            <TabsTrigger value="none">None</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
            <TabsTrigger value="raw">Raw</TabsTrigger>
          </TabsList>
          <TabsContent value="json">
            <Textarea
              value={draft.bodyJson}
              onChange={(e) => set("bodyJson", e.target.value)}
              placeholder='{ "key": "value" }'
              className="font-mono text-sm min-h-24"
              spellCheck={false}
            />
          </TabsContent>
          <TabsContent value="raw">
            <Textarea
              value={draft.bodyRaw}
              onChange={(e) => set("bodyRaw", e.target.value)}
              placeholder="Raw body content"
              className="font-mono text-sm min-h-24"
              spellCheck={false}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
