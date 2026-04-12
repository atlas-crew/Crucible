# Remote CLI

`@atlascrew/crucible-cli` is a lightweight command-line tool for interacting with a **running** Crucible server. It's the right choice for CI pipelines, scripting, and developer workflows that don't need the full server installed locally.

## When to use the CLI vs. the server package

| Goal | Use |
|------|-----|
| Run a Crucible server | `@atlascrew/crucible` (bundles server + UI + database) |
| Trigger scenarios from CI against a shared Crucible server | `@atlascrew/crucible-cli` |
| Script assessments from the terminal | `@atlascrew/crucible-cli` |
| Build a custom integration | `@atlascrew/crucible-client` (the library) |

The CLI is ~16 KB (bundled) with zero runtime dependencies. It talks to the server over HTTP and polls for assessment results.

## Installation

```bash
npm install -g @atlascrew/crucible-cli
```

Requires **Node.js 22+**.

## Global options

```
crucible-cli [options] <command> [command-options]

  --server <url>    Server URL (env: CRUCIBLE_URL, default: http://localhost:3000)
  --timeout <sec>   Request timeout in seconds (default: 30)
  --format <fmt>    Output format: json | table (default: auto-detect)
  --help, -h        Show help
```

The `--format` flag auto-detects based on whether stdout is a terminal: **table** for human use, **JSON** for pipes and scripts.

Set `CRUCIBLE_URL` once in your shell or CI environment so you don't have to repeat `--server` on every command.

## Commands

### `health`

Check whether the server is reachable.

```bash
crucible-cli health
```

```
status     ok
timestamp  1712894521000
scenarios  82
targetUrl  https://api.example.com
```

Returns exit code 1 if the server is unreachable.

### `scenarios`

List all scenarios on the server.

```bash
crucible-cli scenarios
```

```
id                          name                    category    difficulty  steps
--------------------------  ----------------------  ----------  ----------  -----
owasp-api-1-broken-auth     Broken Authentication   OWASP API   Beginner    5
owasp-api-2-auth-bypass     Auth Bypass             OWASP API   Advanced    8
...
```

### `assess`

Run one or more scenarios in assessment mode and wait for results. This is the primary CI command.

```bash
crucible-cli assess <scenario-id> [options]
```

Options:

| Flag | Default | Description |
|------|---------|-------------|
| `--scenario <id>` | — | Scenario ID(s), comma-separated or repeated. Also accepted as a positional argument. |
| `--fail-below <score>` | `80` | Exit non-zero if score falls below this threshold (0–100). |
| `--poll-interval <sec>` | `2` | How often to poll the execution status. |

Examples:

```bash
# Single scenario with default 80% threshold
crucible-cli assess owasp-api-1-broken-auth

# Multiple scenarios, stricter threshold
crucible-cli assess --scenario scenario-a,scenario-b --fail-below 90

# From CI with custom server
CRUCIBLE_URL=https://crucible.staging.internal \
  crucible-cli assess production-smoke-test --fail-below 95
```

Exit codes:

- `0` — all scenarios meet the threshold
- `1` — any scenario failed, timed out, or the command errored

Output (table format):

```
Scenario                 Status     Score  Threshold  Verdict  Duration
-----------------------  ---------  -----  ---------  -------  --------
owasp-api-1-broken-auth  completed  95%    80%        PASS     12.4s

Overall: PASS (1/1 met threshold)
```

Output (JSON format, used when piped):

```json
{
  "command": "assess",
  "server": "http://localhost:3000",
  "failBelow": 80,
  "scenarioCount": 1,
  "passed": true,
  "exitCode": 0,
  "results": [
    {
      "scenarioId": "owasp-api-1-broken-auth",
      "executionId": "abc123",
      "status": "completed",
      "score": 95,
      "meetsThreshold": true,
      "failBelow": 80,
      "durationMs": 12400,
      "summary": "All assertions passed",
      "stepCount": 5,
      "failedStepCount": 0
    }
  ]
}
```

### `simulate`

Start a scenario in simulation mode (no scoring). Returns immediately with the execution ID.

```bash
crucible-cli simulate my-scenario
```

```json
{
  "executionId": "abc123",
  "mode": "simulation",
  "wsUrl": "ws://localhost:3000/"
}
```

Use `executions get <id>` to check status afterward.

### `executions`

List and inspect executions.

```bash
# List all recent executions
crucible-cli executions

# With filters
crucible-cli executions --status running,completed --mode assessment --limit 20
crucible-cli executions --scenario owasp-api-1-broken-auth

# Get a specific execution
crucible-cli executions get abc123
```

Filter flags:

| Flag | Description |
|------|-------------|
| `--scenario <id>` | Only executions of this scenario |
| `--status <statuses>` | Comma-separated list: `pending`, `running`, `completed`, `failed`, `cancelled`, `paused`, `skipped` |
| `--mode <mode>` | `simulation` or `assessment` |
| `--limit <n>` | Max results (default 50, max 200) |

Table output:

```
id        scenario                 mode        status     score  duration
--------  -----------------------  ----------  ---------  -----  --------
abc12345  owasp-api-1-broken-auth  assessment  completed  95%    12.4s
def67890  data-exfiltration        simulation  running    -      -
```

### `reports`

Fetch or download assessment reports.

```bash
# Get parsed report JSON
crucible-cli reports abc123

# Download the JSON file
crucible-cli reports abc123 --download json -o report.json

# Download the HTML report
crucible-cli reports abc123 --download html -o report.html

# Download the PDF
crucible-cli reports abc123 --download pdf -o report.pdf
```

If `-o` is omitted, the file is saved as `<id>-report.<ext>` in the current directory.

## CI integration

A typical GitHub Actions step:

```yaml
- name: Run Crucible assessment
  env:
    CRUCIBLE_URL: ${{ secrets.CRUCIBLE_URL }}
  run: |
    npx @atlascrew/crucible-cli assess production-smoke-test --fail-below 90
```

The command exits non-zero on any scenario failure, which fails the job. Use `--format json` and `jq` if you need to extract specific fields:

```bash
crucible-cli assess my-scenario --format json | jq '.results[0].score'
```

## Troubleshooting

**`Connection failed: could not reach server`** — the server is unreachable. Check that `CRUCIBLE_URL` (or `--server`) points to a running Crucible instance and the network allows the connection.

**`API error (404): Execution not found`** — the execution ID doesn't exist on the server. This can happen if you're querying a stale ID or pointing at the wrong server.

**`API error (409): Cannot pause execution in completed state`** — you can't control executions that have already reached a terminal state.

**Assessment hangs** — the default polling interval is 2 seconds. For long-running assessments, increase `--timeout` (global) and `--poll-interval` (assess-specific) as needed.

## Related

- [API Client Library](api-client.md) — the TypeScript library the CLI uses internally
- [Running Scenarios](running-scenarios.md) — using the web UI
- [System Overview](../architecture/system-overview.md) — the REST endpoints and WebSocket protocol
