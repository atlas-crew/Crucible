import type { Scenario, ScenarioExecution } from './types.js';
import { CrucibleApiError, CrucibleClientValidationError } from './errors.js';
import { CrucibleSocket } from './socket.js';
import type {
  AssessmentResponse,
  AssessmentStartOptions,
  BulkActionResponse,
  CrucibleClientOptions,
  CrucibleSocketOptions,
  GetReportOptions,
  HealthResponse,
  ListExecutionsParams,
  OkResponse,
  RestartResponse,
  SimulationResponse,
  SimulationStartOptions,
} from './types.js';

function stripUndefinedValues<T extends Record<string, unknown>>(value: T | undefined): Partial<T> | undefined {
  if (!value) {
    return undefined;
  }

  const definedEntries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
  return definedEntries.length > 0 ? Object.fromEntries(definedEntries) as Partial<T> : undefined;
}

/**
 * Typed client for the Crucible REST API.
 *
 * ```ts
 * const client = new CrucibleClient({ baseUrl: 'http://localhost:3000' });
 * const scenarios = await client.scenarios.list();
 * ```
 */
export class CrucibleClient {
  private readonly baseUrl: string;
  private readonly apiBase: string;
  private readonly headers: Record<string, string>;
  private readonly _fetch: typeof globalThis.fetch;
  private readonly timeout: number | undefined;

  readonly scenarios: ScenariosNamespace;
  readonly executions: ExecutionsNamespace;
  readonly simulations: SimulationsNamespace;
  readonly assessments: AssessmentsNamespace;
  readonly reports: ReportsNamespace;

  constructor(options: CrucibleClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiBase = `${this.baseUrl}/api`;
    this.headers = options.headers ?? {};
    this._fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeout = options.timeout;

    this.scenarios = new ScenariosNamespace(this);
    this.executions = new ExecutionsNamespace(this);
    this.simulations = new SimulationsNamespace(this);
    this.assessments = new AssessmentsNamespace(this);
    this.reports = new ReportsNamespace(this);
  }

  /** Check server health. */
  async health(): Promise<HealthResponse> {
    return this.get(`${this.baseUrl}/health`);
  }

  /** Open a WebSocket connection to the server. */
  connect(options?: CrucibleSocketOptions): CrucibleSocket {
    const wsUrl = options?.url ?? this.baseUrl.replace(/^http/, 'ws');
    return new CrucibleSocket({ ...options, url: wsUrl });
  }

  // ── Internal HTTP helpers ───────────────────────────────────────────

  /** @internal */ async get<T>(url: string): Promise<T> {
    return this.request('GET', url);
  }

  /** @internal */ async post<T>(url: string, body?: unknown): Promise<T> {
    return this.request('POST', url, body);
  }

  /** @internal */ async put<T>(url: string, body?: unknown): Promise<T> {
    return this.request('PUT', url, body);
  }

  /** @internal */ async fetchRaw(url: string): Promise<Response> {
    const res = await this._fetch(url, {
      headers: this.headers,
      signal: this.timeout != null ? AbortSignal.timeout(this.timeout) : undefined,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => undefined) as { error: string } | undefined;
      throw new CrucibleApiError(res.status, res.statusText, body);
    }
    return res;
  }

  /** @internal */ get api(): string {
    return this.apiBase;
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const init: RequestInit = {
      method,
      headers: {
        ...this.headers,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: this.timeout != null ? AbortSignal.timeout(this.timeout) : undefined,
    };

    const res = await this._fetch(url, init);
    if (!res.ok) {
      const errorBody = await res.json().catch(() => undefined) as { error: string } | undefined;
      throw new CrucibleApiError(res.status, res.statusText, errorBody);
    }
    return res.json() as Promise<T>;
  }
}

// ── Namespaces ────────────────────────────────────────────────────────

class ScenariosNamespace {
  constructor(private client: CrucibleClient) {}

  /** List all scenarios. */
  async list(): Promise<Scenario[]> {
    return this.client.get(`${this.client.api}/scenarios`);
  }

  /** Update a scenario by ID. */
  async update(id: string, data: Scenario): Promise<Scenario> {
    return this.client.put(`${this.client.api}/scenarios/${encodeURIComponent(id)}`, data);
  }
}

class ExecutionsNamespace {
  constructor(private client: CrucibleClient) {}

  /** List executions with optional filters. */
  async list(params?: ListExecutionsParams): Promise<ScenarioExecution[]> {
    const url = new URL(`${this.client.api}/executions`);
    if (params) {
      if (params.scenarioId) url.searchParams.set('scenarioId', params.scenarioId);
      if (params.status) {
        const statusValue = Array.isArray(params.status) ? params.status.join(',') : params.status;
        url.searchParams.set('status', statusValue);
      }
      if (params.mode) url.searchParams.set('mode', params.mode);
      if (params.since != null) url.searchParams.set('since', String(params.since));
      if (params.until != null) url.searchParams.set('until', String(params.until));
      if (params.limit != null) url.searchParams.set('limit', String(params.limit));
      if (params.offset != null) url.searchParams.set('offset', String(params.offset));
    }
    return this.client.get(url.toString());
  }

