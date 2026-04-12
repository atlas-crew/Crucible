---
id: TASK-62
title: Set up public npm and Docker Hub publishing for Crucible
status: Done
assignee:
  - codex
created_date: '2026-03-27 09:54'
updated_date: '2026-03-28 22:45'
labels:
  - release
  - publishing
  - npm
  - docker
dependencies: []
references:
  - /Users/nick/Developer/Crucible/package.json
  - /Users/nick/Developer/Crucible/apps/demo-dashboard/src/server/index.ts
  - /Users/nick/Developer/Crucible/apps/web-client/next.config.ts
  - /Users/nick/Developer/Crucible/Dockerfile
  - /Users/nick/Developer/Crucible/.github/workflows/release.yml
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create a single distributable Crucible release artifact under the @atlascrew npm scope and publish a matching Docker Hub image. The release should ship the frontend, backend, and catalog together with one supported runtime path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A single publishable npm package exists for Crucible under the @atlascrew scope and can be packed from this repository with the frontend backend and catalog included in one installable artifact
- [x] #2 The packaged runtime serves the web UI API and WebSocket traffic through one supported entrypoint suitable for local install and container deployment
- [x] #3 GitHub Actions release automation publishes the npm package to npmjs and a matching Docker image to Docker Hub using repository secrets and semver tags
- [x] #4 Release usage and required secrets are documented in repository docs
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Audit current workspace build outputs, runtime assumptions, and release workflows for frontend backend catalog and Docker packaging.
Refactor the demo-dashboard server into reusable backend wiring that can attach API routes and WebSocket handling to an existing HTTP server without owning the only public port.
Create a dedicated publishable Crucible release package under the @atlascrew scope that builds the Next app, bundles internal backend and catalog code, and starts the UI plus API on one server entrypoint.
Update packaging assets and release workflows so semver tags publish the npm package to npmjs and the container image to Docker Hub with explicit secret usage.
Refresh README and getting-started docs with install run publish and Docker instructions, then validate with targeted pack build and test commands.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a new publishable workspace package at packages/crucible named @atlascrew/crucible with a unified start command, Next asset staging, and npm public publishConfig.

Extracted demo-dashboard backend wiring into attachCrucibleBackend so the packaged runtime can serve API and WebSocket traffic from the same HTTP server as the web UI.

Updated release automation from GHCR-only Docker publishing to npmjs plus Docker Hub tag releases and refreshed README/getting-started/home-page docs accordingly.

Validation receipts: pnpm --filter @crucible/demo-dashboard type-check PASS; pnpm --filter web-client test -- --run src/hooks/__tests__/useWebSocket.test.ts PASS; pnpm --dir packages/crucible type-check PASS; pnpm build:release PASS; pnpm --dir packages/crucible pack --pack-destination /tmp/crucible-pack2 PASS (tarball size about 2.6M); pnpm deploy --filter @atlascrew/crucible --prod /tmp/crucible-deploy PASS.

Environment limits: live runtime smoke from this checkout is blocked by a local better-sqlite3 native ABI mismatch outside the changed code, and Docker image build/push could not be exercised because the local Docker daemon is unavailable.

Additional packaging fixes after clean-install smoke: copied catalog scenario JSON files into the release package, taught runtime creation to honor CRUCIBLE_SCENARIOS_DIR, and stopped copying the source app's next.config.ts and workspace package.json into the packaged web-client directory.

Clean publish-style validation now passes in a fresh temp install under Node 22: installed /tmp/crucible-pack4/atlascrew-crucible-0.1.0.tgz into /tmp/crucible-smoke, started the packaged server on port 4010, and confirmed /health plus /api/scenarios returned 200 with 129 bundled scenarios.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Created a dedicated publishable workspace package at packages/crucible for `@atlascrew/crucible`, with a unified `crucible` binary that starts the web UI, API, and WebSocket server together on one port and still exposes the assessment CLI.

Refactored the demo-dashboard backend into reusable attachable server wiring so the packaged runtime can mount existing API and WebSocket behavior behind a shared HTTP server. The release package now stages built Next assets and bundled scenario JSON files, and it avoids leaking the source app's TypeScript Next config or workspace package metadata into the published runtime.

Updated CI and release automation so semver tags publish the npm package to npmjs and the container image to Docker Hub. Refreshed README, getting-started, and docs home snippets with npm install, Docker usage, and required secret guidance.

Validation: `pnpm --filter @crucible/demo-dashboard type-check`, `pnpm --filter web-client test -- --run src/hooks/__tests__/useWebSocket.test.ts`, `pnpm --dir packages/crucible type-check`, `pnpm build:release`, `pnpm --dir packages/crucible pack --pack-destination /tmp/crucible-pack4`, and a clean Node 22 smoke test via temporary npm install with successful `/health` and `/api/scenarios` responses from the installed package.
<!-- SECTION:FINAL_SUMMARY:END -->
