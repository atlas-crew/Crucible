---
title: Database Schema Reference
layout: page
---

# Database Schema Reference

Crucible persists execution history to a SQLite database managed by the `@crucible/catalog` package. This reference documents the tables that back `ExecutionRepository` and the invariants each column must satisfy. The authoritative schema lives in `packages/catalog/src/db/schema.ts`; the runtime `ensureTables()` path in `packages/catalog/src/db/execution-repository.ts` keeps existing databases in sync with that schema.

## `executions`

One row per scenario run. Rows are keyed by a nanoid and are written by the scenario engine at execution creation time, then updated as the run progresses.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | TEXT | NO (PK) | nanoid, engine-assigned at run creation |
| `scenario_id` | TEXT | NO | FK-style reference to a catalog scenario id |
| `mode` | TEXT | NO | `simulation` or `assessment` |
| `status` | TEXT | NO | `pending`, `running`, `completed`, `failed`, `cancelled`, `paused`, `skipped` |
| `started_at` | INTEGER | YES | Unix ms epoch |
| `completed_at` | INTEGER | YES | Unix ms epoch |
| `duration` | INTEGER | YES | Milliseconds |
| `error` | TEXT | YES | Human-readable failure message |
| `trigger_data` | TEXT (JSON) | YES | Arbitrary operator-supplied payload |
| `metadata` | TEXT (JSON) | YES | Engine-supplied metadata blob |
| `context` | TEXT (JSON) | YES | Step template context captured at run time |
| `paused_state` | TEXT (JSON) | YES | Snapshot used to resume paused executions |
| `parent_execution_id` | TEXT | YES | Self-reference for restart/retry chains |
| `target_url` | TEXT | **NO** | Effective target URL the run executed against |
| `report` | TEXT (JSON) | YES | Final report summary (populated on terminal status) |

### `target_url` invariants

- **Required.** Every new execution must supply `target_url`. The TypeScript `ScenarioExecution` type in `packages/catalog/src/db/execution-repository.ts` enforces this as a required field; the SQLite column enforces it as `NOT NULL`.
- **Historical backfill.** Pre-existing rows that predate the `NOT NULL` constraint are backfilled with the sentinel value `'unknown'` during `ensureTables()`. Reports and history views will display `'unknown'` for such rows so they are distinguishable from real targets.
- **Source of truth at read time.** Reports, restart flows, and history rendering all read `target_url` from this column — not from the engine's current default — so historical runs always replay or render against the target they originally used.

### Indexes

| Index | Columns | Purpose |
|---|---|---|
| `idx_executions_scenario_started` | `scenario_id`, `started_at` | Scenario-filtered history pagination |
| `idx_executions_status_started` | `status`, `started_at` | Status-filtered history pagination |
| `idx_executions_target_url` | `target_url` | Per-target filtering in multi-environment workflows |

## `execution_steps`

One row per step result, keyed by autoincrement id with a `(execution_id, step_id)` logical key. Rows cascade-delete when the parent execution is removed.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | INTEGER | NO (PK, autoincrement) | |
| `execution_id` | TEXT | NO (FK → executions.id, ON DELETE CASCADE) | |
| `step_id` | TEXT | NO | Step identifier from the scenario definition |
| `status` | TEXT | NO | Same enum as `executions.status` |
| `started_at` | INTEGER | YES | Unix ms epoch |
| `completed_at` | INTEGER | YES | Unix ms epoch |
| `duration` | INTEGER | YES | Milliseconds |
| `error` | TEXT | YES | Human-readable failure message |
| `logs` | TEXT (JSON) | YES | Per-step log lines |
| `result` | TEXT (JSON) | YES | Legacy response payload column, preserved for read-side compatibility |
| `details` | TEXT (JSON) | YES | Structured `{ response, retention }` detail used for report rendering |
| `attempts` | INTEGER | NO (default 0) | Retry counter |
| `assertions` | TEXT (JSON) | YES | Array of `{ field, expected, actual, passed }` assertion records |

### Indexes

| Index | Columns | Purpose |
|---|---|---|
| `idx_steps_execution_id` | `execution_id` | Batch loading step rows for a set of executions |

## Migrations

Forward migrations live in `packages/catalog/drizzle/`:

- `0000_burly_grim_reaper.sql` — initial schema for both tables.
- `0001_uneven_red_shift.sql` — adds the `result` and `details` step columns; adds `target_url` to `executions` as nullable, backfills historical rows with `'unknown'`, rebuilds `executions` with `target_url NOT NULL`, and recreates all executions indexes.

The runtime `ensureTables()` path in `execution-repository.ts` performs the same upgrade in-process on startup using `PRAGMA table_info` to gate the table rebuild. Both paths produce schema-equivalent databases; deployments using drizzle-kit directly and deployments relying on runtime initialization converge on the same structure.
