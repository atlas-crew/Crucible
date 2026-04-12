---
id: TASK-48
title: Validate Step Body Storage Reduction Under Retention Policies
status: Done
assignee: []
created_date: '2026-03-11 21:48'
updated_date: '2026-03-12 16:09'
labels: []
milestone: m-8
dependencies:
  - TASK-42
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow up on the step-body retention work already implemented in TASK-42. The engine already supports `CRUCIBLE_STEP_BODY_RETENTION=all|failed-only|none` plus `CRUCIBLE_STEP_BODY_MAX_BYTES` truncation, so the remaining gap is proving and documenting the storage reduction these controls provide under heavier execution volumes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Document that the current engine already supports `all`, `failed-only`, and `none` body-retention policies plus configurable byte truncation via `CRUCIBLE_STEP_BODY_MAX_BYTES`.
- [ ] #2 Add targeted verification or benchmark coverage that compares persisted step payload size or storage footprint across retention/truncation settings.
- [ ] #3 Capture operator-facing guidance or implementation notes describing the expected SQLite storage tradeoffs for heavy assessments and when to use stricter retention settings.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TASK-42 already implemented the runtime behavior this task originally described. Keep this task focused on validation: measure or assert how much persisted execution data shrinks under `failed-only`, `none`, and low `CRUCIBLE_STEP_BODY_MAX_BYTES` settings, then capture the operational guidance that falls out of those measurements.

Triage on 2026-03-12: narrowed from an implementation task to a validation task because TASK-42 already shipped the core retention/truncation behavior in `apps/demo-dashboard/src/server/engine.ts` and covered it with engine/repository tests.

Evidence reviewed during triage: `apps/demo-dashboard/src/server/engine.ts` (`StepBodyRetentionPolicy`, `buildPersistedStepResult`, `truncateUtf8`), `apps/demo-dashboard/src/__tests__/engine.test.ts` response-body retention tests, and `packages/catalog/src/db/__tests__/execution-repository.test.ts` result round-trip coverage.

TASK-42 completion notes already claim environment-controlled retention and size capping. The remaining backlog value is proving the storage-reduction impact rather than rebuilding the feature.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Validated storage reduction under all retention policies. Added getStorageStats to ExecutionRepository and created storage-retention.test.ts. Documented findings in docs/development/testing/storage-retention-validation.md.
<!-- SECTION:FINAL_SUMMARY:END -->
