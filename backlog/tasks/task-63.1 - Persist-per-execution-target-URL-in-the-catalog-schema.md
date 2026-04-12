---
id: TASK-63.1
title: Persist per-execution target URL in the catalog schema
status: Done
assignee: []
created_date: '2026-04-12 19:24'
updated_date: '2026-04-12 22:52'
labels:
  - feature
  - per-run-target
  - catalog
  - database
dependencies: []
references:
  - packages/catalog/src/db/execution-repository.ts
  - packages/catalog/src/db/schema.ts
  - packages/catalog/drizzle/
  - apps/demo-dashboard/src/server/engine.ts
  - apps/demo-dashboard/src/server/reports.ts
parent_task_id: TASK-63
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend the `ScenarioExecution` data model and the SQLite schema (via drizzle) to record the exact target URL each execution ran against. Today `ScenarioExecution` has no `targetUrl` field and the reports code (`apps/demo-dashboard/src/server/reports.ts:172`) already optimistically reads `execution.targetUrl` — so it's a latent expectation that needs to become real data. Reports, history, and restart semantics all depend on having an authoritative per-run target in the store.

Make the column NOT NULL and backfill existing rows in the migration with a clear sentinel (recommendation: `'unknown'`) so historical executions are distinguishable from new ones. Making it NOT NULL simplifies every downstream read by eliminating a null branch.

This task is the prerequisite for every other subtask under TASK-63: the engine can't write a per-run target before the column exists, and the REST API can't round-trip it through the repository without the type update.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 executions table in packages/catalog/src/db/schema.ts has a NOT NULL target_url column
- [x] #2 Drizzle migration is generated, checked in, and verified against both a clean DB and an existing DB with backfill applied
- [x] #3 ExecutionRepository save/load round-trips the new field without lossy serialization
- [x] #4 Repository unit tests cover: new execution with override target, new execution with default target, backfilled historical rows still read correctly
- [x] #5 Schema/type reference documentation in docs/reference updated to describe the new field
- [x] #6 ScenarioExecution type in packages/catalog/src/db/execution-repository.ts exposes a required targetUrl: string field
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Approved plan for TASK-63.1

### Context (discovered during planning)

The target_url column, ScenarioExecution.targetUrl field, and engine write-site all already exist — as **optional**. This task is **tightening** to required/NOT NULL, not adding.

- `packages/catalog/src/db/schema.ts:27` — declares `targetUrl: text('target_url')` with no `.notNull()`.
- `packages/catalog/src/db/execution-repository.ts:76` — interface has `targetUrl?: string`.
- `packages/catalog/src/db/execution-repository.ts:160` — runtime `ALTER TABLE executions ADD COLUMN target_url TEXT` patches pre-existing DBs.
- `apps/demo-dashboard/src/server/engine.ts:180` — already populates `targetUrl: this.targetUrl` at execution creation.
- `packages/catalog/drizzle/0000_burly_grim_reaper.sql` — **does NOT contain target_url at all**. The column exists in runtime DBs only via the retroactive ALTER. Drizzle migration history is out of sync with `schema.ts`.

### Implementation steps

1. **Tighten type + schema**
   - `execution-repository.ts:61` — `ScenarioExecution.targetUrl: string` (drop the `?`).
   - `schema.ts:27` — `.notNull()`.
   - `insertExecution` (line 234) — use `exec.targetUrl` directly, no `?? null`.
   - `fromRows` (line 452) — `targetUrl: row.targetUrl ?? 'unknown'` as a defensive backfill for any lingering NULL; always present on the returned exec.

2. **Runtime migration in `ensureTables()`**
   - Update raw CREATE TABLE to `target_url TEXT NOT NULL` (fresh DBs).
   - Keep existing `ALTER TABLE … ADD COLUMN target_url TEXT` try/catch block (pre-existing DBs that never had the column).
   - After ALTER, `UPDATE executions SET target_url = 'unknown' WHERE target_url IS NULL` to backfill.
   - SQLite table rebuild gated by `PRAGMA table_info(executions)`: only rebuild if target_url.notnull === 0. Steps: CREATE executions_new with NOT NULL → INSERT SELECT → DROP executions → RENAME executions_new → recreate indexes. Pull into a private helper for testability.

3. **Drizzle migration file**
   - Run `pnpm --filter @crucible/catalog exec drizzle-kit generate`. Inspect generated SQL — drizzle-kit often emits `ALTER TABLE … ALTER COLUMN` which SQLite rejects; may need to hand-edit to match the runtime rebuild pattern. Commit the file alongside schema.ts.

