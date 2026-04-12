---
id: TASK-63
title: Allow per-run target URL override for scenario executions
status: To Do
assignee: []
created_date: '2026-04-12 19:23'
labels:
  - feature
  - per-run-target
  - scenario-engine
dependencies: []
references:
  - apps/demo-dashboard/src/server/engine.ts
  - apps/demo-dashboard/src/server/backend.ts
  - packages/catalog/src/models/types.ts
  - packages/catalog/src/db/schema.ts
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today `ScenarioEngine.targetUrl` is fixed at engine construction time from `CRUCIBLE_TARGET_URL` / options. Every simulation, assessment, and restart uses that single target. Operators who want to run the same scenario against multiple environments (staging, prod, ephemeral test instances, CI hosts) must either stand up separate engine processes or restart with a new env var — neither is viable in a shared operations workflow.

This parent task coordinates a cross-subsystem change to let operators specify a target URL per execution, persist it with the run, and surface it across REST, WebSocket, the client library, the CLI, and the web UI. The engine's existing outbound SSRF allowlist (TASK-44, TASK-59) is preserved but rescoped to each execution's effective target so the safety net stays intact.

The trust model is: operators launching runs are trusted, so runtime targets are free-form (http/https with basic validation) rather than constrained by a pre-declared allowlist. The per-execution SSRF guard still prevents a compromised scenario from pivoting off its intended target once launched.

Break out into subtasks rather than a single PR because the change touches 6+ subsystems with natural review boundaries: data model, scenario engine, REST/WS surface, client library, CLI, web UI.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Operators can specify a target URL when launching a simulation or assessment via REST, CLI, or web UI
- [ ] #2 Each execution persists the exact target URL it ran against and surfaces it in reports and history views
- [ ] #3 Restart replays against the originating execution's stored target, not the current engine default
- [ ] #4 Outbound SSRF allowlist is scoped to the effective target of each execution, preserving protections from TASK-44 and TASK-59
- [ ] #5 Omitting a target continues to use the engine default (CRUCIBLE_TARGET_URL / engine option); no breaking change to existing workflows
- [ ] #6 New functionality documented in REST API reference, CLI user guide, and web UI walkthrough
<!-- AC:END -->
