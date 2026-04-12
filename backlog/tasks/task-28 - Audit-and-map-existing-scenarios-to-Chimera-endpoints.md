---
id: TASK-28
title: Audit and map existing scenarios to Chimera endpoints
status: Done
assignee:
  - codex
created_date: '2026-03-07 23:28'
updated_date: '2026-03-11 17:43'
labels:
  - chimera
  - scenarios
milestone: m-2
dependencies:
  - TASK-27
references:
  - packages/catalog/scenarios/
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Review the 120+ existing scenario JSON files and map their target endpoints against Chimera's 456+ vulnerable endpoints. Identify which scenarios can run against Chimera as-is, which need URL adjustments, and which have no matching Chimera endpoint. Produce a compatibility matrix document.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Compatibility matrix created in docs/development/reports/
- [x] #2 Each scenario categorized: compatible, needs-update, no-match
- [x] #3 Scenarios needing URL updates are identified with specific changes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Created docs/development/reports/chimera-scenario-compatibility-matrix.md by auditing 129 scenario JSON files against 527 current Chimera OpenAPI path entries. Specialist review script was attempted on the new report via git diff --no-index, but the generated review artifact remained empty/unusable, so no external review findings were available.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a Chimera compatibility matrix report under docs/development/reports/ that categorizes every scenario as compatible, needs-update, or no-match against the live Chimera OpenAPI surface. The report includes family-level grouping, per-scenario coverage counts, and concrete path rewrite notes where URL drift is obvious, giving TASK-29 a clean source document for future scenario retargeting.
<!-- SECTION:FINAL_SUMMARY:END -->
