import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AutomationStepTracker } from "../AutomationStepTracker";

describe("AutomationStepTracker", () => {
  it("renders generating phase indicator", () => {
    render(<AutomationStepTracker status={{ status: "generating" }} />);
    expect(screen.getByText("Generating script...")).toBeDefined();
  });

  it("renders running phase with step count", () => {
    render(
      <AutomationStepTracker
        status={{ status: "running", currentStep: 2, totalSteps: 5 }}
      />,
    );
    expect(screen.getByText("Running step 2 of 5...")).toBeDefined();
  });

  it("renders healing attempt phase", () => {
    render(
      <AutomationStepTracker status={{ status: "healing_attempt_2" }} />,
    );
    expect(screen.getByText("Healing selector (attempt 2/3)...")).toBeDefined();
  });

  it("highlights heal events in amber", () => {
    const { container } = render(
      <AutomationStepTracker
        status={{
          status: "running",
          healEvent: {
            attempt: 2,
            maxAttempts: 3,
            oldSelector: "#old-btn",
            newSelector: "#new-btn",
          },
        }}
      />,
    );
    const healBox = container.querySelector(".border-amber-400");
    expect(healBox).toBeTruthy();
    expect(screen.getByText("Healing selector (attempt 2/3)")).toBeDefined();
    expect(screen.getByText("#old-btn")).toBeDefined();
    expect(screen.getByText("#new-btn")).toBeDefined();
  });

  it("renders success state with extracted data", () => {
    render(
      <AutomationStepTracker
        status={{
          status: "success",
          extractedData: { name: "John" },
          actualCreditsUsed: 15,
        }}
      />,
    );
    expect(screen.getByText("Automation complete")).toBeDefined();
    expect(screen.getByText("Credits used: 15")).toBeDefined();
  });

  it("renders failed state with error", () => {
    render(
      <AutomationStepTracker
        status={{ status: "failed", error: "Selector not found" }}
      />,
    );
    expect(screen.getByText("Automation failed")).toBeDefined();
    expect(screen.getByText("Selector not found")).toBeDefined();
  });

  it("renders completed actions list", () => {
    render(
      <AutomationStepTracker
        status={{
          status: "running",
          completedActions: ["Navigated to example.com", "Clicked login button"],
        }}
      />,
    );
    expect(screen.getByText("Navigated to example.com")).toBeDefined();
    expect(screen.getByText("Clicked login button")).toBeDefined();
  });
});
