---
id: TASK-30
title: Build AI/LLM security scenarios (OWASP LLM Top 10)
status: To Do
assignee: []
created_date: '2026-03-07 23:28'
labels:
  - scenarios
  - ai-llm
milestone: m-3
dependencies: []
references:
  - docs/plans/scenarios-ai-llm.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create scenario JSON files for AI/LLM attack vectors based on docs/plans/scenarios-ai-llm.md: direct prompt injection, indirect prompt injection, and sensitive data leakage from LLM contexts. Requires a target with LLM-powered endpoints (could be Chimera extension or mock).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 At least 3 AI/LLM scenarios created
- [ ] #2 Covers direct prompt injection, indirect prompt injection, data leakage
- [ ] #3 Scenarios include meaningful assertions for detection/bypass
<!-- AC:END -->
