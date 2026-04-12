---
id: TASK-36
title: Add execution history page to web client
status: Done
assignee:
  - codex
created_date: '2026-03-07 23:28'
updated_date: '2026-03-11 20:53'
labels:
  - ui
  - reporting
milestone: m-4
dependencies:
  - TASK-26
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a new `/history` page to the web client that displays historical executions from the persistence layer. Support filtering by scenario, status, mode, and date range. Show execution summary cards with scenario name, status, duration, score (for assessments), and timestamp. Link to detailed execution view.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 History page accessible at /history with nav link
- [x] #2 Displays paginated list of past executions
- [x] #3 Filtering by scenario, status, mode, and date range
- [x] #4 Each entry links to detailed execution view
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the current web-client routing, navigation, execution views, and `/api/executions` contract.
2. Add a `/history` page with filters for scenario, status, mode, and date range, backed by paginated API fetches.
3. Add a navigation entry and a detailed execution view route/link so each history item can be opened directly.
4. Add targeted UI/store tests or type-safe verification, run scoped checks, then close the backlog task with receipts.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Code review approved: `.agents/reviews/review-20260311-164703.md`.

Final test audit: `.agents/reviews/test-audit-20260311-165127.md` with remaining non-blocking gaps around empty/loading/formatting coverage.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a new `/history` experience to the web client with filterable, paginated execution browsing and linked detail views. The server now exposes `GET /api/executions/:id`, the header includes a History nav item with route-aware highlighting, and the web client renders both the list page and execution detail route. Added targeted Vitest coverage for list filtering, pagination, error handling, scenario fallback, thrown fetch failures, and async route param forwarding. Verification passed with `pnpm --filter web-client test -- src/app/history 'src/app/history/[executionId]/__tests__/page.test.tsx' src/components/history/__tests__/execution-history-detail.test.tsx`, `pnpm --filter web-client exec tsc --noEmit`, `pnpm --filter web-client build`, and `pnpm --filter @crucible/demo-dashboard type-check`. External review artifacts: code review approved in `.agents/reviews/review-20260311-164703.md`; latest test audit in `.agents/reviews/test-audit-20260311-165127.md` reported no P0 gaps and remaining P1/P2 follow-up around empty/loading/formatting edge states.
<!-- SECTION:FINAL_SUMMARY:END -->
