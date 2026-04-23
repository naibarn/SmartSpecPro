import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/collapsible", () => ({
  Collapsible: ({ children }: any) => <div>{children}</div>,
  CollapsibleContent: ({ children }: any) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: any) => <div>{children}</div>,
}));

import { TeamPlanSidePanel } from "../TeamPlanSidePanel";

describe("TeamPlanSidePanel", () => {
  it("renders the current plan snapshot through the shared ledger panel", () => {
    render(
      <TeamPlanSidePanel
        ledger={{
          objective: "Create a Songkran video",
          accessLevel: "summary",
          derivedState: "structured",
          plan: {
            status: "executing",
            reviewStatus: "passed",
            reviewIteration: 1,
            stepCount: 1,
            explorationEnabled: false,
            source: "chat",
            sourceMessageId: "plan-msg-1",
            sourceMessageCreatedAt: "2026-04-18T10:00:00.000Z",
          },
          summary: {
            terminalState: "running",
            runStatus: "running",
            terminalReason: null,
            nextAction: "Continue Storyboard.",
            currentStepKey: "storyboard",
            currentStepTitle: "Storyboard",
            latestOutcome: "Approved",
          },
          gates: [],
          steps: [
            {
              stepKey: "storyboard",
              title: "Storyboard",
              objective: "Draft the storyboard",
              deliverable: "Storyboard draft",
              status: "planned",
              ownerPersona: "Researcher",
              ownerMemberId: "assistant-1",
              reviewerPersona: "Reviewer",
              reviewerMemberId: "assistant-2",
              verificationMethod: "qa review",
              retryRule: "retry until pass",
              evidenceRequirements: [],
              qualityCriteria: [],
              reviewChecklist: [],
              notes: null,
              stepLinks: [],
              attemptIds: [],
              latestAttemptId: null,
              openFindingCount: 0,
              resolvedFindingCount: 0,
            },
          ],
          attempts: [],
          timeline: [],
          chatPlan: null,
        }}
        teamMembers={[
          { id: "assistant-1", displayName: "Researcher" },
          { id: "assistant-2", displayName: "Reviewer" },
        ]}
        runStatus="running"
        onFocusThread={vi.fn()}
      />,
    );

    expect(screen.getByText("Create a Songkran video")).toBeInTheDocument();
    expect(screen.getByTestId("auto-team-plan-snapshot")).toHaveTextContent("Storyboard");
  });
});
