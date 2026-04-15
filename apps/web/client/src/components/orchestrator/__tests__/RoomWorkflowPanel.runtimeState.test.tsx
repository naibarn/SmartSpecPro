import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
        (acc, [paramKey, value]) => acc.replaceAll(`{{${paramKey}}}`, String(value)),
        template,
      );
    },
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      teamWorkItem: { listByRoom: { invalidate: vi.fn() } },
      teamRun: { get: { invalidate: vi.fn() } },
      teamRoom: { getMessages: { invalidate: vi.fn() }, viewerState: { invalidate: vi.fn() } },
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
  it("renders the durable runtime summary for the active run", () => {
    render(
      <RoomWorkflowPanel
        roomId="room-1"
        runId="run-1"
        roomGoal="Launch objective"
        runtimeState={{
          currentPhase: "waiting_for_poll",
          waitingReason: "polling media job",
          nextPollAt: "2026-04-15T13:00:00.000Z",
          riskClass: "medium",
          reviewerPersona: "qa_validator",
          verificationState: "pending",
          evidenceRefs: ["worker-job:job-1"],
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
          { id: "assistant-1", displayName: "Lead", memberKind: "assistant", memberRole: "orchestrator", isLead: true },
        ]}
      />,
    );

    expect(screen.getByText("Launch objective")).toBeInTheDocument();
    expect(screen.getByText(/Phase: waiting_for_poll/i)).toBeInTheDocument();
    expect(screen.getByText(/Waiting: polling media job/i)).toBeInTheDocument();
    expect(screen.getByText(/Reviewer: qa_validator/i)).toBeInTheDocument();
    expect(screen.getByText(/Work OS mirror: in_progress/i)).toBeInTheDocument();
  });
});

