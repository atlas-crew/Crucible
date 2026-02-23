# Running Scenarios

Crucible ships with 80+ pre-built security testing scenarios. This guide covers browsing the catalog, running simulations, and reviewing assessment results.

---

## The Scenarios Catalog

Navigate to **/scenarios** from the top navigation bar. You'll see a searchable grid of scenario cards.

### Browsing

Each card shows:
- **Difficulty** — Beginner, Intermediate, Advanced, or Expert
- **Category** — API Security, Web Attacks, Denial of Service, etc.
- **Description** — What the scenario tests
- **Step count** — Number of execution steps
- **Tags** — Classification labels (e.g., `owasp-api-1`, `bola`, `sqli`)

Use the **search bar** to filter by name, ID, description, category, or tags.

### Viewing Details

Click any card to open the scenario detail dialog with three tabs:

| Tab | Content |
|-----|---------|
| **Overview** | Metadata: ID, category, difficulty, target, tags, rule IDs |
| **Steps** | Expandable list of every step — method, URL, headers, body, assertions, dependencies |
| **Edit** | Visual and JSON editors (see [Editing Scenarios](editing-scenarios.md)) |

---

## Simulations

A **simulation** executes a scenario in real time and streams step-by-step results to your browser via WebSocket.

### Starting a Simulation

1. Go to **/scenarios**
2. Find the scenario you want to run
3. Click the **Simulate** button (play icon) on the card

You'll be taken to the **/simulations** page where execution progress appears in real time.

### Monitoring Progress

The simulations page has two panels:

- **Left sidebar** — list of all simulation executions with status badges
- **Right panel** — the execution timeline for the selected simulation

The timeline shows each step as it executes:
- A **pulsing dot** for the currently running step
- **Green check** for passed steps
- **Red X** for failed steps
- **Gray dash** for skipped steps (conditional steps whose conditions weren't met)

Each step expands to show:
- Assertion results (expected vs. actual, pass/fail per assertion)
- Error messages (if the step failed)
- Extracted variables (values captured for use in later steps)

### Controlling Execution

While a simulation is running, you can:

| Action | Scope | What it does |
|--------|-------|-------------|
| **Pause** | Single execution | Suspends after the current step completes |
| **Resume** | Single execution | Continues from where it paused |
| **Cancel** | Single execution | Aborts immediately |
| **Restart** | Completed/failed | Starts a fresh execution of the same scenario |
| **Pause All** | All running | Pauses every active simulation |
| **Resume All** | All paused | Resumes every paused simulation |
| **Cancel All** | All active | Cancels everything |

Bulk controls appear in the toolbar above the simulations list.

---

## Assessments

An **assessment** runs the same execution engine as a simulation, but focuses on the final result: a **pass/fail score**.

### Starting an Assessment

1. Go to **/scenarios**
2. Click the **Assess** button (checklist icon) on any scenario card

### Reviewing Results

Navigate to **/assessments**. The layout mirrors the simulations page:

- **Left sidebar** — list of assessments with score badges and pass/fail indicators
- **Right panel** — execution timeline with a report summary at the bottom

### Scoring

The assessment report includes:

| Field | Description |
|-------|-------------|
| **Score** | Percentage of steps that passed all assertions (0–100%) |
| **Passed** | `true` if score >= 80%, `false` otherwise |
| **Summary** | Human-readable result (e.g., "Executed 12 steps. 10 passed.") |

A step **passes** when every assertion (status code, body content, headers, blocked detection) succeeds. A step **fails** if any single assertion doesn't match.

### Simulation vs. Assessment

| | Simulation | Assessment |
|---|-----------|-----------|
| **Purpose** | Watch execution live | Get a pass/fail verdict |
| **Real-time updates** | Yes (WebSocket streaming) | Yes |
| **Report generated** | No | Yes (score, passed, summary) |
| **Best for** | Debugging, exploration | Compliance checks, regression testing |

Both modes use the same engine and produce the same step-level data. The difference is in how results are presented.

---

## Understanding Step Execution

Scenarios are not simple linear scripts. The engine supports:

### Dependencies

Steps can declare dependencies on other steps via `dependsOn`. The engine builds a directed acyclic graph (DAG) and executes steps in parallel when their dependencies are satisfied.

```
Step A ──┐
         ├──► Step C (depends on A and B)
Step B ──┘
```

### Conditional Execution

A step with a `when` clause only runs if a referenced step meets a condition:

- `when.succeeded: true` — run only if the referenced step passed
- `when.succeeded: false` — run only if the referenced step failed
- `when.status: 403` — run only if the referenced step received a 403 response

Steps whose conditions aren't met are **skipped** (shown as gray in the timeline).

### Template Variables

Steps can reference dynamic values using `{{variable}}` syntax:

| Variable | Source |
|----------|--------|
| `{{random}}` | Random 8-character alphanumeric string |
| `{{random_ip}}` | Random IP address |
| `{{timestamp}}` | Current Unix timestamp |
| `{{iteration}}` | Current iteration number (for repeated steps) |
| `{{custom_var}}` | Extracted from a previous step's response via `extract` rules |

Extraction lets you chain steps together — for example, extract a JWT from a login response and use it in subsequent authenticated requests.

### Retries and Iterations

- **Retries** — if a step fails, the engine retries up to N times before marking it as failed
- **Iterations** — a step can repeat N times (useful for rate-limit testing or load generation)
- **Delay and jitter** — configurable pause between retries/iterations to simulate realistic timing

---

## Connection Status

The top-right corner of the UI shows the WebSocket connection state:

- **CONNECTED** (green pulse) — real-time updates are active
- **OFFLINE** (gray) — no connection to the backend; the UI will auto-reconnect every 3 seconds

If you see OFFLINE persistently, check that the backend is running (`pnpm --filter @crucible/demo-dashboard dev`).

---

## What's Next

- [Editing Scenarios](editing-scenarios.md) — create custom scenarios or modify existing ones
- [System Overview](../architecture/system-overview.md) — understand how the components fit together
