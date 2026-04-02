<p align="center">
  <img src="docs/assets/crucible-banner.png" alt="Crucible — Open-source attack simulation and compliance assessment engine" />
</p>

# Crucible

Next-generation security testing platform. Crucible provides a catalog of 80+ attack scenarios, a visual scenario editor, a real-time simulation engine, and pass/fail assessment scoring — all orchestrated through a web UI backed by WebSocket streaming.

## Key Features

- **Scenario Catalog** — 80+ pre-built security scenarios covering OWASP API Top 10, web attacks, business logic flaws, compliance checks, and more
- **Visual Editor** — create and modify scenarios with a form-based editor or raw JSON, with live validation
- **Real-time Simulations** — watch step-by-step execution with a live timeline, pause/resume/cancel controls, and variable extraction
- **Assessment Scoring** — run scenarios in assessment mode for a pass/fail verdict with percentage scoring
- **DAG Execution** — steps execute in dependency order with conditional branching, retries, and template variables

## Architecture

```
crucible/
├── packages/crucible       # @atlascrew/crucible — unified publishable package (npm + Docker)
├── packages/catalog        # @crucible/catalog — scenario schemas, validation, and loader
├── apps/web-client         # Next.js 16 web UI (scenarios, assessments, simulations)
└── apps/demo-dashboard     # Express + WebSocket simulation orchestrator
```

| Package | Stack | Description |
|---------|-------|-------------|
| `@atlascrew/crucible` | Express, Next.js, SQLite | Unified package — bundles the UI, API, engine, and scenario catalog into a single installable |
| `@crucible/catalog` | TypeScript, Zod | Scenario type definitions, JSON schema validation, runbook parser |
| `web-client` | Next.js 16, React 19, Tailwind 4, Radix UI | Primary web interface for browsing and editing scenarios |
| `@crucible/demo-dashboard` | Express, WebSocket | Real-time scenario execution engine with live dashboard |

## Installation

### npm (recommended)

```bash
npm install -g @atlascrew/crucible
crucible start
```

Open **http://localhost:3000**. The UI, REST API, and WebSocket endpoint are all served from a single process.

### Docker

```bash
docker run -p 3000:3000 nickcrew/crucible:latest
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `CRUCIBLE_DB_PATH` | `./data/crucible.db` | SQLite database location |
| `CRUCIBLE_REPORTS_DIR` | `./data/reports` | Assessment report output directory |
| `CRUCIBLE_TARGET_URL` | — | Base URL of the system under test |
| `CRUCIBLE_SCENARIOS_DIR` | *(built-in catalog)* | Path to a custom scenarios directory |
| `CRUCIBLE_MAX_CONCURRENCY` | `3` | Max concurrent scenario executions |

## Development

### Prerequisites

- **Node.js** 22+
- **pnpm** 9.15.4 (activated via `corepack enable`)

### Run from source

```bash
git clone https://github.com/NickCrew/Crucible.git
cd Crucible
pnpm install
pnpm build
```

Start the backend and frontend in separate terminals:

```bash
# Backend — scenario engine + REST API + WebSocket (port 3001)
pnpm --filter @crucible/demo-dashboard dev

# Frontend — web UI (port 3000)
pnpm --filter web-client dev
```

Open **http://localhost:3000** and verify the **CONNECTED** indicator appears in the header.

> **Note**: In development mode the frontend and backend run on separate ports. The environment variables `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` configure the frontend to reach the backend (defaults to `localhost:3001`).

## Documentation

### User Guides

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/user-guides/getting-started.md) | Install, configure, and launch Crucible |
| [Running Scenarios](docs/user-guides/running-scenarios.md) | Browse the catalog, run simulations, and review assessments |
| [Editing Scenarios](docs/user-guides/editing-scenarios.md) | Create and modify scenario definitions |

### Architecture

| Document | Description |
|----------|-------------|
| [System Overview](docs/architecture/system-overview.md) | Component map, data flow diagrams, and communication protocols |
| [Scenario Engine](docs/architecture/scenario-engine.md) | DAG scheduling, step execution, assertions, and WebSocket events |

### Development

| Document | Description |
|----------|-------------|
| [Testing Guide](docs/development/testing/testing-guide.md) | Test infrastructure, conventions, and coverage breakdown |

See the full [Documentation Navigator](docs/NAVIGATOR.md) for all available docs.

## CI/CD

### Pull Request Checks

Every PR to `main` runs build, type-check, and test via [GitHub Actions](.github/workflows/ci.yml).

### Package And Docker Release

Pushing a semver tag that matches `packages/crucible/package.json` triggers npm and Docker publishing:

```bash
git tag v0.2.0
git push origin v0.2.0
```

This publishes `@atlascrew/crucible` to npmjs and `nickcrew/crucible` to Docker Hub with tags derived from the version (for example `0.2.0`, `0.2`, and `latest`). The release workflow expects `NPM_TOKEN`, `DOCKERHUB_USERNAME`, and `DOCKERHUB_TOKEN` repository secrets.

## Project Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages (Nx orchestrated) |
| `pnpm build:release` | Build the publishable `@atlascrew/crucible` package |
| `pnpm test` | Run all test suites |
| `pnpm type-check` | TypeScript type checking across all packages |
| `pnpm lint` | Lint all packages |
