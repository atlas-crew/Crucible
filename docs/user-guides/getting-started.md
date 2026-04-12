# Getting Started

This guide walks you through installing and running Crucible. Choose the method that fits your needs — npm and Docker are the fastest paths; source installs give you the full development environment. If you already have a Crucible server running and just want to talk to it from code or the terminal, skip to [Option D](#option-d-api-client-library) or [Option E](#option-e-remote-cli).

## Option A: Install the server from npm (recommended)

Requires **Node.js 22+**.

```bash
npm install -g @atlascrew/crucible
crucible start
```

Open **http://localhost:3000**. The UI, REST API, and WebSocket endpoint are all served from a single process on one port.

### Configuration

Customize the runtime with environment variables:

```bash
PORT=8080 \
CRUCIBLE_TARGET_URL=https://api.example.com \
crucible start
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `CRUCIBLE_DB_PATH` | `./data/crucible.db` | SQLite database location |
| `CRUCIBLE_REPORTS_DIR` | `./data/reports` | Assessment report output directory |
| `CRUCIBLE_TARGET_URL` | — | Base URL of the system under test |
| `CRUCIBLE_SCENARIOS_DIR` | *(built-in catalog)* | Path to a custom scenarios directory |
| `CRUCIBLE_MAX_CONCURRENCY` | `3` | Max concurrent scenario executions |

---

## Option B: Run the server with Docker

```bash
docker run -p 3000:3000 nickcrew/crucible:latest
```

Open **http://localhost:3000**. Same unified server as the npm package.

Pass environment variables with `-e`:

```bash
docker run -p 8080:8080 \
  -e PORT=8080 \
  -e CRUCIBLE_TARGET_URL=https://api.example.com \
  -v crucible-data:/app/data \
  nickcrew/crucible:latest
```

Available tags: `latest`, `0.2`, `0.2.4`, `sha-<commit>`.

---

## Option C: Run the server from source

Use this option when you want to develop Crucible itself or need fine-grained control over individual components.

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 22+ |
| pnpm | 9.15.4 |

Enable pnpm via Corepack (reads the `packageManager` field from root `package.json`):

```bash
corepack enable
```

### 1. Clone and install

```bash
git clone https://github.com/atlas-crew/Crucible.git
cd Crucible
pnpm install
```

### 2. Build all packages

```bash
pnpm build
```

This builds three projects via Nx:

1. **@crucible/catalog** — compiles the scenario type library
2. **demo-dashboard** — compiles the execution engine
3. **web-client** — produces a Next.js standalone build

### 3. Start the backend

```bash
pnpm --filter @crucible/demo-dashboard dev
```

The scenario engine starts on **http://localhost:3001** with:
- REST API at `/api/*`
- WebSocket server on the same port
- All scenarios from `packages/catalog/scenarios/` loaded into memory

### 4. Start the web client

In a second terminal:

```bash
pnpm --filter web-client dev
```

The UI opens at **http://localhost:3000**. It connects to the backend via WebSocket for real-time execution updates.

### 5. Verify the connection

Look at the top-right corner of the web UI. You should see a green **CONNECTED** indicator. If it shows **OFFLINE**, confirm the backend is running on port 3001.

> **Note**: In development mode the frontend and backend run on separate ports. Use `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` to point the frontend at a different backend.

---

## Option D: API Client Library

If you already have a Crucible server running and want to call it from a TypeScript or JavaScript application:

```bash
npm install @atlascrew/crucible-client
```

```typescript
import { CrucibleClient } from '@atlascrew/crucible-client';

const client = new CrucibleClient({ baseUrl: 'http://localhost:3000' });
const scenarios = await client.scenarios.list();
const { executionId } = await client.assessments.start('my-scenario');
```

Zero runtime dependencies — works in Node 22+ and modern browsers. See the [API Client Library](api-client.md) guide for the full reference.

---

## Option E: Remote CLI

For scripting and CI pipelines that target a running Crucible server:

```bash
npm install -g @atlascrew/crucible-cli
```

```bash
export CRUCIBLE_URL=http://localhost:3000
crucible-cli health
crucible-cli scenarios
crucible-cli assess my-scenario --fail-below 90
```

The CLI exits non-zero if any scenario falls below the threshold, making it easy to wire into CI. See the [CLI Reference](cli.md) guide for all commands and flags.

---

## Project Structure

```
crucible/
├── packages/crucible/         # @atlascrew/crucible — unified server package
├── packages/catalog/          # Scenario schemas, validation, JSON loader
│   ├── src/                   # TypeScript source
│   └── scenarios/             # 80+ pre-built scenario JSON files
├── apps/client/               # @atlascrew/crucible-client — typed API client library
├── apps/cli/                  # @atlascrew/crucible-cli — lightweight remote CLI
├── apps/web-client/           # Next.js UI (scenarios, simulations, assessments)
│   └── src/
│       ├── app/               # Pages (dashboard, scenarios, simulations, assessments)
│       ├── components/        # UI components and scenario editor
│       ├── store/             # Zustand state management
│       └── hooks/             # WebSocket hook
└── apps/demo-dashboard/       # Express + WebSocket execution engine
    └── src/server/
        ├── engine.ts          # Scenario execution engine
        ├── websocket.ts       # Real-time event broadcasting
        └── index.ts           # REST API routes
```

---

## What's Next

- [Running Scenarios](running-scenarios.md) — browse the catalog, launch simulations, review assessments
- [Editing Scenarios](editing-scenarios.md) — create custom scenarios in the visual editor
- [API Client Library](api-client.md) — integrate Crucible into TypeScript or JavaScript applications
- [CLI Reference](cli.md) — script assessments from the terminal or CI
