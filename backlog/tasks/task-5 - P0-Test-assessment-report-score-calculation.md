---
id: TASK-5
title: 'P0: Test assessment report score calculation'
status: Done
assignee: []
created_date: '2026-02-23 07:42'
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
Add tests for assessment mode report generation in ScenarioEngine. Incorrect scoring means wrong pass/fail verdicts on security assessments — the core value proposition of the product.

## Missing Tests
1. Assessment with all steps passing → score=100, passed=true
2. Assessment with all steps failing → score=0, passed=false
3. Assessment at threshold boundary → score=80 (exactly) → passed=true
4. Assessment below threshold → score=79 → passed=false
5. Report structure contains summary, passed, score, artifacts

## Standard Violated
- testing-standards.md §1 (Contract Tests Required)
- testing-standards.md §2 (Boundary Tests — threshold at 80%)

## Suggested Approach
Create scenarios with known step counts and mock fetch to control pass/fail. Use mode="assessment" in startScenario. Wait for completion, verify execution.report fields.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All-pass scenario produces score=100, passed=true
- [x] #2 All-fail scenario produces score=0, passed=false
- [x] #3 Boundary: exactly 80% score produces passed=true
- [x] #4 Boundary: 79% score produces passed=false
- [ ] #5 Report contains summary, passed, score fields
<!-- AC:END -->
