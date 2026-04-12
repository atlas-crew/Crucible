---
id: TASK-27
title: Configure default target URL for Chimera
status: Done
assignee: []
created_date: '2026-03-07 23:28'
updated_date: '2026-03-08 06:06'
labels:
  - chimera
  - engine
milestone: m-2
dependencies: []
references:
  - 'apps/demo-dashboard/src/server/engine.ts:659-671'
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add environment variable support (e.g. `CRUCIBLE_TARGET_URL`) to the demo-dashboard for configuring the default target base URL. Default to `http://localhost:8880` (Chimera's default port). Update template variable resolution in the engine to support a `{{target}}` built-in variable. Update existing scenarios that use hardcoded URLs to use `{{target}}` prefix.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CRUCIBLE_TARGET_URL env var configures the base target URL
- [x] #2 {{target}} template variable resolves to the configured URL
- [x] #3 Engine prepends target URL to relative paths automatically (no scenario file changes needed)
- [x] #4 Web client displays the configured target URL in the site header
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan\n\n**Key finding:** 1021/1049 scenario URLs are relative paths. Only 28 are absolute (intentionally — SSRF targets, etc). No scenario file rewrites needed.\n\n### Steps\n\n1. **Engine `resolveTemplates()`** — Add `target` as a built-in variable resolving to `CRUCIBLE_TARGET_URL` env var (default `http://localhost:8880`)\n2. **Engine `executeStep()`** — Prepend target URL to relative paths (URLs starting with `/`) after template resolution\n3. **Health endpoint** — Include `targetUrl` in `/health` response\n4. **Web client `site-header.tsx`** — Display configured target URL next to connection status\n\n### Why not rewrite scenario files?\n- Relative paths already work — engine just needs to prepend the base URL\n- `{{target}}` is available as a template variable for explicit use in request bodies, SSRF payloads, etc.\n- Avoids touching 119 scenario JSON files and potential merge conflicts"
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Summary\n\nAdded configurable target URL support so the Crucible engine knows where to send scenario HTTP requests. Defaults to Chimera at `http://localhost:8880`.\n\n## Changes\n\n- **`apps/demo-dashboard/src/server/engine.ts`**\n  - Added `DEFAULT_TARGET_URL` constant (`http://localhost:8880`)\n  - Added `targetUrl` readonly property to `ScenarioEngine`, read from `CRUCIBLE_TARGET_URL` env var\n  - `resolveTemplates()` now accepts `targetUrl` param and resolves `{{target}}` as a built-in variable\n  - `executeStep()` prepends `targetUrl` to relative paths (URLs starting with `/`) after template resolution\n\n- **`apps/demo-dashboard/src/server/index.ts`**\n  - `/health` endpoint includes `targetUrl` in response\n  - Startup log includes configured target URL\n\n- **`apps/web-client/src/store/useCatalogStore.ts`**\n  - Added `targetUrl` state and `fetchHealth()` action\n\n- **`apps/web-client/src/components/site-header.tsx`**\n  - Fetches health on mount, displays target URL with crosshair icon next to connection status\n\n## Design decisions\n\n- **No scenario file rewrites**: 1021/1049 URLs are already relative paths. The engine prepends the target URL automatically, avoiding changes to 119 JSON files.\n- **`{{target}}` available for explicit use**: Scenarios that need the target URL in request bodies or headers (e.g. SSRF payloads) can use the template variable.\n- **Trailing slash stripped**: `targetUrl` has trailing slashes removed to avoid double-slash issues when prepending to `/api/...` paths.\n\n## Verification\n\n- Both apps build clean (TypeScript)\n- All 48 tests pass\n- Server startup: `Demo Dashboard server running on port 3001 (119 scenarios loaded, target: http://localhost:8880)`\n- Health endpoint: `{\"targetUrl\":\"http://localhost:8880\"}`"
<!-- SECTION:FINAL_SUMMARY:END -->
