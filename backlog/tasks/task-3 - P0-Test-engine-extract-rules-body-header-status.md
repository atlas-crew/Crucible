---
id: TASK-3
title: 'P0: Test engine extract rules (body, header, status)'
status: Done
assignee: []
created_date: '2026-02-23 07:41'
updated_date: '2026-02-23 08:00'
labels:
  - p0
  - engine
  - testing
dependencies:
  - TASK-1
references:
  - apps/demo-dashboard/src/server/engine.ts
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add tests for all 3 extract rule types in ScenarioEngine. Extract rules feed context variables into subsequent step templates — wrong extraction causes wrong requests and incorrect security verdicts.

## Missing Tests
1. `from="status"` — extracts HTTP status code as number into context
2. `from="header"` with path — extracts specific header value
3. `from="header"` without path — extracts all headers as object
4. `from="body"` with dot-path — extracts nested JSON field
5. `from="body"` without path — extracts entire body

## Standard Violated
- testing-standards.md §1 (Contract Tests Required) — public behavior with no test

## Suggested Approach
Mock fetch with known JSON body and headers. Run step with extract rules. Verify context Map contains correct extracted values. Test dot-path accessor (e.g., `data.token` extracts from `{data: {token: "abc"}}`).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 from=status extracts HTTP status code as number
- [x] #2 from=header extracts specific header by name
- [x] #3 from=header without path returns all headers
- [x] #4 from=body with dot-path extracts nested JSON value
- [x] #5 from=body without path returns entire body
- [ ] #6 Extracted values available as template variables in subsequent steps
<!-- AC:END -->
