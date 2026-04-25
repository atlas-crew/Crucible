---
id: TASK-64.2
title: Add async operator feedback for web-client execution commands
status: To Do
assignee: []
created_date: '2026-04-13 17:00'
labels:
  - feature
  - ux
  - web-client
milestone: m-9
dependencies: []
references:
  - >-
    ../.archive/edge-protection/apps/demo-dashboard/dashboard/src/hooks/useCommandToasts.ts
  - apps/web-client/src/components/command-palette.tsx
  - apps/web-client/src/app/scenarios/page.tsx
  - apps/web-client/src/app/simulations/page.tsx
  - apps/web-client/src/store/useCatalogStore.ts
documentation:
  - docs/user-guides/running-scenarios.md
parent_task_id: TASK-64
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Adapt the archive's command-feedback pattern to current Crucible actions so operators get clear success, loading, and error feedback when they start, pause, resume, cancel, or navigate to executions. Keep the implementation aligned with the Zustand store and current command palette rather than reintroducing the archive's Redux command wiring.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Primary execution actions surface loading, success, and failure feedback in the web client
- [ ] #2 Feedback covers both direct page actions and command palette-triggered actions where those actions can fail asynchronously
- [ ] #3 The feedback system uses current Crucible architecture and does not import archive Redux command plumbing
- [ ] #4 Targeted UI or store-level tests cover success and failure behavior for representative actions
<!-- AC:END -->
