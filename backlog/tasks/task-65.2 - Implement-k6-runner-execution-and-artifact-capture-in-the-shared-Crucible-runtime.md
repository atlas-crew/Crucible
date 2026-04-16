---
id: TASK-65.2
title: >-
  Implement k6 runner execution and artifact capture in the shared Crucible
  runtime
status: To Do
assignee: []
created_date: '2026-04-13 18:02'
updated_date: '2026-04-13 18:02'
labels:
  - feature
  - scenario-engine
  - k6
  - load-testing
milestone: m-7
dependencies:
  - TASK-65.1
references:
  - apps/demo-dashboard/src/server/engine.ts
  - apps/demo-dashboard/src/server/runtime.ts
  - >-
    ../.archive/edge-protection/apps/load-testing/apps/control-panel-api/src/lib/k6-adapter.ts
parent_task_id: TASK-65
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add the first external runner implementation by teaching the shared runtime and ScenarioEngine how to execute curated k6 steps. Reuse the archive for ideas like native or docker execution modes, environment injection, metrics parsing, and artifact capture, but keep Crucible's scope focused on orchestrating and reporting curated runs rather than becoming a full k6 management surface.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 k6 steps execute through the shared runtime using approved script references rather than arbitrary command strings
- [ ] #2 Runner execution supports target and environment injection, timeout handling, and deterministic exit-state mapping into Crucible step status
- [ ] #3 k6 output is parsed into a concise summary with threshold or failure information plus captured artifacts suitable for later report download
- [ ] #4 Security guardrails cover allowed script locations, output limits, and artifact retention behavior
<!-- AC:END -->
