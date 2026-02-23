"use client"

import { useState } from "react"
import type { Scenario, ScenarioStep } from "@crucible/catalog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { ScenarioEditorTab } from "@/components/scenario-editor"
import { ChevronDown, ChevronRight } from "lucide-react"

interface ScenarioDetailDialogProps {
  scenario: Scenario | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ScenarioDetailDialog({ scenario, open, onOpenChange }: ScenarioDetailDialogProps) {
  if (!scenario) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl">{scenario.name}</DialogTitle>
          <DialogDescription>{scenario.description}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overview" className="flex-1 min-h-0">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="steps">Steps ({scenario.steps.length})</TabsTrigger>
            <TabsTrigger value="edit">Edit</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab scenario={scenario} />
          </TabsContent>

          <TabsContent value="steps" className="min-h-0">
            <StepsTab steps={scenario.steps} />
          </TabsContent>

          <TabsContent value="edit" className="min-h-0">
            <ScenarioEditorTab
              scenario={scenario}
              onSaveSuccess={() => onOpenChange(false)}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

/* ── Overview Tab ─────────────────────────────────────────────────── */

function OverviewTab({ scenario }: { scenario: Scenario }) {
  const fields: [string, string | undefined][] = [
    ["ID", scenario.id],
    ["Category", scenario.category],
    ["Difficulty", scenario.difficulty],
    ["Kind", scenario.kind],
    ["Target", scenario.target],
    ["Source IP", scenario.sourceIp],
    ["Steps", String(scenario.steps.length)],
    ["Version", scenario.version != null ? String(scenario.version) : undefined],
  ]

  return (
    <ScrollArea className="h-[60vh]">
      <div className="space-y-4 pr-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          {fields.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="type-label text-muted-foreground">{label}</dt>
              <dd className="type-data">{value ?? "—"}</dd>
            </div>
          ))}
        </dl>

        {scenario.tags && scenario.tags.length > 0 && (
          <div>
            <h4 className="type-label text-muted-foreground mb-2">Tags</h4>
            <div className="flex flex-wrap gap-1.5">
              {scenario.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="type-tag">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {scenario.rule_ids && scenario.rule_ids.length > 0 && (
          <div>
            <h4 className="type-label text-muted-foreground mb-2">Rule IDs</h4>
            <div className="flex flex-wrap gap-1.5">
              {scenario.rule_ids.map((rid) => (
                <Badge key={rid} variant="secondary" className="type-tag">
                  {rid}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  )
}

/* ── Steps Tab ────────────────────────────────────────────────────── */

function StepsTab({ steps }: { steps: ScenarioStep[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <ScrollArea className="h-[60vh]">
      <div className="space-y-1 pr-4">
        {steps.map((step, idx) => {
          const isOpen = expandedId === step.id
          return (
            <div key={step.id} className="rounded-md border">
              <button
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                onClick={() => setExpandedId(isOpen ? null : step.id)}
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="type-timestamp text-muted-foreground w-6">{idx + 1}</span>
                <span className="type-body font-medium flex-1 truncate">{step.name}</span>
                <Badge variant="outline" className="type-tag shrink-0">
                  {step.stage}
                </Badge>
                <span className="type-timestamp text-muted-foreground shrink-0">
                  {step.request.method} {step.request.url.length > 40
                    ? step.request.url.slice(0, 40) + "..."
                    : step.request.url}
                </span>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 pt-1 space-y-3 border-t">
                  <StepDetail label="ID" value={step.id} />

                  {step.request.headers && Object.keys(step.request.headers).length > 0 && (
                    <DetailBlock label="Headers">
                      <pre className="type-code whitespace-pre-wrap">
                        {JSON.stringify(step.request.headers, null, 2)}
                      </pre>
                    </DetailBlock>
                  )}

                  {step.request.body && (
                    <DetailBlock label="Body">
                      <pre className="type-code whitespace-pre-wrap">
                        {typeof step.request.body === "string"
                          ? step.request.body
                          : JSON.stringify(step.request.body, null, 2)}
                      </pre>
                    </DetailBlock>
                  )}

                  {step.execution && (
                    <DetailBlock label="Execution">
                      <pre className="type-code whitespace-pre-wrap">
                        {JSON.stringify(step.execution, null, 2)}
                      </pre>
                    </DetailBlock>
                  )}

                  {step.expect && (
                    <DetailBlock label="Assertions">
                      <pre className="type-code whitespace-pre-wrap">
                        {JSON.stringify(step.expect, null, 2)}
                      </pre>
                    </DetailBlock>
                  )}

                  {step.extract && (
                    <DetailBlock label="Extract">
                      <pre className="type-code whitespace-pre-wrap">
                        {JSON.stringify(step.extract, null, 2)}
                      </pre>
                    </DetailBlock>
                  )}

                  {step.dependsOn && step.dependsOn.length > 0 && (
                    <StepDetail label="Depends On" value={step.dependsOn.join(", ")} />
                  )}

                  {step.when && (
                    <DetailBlock label="When Condition">
                      <pre className="type-code whitespace-pre-wrap">
                        {JSON.stringify(step.when, null, 2)}
                      </pre>
                    </DetailBlock>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}

/* ── Shared helpers ───────────────────────────────────────────────── */

function StepDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-xs">
      <span className="type-label text-muted-foreground w-24 shrink-0">{label}</span>
      <span className="type-data">{value}</span>
    </div>
  )
}

function DetailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Separator />
      <span className="type-label text-muted-foreground">{label}</span>
      <div className="rounded bg-muted/50 p-2">{children}</div>
    </div>
  )
}
