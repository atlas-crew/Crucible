---
id: TASK-15
title: 'P1: Test useCatalogStore operations and error handling'
status: Done
assignee: []
created_date: '2026-02-23 07:43'
updated_date: '2026-02-23 08:09'
labels:
  - p1
  - web-client
  - testing
dependencies:
  - TASK-1
references:
  - apps/web-client/src/store/useCatalogStore.ts
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add tests for the primary Zustand store in the web-client. This store drives all data fetching, mutation, and error state for the entire UI.

## Missing Tests
1. `fetchScenarios()` — sets isLoading, clears error, parses response, handles failures
2. `updateScenario()` — sends PUT, updates array, handles validation errors
3. `startSimulation()` / `startAssessment()` — POST requests, error handling
4. `upsertExecution()` — insert new, update existing, sync activeExecution
5. `pauseExecution()` / `resumeExecution()` / `cancelExecution()` / `restartExecution()` — API calls + error handling
6. `pauseAll()` / `resumeAll()` / `cancelAll()` — bulk operations, return counts, graceful failure
7. Error state management — clearError, error set on failures

## Standard Violated
- testing-standards.md §1 (Contract) — zero tests for any store action
- testing-standards.md §3 (Failure Mode) — no error handling tests

## Suggested Approach
Zustand stores are testable without React rendering. Import the store, mock fetch globally, call actions directly, assert state changes. Use vi.fn() for fetch mock.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fetchScenarios: success sets scenarios, clears error
- [ ] #2 fetchScenarios: network failure sets error, clears isLoading
- [ ] #3 updateScenario: success updates scenarios array
- [ ] #4 updateScenario: validation failure throws with error message
- [ ] #5 startSimulation/startAssessment: returns executionId on success
- [ ] #6 upsertExecution: inserts new, updates existing, syncs activeExecution
- [ ] #7 Pause/resume/cancel/restart: call correct API endpoints
- [ ] #8 Bulk operations: return count, return 0 on failure
<!-- AC:END -->
