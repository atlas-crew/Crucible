import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  type Request as ScenarioRequest,
  type Scenario,
  type ScenarioRunnerStep,
  getScenarioStepType,
  isScenarioHttpStep,
  isScenarioRunnerStep,
  resolveRule,
  type ResolvedRule,
} from '@crucible/catalog';
import type { ExecutionStepResult, ScenarioExecution } from '../shared/types.js';

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
]);

const SENSITIVE_KEY_MARKERS = [
  'token',
  'secret',
  'password',
  'cookie',
  'session',
  'apikey',
  'jwt',
  'authorization',
  'credential',
  'private',
  'key',
];

export interface ReportServiceConfig {
  reportsDir: string;
  baseUrl: string;
}

export interface FrameworkCompliance {
  name: string;
  passed: boolean;
  score: number;
  rules: ResolvedRule[];
}

export interface AssessmentReportPayload {
  generatedAt: string;
  execution: {
    id: string;
    scenarioId: string;
    mode: ScenarioExecution['mode'];
    status: ScenarioExecution['status'];
    targetUrl?: string;
    startedAt?: number;
    completedAt?: number;
    duration?: number;
    summary: string;
    passed: boolean;
    score: number;
  };
  scenario: {
    id: string;
    name: string;
    description?: string;
    category?: string;
    difficulty?: string;
    rule_ids?: string[];
  };
  compliance?: {
    frameworks: Record<string, FrameworkCompliance>;
  };
  exports: {
    json: string;
    html: string;
  };
  steps: Array<{
    id: string;
    name: string;
    type: 'http' | 'k6' | 'nuclei';
    request?: {
      method: ScenarioRequest['method'];
      url: string;
      params?: Record<string, string>;
      headers?: Record<string, string>;
      body?: unknown;
    };
    runner?: {
      type: ScenarioRunnerStep['type'];
      config: Record<string, unknown>;
    };
    executionMode?: Scenario['steps'][number]['executionMode'];
    parallelGroup?: Scenario['steps'][number]['parallelGroup'];
    status: ExecutionStepResult['status'];
    attempts: number;
    duration?: number;
    startedAt?: number;
    completedAt?: number;
    error?: string;
    assertions: NonNullable<ExecutionStepResult['assertions']>;
    result?: unknown;
    details?: ExecutionStepResult['details'];
  }>;
}

export class ReportService {
  private readonly reportsDir: string;
  private readonly baseUrl: string;
  private readonly locks: Map<string, Promise<void>> = new Map();

  static readonly HTML_SUFFIX = 'html';
  static readonly JSON_SUFFIX = 'json';

  constructor(config: ReportServiceConfig) {
    this.reportsDir = config.reportsDir;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.ensureDirectory();
  }

  private ensureDirectory() {
    mkdirSync(this.reportsDir, { recursive: true });
  }

  async generateReports(
    execution: ScenarioExecution,
    scenario: Scenario,
  ): Promise<{ jsonPath: string; htmlPath: string }> {
    while (this.locks.has(execution.id)) {
      await this.locks.get(execution.id);
    }

    const reportPromise = (async () => {
      const payload = this.buildReportPayload(execution, scenario);
      const jsonPath = await this.generateJsonReport(execution.id, payload);
      const htmlPath = await this.generateHtmlReport(execution.id, payload);
      return { jsonPath, htmlPath };
    })();

    this.locks.set(execution.id, reportPromise.then(() => {}).catch(() => {}));

    try {
      return await reportPromise;
    } finally {
      this.locks.delete(execution.id);
    }
  }

