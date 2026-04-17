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
});
