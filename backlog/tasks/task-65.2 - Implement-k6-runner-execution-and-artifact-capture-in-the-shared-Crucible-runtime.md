---
id: TASK-65.2
title: >-
  Implement k6 runner execution and artifact capture in the shared Crucible
  runtime
status: In Progress
assignee: []
created_date: '2026-04-13 18:02'
updated_date: '2026-04-30 07:50'
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
- [ ] #1 k6 steps execute through the shared runtime using approved script references rather than arbitrary command strings
- [ ] #2 Runner execution supports target and environment injection, timeout handling, and deterministic exit-state mapping into Crucible step status
- [ ] #3 k6 output is parsed into a concise summary with threshold or failure information plus captured artifacts suitable for later report download
- [ ] #4 Security guardrails cover allowed script locations, output limits, and artifact retention behavior
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
