# Getting Started

This guide walks you through installing and running Crucible locally.

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 22+ |
| pnpm | 9.15.4 |
| Docker *(optional)* | 20+ |

### Enable pnpm via Corepack

Node.js ships with Corepack, which can activate the correct pnpm version automatically:

```bash
corepack enable
```

Corepack reads the `packageManager` field in the root `package.json` and installs `pnpm@9.15.4` on first use.

---

## Option A: Run from Source

### 1. Clone and install

```bash
git clone https://github.com/NickCrew/Crucible.git
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

---

## Option B: Run with Docker

If you only need the web client (no live backend):

```bash
docker run -p 3000:3000 ghcr.io/nickcrew/crucible/web-client:latest
```

Open **http://localhost:3000**.

> **Note**: The Docker image contains only the web client. To run simulations and assessments, you also need the backend running (Option A, steps 3-4) or a deployed instance of the demo-dashboard.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Backend server port |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001/api` | Backend API URL (used by web client) |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:3001` | WebSocket URL (used by web client) |
| `CRUCIBLE_MAX_CONCURRENCY` | `3` | Max concurrent scenario executions |

To point the web client at a different backend:

```bash
NEXT_PUBLIC_API_URL=http://my-server:3001/api \
NEXT_PUBLIC_WS_URL=ws://my-server:3001 \
pnpm --filter web-client dev
```

---

## Project Structure

```
crucible/
├── packages/catalog/          # Scenario schemas, validation, JSON loader
│   ├── src/                   # TypeScript source
│   └── scenarios/             # 80+ pre-built scenario JSON files
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
