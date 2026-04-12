---
id: TASK-37
title: Add assessment trend charts to dashboard
status: Done
assignee:
  - '@codex'
created_date: '2026-03-07 23:28'
updated_date: '2026-03-13 21:24'
labels:
  - ui
  - reporting
milestone: m-4
dependencies:
  - TASK-36
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Enhance the dashboard (/) with charts showing assessment score trends over time. Display per-scenario pass/fail rates and score progression. Use a lightweight charting library (e.g. recharts or chart.js). Requires persistence layer for historical data.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dashboard shows assessment score trend chart
- [x] #2 Per-scenario pass/fail rate visible
- [x] #3 Charts update when new assessments complete
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added an assessment trend slice to the dashboard by fetching persisted assessment history from `/api/executions?mode=assessment&limit=50`, blending it with live assessment executions from the store, and rendering a new `AssessmentTrendPanel` with score progression, summary stats, and per-scenario pass/fail rate cards. The dashboard page now dynamically loads `RemoteTerminal` to avoid the prior `self is not defined` prerender failure, and the history fetch path guards aborted requests before setting state. Added dashboard coverage for persisted-history rendering, live trend updates, API failure UI, active terminal visibility, and fetch abort cleanup in `apps/web-client/src/app/__tests__/page.test.tsx`. Verification: `pnpm --filter web-client test -- src/app/__tests__/page.test.tsx src/components/__tests__/execution-timeline.test.tsx`, `pnpm --filter web-client exec tsc --noEmit`, `pnpm --filter web-client build`. Independent review artifacts: `.agents/reviews/review-20260313-172330.md` and `.agents/reviews/test-audit-20260313-172330.md` (remaining findings were mostly hardening/test-depth suggestions rather than regressions in the shipped dashboard behavior).
<!-- SECTION:FINAL_SUMMARY:END -->
