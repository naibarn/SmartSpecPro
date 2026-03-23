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
    nodeType: "agent",
    name: "Test Agent",
    description: "A test agent",
    instructions: "Do the thing.",
    model: "gpt-4o",
    isEntryPoint: false,
    tools: [],
    ...overrides,
  };
}

describe("AgenticConfig - Intelligence Section", () => {
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

  function openIntelligence() {
    const btn = screen.getByText("Intelligence");
    fireEvent.click(btn);
  }

  it("renders Intelligence section header for agent nodes", () => {
    renderPanel();
    expect(screen.getByText("Intelligence")).toBeTruthy();
  });

  it("renders execution mode dropdown when Intelligence section opened", () => {
    renderPanel();
    openIntelligence();
    expect(screen.getByText("Execution Mode")).toBeTruthy();
  });

  it("shows agentic sub-options when agentic mode selected", () => {
    renderPanel({
      nodeConfig: { executionMode: "agentic" },
    });
    openIntelligence();
    expect(screen.getByText("Planning Strategy")).toBeTruthy();
    expect(screen.getByText("Max Reflection Cycles")).toBeTruthy();
    expect(screen.getByText("Show reasoning steps in output")).toBeTruthy();
  });

  it("hides agentic sub-options when standard mode selected", () => {
    renderPanel({
      nodeConfig: { executionMode: "single_shot" },
    });
    openIntelligence();
    expect(screen.queryByText("Planning Strategy")).toBeNull();
    expect(screen.queryByText("Max Reflection Cycles")).toBeNull();
  });

  it("slider range is 1-10 for max reflection cycles", () => {
    renderPanel({
      nodeConfig: { executionMode: "agentic" },
    });
    openIntelligence();
    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(slider.min).toBe("1");
    expect(slider.max).toBe("10");
  });

  it("shows cost warning banner when agentic enabled", () => {
    renderPanel({
      nodeConfig: { executionMode: "agentic" },
    });
    openIntelligence();
    expect(
      screen.getByText("Agentic mode may use 2-5x more credits per run"),
    ).toBeTruthy();
  });

  it("calls onChange with correct nodeConfig when slider changes", () => {
    renderPanel({
      nodeConfig: { executionMode: "agentic" },
    });
    openIntelligence();
    const slider = screen.getByRole("slider") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "7" } });
    expect(onChange).toHaveBeenCalledWith({
      nodeConfig: { executionMode: "agentic", maxReflectionCycles: 7 },
    });
  });
});
