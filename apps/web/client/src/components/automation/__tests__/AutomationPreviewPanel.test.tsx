import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AutomationPreviewPanel, type AutomationPlanSummary } from "../AutomationPreviewPanel";

const SAMPLE_PLAN: AutomationPlanSummary = {
  steps: [
    { description: "Navigate to example.com", actionType: "navigate", url: "https://example.com", selectorConfidence: 0.95 },
    { description: "Click login button", actionType: "click", selectorConfidence: 0.85 },
    { description: "Fill email field", actionType: "fill", selectorConfidence: 0.72 },
    { description: "Wait for page load", actionType: "wait", selectorConfidence: 0.45 },
  ],
  estimatedCredits: 25,
  estimatedDurationSeconds: 30,
};

describe("AutomationPreviewPanel", () => {
  it("renders step list with descriptions", () => {
    render(
      <AutomationPreviewPanel
        planSummary={SAMPLE_PLAN}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Navigate to example.com")).toBeDefined();
    expect(screen.getByText("Click login button")).toBeDefined();
    expect(screen.getByText("Fill email field")).toBeDefined();
    expect(screen.getByText("Wait for page load")).toBeDefined();
  });

  it("shows action type badges", () => {
    render(
      <AutomationPreviewPanel
        planSummary={SAMPLE_PLAN}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("navigate")).toBeDefined();
    expect(screen.getByText("click")).toBeDefined();
    expect(screen.getByText("fill")).toBeDefined();
    expect(screen.getByText("wait")).toBeDefined();
  });

  it("shows confidence color coding", () => {
    const { container } = render(
      <AutomationPreviewPanel
        planSummary={SAMPLE_PLAN}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // High confidence: green
    const greenPills = container.querySelectorAll(".bg-green-100");
    expect(greenPills.length).toBe(2); // 0.95 and 0.85

    // Medium confidence: yellow
    const yellowPills = container.querySelectorAll(".bg-yellow-100");
    expect(yellowPills.length).toBe(1); // 0.72

    // Low confidence: red
    const redPills = container.querySelectorAll(".bg-red-100");
    expect(redPills.length).toBe(1); // 0.45
  });

  it("shows estimated credits", () => {
    render(
      <AutomationPreviewPanel
        planSummary={SAMPLE_PLAN}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("~25 credits")).toBeDefined();
  });

  it("calls onConfirm when Run Automation is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <AutomationPreviewPanel
        planSummary={SAMPLE_PLAN}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Run Automation"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    render(
      <AutomationPreviewPanel
        planSummary={SAMPLE_PLAN}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
