---
id: TASK-64.4
title: Improve assessment explainability with rule and assertion reasoning summaries
status: To Do
assignee: []
created_date: '2026-04-13 17:00'
updated_date: '2026-04-24 05:49'
labels:
  - feature
  - reporting
  - assessment
milestone: m-10
dependencies:
  - TASK-64.5
references:
  - >-
    ../.archive/edge-protection/apps/demo-dashboard/dashboard/src/services/riskScorer.ts
  - apps/demo-dashboard/src/server/reports.ts
  - apps/demo-dashboard/src/server/engine.ts
  - apps/demo-dashboard/src/shared/types.ts
  - apps/web-client/src/app/assessments/page.tsx
  - apps/web-client/src/components/assessment-trend-panel.tsx
  - apps/web-client/src/components/execution-timeline.tsx
documentation:
  - docs/user-guides/running-scenarios.md
  - docs/architecture/scenario-engine.md
parent_task_id: TASK-64
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Use the archive's scoring and triggered-rule concepts as inspiration for richer assessment explainability in Crucible. Extend current reports and UI summaries so operators can understand why an assessment passed or failed without reverse-engineering raw step output.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Completed assessments expose operator-friendly reasoning about the factors that drove pass or fail outcomes
- [ ] #2 Explainability output builds from current Crucible assertions and compliance data instead of importing archive ThreatX rule models directly
- [ ] #3 Assessment detail views and exported reports present the new reasoning consistently
- [ ] #4 Targeted tests cover the new report semantics and guard against empty or misleading reasoning output
<!-- AC:END -->
