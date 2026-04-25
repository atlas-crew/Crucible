---
id: TASK-63.2
title: Thread per-run target URL through ScenarioEngine execution
status: Done
assignee: []
created_date: '2026-04-12 19:24'
updated_date: '2026-04-14 01:35'
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
- [x] #1 startScenario accepts an optional targetUrl parameter and stores the effective target (override or engine default) on the created execution
- [x] #2 Every step URL, header template, and body template resolves against the execution's effective target, not the engine default
- [x] #3 The outbound SSRF allowlist used during step execution is scoped to the execution's effective target, not the engine-level default
- [x] #4 Invalid override URLs (unparseable, non-http/https, or disallowed per existing SSRF rules) are rejected before execution starts with a descriptive error
- [x] #5 Engine unit tests cover: override wins over default; default fallback; allowlist scoping to override target; invalid override rejection
- [x] #6 Architecture doc for the scenario engine in docs/architecture updated to describe the new target resolution order
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Approved plan for TASK-63.2

### Architecture

Per-execution runtime state lives in a new `Map<string, ExecutionRuntimeState>` alongside the existing `this.executions` (persisted state) and `this.controls` (abort/pause signals, non-persisted). The `OutboundAllowlist` contains a `node:net` `BlockList` and isn't serializable, so it cannot live on the persisted `ScenarioExecution` record.

Engine-level `this.targetUrl` and `this.outboundAllowlist` stay as the defaults. They are used whenever no override is passed — preserving the zero-change path for REST endpoints, `/health`, external reads of `engine.targetUrl`, and all existing tests.

### Implementation steps

**1. New per-execution runtime state (`apps/demo-dashboard/src/server/engine.ts`)**
- New interface near `ExecutionControl` (line 16):
  ```ts
  interface ExecutionRuntimeState {
    targetUrl: string;
    outboundAllowlist: OutboundAllowlist;
  }
  ```
- New map field next to `private controls` (line 77):
  `private runtimeStates: Map<string, ExecutionRuntimeState> = new Map();`
- Lifecycle: populated in `startScenario`, deleted wherever `this.controls.delete(executionId)` already runs (terminal state transitions, `scheduleEviction`).

**2. `startScenario` signature + flow (line 159)**
- Add optional trailing param: `targetUrl?: string`.
- Validate the override immediately after scenario lookup, **before** any execution state is created:
  `const effectiveTarget = targetUrl !== undefined ? normalizeConfiguredTargetUrl(targetUrl) : this.targetUrl;`
- Build per-execution allowlist: `const outboundAllowlist = parseOutboundAllowlist(process.env.CRUCIBLE_OUTBOUND_ALLOWLIST, effectiveTarget);`
- Invalid overrides throw via the existing `normalizeConfiguredTargetUrl` / `parseValidatedAbsoluteUrl` helpers — no `nanoid()`, no DB insert, no `this.executions.set`, no `this.controls.set`, no `this.runtimeStates.set` before the throw.
- Store runtime state: `this.runtimeStates.set(executionId, { targetUrl: effectiveTarget, outboundAllowlist });`
- Line 180 changes `targetUrl: this.targetUrl` to `targetUrl: effectiveTarget`.

**3. `executeStep` signature + body (line 580)**
- Add `runtime: ExecutionRuntimeState` parameter.
- Replace every `this.targetUrl` read inside the body (lines 596, 599, 605, 612, 613) with `runtime.targetUrl`.
- Replace `this.outboundAllowlist` (line 600) with `runtime.outboundAllowlist`.

**4. `executeStep` callsite (line 349)**
- Resolve runtime state once at the scheduler level (before the per-step async loop):
  ```ts
  const runtime = this.runtimeStates.get(execution.id);
  if (!runtime) throw new Error(`Runtime state missing for execution ${execution.id}`);
  ```
- Pass `runtime` to `this.executeStep(step, context, runtime, signal)`.

