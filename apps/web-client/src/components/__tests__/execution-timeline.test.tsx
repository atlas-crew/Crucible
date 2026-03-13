import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExecutionTimeline } from "../execution-timeline";

vi.mock("@/store/useCatalogStore", () => ({
  useCatalogStore: () => ({
    pauseExecution: vi.fn(),
    resumeExecution: vi.fn(),
    cancelExecution: vi.fn(),
    restartExecution: vi.fn(),
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
});
