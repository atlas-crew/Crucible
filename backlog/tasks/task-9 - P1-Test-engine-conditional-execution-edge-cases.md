---
id: TASK-9
title: 'P1: Test engine conditional execution edge cases'
status: Done
assignee: []
created_date: '2026-02-23 07:42'
updated_date: '2026-02-23 08:14'
labels:
  - p1
  - engine
  - testing
dependencies:
  - TASK-1
references:
  - apps/demo-dashboard/src/server/engine.ts
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add tests for untested conditional execution paths in ScenarioEngine.

## Missing Tests
1. `when.status` condition — evaluates assertion results against expected status code. Currently only `when.succeeded` is tested.
2. `evaluateWhen` with missing referenced step — returns false but never tested. Could silently skip critical steps.
3. `when.succeeded=true` positive path — only negative path (step fails → skip) is tested. Need to verify step runs when condition met.

## Standard Violated
- testing-standards.md §1 (Contract) — when.status is a documented behavior with no test
- testing-standards.md §2 (Boundary) — both sides of boolean condition should be tested
- testing-standards.md §3 (Failure Mode) — missing step reference is an error path
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 when.status evaluates against referenced step assertion results
- [ ] #2 Missing referenced step in when clause causes step to be skipped
- [ ] #3 when.succeeded=true on successful step causes dependent step to execute
<!-- AC:END -->
