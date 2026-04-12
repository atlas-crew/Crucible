---
id: TASK-40
title: Add GitHub Actions workflow for security gate
status: To Do
assignee: []
created_date: '2026-03-07 23:28'
labels:
  - ci
  - github-actions
milestone: m-5
dependencies:
  - TASK-39
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create a reusable GitHub Actions workflow that starts Chimera as a target service, runs Crucible assessments via the CLI runner, and fails the pipeline if scores fall below a configurable threshold. Publish as a composite action or reusable workflow for use in other repos.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 GitHub Actions workflow starts Chimera as a service container
- [ ] #2 Runs Crucible assessments against Chimera
- [ ] #3 Pipeline fails if score below configured threshold
- [ ] #4 Results posted as PR comment or job summary
<!-- AC:END -->
