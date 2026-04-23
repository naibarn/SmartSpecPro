/**
 * @vitest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamRoomView } from "../TeamRoomView";

const mockUseRunStream = vi.fn();
let mockTeamRoomMessages: any[] = [];

vi.mock("@/hooks/useRunStream", () => ({
  useRunStream: (options: unknown) => mockUseRunStream(options),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 7, name: "Test User", email: "test@example.com" },
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      teamRoom: {
        getMessages: { invalidate: vi.fn() },
        viewerState: { invalidate: vi.fn() },
      },
      teamWorkItem: { listByRoom: { invalidate: vi.fn() } },
      teamRun: { get: { invalidate: vi.fn() } },
    }),
    teamRoom: {
      getMessages: {
        useQuery: () => ({ data: mockTeamRoomMessages }),
      },
      viewerState: {
        useQuery: () => ({ data: null }),
      },
      markViewed: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
    },
    teamWorkItem: {
      listByRoom: {
        useQuery: () => ({ data: [], isLoading: false }),
      },
      create: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
      advanceWorkflow: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
      approve: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
      reject: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
    },
  },
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("TeamRoomView room context", () => {
  beforeEach(() => {
    mockTeamRoomMessages = [];
    mockUseRunStream.mockReset();
  });

  it("shows the current room metadata and selected skill route", () => {
    mockUseRunStream.mockReturnValue({ connected: false });

    render(
      <TeamRoomView
        roomId="room-123"
        teamId="team-1"
        runId="run-1"
        teamName="Creative Content 1"
        roomGoal="Produce a 24-30 second festival video"
        roomLanguage="en"
        roomCreatedAt="2026-04-15T10:00:00.000Z"
        roomType="auto_team"
        roomAutonomy="Fully auto"
        runMode="fully_auto"
        selectedSkillId="skill-orchestrator"
        routeReason="auto_team_orchestrator"
        actors={[
          {
            id: "assistant-1",
            displayName: "Content Director",
            memberKind: "assistant",
            memberRole: "orchestrator",
            isLead: true,
          },
        ]}
        runStatus="running"
        onStartRun={vi.fn()}
      />
    );

    expect(screen.getByText("auto_team")).toBeInTheDocument();
    expect(screen.getAllByText("English").length).toBeGreaterThan(0);
    expect(screen.getByText("Fully auto")).toBeInTheDocument();
    expect(screen.getByText("fully_auto")).toBeInTheDocument();
    expect(screen.getByText(/Room ID/i)).toBeInTheDocument();
    expect(screen.getAllByText(/room-123/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Current objective/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Produce a 24-30 second festival video/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Skill: skill-orchestrator/i)).toBeInTheDocument();
    expect(
      screen.getByTitle("Route reason: auto_team_orchestrator")
    ).toBeInTheDocument();
    expect(screen.getByText("Skill orchestrator")).toBeInTheDocument();
    expect(screen.getByText(/Created/i)).toBeInTheDocument();
  });

  it("renders plan review details and step result audit cards", () => {
    mockUseRunStream.mockReturnValue({ connected: false });
    mockTeamRoomMessages = [
      {
        id: "msg-plan",
        roomId: "room-123",
        runId: "run-1",
        senderType: "system",
        senderUserId: 7,
        senderAssistantId: "system",
        recipientType: "all",
        turnType: "summary",
        visibility: "summary_only",
        content: "Plan drafted and reviewed.",
        summaryContent: "Plan drafted and reviewed.",
        createdAt: "2026-04-19T10:00:00.000Z",
        metadataJson: {
          messageType: "plan_summary",
          reviewStatus: "passed",
          reviewScore: 0.92,
          reviewIteration: 2,
          reviewRecommendation: "Looks good to proceed.",
          reviewIssues: ["Tighten the scene pacing."],
          planStatus: "locked",
          details: {
            steps: [
              {
                stepKey: "research",
                title: "Research direction",
                objective: "Define the cultural direction",
                deliverable: "Research brief",
                ownerPersona: "Trend Researcher",
                reviewerPersona: "Content Director",
                verificationMethod: "review",
                retryRule: "iterate until approved",
                evidenceRequirements: ["brief"],
                qualityCriteria: ["direction is specific"],
                reviewChecklist: ["brief aligned"],
                status: "passed",
              },
            ],
            reviewStatus: "passed",
            reviewScore: 0.92,
            reviewIteration: 2,
            reviewRecommendation: "Looks good to proceed.",
            reviewIssues: ["Tighten the scene pacing."],
            planStatus: "locked",
          },
        },
      },
      {
        id: "msg-step",
        roomId: "room-123",
        runId: "run-1",
        senderType: "system",
        senderUserId: 7,
        senderAssistantId: "system",
        recipientType: "all",
        turnType: "summary",
        visibility: "milestone",
        content: "Storyboard complete and awaiting review.",
        summaryContent: "Storyboard complete and awaiting review.",
        createdAt: "2026-04-19T10:05:00.000Z",
        metadataJson: {
          messageType: "step_result",
          reviewStatus: "failed",
          reviewScore: 0.58,
          details: {
            stepResultPhase: "review",
            stepKey: "storyboard",
            stepTitle: "Develop storyboard",
            stepObjective: "Create storyboard for Veo 3.1",
            stepDeliverable: "Storyboard document",
            stepOwnerPersona: "Creative Copywriter",
            stepOwnerMemberId: "assistant-2",
            stepReviewerPersona: "Video Producer",
            stepReviewerMemberId: "assistant-3",
            stepAttempt: 2,
            stepVerificationMethod: "Manual review",
            stepRetryRule: "Revise and resubmit.",
            stepResultSummary: "Storyboard complete and awaiting review.",
            stepReviewStatus: "failed",
            stepReviewScore: 0.58,
            stepReviewNote: "Need a tighter shot list.",
            stepRepairInstructions: "Reduce the number of scenes.",
            stepNextAction: "Repair this step and resubmit for review.",
          },
        },
      },
    ];

    render(
      <TeamRoomView
        roomId="room-123"
        teamId="team-1"
        runId="run-1"
        teamName="Creative Content 1"
        roomGoal="Produce a 24-30 second festival video"
        roomLanguage="en"
        roomCreatedAt="2026-04-15T10:00:00.000Z"
        roomType="auto_team"
        roomAutonomy="Fully auto"
        runMode="fully_auto"
        selectedSkillId="skill-orchestrator"
        routeReason="auto_team_orchestrator"
        viewMode="transparent"
        actors={[
          {
            id: "assistant-1",
            displayName: "Content Director",
            memberKind: "assistant",
            memberRole: "orchestrator",
            isLead: true,
          },
        ]}
        runStatus="running"
        onStartRun={vi.fn()}
      />
    );

    expect(screen.getByText("Plan review summary")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("team-room-message-msg-plan")).getByTestId(
        "team-room-loop-badge-msg-plan"
      )
    ).toHaveTextContent("Review loop · 2x");
    expect(
      within(screen.getByTestId("team-room-message-msg-plan")).getByText(
        "Plan steps",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("team-room-message-msg-plan")).getByText(
        /Research direction/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("team-room-message-msg-plan")).getByText(
        /Earlier passes were revised after reviewer feedback before continuing\./i
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Review passed · 0.92")).toBeInTheDocument();
    expect(screen.getByText("Looks good to proceed.")).toBeInTheDocument();
    expect(screen.getByText("Tighten the scene pacing.")).toBeInTheDocument();
    expect(screen.getByText("Develop storyboard")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("team-room-message-msg-step")).getByTestId(
        "team-room-loop-badge-msg-step"
      )
    ).toHaveTextContent("Review loop · 2x");
    expect(
      within(screen.getByTestId("team-room-message-msg-step")).getByText(
        /Earlier passes were revised after reviewer feedback before continuing\./i
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Review failed · 0.58")).toBeInTheDocument();
    expect(screen.getByText("Need a tighter shot list.")).toBeInTheDocument();
    expect(screen.getByText("Reduce the number of scenes.")).toBeInTheDocument();
  });

  it("alternates persona messages left and right and expands long messages on demand", () => {
    mockUseRunStream.mockReturnValue({ connected: false });
    const longMessage = [
      "Opening summary from Content Director about the visual direction and sequencing.",
      "This paragraph intentionally stays long so the room shows a compact preview first.",
      "The final detail should only appear after expanding the message.",
      "FULL DETAIL: use a sunrise-to-festival arc with a warm water-splash transition.",
    ].join(" ");

    mockTeamRoomMessages = [
      {
        id: "msg-a",
        roomId: "room-123",
        runId: "run-1",
        senderType: "assistant",
        senderUserId: 7,
        senderAssistantId: "assistant-1",
        recipientType: "all",
        turnType: "execution_update",
        visibility: "transparent",
        content: longMessage,
        summaryContent: "Short summary from Content Director.",
        createdAt: "2026-04-19T10:00:00.000Z",
        metadataJson: {
          messageType: "work_update",
        },
      },
      {
        id: "msg-b",
        roomId: "room-123",
        runId: "run-1",
        senderType: "assistant",
        senderUserId: 7,
        senderAssistantId: "assistant-2",
        recipientType: "all",
        turnType: "execution_update",
        visibility: "transparent",
        content: "Trend Researcher replies with a tighter research direction.",
        summaryContent: "Trend Researcher replies.",
        createdAt: "2026-04-19T10:01:00.000Z",
        metadataJson: {
          messageType: "work_update",
        },
      },
    ];

    render(
      <TeamRoomView
        roomId="room-123"
        teamId="team-1"
        runId="run-1"
        teamName="Creative Content 1"
        roomGoal="Produce a 24-30 second festival video"
        roomLanguage="en"
        roomCreatedAt="2026-04-15T10:00:00.000Z"
        roomType="auto_team"
        roomAutonomy="Fully auto"
        runMode="fully_auto"
        selectedSkillId="skill-orchestrator"
        routeReason="auto_team_orchestrator"
        viewMode="transparent"
        actors={[
          {
            id: "assistant-1",
            displayName: "Content Director",
            memberKind: "assistant",
            memberRole: "orchestrator",
            isLead: true,
          },
          {
            id: "assistant-2",
            displayName: "Trend Researcher",
            memberKind: "assistant",
            memberRole: "researcher",
          },
        ]}
        runStatus="running"
        onStartRun={vi.fn()}
      />
    );

    expect(screen.getByTestId("team-room-message-msg-a")).toHaveClass(
      "flex-row"
    );
    expect(screen.getByTestId("team-room-message-msg-b")).toHaveClass(
      "flex-row-reverse"
    );
    expect(screen.getByRole("button", { name: /Show more/i })).toBeInTheDocument();
    expect(
      screen.queryByText(/FULL DETAIL: use a sunrise-to-festival arc/i)
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Show more/i }));

    expect(
      screen.getByText(/FULL DETAIL: use a sunrise-to-festival arc/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show less/i })).toBeInTheDocument();
  });
});