4. **Tests**
   - `packages/catalog/src/db/__tests__/execution-repository.test.ts` — extend the existing round-trip test + add: (a) existing DB with NULL target_url gets backfilled to 'unknown' via ensureTables(); (b) DB-level NOT NULL is enforced post-migration (raw INSERT of NULL throws); (c) fresh DB has NOT NULL from CREATE TABLE.
   - `apps/demo-dashboard/src/__tests__/cli.test.ts:40` and `apps/demo-dashboard/src/__tests__/reports.test.ts:20` — add `targetUrl` to the mock ScenarioExecution fixtures now that the field is required.

5. **Docs**
   - Check `docs/reference/` for an existing schema doc. Add or create a short note on the `target_url` column: purpose, NOT NULL, historical backfill sentinel 'unknown'.

### Out of scope (delegated to sibling tasks)

- `apps/demo-dashboard/src/shared/types.ts` parallel DTO (optional, untouched — TASK-63.3).
- `apps/client/src/types.ts` parallel DTO (optional, untouched — TASK-63.4).
- `apps/web-client/src/store/useCatalogStore.ts` parallel DTO (optional, untouched — TASK-63.6).

### Decisions recorded

- **Backfill sentinel:** `'unknown'` (clearly distinguishes historical rows from new ones; trivially greppable in reports).
- **Parallel DTO strategy:** temporary type mismatch (catalog=required, shared/client/web=optional) accepted until 63.3/63.4/63.6 align them.
- **SQLite rebuild strategy:** gated via PRAGMA nullability check so it runs at most once per DB, idempotent across server restarts.

### Plan revision (post-implementation discovery)

During implementation, workspace typecheck revealed that the 'temporary type mismatch' between catalog (required) and shared/types.ts (optional) cannot coexist — the typechecker correctly rejects `engine.ts:185` calling `this.repo?.insertExecution(execution)` because `string | undefined` (shared type) cannot flow into `string` (catalog type). The engine's in-memory `Map<string, ScenarioExecution>` at `engine.ts:76` also uses the shared type, so localized fixes cascade.

**Revised scope:** tighten `apps/demo-dashboard/src/shared/types.ts:70` to `targetUrl: string` (required) as a one-line type-only change. The runtime behavior is unchanged — the engine already populates `targetUrl: this.targetUrl` at `engine.ts:180` unconditionally, so the wire-format JSON is identical. This is a forced mechanical cascade from making catalog canonical, not a feature-scope expansion.

**Still carved out (unchanged):**
- `apps/client/src/types.ts` — client library DTO, external consumer boundary, handled by TASK-63.4.
- `apps/web-client/src/store/useCatalogStore.ts` — web UI DTO, handled by TASK-63.6.

User approved this revision before shared/types.ts was touched.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation complete. Summary of what landed:

**Catalog package**
- `packages/catalog/src/db/schema.ts` — added `.notNull()` to `targetUrl`.
- `packages/catalog/src/db/execution-repository.ts` — `ScenarioExecution.targetUrl: string` (required), raw CREATE TABLE tightened to `target_url TEXT NOT NULL`, backfill UPDATE added after the existing ALTER try/catch, new private `tightenTargetUrlNotNull()` helper performs SQLite table rebuild gated on `PRAGMA table_info` nullability check, `insertExecution` passes `exec.targetUrl` directly, `fromRows` always populates `targetUrl` with `'unknown'` defensive fallback.
- `packages/catalog/drizzle/0001_uneven_red_shift.sql` — hand-edited after `drizzle-kit generate` to replace naive `ADD COLUMN … NOT NULL` (which SQLite rejects on non-empty tables) with the full backfill + rebuild pattern. Works on clean 0000 databases; runtime `ensureTables()` handles databases that took the retroactive-ALTER path instead.

**Tests added**
- `packages/catalog/src/db/__tests__/execution-repository.test.ts`:
  - `makeExecution` helper now supplies a default `targetUrl`.
  - New: fresh DB has NOT NULL `target_url` from CREATE TABLE.
  - New: DB-level NOT NULL rejects raw NULL inserts post-migration.
  - New: pre-existing DB with NULL `target_url` rows is backfilled to `'unknown'` and tightened to NOT NULL via `ensureTables()`.
  - New: `ensureTables()` is idempotent on an already-migrated DB (no redundant rebuild).
- `packages/catalog/src/db/__tests__/db.test.ts` — both `insertExecutionSchema.safeParse(...)` test payloads now supply `targetUrl`, since drizzle-zod picks up the `.notNull()` and requires it.

**Cross-package cascade (plan revision)**
- `apps/demo-dashboard/src/shared/types.ts:70` — tightened `targetUrl?: string` → `targetUrl: string`. Required because the engine's `insertExecution` callsite and in-memory `Map<string, ScenarioExecution>` use the shared type, and TypeScript correctly rejects passing `string | undefined` into the catalog's required `string`. One-line change, no runtime impact (engine already populates unconditionally at `engine.ts:180`). Plan was revised and user-approved before this change.

