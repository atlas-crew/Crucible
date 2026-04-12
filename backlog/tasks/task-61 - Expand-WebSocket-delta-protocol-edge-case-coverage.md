---
id: TASK-61
title: Expand WebSocket delta protocol edge-case coverage
status: To Do
assignee: []
created_date: '2026-03-12 11:56'
labels:
  - websocket
  - testing
  - follow-up
milestone: m-6
dependencies:
  - TASK-43
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow up on TASK-43. The websocket delta protocol now supports snapshot seeding, delta updates, and client-side merges, but the remaining audit gaps are around baseline reset/reseed transitions and diff suppression precision rather than the main happy path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Add server tests covering terminal baseline cleanup plus pause/resume or GET_STATUS reseeding before the next delta.
- [ ] #2 Add server tests for no-op updates, top-level-only deltas, and existing-step partial delta shapes.
- [ ] #3 Add hook or store coverage for at least one additional lifecycle/delta routing edge case beyond the current happy-path matrix.
<!-- AC:END -->
