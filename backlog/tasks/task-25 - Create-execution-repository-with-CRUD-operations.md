---
id: TASK-25
title: Create execution repository with CRUD operations
status: Done
assignee: []
created_date: '2026-03-07 23:27'
updated_date: '2026-03-08 07:33'
labels:
  - persistence
  - database
milestone: m-1
dependencies:
  - TASK-24
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build a repository layer (e.g. `ExecutionRepository`) on top of the Drizzle schema that provides: insert execution, update execution status, insert step results, query executions by scenario/status/date range, and get execution with steps. This replaces direct Map access in the engine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Repository supports insert, update, and query for executions
- [x] #2 Step results are persisted with their parent execution
- [x] #3 Query by scenario ID, status, and date range works
- [x] #4 JSON blob columns (context, assertions, report) round-trip correctly
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan — TASK-25: Execution Repository with CRUD

### Approach

Build an `ExecutionRepository` class that wraps the Drizzle schema from TASK-24 and provides typed CRUD operations matching the existing `ScenarioExecution` / `ExecutionStepResult` interfaces. The engine currently uses `Map<string, ScenarioExecution>` — the repository will mirror that API surface so TASK-26 integration is straightforward.

### Key design decision: Schema push at init

Since we're using SQLite (embedded, single-process), the repository handles table creation automatically via Drizzle's `migrate()` or raw SQL from the generated migration. No separate migration step needed at runtime.

### Step 1 — Repository class (`src/db/execution-repository.ts`)

```
class ExecutionRepository {
  constructor(db: CrucibleDb)

  // Write
  insertExecution(exec: ScenarioExecution): void
  updateExecution(id: string, fields: Partial<ScenarioExecution>): void
  upsertStep(executionId: string, step: ExecutionStepResult): void

  // Read
  getExecution(id: string): ScenarioExecution | undefined
  listExecutions(filters?: ExecutionFilters): ScenarioExecution[]

  // Helpers
  toRow(exec: ScenarioExecution): InsertExecution
  fromRow(row: SelectExecution, steps: SelectStep[]): ScenarioExecution
}
```

### Step 2 — Mapping layer

The `ScenarioExecution` interface uses nested objects (steps array, report, pausedState) while the DB uses normalized tables + JSON columns. The repository handles:
- Serialization: `ScenarioExecution` → `executions` row + `execution_steps` rows
- Deserialization: rows → `ScenarioExecution` with hydrated `.steps` array
- JSON round-tripping for `triggerData`, `metadata`, `context`, `pausedState`, `report`

### Step 3 — Query filters

```ts
interface ExecutionFilters {
  scenarioId?: string;
  status?: ExecutionStatus | ExecutionStatus[];
  mode?: 'simulation' | 'assessment';
  since?: number;   // epoch ms
  until?: number;   // epoch ms
  limit?: number;
  offset?: number;
}
```

### Step 4 — Tests (`src/db/__tests__/execution-repository.test.ts`)

- Insert + retrieve execution with steps
- Update execution status and fields
- Upsert step results (insert new, update existing)
- Query by scenarioId, status, date range
- JSON blob round-trip (assertions, report, pausedState)
- Cascade delete (delete execution → steps removed)

### Files
- `packages/catalog/src/db/execution-repository.ts` — NEW
- `packages/catalog/src/db/index.ts` — add export
- `packages/catalog/src/index.ts` — add export
- `packages/catalog/src/db/__tests__/execution-repository.test.ts` — NEW
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## TASK-25 Complete: ExecutionRepository with CRUD

### What was done
- Created `ExecutionRepository` class with full CRUD: `insertExecution`, `updateExecution`, `upsertStep`, `getExecution`, `listExecutions`, `deleteExecution`
- `ensureTables()` for automatic schema creation at startup
- `upsertStep` handles both insert-new and update-existing via `(executionId, stepId)` key
- `listExecutions(filters)` supports scenarioId, status (single or array), mode, since/until date range, limit/offset pagination
- Batch step fetching in `listExecutions` to avoid N+1 queries
- Bidirectional mapping between `ScenarioExecution` interface and normalized DB rows
- All JSON blob columns (triggerData, metadata, context, pausedState, report, assertions, logs) round-trip correctly
- Re-exported all types from package index
- 21 new tests, 104 total — all pass

### Files added
- `packages/catalog/src/db/execution-repository.ts`
- `packages/catalog/src/db/__tests__/execution-repository.test.ts`

### Files modified
- `packages/catalog/src/db/index.ts` — added repository export
- `packages/catalog/src/index.ts` — added repository + type exports
<!-- SECTION:FINAL_SUMMARY:END -->
