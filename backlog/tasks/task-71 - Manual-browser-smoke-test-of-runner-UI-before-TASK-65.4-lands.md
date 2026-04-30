---
id: TASK-71
title: Manual browser smoke test of runner UI before TASK-65.4 lands
status: To Do
assignee: []
created_date: '2026-04-30 10:44'
labels:
  - qa
  - ui
  - k6
dependencies:
  - TASK-65.5
references:
  - apps/web-client/src/components/execution-timeline.tsx
  - apps/demo-dashboard/src/server/reports.ts
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CLAUDE.md compliance gap: TASK-65.5 shipped UI changes (`apps/web-client/src/components/execution-timeline.tsx`) without browser verification. Component tests assert DOM presence but don't catch layout, contrast, or interaction issues.

**Checklist to run before TASK-65.4 starts:**

```
1. Start dev servers: `pnpm dev` (web-client on :3000, demo-dashboard on :3001)
2. Set CRUCIBLE_K6_SCRIPTS_DIR=packages/catalog/scripts/k6 and ensure
   `which k6` resolves (or set CRUCIBLE_K6_MODE=docker with grafana/k6:0.50.0
   pulled). Without this the runner step throws "k6 binary not found" — that
   path itself is worth verifying in the UI.
3. Add or pick a curated k6 scenario (e.g., a baseline-smoke.js that does
   `http.get(__ENV.TARGET_URL + '/health')`).
4. Trigger an assessment via the UI launch dialog. Confirm the launch
   dialog accepts the scenario without filtering it out.
5. Open the resulting execution in the timeline. Expand the runner step.

Verify:
  [ ] Default tab is "Runner" (not "Response", not "Error")
  [ ] Type badge says "K6"
  [ ] Exit code badge present and tone matches success/failure
  [ ] Threshold-breach badge appears only when thresholdsFailed > 0
  [ ] Metric tiles render: Requests, Iterations, HTTP p95, Checks, Thresholds
  [ ] Danger tone applied to Checks/Thresholds tiles when failed > 0
  [ ] Artifacts list shows summary.json and stdout.log links
  [ ] Clicking an artifact link downloads the file (browser does NOT inline render)
  [ ] Runner Output pre block shows captured stdout
  [ ] If summaryTruncated set, "Truncated" indicator visible
  [ ] HTTP-only steps in the same scenario still render correctly
  [ ] Error tab still reachable when step.error is set
  [ ] Tab keyboard navigation works (Tab/Shift+Tab, Arrow keys)
  [ ] Layout doesn't break at narrow viewport widths (sm/md breakpoints)

Also verify HTML report:
  [ ] Open /api/reports/<execId>?format=html
  [ ] Runner step card shows metrics list, exit code, artifact links
  [ ] Artifact links from the report page also download correctly
```

**If anything fails, file specific bugs as separate tasks; this ticket closes when the checklist runs clean.**
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pnpm dev runs without errors and both servers come up
- [ ] #2 Curated k6 scenario can be launched via the web UI launch dialog
- [ ] #3 Runner tab default-selects when present, all metric tiles render
- [ ] #4 Artifact links download (Content-Disposition or browser default behavior)
- [ ] #5 HTML report renders runner section consistently with the timeline
- [ ] #6 No layout breaks at narrow viewports
- [ ] #7 All checklist items verified or filed as separate bugs
<!-- AC:END -->
