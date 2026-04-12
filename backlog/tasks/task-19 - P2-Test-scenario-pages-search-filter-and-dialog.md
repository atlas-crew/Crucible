---
id: TASK-19
title: 'P2: Test scenario pages search, filter, and dialog'
status: Done
assignee: []
created_date: '2026-02-23 07:43'
updated_date: '2026-02-23 08:14'
labels:
  - p2
  - web-client
  - testing
dependencies:
  - TASK-1
  - TASK-15
references:
  - apps/web-client/src/app/scenarios/page.tsx
  - apps/web-client/src/components/scenario-detail-dialog.tsx
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add integration-level tests for the scenarios page and detail dialog.

## Missing Tests
1. Scenarios page search filters by name, id, description, category, tags (case-insensitive)
2. Empty state shown when no results match
3. Skeleton loaders shown during isLoading
4. ScenarioDetailDialog opens on card click, shows overview/steps/edit tabs
5. Detail dialog displays scenario metadata correctly
6. Simulate/Assess buttons call correct store actions
7. getDifficultyVariant maps difficulty levels to correct badge variants

## Standard Violated
- testing-standards.md §1 (Contract Tests)

## Suggested Approach
Mock useCatalogStore with known scenarios. Render page, interact with search input, verify filtered results. For dialog, render with scenario prop and verify tab contents.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Search filters scenarios case-insensitively across multiple fields
- [ ] #2 Empty state renders when no matches
- [ ] #3 Detail dialog displays all metadata fields
- [ ] #4 Simulate/Assess buttons trigger correct store actions
- [ ] #5 Difficulty badge colors match mapping
<!-- AC:END -->