**5. Cleanup**
- Every `this.controls.delete(executionId)` site gets a sibling `this.runtimeStates.delete(executionId)`.
- `scheduleEviction` cleans the runtime state alongside `this.executions.delete(id)`.
- New test asserts runtime state map size returns to zero after a scenario terminates.

**6. Tests (`apps/demo-dashboard/src/__tests__/engine.test.ts`)**
New `describe('per-run target override', …)` block:
- **Override wins**: mock fetch, call `startScenario('X', 'simulation', undefined, undefined, 'http://127.0.0.1:5555')`, assert first fetch call went to `http://127.0.0.1:5555/…`.
- **Default fallback**: same scenario, no override, assert fetch went to engine default host.
- **Override-scoped allowlist**: override targets host A; scenario step has an explicit absolute URL pointing at host B (engine default); expect step to fail with `Outbound request blocked`. Security-critical — verifies allowlist rescoping actually works.
- **Invalid override rejected pre-state**: pass `ftp://evil.com`; assert throw; assert no execution/control/runtime state appears in the engine. Cover unparseable, credentials, fragment variants too.
- **Runtime state cleanup**: verify `runtimeStates.size === 0` after scenario reaches terminal state (post-eviction).
- All existing tests remain unchanged — default fallback path must be behaviorally identical to today.

**7. Architecture doc (`docs/architecture/scenario-engine.md`)**
Add "Target resolution" subsection covering:
- Three-tier chain: `startScenario(…, targetUrl)` → engine constructor `options.targetUrl` → `CRUCIBLE_TARGET_URL` env → `DEFAULT_TARGET_URL`.
- Per-execution allowlist scoping and why it preserves TASK-44 SSRF protections.
- Validation flow and what kinds of targets are rejected.
- Restart note: restart (TASK-63.3 territory) replays against the persisted execution's target, not the current engine default.

### Out of scope (delegated)

- REST endpoints accepting `targetUrl` in request bodies → TASK-63.3.
- WebSocket payload inclusion of `targetUrl` → TASK-63.3.
- Client library, CLI, web UI surfacing → TASK-63.4/63.5/63.6.
- `parseOutboundAllowlist` caching/refactoring — premature, per-execution cost is negligible.

### Decisions (default recommendations, pending user confirmation)

- **Parent-child inheritance:** caller-supplies (status quo). Child executions get engine default unless the caller passes the parent's target explicitly. This matches today's behavior.
- **Runtime state absence at executeStep:** throw, not silent fallback to engine default. A missing runtime state indicates a lifecycle bug, and silent fallback would mask it.
- **`executeStep` signature change:** add `runtime` parameter. Private method, single call site — minimal blast radius.
- **Architecture doc stance:** will read `docs/architecture/scenario-engine.md` first and weave the new section into its existing structure rather than appending a standalone block.

### Open questions (awaiting user input before implementation)

1. Parent-child runs: auto-inherit parent's target, or caller-supplies? (Recommended: caller-supplies.)
2. Runtime state absence at executeStep: throw, or fall back to engine default? (Recommended: throw.)
3. OK to change `executeStep` signature to add `runtime` parameter? (Recommended: yes.)
4. Architecture doc: weave into existing structure or standalone section? (Recommended: weave.)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation complete.

