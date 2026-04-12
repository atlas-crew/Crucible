---
id: TASK-49
title: Implement Frontend Metrics History Buffers & Throttled Updates
status: Done
assignee: []
created_date: '2026-03-11 21:48'
updated_date: '2026-03-12 05:20'
labels: []
milestone: m-9
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement frontend metrics history and throttled updates. Reference: 'control-panel-ui/src/store/orchestratorSlice.ts'.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Web client store maintains a fixed-size buffer of metrics for charts.
- [x] #2 Updates are throttled to a configurable interval (e.g., 500ms) to ensure UI responsiveness.
- [x] #3 Charts show smooth real-time data flow.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Extended the web-client Zustand store with a fixed-size `metricsHistory` buffer plus configurable `metricsThrottleMs`/`metricsHistoryLimit` settings and trailing telemetry sampling so execution updates still land immediately while chart points are emitted on a smoother cadence. Replaced the dashboard overview placeholder with a lightweight SVG telemetry chart that renders rolling active/resolved/failed series, current-value stat cards, and screen-reader chart text without adding a charting dependency. Added targeted store and dashboard tests for first-sample capture, buffer trimming, trailing throttled flushes, placeholder/chart rendering, scenario and execution summaries, single-point telemetry rendering, and rerendering when live data arrives.

Verification: `pnpm --filter web-client test -- src/store/__tests__/useCatalogStore.test.ts src/hooks/__tests__/useWebSocket.test.ts src/app/__tests__/page.test.tsx` passed with 32 tests.

Verification: `pnpm nx run web-client:type-check` passed.

Verification: `pnpm nx run web-client:build` passed.

Review artifact: `.agents/reviews/review-20260312-011052.md` initially blocked on module-scoped timer/state-race concerns; the telemetry sampler was refactored to scope timer state to the store instance and tighten the throttle path before re-verification.

Review artifact: `.agents/reviews/review-20260312-011617.md` passed with non-blocking issues only; remaining sampler/skipped-state refinement was captured as follow-up TASK-60.

Test-audit artifact: `.agents/reviews/test-audit-20260312-011617.md` highlighted broader dashboard coverage opportunities beyond TASK-49; core telemetry placeholder/chart, scenario summary, execution summary, single-point rendering, and rerender behavior are now covered in the page test suite.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented buffered, throttled live telemetry for the web-client dashboard by adding a rolling execution metrics history to the catalog store and rendering it through a lightweight SVG chart on the overview card. The change keeps execution state updates immediate, smooths chart updates on a configurable cadence, adds accessible live-metric summaries, and lands targeted store/page tests plus successful type-check and production build verification.
<!-- SECTION:FINAL_SUMMARY:END -->
