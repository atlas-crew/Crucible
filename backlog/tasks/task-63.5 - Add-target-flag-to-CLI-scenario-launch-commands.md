---
id: TASK-63.5
title: Add --target flag to CLI scenario launch commands
status: Done
assignee: []
created_date: '2026-04-12 19:24'
updated_date: '2026-04-28 16:49'
labels:
  - feature
  - per-run-target
  - cli
dependencies:
  - TASK-63.4
references:
  - apps/cli/src/
  - docs/user-guides
parent_task_id: TASK-63
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Let operators specify a target URL when running scenarios from the command line. The CLI delegates to the Crucible client library, so the flag plumbing is shallow — parse the flag, validate it's a well-formed URL, pass to the client launch call.

Primary use case: "run scenario X against staging today and prod tomorrow" in CI pipelines or during environment promotion. The flag should feel natural alongside existing CLI options and follow the same short-flag convention (`-t`) if the letter is free.

Validation is deliberately basic — the REST endpoint does the authoritative validation. The CLI should catch obvious typos (`--target notaurl`) before the network round trip but otherwise forward whatever the operator provides.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CLI scenario launch commands (run, assess, or whichever subcommands start executions) accept --target <url> and -t <url>
- [x] #2 Flag value is validated client-side for basic URL shape (http/https, parseable) before the network call, with a clear error on failure
- [x] #3 Flag value is forwarded through the client library to the REST endpoint
- [x] #4 CLI integration test verifies the flag is forwarded end-to-end to a mock server
- [x] #5 CLI user guide in docs/user-guides updated to document the flag with a worked example showing a multi-environment run
- [x] #6 CLI --help output includes the new flag with a concise description
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added `--target/-t <url>` to both `simulate` and `assess` commands. The CLI is hand-rolled (no yargs/commander), so each command parses its own arg list — followed the established pattern of an else-if branch in the loop using the existing `readFlag` helper.

- **Validation (`parse.ts`).** New `validateTargetUrlInput(value)` does a basic `URL` parse + scheme check (http/https). Authoritative validation still lives at the REST endpoint per AC #2's deliberate split — the CLI just catches obvious typos before the network round trip.
- **Wiring.** `simulate.ts` forwards through `client.simulations.start(scenarioId, { targetUrl })` when supplied, omits the second arg entirely otherwise. `assess.ts` threads it through `parseAssessArgs` → `AssessOptions.targetUrl` and applies it to every scenario in a multi-scenario assess (the same target is used for every run in one invocation, which matches the "same scenario, different environment per CI job" use case).
- **Help text.** Added two examples to the global `HELP` in `bin.ts` (one assess, one simulate, demonstrating both `--target` and `-t`); added a row to `renderAssessHelp()` for the assess subcommand help.
- **Tests.** New `simulate.test.ts` (6) and `assess.test.ts` (6) cover: omitted flag → no second arg, `--target` forwarding, `-t` shorthand, unparseable URL rejection without network call, non-http(s) scheme rejection, and (for assess) the same `--target` applied to every scenario in a multi-scenario invocation.
- **Docs.** Updated `docs/user-guides/cli.md` with the new flag in both the `assess` options table and a new `simulate` options table, plus a multi-environment example showing the same scenario hitting staging and prod from one CLI binary.
<!-- SECTION:NOTES:END -->
