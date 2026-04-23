import { describe, it, expect, vi } from "vitest";

// Mock reactflow to avoid canvas/DOM issues in tests
vi.mock("@xyflow/react", () => ({
  Handle: ({ id, type, position }: any) => (
    <div data-testid={`handle-${type}-${id ?? "default"}`} data-position={position} />
  ),
  Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
}));

import { render, screen } from "@testing-library/react";
import { ConditionalBranchNodeCard } from "../ConditionalBranchNodeCard";
import type { AgencyNodeData } from "../types";

function makeProps(data: Partial<AgencyNodeData>) {
  return {
    id: "node-1",
    type: "agency",
    data: {
      nodeType: "conditional_branch" as const,
      name: "Test Branch",
      ...data,
    } as AgencyNodeData,
    selected: false,
    isConnectable: true,
    xPos: 0,
    yPos: 0,
    zIndex: 0,
    dragging: false,
  } as any;
}

describe("ConditionalBranchNodeCard", () => {
  it("renders amber border and GitFork icon", () => {
    const { container } = render(<ConditionalBranchNodeCard {...makeProps({})} />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("border-amber-300");
    // GitFork renders as an SVG
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("displays evaluation mode badge for rule_based", () => {
    render(
      <ConditionalBranchNodeCard
        {...makeProps({ nodeConfig: { evaluationMode: "rule_based" } })}
      />,
    );
    expect(screen.getByText("Rule-based")).toBeTruthy();
  });

  it("displays evaluation mode badge for llm_classify", () => {
    render(
      <ConditionalBranchNodeCard
        {...makeProps({ nodeConfig: { evaluationMode: "llm_classify" } })}
      />,
    );
    expect(screen.getByText("LLM Classify")).toBeTruthy();
  });

  it("shows rule count for rule_based mode", () => {
    render(
      <ConditionalBranchNodeCard
        {...makeProps({
          nodeConfig: {
            evaluationMode: "rule_based",
            rules: [
              { id: "r1", field: "$.x", operator: "equals", value: "v", targetNodeId: "n1" },
              { id: "r2", field: "$.y", operator: "gt", value: "5", targetNodeId: "n2" },
            ],
          },
        })}
      />,
    );
    expect(screen.getByText("2 rules")).toBeTruthy();
  });

  it("shows category count for llm_classify mode", () => {
    render(
      <ConditionalBranchNodeCard
        {...makeProps({
          nodeConfig: {
            evaluationMode: "llm_classify",
            categories: [
              { label: "a", targetNodeId: "n1" },
              { label: "b", targetNodeId: "n2" },
              { label: "c", targetNodeId: "n3" },
            ],
          },
        })}
      />,
    );
    expect(screen.getByText("3 categories")).toBeTruthy();
  });

  it("displays validation error indicator when validationErrors present", () => {
    const { container } = render(
      <ConditionalBranchNodeCard
        {...makeProps({ validationErrors: ["missing default"] })}
      />,
    );
    // AlertCircle SVG should be present — check for red-500 styling
    const alertSvgs = container.querySelectorAll("svg");
    const hasAlert = Array.from(alertSvgs).some((svg) =>
      svg.classList.contains("text-red-500"),
    );
    expect(hasAlert).toBe(true);
  });

  it("renders one source handle per rule plus one default handle", () => {
    const { container } = render(
      <ConditionalBranchNodeCard
        {...makeProps({
          nodeConfig: {
            evaluationMode: "rule_based",
            rules: [
              { id: "r1", field: "$.x", operator: "equals", value: "v", targetNodeId: "n1" },
              { id: "r2", field: "$.y", operator: "gt", value: "5", targetNodeId: "n2" },
            ],
          },
        })}
      />,
    );
    // Source handles: r1, r2, default = 3 total
    const sourceHandles = container.querySelectorAll('[data-testid^="handle-source"]');
    expect(sourceHandles.length).toBe(3); // 2 rules + 1 default
  });
});
