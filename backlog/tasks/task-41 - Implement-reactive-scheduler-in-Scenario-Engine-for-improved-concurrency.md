---
id: TASK-41
title: Implement reactive scheduler in Scenario Engine for improved concurrency
status: Done
assignee: []
created_date: '2026-03-11 04:07'
updated_date: '2026-03-12 04:27'
labels: []
milestone: m-6
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The current wave-based scheduling is inefficient for complex scenarios with deep dependency graphs. Moving to a more efficient reactive scheduler or an event-driven task queue would improve performance and concurrency.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Implement a reactive scheduler in ScenarioEngine to handle step dependencies more efficiently than wave-based execution.
- [x] #2 Support higher concurrency and faster execution for complex scenario graphs.
- [x] #3 Add unit tests to verify scheduler correctness and dependency resolution.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Replaced the wave-based execution loop in ScenarioEngine with a reactive ready-queue scheduler that tracks unresolved dependencies, active work, and the current batch gate in real time. Ready steps are launched in declaration order, newly unblocked compatible work can join an active batch immediately, and the scheduler preserves existing legacy/parallel/sequential execution-group semantics while still honoring pause and cancel state transitions. Added regression coverage for reactive legacy wakeups, reactive parallel-group wakeups, and sequential-group re-anchoring so dependency resolution and ordering stay stable as the ready queue changes.

Verification: `pnpm --filter @crucible/demo-dashboard test -- src/__tests__/engine.test.ts` passed with 80 tests.

Verification: `pnpm --filter @crucible/demo-dashboard type-check` passed.

Review artifact: `.agents/reviews/review-20260312-001745.md` surfaced a sequential-group compatibility bug and missing credential-URL test; both were fixed before completion.

Review artifact: `.agents/reviews/review-20260312-002154.md` confirmed the scheduler direction and left the known DNS rebinding limitation already tracked in TASK-59 plus a non-blocking maintainability note on `executeScenario` size.

Final review attempt `.agents/reviews/review-20260312-002644.md` and test-audit attempt `.agents/reviews/test-audit-20260312-002655.md` were blocked by helper rate limits, so completion is based on local verification plus the earlier actionable review pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the ScenarioEngine wave scheduler with a reactive ready-queue scheduler that preserves existing execution-group ordering rules while unlocking newly unblocked work as soon as it becomes compatible with the active batch. Added targeted scheduler regressions covering reactive legacy wakeups, reactive parallel-group wakeups, sequential-group re-anchoring, and credential-bearing URL rejection, and verified the change with the demo-dashboard engine tests and type-check.
<!-- SECTION:FINAL_SUMMARY:END -->
