---
id: TASK-59
title: >-
  Document and harden DNS-rebinding limits for ScenarioEngine outbound
  allowlists
status: To Do
assignee: []
created_date: '2026-03-12 03:45'
labels:
  - security
  - engine
  - follow-up
milestone: m-6
dependencies:
  - TASK-44
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow up on TASK-44. ScenarioEngine now validates outbound requests against hostname/IP allowlists, but hostname-based entries are still evaluated before fetch performs DNS resolution. That means wildcard or hostname allowlist entries remain susceptible to DNS rebinding / subdomain takeover risk unless operators use IP/CIDR entries and network-layer controls. Capture the operator-facing documentation gap and evaluate whether runtime DNS resolution checks or warnings should be added.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Document that hostname and wildcard allowlist entries are checked before DNS resolution and recommend IP/CIDR plus network controls for sensitive deployments.
- [ ] #2 Decide whether ScenarioEngine should emit a startup/runtime warning for hostname-based allowlist entries or implement resolved-IP validation before outbound fetches.
- [ ] #3 Add tests or verification covering the chosen operator-facing behavior and any new resolution checks.
<!-- AC:END -->
