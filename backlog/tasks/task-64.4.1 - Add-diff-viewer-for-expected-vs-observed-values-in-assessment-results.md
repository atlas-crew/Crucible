---
id: TASK-64.4.1
title: Add diff viewer for expected vs observed values in assessment results
status: To Do
assignee: []
created_date: '2026-04-24 04:20'
updated_date: '2026-04-24 05:49'
labels:
  - feature
  - reporting
  - web-client
  - archive-borrow
milestone: m-10
dependencies:
  - TASK-64.4
references:
  - >-
    ../.archive/edge-protection/apps/demo-dashboard/dashboard/src/components/LogViewer.tsx
  - apps/web-client/src/components/execution-timeline.tsx
  - apps/demo-dashboard/src/server/reports.ts
  - packages/catalog/src/models/types.ts
documentation:
  - docs/user-guides/running-scenarios.md
  - docs/architecture/scenario-engine.md
parent_task_id: TASK-64.4
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As part of the explainability work in TASK-64.4, add a small diff viewer that shows a unified diff between an assertion's expected value and the observed value. Surface it in the execution timeline for failed assertions and include the diff output in exported HTML reports. Borrow the pattern from the archived demo-dashboard's DiffView component. Goal: operators can immediately see why an assertion failed, not just that it did.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Failed assertion rows in the execution timeline can expand a diff view showing expected vs observed values with + and - line markers
- [ ] #2 Diff rendering is content-aware for JSON, headers, and plain text, with a string-diff fallback for unknown types
- [ ] #3 Exported HTML assessment reports include the diff output for failed assertions without regressing the existing JSON export
- [ ] #4 Component is covered by targeted tests for strings, objects, identical values, large payloads, and multiline content
- [ ] #5 No archive CSS or Redux wiring is imported; implementation uses current Radix and Tailwind primitives
<!-- AC:END -->
