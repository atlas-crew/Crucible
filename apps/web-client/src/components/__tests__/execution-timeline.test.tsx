import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ExecutionTimeline } from "../execution-timeline";

const fetchScenarios = vi.fn();

vi.mock("@/store/useCatalogStore", () => ({
  useCatalogStore: () => ({
    pauseExecution: vi.fn(),
    resumeExecution: vi.fn(),
    cancelExecution: vi.fn(),
    restartExecution: vi.fn(),
    isLoading: false,
    scenarios: [
      {
        id: "scenario-auth",
        name: "Auth Scenario",
        description: "Validates the auth edge",
        steps: [
          {
            id: "step-1",
            name: "Health",
            stage: "main",
            request: { method: "GET", url: "/health" },
          },
        ],
      },
      {
        id: "scenario-load",
        name: "Load Scenario",
        description: "Curated k6 load run",
        steps: [
          {
            id: "load",
            name: "Baseline load",
            type: "k6",
            stage: "main",
            runner: { scriptRef: "baseline-smoke.js" },
          },
        ],
      },
    ],
    fetchScenarios,
  }),
}));

describe("ExecutionTimeline", () => {
  it("renders export links for JSON and HTML assessment reports", () => {
    render(
      <ExecutionTimeline
        execution={{
          id: "exec-assessment-1",
          scenarioId: "scenario-auth",
          mode: "assessment",
          status: "completed",
          targetUrl: "http://target.local",
          duration: 940,
          steps: [
            {
              stepId: "step-1",
              status: "completed",
              attempts: 1,
              duration: 250,
              assertions: [],
            },
          ],
          report: {
            summary: "Executed 1 steps. 1 passed.",
            passed: true,
            score: 100,
            artifacts: [
              "/api/reports/exec-assessment-1?format=html",
              "/api/reports/exec-assessment-1?format=json",
            ],
          },
        }}
      />,
    );

    expect(screen.getByRole("link", { name: /download html report/i })).toHaveAttribute(
      "href",
      "/api/reports/exec-assessment-1?format=html",
    );
    expect(screen.getByRole("link", { name: /download json report/i })).toHaveAttribute(
      "href",
      "/api/reports/exec-assessment-1?format=json",
    );
  });

  it("resolves scenario definitions from the catalog store when no scenario prop is passed", () => {
    render(
      <ExecutionTimeline
        execution={{
          id: "exec-simulation-1",
          scenarioId: "scenario-auth",
          mode: "simulation",
          status: "running",
          targetUrl: "http://target.local",
          steps: [
            {
              stepId: "step-1",
              status: "running",
              attempts: 1,
              logs: ["[2026-04-17T00:00:00.000Z] Started GET /health"],
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("scenario-auth")).toBeInTheDocument();
  });

  it("synthesizes execution logs when the backend did not persist any", async () => {
    const user = userEvent.setup();

    render(
      <ExecutionTimeline
        execution={{
          id: "exec-simulation-2",
          scenarioId: "scenario-auth",
          mode: "simulation",
          status: "completed",
          targetUrl: "http://target.local",
          steps: [
            {
              stepId: "step-1",
              status: "completed",
              attempts: 2,
              startedAt: Date.parse("2026-04-17T00:00:00.000Z"),
              completedAt: Date.parse("2026-04-17T00:00:01.000Z"),
              duration: 1000,
              assertions: [
                { field: "status", expected: 200, actual: 200, passed: true },
              ],
              details: {
                response: {
                  status: 200,
                  headers: {},
                  body: "ok",
                },
              },
            },
          ],
        }}
      />,
    );

    const expandButton = screen.getAllByRole("button")[1];
    await user.click(expandButton);

    expect(screen.getByRole("tab", { name: /summary/i })).toBeEnabled();
  });

  it("renders runner metric tiles, threshold badge, and artifact links for k6 steps", async () => {
    const user = userEvent.setup();

    render(
      <ExecutionTimeline
        execution={{
          id: "exec-runner-1",
          scenarioId: "scenario-load",
          mode: "assessment",
          status: "completed",
          targetUrl: "http://target.local",
          duration: 4200,
          steps: [
            {
              stepId: "load",
              status: "failed",
              attempts: 1,
              duration: 4200,
              error: "k6 thresholds failed: 2 threshold(s) breached",
              assertions: [],
              details: {
                runner: {
                  type: "k6",
                  exitCode: 0,
                  targetUrl: "http://target.local",
                  metrics: {
                    requests: 100,
                    httpReqDurationP95Ms: 920,
                    checksPassed: 60,
                    checksFailed: 40,
                    thresholdsPassed: 0,
                    thresholdsFailed: 2,
                  },
                  artifacts: [
                    "/api/reports/exec-runner-1/artifacts/load/summary.json",
                    "/api/reports/exec-runner-1/artifacts/load/stdout.log",
                  ],
                  summary: "iteration 1/1 ok\nstats: requests=100",
                },
              },
            },
          ],
          report: {
            summary: "1 step ran. 0 passed.",
            passed: false,
            score: 0,
            artifacts: [],
          },
        }}
      />,
    );

    const expandButton = screen.getAllByRole("button")[1];
    await user.click(expandButton);

    // Runner tab is enabled and selected by default for runner steps.
    const runnerTab = screen.getByRole("tab", { name: /^runner$/i });
    expect(runnerTab).toBeEnabled();
    expect(runnerTab).toHaveAttribute("data-state", "active");

    // Metric tiles populate from RunnerSummary.metrics.
    expect(screen.getByText("Requests")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("HTTP p95")).toBeInTheDocument();
    expect(screen.getByText("920ms")).toBeInTheDocument();
    expect(screen.getByText("60 / 40 failed")).toBeInTheDocument();
    expect(screen.getByText("0 pass / 2 fail")).toBeInTheDocument();

    // Threshold-failed banner appears in the badge row.
    expect(screen.getByText(/2 thresholds breached/i)).toBeInTheDocument();
    expect(screen.getByText(/^exit 0$/i)).toBeInTheDocument();

    // Artifact links carry the runner's URL paths and are downloadable.
    const summaryLink = screen.getByRole("link", { name: /summary\.json/ });
    expect(summaryLink).toHaveAttribute(
      "href",
      "/api/reports/exec-runner-1/artifacts/load/summary.json",
    );
    expect(summaryLink).toHaveAttribute("download", "summary.json");
    const stdoutLink = screen.getByRole("link", { name: /stdout\.log/ });
    expect(stdoutLink).toHaveAttribute(
      "href",
      "/api/reports/exec-runner-1/artifacts/load/stdout.log",
    );

    // Runner output is rendered in a pre block.
    expect(screen.getByText(/iteration 1\/1 ok/)).toBeInTheDocument();
  });

  it("flags truncated runner output", async () => {
    const user = userEvent.setup();

    render(
      <ExecutionTimeline
        execution={{
          id: "exec-runner-trunc",
          scenarioId: "scenario-load",
          mode: "assessment",
          status: "completed",
          targetUrl: "http://target.local",
          steps: [
            {
              stepId: "load",
              status: "completed",
              attempts: 1,
              duration: 1000,
              assertions: [],
              details: {
                runner: {
                  type: "k6",
                  exitCode: 0,
                  summary: "partial output...",
                  summaryTruncated: true,
                  artifacts: [
                    "/api/reports/exec-runner-trunc/artifacts/load/stdout.log",
                  ],
                },
              },
            },
          ],
        }}
      />,
    );

    const expandButton = screen.getAllByRole("button")[1];
    await user.click(expandButton);

    expect(screen.getByText(/^Truncated$/)).toBeInTheDocument();
  });

  it("disables the runner tab on HTTP-only steps", async () => {
    const user = userEvent.setup();

    render(
      <ExecutionTimeline
        execution={{
          id: "exec-http-only",
          scenarioId: "scenario-auth",
          mode: "assessment",
          status: "completed",
          targetUrl: "http://target.local",
          steps: [
            {
              stepId: "step-1",
              status: "completed",
              attempts: 1,
              duration: 250,
              assertions: [],
              details: {
                response: { status: 200, headers: {}, body: "ok" },
              },
            },
          ],
        }}
      />,
    );

    const expandButton = screen.getAllByRole("button")[1];
    await user.click(expandButton);

    expect(screen.getByRole("tab", { name: /^runner$/i })).toBeDisabled();
  });
});
