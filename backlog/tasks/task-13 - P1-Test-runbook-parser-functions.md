---
id: TASK-13
title: 'P1: Test runbook parser functions'
status: Done
assignee: []
created_date: '2026-02-23 07:43'
updated_date: '2026-02-23 08:05'
labels:
  - p1
  - catalog
  - testing
dependencies:
  - TASK-1
references:
  - packages/catalog/src/adapters/runbook-parser.ts
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add unit tests for all exported functions in runbook-parser.ts. This module has ZERO test coverage — 6 pure functions that parse markdown into structured data.

## Missing Tests
1. `parseFrontmatter()` — YAML extraction between --- delimiters, defaults, type coercion
2. `extractTitle()` — finds first H1, returns undefined if none
3. `slugify()` — lowercase, special chars, hyphens, unicode
4. `parseSubsteps()` — checkbox extraction [x]/[ ], ordering, ID generation
5. `parseSteps()` — heading extraction, phase recognition, TOC skip, attribute stripping
6. `parseRunbook()` — full pipeline combining all above
7. `generateRunbookId()` — returns valid UUID

## Standard Violated
- testing-standards.md §1 (Contract Tests Required) — zero tests for any function
- testing-standards.md §2 (Boundary Tests) — no edge case coverage

## Suggested Approach
These are pure functions — no mocking needed. Input strings in, structured data out. Test with real markdown samples covering normal, edge, and malformed cases.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 parseFrontmatter extracts YAML, applies defaults, handles missing fields
- [ ] #2 extractTitle finds H1 heading, returns undefined when absent
- [ ] #3 slugify handles special chars, unicode, multiple hyphens, leading/trailing hyphens
- [ ] #4 parseSubsteps extracts checkboxes with correct checked state and order
- [ ] #5 parseSteps extracts headings as steps, recognizes phases, skips TOC
- [ ] #6 parseRunbook produces complete RunbookData from markdown
<!-- AC:END -->
