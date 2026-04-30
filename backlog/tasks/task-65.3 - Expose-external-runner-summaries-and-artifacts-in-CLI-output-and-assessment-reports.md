---
id: TASK-65.3
title: >-
  Expose external runner summaries and artifacts in CLI output and assessment
  reports
status: Done
assignee: []
created_date: '2026-04-13 18:02'
updated_date: '2026-04-30 09:15'
labels:
  - feature
  - reporting
  - cli
  - k6
  - nuclei
milestone: m-10
dependencies:
  - TASK-65.1
  - TASK-65.2
  - TASK-65.4
references:
  - apps/demo-dashboard/src/cli/assess-command.ts
  - apps/demo-dashboard/src/server/reports.ts
  - apps/client/src/types.ts
parent_task_id: TASK-65
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend Crucible's reporting path so external-runner steps show up as first-class evidence in CLI assessments, persisted execution records, and generated reports. This is where the product value lands: operators should not have to leave Crucible or manually stitch together a separate load or scan report to understand the outcome of an assessment.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Assessment reports include runner-backed step summaries, pass or fail state, and artifact links alongside existing HTTP-step evidence
- [x] #2 CLI assess output surfaces runner failures and summaries clearly enough to use in CI or scripted workflows
- [x] #3 Persisted execution records retain enough runner metadata for history views and report regeneration
- [x] #4 Export and route semantics stay aligned so artifacts remain downloadable without introducing report-state races
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
k6-only implementation; nuclei surfaces piggyback on the same render paths once TASK-65.4 lands (renderRunnerStepBody and AssessStepDetail are both nuclei-aware via the shared RunnerSummary.findings field).

Three atomic commits:
1. `feat(backend): add artifact download endpoint for runner steps` — GET /api/reports/:executionId/artifacts/:stepId/:filename. Path-traversal defense via basename + realpath check (defeats `..` and symlink escapes). Pure resolveArtifactPath() helper extracted for testability since the codebase has no express integration tests; 6 new unit tests cover happy path, missing file 404, traversal 404, symlink 403, empty-segment 400, and content-type mapping for .json/.log/.txt + octet-stream fallback.
2. `feat(reports): render runner step metrics, artifacts, and exit code in HTML` — Replaced the empty assertion+response card for k6/nuclei steps with a structured runner section: metrics list (requests, iterations, p95, checks, thresholds), exit code, artifact download links, and an optional "Runner Output" pre block flagged "(truncated)" when summaryTruncated is set. JSON report path needed no change — sanitizeDetails preserves runner via spread. Two new test cases covering full runner render + truncation indicator.
3. `feat(cli): surface runner step detail in assess output` — Extended AssessScenarioResult.steps[] (always populated). JSON output gets full per-step runner data; table output adds a "Failed steps:" block listing failed-or-runner steps with error, exit code, metrics line (requests/p95/thresholds/checks), findings count, and artifact URLs. Two new test cases. Also fixed RunnerSummary mirror in apps/client to add summaryTruncated.

**Verification:** `pnpm --filter @crucible/demo-dashboard test` (165 pass), `pnpm --filter @atlascrew/crucible-cli test` (43 pass), `pnpm --filter @atlascrew/crucible-client test` (48 pass), `pnpm -r type-check` clean.

**Out of scope (deferred):**
- Nuclei findings rendering (TASK-65.4 will populate RunnerSummary.findings; renderRunnerStepBody and the CLI step block already branch on findings.total when present).
- Express integration tests for the artifact endpoint route — codebase doesn't have a supertest harness yet; pure-function unit tests cover the security-critical path resolution.
- Runner output sanitization — k6 stdout is captured as-is into RunnerSummary.summary. Operators must avoid logging secrets in their k6 scripts. Future task could add a sanitizer mirroring sanitizeBodyValue.
<!-- SECTION:FINAL_SUMMARY:END -->
