/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import type { Node } from "reactflow";
import { beforeEach, describe, expect, it, vi } from "vitest";

const executionStoreState = {
  isExecuting: false,
  executionId: null as string | null,
  logs: [] as Array<Record<string, unknown>>,
  nodeStatuses: {} as Record<string, unknown>,
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

import { useExecutionStore } from "@/stores/executionStore";
import { ConsolePanel } from "./ConsolePanel";

describe("ConsolePanel workflow summaries", () => {
  const nodes: Node[] = [
    {
      id: "node_browser",
      type: "workflow",
      position: { x: 0, y: 0 },
      data: {
        label: "Browser Session Start",
        nodeType: "browser_session_start",
        config: {},
      },
    } as Node,
    {
      id: "node_compare",
      type: "workflow",
      position: { x: 0, y: 0 },
      data: {
        label: "Compare Hotels",
        nodeType: "llm_call",
        config: {},
      },
    } as Node,
  ];

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    useExecutionStore.setState({
      isExecuting: false,
      executionId: null,
      logs: [
        {
          id: "log_browser",
          timestamp: Date.parse("2026-03-12T10:05:00.000Z"),
          nodeId: "node_browser",
          nodeName: "Browser Session Start",
          eventType: "node_complete",
          status: "success",
          output: {
            browserSessionArtifact: {
              sessionId: "lbs_123",
              summary: {
                sessionId: "lbs_123",
                originSurface: "workflow",
                state: "needs_user_input",
                barrierType: "captcha_required",
                badgeLabel: "Captcha Required",
                statusLine: "Captcha Required before AI can continue.",
                primaryActionLabel: "Take Control",
                pageTitle: "Captcha",
                url: "https://example.com/captcha",
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
        {
          id: "log_compare",
          timestamp: Date.parse("2026-03-12T10:07:00.000Z"),
          nodeId: "node_compare",
          nodeName: "Compare Hotels",
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
                recommendations: [],
                options: [
                  {
                    vendor: "Booking.com",
                    optionTitle: "Centre Point Asok",
                    priceLabel: "THB 4,200",
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
  });

  it("shows browser and comparison summaries in the workflow console", () => {
    render(
      <ConsolePanel
        nodes={nodes}
        isOpen
        height={240}
        onToggle={vi.fn()}
        onHeightChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Captcha Required before AI can continue.")).toBeInTheDocument();
    expect(screen.getByText("Hotels near Asok — Comparison ready.")).toBeInTheDocument();
  });
});
