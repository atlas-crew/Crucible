---
id: TASK-63
title: Allow per-run target URL override for scenario executions
status: Done
assignee: []
created_date: '2026-04-12 19:23'
updated_date: '2026-04-28 16:49'
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
- [x] #1 Operators can specify a target URL when launching a simulation or assessment via REST, CLI, or web UI
- [x] #2 Each execution persists the exact target URL it ran against and surfaces it in reports and history views
- [x] #3 Restart replays against the originating execution's stored target, not the current engine default
- [x] #4 Outbound SSRF allowlist is scoped to the effective target of each execution, preserving protections from TASK-44 and TASK-59
- [x] #5 Omitting a target continues to use the engine default (CRUCIBLE_TARGET_URL / engine option); no breaking change to existing workflows
- [x] #6 New functionality documented in REST API reference, CLI user guide, and web UI walkthrough
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Per-run target URL override is fully wired across every Crucible surface. The same deployment can now run scenarios against multiple environments without restart or redeploy.

**Layers, in order of dependency:**
- **63.1 — Persistence** (already shipped, ref `a5ae385`): per-execution `target_url` column on `executions` with NOT NULL constraint.
- **63.2 — Engine** (already shipped): `startScenario(..., targetUrl?)` validates and resolves via `normalizeConfiguredTargetUrl`; per-execution `OutboundAllowlist` scoped to the effective target.
- **63.3 — REST + WebSocket** (this branch, `23de9f5`, `4afa903`): `POST /api/simulations` and `/api/assessments` accept `targetUrl` (Zod-validated, http/https only, no creds, no fragment); `POST /api/executions/:id/restart` reads the originating execution's stored target — *not* the current engine default. WebSocket `EXECUTION_STARTED` snapshot carries `targetUrl`. New `docs/reference/rest-api.md` documents the contract end-to-end.
- **63.4 — Client library** (`3685915`, `0601999`): `SimulationLaunchOptions.targetUrl` and `AssessmentStartOptions.targetUrl` were already typed; added forwarding tests, a compile-time `@ts-expect-error` check pinning the type signature, and `apps/client/README.md` (referenced by `package.json` `files`).
- **63.5 — CLI** (`5xxxxxx`-ish): `--target/-t <url>` on `simulate` and `assess`. Multi-scenario assess applies the same target to every scenario in one invocation. Basic URL validation in the CLI catches typos before the network round trip; the REST endpoint stays the authoritative validator.
- **63.6 — Web UI** (`7f15deb`, `a8ed341`): launch dialog (already built inline on `apps/web-client/src/app/scenarios/page.tsx`) prefills with the saved catalog target, validates client-side, and persists the chosen override. History rows now display the target each historical run hit. `docs/user-guides/running-scenarios.md` covers the full workflow.

**Restart inheritance is enforced four times by structure:** persistence (63.1) → engine reads it on restart (63.2/63.3 fix) → REST endpoint exposes no override on restart (63.3) → client lib's `executions.restart(id)` doesn't take a `targetUrl` arg (63.4) → web UI's restart action doesn't expose one. Single design decision, four places where a future change would have to be re-examined.

**The trust model stayed put.** Operators launching runs are trusted, so runtime targets are free-form `http`/`https` rather than constrained by a pre-declared allowlist. The per-execution SSRF guard prevents a compromised scenario from pivoting off its intended target once launched. Concurrent runs against different hosts cannot pivot off each other because each gets its own allowlist.

**No breaking changes.** Omitting a target on any layer (REST body, client method, CLI flag, web UI dialog) continues to use the engine default exactly as before.

**Test note.** Pre-existing `useCatalogStore.test.ts` failures (`localStorage.clear is not a function` in vitest's node env) reproduce on clean `main` and are unrelated to this task — vitest config needs a JSDOM-style global. Worth filing as a separate ticket.
<!-- SECTION:FINAL_SUMMARY:END -->