  private buildReportPayload(
    execution: ScenarioExecution,
    scenario: Scenario,
  ): AssessmentReportPayload {
    const jsonExport = `${this.baseUrl}/api/reports/${execution.id}?format=${ReportService.JSON_SUFFIX}`;
    const htmlExport = `${this.baseUrl}/api/reports/${execution.id}?format=${ReportService.HTML_SUFFIX}`;
    const stepResults = new Map(execution.steps.map((step) => [step.stepId, step]));

    const frameworks: Record<string, FrameworkCompliance> = {};
    if (scenario.rule_ids && scenario.rule_ids.length > 0) {
      for (const ruleId of scenario.rule_ids) {
        const resolved = resolveRule(ruleId);
        if (resolved) {
          if (!frameworks[resolved.framework]) {
            frameworks[resolved.framework] = {
              name: resolved.framework,
              // TODO: Compute per-framework pass/score based on rule-level results.
              // Currently reflecting overall scenario status.
              passed: execution.report?.passed ?? false,
              score: execution.report?.score ?? 0,
              rules: [],
            };
          }
          frameworks[resolved.framework].rules.push(resolved);
        }
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      execution: {
        id: execution.id,
        scenarioId: execution.scenarioId,
        mode: execution.mode,
        status: execution.status,
        targetUrl: execution.targetUrl,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        duration: execution.duration,
        summary: execution.report?.summary ?? 'No summary available.',
        passed: execution.report?.passed ?? false,
        score: execution.report?.score ?? 0,
      },
      scenario: {
        id: scenario.id,
        name: scenario.name,
        description: scenario.description,
        category: scenario.category,
        difficulty: scenario.difficulty,
        rule_ids: scenario.rule_ids,
      },
      compliance: Object.keys(frameworks).length > 0 ? { frameworks } : undefined,
      exports: {
        json: jsonExport,
        html: htmlExport,
      },
      steps: scenario.steps.map((definition) => {
        const result = stepResults.get(definition.id);

        return {
          id: definition.id,
          name: definition.name,
          type: getScenarioStepType(definition),
          request: isScenarioHttpStep(definition) ? sanitizeRequest(definition.request) : undefined,
          runner: isScenarioRunnerStep(definition)
            ? {
                type: definition.type,
                config: sanitizeRunnerConfig(definition),
              }
            : undefined,
          executionMode: definition.executionMode,
          parallelGroup: definition.parallelGroup,
          status: result?.status ?? 'pending',
          attempts: result?.attempts ?? 0,
          duration: result?.duration,
          startedAt: result?.startedAt,
          completedAt: result?.completedAt,
          error: result?.error,
          assertions: result?.assertions ?? [],
          result: sanitizeValue(result?.result),
          details: sanitizeDetails(result?.details),
        };
      }),
    };
  }

  private async generateJsonReport(
    executionId: string,
    payload: AssessmentReportPayload,
  ): Promise<string> {
    const fileName = `${executionId}.${ReportService.JSON_SUFFIX}`;
    const filePath = join(this.reportsDir, fileName);
    writeFileSync(filePath, JSON.stringify(payload, null, 2));
    return filePath;
  }

  private async generateHtmlReport(
    executionId: string,
    payload: AssessmentReportPayload,
  ): Promise<string> {
    const fileName = `${executionId}.${ReportService.HTML_SUFFIX}`;
    const filePath = join(this.reportsDir, fileName);
    writeFileSync(filePath, renderHtmlReport(payload));
    return filePath;
  }
}

function renderHtmlReport(payload: AssessmentReportPayload): string {
  const outcomeLabel = payload.execution.passed ? 'Passed' : 'Failed';
  const totalAssertions = payload.steps.reduce((sum, step) => sum + step.assertions.length, 0);
  const passedAssertions = payload.steps.reduce(
    (sum, step) => sum + step.assertions.filter((assertion) => assertion.passed).length,
    0,
  );
  const generatedAt = new Date(payload.generatedAt).toLocaleString();

  const complianceSection = payload.compliance
    ? `<section class="panel">
        <h2>Regulatory Compliance</h2>
        <div class="compliance-grid">
          ${Object.values(payload.compliance.frameworks)
            .map(
              (fw) => `
            <div class="framework-card">
              <div class="framework-header">
                <h3>${escapeHtml(fw.name)}</h3>
                <span class="badge ${fw.passed ? 'pass' : 'fail'}">${fw.score}% RESULT</span>
              </div>
              <ul class="control-list">
                ${fw.rules
                  .map(
                    (rule) => `
                  <li class="control-item">
                    <span class="control-id">${escapeHtml(rule.id)}</span>
                    <span>${escapeHtml(rule.title)}</span>
                  </li>`,
                  )
                  .join('')}
              </ul>
            </div>`,
            )
            .join('')}
        </div>
      </section>`
    : '';

  const stepCards = payload.steps
    .map((step, index) => {
      const runnerSummary = step.details?.runner;
      const stepBody = runnerSummary
        ? renderRunnerStepBody(runnerSummary)
        : renderHttpStepBody(step);

      return `
        <section class="step-card">
          <div class="step-header">
            <div>
              <p class="step-kicker">Step ${index + 1}</p>
              <h3>${escapeHtml(step.name)}</h3>
              <p class="muted">${escapeHtml(formatStepDefinition(step))}</p>
            </div>
            <div class="step-meta">
              <span class="badge ${badgeClass(step.status)}">${escapeHtml(step.status.toUpperCase())}</span>
              <span class="metric">${formatDuration(step.duration)}</span>
            </div>
          </div>
          ${stepBody}
          ${
            step.error
              ? `<div class="error-box"><p class="section-label">Error</p><pre>${escapeHtml(step.error)}</pre></div>`
              : ''
          }
        </section>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(payload.scenario.name)} Report</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f1ea;
        --panel: rgba(255, 255, 255, 0.88);
        --ink: #1d242d;
        --muted: #5f6a75;
        --accent: #a34120;
        --pass: #1d6b49;
        --fail: #a12a2a;
        --border: rgba(29, 36, 45, 0.12);
        --shadow: 0 18px 40px rgba(29, 36, 45, 0.08);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top right, rgba(163, 65, 32, 0.12), transparent 28%),
          linear-gradient(180deg, #fbf7f1 0%, var(--bg) 100%);
        color: var(--ink);
      }
      main {
        width: min(1100px, calc(100% - 32px));
        margin: 32px auto 64px;
      }
      .hero,
      .panel,
      .step-card {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 24px;
        box-shadow: var(--shadow);
      }
      .hero {
        padding: 32px;
        margin-bottom: 24px;
      }
      .hero-grid,
      .summary-grid,
      .step-grid {
        display: grid;
        gap: 16px;
      }
      .hero-grid {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        align-items: end;
      }
      .summary-grid {
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      }
      .step-grid {
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        margin-top: 16px;
      }
      .panel {
        padding: 24px;
        margin-bottom: 24px;
      }
      .step-card {
        padding: 24px;
        margin-bottom: 16px;
      }
      .kicker,
      .step-kicker,
      .section-label {
        text-transform: uppercase;
        letter-spacing: 0.18em;
        font-size: 11px;
        color: var(--muted);
      }
      h1,
      h2,
      h3,
      p {
        margin: 0;
      }
      h1 {
        font-size: clamp(34px, 4vw, 52px);
        line-height: 0.95;
        margin-top: 8px;
      }
      h2 {
        font-size: 20px;
        margin-bottom: 16px;
      }
      h3 {
        font-size: 20px;
        margin-top: 6px;
      }
      .lede {
        margin-top: 12px;
        color: var(--muted);
        line-height: 1.6;
        max-width: 60ch;
      }
      .stat {
        padding: 16px;
        border-radius: 18px;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.72);
      }
      .stat .value {
        font-size: 28px;
        font-weight: 700;
        margin-top: 4px;
      }
      .muted {
        color: var(--muted);
      }
      .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
      }
      .badge.pass,
      .badge.completed {
        background: rgba(29, 107, 73, 0.12);
        color: var(--pass);
      }
      .badge.fail,
      .badge.failed {
        background: rgba(161, 42, 42, 0.12);
        color: var(--fail);
      }
      .badge.pending,
      .badge.running,
      .badge.cancelled,
      .badge.paused,
      .badge.skipped {
        background: rgba(95, 106, 117, 0.12);
        color: var(--muted);
      }
      .step-header {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
      }
      .step-meta {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
      }
      .metric {
        font-size: 13px;
        color: var(--muted);
      }
      pre {
        margin: 8px 0 0;
        white-space: pre-wrap;
        word-break: break-word;
        padding: 14px;
        border-radius: 16px;
        background: #191d22;
        color: #f6f4ef;
        font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
        font-size: 12px;
        line-height: 1.55;
      }
      .assertions {
        list-style: none;
        padding: 0;
        margin: 8px 0 0;
        display: grid;
        gap: 8px;
      }
      .assertions li {
        display: grid;
        gap: 4px;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.74);
      }
      .assertions li.pass strong {
        color: var(--pass);
      }
      .assertions li.fail strong {
        color: var(--fail);
      }
      .error-box {
        margin-top: 16px;
      }
      .export-links {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 16px;
      }
      .export-links a {
        color: var(--accent);
        font-weight: 700;
        text-decoration: none;
      }
      .compliance-grid {
        display: grid;
        gap: 24px;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        margin-top: 16px;
      }
      .framework-card {
        padding: 20px;
        border-radius: 18px;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.6);
      }
      .framework-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      .control-list {
        list-style: none;
        padding: 0;
        margin: 12px 0 0;
        display: grid;
        gap: 8px;
      }
      .control-item {
        font-size: 13px;
        padding: 8px 12px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.4);
        border: 1px solid var(--border);
      }
      .control-id {
        font-family: "IBM Plex Mono", monospace;
        font-weight: 700;
        color: var(--accent);
        margin-right: 8px;
      }
      @media (max-width: 640px) {
        main {
          width: min(100% - 20px, 100%);
          margin-top: 20px;
        }
        .hero,
        .panel,
        .step-card,
        .framework-card {
          padding: 20px;
          border-radius: 20px;
        }
        .step-header {
          flex-direction: column;
        }
        .step-meta {
          align-items: flex-start;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div class="hero-grid">
          <div>
            <p class="kicker">Security Assessment Report</p>
            <h1>${escapeHtml(payload.scenario.name)}</h1>
            <p class="lede">${escapeHtml(payload.execution.summary)}</p>
          </div>
          <div>
            <span class="badge ${payload.execution.passed ? 'pass' : 'fail'}">${escapeHtml(outcomeLabel.toUpperCase())}</span>
            <p class="lede">Generated ${escapeHtml(generatedAt)}</p>
            <div class="export-links">
              <a href="${escapeHtml(payload.exports.json)}">JSON export</a>
              <a href="${escapeHtml(payload.exports.html)}">HTML export</a>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2>Assessment Summary</h2>
        <div class="summary-grid">
          <div class="stat">
            <p class="section-label">Score</p>
            <p class="value">${payload.execution.score}%</p>
          </div>
          <div class="stat">
            <p class="section-label">Assertions Passed</p>
            <p class="value">${passedAssertions}/${totalAssertions}</p>
          </div>
          <div class="stat">
            <p class="section-label">Duration</p>
            <p class="value">${escapeHtml(formatDuration(payload.execution.duration))}</p>
          </div>
          <div class="stat">
            <p class="section-label">Target</p>
            <p class="value">${escapeHtml(payload.execution.targetUrl ?? 'N/A')}</p>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2>Scenario Metadata</h2>
        <div class="summary-grid">
          <div class="stat">
            <p class="section-label">Scenario ID</p>
            <p class="value">${escapeHtml(payload.scenario.id)}</p>
          </div>
          <div class="stat">
            <p class="section-label">Category</p>
            <p class="value">${escapeHtml(payload.scenario.category ?? 'Uncategorized')}</p>
          </div>
          <div class="stat">
            <p class="section-label">Difficulty</p>
            <p class="value">${escapeHtml(payload.scenario.difficulty ?? 'Unspecified')}</p>
          </div>
          <div class="stat">
            <p class="section-label">Execution Status</p>
            <p class="value">${escapeHtml(payload.execution.status.toUpperCase())}</p>
          </div>
        </div>
        ${
          payload.scenario.description
            ? `<p class="lede">${escapeHtml(payload.scenario.description)}</p>`
            : ''
        }
      </section>

      ${complianceSection}

      ${stepCards}
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatInlineValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value) ?? String(value);
}

function formatDuration(duration?: number): string {
  if (duration == null) {
    return 'N/A';
  }
  if (duration < 1000) {
    return `${duration}ms`;
  }
  return `${(duration / 1000).toFixed(1)}s`;
}

function badgeClass(status: ExecutionStepResult['status']): string {
  if (status === 'completed') {
    return 'completed';
  }
  if (status === 'failed') {
    return 'failed';
  }
  return status;
}

function sanitizeRequest(request: ScenarioRequest) {
  return {
    ...request,
    headers: sanitizeHeaders(request.headers),
    body: sanitizeBodyValue(request.body, 'request body'),
  };
}

function sanitizeRunnerConfig(step: ScenarioRunnerStep): Record<string, unknown> {
  if (step.type === 'k6') {
    return {
      scriptRef: step.runner.scriptRef,
      args: sanitizeValue(step.runner.args),
      thresholds: sanitizeValue(step.runner.thresholds),
    };
  }

  return {
    templateRef: step.runner.templateRef,
    workflowRef: step.runner.workflowRef,
    tags: sanitizeValue(step.runner.tags),
    severity: sanitizeValue(step.runner.severity),
  };
}

function sanitizeDetails(details?: ExecutionStepResult['details']) {
  if (!details?.response) {
    return details;
  }

  return {
    ...details,
    response: {
      ...details.response,
      headers: sanitizeHeaders(details.response.headers) ?? {},
      body: sanitizeBodyValue(details.response.body, 'response body'),
    },
  };
}

function sanitizeHeaders(headers?: Record<string, string>) {
  if (!headers) {
    return headers;
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => {
      if (SENSITIVE_HEADER_NAMES.has(key.toLowerCase())) {
        return [key, '[redacted]'];
      }
      return [key, value];
    }),
  );
}

function sanitizeBodyValue(value: unknown, label: string): unknown {
  if (typeof value === 'string') {
    return `[redacted ${label}]`;
  }
  return sanitizeValue(value);
}

function renderHttpStepBody(step: AssessmentReportPayload['steps'][number]): string {
  const body = step.details?.response?.body;
  const responseBody =
    body == null
      ? 'No response body retained.'
      : typeof body === 'string'
        ? body
        : JSON.stringify(body, null, 2);
  const assertions =
    step.assertions.length > 0
      ? `<ul class="assertions">${step.assertions
          .map(
            (assertion) => `
              <li class="${assertion.passed ? 'pass' : 'fail'}">
                <strong>${escapeHtml(assertion.field)}</strong>
                <span>${renderAssertionOutcome(assertion)}</span>
              </li>`,
          )
          .join('')}</ul>`
      : '<p class="muted">No assertions recorded for this step.</p>';

  return `
    <div class="step-grid">
      <div>
        <p class="section-label">Assertions</p>
        ${assertions}
      </div>
      <div>
        <p class="section-label">Response Body</p>
        <pre>${escapeHtml(responseBody)}</pre>
      </div>
    </div>`;
}

function renderRunnerStepBody(runner: NonNullable<NonNullable<AssessmentReportPayload['steps'][number]['details']>['runner']>): string {
  const metricsItems: string[] = [];
  const m = runner.metrics;
  if (m) {
    if (m.requests !== undefined) metricsItems.push(`Requests: ${m.requests}`);
    if (m.iterations !== undefined) metricsItems.push(`Iterations: ${m.iterations}`);
    if (m.httpReqDurationP95Ms !== undefined) metricsItems.push(`HTTP req duration p95: ${m.httpReqDurationP95Ms}ms`);
    if (m.checksPassed !== undefined || m.checksFailed !== undefined) {
      metricsItems.push(`Checks: ${m.checksPassed ?? 0} passed / ${m.checksFailed ?? 0} failed`);
    }
    if (m.thresholdsPassed !== undefined || m.thresholdsFailed !== undefined) {
      metricsItems.push(`Thresholds: ${m.thresholdsPassed ?? 0} passed / ${m.thresholdsFailed ?? 0} failed`);
    }
  }
  if (runner.findings) {
    metricsItems.push(`Findings: ${runner.findings.total}`);
    if (runner.findings.bySeverity) {
      const bySev = Object.entries(runner.findings.bySeverity)
        .map(([sev, count]) => `${sev}=${count}`)
        .join(', ');
      if (bySev.length > 0) metricsItems.push(`Severity breakdown: ${bySev}`);
    }
  }

  const metricsList = metricsItems.length > 0
    ? `<ul>${metricsItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '<p class="muted">No metrics captured.</p>';
  const exitCodeLine = runner.exitCode !== undefined
    ? `<p>Exit code: <code>${escapeHtml(String(runner.exitCode))}</code></p>`
    : '';

  const artifactList = runner.artifacts && runner.artifacts.length > 0
    ? `<ul class="artifacts">${runner.artifacts
        .map((url) => {
          const name = url.split('/').pop() ?? url;
          return `<li><a href="${escapeHtml(url)}">${escapeHtml(name)}</a></li>`;
        })
        .join('')}</ul>`
    : '<p class="muted">No artifacts captured.</p>';

  const summaryBlock = runner.summary
    ? `<div class="runner-output">
         <p class="section-label">Runner Output${runner.summaryTruncated ? ' (truncated)' : ''}</p>
         <pre>${escapeHtml(runner.summary)}</pre>
       </div>`
    : '';

  return `
    <div class="step-grid">
      <div>
        <p class="section-label">${escapeHtml(runner.type.toUpperCase())} Metrics</p>
        ${metricsList}
        ${exitCodeLine}
      </div>
      <div>
        <p class="section-label">Artifacts</p>
        ${artifactList}
      </div>
    </div>
    ${summaryBlock}`;
}

function formatStepDefinition(step: AssessmentReportPayload['steps'][number]): string {
  if (step.request) {
    return `${step.request.method} ${step.request.url}`;
  }
  if (step.runner) {
    const reference =
      typeof step.runner.config.scriptRef === 'string'
        ? step.runner.config.scriptRef
        : typeof step.runner.config.templateRef === 'string'
          ? step.runner.config.templateRef
          : typeof step.runner.config.workflowRef === 'string'
            ? step.runner.config.workflowRef
            : 'configured runner';
    return `${step.runner.type.toUpperCase()} runner • ${reference}`;
  }
  return `${step.type.toUpperCase()} step`;
}

function sanitizeValue(value: unknown): unknown {
  if (value == null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => {
        if (isSensitiveKey(key)) {
          return [key, '[redacted]'];
        }
        return [key, sanitizeValue(nestedValue)];
      }),
    );
  }

  return value;
}

function renderAssertionOutcome(
  assertion: NonNullable<ExecutionStepResult['assertions']>[number],
): string {
  if (assertion.passed) {
    return 'Passed';
  }

  const expected = escapeHtml(formatInlineValue(assertion.expected));
  const actual = escapeHtml(formatInlineValue(assertion.actual));
  return `Expected ${expected}, got ${actual}`;
}

function isSensitiveKey(key: string): boolean {
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_KEY_MARKERS.some((marker) => normalizedKey.includes(marker));
}
