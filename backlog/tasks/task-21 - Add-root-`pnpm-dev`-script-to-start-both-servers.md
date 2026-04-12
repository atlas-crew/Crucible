---
id: TASK-21
title: Add root `pnpm dev` script to start both servers
status: Done
assignee: []
created_date: '2026-03-07 23:27'
updated_date: '2026-03-07 23:32'
labels:
  - dx
  - quick-win
milestone: m-0
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a root-level `dev` script that starts both the demo-dashboard (port 3001) and web-client (port 3000) concurrently. Options: Nx `run-many --target=dev`, or add `concurrently` as a devDep. Should work with a single `pnpm dev` from the repo root.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Running `pnpm dev` from repo root starts both servers
- [x] #2 Both servers are accessible (localhost:3000 and localhost:3001)
- [x] #3 Ctrl+C cleanly stops both processes
- [x] #4 Output from both servers is visible with clear prefixes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan\n\n**Approach:** Use pnpm's built-in `--parallel` workspace support. Zero new dependencies.\n\n### Steps\n1. Add `\"dev\"` script to root `package.json`: `pnpm --parallel --filter=web-client --filter=@crucible/demo-dashboard run dev`\n2. Verify both servers start with `pnpm dev` from repo root\n3. Verify Ctrl+C cleanly stops both processes\n4. Verify output shows prefixed logs from both servers\n\n### Why not Nx or concurrently?\n- Nx `run-many` is designed for cacheable parallel builds, not long-running dev servers\n- `concurrently` adds a dependency for cosmetic improvement over pnpm's built-in output\n- pnpm `--parallel` handles signal propagation, prefixed output, and filtering natively"
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Summary\n\nAdded a `dev` script to the root `package.json` that starts both the web-client (Next.js, port 3000) and demo-dashboard (Express+WS, port 3001) concurrently using pnpm's built-in `--parallel` flag.\n\n## Changes\n\n- **`package.json`** — Added `\"dev\": \"pnpm --parallel --filter=web-client --filter=@crucible/demo-dashboard run dev\"` to scripts\n\n## Approach\n\nUsed pnpm's native `--parallel` workspace support rather than adding `concurrently` (extra dependency) or `nx run-many` (designed for cacheable builds, not long-running servers). Explicit `--filter` flags ensure only the two app packages are started, skipping `@crucible/catalog` which has no dev script.\n\n## Verification\n\n- Ran `pnpm dev` from repo root — both servers started successfully\n- demo-dashboard: `Demo Dashboard server running on port 3001 (119 scenarios loaded)`\n- web-client: `Ready in 1898ms` at `http://localhost:3000`\n- Output is prefixed with `apps/demo-dashboard dev:` and `apps/web-client dev:` for clear identification\n- Process cleanup via Ctrl+C handled by pnpm's signal propagation"
<!-- SECTION:FINAL_SUMMARY:END -->
