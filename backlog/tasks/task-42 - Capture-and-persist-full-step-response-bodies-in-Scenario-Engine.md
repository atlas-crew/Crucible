---
id: TASK-42
title: Capture and persist full step response bodies in Scenario Engine
status: Done
assignee:
  - codex
created_date: '2026-03-11 04:07'
updated_date: '2026-03-11 18:50'
labels: []
milestone: m-4 - reporting-&-history
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The engine currently does not capture or persist the full HTTP response bodies of individual steps, making debugging difficult for users. Capture this data to improve troubleshooting.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Update ScenarioEngine and ExecutionRepository to capture and persist full HTTP response bodies for each step.
- [x] #2 Implement configurable data retention (e.g., only capture bodies for failed steps or up to a size limit).
- [x] #3 Expose this data via the HTTP API for frontend consumption.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Trace how `ScenarioEngine` builds `ExecutionStepResult` values and how those values are persisted through `ExecutionRepository`.
2. Extend shared execution types and persistence schema so step responses can include retained response body data plus retention metadata.
3. Add configurable retention logic in the engine so bodies can be captured selectively and size-limited before persistence.
4. Expose the persisted data through existing history/report APIs and cover the behavior with targeted tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented step-response persistence by storing `ExecutionStepResult.result` in the `execution_steps` table, with an idempotent `ALTER TABLE` path for existing SQLite databases.

ScenarioEngine now retains step response bodies with `CRUCIBLE_STEP_BODY_RETENTION=all|failed-only|none` and `CRUCIBLE_STEP_BODY_MAX_BYTES` size capping before persistence. Existing `/api/executions` responses now expose the retained step payloads automatically because the repository hydrates `steps.result`.

Verification: `pnpm --filter @crucible/catalog test -- execution-repository db`, `pnpm --filter @crucible/catalog type-check`, `pnpm --filter @crucible/demo-dashboard test -- engine`, and `pnpm --filter @crucible/demo-dashboard type-check` all passed.

Claude review/test-audit scripts were invoked, but both generated empty/unusable artifacts (`.agents/reviews/review-20260311-144851.md` and `.agents/reviews/test-audit-20260311-144851.md`), so there were no external findings to apply.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Persisted retained step response bodies on execution steps so history/report consumers can inspect live HTTP responses after execution. The change adds a JSON `result` column with an idempotent SQLite migration path, environment-controlled retention (`CRUCIBLE_STEP_BODY_RETENTION` and `CRUCIBLE_STEP_BODY_MAX_BYTES`), and targeted engine/repository tests covering default capture, failed-only capture, truncation, and schema idempotency.
<!-- SECTION:FINAL_SUMMARY:END -->
