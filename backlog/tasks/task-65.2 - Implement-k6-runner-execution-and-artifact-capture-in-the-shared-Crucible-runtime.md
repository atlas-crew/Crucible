---
id: TASK-65.2
title: >-
  Implement k6 runner execution and artifact capture in the shared Crucible
  runtime
status: Done
assignee: []
created_date: '2026-04-13 18:02'
updated_date: '2026-04-30 08:34'
labels:
  - feature
  - scenario-engine
  - k6
  - load-testing
milestone: m-7
dependencies:
  - TASK-65.1
references:
  - apps/demo-dashboard/src/server/engine.ts
  - apps/demo-dashboard/src/server/runtime.ts
  - >-
    ../.archive/edge-protection/apps/load-testing/apps/control-panel-api/src/lib/k6-adapter.ts
parent_task_id: TASK-65
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add the first external runner implementation by teaching the shared runtime and ScenarioEngine how to execute curated k6 steps. Reuse the archive for ideas like native or docker execution modes, environment injection, metrics parsing, and artifact capture, but keep Crucible's scope focused on orchestrating and reporting curated runs rather than becoming a full k6 management surface.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 k6 steps execute through the shared runtime using approved script references rather than arbitrary command strings
- [x] #2 Runner execution supports target and environment injection, timeout handling, and deterministic exit-state mapping into Crucible step status
- [x] #3 k6 output is parsed into a concise summary with threshold or failure information plus captured artifacts suitable for later report download
- [x] #4 Security guardrails cover allowed script locations, output limits, and artifact retention behavior
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation slice (5 atomic commits)

1. **Skeleton runner module + native execution + rejection-block replacement.** New `apps/demo-dashboard/src/server/runners/k6-runner.ts` exporting `executeK6Step()` returning `RunnerSummary`. Native mode only, no parsing yet. Replace rejection block at `engine.ts:214-221` with per-step branch in dispatch loop. Path-traversal guard via `realpathSync` on resolved scriptRef. Update engine test from "rejects" to "executes" (mock `child_process.spawn`); add positive-path test.

2. **Summary parsing into `RunnerSummary.metrics` and threshold pass/fail.** Add `--summary-export=<artifactDir>/summary.json`, parse into `metrics.checksPassed/Failed`, `thresholdsPassed/Failed`, `httpReqDurationP95Ms`, `iterations`, `requests`. Capture stdout into `summary.summary` (truncated). Threshold-fail flips status to `failed` even if exitCode is 0.

3. **Artifact persistence to `reportsDir`.** Per-execution-step dir under `<reportsDir>/<executionId>/<stepId>/{summary.json, stdout.log, stderr.log}`. Populate `RunnerSummary.artifacts` with URL-shaped paths. Wire k6 config (script root, timeout, mode, retention) onto `CrucibleRuntime`/engine constructor.

4. **Timeouts + abort + output caps (full guardrails).** Wire engine `signal` into spawn; abort kills child, status `cancelled`. Wall-clock timeout via setTimeout → SIGTERM → 5s grace → SIGKILL. Bounded stdout/stderr buffering with `truncated: true` flag.

5. **Docker mode + binary probe.** `which k6` probe at engine boot; clear error if absent. Docker mode spawns `grafana/k6:0.50.0` with volume mounts + env forwarding via `-e`. Per-step `runner.mode` overrides engine default.

## Architectural decisions

- **Curated scripts location:** `packages/catalog/scripts/k6/` (catalog already houses curated content; ships via existing copy-web-client pipeline).
- **Approved-script reference shape:** `scriptRef = relative path under configured root`, validated via `realpathSync` after `path.resolve`. Reject `..`, absolute paths, non-`.js` extensions.
- **Output parsing:** `--summary-export` only for v0; raw NDJSON gated behind `K6_KEEP_RAW_JSON=true` env opt-in.
- **SSRF mitigation:** Inject target via `__ENV.TARGET_URL`, validate the *injected* URL through existing engine allowlist before passing down. Document that scripts must use `__ENV.TARGET_URL` and not hardcode hosts. Real network-namespace isolation is a follow-up.

