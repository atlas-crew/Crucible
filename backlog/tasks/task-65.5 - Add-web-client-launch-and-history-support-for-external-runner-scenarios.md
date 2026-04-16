---
id: TASK-65.5
title: Add web-client launch and history support for external runner scenarios
status: To Do
assignee: []
created_date: '2026-04-13 18:02'
updated_date: '2026-04-13 18:02'
labels:
  - feature
  - web-ui
  - k6
  - nuclei
milestone: m-9
dependencies:
  - TASK-63.6
  - TASK-65.2
  - TASK-65.3
  - TASK-65.4
references:
  - apps/web-client/src/components/command-palette.tsx
  - apps/web-client/src/components/site-header.tsx
  - apps/web-client/src/components/execution-timeline.tsx
  - apps/demo-dashboard/src/server/backend.ts
parent_task_id: TASK-65
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Once the backend contract is stable, expose runner-backed scenarios in the web client so operators can launch, inspect, and revisit them from the same UI used for native Crucible scenarios. This work should build on TASK-63 launch-target work rather than introducing separate target selection UI for runner scenarios.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The web UI can launch runner-backed scenarios using the same target-selection model established for standard scenario runs
- [ ] #2 Execution history and detail views surface runner summaries and artifact links without pretending runner steps are normal HTTP responses
- [ ] #3 UI copy and affordances make the curated runner scope clear so operators understand they are invoking packaged k6 or nuclei actions rather than a general-purpose shell runner
- [ ] #4 The UI does not duplicate target-handling work already tracked under TASK-63
<!-- AC:END -->
