---
id: TASK-39
title: Build CLI runner for headless assessment execution
status: Done
assignee:
  - '@myself'
created_date: '2026-03-07 23:28'
updated_date: '2026-03-15 22:04'
labels:
  - cli
  - ci
milestone: m-5
dependencies:
  - TASK-26
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create a CLI entry point (e.g. `crucible assess`) that runs scenario assessments headlessly without the web UI. Accept arguments: `--scenario <id>`, `--target <url>`, `--fail-below <score>`. Output results to stdout (JSON or table format). Exit code 0 for pass, 1 for fail. This enables CI pipeline integration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CLI runs assessments without web UI or WebSocket
- [x] #2 Supports --scenario, --target, and --fail-below flags
- [x] #3 Outputs structured results to stdout
- [x] #4 Exit code reflects pass/fail against threshold
- [x] #5 Can run multiple scenarios in sequence
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a shared runtime factory for the demo-dashboard and a new headless `crucible assess` CLI entry point with multi-scenario sequencing, timeout handling, threshold-based exit codes, and JSON/table stdout output. Also repaired `ExecutionRepository.ensureTables()` so fresh/in-memory databases include the newer `target_url` and step `details` columns required by the CLI path.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a headless `crucible assess` CLI entry point for the demo-dashboard app with shared runtime bootstrapping, repeated/comma-separated `--scenario` support, target overrides, threshold-based exit codes, timeout handling, and JSON/table stdout output. The CLI now defaults to an isolated in-memory SQLite database plus temp reports directory unless the usual `CRUCIBLE_*` env vars are explicitly provided, and the server bootstrap reuses the same runtime factory. Also repaired `ExecutionRepository.ensureTables()` so fresh and existing databases add the newer `target_url` and step `details` columns needed by modern execution records, plus added coverage for the CLI path and the persistence round-trips.

Verification:
- `pnpm --filter @crucible/demo-dashboard test -- src/__tests__/cli.test.ts`
- `pnpm --filter @crucible/demo-dashboard build`
- `pnpm --filter @crucible/catalog test -- src/db/__tests__/execution-repository.test.ts src/db/__tests__/db.test.ts`
- `pnpm --filter @crucible/catalog build`
- `node apps/demo-dashboard/dist/cli.js assess --scenario tech-fingerprinting --target http://127.0.0.1:4545 --fail-below 100 --format table` against a temporary local HTTP 200 server (exit 0).

Independent review artifacts:
- `.agents/reviews/final-review-3/review-20260315-180207.md` (`PASS WITH ISSUES`, no P0/P1 findings)
- `.agents/reviews/demo-audit/test-audit-20260315-175629.md`
- `.agents/reviews/catalog-audit/test-audit-20260315-175629.md`

Commit:
- `6867976` `feat(demo-dashboard): add headless assessment cli`
<!-- SECTION:FINAL_SUMMARY:END -->
