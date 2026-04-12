---
id: TASK-45
title: Refactor frontend store for paginated execution history loading
status: Done
assignee:
  - '@codex'
created_date: '2026-03-11 04:07'
updated_date: '2026-03-13 12:35'
labels: []
milestone: m-4 - reporting-&-history
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the number of executions grows, keeping everything in the active global store will become a bottleneck. Refactor for scalability.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Refactor useCatalogStore to support paginated fetching of past executions from the API.
- [x] #2 Implement on-demand loading for older execution history to keep the active store size manageable.
- [x] #3 Update the UI (Execution History page) to handle paginated results.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scoped history/store tests passed after the refactor: `pnpm --filter web-client test -- src/store/__tests__/useCatalogStore.test.ts src/app/history src/components/history/__tests__/execution-history-detail.test.tsx`.

Latest code review: `.agents/reviews/review-20260313-083404.md` (no P0s; remaining P1/P2 items were broader store/SSR concerns, not blockers for TASK-45 acceptance).

Latest test audit: `.agents/reviews/test-audit-20260313-083404.md` (no P0s; remaining gaps are non-blocking empty/loading/error rendering coverage).

Unrelated repo baseline issues remain outside this task: global web-client `tsc --noEmit` and `next build` are red in existing `execution-timeline`/`ui/command` paths.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Refactored `useCatalogStore` to add a dedicated paginated execution-history slice (`historyExecutions`, filter state, loading/error flags, offset tracking, and on-demand older-page loading) without inflating the live `executions` working set used by WebSocket-driven views. Updated `/history` to consume the store-backed history slice, switch to on-demand `Load Older` pagination, and reuse catalog scenarios from the store instead of local fetch state. Added store-level coverage for paginated history loading and stale-request suppression plus updated page coverage for the new append/reset behavior. Verification passed with `pnpm --filter web-client test -- src/store/__tests__/useCatalogStore.test.ts src/app/history src/components/history/__tests__/execution-history-detail.test.tsx`. External review artifact `.agents/reviews/review-20260313-083404.md` reported no P0s and only non-blocking broader-store follow-up; latest test audit `.agents/reviews/test-audit-20260313-083404.md` reported no P0s with remaining UI coverage gaps around empty/loading/error-card polish. Two broader repo checks remain red but are unrelated to TASK-45: `pnpm --filter web-client exec tsc --noEmit` fails in pre-existing unrelated files `apps/web-client/src/components/execution-timeline.tsx` (`TerminalIcon`) and `apps/web-client/src/components/ui/command.tsx` (`DialogProps`), and `pnpm --filter web-client build` fails while prerendering `/assessments` due a pre-existing `self is not defined` issue in the SSR path for `execution-timeline.tsx`.
<!-- SECTION:FINAL_SUMMARY:END -->
