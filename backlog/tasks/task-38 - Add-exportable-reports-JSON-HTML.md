---
id: TASK-38
title: 'Add exportable reports (JSON, HTML)'
status: Done
assignee:
  - '@codex'
created_date: '2026-03-07 23:28'
updated_date: '2026-03-13 16:12'
labels:
  - reporting
  - api
milestone: m-4
dependencies:
  - TASK-26
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add report export functionality for completed assessments. Support JSON export (machine-readable) and HTML export (human-readable with styled results). Expose via API endpoint (GET /api/reports/:id?format=json|html) and add download buttons in the web client assessment detail view.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 GET /api/reports/:id?format=json returns structured JSON report
- [x] #2 GET /api/reports/:id?format=html returns styled HTML report
- [x] #3 Web client shows download buttons for both formats
- [x] #4 Reports include scenario metadata, step results, assertions, and score
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the old PDF export path with structured JSON + styled HTML assessment reports, exposed the new download contract through `GET /api/reports/:id?format=json|html`, and updated assessment detail artifacts to point at the new endpoints. Report generation now sanitizes sensitive headers/body fields before writing artifacts, keeps unmatched scenario steps in the export payload, and returns `202` while files are still being generated instead of surfacing a transient 404 race. Added focused coverage for HTML/JSON generation, escaping, redaction, pending-step mapping, same-ID serialization, lock cleanup after failure, and assessment download links in the web client. Verification: `pnpm --filter @crucible/demo-dashboard test -- src/__tests__/reports.test.ts`, `pnpm --filter @crucible/demo-dashboard type-check`, `pnpm --filter web-client test -- src/components/__tests__/execution-timeline.test.tsx`, `pnpm --filter web-client exec tsc --noEmit`. Independent review artifacts: `.agents/reviews/review-20260313-120948.md` and `.agents/reviews/test-audit-20260313-120948.md` (remaining notes were hardening-oriented, not blockers for the shipped export contract).
<!-- SECTION:FINAL_SUMMARY:END -->
