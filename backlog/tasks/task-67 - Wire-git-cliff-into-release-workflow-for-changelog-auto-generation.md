---
id: TASK-67
title: Wire git-cliff into release workflow for changelog auto-generation
status: To Do
assignee: []
created_date: '2026-04-28 20:59'
labels:
  - release
  - tooling
  - docs
dependencies: []
references:
  - CHANGELOG.md
  - .github/workflows/release.yml
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add `git-cliff` to the release pipeline so every `v*` tag push regenerates the CHANGELOG entry from Conventional Commits as a baseline, with the agent (or maintainer) optionally polishing the entry before tag.

**Context.** v0.4.0 was the first release with a CHANGELOG.md. It was hand-drafted (47 commits since v0.3.0, organized into themed Added/Changed/Fixed groups). Going forward we want an auto-generated scaffold as the floor — never an empty changelog — with the option to polish before tagging when there's time.

**Approach.**
- Add `cliff.toml` at the repo root configured to read Conventional Commits (`feat`, `fix`, `chore`, `docs`, `test`, `refactor`) and group them into Keep a Changelog sections (Added / Changed / Fixed).
- Wire `git-cliff` into `.github/workflows/release.yml` (or a separate `changelog.yml`) so the Unreleased section is regenerated on push to `main` and the next tag entry is generated when a `v*` tag is pushed.
- Decide whether `cliff.toml` mappings live in repo or in the workflow file — repo is more portable.
- Consider whether the workflow commits the regenerated CHANGELOG back to the branch (requires write permission and a bot identity) or just attaches it to the GitHub Release as an artifact. Attaching is simpler; committing keeps the file in sync but adds a force-push hazard.
- Document the polish workflow: maintainer/agent edits Unreleased, runs `git cliff --tag v0.X.0` locally to refresh, commits, then pushes the tag.

**Out of scope.**
- Changing existing v0.4.0 entries — those stay as the hand-drafted baseline.
- Per-package CHANGELOGs (workspace packages still inherit from the repo-level changelog with the version mapping footer pattern).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 cliff.toml committed at repo root with Conventional Commit groupings mapped to Keep a Changelog sections (Added / Changed / Fixed)
- [ ] #2 Release workflow regenerates CHANGELOG.md Unreleased section on push to main, or generates the tagged entry on `v*` tag push
- [ ] #3 Local `git cliff --unreleased` produces a draft that matches the format used in the v0.4.0 entry (themed groupings, package version footer)
- [ ] #4 docs/devel/ has a short note documenting the polish-before-tag workflow for maintainers
- [ ] #5 CHANGELOG.md format from v0.4.0 onward is consistent — auto-generated entries do not regress the Keep a Changelog conventions established by the v0.4.0 baseline
<!-- AC:END -->
