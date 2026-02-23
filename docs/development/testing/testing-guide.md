# Testing Guide

This document covers the test infrastructure, conventions, and execution workflow for the Crucible monorepo.

## Quick Reference

```bash
# Run all tests across the monorepo
pnpm test

# Run tests for a single package
pnpm --filter @crucible/catalog test
pnpm --filter @crucible/demo-dashboard test
pnpm --filter web-client test

# Watch mode (re-runs on file changes)
pnpm --filter @crucible/catalog test:watch
pnpm --filter @crucible/demo-dashboard test:watch
pnpm --filter web-client test:watch

# Run a specific test file
cd apps/demo-dashboard && npx vitest run src/__tests__/engine.test.ts
```

## Stack

| Tool | Version | Purpose |
|------|---------|---------|
| [Vitest](https://vitest.dev) | 3.2.4 | Test runner and assertion library |
| [Nx](https://nx.dev) | 21.6.4 | Monorepo task orchestration with caching |
| [@testing-library/react](https://testing-library.com/docs/react-testing-library/intro) | 16.3.2 | React component testing (web-client) |
| [@testing-library/jest-dom](https://github.com/testing-library/jest-dom) | 6.9.1 | DOM assertion matchers (web-client) |
| [jsdom](https://github.com/jsdom/jsdom) | 28.1.0 | Browser environment simulation (web-client) |

## Project Structure

Tests live in `__tests__/` directories adjacent to the source code they cover:

```
packages/catalog/src/
  adapters/__tests__/
    runbook-parser.test.ts          # Markdown/YAML parsing
  models/__tests__/
    types.test.ts                   # Zod schema validation
    runbook-types.test.ts           # Runbook Zod schemas
  service/__tests__/
    catalog-service.test.ts         # Service layer + query methods
  validation/__tests__/
    scenario-validator.test.ts      # DAG validation + cycle detection

apps/demo-dashboard/src/
  __tests__/
    engine.test.ts                  # ScenarioEngine (core execution)
    websocket.test.ts               # WebSocket message handling

apps/web-client/src/
  app/scenarios/__tests__/
    page.test.tsx                   # ScenariosPage (search, filter, dialog)
  components/scenario-editor/__tests__/
    scenario-editor-tab.test.tsx    # Prototype pollution filtering
    tag-input.test.tsx              # TagInput keyboard/click behavior
  hooks/__tests__/
    useWebSocket.test.ts            # WebSocket hook lifecycle
  lib/__tests__/
    utils.test.ts                   # cn() utility
  store/__tests__/
    useCatalogStore.test.ts         # Zustand store operations
```

## Vitest Configuration

Each package has its own `vitest.config.ts`. All share `globals: true` so `describe`, `it`, `expect`, `vi`, etc. are available without imports.

### Server packages (`catalog`, `demo-dashboard`)

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

### Web client (`web-client`)

Uses jsdom for DOM simulation, the React plugin for JSX transforms, and a setup file for Next.js mocks:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: true,
  },
});
```

The `@` alias mirrors the Next.js `tsconfig.json` path so imports like `@/store/useCatalogStore` resolve correctly in tests.

### Setup file (`web-client/vitest.setup.ts`)

Registers `@testing-library/jest-dom` matchers and mocks Next.js modules that don't exist in jsdom:

```ts
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(),
    back: vi.fn(), forward: vi.fn(), refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => props,
}));
```

## Nx Caching

`pnpm test` delegates to `nx run-many --target=test --all`. Nx caches test results based on source file hashes. If no files changed, tests replay from cache instantly.

To force a fresh run (bypass cache):

```bash
npx nx run-many --target=test --all --skip-nx-cache
```

If you see a stale failure after fixing a file, this is usually an Nx cache artifact. Running the package directly (`npx vitest run` inside the package directory) updates the cache.

## Writing Tests

### Naming Conventions

- Test files: `<module-name>.test.ts` or `<component-name>.test.tsx`
- Test directories: `__tests__/` adjacent to the source module
- Describe blocks: match the module or class name
- Test names: describe the behavior, not the method (`'skips step when condition is not met'` not `'test evaluateWhen'`)

### Mocking Patterns

#### Global fetch (server packages)

```ts
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

function mockResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  const headerMap = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
      forEach: (cb: (v: string, k: string) => void) => headerMap.forEach((v, k) => cb(v, k)),
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  };
}
```

#### Zustand store (web-client)

Zustand stores are testable without React rendering. Import the store, call actions directly, and assert state:

```ts
import { useCatalogStore } from '../useCatalogStore';

beforeEach(() => {
  useCatalogStore.setState({ scenarios: [], error: null, isLoading: false });
});

it('fetches and sets scenarios', async () => {
  mockFetch.mockResolvedValueOnce(mockJsonResponse(200, [{ id: 'a', name: 'Alpha', steps: [] }]));
  await useCatalogStore.getState().fetchScenarios();
  expect(useCatalogStore.getState().scenarios).toHaveLength(1);
});
```

#### React components (web-client)

Use `@testing-library/react` with `vi.mock()` to isolate dependencies:

```ts
import { render, screen, fireEvent } from '@testing-library/react';

// Mock child components to keep tests focused
vi.mock('../sub-component', () => ({
  SubComponent: ({ data }: any) => <div data-testid="sub">{data}</div>,
}));

// Mock the store
vi.mock('@/store/useCatalogStore', () => ({
  useCatalogStore: () => ({ scenarios: mockScenarios, fetchScenarios: vi.fn() }),
}));
```

#### React hooks (web-client)

Use `renderHook` from `@testing-library/react`:

```ts
import { renderHook, act } from '@testing-library/react';

