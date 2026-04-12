---
id: TASK-26
title: Integrate persistence into ScenarioEngine
status: Done
assignee: []
created_date: '2026-03-07 23:27'
updated_date: '2026-03-08 07:37'
labels:
  - persistence
  - engine
milestone: m-1
dependencies:
  - TASK-25
references:
  - apps/demo-dashboard/src/server/engine.ts
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Modify `ScenarioEngine` in demo-dashboard to persist executions to SQLite via the execution repository. Keep the in-memory Map as a hot cache for active executions (needed for pause/resume/cancel control state). Persist on status transitions: started, step completed, paused, completed, failed, cancelled. Remove the cleanup timer — historical data stays in the DB. Add a `GET /api/executions` endpoint for querying historical executions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Executions survive server restart
- [x] #2 Active executions still support pause/resume/cancel
- [x] #3 Cleanup timer removed — no more 30-min TTL or 50-record cap
- [x] #4 GET /api/executions returns historical execution list with filtering
- [x] #5 Existing WebSocket event flow unchanged
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan — TASK-26: Integrate Persistence into ScenarioEngine

### Strategy: Hot cache + cold storage

The in-memory `Map<string, ScenarioExecution>` stays as a **hot cache** for active executions (needed for real-time pause/resume/cancel control with AbortController + pausePromise). The `ExecutionRepository` becomes the **cold storage** for all executions. Writes go to both; reads for active executions come from the Map, reads for historical executions come from the DB.

### Step 1 — Wire up DB in `index.ts`

- Import `createDb` and `ExecutionRepository` from `@crucible/catalog`
- Create DB at `./data/crucible.db` (configurable via `CRUCIBLE_DB_PATH` env var)
- Call `repo.ensureTables()` at startup
- Pass `repo` into `ScenarioEngine` constructor

### Step 2 — Modify `ScenarioEngine` constructor

- Accept `ExecutionRepository` as second constructor param
- Store as `this.repo`
- Remove cleanup timer and constants (CLEANUP_INTERVAL_MS, CLEANUP_TTL_MS, CLEANUP_MAX_EXECUTIONS) — DB is the durable store, no more eviction needed

### Step 3 — Persist on status transitions

Insert/update the DB at these points in the execution lifecycle:
- `startScenario()` → `repo.insertExecution()` after creating the execution object
- `executeScenario()` status='running' → `repo.updateExecution()`
- Step completed/failed → `repo.upsertStep()` + `repo.updateExecution()` (context snapshot)
- Execution paused → `repo.updateExecution()` (pausedState)
- Execution resumed → `repo.updateExecution()` (clear pausedState)
- Execution completed → `repo.updateExecution()` (report, completedAt, duration)
- Execution failed/cancelled → `repo.updateExecution()`

### Step 4 — Clean up hot cache on terminal states

When an execution reaches a terminal state (completed/failed/cancelled), remove it from the in-memory Map after a short delay (e.g. 5 seconds). Active WebSocket subscribers get the final event from the emit, then the Map entry is freed. Historical queries go through the DB.

### Step 5 — Add `GET /api/executions` endpoint

New endpoint in `index.ts` that queries the repository:
```
GET /api/executions?scenarioId=...&status=...&mode=...&since=...&until=...&limit=20&offset=0
```

### Step 6 — Add `getExecution` fallback

Modify `engine.getExecution()` to check the Map first, then fall back to `repo.getExecution()`. This ensures the reports endpoint and restart logic work for historical executions.

### Step 7 — Ensure data directory exists

Create `./data/` directory if it doesn't exist. Add `data/*.db*` to `.gitignore`.

### Files modified
- `apps/demo-dashboard/src/server/engine.ts` — repo integration, remove cleanup
- `apps/demo-dashboard/src/server/index.ts` — createDb, repo, new endpoint
- `.gitignore` — data directory
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## TASK-26 Complete: Persistence Integrated into ScenarioEngine

### What was done
- **Engine (`engine.ts`)**: Added `ExecutionRepository` as optional second constructor param. Persist on every state transition: insert at creation, update on running/paused/resumed/cancelled/completed, upsertStep on each step change. `getExecution()` falls back to DB when not in hot cache. `restartExecution()` works for historical (DB-only) executions.
- **Cache eviction**: Replaced 30-min TTL cleanup timer with 5-second `scheduleEviction()` — terminal executions stay in memory just long enough for WebSocket subscribers to receive the final event, then get evicted. All historical data lives in the DB.
- **Server (`index.ts`)**: Creates SQLite DB at `./data/crucible.db` (configurable via `CRUCIBLE_DB_PATH`), initializes `ExecutionRepository`, passes to engine. Added `GET /api/executions` endpoint with query filters (scenarioId, status, mode, since, until, limit, offset).
- **Gitignore**: Added `data/*.db`, `data/*.db-wal`, `data/*.db-shm`.
- **Tests**: Updated 3 engine tests (2 old cleanup tests → 1 eviction test, 1 destroy test simplified). All 171 tests pass (104 catalog + 67 demo-dashboard).

### Files modified
- `apps/demo-dashboard/src/server/engine.ts` — repo integration, cache eviction, removed cleanup timer
- `apps/demo-dashboard/src/server/index.ts` — DB setup, new endpoint, startup log
- `apps/demo-dashboard/src/__tests__/engine.test.ts` — updated cleanup → eviction tests
- `.gitignore` — SQLite data files
<!-- SECTION:FINAL_SUMMARY:END -->
