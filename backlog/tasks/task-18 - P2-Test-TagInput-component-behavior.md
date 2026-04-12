---
id: TASK-18
title: 'P2: Test TagInput component behavior'
status: Done
assignee: []
created_date: '2026-02-23 07:43'
updated_date: '2026-02-23 08:14'
labels:
  - p2
  - web-client
  - testing
dependencies:
  - TASK-1
references:
  - apps/web-client/src/components/scenario-editor/tag-input.tsx
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add tests for the TagInput component used in scenario metadata (tags, rule_ids, dependency IDs).

## Missing Tests
1. Add tag on Enter key press
2. Add tag on input blur
3. Trim whitespace before adding
4. Prevent duplicate tags
5. Remove tag on X button click
6. Backspace on empty input removes and populates last tag
7. Clear input after tag added

## Standard Violated
- testing-standards.md §1 (Contract Tests)

## Suggested Approach
Use @testing-library/react. Render component with onChange spy. Simulate keyboard events and clicks. Verify onChange called with correct tag arrays.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Enter key adds trimmed tag
- [ ] #2 Duplicate tags prevented
- [ ] #3 X button removes specific tag
- [ ] #4 Backspace on empty input removes and edits last tag
<!-- AC:END -->
