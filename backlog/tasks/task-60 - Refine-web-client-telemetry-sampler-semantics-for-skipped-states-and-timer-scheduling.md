---
id: TASK-60
title: >-
  Refine web-client telemetry sampler semantics for skipped states and timer
  scheduling
status: To Do
assignee: []
created_date: '2026-03-12 05:20'
labels:
  - frontend
  - telemetry
  - follow-up
milestone: m-9
dependencies:
  - TASK-49
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow up on TASK-49. The web-client telemetry sampler now buffers and throttles live execution metrics, but review left two non-blocking refinements: decide how `skipped` execution/step states should appear in dashboard telemetry lanes, and reduce the timer-scheduling coupling between the sampler and Zustand's synchronous `set()` callback behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Decide whether `skipped` executions and steps should have their own metric lane or be folded into an existing dashboard counter, then implement and document that choice.
- [ ] #2 Refactor the telemetry sampler so timer scheduling does not rely on closure state mutated inside a Zustand `set()` updater.
- [ ] #3 Add or update targeted tests covering the chosen skipped-state semantics and the refactored sampler behavior.
<!-- AC:END -->
