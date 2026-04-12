---
id: TASK-20
title: 'P2: Test runbook type schemas and collectTemplateVars'
status: Done
assignee: []
created_date: '2026-02-23 07:44'
updated_date: '2026-02-23 08:05'
labels:
  - p2
  - catalog
  - testing
dependencies:
  - TASK-1
references:
  - packages/catalog/src/models/runbook-types.ts
  - packages/catalog/src/validation/scenario-validator.ts
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add tests for runbook Zod schemas and the collectTemplateVars helper.

## Missing Tests — Runbook Schemas
1. RunbookCategoryEnum — accepts valid values, rejects invalid
2. RunbookDifficultyEnum — accepts valid values, rejects invalid
3. RunbookFrontmatterSchema — title required, defaults for category/difficulty, optional fields
4. RunbookStepSchema — required fields, optional phase/substeps
5. RunbookSchema — full structure validation

## Shallow Tests — Validator
6. `collectTemplateVars()` — test directly (currently only tested through validateScenario)
7. `validateScenario()` body template detection — headers tested but body not explicitly
8. `when.succeeded=true` positive path — only negative path tested

## Standard Violated
- testing-standards.md §1 (Contract) — runbook schemas have no runtime tests
- testing-standards.md §2 (Boundary) — both sides of boolean condition

## Suggested Approach
For schemas: parse valid/invalid data, verify accept/reject behavior. For collectTemplateVars: import directly and test with various template patterns.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 RunbookCategoryEnum accepts valid, rejects invalid
- [ ] #2 RunbookFrontmatterSchema applies defaults correctly
- [ ] #3 collectTemplateVars extracts vars from URL, headers, and body
- [ ] #4 validateScenario detects templates in body
- [ ] #5 when.succeeded=true positive path: step executes when condition met
<!-- AC:END -->
