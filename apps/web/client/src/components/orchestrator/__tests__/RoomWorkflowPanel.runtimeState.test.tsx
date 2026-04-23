import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoomWorkflowPanel } from "../RoomWorkflowPanel";

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const dictionary: Record<string, string> = {
        "orchestrator.workflow.title": "Workflow",
        "orchestrator.workflow.description": "Workflow description",
        "orchestrator.workflow.currentObjective": "Current objective",
        "orchestrator.workflow.count.open": "Open",
        "orchestrator.workflow.count.inReview": "In review",
        "orchestrator.workflow.count.awaitingApproval": "Awaiting approval",
        "orchestrator.workflow.count.completed": "Completed",
        "orchestrator.workflow.loading": "Loading",
        "orchestrator.workflow.emptyTitle": "No work items",
        "orchestrator.workflow.emptyDescription": "No items",
        "orchestrator.workflow.status.planned": "Planned",
        "orchestrator.workflow.status.in_progress": "In progress",
        "orchestrator.workflow.status.in_review": "In review",
        "orchestrator.workflow.status.needs_revision": "Needs revision",
        "orchestrator.workflow.status.awaiting_approval": "Awaiting approval",
        "orchestrator.workflow.status.completed": "Completed",
        "orchestrator.workflow.status.failed": "Failed",
        "orchestrator.workflow.status.blocked": "Blocked",
        "orchestrator.workflow.status.cancelled": "Cancelled",
        "orchestrator.workflow.status.superseded": "Superseded",
        "orchestrator.workflow.status.unknown": "Unknown",
        "orchestrator.workflow.recommended.reviewNextStep": "Review next step",
        "orchestrator.workflow.artifactCount": "{{count}} artifacts",
        "orchestrator.workflow.draftReady": "Draft ready",
        "orchestrator.workflow.researchLabel": "Research",
        "orchestrator.workflow.reviewLabel": "Review",
        "orchestrator.workflow.approvalLabel": "Approval",
        "orchestrator.workflow.unassigned": "Unassigned",
        "orchestrator.workflow.updatedAt": "Updated {{value}}",
        "orchestrator.workflow.pause.runPaused": "Run paused",
      };
      const template = dictionary[key] ?? key;
      if (!params) return template;
      return Object.entries(params).reduce(
        (acc, [paramKey, value]) =>
          acc.replaceAll(`{{${paramKey}}}`, String(value)),
        template
      );
    },
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      teamWorkItem: { listByRoom: { invalidate: vi.fn() } },
      teamRun: { get: { invalidate: vi.fn() } },
      teamRoom: {
        getMessages: { invalidate: vi.fn() },
        viewerState: { invalidate: vi.fn() },
        getAutoTeamLedger: { invalidate: vi.fn() },
      },
    }),
    teamWorkItem: {
      listByRoom: {
        useQuery: () => ({
          data: [],
          isLoading: false,
          error: null,
        }),
      },
      advanceWorkflow: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      approve: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
      reject: {
        useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
      },
    },
    teamRoom: {
      getAutoTeamLedger: {
        useQuery: () => ({ data: null }),
      },
      getMessages: {
        useQuery: () => ({ data: [] }),
      },
      viewerState: {
        useQuery: () => ({ data: null }),
      },
    },
  },
}));

