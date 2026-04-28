# @atlascrew/crucible-client

Typed TypeScript client for the [Crucible](https://crucible.atlascrew.dev) REST and WebSocket APIs.

- Strongly-typed methods that mirror the REST resource layout (`client.simulations.start(...)`, `client.executions.list(...)`, `client.reports.get(...)`)
- Native `fetch` and `WebSocket` (Node 22+ or modern browser) — zero runtime dependencies
- Structured error handling via `CrucibleApiError`
- Auto-reconnecting WebSocket helper with jittered backoff

## Install

```bash
npm install @atlascrew/crucible-client
```

## Usage

```ts
import { CrucibleClient } from '@atlascrew/crucible-client';

const client = new CrucibleClient({ baseUrl: 'http://localhost:3000' });

const { executionId } = await client.assessments.start('owasp-api-1-broken-auth');
const execution = await client.executions.get(executionId);
console.log(execution.status, execution.report?.score);
```

## Per-run target URL

By default, every scenario runs against the engine's configured target (`CRUCIBLE_TARGET_URL` server-side). You can override the target on a per-run basis by passing `targetUrl` to `simulations.start()` or `assessments.start()`. This is the typical way to reuse a single Crucible deployment across multiple environments — e.g. running the same scenario against staging today and prod tomorrow from the same CI job.

```ts
const client = new CrucibleClient({ baseUrl: 'https://crucible.internal' });

// Same scenario, two environments — one Crucible deployment.
await client.simulations.start('advanced-sqli-campaign', {
  targetUrl: 'https://staging.example.com',
});

await client.simulations.start('advanced-sqli-campaign', {
  targetUrl: 'https://prod.example.com',
});
```

Notes:

- `targetUrl` must be an absolute `http`/`https` URL with no embedded credentials and no fragment. The server validates and returns `400` with a descriptive error on bad input.
- Omit the field to use the engine default. The client deliberately does **not** forward an empty `targetUrl` key — if you don't pass it, the server falls back to its own default.
- Restart inherits the originating execution's target. `client.executions.restart(id)` does not take a `targetUrl` argument; it replays against whatever target the original run used. Start a new execution if you need a different target.
- The per-execution outbound SSRF allowlist is scoped to the override target, so two concurrent runs targeting different hosts cannot pivot off each other.

## Documentation

The full user guide lives at <https://crucible.atlascrew.dev/user-guides/api-client>. The REST endpoints are documented at <https://crucible.atlascrew.dev/reference/rest-api>.

## License

MIT
