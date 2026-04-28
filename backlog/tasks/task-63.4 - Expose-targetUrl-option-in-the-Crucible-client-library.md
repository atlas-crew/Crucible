---
id: TASK-63.4
title: Expose targetUrl option in the Crucible client library
status: Done
assignee: []
created_date: '2026-04-12 19:24'
updated_date: '2026-04-28 10:41'
labels:
  - feature
  - per-run-target
  - client-library
dependencies:
  - TASK-63.3
references:
  - apps/client/src/
  - apps/client/README.md
parent_task_id: TASK-63
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add the per-run target URL override to the typed Crucible client library so downstream consumers (CLI, custom integrations, user scripts) can pass it through without hand-crafting the request body. The client is the published consumer contract — once this lands, both internal consumers (CLI, web UI if it adopts the client) and external users can launch runs with a target override using strongly-typed method calls.

Client-side validation stays minimal — the REST endpoint is the source of truth for validation, and duplicating rules here is a drift hazard. Just ensure the field has the right TypeScript type on the input shape and is forwarded verbatim in the fetch body.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Client TypeScript types for simulation and assessment launch inputs include an optional targetUrl: string field
- [x] #2 When targetUrl is provided, it is forwarded in the JSON request body to the REST endpoint
- [x] #3 When targetUrl is omitted, the request body omits the field (not null, not empty string) so the server uses its default
- [x] #4 Client tests verify: field is present in the serialized body when provided, field is absent when omitted, type signature rejects non-string values at compile time
- [x] #5 Client README in apps/client/README.md documents the new option with a short example showing a multi-environment run
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The type and forwarding plumbing was already in place from earlier per-run target work — `SimulationLaunchOptions.targetUrl` and `AssessmentStartOptions.targetUrl` exist on the input shapes (types.ts), and both `SimulationsNamespace.start()` and `AssessmentsNamespace.start()` use `'targetUrl' in options` to omit the key entirely when the caller doesn't pass it (so the server falls back to the engine default). The remaining work was test coverage and packaging:

- Added a simulation `start()` test that verifies `targetUrl` lands in the body when supplied (mirrors the existing assessment coverage).
- Added a compile-time `@ts-expect-error` test pinning that non-string `targetUrl` values are rejected by the type signature.
- Tightened the existing assessment default-case test to assert the body is exactly `{ scenarioId }` — proving the field is actually omitted, not silently sent as `null` or `""`.
- Created `apps/client/README.md` (which `package.json` already lists in `files`) with a focused per-run target URL section showing a multi-environment usage pattern, plus the validation notes and the restart-inheritance behavior.

The `'targetUrl' in options` check is intentional — `SimulationLaunchOptions.targetUrl: string | null` allows callers to explicitly pass `null` to mean "use default" without changing the structure of the call site, but the omission path stays the canonical one for "no override."
<!-- SECTION:NOTES:END -->
