---
id: TASK-65.5
title: Add web-client launch and history support for external runner scenarios
status: Done
assignee: []
created_date: '2026-04-13 18:02'
updated_date: '2026-04-30 09:19'
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
- [x] #1 The web UI can launch runner-backed scenarios using the same target-selection model established for standard scenario runs
- [x] #2 Execution history and detail views surface runner summaries and artifact links without pretending runner steps are normal HTTP responses
- [x] #3 UI copy and affordances make the curated runner scope clear so operators understand they are invoking packaged k6 or nuclei actions rather than a general-purpose shell runner
- [x] #4 The UI does not duplicate target-handling work already tracked under TASK-63
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
k6-only implementation; nuclei findings already render via the same `RunnerSummaryView` component (it branches on `runner.findings`).

Two atomic commits:
1. `feat(web-client): render structured runner summary tab in execution timeline` — replaced the placeholder JSON dump (lines 422-429 of execution-timeline.tsx) with a dedicated `Runner` tab. New `RunnerSummaryView` component renders type+exitCode+threshold-breach badges, metric tiles (Requests, Iterations, HTTP p95, Checks, Thresholds with danger-tone when failures>0), findings block with severity badges (nuclei-ready), artifact download links via `<a download>` pointing at the new `/api/reports/.../artifacts/...` endpoint from TASK-65.3, and an optional Runner Output `<pre>` block flagged "Truncated" when summaryTruncated is set. Default tab priority puts runner first when present so operators see metrics rather than the bare error string. Also added summaryTruncated to web-client RunnerSummary mirror.
2. `test(web-client): cover runner step render in execution timeline` — three new test cases covering: full k6 step render with metrics + threshold badge + downloadable artifact links, summaryTruncated flag rendering, runner tab disabled on HTTP-only steps. Existing 3 tests still green; 6/6 timeline tests pass.

**Launch flow (AC #1):** Already worked before this task. command-palette.tsx routes all scenarios through `startSimulation(scenario.id)` without step-type filtering. The launch dialog (TASK-63.6) handles target overrides for k6 scenarios identically to HTTP scenarios. No change needed.

**UI copy (AC #3):** Inherited from existing scenario rendering — k6/nuclei scenarios already get `formatStepDefinition()` text like "K6 runner • baseline-smoke.js" so the curated scope is clear in step headers. The new Runner tab uses uppercase type badges (K6/NUCLEI) reinforcing that these are packaged actions, not arbitrary command runners.

**TASK-63 reuse (AC #4):** The launch dialog already plumbs `targetUrl` through to `startSimulation`/`startAssessment`. Runner steps consume that same target via the engine's `__ENV.TARGET_URL` injection (TASK-65.2). No parallel target model.

**Verification:** `pnpm exec vitest run --exclude "**/useCatalogStore.test.ts"` (84/84 pass), `tsc --noEmit` clean. Note: useCatalogStore.test.ts has 28 pre-existing failures from TASK-66 (vitest localStorage env breakage) — unrelated to this work.

**Out of scope (deferred):**
- Nuclei findings render polish (renders today via RunnerSummaryView.findings; cosmetic refinement when TASK-65.4 ships real findings).
- Command-palette filtering by scenario kind — current "all scenarios run identically" behavior is correct for the curated runner contract; if operators later want to filter, that's a separate UX task.
- Fix for TASK-66 useCatalogStore localStorage env — separate ticket.
<!-- SECTION:FINAL_SUMMARY:END -->
