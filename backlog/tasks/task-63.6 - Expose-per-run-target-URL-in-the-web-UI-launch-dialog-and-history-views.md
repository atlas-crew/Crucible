---
id: TASK-63.6
title: Expose per-run target URL in the web UI launch dialog and history views
status: Done
assignee: []
created_date: '2026-04-12 19:25'
updated_date: '2026-04-28 10:44'
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
- [x] #1 Scenario launch dialog (scenario-detail-dialog.tsx) includes a target URL input, prefilled with the engine default from useCatalogStore
- [x] #2 Operator can accept the prefilled default or type an override before confirming the launch
- [x] #3 Store action for launching a simulation/assessment accepts an optional targetUrl and threads it into the POST body
- [x] #4 Execution history rows (components/history or execution-timeline) display the target URL of each run
- [x] #5 Empty or visibly invalid override is blocked client-side with inline validation before the POST
- [x] #6 Component tests cover: default prefill, override entry, successful submission, history display, invalid input rejection
- [x] #7 Web UI user guide walkthrough in docs/user-guides updated to show the new field and per-run target workflow
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The launch flow had been substantially built out in earlier work — the dialog already lives inline on `apps/web-client/src/app/scenarios/page.tsx`, prefilled with the engine default from `useCatalogStore.targetUrl` (line 139), validates client-side via `validateLaunchTargetInput` before posting (line 158), threads the override through `startSimulation`/`startAssessment`, and persists a successful override back to the saved catalog target. Existing scenarios page tests cover prefill, override entry, successful submission, and invalid input rejection (29 tests, all passing).

The remaining gaps closed in this task:

- **History row target display (AC #4).** Added an inline `Target: <url>` line beneath the run id on `apps/web-client/src/app/history/page.tsx` cards, conditionally rendered so historical rows without a `targetUrl` still render cleanly. Added a test in `app/history/__tests__/page.test.tsx` that mixes one execution with a `targetUrl` and one without, asserts the URL is rendered, and pins that the `Target:` label only appears on the populated row.
- **User guide walkthrough (AC #7).** Updated `docs/user-guides/running-scenarios.md` with a "Launch Dialog" subsection covering the target URL field, expected WAF blocking toggle, validation behavior, and compatibility hints; plus a "Per-run target URL across multiple environments" section explaining persistence on history rows and restart inheritance.

Pre-existing `useCatalogStore.test.ts` failures (`localStorage.clear is not a function` in the vitest node env) reproduce on clean `main` and are unrelated to this task.
<!-- SECTION:NOTES:END -->
