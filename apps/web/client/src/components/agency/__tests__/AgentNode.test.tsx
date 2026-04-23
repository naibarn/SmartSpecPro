/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";

vi.mock("@xyflow/react", () => ({
  Handle: ({ type, position }: any) =>
    createElement("div", { "data-testid": `handle-${type}-${position}` }),
  Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
}));

import { AgentNode, type AgentNodeData } from "../AgentNode";

function makeProps(overrides: Partial<AgentNodeData> = {}, selected = false) {
  const data: AgentNodeData = {
    name: "Research Agent",
    description: "Handles research tasks",
    instructions: "Search and summarize.",
    model: "gpt-4o",
    modelSettings: {},
    isEntryPoint: false,
    isOptional: false,
    tools: [],
    ...overrides,
  };
  return {
    id: "node-1",
    type: "agent",
    data,
    selected,
    isConnectable: true,
    xPos: 0,
    yPos: 0,
    zIndex: 0,
    dragging: false,
  } as any;
}

describe("AgentNode", () => {
  it("renders agent name and model", () => {
    render(createElement(AgentNode, makeProps()));

    expect(screen.getByText("Research Agent")).toBeTruthy();
    expect(screen.getByText("gpt-4o")).toBeTruthy();
  });

  it("shows entry point badge when isEntryPoint is true", () => {
    render(createElement(AgentNode, makeProps({ isEntryPoint: true })));

    expect(screen.getByText("entry")).toBeTruthy();
  });

  it("shows optional badge when isOptional is true", () => {
    render(createElement(AgentNode, makeProps({ isOptional: true })));

    expect(screen.getByText("optional")).toBeTruthy();
  });

  it("displays tool count indicator", () => {
    render(
      createElement(
        AgentNode,
        makeProps({
          tools: [
            { toolId: "t1", toolName: "Search" },
            { toolId: "t2", toolName: "Calculator" },
          ],
        }),
      ),
    );

    expect(screen.getByText("2 tools")).toBeTruthy();
  });

  it("renders source and target handles for connections", () => {
    render(createElement(AgentNode, makeProps()));

    expect(screen.getByTestId("handle-target-top")).toBeTruthy();
    expect(screen.getByTestId("handle-source-bottom")).toBeTruthy();
  });

  it("highlights when selected", () => {
    const { container } = render(
      createElement(AgentNode, makeProps({}, true)),
    );

    // Selected node should have ring-2 class
    const nodeDiv = container.firstElementChild as HTMLElement;
    expect(nodeDiv.className).toContain("ring-2");
  });
});
