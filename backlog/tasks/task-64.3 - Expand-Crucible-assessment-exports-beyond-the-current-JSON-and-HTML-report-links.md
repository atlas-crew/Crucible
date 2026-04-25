---
id: TASK-64.3
title: >-
  Expand Crucible assessment exports beyond the current JSON and HTML report
  links
status: To Do
assignee: []
created_date: '2026-04-13 17:00'
labels:
  - feature
  - reporting
  - web-client
milestone: m-10
dependencies: []
references:
  - >-
    ../.archive/edge-protection/apps/demo-dashboard/dashboard/src/services/report-generator.ts
  - >-
    ../.archive/edge-protection/apps/demo-dashboard/dashboard/src/services/export-service.ts
  - apps/demo-dashboard/src/server/reports.ts
  - apps/demo-dashboard/src/server/backend.ts
  - apps/web-client/src/components/execution-timeline.tsx
  - apps/web-client/src/components/history/execution-history-detail.tsx
documentation:
  - docs/user-guides/running-scenarios.md
  - docs/user-guides/api-client.md
parent_task_id: TASK-64
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Mine the archive export patterns to identify export improvements that fit current Crucible reporting. Prioritize additive export capabilities such as markdown summaries or history/log exports that build on the existing server-side report generation and current web-client download surfaces.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A concrete new export capability is added on top of the current assessment reporting flow without regressing existing JSON and HTML downloads
- [ ] #2 Export filenames and payloads are sanitized for operator-facing download use
- [ ] #3 The web client exposes the new export affordance in a place operators can discover from assessment or history detail views
- [ ] #4 Server and UI changes include targeted tests and any required user-guide updates
<!-- AC:END -->
