import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ExecutionHistoryDetailPage from "../page";

vi.mock("@/components/history/execution-history-detail", () => ({
  ExecutionHistoryDetail: ({ executionId }: { executionId: string }) => (
    <div data-testid="execution-history-detail">{executionId}</div>
  ),
}));

describe("ExecutionHistoryDetailPage", () => {
  it("passes the route executionId through to the detail component", async () => {
    const ui = await ExecutionHistoryDetailPage({
      params: Promise.resolve({ executionId: "exec-route-42" }),
    });

    render(ui);

    expect(screen.getByTestId("execution-history-detail")).toHaveTextContent("exec-route-42");
  });
});
