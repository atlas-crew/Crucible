import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExecutionHistoryDetail } from "../execution-history-detail";

const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

vi.mock("@/components/execution-timeline", () => ({
  ExecutionTimeline: ({ execution }: { execution: { id: string; scenarioId: string } }) => (
    <div data-testid="execution-timeline">
      {execution.id}:{execution.scenarioId}
    </div>
  ),
}));

function mockJsonResponse(status: number, data: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

describe("ExecutionHistoryDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and renders the requested execution detail", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse(200, {
        id: "exec-detail-1",
        scenarioId: "scenario-auth",
        mode: "assessment",
        status: "completed",
        steps: [],
      }),
    );

    render(<ExecutionHistoryDetail executionId="exec-detail-1" />);

    expect(await screen.findByTestId("execution-timeline")).toHaveTextContent("exec-detail-1:scenario-auth");
    expect(screen.getByRole("link", { name: /back to history/i })).toHaveAttribute("href", "/history");
    expect(mockFetch).toHaveBeenCalledWith("http://localhost:3001/api/executions/exec-detail-1");
  });
});
