/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSetLocation = vi.fn();
const executionStoreState = {
  isExecuting: false,
  executionId: null as string | null,
  nodeStatuses: {} as Record<string, unknown>,
  logs: [] as Array<Record<string, unknown>>,
  startExecution: vi.fn(),
  updateNodeStatus: vi.fn(),
  addLog: vi.fn(),
  completeExecution: vi.fn(),
  resetExecution: vi.fn(),
  getNodeStatus: vi.fn(),
  getLogs() {
    return executionStoreState.logs;
  },
  canExecute: vi.fn(() => true),
};

vi.mock("@/stores/executionStore", () => {
  const useExecutionStore = ((selector?: (state: typeof executionStoreState) => unknown) => (
    selector ? selector(executionStoreState) : executionStoreState
  )) as typeof import("@/stores/executionStore").useExecutionStore;

  useExecutionStore.setState = (partial) => {
    Object.assign(executionStoreState, partial);
  };
  useExecutionStore.getState = () => executionStoreState;

  return { useExecutionStore };
});

vi.mock("wouter", () => ({
  useLocation: () => ["/workflows/editor/17", mockSetLocation],
}));

import { useExecutionStore } from "@/stores/executionStore";
import { ExecutionLogPanel } from "./ExecutionLogPanel";

describe("ExecutionLogPanel workflow presentation", () => {
  beforeEach(() => {
    mockSetLocation.mockReset();
    Element.prototype.scrollIntoView = vi.fn();
    useExecutionStore.setState({
      isExecuting: false,
      executionId: "exec_1",
      nodeStatuses: {},
      logs: [],
    });
  });

  afterEach(() => {
    useExecutionStore.setState({
      isExecuting: false,
      executionId: null,
      nodeStatuses: {},
      logs: [],
    });
  });

  it("renders Browser Session cards from workflow output and opens the live browser route", () => {
    useExecutionStore.setState({
      logs: [
        {
          id: "log_1",
          timestamp: Date.parse("2026-03-12T10:05:00.000Z"),
          nodeId: "node_1",
          nodeName: "Browser Session Start",
          eventType: "node_complete",
          status: "success",
          output: {
            browserSessionId: "lbs_123",
            browserSessionArtifact: {
              sessionId: "lbs_123",
              summary: {
                sessionId: "lbs_123",
                originSurface: "workflow",
                state: "needs_user_input",
                barrierType: "login_required",
                badgeLabel: "Login Required",
                statusLine: "Login Required before AI can continue.",
                primaryActionLabel: "Take Control",
                pageTitle: "Sign In",
                url: "https://example.com/login",
                compactNotice: null,
                sourceLabel: "Workflow",
              },
              launchContext: {
                originSurface: "workflow",
                originLabel: "Workflow",
                sourceId: "17",
                returnContext: {
                  path: "/workflows/editor/17?browserSessionId=lbs_123",
                  label: "Return to Workflow",
                },
              },
              updatedAt: "2026-03-12T10:05:00.000Z",
            },
          },
        },
      ],
    });

    render(<ExecutionLogPanel />);

    fireEvent.click(screen.getByText("Browser Session Start"));

    expect(screen.getByText("Login Required before AI can continue.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Take Control/i }));

    expect(mockSetLocation).toHaveBeenCalledWith(
      expect.stringContaining("/automation/live/lbs_123?"),
    );
  });

  it("renders comparison previews from workflow output in rich mode", () => {
    useExecutionStore.setState({
      logs: [
        {
          id: "log_2",
          timestamp: Date.parse("2026-03-12T10:07:00.000Z"),
          nodeId: "node_2",
          nodeName: "Hotel Compare",
          eventType: "node_complete",
          status: "success",
          output: {
            comparisonPreview: {
              lifecycleState: "preview_generated",
              summaryText: "Comparison ready.",
              data: {
                comparisonKind: "hotel",
                title: "Hotels near Asok",
                summary: "Closest options first.",
                recommendations: ["Pick the closest refundable option."],
                options: [
                  {
                    vendor: "Booking.com",
                    optionTitle: "Centre Point Asok",
                    priceLabel: "THB 4,200",
                    distanceLabel: "350 m",
                    availabilityState: "limited",
                    evidence: [],
                  },
                ],
              },
            },
          },
        },
      ],
    });

    render(<ExecutionLogPanel />);

    fireEvent.click(screen.getByText("Hotel Compare"));

    expect(screen.getByText("Hotels near Asok")).toBeInTheDocument();
    expect(screen.getByText("Comparison ready.")).toBeInTheDocument();
    expect(
      screen.getByText((content) => content.includes("Pick the closest refundable option.")),
    ).toBeInTheDocument();
  });
});
