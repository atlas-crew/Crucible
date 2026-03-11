import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HistoryPage from "../page";

const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

let scenarioResponse: { status: number; data: unknown };
let pagedExecutionResponse: (offset: number) => unknown;

function mockJsonResponse(status: number, data: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

function makeExecution(overrides: Record<string, unknown> = {}) {
  return {
    id: "exec-1",
    scenarioId: "scenario-auth",
    mode: "assessment",
    status: "completed",
    startedAt: Date.parse("2026-03-10T15:00:00Z"),
    completedAt: Date.parse("2026-03-10T15:00:05Z"),
    duration: 5000,
    steps: [{ stepId: "step-1", status: "completed", attempts: 1 }],
    report: {
      summary: "Finished",
      passed: true,
      score: 92,
      artifacts: [],
    },
    ...overrides,
  };
}

function getLastExecutionUrl(): string {
  const calls = mockFetch.mock.calls
    .map(([input]) => String(input))
    .filter((value) => value.includes("/executions?"));

  return calls.at(-1) ?? "";
}

describe("HistoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    scenarioResponse = {
      status: 200,
      data: [
        { id: "scenario-auth", name: "Authentication Audit", steps: [] },
        { id: "scenario-api", name: "API Abuse Sweep", steps: [] },
      ],
    };

    pagedExecutionResponse = (offset) => {
      if (offset === 10) {
        return [
          makeExecution({
            id: "exec-11",
            scenarioId: "scenario-api",
            status: "failed",
            report: {
              summary: "Failed",
              passed: false,
              score: 41,
              artifacts: [],
            },
          }),
        ];
      }

      return Array.from({ length: 10 }, (_, index) =>
        makeExecution({
          id: `exec-${index + 1}`,
          scenarioId: index % 2 === 0 ? "scenario-auth" : "scenario-api",
        }),
      );
    };

    mockFetch.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith("/scenarios")) {
        return mockJsonResponse(scenarioResponse.status, scenarioResponse.data);
      }

      if (url.includes("/executions?")) {
        const parsedUrl = new URL(url);
        const offset = Number(parsedUrl.searchParams.get("offset") ?? "0");
        return mockJsonResponse(200, pagedExecutionResponse(offset));
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });
  });

  it("renders fetched execution cards with scenario names and detail links", async () => {
    render(<HistoryPage />);

    const detailLinks = await screen.findAllByRole("link", { name: /view details/i });

    expect(screen.getAllByText("Authentication Audit").length).toBeGreaterThan(0);
    expect(detailLinks[0]).toHaveAttribute("href", "/history/exec-1");
    expect(screen.getAllByText("92% PASS")[0]).toBeInTheDocument();
  });

  it("applies filters through execution history query params", async () => {
    render(<HistoryPage />);
    await screen.findAllByRole("link", { name: /view details/i });

    fireEvent.change(screen.getByLabelText("Scenario"), { target: { value: "scenario-api" } });
    await waitFor(() => expect(getLastExecutionUrl()).toContain("scenarioId=scenario-api"));

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "failed" } });
    await waitFor(() => expect(getLastExecutionUrl()).toContain("status=failed"));

    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "simulation" } });
    await waitFor(() => expect(getLastExecutionUrl()).toContain("mode=simulation"));

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-03-01" } });
    await waitFor(() => expect(getLastExecutionUrl()).toContain("since="));
    await waitFor(() => {
      const url = new URL(getLastExecutionUrl());
      expect(url.searchParams.get("since")).toBe(String(new Date("2026-03-01T00:00:00").getTime()));
    });

    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-03-11" } });
    await waitFor(() => expect(getLastExecutionUrl()).toContain("until="));
    await waitFor(() => {
      const url = new URL(getLastExecutionUrl());
      expect(url.searchParams.get("until")).toBe(String(new Date("2026-03-11T23:59:59.999").getTime()));
    });
  });

  it("paginates through execution results", async () => {
    render(<HistoryPage />);
    await screen.findAllByRole("link", { name: /view details/i });

    const nextButton = screen.getByRole("button", { name: /next/i });
    const previousButton = screen.getByRole("button", { name: /previous/i });

    expect(previousButton).toBeDisabled();
    fireEvent.click(nextButton);

    await waitFor(() => expect(getLastExecutionUrl()).toContain("offset=10"));
    expect(await screen.findByText("exec-11")).toBeInTheDocument();
    expect(screen.getByText("41% FAIL")).toBeInTheDocument();
    expect(nextButton).toBeDisabled();

    fireEvent.click(previousButton);

    await waitFor(() => expect(getLastExecutionUrl()).toContain("offset=0"));
  });

  it("resets pagination back to the first page when filters change", async () => {
    render(<HistoryPage />);
    await screen.findAllByRole("link", { name: /view details/i });

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(screen.getByText("Page 2")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "failed" } });

    await waitFor(() => expect(getLastExecutionUrl()).toContain("offset=0"));
    expect(screen.getByText("Page 1")).toBeInTheDocument();
  });

  it("renders an error state when execution history cannot be loaded", async () => {
    mockFetch.mockReset();
    mockFetch.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith("/scenarios")) {
        return mockJsonResponse(200, scenarioResponse.data);
      }

      if (url.includes("/executions?")) {
        return mockJsonResponse(500, { error: "boom" });
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });

    render(<HistoryPage />);

    expect(await screen.findByText("Failed to load execution history.")).toBeInTheDocument();
  });

  it("renders the same error state when the executions request throws", async () => {
    mockFetch.mockReset();
    mockFetch.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith("/scenarios")) {
        return mockJsonResponse(200, scenarioResponse.data);
      }

      if (url.includes("/executions?")) {
        throw new TypeError("Failed to fetch");
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });

    render(<HistoryPage />);

    expect(await screen.findByText("Failed to load execution history.")).toBeInTheDocument();
  });

  it("falls back to scenario IDs when the scenario lookup fails", async () => {
    scenarioResponse = { status: 500, data: { error: "down" } };
    pagedExecutionResponse = () => [makeExecution({ scenarioId: "scenario-orphan" })];

    render(<HistoryPage />);

    expect((await screen.findAllByText("scenario-orphan")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Authentication Audit")).toBeNull();
  });
});
