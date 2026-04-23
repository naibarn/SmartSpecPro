import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

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

import { AutoTeamLedgerPanel } from "../AutoTeamLedgerPanel";

const mockOnFocusThread = vi.fn();

describe("AutoTeamLedgerPanel", () => {
  it("renders a waiting state when the ledger has not loaded yet", () => {
    render(
      <AutoTeamLedgerPanel
        ledger={null}
        teamMembers={[]}
        runStatus="running"
      />,
    );

    expect(screen.getByText("Waiting for the team ledger")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The orchestration dashboard will appear as soon as the run emits structured plan and audit data.",
      ),
    ).toBeInTheDocument();
  });

  it("renders objective, step history, review findings, and the audit timeline", () => {
    const scrollIntoView = vi.fn();
    const getElementByIdSpy = vi.spyOn(document, "getElementById");
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    render(
      <AutoTeamLedgerPanel
        ledger={{
          object: "auto_team_ledger",
          accessLevel: "detailed",
          derivedState: "structured",
          objective: "Create a Songkran video",
          plan: {
            status: "executing",
            reviewStatus: "passed",
            reviewIteration: 2,
            stepCount: 2,
            explorationEnabled: false,
            source: "chat",
            sourceMessageId: "plan-msg-1",
            sourceMessageCreatedAt: "2026-04-18T10:00:00.000Z",
          },
          chatPlan: {
            messageId: "plan-msg-1",
            createdAt: "2026-04-18T10:00:00.000Z",
            messagePreview: "Plan and responsibilities draft",
            objective: "Create a Songkran video",
            status: "ready",
            reviewStatus: "passed",
            reviewIteration: 1,
            reviewScore: 0.9,
            reviewRecommendation: "Looks good to proceed",
            reviewIssues: [],
            stepCount: 1,
            steps: [
              {
                stepKey: "storyboard",
                title: "Storyboard",
                objective: "Draft the storyboard",
                deliverable: "Storyboard draft with scene sequence and creative hook",
                status: "planned",
                ownerPersona: "Researcher",
                ownerMemberId: "assistant-1",
                reviewerPersona: "Reviewer",
                reviewerMemberId: "assistant-2",
                verificationMethod: "qa review",
                retryRule: "loop until passing",
                evidenceRequirements: ["storyboard"],
                qualityCriteria: [
                  "Hook is strong enough to hold attention",
                  "Storyboard is clear enough for production",
                ],
                reviewChecklist: [
                  "Scenes map to the brief",
                  "Openings and transitions feel coherent",
                ],
                notes: null,
                attemptIds: [],
                latestAttemptId: null,
                openFindingCount: 0,
                resolvedFindingCount: 0,
              },
            ],
          },
          summary: {
            terminalState: "running",
            runStatus: "running",
            terminalReason: null,
            nextAction: "Continue Storyboard.",
            currentStepKey: "storyboard",
            currentStepTitle: "Storyboard",
            latestOutcome: "Approved for finalization",
          },
          gates: [
            {
              key: "plan",
              label: "Plan locked",
              status: "passed",
              detail: "A durable plan artifact exists.",
            },
          ],
          steps: [
            {
              stepKey: "storyboard",
              title: "Storyboard",
              objective: "Draft the storyboard",
              deliverable: "Storyboard draft with scene sequence and creative hook",
              status: "completed",
              ownerPersona: "Researcher",
              ownerMemberId: "assistant-1",
              reviewerPersona: "Reviewer",
              reviewerMemberId: "assistant-2",
              verificationMethod: "qa review",
              retryRule: "loop until passing",
              evidenceRequirements: ["storyboard"],
              qualityCriteria: [
                "Hook is strong enough to hold attention",
                "Storyboard is clear enough for production",
              ],
                reviewChecklist: [
                  "Scenes map to the brief",
                  "Openings and transitions feel coherent",
                ],
                stepLinks: [
                  {
                    linkType: "plan_summary",
                    stepKey: "storyboard",
                    messageId: "plan-msg-1",
                    anchorId: null,
                    attemptId: null,
                    traceId: null,
                    checkpointId: null,
                    label: "Plan summary",
                    isPrimary: false,
                    status: "available",
                  },
                  {
                    linkType: "plan_step",
                    stepKey: "storyboard",
                    messageId: "plan-msg-1",
                    anchorId: "plan-step-storyboard",
                    attemptId: null,
                    traceId: null,
                    checkpointId: null,
                    label: "Plan step",
                    isPrimary: true,
                    status: "available",
                  },
                  {
                    linkType: "owner_result",
                    stepKey: "storyboard",
                    messageId: "msg-1",
                    anchorId: null,
                    attemptId: "attempt-1",
                    traceId: null,
                    checkpointId: null,
                    label: "Owner result",
                    isPrimary: false,
                    status: "available",
                  },
                  {
                    linkType: "review_result",
                    stepKey: "storyboard",
                    messageId: "msg-2",
                    anchorId: null,
                    attemptId: "attempt-1",
                    traceId: null,
                    checkpointId: null,
                    label: "Review result",
                    isPrimary: false,
                    status: "available",
                  },
                  {
                    linkType: "checkpoint",
                    stepKey: "storyboard",
                    messageId: "msg-checkpoint-1",
                    anchorId: null,
                    attemptId: "attempt-1",
                    traceId: "trace-runtime-2",
                    checkpointId: "checkpoint-1",
                    label: "Checkpoint",
                    isPrimary: false,
                    status: "available",
                  },
                ],
                notes: null,
                attemptIds: ["attempt-0", "attempt-1"],
                latestAttemptId: "attempt-1",
                openFindingCount: 0,
              resolvedFindingCount: 1,
            },
            {
              stepKey: "research",
              title: "Research direction",
              objective: "Collect cultural direction references",
              deliverable: "Research brief",
              status: "planned",
              ownerPersona: "Researcher",
              ownerMemberId: "assistant-1",
              reviewerPersona: "Reviewer",
              reviewerMemberId: "assistant-2",
              verificationMethod: "qa review",
              retryRule: "loop until passing",
              evidenceRequirements: ["brief"],
              qualityCriteria: ["Direction is specific"],
              reviewChecklist: ["Brief matches objective"],
              notes: null,
              attemptIds: [],
              latestAttemptId: null,
              openFindingCount: 0,
              resolvedFindingCount: 0,
            },
          ],
          attempts: [
            {
              id: "attempt-0",
              stepKey: "storyboard",
              stepTitle: "Storyboard",
              stageType: "storyboard",
              status: "failed",
              attempt: 1,
              selectedSkillId: "storyboard-skill",
              selectedProvider: "openai",
              selectedModel: "gpt-5",
              startedAt: "2026-04-18T10:00:00.000Z",
              completedAt: "2026-04-18T10:05:00.000Z",
              summary: "Initial storyboard draft",
              reviews: [
                {
                  id: "review-0",
                  passed: false,
                  score: 0.51,
                  passThreshold: 0.75,
                  comments: "Need stronger hook",
                  repairInstructions: "Rewrite opening",
                  reviewerPersonaId: "assistant-2",
                  resolvedByAttemptId: "attempt-1",
                },
              ],
              messagePreviews: [
                {
                  id: "msg-0",
                  messageType: "work_update",
                  contentPreview: "Initial storyboard draft",
                },
              ],
              auditDetail: {
                provider: "openai",
                model: "gpt-5",
                promptRefs: ["prompt:1"],
                contextRefs: ["ctx:1"],
                toolRefs: ["tool:1"],
                rawOutputRefs: ["raw:1"],
              },
            },
            {
              id: "attempt-1",
              stepKey: "storyboard",
              stepTitle: "Storyboard",
              stageType: "storyboard",
              status: "completed",
              attempt: 2,
              selectedSkillId: "storyboard-skill",
              selectedProvider: "openai",
              selectedModel: "gpt-5",
              startedAt: "2026-04-18T10:10:00.000Z",
              completedAt: "2026-04-18T10:15:00.000Z",
              summary: "Revised storyboard with a stronger opening",
              reviews: [
                {
                  id: "review-1",
                  passed: false,
                  score: 0.62,
                  passThreshold: 0.75,
                  comments: "Need stronger hook",
                  repairInstructions: "Rewrite opening",
                  reviewerPersonaId: "assistant-2",
                  resolvedByAttemptId: "attempt-1",
                },
                {
                  id: "review-2",
                  passed: true,
                  score: 0.91,
                  passThreshold: 0.75,
                  comments: "Approved for finalization",
                  repairInstructions: null,
                  reviewerPersonaId: "assistant-2",
                },
              ],
              messagePreviews: [
                {
                  id: "msg-1",
                  messageType: "work_update",
                  contentPreview: "Revised storyboard with a stronger opening",
                },
              ],
              auditDetail: {
                provider: "openai",
                model: "gpt-5",
                promptRefs: ["prompt:2"],
                contextRefs: ["ctx:2"],
                toolRefs: ["tool:2"],
                rawOutputRefs: ["raw:2"],
              },
              runtimeMetadata: {
                runtimeEngine: "openai_agents",
                runtimeMode: "active",
                runtimeSelectionReason: "tenant_flags_active",
                runtimeTraceId: "trace-runtime-1",
                runtimeSdkVersion: "0.14.2",
                runtimeAdapterVersion: "0.1.0",
                runtimeSelectedSkillSlug: "storyboard-skill",
                runtimeStatus: "completed",
              },
            },
          ],
          timeline: [
            {
              id: "timeline-1",
              kind: "review",
              statusTone: "warning",
              title: "Changes requested",
              summary: "Need stronger hook",
              actorId: "assistant-2",
              stepKey: "storyboard",
            },
          ],
        }}
        runtimeState={{
          currentPhase: "awaiting_final_review",
          waitingReason: "Reviewer is checking the latest output",
        }}
        onFocusThread={mockOnFocusThread}
        teamMembers={[
          { id: "assistant-1", displayName: "Researcher" },
          { id: "assistant-2", displayName: "Reviewer" },
        ]}
        runStatus="running"
      />,
    );

    expect(screen.getByText("Create a Songkran video")).toBeInTheDocument();
    expect(screen.getByTestId("auto-team-current-step")).toBeInTheDocument();
    expect(screen.getByTestId("auto-team-current-step")).toHaveClass("sticky");
    expect(screen.getByTestId("auto-team-current-step")).toHaveTextContent(
      "Current step",
    );
    expect(screen.getByTestId("auto-team-plan-snapshot")).toBeInTheDocument();
    expect(
      screen.getByTestId("auto-team-current-step-jump-button"),
    ).toBeInTheDocument();
    const currentStepCard = screen.getByTestId("auto-team-current-step");
    expect(within(currentStepCard).getByText("Storyboard")).toBeInTheDocument();
    expect(
      within(currentStepCard).getByText("Continue Storyboard."),
    ).toBeInTheDocument();
    expect(screen.getByText("Plan and responsibilities")).toBeInTheDocument();
    expect(screen.getAllByText("Storyboard").length).toBeGreaterThan(0);
    const planStepCard = screen.getByTestId("auto-team-plan-step-storyboard");
    const executionStepCard = screen.getByTestId(
      "auto-team-execution-step-storyboard",
    );
    expect(planStepCard).toHaveAttribute("data-current-step", "true");
    expect(executionStepCard).toHaveAttribute("data-current-step", "true");
    expect(within(planStepCard).getByText("Evidence required")).toBeInTheDocument();
    expect(within(planStepCard).getByText("Quality criteria")).toBeInTheDocument();
    expect(within(planStepCard).getByText("Review checklist")).toBeInTheDocument();
    expect(within(planStepCard).getByText("Latest result")).toBeInTheDocument();
    expect(
      within(planStepCard).getByTestId("auto-team-plan-loop-summary-storyboard"),
    ).toHaveTextContent("Review loop");
    expect(
      within(planStepCard).getByTestId("auto-team-plan-loop-summary-storyboard"),
    ).toHaveTextContent("Attempts: 2");
    const planSnapshotStep = within(
      screen.getByTestId("auto-team-plan-snapshot"),
    ).getByTestId("auto-team-plan-snapshot-step-storyboard");
    expect(planSnapshotStep).toBeInTheDocument();
    mockOnFocusThread.mockReset();
    planSnapshotStep.click();
    expect(mockOnFocusThread).toHaveBeenCalledWith("msg-1", {
      workItemId: undefined,
      composeReply: false,
      messageAnchorId: undefined,
    });
    expect(
      within(screen.getByTestId("auto-team-plan-snapshot")).getByTestId(
        "auto-team-plan-snapshot-open-chat-storyboard",
      ),
    ).toBeInTheDocument();
    expect(
      within(planStepCard).getByTestId(
        "auto-team-plan-chat-link-storyboard-plan-msg-1",
      ),
    ).toBeInTheDocument();
    expect(
      within(planStepCard).getByTestId(
        "auto-team-plan-step-open-chat-storyboard",
      ),
    ).toBeInTheDocument();
    expect(
      within(planStepCard).getByTestId(
        "auto-team-plan-step-open-chat-storyboard",
      ),
    ).toHaveTextContent("Work update");
    expect(
      within(planStepCard).getByTestId(
        "auto-team-step-link-storyboard-plan_summary",
      ),
    ).toBeInTheDocument();
    expect(
      within(planStepCard).getByTestId(
        "auto-team-step-link-storyboard-plan_step",
      ),
    ).toBeInTheDocument();
    expect(
      within(planStepCard).getByTestId(
        "auto-team-step-link-storyboard-owner_result",
      ),
    ).toBeInTheDocument();
    expect(
      within(planStepCard).getByTestId(
        "auto-team-step-link-storyboard-review_result",
      ),
    ).toBeInTheDocument();
    expect(
      within(planStepCard).getByTestId(
        "auto-team-step-link-storyboard-checkpoint",
      ),
    ).toBeInTheDocument();
    expect(
      within(planSnapshotStep).getByTestId(
        "auto-team-plan-snapshot-open-chat-storyboard",
      ),
    ).toHaveTextContent("Work update");
    mockOnFocusThread.mockReset();
    within(planStepCard)
      .getByTestId("auto-team-plan-chat-link-storyboard-plan-msg-1")
      .click();
    expect(mockOnFocusThread).toHaveBeenCalledWith("plan-msg-1", {
      workItemId: undefined,
      composeReply: false,
      messageAnchorId: "plan-step-storyboard",
    });
    mockOnFocusThread.mockReset();
    within(planStepCard)
      .getByTestId("auto-team-plan-step-open-chat-storyboard")
      .click();
    expect(mockOnFocusThread).toHaveBeenCalledWith("msg-1", {
      workItemId: undefined,
      composeReply: false,
      messageAnchorId: undefined,
    });
    mockOnFocusThread.mockReset();
    planStepCard.click();
    expect(mockOnFocusThread).toHaveBeenCalledWith("msg-1", {
      workItemId: undefined,
      composeReply: false,
      messageAnchorId: undefined,
    });
    mockOnFocusThread.mockReset();
    const researchExecutionButton = within(planStepCard).getByTestId(
      "auto-team-plan-open-execution-storyboard",
    );
    researchExecutionButton.click();
    expect(getElementByIdSpy).toHaveBeenCalledWith(
      "auto-team-execution-step-storyboard",
    );
    expect(
      screen.getByTestId("auto-team-current-step-jump-button"),
    ).toBeEnabled();
    screen.getByTestId("auto-team-current-step-jump-button").click();
    expect(getElementByIdSpy).toHaveBeenCalledWith(
      "auto-team-execution-step-storyboard",
    );
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
      }),
    );
    getElementByIdSpy.mockClear();
    scrollIntoView.mockClear();
    const researchPlanSnapshotStep = within(
      screen.getByTestId("auto-team-plan-snapshot"),
    ).getByTestId("auto-team-plan-snapshot-step-research");
    researchPlanSnapshotStep.click();
    expect(mockOnFocusThread).toHaveBeenCalledWith("plan-msg-1", {
      workItemId: undefined,
      composeReply: false,
      messageAnchorId: "plan-step-research",
    });
    mockOnFocusThread.mockReset();
    expect(
      within(researchPlanSnapshotStep).getByTestId(
        "auto-team-plan-snapshot-open-chat-research",
      ),
    ).toHaveTextContent("Plan anchor");
    within(researchPlanSnapshotStep)
      .getByTestId("auto-team-plan-snapshot-open-execution-research")
      .click();
    expect(getElementByIdSpy).toHaveBeenCalledWith(
      "auto-team-execution-step-research",
    );
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
      }),
    );
    expect(
      screen.getAllByText(/Storyboard draft with scene sequence and creative hook/i)
        .length,
    ).toBeGreaterThan(0);
    expect(
      within(planStepCard).getByTestId("auto-team-plan-chat-link-storyboard-msg-1"),
    ).toBeInTheDocument();
    expect(screen.getByText("Earlier attempts")).toBeInTheDocument();
    expect(screen.getAllByText("Need stronger hook").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Revised storyboard with a stronger opening/i).length
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Detailed audit metadata/i)).toBeInTheDocument();
    expect(screen.getByText(/Runtime metadata/i)).toBeInTheDocument();
    expect(screen.getByText(/openai_agents \/ active/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Changes requested/i).length).toBeGreaterThan(0);
  });

  it("links a step to the exact step-result chat line when the run chat already has it", () => {
    render(
      <AutoTeamLedgerPanel
        ledger={{
          object: "auto_team_ledger",
          accessLevel: "detailed",
          derivedState: "structured",
          objective: "Create a Songkran video",
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
          chatPlan: {
            messageId: "plan-msg-1",
            createdAt: "2026-04-18T10:00:00.000Z",
            messagePreview: "Plan and responsibilities draft",
            objective: "Create a Songkran video",
            status: "ready",
            reviewStatus: "passed",
            reviewIteration: 1,
            reviewScore: 0.9,
            reviewRecommendation: "Looks good to proceed",
            reviewIssues: [],
            stepCount: 1,
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
                verificationMethod: "review",
                retryRule: "loop until passing",
                evidenceRequirements: ["storyboard"],
                qualityCriteria: ["clear"],
                reviewChecklist: ["aligned"],
                notes: null,
                attemptIds: [],
                latestAttemptId: null,
                openFindingCount: 0,
                resolvedFindingCount: 0,
              },
            ],
          },
          summary: {
            terminalState: "running",
            runStatus: "running",
            terminalReason: null,
            nextAction: "Continue Storyboard.",
            currentStepKey: "storyboard",
            currentStepTitle: "Storyboard",
            latestOutcome: "Working",
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
              verificationMethod: "review",
              retryRule: "loop until passing",
              evidenceRequirements: ["storyboard"],
              qualityCriteria: ["clear"],
              reviewChecklist: ["aligned"],
              notes: null,
              attemptIds: [],
              latestAttemptId: null,
              openFindingCount: 0,
              resolvedFindingCount: 0,
            },
          ],
          attempts: [],
          timeline: [],
        }}
        roomMessages={[
          {
            id: "plan-msg-1",
            roomId: "room-1",
            runId: "run-1",
            senderType: "system",
            recipientType: "all",
            turnType: "summary",
            visibility: "summary_only",
            content: "Plan and responsibilities draft\n1. Storyboard ...",
            summaryContent: "Plan and responsibilities draft",
            metadataJson: {
              messageType: "plan_summary",
              planStatus: "ready",
              reviewStatus: "passed",
              reviewIteration: 1,
              reviewScore: 0.9,
              reviewRecommendation: "Looks good to proceed",
              reviewIssues: [],
              details: {
                objective: "Create a Songkran video",
                planStatus: "ready",
                reviewStatus: "passed",
                reviewIteration: 1,
                reviewScore: 0.9,
                reviewRecommendation: "Looks good to proceed",
                reviewIssues: [],
                steps: [
                  {
                    stepKey: "storyboard",
                    title: "Storyboard",
                    objective: "Draft the storyboard",
                    deliverable: "Storyboard draft",
                    ownerPersona: "Researcher",
                    reviewerPersona: "Reviewer",
                    verificationMethod: "review",
                    retryRule: "loop until passing",
                    evidenceRequirements: ["storyboard"],
                    qualityCriteria: ["clear"],
                    reviewChecklist: ["aligned"],
                    status: "planned",
                  },
                ],
              },
            },
            createdAt: new Date("2026-04-18T10:00:00.000Z"),
          },
          {
            id: "step-msg-1",
            roomId: "room-1",
            runId: "run-1",
            senderType: "assistant",
            senderAssistantId: "assistant-1",
            recipientType: "all",
            turnType: "summary",
            visibility: "milestone",
            content: "Storyboard draft complete",
            summaryContent: "Storyboard draft complete",
            metadataJson: {
              messageType: "step_result",
              details: {
                stepKey: "storyboard",
                stepTitle: "Storyboard",
                stepObjective: "Draft the storyboard",
                stepDeliverable: "Storyboard draft",
                stepOwnerPersona: "Researcher",
                stepReviewerPersona: "Reviewer",
                stepVerificationMethod: "review",
                stepRetryRule: "loop until passing",
                stepEvidenceRequirements: ["storyboard"],
                stepQualityCriteria: ["clear"],
                stepReviewChecklist: ["aligned"],
                stepResultSummary: "Storyboard draft complete",
                stepReviewStatus: "pending",
                stepNextAction: "Await reviewer inspection for this step.",
              },
            },
            createdAt: new Date("2026-04-18T10:06:00.000Z"),
          },
        ] as any}
        runtimeState={{
          currentPhase: "awaiting_review",
          waitingReason: "Reviewer is checking the latest output",
        }}
        onFocusThread={mockOnFocusThread}
        teamMembers={[
          { id: "assistant-1", displayName: "Researcher" },
          { id: "assistant-2", displayName: "Reviewer" },
        ]}
        runStatus="running"
      />,
    );

    const planStepCard = screen.getByTestId("auto-team-plan-step-storyboard");
    expect(
      within(planStepCard).getByTestId("auto-team-plan-step-open-chat-storyboard"),
    ).toHaveTextContent("Step result");
    mockOnFocusThread.mockReset();
    within(planStepCard)
      .getByTestId("auto-team-plan-step-open-chat-storyboard")
      .click();
    expect(mockOnFocusThread).toHaveBeenCalledWith("step-msg-1", {
      workItemId: undefined,
      composeReply: false,
      messageAnchorId: undefined,
    });
    expect(
      within(planStepCard).getByTestId("auto-team-plan-chat-link-storyboard-step-msg-1"),
    ).toBeInTheDocument();
  });

  it("renders a chat draft immediately when audited steps are missing", () => {
    render(
      <AutoTeamLedgerPanel
        ledger={{
          object: "auto_team_ledger",
          accessLevel: "detailed",
          derivedState: "structured",
          objective: "Create a Songkran video",
          plan: {
            status: "executing",
            reviewStatus: "pending",
            reviewIteration: 0,
            stepCount: 0,
            explorationEnabled: false,
            source: "chat",
            reviewScore: null,
            reviewRecommendation: null,
            reviewIssues: [],
            sourceMessageId: "plan-msg-1",
            sourceMessageCreatedAt: "2026-04-18T10:00:00.000Z",
          },
          chatPlan: {
            messageId: "plan-msg-1",
            createdAt: "2026-04-18T10:00:00.000Z",
            messagePreview: "Plan and responsibilities draft",
            objective: "Create a Songkran video",
            status: "ready",
            reviewStatus: "passed",
            reviewIteration: 1,
            reviewScore: 0.9,
            reviewRecommendation: "Looks good to proceed",
            reviewIssues: [],
            stepCount: 1,
            steps: [
              {
                stepKey: "research",
                title: "Research direction",
                objective: "Define the cultural direction",
                deliverable: "Research brief",
                status: "planned",
                ownerPersona: "Researcher",
                ownerMemberId: "assistant-1",
                reviewerPersona: "Director",
                reviewerMemberId: "assistant-2",
                verificationMethod: "review",
                retryRule: "retry until approved",
                evidenceRequirements: ["brief"],
                qualityCriteria: ["clear direction"],
                reviewChecklist: ["brief aligned"],
                notes: null,
                attemptIds: [],
                latestAttemptId: null,
                openFindingCount: 0,
                resolvedFindingCount: 0,
              },
            ],
          },
          summary: {
            terminalState: "running",
            runStatus: "running",
            terminalReason: null,
            nextAction: "Planning in progress.",
            currentStepKey: null,
            currentStepTitle: null,
            latestOutcome: null,
          },
          gates: [],
          steps: [],
          attempts: [],
          timeline: [],
        }}
        runtimeState={{
          currentPhase: "planning",
          waitingReason: null,
        }}
        teamMembers={[]}
        runStatus="running"
      />,
    );

    expect(
      screen.getByText("Plan snapshot"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Showing the plan directly from chat so you can inspect it immediately\./i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Plan and responsibilities")).toBeInTheDocument();
    expect(screen.getByTestId("auto-team-plan-snapshot")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("auto-team-plan-snapshot")).getByText(/chat draft/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Draft plan loaded from chat\. Audited execution/i),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("auto-team-plan-snapshot-step-research"),
    ).toBeInTheDocument();
  });

  it("renders a plan snapshot directly from room messages when the ledger draft is missing", () => {
    const roomPlanMessage = {
      id: "plan-msg-room",
      roomId: "room-123",
      runId: "run-1",
      senderType: "system",
      senderUserId: 7,
      senderAssistantId: "system",
      recipientType: "all",
      turnType: "summary",
      visibility: "summary_only",
      content: "Plan and responsibilities draft from chat.",
      summaryContent: "Plan and responsibilities draft from chat.",
      createdAt: "2026-04-18T09:59:00.000Z",
      metadataJson: {
        messageType: "plan_summary",
        details: {
          planStatus: "ready",
          reviewStatus: "passed",
          reviewIteration: 1,
          reviewScore: 0.9,
          reviewRecommendation: "Looks good to proceed",
          reviewIssues: [],
          stepCount: 1,
          steps: [
            {
              stepKey: "research",
              title: "Research direction",
              objective: "Define the cultural direction",
              deliverable: "Research brief",
              status: "planned",
              ownerPersona: "Researcher",
              ownerMemberId: "assistant-1",
              reviewerPersona: "Director",
              reviewerMemberId: "assistant-2",
              verificationMethod: "review",
              retryRule: "retry until approved",
              evidenceRequirements: ["brief"],
              qualityCriteria: ["clear direction"],
              reviewChecklist: ["brief aligned"],
              notes: null,
            },
          ],
        },
      },
    };

    render(
      <AutoTeamLedgerPanel
        ledger={{
          object: "auto_team_ledger",
          accessLevel: "detailed",
          derivedState: "structured",
          objective: "Create a Songkran video",
          plan: null,
          summary: {
            terminalState: "running",
            runStatus: "running",
            terminalReason: null,
            nextAction: "Planning in progress.",
            currentStepKey: null,
            currentStepTitle: null,
            latestOutcome: null,
          },
          gates: [],
          steps: [],
          attempts: [],
          timeline: [],
        }}
        roomMessages={[roomPlanMessage as any]}
        runtimeState={{
          currentPhase: "planning",
          waitingReason: null,
        }}
        teamMembers={[]}
        runStatus="running"
        onFocusThread={mockOnFocusThread}
      />,
    );

    expect(screen.getByText("Plan snapshot")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Showing the plan directly from chat so you can inspect it immediately/i,
      ),
    ).toBeInTheDocument();
    const planSnapshot = screen.getByTestId("auto-team-plan-snapshot");
    expect(within(planSnapshot).getByText(/chat draft/i)).toBeInTheDocument();
    expect(
      within(planSnapshot).getByTestId("auto-team-plan-snapshot-step-research"),
    ).toBeInTheDocument();
    mockOnFocusThread.mockReset();
    within(planSnapshot).getByTestId("auto-team-plan-snapshot-step-research").click();
    expect(mockOnFocusThread).toHaveBeenCalledWith("plan-msg-room", {
      workItemId: undefined,
      composeReply: false,
      messageAnchorId: "plan-step-research",
    });
  });

  it("marks error-driven retries as a system issue", () => {
    render(
      <AutoTeamLedgerPanel
        ledger={{
          object: "auto_team_ledger",
          accessLevel: "detailed",
          derivedState: "structured",
          objective: "Create a Songkran video",
          plan: {
            status: "executing",
            reviewStatus: "passed",
            reviewIteration: 1,
            stepCount: 1,
            explorationEnabled: false,
          },
          summary: {
            terminalState: "running",
            runStatus: "running",
            terminalReason: null,
            nextAction: "Continue production.",
            currentStepKey: "production",
            currentStepTitle: "Production",
            latestOutcome: "Recovered after retry",
          },
          gates: [],
          steps: [
            {
              stepKey: "production",
              title: "Production",
              objective: "Render the final video",
              deliverable: "Rendered video file",
              status: "in_progress",
              ownerPersona: "Producer",
              ownerMemberId: "assistant-1",
              reviewerPersona: "Reviewer",
              reviewerMemberId: "assistant-2",
              verificationMethod: "qa review",
              retryRule: "retry on provider failure",
              evidenceRequirements: ["render log"],
              qualityCriteria: ["Video renders successfully"],
              reviewChecklist: ["No provider errors"],
              notes: null,
              attemptIds: ["attempt-1", "attempt-2"],
              latestAttemptId: "attempt-2",
              openFindingCount: 0,
              resolvedFindingCount: 0,
            },
          ],
          attempts: [
            {
              id: "attempt-1",
              stepKey: "production",
              stepTitle: "Production",
              stageType: "production",
              status: "failed",
              attempt: 1,
              selectedSkillId: "video-render",
              selectedProvider: "openai",
              selectedModel: "gpt-5",
              startedAt: "2026-04-18T10:00:00.000Z",
              completedAt: "2026-04-18T10:01:00.000Z",
              blockedReason: "provider_timeout",
              errorMessage: "Provider timed out while rendering",
              summary: "First render attempt failed",
              reviews: [],
              messagePreviews: [],
              auditDetail: {
                provider: "openai",
                model: "gpt-5",
                promptRefs: [],
                contextRefs: [],
                toolRefs: [],
                rawOutputRefs: [],
              },
            },
            {
              id: "attempt-2",
              stepKey: "production",
              stepTitle: "Production",
              stageType: "production",
              status: "completed",
              attempt: 2,
              selectedSkillId: "video-render",
              selectedProvider: "openai",
              selectedModel: "gpt-5",
              startedAt: "2026-04-18T10:02:00.000Z",
              completedAt: "2026-04-18T10:05:00.000Z",
              summary: "Recovered after retry",
              reviews: [],
              messagePreviews: [],
              auditDetail: {
                provider: "openai",
                model: "gpt-5",
                promptRefs: [],
                contextRefs: [],
                toolRefs: [],
                rawOutputRefs: [],
              },
            },
          ],
          timeline: [],
        }}
        runtimeState={{
          currentPhase: "executing",
          waitingReason: null,
        }}
        teamMembers={[
          { id: "assistant-1", displayName: "Producer" },
          { id: "assistant-2", displayName: "Reviewer" },
        ]}
        runStatus="running"
      />,
    );

    const loopSummary = screen.getByTestId(
      "auto-team-step-loop-summary-production",
    );
    expect(loopSummary).toHaveTextContent("System issue");
    expect(loopSummary).toHaveTextContent("1 errored");
    expect(loopSummary).toHaveTextContent("Attempts: 2");
    expect(screen.getByText("Earlier attempts")).toBeInTheDocument();
    expect(screen.getByText(/Provider timed out while rendering/i)).toBeInTheDocument();
  });
});
