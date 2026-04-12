---
id: TASK-63.3
title: Accept and broadcast per-run target URL on scenario launch endpoints
status: To Do
assignee: []
created_date: '2026-04-12 19:24'
updated_date: '2026-04-12 19:25'
labels:
  - feature
  - per-run-target
  - api
  - backend
  - websocket
dependencies:
  - TASK-63.1
  - TASK-63.2
references:
  - apps/demo-dashboard/src/server/backend.ts
  - apps/demo-dashboard/src/server/websocket.ts
parent_task_id: TASK-63
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Expose the per-run target override on the HTTP scenario launch endpoints and include the effective target on execution event payloads so real-time clients always know which target a run is hitting. The backend is otherwise thin — most of the work lives behind `engine.startScenario()`, which this task's sibling delivers.

Restart semantics: `POST /api/executions/:id/restart` must read the originating execution's stored `targetUrl` and replay against *that* target, not the engine default. This keeps restart idempotent — running the same execution ID a week later still hits the same host. Restart deliberately does not expose a new override parameter; if an operator wants a different target, they start a new run.

`/health` continues to report the engine-level default target as informational metadata — this is what new launch dialogs prefill as their placeholder.

WebSocket `execution.started` / `execution.updated` deltas need to carry `targetUrl` so the frontend and any other subscribers can display "Running against https://staging.foo.com" per row without a separate round trip.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 POST /api/simulations accepts an optional targetUrl in the request body, Zod-validated for http/https scheme, well-formed parse, and reasonable length cap
- [ ] #2 POST /api/assessments accepts an optional targetUrl with the same validation
- [ ] #3 POST /api/executions/:id/restart reads the originating execution's stored targetUrl and replays against it, without exposing a new override parameter
- [ ] #4 GET /health continues to report the engine default target in its informational payload
- [ ] #5 WebSocket execution.started and execution.updated events include targetUrl in their payload
- [ ] #6 Invalid target inputs return 400 with a descriptive error message
- [ ] #7 Integration tests cover: launch with override, launch without override (default), restart target inheritance, invalid input rejection, WS payload shape
- [ ] #8 REST API reference documentation in docs/reference/rest-api.md (or equivalent) updated with the new field and the restart semantics
<!-- AC:END -->
