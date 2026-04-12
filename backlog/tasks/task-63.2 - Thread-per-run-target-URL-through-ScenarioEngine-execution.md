---
id: TASK-63.2
title: Thread per-run target URL through ScenarioEngine execution
status: To Do
assignee: []
created_date: '2026-04-12 19:24'
updated_date: '2026-04-12 19:25'
labels:
  - feature
  - per-run-target
  - scenario-engine
  - backend
dependencies:
  - TASK-63.1
references:
  - apps/demo-dashboard/src/server/engine.ts
parent_task_id: TASK-63
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Teach `ScenarioEngine.startScenario()` to accept an optional target URL override, store it on the execution record at creation time, and use it for every step's URL resolution, template expansion, and outbound request validation. When no override is provided, the engine's constructor-configured default (`options.targetUrl ?? CRUCIBLE_TARGET_URL ?? http://localhost:8880`) continues to apply so existing callers are unaffected.

The SSRF outbound allowlist built in the constructor (`engine.ts:116-119`) is currently scoped to the single engine-level target. With per-run targets, extract the allowlist construction into a helper and compute it per-execution against that execution's effective target. This preserves the TASK-44/TASK-59 protections but scopes them to what the operator explicitly intended for each run — a compromised scenario still cannot pivot to an unintended host.

Validate override URLs up front using the existing `normalizeConfiguredTargetUrl` / `parseValidatedAbsoluteUrl` helpers so malformed inputs are rejected before any execution state is created.

Every `this.targetUrl` read inside `executeStep()` (engine.ts:596, 599, 605, 612, 613) and the `resolveTemplates` callsite must switch to reading from the execution's effective target instead.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 startScenario accepts an optional targetUrl parameter and stores the effective target (override or engine default) on the created execution
- [ ] #2 Every step URL, header template, and body template resolves against the execution's effective target, not the engine default
- [ ] #3 The outbound SSRF allowlist used during step execution is scoped to the execution's effective target, not the engine-level default
- [ ] #4 Invalid override URLs (unparseable, non-http/https, or disallowed per existing SSRF rules) are rejected before execution starts with a descriptive error
- [ ] #5 Engine unit tests cover: override wins over default; default fallback; allowlist scoping to override target; invalid override rejection
- [ ] #6 Architecture doc for the scenario engine in docs/architecture updated to describe the new target resolution order
<!-- AC:END -->
