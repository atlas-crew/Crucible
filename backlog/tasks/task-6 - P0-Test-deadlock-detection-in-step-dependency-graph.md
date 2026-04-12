---
id: TASK-6
title: 'P0: Test deadlock detection in step dependency graph'
status: Done
assignee: []
created_date: '2026-02-23 07:42'
updated_date: '2026-02-23 08:01'
labels:
  - p0
  - engine
  - testing
dependencies:
  - TASK-1
references:
  - apps/demo-dashboard/src/server/engine.ts
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add test for deadlock detection in ScenarioEngine step execution. If circular dependencies exist that the validator misses (or scenario is constructed programmatically), the engine should detect the deadlock and fail rather than hang forever.

## Missing Test
- Create steps where no step can execute first (all depend on each other or on non-existent steps)
- Verify engine throws "Deadlock detected or invalid dependencies" error
- Verify execution status becomes "failed" with error message

## Standard Violated
- testing-standards.md §4 (State Transition Tests)

## Suggested Approach
Create 2+ steps where step-a depends on step-b and step-b depends on step-a. Start execution, verify it fails with deadlock error rather than hanging.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Circular dependency (A→B, B→A) triggers deadlock error
- [x] #2 Execution status set to failed with descriptive error
- [x] #3 Engine does not hang indefinitely
<!-- AC:END -->
