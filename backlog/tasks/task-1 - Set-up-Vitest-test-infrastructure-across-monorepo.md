---
id: TASK-1
title: Set up Vitest test infrastructure across monorepo
status: Done
assignee: []
created_date: '2026-02-23 07:41'
updated_date: '2026-02-23 07:53'
labels:
  - infra
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Configure Vitest as the test runner for all three packages in the Symphony monorepo.

## Scope
- `packages/catalog`: Add vitest config, ensure Zod + TS works
- `apps/demo-dashboard`: Add vitest config with fetch mock support (already has engine.test.ts — verify it runs under Vitest)
- `apps/web-client`: Add vitest + @testing-library/react + jsdom, configure for Next.js App Router

## Notes
- The demo-dashboard engine.test.ts already uses vi.fn() patterns — confirm Vitest compatibility
- Web-client needs special handling for Next.js (next/navigation mocks, etc.)
- Consider a shared vitest workspace config at monorepo root
- Reference: gap report notes that web-client has zero test infrastructure
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 vitest runs in packages/catalog
- [x] #2 vitest runs in apps/demo-dashboard (engine.test.ts passes)
- [x] #3 vitest runs in apps/web-client with RTL support
- [x] #4 pnpm test script works from monorepo root
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## What was done

- **packages/catalog**: Already had vitest ^3.2.4 + config. 30 tests passing (2 test files).
- **apps/demo-dashboard**: Already had vitest ^3.2.4 + config. 20 tests passing (engine.test.ts).
- **apps/web-client**: Configured from scratch:
  - Installed: vitest, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, jsdom, @vitejs/plugin-react
  - Created vitest.config.ts with react plugin, jsdom environment, @/ path alias
  - Created vitest.setup.ts with next/navigation and next/image mocks
  - Added test/test:watch scripts with --passWithNoTests flag
- **Root**: `pnpm test` → `nx run-many --target=test --all` works across all 3 packages.
<!-- SECTION:NOTES:END -->
