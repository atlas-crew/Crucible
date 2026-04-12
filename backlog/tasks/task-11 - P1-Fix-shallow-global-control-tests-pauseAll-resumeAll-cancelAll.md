---
id: TASK-11
title: 'P1: Fix shallow global control tests (pauseAll/resumeAll/cancelAll)'
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
  - apps/demo-dashboard/src/__tests__/engine.test.ts
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Strengthen existing tests for global execution controls. Current tests verify return count but do not verify executions actually changed state.

## Current Problem
- `pauseAll` test: checks count >= 1, does not verify any execution status === "paused"
- `resumeAll` test: checks count === 2, does not verify executions resumed
- `cancelAll` test: checks count >= 1, does not verify executions cancelled

## Standard Violated
- testing-standards.md Self-Check §5 — assertions check count, not meaningful state change

## Suggested Fix
After each global call, getExecution() each targeted execution and assert the expected terminal status.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pauseAll: verify each targeted execution status === paused
- [ ] #2 resumeAll: verify each targeted execution status back to running
- [ ] #3 cancelAll: verify each targeted execution status === cancelled
<!-- AC:END -->
