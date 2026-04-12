---
id: TASK-63.6
title: Expose per-run target URL in the web UI launch dialog and history views
status: To Do
assignee: []
created_date: '2026-04-12 19:25'
updated_date: '2026-04-12 19:25'
labels:
  - feature
  - per-run-target
  - web-client
  - ui
dependencies:
  - TASK-63.3
references:
  - apps/web-client/src/components/scenario-detail-dialog.tsx
  - apps/web-client/src/store/useCatalogStore.ts
  - apps/web-client/src/components/history
  - apps/web-client/src/components/execution-timeline.tsx
parent_task_id: TASK-63
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Surface the per-run target override in the Next.js web client so operators can pick a target when launching a scenario and see which target each historical run hit. Today the header shows a single engine-level target from the zustand store's `targetUrl` (already wired up via `/health` in `apps/web-client/src/store/useCatalogStore.ts`). That field becomes the default/prefill for the new launch dialog input, not the source of truth for a given run.

Add a target URL input to the scenario launch dialog, prefilled with the engine default from the store. Wire the override through the store action that POSTs to `/api/simulations` or `/api/assessments`. Surface the effective target on execution history rows so operators can tell at a glance which environment a given run hit — this is the observability payoff of the whole feature.

Keep existing selectors and state shape working. The per-execution targetUrl is a new field on the execution type but shouldn't require reshuffling existing zustand state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Scenario launch dialog (scenario-detail-dialog.tsx) includes a target URL input, prefilled with the engine default from useCatalogStore
- [ ] #2 Operator can accept the prefilled default or type an override before confirming the launch
- [ ] #3 Store action for launching a simulation/assessment accepts an optional targetUrl and threads it into the POST body
- [ ] #4 Execution history rows (components/history or execution-timeline) display the target URL of each run
- [ ] #5 Empty or visibly invalid override is blocked client-side with inline validation before the POST
- [ ] #6 Component tests cover: default prefill, override entry, successful submission, history display, invalid input rejection
- [ ] #7 Web UI user guide walkthrough in docs/user-guides updated to show the new field and per-run target workflow
<!-- AC:END -->
