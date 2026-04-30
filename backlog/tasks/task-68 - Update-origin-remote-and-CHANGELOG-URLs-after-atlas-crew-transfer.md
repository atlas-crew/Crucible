---
id: TASK-68
title: Update origin remote and CHANGELOG URLs after atlas-crew transfer
status: To Do
assignee: []
created_date: '2026-04-29 10:01'
labels:
  - docs
  - chore
  - release
dependencies: []
references:
  - CHANGELOG.md
  - README.md
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Local `origin` remote and `CHANGELOG.md` compare links still reference `github.com/NickCrew/Crucible` after the repository was transferred to `atlas-crew/Crucible`. GitHub auto-redirects, but the canonical owner should be reflected in the working tree and committed docs.

**Discovery.** Surfaced during the v0.4.0 tag push — git output included `remote: This repository moved. Please use the new location: https://github.com/atlas-crew/Crucible.git`.

**Fixes.**
- `git remote set-url origin https://github.com/atlas-crew/Crucible.git` (local-only, no commit needed)
- Update `CHANGELOG.md` `[Unreleased]` and `[0.4.0]` compare-link footers to `atlas-crew/Crucible`
- Audit other tracked files for `NickCrew/Crucible` references — likely candidates: `README.md`, `package.json` `repository` fields across the workspace, any docs links, GitHub Pages config

**Impact if ignored.** None today — redirects work. Future risk: if GitHub ever sunsets a redirect (rare) or ownership changes again, the old links would break. Cosmetic-but-deserved canonicalization.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Local `origin` remote URL points to `https://github.com/atlas-crew/Crucible.git`
- [ ] #2 CHANGELOG.md compare-link footers reference `atlas-crew/Crucible`
- [ ] #3 All tracked package.json `repository` fields and README/docs links reference `atlas-crew/Crucible`
- [ ] #4 `git grep NickCrew` returns no results
<!-- AC:END -->
