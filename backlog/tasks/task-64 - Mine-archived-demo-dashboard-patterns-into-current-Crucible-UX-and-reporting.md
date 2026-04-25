---
id: TASK-64
title: Mine archived demo-dashboard patterns into current Crucible UX and reporting
status: To Do
assignee: []
created_date: '2026-04-13 17:00'
labels:
  - feature
  - ux
  - archive-borrow
dependencies: []
references:
  - ../.archive/edge-protection/apps/demo-dashboard/dashboard/src/App.tsx
  - ../.archive/edge-protection/apps/demo-dashboard/dashboard/src/layout
  - apps/web-client/src
  - apps/demo-dashboard/src/server
documentation:
  - docs/user-guides/getting-started.md
  - docs/user-guides/running-scenarios.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Review the archived edge-protection demo-dashboard and selectively port the highest-value ideas into current Crucible surfaces without importing legacy Redux, CSS-heavy primitives, or ThreatX-specific controls. Focus this initiative on non-overlapping improvements to the Next.js web client and current reporting flow. Treat editable target configuration as out of scope here because TASK-63.6 already owns the target URL launch UI.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A scoped set of follow-on tasks exists for the borrowable archive patterns that fit current Crucible architecture
- [ ] #2 The initiative explicitly excludes direct reuse of legacy Redux, custom CSS primitives, and ThreatX-specific plugin or branding code
- [ ] #3 Target configuration follow-on work is routed to existing TASK-63.6 instead of duplicated in this initiative
<!-- AC:END -->
