---
id: TASK-64.6
title: Add product-tour framework for guided first-run walkthrough
status: To Do
assignee: []
created_date: '2026-04-24 04:20'
labels:
  - feature
  - ux
  - web-client
  - archive-borrow
milestone: m-9
dependencies: []
references:
  - >-
    ../.archive/edge-protection/apps/demo-dashboard/dashboard/src/components/tour/
  - ../.archive/edge-protection/apps/demo-dashboard/dashboard/src/tour-steps.ts
  - apps/web-client/src/app/page.tsx
  - apps/web-client/src/components/site-header.tsx
  - apps/web-client/src/store/useCatalogStore.ts
documentation:
  - docs/user-guides/getting-started.md
parent_task_id: TASK-64
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Adopt the declarative product-tour pattern from the archived demo-dashboard and layer it over the Crucible web client so operators can be walked through the scenarios to simulations to assessments flow on first load. Complements TASK-64.1 (which covers the static onboarding checklist) by adding an opt-in, selector-based overlay tour. Do not import the archive's Redux wiring, vendor branding, or custom CSS primitives.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Operators can launch a guided tour that highlights the primary steps in scenarios, simulations, and assessments; auto-starts on first visit and is re-launchable from a help affordance
- [ ] #2 Tour steps are declared in a single selector-based configuration so new steps can be added without new UI scaffolding
- [ ] #3 Tour state (dismissed or completed) is persisted via the existing Zustand persist middleware and does not re-trigger on every visit once dismissed
- [ ] #4 Tour UI uses current Crucible primitives (Radix, Tailwind) with no archive CSS or vendor colors imported
- [ ] #5 Targeted UI tests cover launch, step navigation, skip, and dismissal; getting-started user docs updated to describe the tour
<!-- AC:END -->
