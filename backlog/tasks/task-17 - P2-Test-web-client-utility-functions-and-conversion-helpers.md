---
id: TASK-17
title: 'P2: Test web-client utility functions and conversion helpers'
status: Done
assignee: []
created_date: '2026-02-23 07:43'
updated_date: '2026-02-23 08:09'
labels:
  - p2
  - web-client
  - testing
dependencies:
  - TASK-1
references:
  - apps/web-client/src/lib/utils.ts
  - apps/web-client/src/components/scenario-editor/kv-editor.tsx
  - apps/web-client/src/components/scenario-editor/scenario-editor-tab.tsx
  - apps/web-client/src/components/execution-timeline.tsx
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add unit tests for pure utility functions scattered across the web-client. These are the easiest tests to write (no React rendering needed) and protect against regressions during refactors.

## Missing Tests
1. `cn()` — Tailwind class merging via clsx + tailwind-merge
2. `recordToKvPairs()` — Record<string,string> → KvPair[], handles undefined/null
3. `kvPairsToRecord()` — KvPair[] → Record<string,string>, filters empty keys, returns undefined for empty
4. `toNum()` — numeric parsing: empty string → undefined, NaN → undefined, zero → 0, valid strings → number
5. `formatDuration()` — 500 → "500ms", 2500 → "2.5s", undefined → "—"
6. `emptyRequestDraft()` / `emptyExecutionDraft()` / `emptyExpectDraft()` / `emptyExtractDraft()` — factory functions return correct defaults

## Standard Violated
- testing-standards.md §2 (Boundary Tests)

## Suggested Approach
Extract or import directly. Test with hardcoded inputs and expected outputs. No mocking needed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 cn() merges classes and resolves Tailwind conflicts
- [ ] #2 recordToKvPairs round-trips correctly, handles undefined
- [ ] #3 kvPairsToRecord filters empty keys, returns undefined for empty array
- [ ] #4 toNum handles empty string, NaN, zero, valid numbers
- [ ] #5 formatDuration formats ms/s correctly, returns dash for undefined
- [ ] #6 Factory functions return correct default shapes
<!-- AC:END -->
