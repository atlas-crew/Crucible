---
id: TASK-65.1
title: Define scenario schema and execution result models for external runner steps
status: Done
assignee:
  - codex
created_date: '2026-04-13 18:02'
updated_date: '2026-04-16 19:23'
labels:
  - feature
  - scenario-engine
  - k6
  - nuclei
milestone: m-7
dependencies: []
references:
  - apps/client/src/types.ts
  - packages/catalog/src/models/types.ts
  - apps/demo-dashboard/src/server/engine.ts
parent_task_id: TASK-65
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Introduce the shared contract for external runner steps so Crucible can represent HTTP, k6, and nuclei steps explicitly instead of overloading the current request-only shape. This should define the discriminated step model, runner configuration fields, and the step-result/report fields needed for non-HTTP outputs such as exit codes, findings summaries, metrics summaries, and artifacts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Scenario and catalog types can represent http, k6, and nuclei step variants with clear required fields for each runner type
- [x] #2 Existing HTTP scenarios continue to load and execute without schema migration breakage
- [x] #3 Execution step results and persisted execution records can store runner summaries, exit state, and artifact references without abusing the current HTTP response-only fields
- [x] #4 The schema notes how runner target handling aligns with TASK-63 instead of introducing a separate target contract
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Update shared scenario schemas and exported types to distinguish HTTP, k6, and nuclei steps while keeping existing HTTP scenarios valid without migration.
2. Expand execution-step result models across catalog, demo-dashboard, client, and web store copies to include runner-specific summaries without overloading HTTP response fields.
3. Add lightweight type guards and narrow any compile-sensitive UI or validation call sites that currently assume every step has an HTTP request.
4. Add or update schema tests to cover new runner-step validation and backward compatibility, then run targeted test/build checks for the touched surfaces.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added discriminated scenario step contracts for http, k6, and nuclei across catalog and client-facing shared types, plus runner-summary fields on execution results and persisted execution records.\n\nHardened validator and UI call sites that previously assumed every step had an HTTP request so runner scenarios can load, render, and stay in JSON mode without type breakage.\n\nAdded schema coverage for legacy HTTP compatibility, k6/nuclei validation, and an engine regression test proving runner-backed scenarios are rejected before any execution state is created until TASK-65.2/TASK-65.4 land.\n\nVerification: pnpm --filter @crucible/catalog test -- src/models/__tests__/types.test.ts; pnpm --filter @crucible/catalog type-check; pnpm --filter @crucible/catalog build; pnpm --filter @atlascrew/crucible-client type-check; pnpm --filter @crucible/demo-dashboard type-check; pnpm --filter @crucible/demo-dashboard test -- src/__tests__/engine.test.ts; pnpm --filter web-client exec tsc --noEmit.\n\nArtifacts: .agents/reviews/review-20260416-151007.md, .agents/reviews/review-20260416-152132.md, .agents/reviews/test-audit-20260416-151614.md. The remaining P1 review findings are tied to the pre-existing target-override slice already dirty in engine.ts rather than the new runner-schema contract.
<!-- SECTION:FINAL_SUMMARY:END -->
