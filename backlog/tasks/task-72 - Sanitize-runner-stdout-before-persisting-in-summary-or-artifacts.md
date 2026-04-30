---
id: TASK-72
title: Sanitize runner stdout before persisting in summary or artifacts
status: To Do
assignee: []
created_date: '2026-04-30 10:46'
labels:
  - security
  - k6
  - runner
dependencies:
  - TASK-65.2
references:
  - apps/demo-dashboard/src/server/runners/k6-runner.ts
  - apps/demo-dashboard/src/server/reports.ts
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
k6 stdout flows verbatim into `RunnerSummary.summary` (rendered in HTML and timeline) and into `<reportsDir>/<execId>/<stepId>/stdout.log` (served via the artifact endpoint). HTTP response bodies have `sanitizeBodyValue` to redact secrets; runner stdout has no equivalent.

**Threat model.** A curated k6 script that logs auth headers, target response bodies, or environment variables for debugging would have those values land in:
1. `RunnerSummary.summary` (visible in HTML report, timeline UI, and JSON export)
2. `stdout.log` artifact (downloadable via `/api/reports/.../artifacts/.../stdout.log`)

Today the only mitigation is operator discipline.

**Approach options.**
- (a) **Apply `sanitizeBodyValue`-style regex redaction to runner.summary** before storing on the result. Misses anything that's not a header pattern (Authorization, Bearer, etc.).
- (b) **Strip runner.summary from JSON/HTML report output** entirely, leaving only the artifact file accessible. Operators get raw stdout via artifact download; report consumers see only metrics. Simple, but loses the inline summary preview.
- (c) **Opt-in raw mode via `CRUCIBLE_K6_KEEP_RAW_STDOUT=true`**, with sanitization on by default. Defaults secure, debug path explicit.

Recommendation: (c). Combine with a list of known-sensitive patterns in `sanitizeBodyValue` and document the env var.

**Out of scope.** Sanitizing the artifact file itself — that's the operator's debugging surface. The mitigation should apply only to the in-memory `summary` field that flows into reports.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 RunnerSummary.summary is sanitized via the same redaction patterns used by sanitizeBodyValue before being persisted on ExecutionStepResult
- [ ] #2 CRUCIBLE_K6_KEEP_RAW_STDOUT=true bypasses sanitization (operator opt-in for debugging)
- [ ] #3 Artifact files (stdout.log, stderr.log) remain unsanitized — only the in-memory summary is redacted
- [ ] #4 HTML report and timeline UI render the sanitized summary; truncated indicator unchanged
- [ ] #5 Tests cover redaction of bearer tokens, basic auth headers, and known secret-shaped patterns
<!-- AC:END -->
