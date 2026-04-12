---
id: TASK-10
title: 'P1: Test engine step execution edge cases'
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
Add tests for untested step execution behaviors in ScenarioEngine.

## Missing Tests
1. Step iterations (execution.iterations > 1) — multiple iterations per step, partial failure
2. Delay + jitter timing — verify delay applied, jitter within expected range
3. startScenario with unknown scenarioId — verify error thrown
4. destroy() cleanup — verify interval timer cleared
5. AbortSignal propagation on fetch error — verify immediate abort without retry

## Standard Violated
- testing-standards.md §2 (Boundary) — iterations, timing
- testing-standards.md §3 (Failure Mode) — unknown scenario, abort
- testing-standards.md §4 (State Transition) — destroy cleanup
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Step with iterations=3 calls fetch 3 times
- [ ] #2 Delay applied before step execution (mock timer)
- [ ] #3 startScenario with non-existent ID throws error
- [ ] #4 destroy() clears cleanup interval
- [ ] #5 AbortSignal on fetch propagates immediately without retry
<!-- AC:END -->