**Docs**
- `docs/reference/database-schema.md` — new file documenting `executions` and `execution_steps` schemas with explicit `target_url` invariants (required, `'unknown'` historical backfill, source-of-truth at read time) and migration history.
- `docs/NAVIGATOR.md` — added Reference section pointing at the new schema doc.

**Verification**
- `pnpm --filter @crucible/catalog test` — 121/121 pass including 4 new migration/NOT-NULL tests.
- `pnpm type-check` — all 6 projects clean (catalog, demo-dashboard, crucible, crucible-client, crucible-cli, web-client) after `pnpm exec nx reset` and catalog rebuild to refresh the .d.ts files other packages import.
- One pre-existing flake in `web-client/src/app/history/__tests__/page.test.tsx` timed out under workspace-wide load (6153ms > 5000ms timeout) but passed cleanly in isolation. Not related — web-client imports `ScenarioExecution` from its own store (`useCatalogStore.ts`), which was intentionally not touched in this task.

**Not touched (carved out, delegated to siblings)**
- `apps/client/src/types.ts` → TASK-63.4
- `apps/web-client/src/store/useCatalogStore.ts` → TASK-63.6
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## TASK-63.1: Persist per-execution target URL in the catalog schema

Tightened `ScenarioExecution.targetUrl` and the underlying `target_url` column from optional to required. Both were already present across the catalog package, demo-dashboard engine, and schema — they just weren't constrained. Making them authoritative unblocks TASK-63.2 (engine per-run override) and TASK-63.3 (REST API round-trip) by ensuring the repository can never return an execution without a target.

### Changes

**`packages/catalog`**
- `src/db/schema.ts` — `targetUrl: text('target_url').notNull()`.
- `src/db/execution-repository.ts` — `ScenarioExecution.targetUrl: string` (required); raw `CREATE TABLE` tightened to `target_url TEXT NOT NULL`; new `tightenTargetUrlNotNull()` private helper performs a `PRAGMA table_info`-gated SQLite table rebuild so pre-existing DBs with nullable columns upgrade idempotently on the first `ensureTables()` call; `insertExecution` drops the `?? null` fallback; `fromRows` populates `targetUrl` with `'unknown'` defensive fallback.
- `drizzle/0001_uneven_red_shift.sql` — hand-edited after `drizzle-kit generate` to replace the naive `ADD COLUMN target_url text NOT NULL` (which SQLite rejects on non-empty tables) with a full backfill + rebuild sequence that mirrors the runtime migration path.

**`apps/demo-dashboard`**
- `src/shared/types.ts` — `targetUrl: string` (plan revision, user-approved). One-line type-only change; the engine already populates unconditionally at `engine.ts:180` so the wire-format JSON is unchanged.

### Tests

Added four new tests to `packages/catalog/src/db/__tests__/execution-repository.test.ts`:
1. Fresh DB has `target_url` NOT NULL from `CREATE TABLE`.
2. DB-level NOT NULL enforced post-migration (raw NULL insert throws).
3. Pre-existing DB with NULL rows is backfilled to `'unknown'` and tightened to NOT NULL via `ensureTables()`.
4. `ensureTables()` is idempotent on an already-migrated DB (no redundant rebuild).

Updated `db.test.ts` insert-schema tests to supply `targetUrl` (drizzle-zod now requires it). Updated the shared `makeExecution` test helper to supply a default `targetUrl` so every existing test stays green.

### Docs

- New: `docs/reference/database-schema.md` — authoritative reference for the `executions` and `execution_steps` tables, with explicit `target_url` invariants (required, `'unknown'` historical backfill sentinel, source-of-truth at read time) and migration history.
- Updated: `docs/NAVIGATOR.md` — added a Reference section pointing at the new schema doc.

### Verification

- `pnpm --filter @crucible/catalog test` — 121/121 pass (includes the 4 new migration/NOT-NULL tests).
- `pnpm type-check` — all 6 workspace projects clean after `pnpm exec nx reset` + catalog rebuild.

### Design decisions

- **Backfill sentinel `'unknown'`** distinguishes historical rows from real targets in reports and is trivially greppable.
- **Gated SQLite table rebuild** via `PRAGMA table_info` means the runtime migration path runs at most once per database and is safe to invoke on every `ensureTables()` call.
- **Two migration paths converge on the same schema:** drizzle-kit's `0001_uneven_red_shift.sql` for clean deployments using `drizzle-kit migrate`, and the runtime `ensureTables()` path for deployments that rely on startup initialization. Both produce schema-equivalent databases.

### Out of scope (delegated)

- `apps/client/src/types.ts` optional `targetUrl` stays → TASK-63.4.
- `apps/web-client/src/store/useCatalogStore.ts` optional `targetUrl` stays → TASK-63.6.
<!-- SECTION:FINAL_SUMMARY:END -->
