---
id: TASK-70
title: Bump GitHub Actions to support Node 24 before Sept 2026 deprecation
status: To Do
assignee: []
created_date: '2026-04-29 10:02'
labels:
  - ci
  - tech-debt
  - deadline
dependencies: []
references:
  - .github/workflows/release.yml
  - .github/workflows/ci.yml
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GitHub Actions runners are deprecating Node.js 20 — actions running on Node 20 will be force-upgraded to Node 24 by **June 2, 2026**, and Node 20 will be **removed entirely on September 16, 2026**. Several actions used in our workflows still run on Node 20 and will break unless upgraded.

**Surfaced.** v0.4.0 Release run annotations from 2026-04-29 explicitly named the affected actions:

`Publish npm packages` job: `actions/checkout@v4`, `actions/setup-node@v4`, `pnpm/action-setup@v4`

`Build & Push Docker Image` job: `actions/checkout@v4`, `docker/build-push-action@v6`, `docker/login-action@v3`, `docker/metadata-action@v5`, `docker/setup-buildx-action@v3`

**Fix path.** Each action publishes a Node-24-compatible version. Audit:
- `actions/checkout@v5` (or later v4 patch with Node 24 support)
- `actions/setup-node@v5`
- `pnpm/action-setup@v5`
- `docker/*` actions — check upstream changelogs for Node 24 support; pin to current latest

Test in a feature branch first since some action upgrades have breaking config changes.

**Deadline.** Don't wait until September. June 2 is when default behavior changes (actions force-run on Node 24 even if their bundle expects Node 20 — could break with subtle TypeError-shape failures). Aim to land this by **June 1, 2026**.

**Workaround if blocked.** Set `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION=true` to keep Node 20 running past the cutover. Buys time only — Node 20 is removed entirely Sept 16.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All actions in `.github/workflows/*.yml` upgraded to Node-24-compatible versions
- [ ] #2 Release workflow runs end-to-end with no Node 20 deprecation annotations
- [ ] #3 Test runs verify no breaking config changes were missed
- [ ] #4 Lands before 2026-06-01 (one week buffer before GitHub's June 2 forced-Node-24 cutover)
<!-- AC:END -->
