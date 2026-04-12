---
id: TASK-16
title: 'P1: Test useWebSocket hook'
status: Done
assignee: []
created_date: '2026-02-23 07:43'
updated_date: '2026-02-23 08:09'
labels:
  - p1
  - web-client
  - testing
dependencies:
  - TASK-1
references:
  - apps/web-client/src/hooks/useWebSocket.ts
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add tests for the useWebSocket React hook that manages the real-time connection to the demo-dashboard server. This is the backbone of live execution updates.

## Missing Tests
1. Creates WebSocket connection on mount
2. Sets wsConnected=true on open, false on close
3. Schedules reconnect after RECONNECT_DELAY (3000ms) on close
4. Closes WebSocket on error (triggers reconnect via close handler)
5. Parses incoming JSON messages and dispatches to store
6. Dispatches for all event types (EXECUTION_STARTED through STATUS_UPDATE)
7. Only dispatches when payload.id exists
8. Silently ignores malformed JSON messages
9. Cleans up on unmount (clears timer, closes socket, nulls ref)

## Standard Violated
- testing-standards.md §1 (Contract) — zero tests
- testing-standards.md §4 (State Transition) — connection lifecycle untested

## Suggested Approach
Mock WebSocket globally. Use @testing-library/react renderHook(). Simulate open/close/message/error events on the mock. Verify store actions called correctly. Use vi.useFakeTimers() for reconnect delay.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Connection created on mount
- [ ] #2 wsConnected state tracks open/close
- [ ] #3 Reconnect scheduled after close with 3s delay
- [ ] #4 All event types dispatched to store
- [ ] #5 Malformed JSON silently ignored
- [ ] #6 Cleanup on unmount (timer cleared, socket closed)
<!-- AC:END -->
