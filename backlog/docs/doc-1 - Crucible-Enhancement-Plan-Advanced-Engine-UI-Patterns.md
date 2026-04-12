---
id: doc-1
title: 'Crucible Enhancement Plan: Advanced Engine & UI Patterns'
type: other
created_date: '2026-03-11 21:48'
---
# Crucible Enhancement Plan: Advanced Engine & UI Patterns

This document outlines the strategy for porting high-value architectural patterns and capabilities from the `demo-dashboard` and `control-panel-api` projects into the Crucible "Security Lab Suite".

## 1. Advanced Execution Core (Engine Enhancement)

### 1.1 Step Dependency & Parallel Groups
**Source:** `control-panel-api/src/services/workflow-engine.ts` (Lines 110-180, `groupSteps`, `executeParallelSteps`)
**Goal:** Port the logic for managing complex execution graphs to Crucible's `ScenarioEngine`.
- **Logic:** Implement `parallelGroup` and `executionMode` (sequential vs. parallel) in scenario definitions.
- **Deadlock Detection:** Port the dependency check logic (`checkDependencies`, Line 550) to ensure scenarios with circular or missing dependencies fail gracefully.

### 1.2 Interactive Execution Control (Pause/Resume)
**Source:** `demo-dashboard/src/server/engine.ts` (Lines 340-450, `pauseExecution`, `resumeExecution`)
**Goal:** Enable interactive debugging of security scenarios.
- **State Management:** Use `ExecutionControl` interface with `AbortController` and `Promise` based pausing.
- **Implementation:** Update the `executeScenario` loop (Lines 150-280) to check `ctrl.paused` at each step boundary.

### 1.3 Context Extraction & Templating
**Source:** `demo-dashboard/src/server/engine.ts` (Lines 510-560, `runExtract`, `resolveTemplates`)
**Goal:** Enhance Crucible's ability to chain dynamic security payloads.
- **Extraction:** Port `getJsonPath` and the extraction rules (`status`, `header`, `body`) to populate the `execution.context`.
- **Templating:** Expand Crucible's `resolveTemplates` to support built-in variables like `{{random_ip}}` and `{{timestamp}}`.

## 2. Persistence & Data Management

### 2.1 Step Body Retention & Truncation
**Source:** `demo-dashboard/src/server/engine.ts` (Lines 460-500, `buildPersistedStepResult`, `truncateUtf8`)
**Goal:** Prevent Crucible's SQLite database from bloating during heavy assessments.
- **Policies:** Implement `StepBodyRetentionPolicy` (`all`, `failed-only`, `none`).
- **Truncation:** Enforce `CRUCIBLE_STEP_BODY_MAX_BYTES` (default 64KB) on all persisted HTTP response bodies.

### 2.2 Layered Service Architecture
**Source:** `control-panel-api/docs/API_ARCHITECTURE.md`
**Goal:** Refactor Crucible's backend into clear layers (Routes -> Services -> Repositories).
- **Service Layer:** Move scenario execution logic out of the WebSocket handlers and into a dedicated `ScenarioService`.
- **Repository Pattern:** Formalize the `@crucible/catalog` `ExecutionRepository` for all Drizzle ORM operations.

## 3. High-Performance Frontend (UI/UX)

### 3.1 Real-time Metrics & Throttling
**Source:** `control-panel-ui/src/store/orchestratorSlice.ts` (Lines 310-340, `setOrchestratorGlobalMetrics`)
**Goal:** Maintain a responsive UI during high-speed scenario execution.
- **Rolling Buffers:** Maintain a `metricsHistory` array (max 100 entries) in the Zustand store for live sparklines.
- **Throttling:** Use a `THROTTLE_MS` (e.g., 500ms) check in the store's metric update actions to prevent excessive React re-renders.

### 3.2 Advanced Execution Timeline
**Source:** `control-panel-ui/src/components/RunMonitor/` (General pattern)
**Goal:** Replace the basic timeline with an interactive, drill-down component.
- **Features:** Visual indicators for parallel groups, real-time status icons (pulsing for running, green for pass, red for fail), and a "Inspect Step" sidebar showing the persisted response body and context.

## 4. Advanced Capabilities

### 4.1 Remote Terminal Integration
**Source:** `control-panel-ui/src/components/RemoteTerminal.tsx`
**Goal:** Allow users to interact with local lab targets directly from the browser.
- **Stack:** `xterm.js` on the frontend, piping binary data over WebSockets to a local shell or proxy.

### 4.2 Automated Reporting Service
**Source:** `control-panel-api/src/services/pdf-export.ts`
**Goal:** Generate professional security assessment reports.
- **Formats:** Support JSON for CI/CD pipelines and PDF (via `pdfkit` or `puppeteer`) for executive summaries.

### 4.3 Command Palette (Power User Navigation)
**Source:** `control-panel-ui/src/components/CommandPalette.tsx`
**Goal:** Provide a fast, keyboard-driven interface for navigation and global actions.
- **Actions:** Quick jump to scenarios, active executions, stopping all runs, and toggling UI modes (e.g., "Developer Mode").
- **Implementation:** React portal with fuzzy search over registered actions.

### 4.4 User-Scoped Persistence (Local Storage Migration)
**Source:** `control-panel-ui/src/store/sessionsSlice.ts` (Lines 290-340, `hydrateFromLocalStorage`)
**Goal:** Support private, user-scoped data persistence in the browser.
- **Pattern:** Transition from global `localStorage` keys to user-prefixed keys (e.g., `user123:scenarios`) to support multi-user local labs.

### 4.5 Session & Scenario Portability (Import/Export)
**Source:** `control-panel-ui/src/store/sessionsSlice.ts` (Lines 200-260, `exportSessionsAsFile`, `importSessions`)
**Goal:** Allow users to share scenarios and execution history.
- **Feature:** "Export as JSON" for single scenarios or entire execution sessions, and "Import" with conflict resolution (merge vs. skip).

### 4.6 Target Health Monitoring (Liveness Pattern)
**Source:** `control-panel-api/src/services/site-health-checker.ts`
**Goal:** Provide real-time visibility into the target lab environment's stability.
- **Pattern:** Background heartbeat service that periodically probes the target URL and emits status updates.
- **Value:** Prevents "false negative" scenario failures caused by a crashed target or WAF block.

### 4.7 Scenario Validation & Linting (Pre-flight Checks)
**Source:** `demo-dashboard/scripts/validate-scenarios.ts`
**Goal:** Prevent runtime errors by validating scenario structure before execution.
- **Checks:** Detect undefined variables (`{{var}}`), broken dependency chains, and malformed URLs.
- **Integration:** Expose as a CLI tool for CI/CD and a "Pre-flight" check in the UI.

### 4.8 Adaptive Execution (Safe-Mode Pattern)
**Source:** `control-panel-api` (`TenantConfig.adaptive`)
**Goal:** Ensure lab stability by automatically adjusting execution speed based on target health.
- **Logic:** Monitor target latency (P95) and automatically inject delays if the target starts to struggle (e.g., latency > 1000ms).