it('connects on mount', () => {
  renderHook(() => useWebSocket());
  expect(MockWebSocket.instances).toHaveLength(1);
});
```

#### Fake timers (engine async tests)

The ScenarioEngine uses timers for delays, reconnects, and cleanup. Use Vitest's fake timer API:

```ts
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

// In tests:
await vi.advanceTimersByTimeAsync(3500);
```

The `shouldAdvanceTime: true` option allows `Date.now()` to advance with fake timers, which the engine relies on for timestamps.

### EventEmitter-based testing (ScenarioEngine)

The engine emits events for lifecycle changes. Use a promise-based helper to wait for them:

```ts
function waitForEvent(engine: ScenarioEngine, event: string, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
    engine.once(event, (data: any) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

// Usage:
const done = waitForEvent(engine, 'execution:completed');
await engine.startScenario('my-scenario');
const execution = await done;
expect(execution.status).toBe('completed');
```

### Deferred fetch pattern (concurrency/pause tests)

For tests that need to control when a fetch resolves, use the deferred resolver pattern:

```ts
let resolvers: Array<(v: any) => void> = [];
mockFetch.mockImplementation(() =>
  new Promise((resolve) => {
    resolvers.push(() => resolve(mockResponse(200, 'ok')));
  }),
);

// Start execution — fetch is now in-flight
await engine.startScenario('test');
await vi.advanceTimersByTimeAsync(10);

// Manually resolve the fetch when ready
resolvers[0](undefined);
```

This pattern is essential for testing pause/resume, cancel, and concurrency behavior where you need precise control over when async operations complete.

## Test Coverage by Domain

### Catalog (`packages/catalog`) — 73 tests

| Area | Tests | What's covered |
|------|-------|----------------|
| Zod schemas | 30 | ScenarioSchema, RequestSchema, ExecutionConfigSchema, ExtractRuleSchema, RunbookFrontmatterSchema, RunbookStepSchema, enums |
| Scenario validator | 11 | DAG cycle detection, missing references, template variable warnings |
| Runbook parser | 20 | Frontmatter parsing, title extraction, slugify, step/substep parsing, phase headings |
| CatalogService | 12 | Constructor loading, schema validation, file I/O, query methods |

### Demo Dashboard (`apps/demo-dashboard`) — 68 tests

| Area | Tests | What's covered |
|------|-------|----------------|
| Assertions | 11 | status, blocked, bodyContains, bodyNotContains, headerPresent, headerEquals, multi-assertion |
| Extract rules | 5 | body JSON path, header, status, missing path, multi-source |
| Template variables | 4 | `{{random}}`, `{{random_ip}}`, `{{timestamp}}`, all-location resolution |
| Conditionals | 5 | `when.succeeded` (positive/negative), `when.status`, missing ref step |
| Context resolution | 1 | Variable extraction and cross-step resolution |
| Retries | 2 | Success on last attempt, exhausted retries |
| Concurrency | 2 | Semaphore limit, queued execution start |
| Pause/Resume | 2 | Pause preserves state, resume completes execution |
| Cancel | 3 | Running cancel, paused cancel, AbortSignal propagation |
| Restart | 2 | New execution with parent ID, cancel-before-restart |
| Cleanup | 2 | TTL eviction, max-count eviction |
| Global controls | 6 | pauseAll, resumeAll, cancelAll (count + state verification) |
| Deadlock detection | 4 | Circular, self-dep, deep chain, valid chain |
| Step execution | 5 | Iterations, delay timing, unknown scenario, destroy(), abort propagation |
| WebSocket | 9 | Invalid JSON, unknown commands, missing payloads, broadcast filtering |
| Assessment | 5 | 100%/mixed/0% scoring, skipped steps, simulation-only guard |

### Web Client (`apps/web-client`) — 48 tests

| Area | Tests | What's covered |
|------|-------|----------------|
| useCatalogStore | 15 | Initial state, fetch, error handling, execution CRUD, simulation start, pause |
| useWebSocket | 7 | Connect, open/close state, message dispatch, malformed JSON, reconnect, cleanup |
| cn() utility | 5 | Merging, conditionals, Tailwind conflicts, empty inputs, arrays |
| ScenarioEditorTab | 4 | Prototype pollution filtering (`__proto__`, `constructor`, `prototype`), safe key preservation |
| TagInput | 7 | Enter/blur add, trim, duplicates, remove, backspace edit, empty prevention |
| ScenariosPage | 10 | Mount fetch, render, search (name/category/tag), empty state, skeletons, dialog, simulate/assess buttons |

**Total: 189 tests across 13 test files.**

## Troubleshooting

### Tests pass individually but fail via `pnpm test`

Nx caches results per-project. If a previous run failed and you've since fixed the code, the cache may still hold the failure. Run with `--skip-nx-cache` or run the package directly to update the cache.

### `web-client` tests fail with "Cannot find module" for `@/...` imports

The `@` path alias must be configured in both `tsconfig.json` and `vitest.config.ts`. Ensure the vitest config has:

```ts
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
  },
},
```

### `next/navigation` or `next/image` errors in tests

These are mocked in `vitest.setup.ts`. If you see errors about these modules, verify the setup file is listed in vitest config:

```ts
test: {
  setupFiles: ['./vitest.setup.ts'],
}
```

### Fake timer tests hang or timeout

When using `vi.useFakeTimers()`, always call `vi.useRealTimers()` in `afterEach`. For async operations with fake timers, use `vi.advanceTimersByTimeAsync()` (not `vi.advanceTimersByTime()`) and `await` the result.

### `--passWithNoTests` flag on web-client

The web-client's test script includes `--passWithNoTests` so that `pnpm test` succeeds even if test files are temporarily removed during refactoring. This is intentional — remove the flag if you want strict enforcement.
