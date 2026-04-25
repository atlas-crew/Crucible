---
id: TASK-64.1
title: Add first-run onboarding and inline guidance to the Crucible web client
status: To Do
assignee: []
created_date: '2026-04-13 17:00'
labels:
  - feature
  - ux
  - web-client
milestone: m-9
dependencies: []
references:
  - ../.archive/edge-protection/apps/demo-dashboard/dashboard/src/App.tsx
  - >-
    ../.archive/edge-protection/apps/demo-dashboard/dashboard/src/layout/OnboardingChecklist.tsx
  - >-
    ../.archive/edge-protection/apps/demo-dashboard/dashboard/src/layout/HintBanner.tsx
  - apps/web-client/src/app/page.tsx
  - apps/web-client/src/components/site-header.tsx
  - apps/web-client/src/store/useCatalogStore.ts
documentation:
  - docs/user-guides/getting-started.md
  - docs/user-guides/running-scenarios.md
parent_task_id: TASK-64
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Borrow the archive's strongest onboarding ideas and adapt them to the current Next.js web client so operators can understand the initial flow without reading docs first. Focus on lightweight first-run guidance such as a quick-start checklist, dismissible hints, and contextual help that align with Crucible's current layout and state model.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The web client presents a lightweight first-run onboarding experience that helps operators reach a useful first execution
- [ ] #2 Onboarding state can be dismissed and does not reappear on every visit unless intentionally reset
- [ ] #3 Inline guidance uses current Crucible components and terminology instead of archive branding or legacy modal patterns
- [ ] #4 User-facing guidance changes are covered by targeted UI tests and corresponding docs updates where needed
<!-- AC:END -->
