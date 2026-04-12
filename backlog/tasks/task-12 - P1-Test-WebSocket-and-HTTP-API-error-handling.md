---
id: TASK-12
title: 'P1: Test WebSocket and HTTP API error handling'
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
  - apps/demo-dashboard/src/server/websocket.ts
  - apps/demo-dashboard/src/server/index.ts
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add tests for error handling in the WebSocket server and Express HTTP API.

## Missing Tests — WebSocket
1. Invalid JSON message — verify no crash, connection stays open
2. Unknown command type — verify safely ignored with warning
3. Missing executionId in SCENARIO_PAUSE/RESUME/STOP — verify silently ignored
4. Missing scenarioId in SCENARIO_START — verify handled gracefully
5. Broadcast only sends to OPEN clients

## Missing Tests — HTTP API
6. POST /api/simulations without scenarioId → 400
7. POST /api/assessments without scenarioId → 400
8. POST /api/executions/:id/pause on completed execution → 409
9. POST /api/executions/:id/restart on non-existent → 404
10. PUT /api/scenarios/:id with invalid data → 400
11. GET /api/reports/:id on non-assessment → 404

## Standard Violated
- testing-standards.md §3 (Failure Mode Tests Required)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Invalid WebSocket JSON does not crash server
- [ ] #2 Missing scenarioId returns 400 on simulation/assessment endpoints
- [ ] #3 Operations on completed execution return 409 conflict
- [ ] #4 Operations on non-existent execution return 404
- [ ] #5 Invalid scenario update data returns 400
<!-- AC:END -->
