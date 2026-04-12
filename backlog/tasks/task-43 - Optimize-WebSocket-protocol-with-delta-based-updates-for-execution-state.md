---
id: TASK-43
title: Optimize WebSocket protocol with delta-based updates for execution state
status: Done
assignee: []
created_date: '2026-03-11 04:07'
updated_date: '2026-03-12 11:56'
labels: []
milestone: m-6
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The WebSocket protocol currently sends full state payloads, which can cause performance bottlenecks as scenario complexity and execution volume increase. Move to delta-based updates.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Refactor the WebSocket protocol to send partial updates (deltas) instead of full state payloads during execution.
- [x] #2 Update useCatalogStore and useWebSocket hooks to handle these deltas efficiently.
- [x] #3 Verify reduced bandwidth and UI rendering overhead during high-volume scenario executions.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added an additive websocket delta protocol instead of replacing the existing snapshot flow wholesale. The demo-dashboard server now keeps full snapshots for lifecycle and recovery messages (`EXECUTION_STARTED`, terminal events, `STATUS_UPDATE`) while broadcasting `EXECUTION_DELTA` messages for the hot `execution:updated` path. New websocket connections are seeded from `engine.listExecutions()` so late-joining or reconnecting clients receive baseline snapshots before any deltas arrive. On the web-client side, `useCatalogStore` gained `applyExecutionDelta` merge logic for top-level execution changes plus step upserts, and `useWebSocket` now routes snapshot versus delta messages to the correct store path. Added targeted server and client tests for first-update snapshots, repeated deltas, connect-time reseeding, seeded-baseline delta behavior, delta merges, unknown-delta suppression, activeExecution synchronization, and lifecycle snapshot routing.

Verification: `pnpm --filter @crucible/demo-dashboard test -- src/__tests__/websocket.test.ts` passed with 13 tests.

Verification: `pnpm --filter @crucible/demo-dashboard type-check` passed.

Verification: `pnpm --filter web-client test -- src/store/__tests__/useCatalogStore.test.ts src/hooks/__tests__/useWebSocket.test.ts` passed with 33 tests.

Verification: `pnpm nx run web-client:type-check` passed.

Review tooling note: `.agents/reviews/review-20260312-074548.md` / `.agents/reviews/test-audit-20260312-074548.md` hit provider issues (`Claude` failed fast and local Gemini config was malformed), so the independent review/audit gate was completed with fresh-context Codex fallback artifacts.

Fallback review artifact: `.agents/reviews/review-20260312-074548-fallback.md` passed after the reconnect seeding fix with no remaining findings.

Fallback audit artifact: `.agents/reviews/test-audit-20260312-074548-fallback.md` still points to deeper baseline-reset/diff-shape edge coverage, which has been captured as follow-up TASK-61.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Optimized the execution websocket protocol by keeping full snapshots for lifecycle/recovery messages while sending `EXECUTION_DELTA` patches for hot in-flight updates. The web client now merges those deltas into its execution store safely, reconnecting clients are reseeded with current execution snapshots on connect, and the protocol is covered by targeted server and client tests plus passing type-checks on both apps.
<!-- SECTION:FINAL_SUMMARY:END -->
