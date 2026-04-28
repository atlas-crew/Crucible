---
id: TASK-63.3
title: Accept and broadcast per-run target URL on scenario launch endpoints
status: Done
assignee: []
created_date: '2026-04-12 19:24'
updated_date: '2026-04-28 10:08'
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
- [x] #1 POST /api/simulations accepts an optional targetUrl in the request body, Zod-validated for http/https scheme, well-formed parse, and reasonable length cap
- [x] #2 POST /api/assessments accepts an optional targetUrl with the same validation
- [x] #3 POST /api/executions/:id/restart reads the originating execution's stored targetUrl and replays against it, without exposing a new override parameter
- [x] #4 GET /health continues to report the engine default target in its informational payload
- [x] #5 WebSocket execution.started and execution.updated events include targetUrl in their payload
- [x] #6 Invalid target inputs return 400 with a descriptive error message
- [x] #7 Integration tests cover: launch with override, launch without override (default), restart target inheritance, invalid input rejection, WS payload shape
- [x] #8 REST API reference documentation in docs/reference/rest-api.md (or equivalent) updated with the new field and the restart semantics
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Most of the request-side wiring (Zod validation, targetUrl forwarding to engine.startScenario, /health payload) was already in place from earlier per-run target work. Three gaps closed in this task:

1. **Restart inheritance (AC #3).** `engine.restartExecution` was passing `parentExecutionId` to `startScenario` but not the originating execution's `targetUrl`, so restart silently fell back to the engine default. Threaded `execution.targetUrl` through; restart is now idempotent against engine-default drift.
2. **WebSocket payload coverage (AC #5).** The broadcast layer already emits the full execution snapshot for `EXECUTION_STARTED` and the first `EXECUTION_UPDATED`, both of which include `targetUrl`. Added an explicit test pinning that contract so a future refactor of the delta path can't quietly drop the field.
3. **REST reference doc (AC #8).** Created `docs/reference/rest-api.md` covering launch endpoints, restart inheritance semantics, the per-run target override field with validation rules, `/health` payload, and the WebSocket event shape with `targetUrl` placement.

Tests added:
- `engine.test.ts` — restart inherits originating execution's target URL.
- `websocket.test.ts` — `EXECUTION_STARTED` snapshot preserves `targetUrl`.

Existing per-run target override tests in `engine.test.ts` (validation, allowlist scoping, fragment stripping, concurrent isolation) and parser tests in `backend.test.ts` (override accept/reject, scheme rejection) cover the rest of AC #7's matrix.
<!-- SECTION:NOTES:END -->
