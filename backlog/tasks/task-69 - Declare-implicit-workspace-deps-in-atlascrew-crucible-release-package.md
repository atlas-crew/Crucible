---
id: TASK-69
title: Declare implicit workspace deps in @atlascrew/crucible release package
status: To Do
assignee: []
created_date: '2026-04-29 10:01'
labels:
  - build
  - release
  - tech-debt
dependencies: []
references:
  - packages/crucible/package.json
  - Dockerfile
  - packages/crucible/scripts/copy-web-client.mjs
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`packages/crucible` (the release wrapper, package name `@atlascrew/crucible`) bundles source from sibling workspace packages without declaring any of them as `workspace:*` dependencies. This caused the v0.4.0 Docker build to fail silently because pnpm had no dependency graph to traverse.

**Concrete failure.** v0.4.0 Docker build failed with `ERROR: Could not resolve "@crucible/catalog/client"` because the Dockerfile used `pnpm --filter @atlascrew/crucible build`, which doesn't transit deps that aren't declared. The fast fix was switching the Dockerfile to `pnpm build` (root nx run-many topo build), but that builds CLI and client too — wasted Docker layer time.

**Architecture issue.** `packages/crucible`:
- bundles `apps/demo-dashboard/src/server/backend.ts` via tsup → which imports `@crucible/catalog/client`
- copies `apps/web-client/.next` and `packages/catalog/scenarios` via `scripts/copy-web-client.mjs`
- but its `package.json` `dependencies` do not list `@crucible/catalog`, `@crucible/web-client`, or `@crucible/demo-dashboard`

This makes the package's actual build graph invisible to pnpm tooling. It works in CI because Nx's `run-many --target=build --all` builds everything regardless. Anywhere using filtered builds (Docker, future CI optimizations, IDE workspace tools) silently breaks until something fails at the right link.

**Fix.**
- Add `workspace:*` entries for the actually-consumed packages in `packages/crucible/package.json` `dependencies` (publish-time tooling will resolve the workspace protocol to real semver before npm publish)
- Verify the `prepack` / `prepublishOnly` flow strips/replaces the `workspace:*` protocol correctly (pnpm does this automatically with `pnpm publish`, but worth confirming for the release script)
- Update Dockerfile to use `pnpm --filter "...@atlascrew/crucible" build` to take advantage of the now-declared graph
- Verify Docker build time decreases (we'd skip CLI and client builds inside the container)

**Out of scope.**
- Restructuring the bundling pattern itself (tsup-bundling-from-sibling). That's a larger architecture conversation; this task only formalizes the existing implicit deps.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/crucible/package.json declares workspace deps for every workspace package consumed by its build (catalog, web-client, demo-dashboard as applicable)
- [ ] #2 `pnpm --filter "...@atlascrew/crucible" build` builds catalog and web-client before crucible without errors
- [ ] #3 Dockerfile updated to use the topological filter instead of `pnpm build`
- [ ] #4 Docker build time measurably decreases (CLI/client builds no longer run in the image)
- [ ] #5 `pnpm publish` from packages/crucible still produces a valid package — workspace protocol resolved correctly at pack time
<!-- AC:END -->