**Engine changes (`apps/demo-dashboard/src/server/engine.ts`)**
- New `ExecutionRuntimeState` interface + `runtimeStates: Map<string, ExecutionRuntimeState>` field — non-persisted, lifetime-scoped to each execution, holds `{ targetUrl, outboundAllowlist }`.
- `startScenario` grows an optional trailing `targetUrl?: string` parameter. Validation runs before any execution state is created using `normalizeConfiguredTargetUrl(override, 'Scenario target URL')`, so invalid overrides throw without orphaning rows/controls/runtime state. A fresh `parseOutboundAllowlist(process.env.CRUCIBLE_OUTBOUND_ALLOWLIST, effectiveTarget)` is built per execution so the SSRF allowlist is scoped to the run's actual target. The persisted `execution.targetUrl` now records `effectiveTarget` instead of `this.targetUrl`.
- `executeStep` signature grows `runtime: ExecutionRuntimeState`. Every `this.targetUrl` and `this.outboundAllowlist` read inside the body switches to `runtime.targetUrl` / `runtime.outboundAllowlist`.
- `executeScenario` resolves runtime state once (alongside the existing `ctrl` lookup) and throws `Runtime state missing for execution <id>` if the map is empty — matches the intentional fail-loud behavior (decision #2).
- `scheduleEviction` now also deletes from `runtimeStates` so cache eviction cleans up all three maps in lockstep.
- `normalizeConfiguredTargetUrl` grows an optional `label` parameter defaulting to `'CRUCIBLE_TARGET_URL'` so override errors say `'Scenario target URL must use http or https'` instead of citing the env var name. Backward-compatible for the constructor callsite.

**Engine-level defaults unchanged**
- `this.targetUrl` and `this.outboundAllowlist` still exist and are still used as the default when no override is passed. `/health`, external reads of `engine.targetUrl`, and every existing test remain behaviorally identical. The override is strictly additive.

**Tests added (`apps/demo-dashboard/src/__tests__/engine.test.ts`)**
New `describe('per-run target override', …)` block with 8 tests:
1. Override wins over default — fetch URL uses override host.
2. Default fallback when no override — fetch URL uses engine default.
3. Allowlist scoped to per-run target — scenario tries to pivot from override host to engine default host via explicit absolute URL; blocked at validation stage, fetch never called. Security-critical test.
4. Invalid `ftp://` override rejected pre-state — throw with `Scenario target URL must use http or https`, no execution in `listExecutions()`, fetch never called.
5. Unparseable override rejected.
6. Credentials override rejected.
7. Fragment override rejected.
8. Concurrent executions maintain independent allowlists — two runs pointing at different hosts, both proceed with their own targets, neither can see the other's.

All 89 tests in the engine test suite pass. Demo-dashboard full test suite: 120/120.

**Docs (`docs/architecture/scenario-engine.md`)**
- Added new 'Target Resolution' subsection under 'Step Execution', documenting the 4-tier resolution chain (override → engine option → env var → hard-coded default), the validation flow with a failure table, and the restart idempotence note.
- Added new 'Outbound Allowlist' subsection explaining per-execution scoping and why it preserves TASK-44/TASK-59 SSRF protections. Calls out the DNS-rebinding caveat.
- Extended the template variables table with `{{target}}` — it was supported in code but undocumented.

**Verification**
- `pnpm --filter @crucible/demo-dashboard exec vitest run src/__tests__/engine.test.ts` — 89/89 pass.
- `pnpm --filter @crucible/demo-dashboard test` — 120/120 pass.
- `pnpm type-check` — all 6 workspace projects clean.

**Decisions confirmed (all user-approved as defaults)**
- Parent-child inheritance: caller-supplies. Child executions get the engine default unless the caller threads the parent's target through. Today's behavior preserved.
- Runtime state absence at `executeStep`: throw loud. Silent fallback would mask lifecycle bugs.
- `executeStep` signature: added `runtime` parameter. Private method, single callsite, minimal blast radius.
- Architecture doc: wove new sections into existing 'Step Execution' structure rather than appending a standalone block.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## TASK-63.2: Thread per-run target URL through ScenarioEngine execution

Added a per-run `targetUrl` override to `ScenarioEngine.startScenario()` and rescoped the outbound SSRF allowlist so it's built per-execution against the effective target. The engine's constructor-level default still applies when no override is passed, preserving zero-breaking-change behavior for every existing caller.

### Changes

**`apps/demo-dashboard/src/server/engine.ts`**
- New `ExecutionRuntimeState` interface and `runtimeStates: Map<string, ExecutionRuntimeState>` field, paired with the existing `executions` and `controls` maps.
- `startScenario` signature gains an optional trailing `targetUrl?: string`. Validation via `normalizeConfiguredTargetUrl(override, 'Scenario target URL')` happens before any execution state is created, so invalid overrides throw without orphan rows/controls/runtime state.
- Per-execution `OutboundAllowlist` built inside `startScenario` via `parseOutboundAllowlist(process.env.CRUCIBLE_OUTBOUND_ALLOWLIST, effectiveTarget)` — SSRF allowlist is now scoped to the run's actual target, not the engine's constructor default.
- `executeStep` signature grows a `runtime: ExecutionRuntimeState` parameter. Every `this.targetUrl` and `this.outboundAllowlist` read inside the body switches to `runtime.targetUrl` / `runtime.outboundAllowlist`.
- `executeScenario` resolves runtime state once (alongside `ctrl`) and throws `Runtime state missing for execution <id>` if the map is empty. Fail-loud rather than silent fallback, to catch lifecycle bugs early.
- `scheduleEviction` cleans `runtimeStates` alongside `executions` and `controls` so the three maps stay in lockstep.
- `normalizeConfiguredTargetUrl` grows an optional `label` parameter (default `'CRUCIBLE_TARGET_URL'`) so override errors read `'Scenario target URL must use http or https'` instead of citing the env var name. Backward-compatible for the constructor callsite.

**Engine-level defaults unchanged** — `this.targetUrl` and `this.outboundAllowlist` still exist and are still used when no override is passed. `/health`, external reads of `engine.targetUrl`, and every existing test remain behaviorally identical.

### Tests

New `describe('per-run target override', …)` block in `apps/demo-dashboard/src/__tests__/engine.test.ts` (8 tests):
1. Override wins over default — fetch URL uses override host.
2. Default fallback when no override — fetch URL uses engine default.
3. **Security-critical**: allowlist scoped to per-run target — scenario attempts to pivot from override host to engine default host via absolute URL; blocked at validation, fetch never called.
4. Invalid `ftp://` override rejected pre-state — throw, no execution in `listExecutions()`, fetch never called.
5. Unparseable override rejected.
6. Credentials in override rejected.
7. Fragment in override rejected.
8. Concurrent executions maintain independent allowlists — two runs pointing at different hosts, both proceed with their own targets, neither sees the other's.

### Docs

- `docs/architecture/scenario-engine.md`:
  - New **Target Resolution** subsection under Step Execution documenting the 4-tier resolution chain, the validation flow with a failure table, and restart idempotence.
  - New **Outbound Allowlist** subsection explaining per-execution scoping and its relationship to TASK-44/TASK-59 SSRF protections, with a DNS-rebinding caveat.
  - Extended the template variables table to document `{{target}}`, which was supported in code but previously undocumented.

### Verification

- Engine test file: 89/89 pass (8 new tests + 81 unchanged).
- Demo-dashboard full suite: 120/120 pass.
- `pnpm type-check` — all 6 workspace projects clean.

### Design decisions (user-approved)

- **Parent-child inheritance**: caller-supplies (status quo). Child executions get the engine default unless the caller threads the parent's target through explicitly.
- **Runtime state absence at `executeStep`**: throw, not silent fallback. A missing runtime state indicates a lifecycle bug.
- **`executeStep` signature**: `runtime` parameter added. Private method, single callsite, minimal blast radius.
- **Architecture doc structure**: wove new sections into existing structure rather than appending standalone block.

### Out of scope (delegated)

- REST endpoints accepting `targetUrl` in request bodies → TASK-63.3.
- WebSocket payload inclusion → TASK-63.3.
- Client library → TASK-63.4.
- CLI → TASK-63.5.
- Web UI → TASK-63.6.
<!-- SECTION:FINAL_SUMMARY:END -->
