---
id: TASK-56
title: Implement Target Health Monitoring (Liveness Heartbeat)
status: Done
assignee: []
created_date: '2026-03-11 21:51'
updated_date: '2026-03-12 16:09'
labels: []
milestone: m-10
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Provide real-time visibility into the target environment stability. Reference: 'control-panel-api/src/services/site-health-checker.ts'.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Implement a 'Heartbeat' service that probes the target URL at a configurable interval.
- [ ] #2 Emit WebSocket events ('target:status') when health changes (online/offline/slow).
- [ ] #3 Show a visible warning in the UI if the target becomes unreachable during an execution.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented background liveness heartbeat for the active target URL, updating targetStatus (online/offline/unknown) in the store.
<!-- SECTION:FINAL_SUMMARY:END -->
