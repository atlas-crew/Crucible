---
id: TASK-23
title: Add Dockerfile for demo-dashboard
status: To Do
assignee: []
created_date: '2026-03-07 23:27'
labels:
  - dx
  - docker
milestone: m-0
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The web-client already has Docker support but the demo-dashboard does not. Add a Dockerfile for the Express server, including the catalog package build. Needed for Docker Compose setup.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Dockerfile builds demo-dashboard with catalog dependency
- [ ] #2 Container starts and serves API on configured port
- [ ] #3 Scenarios are loaded from bundled JSON files
<!-- AC:END -->
