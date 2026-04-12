---
id: TASK-14
title: 'P1: Test CatalogService query methods'
status: Done
assignee: []
created_date: '2026-02-23 07:43'
updated_date: '2026-02-23 08:05'
labels:
  - p1
  - catalog
  - testing
dependencies:
  - TASK-7
references:
  - packages/catalog/src/service/catalog-service.ts
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add tests for CatalogService read/query operations. These are the public API that the web UI and engine depend on.

## Missing Tests
1. `listScenarios()` — returns all loaded scenarios as array
2. `getScenario(id)` — returns scenario by ID or undefined if not found
3. `getScenariosByCategory(category)` — filters by category field
4. `getCategories()` — returns sorted unique category list
5. `size` property — returns count of loaded scenarios

## Standard Violated
- testing-standards.md §1 (Contract Tests Required)

## Suggested Approach
Build on TASK-7 (CatalogService validation tests) which should establish the mock fs infrastructure. Load known scenarios, then verify each query method returns expected results.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 listScenarios returns all loaded scenarios
- [ ] #2 getScenario returns scenario by ID, undefined for missing ID
- [ ] #3 getScenariosByCategory filters correctly
- [ ] #4 getCategories returns sorted unique list
- [ ] #5 size returns correct count
<!-- AC:END -->
