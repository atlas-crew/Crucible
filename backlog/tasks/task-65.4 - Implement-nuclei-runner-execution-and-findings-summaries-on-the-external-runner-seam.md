---
id: TASK-65.4
title: >-
  Implement nuclei runner execution and findings summaries on the external
  runner seam
status: To Do
assignee: []
created_date: '2026-04-13 18:02'
updated_date: '2026-04-13 18:02'
labels:
  - feature
  - scenario-engine
  - nuclei
  - security
milestone: m-10
dependencies:
  - TASK-65.1
references:
  - apps/demo-dashboard/src/server/engine.ts
  - apps/demo-dashboard/src/server/runtime.ts
parent_task_id: TASK-65
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add nuclei as the second external runner using the same execution seam established for k6. The intent is to support curated template or workflow execution with findings summaries and artifact capture inside Crucible's assessment lifecycle, not to recreate a standalone nuclei orchestration product.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 nuclei steps execute through the shared runner seam using approved template or workflow references
- [ ] #2 Runner execution supports target injection, severity or tag filtering where applicable, and clear mapping of findings into Crucible step status and summaries
- [ ] #3 Findings output is captured in a structured artifact format suitable for reports and history views
- [ ] #4 The nuclei implementation reuses shared runner infrastructure instead of forking a separate execution path
<!-- AC:END -->
