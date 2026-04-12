---
id: TASK-2
title: 'P0: Test missing engine assertion types'
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
  - apps/demo-dashboard/src/__tests__/engine.test.ts
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add tests for the 4 untested assertion types in ScenarioEngine.evaluateAssertions().

Currently only `expect.status` and `expect.blocked` are tested. The remaining 4 assertion types have zero coverage — if broken, security checks pass silently.

## Missing Tests
1. `expect.bodyContains` — substring search in response body
2. `expect.bodyNotContains` — inverse substring search
3. `expect.headerPresent` — case-insensitive header existence
4. `expect.headerEquals` — case-insensitive header value match

## Standard Violated
- testing-standards.md §3 (Failure Mode Tests Required)
- testing-standards.md §2 (Boundary Tests Required) — case sensitivity on headers

## Suggested Approach
Follow pattern in engine.test.ts:114-171 (status/blocked assertions). Mock fetch with known response body and headers, verify assertion results.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 bodyContains passes when substring present, fails when absent
- [x] #2 bodyNotContains passes when substring absent, fails when present
- [x] #3 headerPresent passes when header exists (case-insensitive), fails when missing
- [x] #4 headerEquals passes on exact value match, fails on mismatch
- [x] #5 Multiple assertions on same step all evaluated
<!-- AC:END -->
