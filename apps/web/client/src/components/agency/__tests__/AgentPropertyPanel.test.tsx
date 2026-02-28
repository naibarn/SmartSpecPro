/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createElement } from "react";

// Mock ToolPicker (it uses trpc internally)
vi.mock("../ToolPicker", () => ({
  ToolPicker: ({ open }: any) =>
    open
      ? createElement("div", { "data-testid": "tool-picker" }, "Tool Picker")
      : null,
}));

import { AgentPropertyPanel } from "../AgentPropertyPanel";
import type { AgentNodeData } from "../AgentNode";

function makeAgent(overrides: Partial<AgentNodeData> = {}): AgentNodeData {
  return {
    name: "Writer Agent",
    description: "Writes content",
    instructions: "Write clearly.",
    model: "gpt-4o",
    modelSettings: { temperature: 0.7 },
    isEntryPoint: false,
    isOptional: false,
    tools: [],
    ...overrides,
  };
}

describe("AgentPropertyPanel", () => {
  let onChange: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;
  let onDelete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
    onClose = vi.fn();
    onDelete = vi.fn();
  });

  function renderPanel(agentOverrides: Partial<AgentNodeData> = {}) {
    return render(
      createElement(AgentPropertyPanel, {
        agent: makeAgent(agentOverrides),
        onChange,
        onClose,
        onDelete,
      }),
    );
  }

  it("displays selected agent name in editable field", () => {
    renderPanel();
    const input = screen.getByLabelText("Name") as HTMLInputElement;
    expect(input.value).toBe("Writer Agent");
  });

  it("displays model input with current model", () => {
    renderPanel();
    const input = screen.getByLabelText("Model") as HTMLInputElement;
    expect(input.value).toBe("gpt-4o");
  });

  it("displays instructions textarea", () => {
    renderPanel();
    const textarea = screen.getByLabelText("Instructions") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Write clearly.");
  });

  it("calls onChange when name field changes", () => {
    renderPanel();
    const input = screen.getByLabelText("Name");
    fireEvent.change(input, { target: { value: "New Name" } });
    expect(onChange).toHaveBeenCalledWith({ name: "New Name" });
  });

  it("calls onChange when model is changed", () => {
    renderPanel();
    const input = screen.getByLabelText("Model");
    fireEvent.change(input, { target: { value: "claude-sonnet-4-20250514" } });
    expect(onChange).toHaveBeenCalledWith({ model: "claude-sonnet-4-20250514" });
  });

  it("calls onChange when instructions change", () => {
    renderPanel();
    const textarea = screen.getByLabelText("Instructions");
    fireEvent.change(textarea, { target: { value: "Updated instructions" } });
    expect(onChange).toHaveBeenCalledWith({
      instructions: "Updated instructions",
    });
  });

  it("shows isEntryPoint toggle", () => {
    renderPanel();
    expect(screen.getByText("Entry Point")).toBeTruthy();
  });

  it("shows isOptional toggle", () => {
    renderPanel();
    expect(screen.getByText("Optional")).toBeTruthy();
  });

  it("shows tool list with remove buttons", () => {
    renderPanel({
      tools: [
        { toolId: "t1", toolName: "Search" },
        { toolId: "t2", toolName: "Calculator" },
      ],
    });

    expect(screen.getByText("Search")).toBeTruthy();
    expect(screen.getByText("Calculator")).toBeTruthy();
  });

  it("opens ToolPicker when add tool button is clicked", () => {
    renderPanel();
    const addBtn = screen.getByText("Add Tool");
    fireEvent.click(addBtn);
    expect(screen.getByTestId("tool-picker")).toBeTruthy();
  });
});