describe("RoomWorkflowPanel runtime visibility", () => {
  it("renders the durable runtime summary for the active run", async () => {
    const user = userEvent.setup();
    render(
      <RoomWorkflowPanel
        roomId="room-1"
        runId="run-1"
        roomGoal="Launch objective"
        runtimeState={{
          currentPhase: "waiting_for_poll",
          waitingReason: "polling media job",
          policyGateReason: "evidence missing",
          selectedSkillId: "skill-orchestrator",
          routeReason: "auto_team_orchestrator",
          nextPollAt: "2026-04-15T13:00:00.000Z",
          choiceDeadlineAt: null,
          finalReviewDeadlineAt: null,
          riskClass: "medium",
          reviewerPersona: "qa_validator",
          verificationState: "pending",
          finalReview: null,
          evidenceRefs: ["worker-job:job-1"],
          planArtifact: {
            version: 1,
            runId: "run-1",
            roomId: "room-1",
            teamId: "team-1",
            caseId: null,
            requestId: null,
            objective: "Launch objective",
            source: "team_run",
            status: "executing",
            generatedAt: "2026-04-15T12:00:00.000Z",
            lastUpdatedAt: "2026-04-15T12:30:00.000Z",
            exploration: {
              selectedCandidateId: "balanced-hybrid",
              selectionReason:
                "Balanced hybrid keeps exploration bounded while still committing to execution.",
              criteria: ["safety", "speed", "determinism", "evidence quality"],
              candidates: [
                {
                  candidateId: "workflow-first",
                  title: "Workflow first",
                  strategy: "deterministic, review-heavy execution",
                  summary: "Keep the path narrow and validated.",
                  strengths: ["tight evidence discipline"],
                  tradeoffs: ["less exploratory breadth"],
                  riskClass: "medium",
                },
                {
                  candidateId: "balanced-hybrid",
                  title: "Balanced hybrid",
                  strategy: "bounded exploration then commit",
                  summary: "Explore enough to avoid a brittle first answer.",
                  strengths: ["balance of creativity and control"],
                  tradeoffs: ["not fully exhaustive"],
                  riskClass: "medium",
                },
              ],
            },
            steps: [
              {
                stepKey: "plan-decompose",
                title: "Plan and decompose the objective",
                objective: "Launch objective",
                ownerPersona: "Lead",
                ownerMemberId: "assistant-1",
                reviewerPersona: "qa_validator",
                reviewerMemberId: "assistant-1",
                verificationMethod: "review",
                retryRule:
                  "Refine the plan until every subtask has an owner, reviewer, evidence, and repair rule.",
                evidenceRequirements: [
                  "durable plan artifact",
                  "subtask breakdown",
                  "review note",
                ],
                status: "completed",
                evidenceRefs: ["summary:summary-1"],
                notes: "Includes kickoff plan.",
              },
            ],
            evidenceRefs: ["summary:summary-1"],
            planEvidenceRefs: ["summary:summary-1"],
            reviewerMatrix: [],
            review: {
              status: "passed",
              iteration: 1,
              reviewedAt: "2026-04-15T12:31:00.000Z",
              reviewerPersona: "qa_validator",
              issues: [],
              score: 0.92,
              recommendation: "Looks solid; proceed to execution.",
            },
          },
          workOsLinkage: {
            teamId: "team-1",
            roomId: "room-1",
            projectedWorkOsState: "in_progress",
          },
          statusBridge: {
            teamRunStatus: "running",
            workOsState: "in_progress",
          },
        }}
        teamMembers={[
          {
            id: "assistant-1",
            displayName: "Lead",
            memberKind: "assistant",
            memberRole: "orchestrator",
            isLead: true,
          },
        ]}
        onChooseExplorationCandidate={vi.fn()}
        onRejectExplorationCandidates={vi.fn()}
      />
    );

    expect(screen.getByText("Launch objective")).toBeInTheDocument();
    expect(screen.getByText(/Phase: waiting_for_poll/i)).toBeInTheDocument();
    expect(
      screen.getByTitle("Policy gate (Evidence): evidence missing")
    ).toHaveClass("border-amber-200", "bg-amber-50", "text-amber-700");
    expect(screen.getByText(/Waiting: polling media job/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Policy gate: evidence missing/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Skill: skill-orchestrator/i)).toBeInTheDocument();
    expect(screen.getByText("Skill orchestrator")).toBeInTheDocument();
    expect(
      screen.getByText(/Route: Skill orchestrator · auto_team_orchestrator/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Reviewer: qa_validator/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Work OS mirror: in_progress/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Plan v1/i)).toBeInTheDocument();
    expect(
      screen.getByTitle("Candidate plan comparison summary")
    ).toBeInTheDocument();
    expect(screen.getByText(/Selected: balanced-hybrid/i)).toBeInTheDocument();
    expect(screen.getByText(/Review: Passed/i)).toBeInTheDocument();
    expect(screen.getByText(/Score: 0.92/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Proceed/i)[0]).toHaveClass(
      "border-emerald-200",
      "bg-emerald-50",
      "text-emerald-700"
    );
    expect(screen.getByText(/Loops: 1/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Looks solid; proceed to execution\./i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Score: 0.92/i)).toHaveClass(
      "border-emerald-200",
      "bg-emerald-50",
      "text-emerald-700"
    );
    expect(screen.getByRole("tab", { name: "Summary" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Evidence" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Raw" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Evidence" }));
    expect(
      screen.getByText(/Plan and decompose the objective/i)
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Details" }));
    expect(
      screen.getByText(
        /Evidence: durable plan artifact, subtask breakdown, review note/i
      )
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Raw" }));
    expect(
      screen.getByText(/"currentPhase": "waiting_for_poll"/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/"selectedCandidateId": "balanced-hybrid"/i)
    ).toBeInTheDocument();
  });

  it("shows the human choice window when exploration needs a decision", () => {
    render(
      <RoomWorkflowPanel
        roomId="room-1"
        runId="run-1"
        roomGoal="Launch objective"
        runtimeState={{
          currentPhase: "awaiting_human_choice",
          waitingReason: "human selection required",
          policyGateReason: null,
          nextPollAt: "2026-04-15T13:00:00.000Z",
          choiceDeadlineAt: "2026-04-15T13:05:00.000Z",
          finalReviewDeadlineAt: null,
          riskClass: "medium",
          reviewerPersona: "qa_validator",
          verificationState: "pending",
          finalReview: null,
          evidenceRefs: [],
          planArtifact: {
            version: 1,
            runId: "run-1",
            roomId: "room-1",
            teamId: "team-1",
            caseId: null,
            requestId: null,
            objective: "Launch objective",
            source: "team_run",
            status: "planning",
            generatedAt: "2026-04-15T12:00:00.000Z",
            lastUpdatedAt: "2026-04-15T12:30:00.000Z",
            exploration: {
              selectedCandidateId: "workflow-first",
              selectionReason: "Waiting for human choice",
              criteria: ["safety", "speed"],
              candidates: [
                {
                  candidateId: "workflow-first",
                  title: "Workflow first",
                  strategy: "deterministic",
                  summary: "Stay narrow.",
                  strengths: ["safe"],
                  tradeoffs: ["slower"],
                  riskClass: "medium",
                },
                {
                  candidateId: "balanced-hybrid",
                  title: "Balanced hybrid",
                  strategy: "bounded exploration",
                  summary: "Explore then commit.",
                  strengths: ["balanced"],
                  tradeoffs: ["more moving parts"],
                  riskClass: "medium",
                },
              ],
            },
            steps: [],
            evidenceRefs: [],
            planEvidenceRefs: [],
            reviewerMatrix: [],
            review: {
              status: "pending",
              iteration: 1,
              reviewedAt: null,
              reviewerPersona: "qa_validator",
              issues: [],
              score: null,
              recommendation: null,
            },
          },
          workOsLinkage: null,
          statusBridge: null,
        }}
        teamMembers={[
          {
            id: "assistant-1",
            displayName: "Lead",
            memberKind: "assistant",
            memberRole: "orchestrator",
            isLead: true,
          },
        ]}
      />
    );

    expect(screen.getByText(/Choice window/i)).toBeInTheDocument();
    expect(screen.getByText(/Human in the loop/i)).toBeInTheDocument();
    expect(screen.getByText(/Reject all and replan/i)).toBeInTheDocument();
    expect(screen.getByText(/Choose Workflow first/i)).toBeInTheDocument();
    expect(screen.getByText(/Deadline:/i)).toBeInTheDocument();
  });

  it("shows the final approval window after reviewer sign-off", () => {
    render(
      <RoomWorkflowPanel
        roomId="room-1"
        runId="run-1"
        roomGoal="Launch objective"
        runtimeState={{
          currentPhase: "awaiting_final_approval",
          waitingReason: "human approval required",
          policyGateReason: null,
          nextPollAt: "2026-04-15T13:00:00.000Z",
          choiceDeadlineAt: null,
          finalReviewDeadlineAt: "2026-04-15T13:05:00.000Z",
          riskClass: "medium",
          reviewerPersona: "qa_validator",
          verificationState: "passed",
          finalReview: {
            status: "passed",
            reviewerPersona: "qa_validator",
            score: 0.88,
            recommendation: "Proceed",
            comment: "Solid final result.",
            issues: [],
          },
          evidenceRefs: [],
          planArtifact: {
            version: 1,
            runId: "run-1",
            roomId: "room-1",
            teamId: "team-1",
            caseId: null,
            requestId: null,
            objective: "Launch objective",
            source: "team_run",
            status: "ready",
            generatedAt: "2026-04-15T12:00:00.000Z",
            lastUpdatedAt: "2026-04-15T12:30:00.000Z",
            steps: [],
            evidenceRefs: [],
            planEvidenceRefs: [],
            reviewerMatrix: [],
            exploration: {
              selectedCandidateId: "workflow-first",
              selectionReason: "Best path",
              criteria: ["safety"],
              candidates: [],
            },
            review: {
              status: "passed",
              iteration: 1,
              reviewedAt: "2026-04-15T12:31:00.000Z",
              reviewerPersona: "qa_validator",
              issues: [],
              score: 0.92,
              recommendation: "Looks solid; proceed to execution.",
            },
          },
          workOsLinkage: null,
          statusBridge: null,
        }}
        teamMembers={[
          {
            id: "assistant-1",
            displayName: "Lead",
            memberKind: "assistant",
            memberRole: "orchestrator",
            isLead: true,
          },
        ]}
        onApproveFinalResult={vi.fn()}
        onRejectFinalResult={vi.fn()}
      />
    );

    expect(
      screen.getByTitle("The automation reviewer scored the final output")
    ).toBeInTheDocument();
    expect(screen.getByText(/^Final reviewer$/i)).toBeInTheDocument();
    expect(screen.getByText(/Human approval required/i)).toBeInTheDocument();
    expect(screen.getByText(/Approve final result/i)).toBeInTheDocument();
    expect(screen.getByText(/Reject and replan/i)).toBeInTheDocument();
    expect(screen.getByText(/Solid final result\./i)).toBeInTheDocument();
  });

  it("does not crash when readiness score is missing", () => {
    render(
      <RoomWorkflowPanel
        roomId="room-1"
        runId="run-1"
        runtimeState={{
          currentPhase: "waiting_for_poll",
          waitingReason: null,
          policyGateReason: null,
          nextPollAt: null,
          choiceDeadlineAt: null,
          finalReviewDeadlineAt: null,
          riskClass: null,
          reviewerPersona: null,
          verificationState: "pending",
          readinessRecord: {
            version: 1,
            kind: "team_run",
            entityId: "run-1",
            generatedAt: "2026-04-15T12:00:00.000Z",
            score: undefined as any,
            status: "blocked",
            reason: "Waiting for missing evidence",
            evidenceRefs: [],
          },
          finalReview: null,
          evidenceRefs: [],
        }}
        teamMembers={[]}
      />
    );

    expect(screen.getByText(/Readiness: blocked · n\/a/i)).toBeInTheDocument();
  });

  it("does not crash when review score is missing", () => {
    render(
      <RoomWorkflowPanel
        roomId="room-1"
        runId="run-1"
        roomGoal="Launch objective"
        runtimeState={{
          currentPhase: "awaiting_final_approval",
          waitingReason: null,
          policyGateReason: null,
          nextPollAt: null,
          choiceDeadlineAt: null,
          finalReviewDeadlineAt: null,
          riskClass: null,
          reviewerPersona: null,
          verificationState: "passed",
          finalReview: {
            status: "passed",
            reviewerPersona: "qa_validator",
            score: undefined as any,
            recommendation: null,
            comment: null,
            issues: [],
          },
          evidenceRefs: [],
          planArtifact: {
            version: 1,
            runId: "run-1",
            roomId: "room-1",
            teamId: "team-1",
            caseId: null,
            requestId: null,
            objective: "Launch objective",
            source: "team_run",
            status: "ready",
            generatedAt: "2026-04-15T12:00:00.000Z",
            lastUpdatedAt: "2026-04-15T12:30:00.000Z",
            steps: [],
            evidenceRefs: [],
            planEvidenceRefs: [],
            reviewerMatrix: [],
            exploration: null,
            review: {
              status: "passed",
              iteration: 1,
              reviewedAt: "2026-04-15T12:31:00.000Z",
              reviewerPersona: "qa_validator",
              issues: [],
              score: undefined as any,
              recommendation: null,
            },
          },
          workOsLinkage: null,
          statusBridge: null,
        }}
        teamMembers={[]}
        onApproveFinalResult={vi.fn()}
        onRejectFinalResult={vi.fn()}
      />
    );

    expect(screen.getAllByText(/Score: n\/a/i).length).toBeGreaterThan(0);
  });
});
