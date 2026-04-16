---
id: TASK-65.3
title: >-
  Expose external runner summaries and artifacts in CLI output and assessment
  reports
status: To Do
assignee: []
created_date: '2026-04-13 18:02'
updated_date: '2026-04-13 18:02'
labels:
  - feature
  - reporting
  - cli
  - k6
  - nuclei
milestone: m-10
dependencies:
  - TASK-65.1
  - TASK-65.2
  - TASK-65.4
references:
  - apps/demo-dashboard/src/cli/assess-command.ts
  - apps/demo-dashboard/src/server/reports.ts
  - apps/client/src/types.ts
parent_task_id: TASK-65
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend Crucible's reporting path so external-runner steps show up as first-class evidence in CLI assessments, persisted execution records, and generated reports. This is where the product value lands: operators should not have to leave Crucible or manually stitch together a separate load or scan report to understand the outcome of an assessment.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Assessment reports include runner-backed step summaries, pass or fail state, and artifact links alongside existing HTTP-step evidence
- [ ] #2 CLI assess output surfaces runner failures and summaries clearly enough to use in CI or scripted workflows
- [ ] #3 Persisted execution records retain enough runner metadata for history views and report regeneration
- [ ] #4 Export and route semantics stay aligned so artifacts remain downloadable without introducing report-state races
<!-- AC:END -->