  /** Get a single execution by ID. */
  async get(id: string): Promise<ScenarioExecution> {
    return this.client.get(`${this.client.api}/executions/${encodeURIComponent(id)}`);
  }

  /** Pause an execution. */
  async pause(id: string): Promise<OkResponse> {
    return this.client.post(`${this.client.api}/executions/${encodeURIComponent(id)}/pause`);
  }

  /** Resume a paused execution. */
  async resume(id: string): Promise<OkResponse> {
    return this.client.post(`${this.client.api}/executions/${encodeURIComponent(id)}/resume`);
  }

  /** Cancel an execution. */
  async cancel(id: string): Promise<OkResponse> {
    return this.client.post(`${this.client.api}/executions/${encodeURIComponent(id)}/cancel`);
  }

  /** Restart an execution. Returns the new execution ID. */
  async restart(id: string): Promise<RestartResponse> {
    return this.client.post(`${this.client.api}/executions/${encodeURIComponent(id)}/restart`);
  }

  /** Pause all running executions. */
  async pauseAll(): Promise<BulkActionResponse> {
    return this.client.post(`${this.client.api}/executions/pause-all`);
  }

  /** Resume all paused executions. */
  async resumeAll(): Promise<BulkActionResponse> {
    return this.client.post(`${this.client.api}/executions/resume-all`);
  }

  /** Cancel all active executions. */
  async cancelAll(): Promise<BulkActionResponse> {
    return this.client.post(`${this.client.api}/executions/cancel-all`);
  }
}

class SimulationsNamespace {
  constructor(private client: CrucibleClient) {}

  /**
   * Start a simulation for a scenario.
   * Deprecated top-level expectWafBlocking may be used during the migration window,
   * but it cannot be combined with triggerData.expectWafBlocking.
   */
  async start(scenarioId: string, options?: SimulationStartOptions): Promise<SimulationResponse> {
    const payload: Record<string, unknown> = { scenarioId };
    if (options && 'targetUrl' in options) {
      payload.targetUrl = options.targetUrl;
    }

    if (options) {
      const nestedTriggerData = stripUndefinedValues(options.triggerData);
      if (
        options.expectWafBlocking !== undefined
        && nestedTriggerData?.expectWafBlocking !== undefined
      ) {
        throw new CrucibleClientValidationError(
          'Cannot pass expectWafBlocking both at the top level and under triggerData.',
        );
      }
      const mergedTriggerData =
        options.expectWafBlocking !== undefined || nestedTriggerData
          ? {
              ...(options.expectWafBlocking !== undefined ? { expectWafBlocking: options.expectWafBlocking } : {}),
              ...(nestedTriggerData ?? {}),
            }
          : undefined;

      if (mergedTriggerData && Object.keys(mergedTriggerData).length > 0) {
        payload.triggerData = mergedTriggerData;
      }
    }

    return this.client.post(`${this.client.api}/simulations`, payload);
  }
}

class AssessmentsNamespace {
  constructor(private client: CrucibleClient) {}

  /** Start an assessment for a scenario. */
  async start(scenarioId: string, options?: AssessmentStartOptions): Promise<AssessmentResponse> {
    return this.client.post(`${this.client.api}/assessments`, {
      scenarioId,
      ...(options && 'targetUrl' in options ? { targetUrl: options.targetUrl } : {}),
      ...(options?.triggerData ? { triggerData: options.triggerData } : {}),
    });
  }
}

class ReportsNamespace {
  constructor(private client: CrucibleClient) {}

  /** Get a report. Returns the report object or execution if still generating (202). */
  async get(id: string, options?: GetReportOptions): Promise<ScenarioExecution> {
    const url = new URL(`${this.client.api}/reports/${encodeURIComponent(id)}`);
    if (options?.format) url.searchParams.set('format', options.format);
    return this.client.get(url.toString());
  }

  /** Download the JSON report file. */
  async json(id: string): Promise<Response> {
    return this.client.fetchRaw(`${this.client.api}/reports/${encodeURIComponent(id)}/json`);
  }

  /** Download the HTML report file. */
  async html(id: string): Promise<Response> {
    return this.client.fetchRaw(`${this.client.api}/reports/${encodeURIComponent(id)}/html`);
  }

  /** Download the PDF report file. */
  async pdf(id: string): Promise<Response> {
    return this.client.fetchRaw(`${this.client.api}/reports/${encodeURIComponent(id)}/pdf`);
  }
}
