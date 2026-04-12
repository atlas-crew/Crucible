---
id: TASK-7
title: 'P0: Test CatalogService validation and error handling'
status: Done
assignee: []
created_date: '2026-02-23 07:42'
updated_date: '2026-02-23 08:05'
labels:
  - p0
  - catalog
  - testing
dependencies:
  - TASK-1
references:
  - packages/catalog/src/service/catalog-service.ts
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add tests for CatalogService focusing on validation enforcement and error resilience. Without these tests, unvalidated data can be written to disk and malformed files can crash catalog loading.

## Missing Tests
1. `updateScenario()` validates data against ScenarioSchema before writing
2. `updateScenario()` throws error when validation fails (no disk write)
3. Constructor loads mix of valid/invalid JSON files — valid ones load, invalid skipped
4. Constructor handles missing scenarios directory gracefully
5. Constructor filters for .json files only (ignores .md, .txt, etc.)

## Standard Violated
- testing-standards.md §3 (Failure Mode Tests Required)
- testing-standards.md §1 (Contract Tests Required)

## Suggested Approach
Mock fs operations (readdir, readFile, writeFile). Test with controlled file system state. Verify validation errors propagate and invalid files are skipped with warnings.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 updateScenario rejects invalid data before writing
- [x] #2 updateScenario writes valid data and updates cache
- [x] #3 Constructor loads valid JSON, skips invalid with warning
- [x] #4 Constructor handles missing directory without crash
- [x] #5 Constructor ignores non-JSON files
<!-- AC:END -->
