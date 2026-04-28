---
id: TASK-66
title: Fix vitest node-env localStorage breakage in useCatalogStore tests
status: To Do
assignee: []
created_date: '2026-04-28 17:29'
labels:
  - bug
  - testing
  - web-client
dependencies: []
references:
  - apps/web-client/src/store/__tests__/useCatalogStore.test.ts
  - apps/web-client/vitest.config.ts
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`apps/web-client/src/store/__tests__/useCatalogStore.test.ts` fails 28 of 29 tests on clean `main` with `TypeError: localStorage.clear is not a function` at line 30. The test's `afterEach` cleanup expects a JSDOM-style global `localStorage`, but the vitest runner is using a plain node environment.

Discovered while finalizing TASK-63 — surfaced explicitly during the multi-perspective review. Not a regression caused by per-run target URL work; the failures reproduce on a clean checkout of `main` with no working-tree changes.

## What's broken

```
TypeError: localStorage.clear is not a function
 ❯ src/store/__tests__/useCatalogStore.test.ts:30:18
     28|   afterEach(() => {
     29|     useCatalogStore.getState().resetMetricsHistory();
     30|     localStorage.clear();
       |                  ^
     31|     vi.useRealTimers();
     32|   });
```

## Likely fix paths

- Configure vitest to use `jsdom` (or `happy-dom`) environment for the web-client tests — most likely the right fix since the store uses `localStorage` for persisted state.
- Or guard `localStorage.clear()` behind a `typeof localStorage !== 'undefined'` check (less satisfying — masks the env mismatch).
- Verify `apps/web-client/vitest.config.ts` sets `test.environment` correctly.

## Why this matters

A reviewer running the full suite on the branch sees a sea of red and will assume my TASK-63 work caused regression. The breakage existed before TASK-63 work but was minimized in that task's notes. Filing as a separate ticket so the fix can land independently.

## References

- Reproduces: `cd apps/web-client && pnpm exec vitest run --no-coverage src/store`
- TASK-63 final summary mentions this as a known unrelated issue.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The `useCatalogStore.test.ts` suite passes on clean `main` with `pnpm exec vitest run`
- [ ] #2 Root cause is fixed (e.g., vitest env set to jsdom) rather than masked with a typeof guard
- [ ] #3 No other web-client test suites regress as a result of the env change
<!-- AC:END -->
