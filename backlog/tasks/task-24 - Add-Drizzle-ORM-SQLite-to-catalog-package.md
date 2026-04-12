---
id: TASK-24
title: Add Drizzle ORM + SQLite to catalog package
status: Done
assignee: []
created_date: '2026-03-07 23:27'
updated_date: '2026-03-08 07:30'
labels:
  - persistence
  - database
milestone: m-1
dependencies: []
references:
  - packages/catalog/src/models/types.ts
  - apps/demo-dashboard/src/shared/types.ts
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add `drizzle-orm`, `better-sqlite3` (or `@libsql/client`), and `drizzle-kit` to `@crucible/catalog`. Define the database schema in `src/db/schema.ts` with tables for `executions`, `execution_steps`, and optionally `scenario_edits`. Set up the Drizzle client and migration infrastructure. Use `drizzle-zod` for insert/select schema generation to stay consistent with existing Zod types.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Drizzle schema defines executions and execution_steps tables
- [x] #2 drizzle-kit can generate and run migrations
- [x] #3 DB client can be instantiated with a file path or :memory:
- [x] #4 Zod insert/select schemas generated via drizzle-zod
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan — TASK-24: Add Drizzle ORM + SQLite to catalog package

### Approach

Since all three persistence tasks (24→25→26) form a tight dependency chain and share the same domain, I'll tackle them as a cohesive unit. TASK-24 lays the foundation.

### Decision: Where does the DB live?

The schema and repository go in `packages/catalog` (shared package), but the **DB file** gets created by the consumer (`demo-dashboard`) at startup. The catalog package exports a `createDb(path)` factory — callers decide the file location. This keeps the catalog package pure (no side effects on import) and lets tests use `:memory:`.

### Step 1 — Install dependencies

Add to `packages/catalog/package.json`:
- `drizzle-orm` — query builder + ORM
- `better-sqlite3` — synchronous SQLite driver (fast, no async overhead)
- `drizzle-zod` — generate Zod schemas from Drizzle tables
- `drizzle-kit` (devDep) — migration generator
- `@types/better-sqlite3` (devDep)

### Step 2 — Define schema (`src/db/schema.ts`)

**`executions` table:**
| Column | Type | Notes |
|---|---|---|
| id | text PK | nanoid from engine |
| scenarioId | text NOT NULL | FK-like, but scenarios are JSON-based |
| mode | text NOT NULL | 'simulation' \| 'assessment' |
| status | text NOT NULL | ExecutionStatus enum values |
| startedAt | integer | epoch ms |
| completedAt | integer | epoch ms |
| duration | integer | ms |
| error | text | nullable |
| triggerData | text | JSON blob |
| metadata | text | JSON blob |
| context | text | JSON blob |
| pausedState | text | JSON blob |
| parentExecutionId | text | nullable, self-ref |
| report | text | JSON blob (summary, passed, score, artifacts) |

**`execution_steps` table:**
| Column | Type | Notes |
|---|---|---|
| id | integer PK autoincrement | synthetic, steps don't have global IDs |
| executionId | text NOT NULL | FK → executions.id |
| stepId | text NOT NULL | scenario step ID |
| status | text NOT NULL | ExecutionStatus |
| startedAt | integer | epoch ms |
| completedAt | integer | epoch ms |
| duration | integer | ms |
| error | text | nullable |
| logs | text | JSON array |
| attempts | integer NOT NULL | default 0 |
| assertions | text | JSON array of AssertionResult |

### Step 3 — DB client factory (`src/db/client.ts`)

```ts
export function createDb(path: string = ':memory:') {
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}
export type CrucibleDb = ReturnType<typeof createDb>;
```

WAL mode is critical for concurrent reads during active executions.

### Step 4 — Drizzle config + migrations (`drizzle.config.ts`)

Add `drizzle-kit` config and a `db:generate` script. Initial migration generated from schema.

### Step 5 — Zod schemas via drizzle-zod

Generate `insertExecutionSchema` and `selectExecutionSchema` for type-safe inserts/queries that stay consistent with the Drizzle table definitions.

### Step 6 — Export from package index

Add new exports: `createDb`, `CrucibleDb`, schema tables, and generated Zod schemas.

### Step 7 — Tests

- Verify DB creates successfully with `:memory:`
- Verify WAL mode is set
- Verify tables exist after push
- Verify Zod insert schemas validate correctly

### Files touched
- `packages/catalog/package.json` — add dependencies
- `packages/catalog/src/db/schema.ts` — NEW: table definitions
- `packages/catalog/src/db/client.ts` — NEW: createDb factory
- `packages/catalog/src/db/index.ts` — NEW: barrel export
- `packages/catalog/src/index.ts` — add db exports
- `packages/catalog/drizzle.config.ts` — NEW: drizzle-kit config
- `packages/catalog/src/db/__tests__/db.test.ts` — NEW: tests
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## TASK-24 Complete: Drizzle ORM + SQLite added to `@crucible/catalog`

### What was done
- Installed `drizzle-orm`, `better-sqlite3`, `drizzle-zod` (deps) and `drizzle-kit`, `@types/better-sqlite3` (devDeps)
- Created `src/db/schema.ts` with `executions` (14 cols) and `execution_steps` (11 cols) tables, matching `ScenarioExecution` and `ExecutionStepResult` interfaces
- Created `src/db/client.ts` with `createDb(path)` factory — WAL mode + foreign keys enabled, defaults to `:memory:`
- Created `src/db/zod-schemas.ts` with `drizzle-zod` generated insert/select schemas
- Added `drizzle.config.ts` and `db:generate`/`db:push` scripts
- Generated initial migration (`drizzle/0000_foamy_blue_blade.sql`)
- Exported all DB symbols from package index
- Added 10 tests — all 83 tests pass

### Files added
- `packages/catalog/src/db/schema.ts`
- `packages/catalog/src/db/client.ts`
- `packages/catalog/src/db/zod-schemas.ts`
- `packages/catalog/src/db/index.ts`
- `packages/catalog/src/db/__tests__/db.test.ts`
- `packages/catalog/drizzle.config.ts`
- `packages/catalog/drizzle/0000_foamy_blue_blade.sql`
- `packages/catalog/drizzle/meta/`

### Files modified
- `packages/catalog/package.json` — dependencies + scripts
- `packages/catalog/src/index.ts` — DB exports
<!-- SECTION:FINAL_SUMMARY:END -->
