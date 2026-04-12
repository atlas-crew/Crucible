---
id: TASK-63.4
title: Expose targetUrl option in the Crucible client library
status: To Do
assignee: []
created_date: '2026-04-12 19:24'
updated_date: '2026-04-12 19:25'
labels:
  - feature
  - per-run-target
  - client-library
dependencies:
  - TASK-63.3
references:
  - apps/client/src/
  - apps/client/README.md
parent_task_id: TASK-63
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add the per-run target URL override to the typed Crucible client library so downstream consumers (CLI, custom integrations, user scripts) can pass it through without hand-crafting the request body. The client is the published consumer contract — once this lands, both internal consumers (CLI, web UI if it adopts the client) and external users can launch runs with a target override using strongly-typed method calls.

Client-side validation stays minimal — the REST endpoint is the source of truth for validation, and duplicating rules here is a drift hazard. Just ensure the field has the right TypeScript type on the input shape and is forwarded verbatim in the fetch body.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Client TypeScript types for simulation and assessment launch inputs include an optional targetUrl: string field
- [ ] #2 When targetUrl is provided, it is forwarded in the JSON request body to the REST endpoint
- [ ] #3 When targetUrl is omitted, the request body omits the field (not null, not empty string) so the server uses its default
- [ ] #4 Client tests verify: field is present in the serialized body when provided, field is absent when omitted, type signature rejects non-string values at compile time
- [ ] #5 Client README in apps/client/README.md documents the new option with a short example showing a multi-environment run
<!-- AC:END -->
