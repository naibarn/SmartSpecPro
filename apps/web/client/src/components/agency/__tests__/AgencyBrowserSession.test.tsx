/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Node } from "reactflow";

import { AgencySidebar } from "../AgencySidebar";
import { NodePropertyPanel } from "../NodePropertyPanel";
import { useAgencyValidation } from "@/hooks/useAgencyValidation";
import type { AgencyNodeData } from "../nodes/types";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agency: {
      listAgentTemplates: {
        useQuery: () => ({ data: { agentTemplates: [] }, isLoading: false }),
      },
    },
  },
}));

describe("Agency Browser Session builder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers Browser Session as a first-class builder node", () => {
    const onNodeAdd = vi.fn();
    render(<AgencySidebar onNodeAdd={onNodeAdd} />);

    fireEvent.click(screen.getByText("Browser Session"));

    expect(onNodeAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeType: "browser_session",
        name: "Browser Session",
      }),
    );
  });

  it("renders browser-session properties with shared handoff labels", () => {
    render(
      <NodePropertyPanel
        node={{
          nodeType: "browser_session",
          name: "Browser Session",
          nodeConfig: {
            goal: "Collect checkout details",
            handoffMode: "review_required",
            handoffSummary: "Confirm the cart contents before checkout.",
          },
        } as AgencyNodeData}
        nodeId="node-browser-session"
        siblingNodes={[]}
        onChange={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Browser Session Properties")).toBeInTheDocument();
    expect(screen.getByText("Browser Goal")).toBeInTheDocument();
    expect(screen.getByText("When The Session Needs A Human")).toBeInTheDocument();
    expect(screen.getByText("Human Handoff Summary")).toBeInTheDocument();
  });

  it("validates browser-session goals and handoff summaries without affecting older node types", () => {
    const nodes = [
      {
        id: "browser-node",
        type: "agency",
        position: { x: 0, y: 0 },
        data: {
          nodeType: "browser_session",
          name: "Browser Session",
          nodeConfig: {
            handoffMode: "review_required",
          },
        },
      },
      {
        id: "agent-node",
        type: "agency",
        position: { x: 0, y: 120 },
        data: {
          nodeType: "agent",
          name: "Agent",
          model: "gpt-4o-mini",
          instructions: "Help the user.",
          isEntryPoint: true,
        },
      },
    ] as Node<AgencyNodeData>[];

    const { result } = renderHook(() => useAgencyValidation(nodes, []));

    expect(result.current.get("browser-node")).toEqual([
      "Browser goal is required",
      "Human handoff summary is required",
    ]);
    expect(result.current.get("agent-node")).toBeUndefined();
  });
});
