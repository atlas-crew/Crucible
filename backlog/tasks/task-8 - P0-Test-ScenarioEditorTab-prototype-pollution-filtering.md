---
id: TASK-8
title: 'P0: Test ScenarioEditorTab prototype pollution filtering'
status: Done
assignee: []
created_date: '2026-02-23 07:42'
updated_date: '2026-02-23 08:09'
labels:
  - p0
  - web-client
  - testing
  - security
dependencies:
  - TASK-1
references:
  - apps/web-client/src/components/scenario-editor/scenario-editor-tab.tsx
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add test for the unknown-key filtering in ScenarioEditorTab that strips dangerous keys (__proto__, constructor, prototype) during JSON-to-draft conversion. This is a prototype pollution vector — if filtering is broken, attacker-crafted scenario JSON could inject __proto__ into objects.

## Missing Test
1. Parse JSON containing __proto__ key → verify it is stripped
2. Parse JSON containing constructor key → verify it is stripped
3. Parse JSON containing prototype key → verify it is stripped
4. Parse JSON with safe unknown keys → verify they are preserved

## Standard Violated
- testing-standards.md §1 (Contract Tests Required) — security-relevant behavior

## Suggested Approach
Extract the unknown-key filtering logic or test through the component. If extractable as a pure function, unit test directly. Otherwise test via RTL with JSON input containing dangerous keys.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 __proto__ key stripped from parsed scenario JSON
- [ ] #2 constructor key stripped from parsed scenario JSON
- [ ] #3 prototype key stripped from parsed scenario JSON
- [ ] #4 Safe unknown keys preserved through round-trip
<!-- AC:END -->
