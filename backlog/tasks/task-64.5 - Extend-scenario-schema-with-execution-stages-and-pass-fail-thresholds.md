---
id: TASK-64.5
title: Extend scenario schema with execution stages and pass/fail thresholds
status: To Do
assignee: []
created_date: '2026-04-24 04:20'
labels:
  - feature
  - scenario-engine
  - catalog
  - archive-borrow
milestone: m-10
dependencies: []
references:
  - >-
    ../.archive/edge-protection/apps/load-testing/config/performance-scenarios.json
  - packages/catalog/src/models/types.ts
  - packages/catalog/src/db/execution-repository.ts
  - apps/demo-dashboard/src/server/engine.ts
  - apps/web-client/src/components/execution-timeline.tsx
documentation:
  - docs/architecture/scenario-engine.md
  - docs/user-guides/running-scenarios.md
parent_task_id: TASK-64
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Borrow the staged-execution + adaptive-threshold pattern from the archived load-testing app and bring it into Crucible's scenario catalog. Operators should be able to author a scenario with a ramp-up / hold / ramp-down profile and per-scenario success thresholds (for example minimum assertion pass rate or maximum step latency). The simulation engine should honor the pacing, and assessment reports should treat thresholds as first-class pass/fail criteria alongside existing assertion results. Design this alongside TASK-64.4 because thresholds are the natural data source for reasoning output.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Scenario schema in @crucible/catalog accepts optional stages (each with duration and target rate) and thresholds (typed pass/fail criteria) with Zod validation
- [ ] #2 Existing scenarios without stages or thresholds continue to load and execute identically so this is a non-breaking change
- [ ] #3 Simulation engine honors stage pacing during execution and emits stage-boundary events that appear in the execution timeline
- [ ] #4 Assessment pass/fail evaluation considers scenario thresholds alongside assertion results and surfaces which threshold drove a failure in the report
- [ ] #5 Targeted unit tests cover stage parsing, threshold evaluation, and backward-compatible loading of legacy scenarios
- [ ] #6 Schema change is documented in the scenario engine architecture doc and the running-scenarios user guide
<!-- AC:END -->
