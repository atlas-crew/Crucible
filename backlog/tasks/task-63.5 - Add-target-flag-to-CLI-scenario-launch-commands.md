---
id: TASK-63.5
title: Add --target flag to CLI scenario launch commands
status: To Do
assignee: []
created_date: '2026-04-12 19:24'
updated_date: '2026-04-12 19:25'
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
- [ ] #1 CLI scenario launch commands (run, assess, or whichever subcommands start executions) accept --target <url> and -t <url>
- [ ] #2 Flag value is validated client-side for basic URL shape (http/https, parseable) before the network call, with a clear error on failure
- [ ] #3 Flag value is forwarded through the client library to the REST endpoint
- [ ] #4 CLI integration test verifies the flag is forwarded end-to-end to a mock server
- [ ] #5 CLI user guide in docs/user-guides updated to document the flag with a worked example showing a multi-environment run
- [ ] #6 CLI --help output includes the new flag with a concise description
<!-- AC:END -->
