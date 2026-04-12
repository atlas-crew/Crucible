---
id: TASK-46
title: Implement Dependency & Parallel Group Logic in ScenarioEngine
status: Done
assignee: []
created_date: '2026-03-11 21:48'
updated_date: '2026-03-12 01:33'
labels: []
milestone: m-7
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port the logic from 'control-panel-api' to manage complex execution graphs. Reference: 'control-panel-api/src/services/workflow-engine.ts'.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ScenarioEngine supports 'parallelGroup' and 'executionMode' in scenario definitions.
- [x] #2 Steps with circular or missing dependencies are detected and fail gracefully.
- [x] #3 Parallel steps execute concurrently using the existing semaphore.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect current ScenarioEngine execution flow and schema support for dependency metadata.
2. Port dependency scheduling semantics from the reference workflow engine with cycle/missing-dependency validation.
3. Add or update tests for execution ordering, failure handling, and parallel semaphore behavior.
4. Run targeted verification, request Claude review/audit if tooling is available, then finalize task state.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Picked up implementation in Codex. Inspecting current ScenarioEngine graph execution, tests, and reference workflow engine before patching.

Implemented schema support for `executionMode` and `parallelGroup`, including a schema guard that rejects `parallelGroup` unless `executionMode` is `parallel`.

Added runtime dependency validation in `ScenarioEngine` for missing dependencies and cycles before execution begins, plus batch scheduling that preserves legacy waves while honoring sequential and grouped-parallel execution.

Expanded engine coverage for missing dependencies, sequential-mode gating, grouped parallel execution, distinct parallel-group serialization, no-group parallel batching, mixed-mode ordering, and pure legacy concurrency retention.

Verification run: `pnpm --filter @crucible/catalog test -- src/models/__tests__/types.test.ts`, `pnpm --filter @crucible/catalog build`, `pnpm --filter @crucible/demo-dashboard test -- src/__tests__/engine.test.ts`, `pnpm --filter @crucible/demo-dashboard type-check`.

Claude review artifacts: `.agents/reviews/review-20260311-212426.md`, `.agents/reviews/review-20260311-212702.md`, `.agents/reviews/review-20260311-213030.md`. Test audit artifacts: `.agents/reviews/test-audit-20260311-212711.md`, `.agents/reviews/test-audit-20260311-213030.md`. Remaining audit findings are broader ScenarioEngine coverage debt and not blockers for this task.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added typed `executionMode` / `parallelGroup` support to catalog scenarios, enforced sane schema combinations, and taught `ScenarioEngine` to validate dependency graphs before execution and schedule steps by legacy, sequential, or grouped-parallel batches. Expanded engine tests now cover graceful failure for missing/circular dependencies, sequential gating, grouped parallel execution, mixed-mode ordering, and legacy compatibility. Verified with targeted catalog/dashboard tests plus dashboard type-check after rebuilding catalog types.
<!-- SECTION:FINAL_SUMMARY:END -->
