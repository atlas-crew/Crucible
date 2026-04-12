---
id: TASK-22
title: Add Docker Compose for full-stack local development
status: In Progress
assignee: []
created_date: '2026-03-07 23:27'
updated_date: '2026-03-21 20:34'
labels:
  - dx
  - docker
milestone: m-0
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create a `docker-compose.yml` that stands up the web-client, demo-dashboard, and optionally the Chimera vulnerable app (from ../Chimera). Should support both dev mode (with volume mounts) and production builds. Currently only web-client has a Dockerfile.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docker-compose up starts web-client, demo-dashboard, and Chimera
- [ ] #2 Services can communicate (web-client connects to dashboard WebSocket)
- [ ] #3 Chimera is accessible as a target for scenario execution
- [ ] #4 Volume mounts or rebuild strategy documented
<!-- AC:END -->
