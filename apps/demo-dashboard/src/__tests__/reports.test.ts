import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReportService } from '../server/reports.js';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { ScenarioExecution } from '../shared/types.js';

describe('ReportService', () => {
  const reportsDir = join(__dirname, 'tmp-reports');
  let service: ReportService;

  beforeEach(() => {
    mkdirSync(reportsDir, { recursive: true });
    service = new ReportService({ reportsDir, baseUrl: 'http://localhost:3001' });
  });

  afterEach(() => {
    rmSync(reportsDir, { recursive: true, force: true });
  });

  const mockExecution: ScenarioExecution = {
    id: 'test-exec-123',
    scenarioId: 'test-scenario',
    mode: 'assessment',
    status: 'completed',
    targetUrl: 'http://victim.local',
    steps: [
      {
        stepId: 'step-1',
        status: 'completed',
        duration: 150,
        attempts: 1,
        assertions: [{ field: 'status', expected: 200, actual: 200, passed: true }]
      }
    ],
    report: {
      summary: 'All steps passed successfully.',
      passed: true,
      score: 100,
      artifacts: []
    }
  };

  const mockScenario: any = {
    id: 'test-scenario',
    name: 'Test Scenario',
    description: 'A test scenario description',
    category: 'Injection',
    difficulty: 'Intermediate',
    steps: [
      {
        id: 'step-1',
        name: 'Initial Probe',
        request: { method: 'GET', url: '/health' },
      }
    ]
  };

  it('generates a valid JSON report', async () => {
    const { jsonPath } = await service.generateReports(mockExecution, mockScenario);
    
    expect(existsSync(jsonPath)).toBe(true);
    const content = JSON.parse(readFileSync(jsonPath, 'utf8'));
    expect(content.execution.id).toBe(mockExecution.id);
    expect(content.execution.score).toBe(100);
    expect(content.scenario.name).toBe(mockScenario.name);
    expect(content.steps).toHaveLength(1);
    expect(content.steps[0].assertions[0].field).toBe('status');
    expect(content.exports.json).toContain(`format=${ReportService.JSON_SUFFIX}`);
    expect(content.exports.html).toContain(`format=${ReportService.HTML_SUFFIX}`);
  });

  it('generates a styled HTML report file', async () => {
    const { htmlPath } = await service.generateReports(mockExecution, mockScenario);

    expect(existsSync(htmlPath)).toBe(true);
    const content = readFileSync(htmlPath, 'utf8');
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('Security Assessment Report');
    expect(content).toContain('Test Scenario');
    expect(content).toContain('100%');
    expect(content).toContain('Initial Probe');
    expect(content).toContain('JSON export');
  });

  it('renders failed assertion details, nullish values, and second-based durations in HTML', async () => {
    const { htmlPath } = await service.generateReports(
      {
        ...mockExecution,
        duration: 2500,
        steps: [
          {
            ...mockExecution.steps[0],
            duration: 2500,
            assertions: [
              { field: 'status', expected: 200, actual: 403, passed: false },
              { field: 'body.token', expected: null, actual: undefined, passed: false },
            ],
          },
        ],
      },
      mockScenario,
    );

    const content = readFileSync(htmlPath, 'utf8');
    expect(content).toContain('2.5s');
    expect(content).toContain('Expected 200, got 403');
    expect(content).toContain('Expected null, got undefined');
  });

  it('escapes untrusted HTML content in the rendered report', async () => {
    const { htmlPath } = await service.generateReports(
      {
        ...mockExecution,
        report: {
          ...mockExecution.report!,
          summary: 'Returned <script>alert(1)</script> payload.',
        },
        steps: [
          {
            ...mockExecution.steps[0],
            error: '<img src=x onerror=alert(1)>',
            details: {
              response: {
                status: 500,
                headers: { 'content-type': 'text/html' },
                body: '<script>throw new Error("boom")</script>',
              },
            },
          },
        ],
      },
      {
        ...mockScenario,
        name: '<b>Hostile Scenario</b>',
        steps: [
          {
            ...mockScenario.steps[0],
            name: '<svg onload=alert(1)>Initial Probe</svg>',
            request: {
              method: 'POST',
              url: '/login',
              headers: { Authorization: 'Bearer secret-token' },
              body: { password: 'hunter2' },
            },
          },
        ],
      },
    );

    const content = readFileSync(htmlPath, 'utf8');
    expect(content).toContain('&lt;b&gt;Hostile Scenario&lt;/b&gt;');
    expect(content).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(content).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(content).toContain('[redacted response body]');
    expect(content).not.toContain('<script>alert(1)</script>');
  });

  it('keeps unmatched scenario steps in the report with pending status', async () => {
    const { jsonPath } = await service.generateReports(
      mockExecution,
      {
        ...mockScenario,
        steps: [
          ...mockScenario.steps,
          {
            id: 'step-2',
            name: 'Follow-up probe',
            request: { method: 'POST', url: '/login' },
          },
        ],
      },
    );

    const content = JSON.parse(readFileSync(jsonPath, 'utf8'));
    expect(content.steps).toHaveLength(2);
    expect(content.steps[1].status).toBe('pending');
    expect(content.steps[1].assertions).toEqual([]);
  });

  it('redacts sensitive headers and body fields in the JSON export', async () => {
    const { jsonPath } = await service.generateReports(
      {
        ...mockExecution,
        steps: [
          {
            ...mockExecution.steps[0],
            result: {
              sessionToken: 'secret-session-token',
              severity: 'high',
            },
            details: {
              response: {
                status: 200,
                headers: {
                  'set-cookie': 'session=abc123',
                  'content-type': 'application/json',
                },
                body: { apiKey: 'very-secret', status: 'ok', nested: { privateCredential: 'abc' } },
              },
            },
          },
        ],
      },
      {
        ...mockScenario,
        steps: [
          {
            ...mockScenario.steps[0],
            request: {
              method: 'POST',
              url: '/tokens',
              headers: {
                Authorization: 'Bearer top-secret',
                'content-type': 'application/json',
              },
              body: { password: 'hunter2', username: 'operator' },
            },
          },
        ],
      },
    );

    const content = JSON.parse(readFileSync(jsonPath, 'utf8'));
    expect(content.steps[0].request.headers.Authorization).toBe('[redacted]');
    expect(content.steps[0].request.body.password).toBe('[redacted]');
    expect(content.steps[0].request.body.username).toBe('operator');
    expect(content.steps[0].result.sessionToken).toBe('[redacted]');
    expect(content.steps[0].details.response.headers['set-cookie']).toBe('[redacted]');
    expect(content.steps[0].details.response.body.apiKey).toBe('[redacted]');
    expect(content.steps[0].details.response.body.status).toBe('ok');
    expect(content.steps[0].details.response.body.nested.privateCredential).toBe('[redacted]');
  });

  it('redacts even non-sensitive string bodies under the strict export policy', async () => {
    const { jsonPath } = await service.generateReports(
      {
        ...mockExecution,
        steps: [
          {
            ...mockExecution.steps[0],
            details: {
              response: {
                status: 200,
                headers: { 'content-type': 'text/plain' },
                body: 'success',
              },
            },
          },
        ],
      },
      {
        ...mockScenario,
        steps: [
          {
            ...mockScenario.steps[0],
            request: {
              method: 'POST',
              url: '/notes',
              body: 'hello world',
            },
          },
        ],
      },
    );

    const content = JSON.parse(readFileSync(jsonPath, 'utf8'));
    expect(content.steps[0].request.body).toBe('[redacted request body]');
    expect(content.steps[0].details.response.body).toBe('[redacted response body]');
  });

  it('serializes report generation for the same execution id', async () => {
    const originalGenerateJsonReport = (service as any).generateJsonReport.bind(service);
    let activeRuns = 0;
    let maxConcurrentRuns = 0;

    vi.spyOn(service as any, 'generateJsonReport').mockImplementation(async (...args: unknown[]) => {
      activeRuns += 1;
      maxConcurrentRuns = Math.max(maxConcurrentRuns, activeRuns);
      await new Promise((resolve) => setTimeout(resolve, 20));
      const result = await originalGenerateJsonReport(...args);
      activeRuns -= 1;
      return result;
    });

    await Promise.all([
      service.generateReports(mockExecution, mockScenario),
      service.generateReports(mockExecution, mockScenario),
    ]);

    expect(maxConcurrentRuns).toBe(1);
  });

  it('releases the generation lock after a failed write', async () => {
    const htmlSpy = vi
      .spyOn(service as any, 'generateHtmlReport')
      .mockRejectedValueOnce(new Error('disk full'));

    await expect(service.generateReports(mockExecution, mockScenario)).rejects.toThrow('disk full');

    htmlSpy.mockRestore();

    await expect(service.generateReports(mockExecution, mockScenario)).resolves.toEqual(
      expect.objectContaining({
        jsonPath: expect.stringContaining('.json'),
        htmlPath: expect.stringContaining('.html'),
      }),
    );
  });

  it('renders runner step metrics, artifact links, and exit code in HTML', async () => {
    const runnerExecution: ScenarioExecution = {
      ...mockExecution,
      steps: [
        {
          stepId: 'load',
          status: 'completed',
          duration: 4200,
          attempts: 1,
          assertions: [],
          details: {
            runner: {
              type: 'k6',
              exitCode: 0,
              targetUrl: 'http://victim.local',
              summary: 'iteration 1/1 ok',
              metrics: {
                requests: 50,
                iterations: 50,
                httpReqDurationP95Ms: 187.5,
                checksPassed: 50,
                checksFailed: 0,
                thresholdsPassed: 1,
                thresholdsFailed: 0,
              },
              artifacts: [
                '/api/reports/test-exec-123/artifacts/load/summary.json',
                '/api/reports/test-exec-123/artifacts/load/stdout.log',
              ],
            },
          },
        },
      ],
    };
    const runnerScenario: any = {
      id: 'test-scenario',
      name: 'Test Scenario',
      steps: [
        {
          id: 'load',
          name: 'Baseline load',
          type: 'k6',
          stage: 'main',
          runner: { scriptRef: 'baseline-smoke.js' },
        },
      ],
    };

    const { htmlPath, jsonPath } = await service.generateReports(runnerExecution, runnerScenario);
    const html = readFileSync(htmlPath, 'utf8');

    expect(html).toContain('K6 Metrics');
    // Section label is k6-specific; nuclei would render 'Nuclei Findings'.
    expect(html).not.toContain('Nuclei Findings');
    expect(html).toContain('Requests: 50');
    expect(html).toContain('HTTP req duration p95: 187.5ms');
    expect(html).toContain('Checks: 50 passed / 0 failed');
    expect(html).toContain('Thresholds: 1 passed / 0 failed');
    expect(html).toContain('Exit code:');
    expect(html).toContain(
      'href="/api/reports/test-exec-123/artifacts/load/summary.json"',
    );
    expect(html).toContain('Runner Output');

    // Runner detail must also survive the JSON export so the report is
    // self-contained and history views can rehydrate it.
    const json = JSON.parse(readFileSync(jsonPath, 'utf8'));
    expect(json.steps[0].details.runner.metrics.requests).toBe(50);
    expect(json.steps[0].details.runner.artifacts).toHaveLength(2);
  });

  it('marks runner output as truncated when summaryTruncated is set', async () => {
    const truncatedExecution: ScenarioExecution = {
      ...mockExecution,
      steps: [
        {
          stepId: 'load',
          status: 'completed',
          duration: 1000,
          attempts: 1,
          assertions: [],
          details: {
            runner: {
              type: 'k6',
              exitCode: 0,
              summary: 'partial output...',
              summaryTruncated: true,
              artifacts: ['/api/reports/test-exec-123/artifacts/load/stdout.log'],
            },
          },
        },
      ],
    };
    const runnerScenario: any = {
      id: 'test-scenario',
      name: 'Test Scenario',
      steps: [
        {
          id: 'load',
          name: 'Truncated step',
          type: 'k6',
          stage: 'main',
          runner: { scriptRef: 'baseline-smoke.js' },
        },
      ],
    };

    const { htmlPath } = await service.generateReports(truncatedExecution, runnerScenario);
    expect(readFileSync(htmlPath, 'utf8')).toContain('Runner Output (truncated)');
  });
});
