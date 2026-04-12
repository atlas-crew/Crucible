# API Client Library

`@atlascrew/crucible-client` is a typed TypeScript client for the Crucible REST and WebSocket APIs. It wraps every endpoint with a strongly-typed method, handles errors consistently, and provides a typed WebSocket client with auto-reconnect.

## Why use the client library?

- **Typed end-to-end** — every request and response has a TypeScript interface
- **Zero runtime dependencies** — uses native `fetch` and `WebSocket` (Node 22+)
- **Namespaced methods** that mirror REST resources (`client.scenarios.list()`, `client.executions.pause(id)`)
- **Structured error handling** via `CrucibleApiError` with status codes
- **Typed WebSocket events** with auto-reconnect and jittered backoff

## Installation

```bash
npm install @atlascrew/crucible-client
```

Requires **Node.js 22+** or a modern browser environment.

## Quick start

```typescript
import { CrucibleClient } from '@atlascrew/crucible-client';

const client = new CrucibleClient({
  baseUrl: 'http://localhost:3000',
});

// List all scenarios
const scenarios = await client.scenarios.list();

// Start an assessment
const { executionId } = await client.assessments.start('owasp-api-1-broken-auth');

// Poll until it finishes
let execution = await client.executions.get(executionId);
while (execution.status === 'running' || execution.status === 'pending') {
  await new Promise((r) => setTimeout(r, 2000));
  execution = await client.executions.get(executionId);
}

console.log('Score:', execution.report?.score);
```

## Client options

```typescript
const client = new CrucibleClient({
  baseUrl: 'http://localhost:3000',      // Required
  headers: { Authorization: 'Bearer ...' }, // Optional — sent with every request
  timeout: 30_000,                        // Optional — ms before AbortSignal triggers
  fetch: customFetch,                     // Optional — for testing/custom transports
});
```

## REST API reference

All methods return `Promise<T>` and throw `CrucibleApiError` on non-2xx responses.

### Health

```typescript
await client.health();
// → { status, timestamp, scenarios, targetUrl }
```

### Scenarios

```typescript
await client.scenarios.list();
// → Scenario[]

await client.scenarios.update(id, scenarioData);
// → Scenario
```

### Executions

```typescript
// List with optional filters
await client.executions.list({
  scenarioId: 'my-scenario',
  status: ['running', 'completed'],  // array or single value
  mode: 'assessment',                 // 'simulation' | 'assessment'
  since: Date.now() - 86400000,       // ms timestamp
  until: Date.now(),
  limit: 50,
  offset: 0,
});
// → ScenarioExecution[]

await client.executions.get(id);
// → ScenarioExecution

// Control individual executions
await client.executions.pause(id);     // → { ok: true }
await client.executions.resume(id);    // → { ok: true }
await client.executions.cancel(id);    // → { ok: true }
await client.executions.restart(id);   // → { executionId: string }  (new ID)

// Bulk control
await client.executions.pauseAll();    // → { count: number }
await client.executions.resumeAll();   // → { count: number }
await client.executions.cancelAll();   // → { count: number }
```

### Simulations and Assessments

```typescript
// Simulation mode: runs the scenario without scoring
await client.simulations.start('my-scenario', { /* optional trigger data */ });
// → { executionId, mode: 'simulation', wsUrl }

// Assessment mode: runs and scores pass/fail
await client.assessments.start('my-scenario', { /* optional trigger data */ });
// → { executionId, mode: 'assessment', reportUrl }
```

### Reports

```typescript
// Get the parsed report object
await client.reports.get(id);
// → ScenarioExecution (with .report field populated)

// Download report files as Response objects (for streaming/saving)
const jsonRes = await client.reports.json(id);
const htmlRes = await client.reports.html(id);
const pdfRes = await client.reports.pdf(id);

// Save a PDF to disk
import { writeFile } from 'node:fs/promises';
const buffer = Buffer.from(await pdfRes.arrayBuffer());
await writeFile('report.pdf', buffer);
```

## Error handling

Every non-2xx response throws a `CrucibleApiError`:

```typescript
import { CrucibleApiError } from '@atlascrew/crucible-client';

try {
  await client.executions.pause('non-existent');
} catch (error) {
  if (error instanceof CrucibleApiError) {
    console.log(error.status);      // 404
    console.log(error.statusText);  // "Not Found"
    console.log(error.message);     // "Execution not found"
    console.log(error.body);        // { error: "Execution not found" }
  }
}
```

Common status codes:

| Status | Meaning |
|--------|---------|
| `400` | Invalid request (bad query params, invalid scenario data) |
| `404` | Execution or scenario not found |
| `409` | Invalid state transition (e.g. pausing a completed execution) |
| `500` | Server error |

## WebSocket events

The client library ships with a typed WebSocket wrapper:

```typescript
const socket = client.connect();

// Typed event subscription — returns an unsubscribe function
const unsub = socket.on('execution:completed', (execution) => {
  console.log('Finished:', execution.id, 'score:', execution.report?.score);
});

// All event types
socket.on('execution:started', (exec) => { /* ... */ });
socket.on('execution:updated', (exec) => { /* ... */ });
socket.on('execution:completed', (exec) => { /* ... */ });
socket.on('execution:failed', (exec) => { /* ... */ });
socket.on('execution:paused', (exec) => { /* ... */ });
socket.on('execution:cancelled', (exec) => { /* ... */ });
socket.on('execution:resumed', (exec) => { /* ... */ });
socket.on('execution:delta', (delta) => { /* partial update */ });
socket.on('status:update', (exec) => { /* snapshot on connect */ });
socket.on('terminal:output', ({ executionId, data }) => { /* ... */ });

// Connection lifecycle
socket.on('open', () => console.log('connected'));
socket.on('close', ({ code, reason }) => console.log('disconnected'));
socket.on('error', (event) => console.error(event));

// Send typed commands
const sent = socket.send({
  type: 'SCENARIO_START',
  payload: { scenarioId: 'my-scenario' },
});
// Returns true if sent, false if not connected

// Cleanup
unsub();          // remove a single listener
socket.close();   // disconnect and clear all listeners
```

### Socket options

```typescript
client.connect({
  url: 'ws://custom-host:3000',   // Default: derived from client's baseUrl
  minReconnectDelay: 1000,         // Default: 1s
  maxReconnectDelay: 30000,        // Default: 30s
  autoReconnect: true,             // Default: true
});
```

Reconnection uses exponential backoff with random jitter (50-100% of base delay) to prevent thundering-herd reconnects after server restarts.

## Streaming an assessment to completion

Combine REST and WebSocket for a full lifecycle:

```typescript
const client = new CrucibleClient({ baseUrl: 'http://localhost:3000' });
const socket = client.connect();

const { executionId } = await client.assessments.start('my-scenario');

await new Promise<void>((resolve, reject) => {
  socket.on('execution:completed', (exec) => {
    if (exec.id === executionId) resolve();
  });
  socket.on('execution:failed', (exec) => {
    if (exec.id === executionId) reject(new Error(exec.error));
  });
});

const report = await client.reports.get(executionId);
console.log('Final score:', report.report?.score);

socket.close();
```

## Related

- [CLI Reference](cli.md) — the `crucible-cli` tool uses this library internally
- [System Overview](../architecture/system-overview.md) — REST endpoint and WebSocket protocol details
