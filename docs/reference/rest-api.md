---
title: REST API Reference
layout: page
---

# REST API Reference

Crucible exposes an HTTP API for launching scenarios, querying execution history, restarting runs, and retrieving assessment reports. The implementation lives in `apps/demo-dashboard/src/server/backend.ts`. Real-time deltas stream over a WebSocket on the same host (see [WebSocket events](#websocket-events) below).

The default base path is `/api`. The default WebSocket path is `/`. Both are configurable via `attachCrucibleBackend()` options.

## Conventions

- All request bodies are JSON (`Content-Type: application/json`).
- All responses are JSON unless noted (HTML and PDF report exports are returned as files).
- Validation failures return `400` with `{ error, issues[] }`. The `issues` array uses Zod's `{ code, message, path }` shape so clients can surface field-level errors.
- Unknown top-level fields on launch endpoints are rejected — strict schemas catch typos early instead of silently dropping data.

## `GET /health`

Liveness probe and informational metadata. The `targetUrl` field reports the engine's **default** target — the value resolved from `CRUCIBLE_TARGET_URL` or the engine constructor at startup. Per-execution overrides are not reflected here. Web clients use this value to prefill launch dialogs.

**Response 200**

```json
{
  "status": "ok",
  "timestamp": 1714291200000,
  "scenarios": 87,
  "targetUrl": "http://localhost:8880"
}
```

## Per-run target URL

Three launch endpoints accept an optional `targetUrl` field that overrides the engine default for the duration of one execution:

- `POST /api/simulations`
- `POST /api/assessments`

Restart inherits — see [POST /api/executions/:id/restart](#post-apiexecutionsidrestart) for the semantics.

### Validation rules

A provided `targetUrl` must:

- Be an absolute URL with `http` or `https` scheme.
- Parse with the WHATWG URL parser.
- Have a non-empty hostname.
- **Not** include credentials (`user:pass@host`).
- **Not** include a fragment (`#section`).

The check runs at the request boundary and again inside `engine.startScenario()`, which throws `ScenarioTargetUrlError` on the second pass. Either layer rejecting the override returns `400` with the offending message; no execution row is persisted.

### Outbound allowlist scoping

Each execution gets its own outbound SSRF allowlist scoped to the effective target. Two concurrent runs against different hosts cannot pivot off each other — the allowlist for run A does not include run B's host. See `docs/architecture/scenario-engine.md` for the full target-resolution and allowlist model.

## `POST /api/simulations`

Launches a scenario in **simulation mode**. Returns immediately with the execution id; the run streams over the WebSocket.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `scenarioId` | string | yes | Catalog id of the scenario to run |
| `targetUrl` | string \| null | no | Per-run override (see above). Omit to use engine default. |
| `triggerData` | object | no | Forwarded verbatim to the scenario. Recognized keys: `expectWafBlocking` (boolean) |
| `expectWafBlocking` | boolean | no | Legacy top-level form. Cannot be combined with the same key inside `triggerData`. |

**Response 200**

```json
{
  "executionId": "f3D7w3g0aY",
  "mode": "simulation",
  "wsUrl": "ws://localhost:3001/"
}
```

**Response 400**

Invalid `scenarioId`, malformed `targetUrl`, conflicting `expectWafBlocking` placements, or unknown top-level fields.

## `POST /api/assessments`

Same shape as simulation launch but in **assessment mode**, which produces a final report.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `scenarioId` | string | yes | Catalog id of the scenario to run |
| `targetUrl` | string \| null | no | Per-run override |
| `triggerData` | object | no | Forwarded verbatim. `expectWafBlocking` is **not** supported here — assessments evaluate against the scenario's own assertions. |

**Response 200**

```json
{
  "executionId": "f3D7w3g0aY",
  "mode": "assessment",
  "reportUrl": "/api/reports/f3D7w3g0aY"
}
```

## `POST /api/executions/:id/restart`

Replays an existing execution. The new run is a fresh execution row with a `parentExecutionId` reference back to `:id`, so restart chains are traceable in history.

**Restart inherits the target.** The new run uses the originating execution's persisted `targetUrl`, *not* the current engine default and *not* a caller override. Restart deliberately does not expose a `targetUrl` parameter; if you want a different target, start a new run via `POST /api/simulations` or `/api/assessments`. This keeps restart idempotent — running the same execution id a week later still hits the same host even if the engine default has drifted.

If the source execution is currently `running`, `pending`, or `paused`, restart cancels it before starting the replay.

**Response 200**

```json
{ "executionId": "9KpNc1xC2u" }
```

**Response 404**

Source execution id does not exist.

## `GET /api/executions`

Lists executions with optional filtering.

**Query parameters**

| Param | Type | Notes |
|---|---|---|
| `scenarioId` | string | Filter by scenario id |
| `status` | comma-separated list | Any of `pending`, `running`, `completed`, `failed`, `cancelled`, `paused`, `skipped` |
| `mode` | string | `simulation` or `assessment` |
| `since` | unix-ms | Only executions started at or after this timestamp |
| `until` | unix-ms | Only executions started at or before this timestamp |
| `limit` | int | Max 200, default 50 |
| `offset` | int | Pagination offset |

**Response 200** — array of execution records.

## `GET /api/executions/:id`

Returns the in-memory execution record (or its restored snapshot for terminal/evicted runs).

## Execution control endpoints

All return `{ ok: true }` on success or `{ count: N }` for batch operations.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/executions/:id/pause` | Pause a running execution |
| `POST` | `/api/executions/:id/resume` | Resume a paused execution |
| `POST` | `/api/executions/:id/cancel` | Cancel a running or paused execution |
| `POST` | `/api/executions/pause-all` | Pause every running execution |
| `POST` | `/api/executions/resume-all` | Resume every paused execution |
| `POST` | `/api/executions/cancel-all` | Cancel every active execution |

State-machine violations (e.g. pausing a completed execution) return `409` with a descriptive error.

## Reports

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/reports/:id` | Returns the inline report JSON or the execution if not yet terminal |
| `GET` | `/api/reports/:id/json` | Downloads the canonical JSON report file |
| `GET` | `/api/reports/:id/html` | Downloads the HTML report |
| `GET` | `/api/reports/:id/pdf` | Downloads the PDF report |
| `GET` | `/api/reports/:id?format=json\|html` | Equivalent to the dedicated suffix endpoints |

If the report is still being generated, the endpoint responds with `202` and the current execution snapshot.

## Scenario catalog

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/scenarios` | List all catalog scenarios |
| `PUT` | `/api/scenarios/:id` | Update an existing catalog scenario; returns `400` on validation failure, `404` if the id is unknown |

## WebSocket events

The WebSocket broadcasts execution lifecycle events to every connected client. New connections receive a `STATUS_UPDATE` snapshot for each currently-known execution as a seed.

Event payloads carry a `targetUrl` field on the execution object — clients can render "running against X" for each row without an extra round trip. Subsequent `EXECUTION_DELTA` messages omit `targetUrl` because it doesn't change after creation; the snapshot already established it.

| Event type | Format | When |
|---|---|---|
| `STATUS_UPDATE` | snapshot | Connection seed; one per known execution |
| `EXECUTION_STARTED` | snapshot | New execution created (REST or WS-initiated) |
| `EXECUTION_UPDATED` | snapshot (first) / delta (subsequent) | State, step, or context change |
| `EXECUTION_DELTA` | delta | Incremental change after the first update |
| `EXECUTION_COMPLETED` | snapshot | Run reached `completed` |
| `EXECUTION_FAILED` | snapshot | Run reached `failed` |
| `EXECUTION_CANCELLED` | snapshot | Run reached `cancelled` |
| `EXECUTION_PAUSED` | snapshot | Run paused |
| `EXECUTION_RESUMED` | snapshot | Run resumed |
| `TERMINAL_OUTPUT` | n/a | Stdout/stderr from a terminal session |

Snapshot envelope:

```json
{
  "type": "EXECUTION_STARTED",
  "format": "snapshot",
  "timestamp": 1714291200000,
  "payload": {
    "id": "f3D7w3g0aY",
    "scenarioId": "advanced-sqli-campaign",
    "mode": "simulation",
    "status": "pending",
    "targetUrl": "http://staging.example:8080",
    "steps": [],
    "...": "remaining ScenarioExecution fields"
  }
}
```

Delta envelope:

```json
{
  "type": "EXECUTION_DELTA",
  "format": "delta",
  "timestamp": 1714291200500,
  "payload": {
    "id": "f3D7w3g0aY",
    "changes": {
      "status": "running",
      "steps": [{ "stepId": "step-0", "status": "running", "attempts": 1 }]
    }
  }
}
```

## Related

- [Scenario engine architecture](../architecture/scenario-engine.md) — target resolution, outbound allowlist, DAG scheduling
- [Database schema reference](./database-schema.md) — persistence model for executions
