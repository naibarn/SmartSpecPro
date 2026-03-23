/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createElement } from "react";

// Mock sub-components that use trpc / external dependencies
vi.mock("../ToolPicker", () => ({ ToolPicker: () => null }));
vi.mock("../ModelPicker", () => ({ ModelPicker: () => null }));
vi.mock("../guardrails/GuardrailsPanel", () => ({ GuardrailsPanel: () => null }));
vi.mock("../McpServersPanel", () => ({ McpServersPanel: () => null }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    library: {
      listDocuments: { useQuery: () => ({ data: null, isLoading: false }) },
      search: { useQuery: () => ({ data: null, isLoading: false }) },
    },
  },
}));

import { NodePropertyPanel } from "../NodePropertyPanel";
import type { AgencyNodeData } from "../nodes/types";

function makeNode(overrides: Partial<AgencyNodeData> = {}): AgencyNodeData {
  return {
    nodeType: "autonomous_agent",
    name: "Auto Agent",
    description: "An autonomous agent",
    instructions: "Plan and execute tasks.",
    model: "gpt-4o",
    isEntryPoint: false,
    tools: [],
    ...overrides,
  };
}

describe("AutonomousConfigPanel", () => {
  let onChange: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;
  let onDelete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
    onClose = vi.fn();
    onDelete = vi.fn();
  });

  function renderPanel(nodeOverrides: Partial<AgencyNodeData> = {}) {
    return render(
      createElement(NodePropertyPanel, {
        node: makeNode(nodeOverrides),
        onChange,
        onClose,
        onDelete,
      }),
    );
  }

  it("renders all autonomous config fields", () => {
    renderPanel();
    expect(screen.getByText("Max Plan Depth")).toBeTruthy();
    expect(screen.getByText("Decomposition Strategy")).toBeTruthy();
    expect(screen.getByText("Max Total Iterations")).toBeTruthy();
    expect(screen.getByText("Delegation Mode")).toBeTruthy();
    expect(screen.getByText("Reflect After Steps")).toBeTruthy();
    expect(screen.getByText("Budget Allocation")).toBeTruthy();
    expect(screen.getByText("Quality Threshold")).toBeTruthy();
    expect(screen.getByText("Enable Long-Term Memory")).toBeTruthy();
  });

  it("maxPlanDepth slider range is 1-5", () => {
    renderPanel();
    const sliders = screen.getAllByRole("slider");
    // maxPlanDepth is the first slider in the autonomous panel
    const planDepthSlider = sliders.find(
      (s) => (s as HTMLInputElement).min === "1" && (s as HTMLInputElement).max === "5"
    ) as HTMLInputElement;
    expect(planDepthSlider).toBeTruthy();
    expect(planDepthSlider.min).toBe("1");
    expect(planDepthSlider.max).toBe("5");
  });

  it("maxTotalIterations slider range is 1-50", () => {
    renderPanel();
    const sliders = screen.getAllByRole("slider");
    const iterSlider = sliders.find(
      (s) => (s as HTMLInputElement).max === "50"
    ) as HTMLInputElement;
    expect(iterSlider).toBeTruthy();
    expect(iterSlider.min).toBe("1");
    expect(iterSlider.max).toBe("50");
  });

  it("quality threshold slider has step 0.05", () => {
    renderPanel();
    const sliders = screen.getAllByRole("slider");
    const qualitySlider = sliders.find(
      (s) => (s as HTMLInputElement).step === "0.05"
    ) as HTMLInputElement;
    expect(qualitySlider).toBeTruthy();
    expect(qualitySlider.min).toBe("0");
    expect(qualitySlider.max).toBe("1");
  });

  it("shows cost estimate label", () => {
    renderPanel();
    expect(
      screen.getByText("Autonomous agents may use 10-20x more credits per run"),
    ).toBeTruthy();
  });

  it("calls onChange when maxPlanDepth slider changes", () => {
    renderPanel();
    const sliders = screen.getAllByRole("slider");
    const planDepthSlider = sliders.find(
      (s) => (s as HTMLInputElement).max === "5"
    ) as HTMLInputElement;
    fireEvent.change(planDepthSlider, { target: { value: "4" } });
    expect(onChange).toHaveBeenCalledWith({
      nodeConfig: expect.objectContaining({ maxPlanDepth: 4 }),
    });
  });
});
