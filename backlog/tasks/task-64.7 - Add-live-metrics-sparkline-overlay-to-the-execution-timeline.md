---
id: TASK-64.7
title: Add live metrics sparkline overlay to the execution timeline
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
    ../.archive/edge-protection/apps/demo-dashboard/dashboard/src/components/RealTimeChart.tsx
  - apps/web-client/src/components/execution-timeline.tsx
  - apps/web-client/src/components/execution-metrics-chart.tsx
  - apps/web-client/src/store/useCatalogStore.ts
documentation:
  - docs/user-guides/running-scenarios.md
parent_task_id: TASK-64
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Mine the archived demo-dashboard's canvas-based real-time chart pattern to add a lightweight metrics overlay (for example RPS, pass-rate, step latency) to the execution timeline while a simulation is running. Use a plain HTML canvas so no new charting dependencies are introduced and bundle size stays flat. Reuse the metricsHistory samples already captured in useCatalogStore. Copy the math and rendering approach, not the archive's vendor-specific CSS variables.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Running simulations surface a real-time sparkline or small multi-series chart inside or adjacent to the execution timeline
- [ ] #2 Visualization reads from the existing metricsHistory store slice and updates without introducing new WebSocket messages or server-side changes
- [ ] #3 Rendering is done with plain Canvas 2D; no charting library (Chart.js or equivalent) added to dependencies
- [ ] #4 Visual treatment uses current Radix and Tailwind tokens; no archive --a10-* or other vendor color variables
- [ ] #5 Component has targeted tests using mocked metrics data and handles empty, not-yet-started, and paused execution states gracefully
<!-- AC:END -->
