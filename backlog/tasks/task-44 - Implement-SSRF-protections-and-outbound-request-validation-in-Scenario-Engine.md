---
id: TASK-44
title: Implement SSRF protections and outbound request validation in Scenario Engine
status: Done
assignee: []
created_date: '2026-03-11 04:07'
updated_date: '2026-03-12 03:45'
labels: []
milestone: m-6
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
If untrusted users can modify or create scenarios, the engine lacks robust SSRF protections. Implement request validation and restrictions to prevent malicious outbound traffic.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Implement strict validation for target URLs in the Scenario Engine.
- [x] #2 Add an allow-list mechanism to restrict outbound requests to approved IP ranges/domains.
- [x] #3 Ensure these protections cannot be bypassed by scenario-level template variable injections.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect current outbound request flow in ScenarioEngine and identify all user-controlled URL/template entry points.
2. Implement strict target/request validation plus allow-list enforcement that applies after template resolution and before fetch.
3. Add targeted tests for allowed requests, blocked disallowed destinations, and template-based bypass attempts.
4. Run focused verification plus review/audit tooling, then finalize backlog state.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification:
- `pnpm --filter @crucible/demo-dashboard test -- src/__tests__/engine.test.ts`
- `pnpm --filter @crucible/demo-dashboard type-check`

Review artifacts:
- `.agents/reviews/review-20260311-232916.md`
- `.agents/reviews/test-audit-20260311-232916.md`
- `.agents/reviews/review-20260311-233806.md`
- `.agents/reviews/test-audit-20260311-233806.md`
- `.agents/reviews/review-20260311-234149.md`
- `.agents/reviews/test-audit-20260311-234149.md`

Follow-up:
- Created `TASK-59` to track the documented DNS-rebinding limitation for hostname/wildcard allowlist entries and any future resolved-IP enforcement or operator warning behavior.

Implemented strict outbound request validation in ScenarioEngine: `CRUCIBLE_TARGET_URL` is now validated up front, final request URLs are validated after template resolution, and outbound traffic is limited to the configured target origin plus explicit allowlist entries.

Allowlist parsing now supports exact hosts, explicit host:port entries, wildcard domains, IPv4/IPv6 addresses, and CIDR ranges. Bare host/IP/CIDR entries are restricted to default ports; explicit host:port entries allow only the configured port.

Addressed review follow-up in the same loop by fixing legacy batch compatibility to use `getStepBatchMode(candidateStep) === 'legacy'`, preventing degraded scheduling if a step ever carries an unrecognized execution mode value.

Captured the remaining hostname/DNS rebinding limitation as follow-up TASK-59 instead of treating it as solved by hostname-only validation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Hardened ScenarioEngine outbound request handling by validating configured target URLs, enforcing a port-aware outbound allowlist after template resolution, and adding SSRF-focused coverage for blocked hosts, exact host:port entries, wildcard domains, IPv6, CIDR rules, non-default port blocking, HTTPS target origins, and template-based bypass attempts. Also fixed legacy batch compatibility in the execution-group scheduler after code review surfaced a mismatch.
<!-- SECTION:FINAL_SUMMARY:END -->
