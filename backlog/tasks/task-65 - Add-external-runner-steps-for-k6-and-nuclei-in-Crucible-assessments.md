---
id: TASK-65
title: Add external runner steps for k6 and nuclei in Crucible assessments
status: To Do
assignee: []
created_date: '2026-04-13 18:02'
labels:
  - feature
  - scenario-engine
  - k6
  - nuclei
milestone: m-7
dependencies: []
references:
  - apps/client/src/types.ts
  - apps/demo-dashboard/src/server/engine.ts
  - apps/demo-dashboard/src/server/runtime.ts
  - >-
    ../.archive/edge-protection/apps/load-testing/apps/control-panel-api/src/lib/k6-adapter.ts
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Crucible should support a narrow external-runner model inside its existing scenario and assessment workflow so operators can run curated k6 load tests and nuclei scans as part of the same execution history, evidence trail, and report output. The goal is not to recreate the archived load-testing control plane; it is to add first-class runner steps that fit the current shared runtime, CLI, and web UI surfaces.

The current engine and scenario schema are HTTP-step-centric, so this work should introduce typed runner steps rather than layering more optional fields onto the existing request shape. HTTP steps must remain backward compatible. Runner support should reuse the same execution and reporting surfaces wherever possible, align with TASK-63 target override work instead of creating a parallel target model, and enforce guardrails around approved script/template references, timeouts, and artifact retention.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Scenario definitions support a typed step model that can represent existing HTTP steps plus curated k6 and nuclei runner steps without breaking current scenarios
- [ ] #2 ScenarioEngine and shared runtime can execute runner steps and persist step-level summaries, exit state, and artifacts alongside existing execution data
- [ ] #3 k6 runner support ships first with approved script references, target and environment injection, threshold-aware summaries, and artifact capture
- [ ] #4 nuclei runner support ships on the same execution seam with approved template or workflow references, findings summaries, and artifact capture
- [ ] #5 CLI, reports, and web surfaces present runner-backed executions as part of the same assessment story rather than a separate tool workflow
- [ ] #6 Target handling reuses or aligns with TASK-63 so external runners do not introduce a second incompatible target-selection path
<!-- AC:END -->