## Risks / known limitations

- k6 bypasses engine's outbound allowlist for HTTP it issues itself; v0 SSRF fix is `__ENV.TARGET_URL` injection (defense-in-depth, not perfect).
- k6 exit code 99 (thresholds crossed) preserved in `RunnerSummary.exitCode`.
- `child_process.spawn` mock pattern doesn't exist in the test suite yet; established in commit 1.
- k6 `executionMode: 'parallel'` may oversubscribe host CPU; document as v0 limitation.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented k6 runner execution end-to-end across the engine and shared runtime. Curated k6 steps now run in either native or Docker mode through `apps/demo-dashboard/src/server/runners/k6-runner.ts`, with the engine routing dispatch to the runner and persisting artifacts under `reportsDir`.

Landed in five atomic commits:
1. `feat(engine): execute k6 scenario steps via shared runner module` — runner skeleton with native execution, dependency-injected spawn, path-traversal guards (realpath defeats `..` and symlink escape). Replaced the rejection block in engine.ts with a per-step k6 branch; nuclei still pre-rejects.
2. `feat(k6-runner): parse summary export into runner metrics` — `--summary-export` parsed into `RunnerSummary.metrics` (requests, iterations, p95, checks, thresholds). Threshold breaches flip step status to failed even when k6 exits 0.
3. `feat(k6-runner): persist artifacts under reportsDir per execution step` — per-step dir at `<reportsDir>/<executionId>/<stepId>/{summary.json, stdout.log, stderr.log}` with URL-shaped artifact paths (TASK-65.3 owns the download endpoint).
4. `feat(k6-runner): enforce timeout, abort, and output buffer caps` — 10-min default wall-clock timeout (SIGTERM → 5s grace → SIGKILL), abort signal propagation maps to `cancelled` status, 2 MiB stdout buffer cap with `summaryTruncated` flag, 256 KiB summary file size cap.
5. `feat(k6-runner): add docker mode and binary probe with per-step override` — startup probe via `spawnSync('k6', ['--version'])` (cached), Docker mode pinned to `grafana/k6:0.50.0` (configurable via `CRUCIBLE_K6_DOCKER_IMAGE`), `--network host` default, volume mounts for scripts (read-only) and artifacts. Per-step `runner.mode` overrides engine default.

**SSRF mitigation (v0):** Curated scripts must read targets via `__ENV.TARGET_URL`, which the runner injects from the engine's per-execution effective target. k6 issues HTTP itself bypassing the engine's outbound allowlist; real network-namespace isolation is a follow-up.

**Test coverage:** 14 new k6 tests in `engine.test.ts` covering happy path, exit-99 failure, threshold-failed soft fail, path traversal (`..`), symlink escape, missing runner, missing reportsDir, missing binary, abort cancellation, timeout, stdout truncation, oversized summary file, docker mode args, custom docker image. All 113 engine tests pass; full demo-dashboard suite (156) and catalog suite (136) green.

**Verification:** `pnpm --filter @crucible/demo-dashboard type-check`, `pnpm --filter @crucible/demo-dashboard test`, `pnpm --filter @crucible/catalog test`, `pnpm -r type-check`.

**Known limitations / follow-ups:**
- `--network host` in docker mode is permissive; tighter scoping is a future task.
- Stderr buffer is also capped at 2 MiB silently (no flag); commit 4 only surfaces truncation for stdout. Add a stderr-truncated flag if operators need it.
- `executionMode: 'parallel'` may oversubscribe host CPU when multiple k6 steps run concurrently; document as v0 limitation.
- Schema for `RunnerSummary.summaryTruncated` lives in `apps/demo-dashboard/src/shared/types.ts`; client mirrors should pick it up via TASK-65.5 (web-client) and TASK-65.3 (CLI/reports) when those land.
<!-- SECTION:FINAL_SUMMARY:END -->
