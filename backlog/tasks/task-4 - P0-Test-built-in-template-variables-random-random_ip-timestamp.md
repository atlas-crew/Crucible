---
id: TASK-4
title: 'P0: Test built-in template variables (random, random_ip, timestamp)'
status: Done
assignee: []
created_date: '2026-02-23 07:41'
updated_date: '2026-02-23 08:01'
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
Add tests for the 3 built-in template variables in ScenarioEngine.executeStep(). If resolution is broken, literal {{random}} strings are sent as request data — causing false positives/negatives in security tests.

## Missing Tests
1. `{{random}}` — should resolve to a random string/number (not literal)
2. `{{random_ip}}` — should resolve to a valid IP address format
3. `{{timestamp}}` — should resolve to a current timestamp
4. Unresolved custom templates left as-is (not built-in)

## Standard Violated
- testing-standards.md §2 (Boundary Tests Required)

## Suggested Approach
Create step with URL/headers/body containing {{random}}, {{random_ip}}, {{timestamp}}. After execution, verify fetch was called with resolved values (not literal template strings). Use regex matchers for format validation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 {{random}} resolves to a non-template value
- [x] #2 {{random_ip}} resolves to valid IP format
- [x] #3 {{timestamp}} resolves to numeric timestamp
- [x] #4 Unknown {{custom_var}} without context left as-is or handled predictably
<!-- AC:END -->
