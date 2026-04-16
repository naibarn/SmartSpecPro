import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const {
  routeParamsRef,
  teamListDataRef,
  teamGetDataRef,
  teamRoomsRef,
  teamRunDetailRef,
  workflowPanelPropsRef,
  runMonitorPanelPropsRef,
} = vi.hoisted(() => ({
  routeParamsRef: { current: { teamId: "team-1" } as any },
  teamListDataRef: { current: [] as any[] },
  teamGetDataRef: { current: undefined as any },
  teamRoomsRef: { current: [] as any[] },
  teamRunDetailRef: { current: undefined as any },
  workflowPanelPropsRef: { current: null as any },
  runMonitorPanelPropsRef: { current: null as any },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
  }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/teams?roomId=room-1", vi.fn()],
  useRoute: () => [Boolean(routeParamsRef.current), routeParamsRef.current],
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlags: () => ({
    orchestratorEnabled: true,
    workpackOpsConsole: true,
    workpacksEnabled: true,
  }),
  useTenantFeatureFlag: () => true,
}));

vi.mock("@/components/orchestrator/TeamRoomView", () => ({
  TeamRoomView: () => <div data-testid="team-room-view" />,
}));

vi.mock("@/components/orchestrator/RunMonitorPanel", () => ({
  RunMonitorPanel: (props: any) => {
    runMonitorPanelPropsRef.current = props;
    return <div data-testid="run-monitor-panel" data-status={props.statusBridge?.workOsState ?? ""} />;
  },
}));

vi.mock("@/components/orchestrator/RoomWorkflowPanel", () => ({
  RoomWorkflowPanel: (props: any) => {
    workflowPanelPropsRef.current = props;
    return (
      <div
        data-testid="workflow-panel"
        data-phase={props.runtimeState?.currentPhase ?? ""}
        data-reviewer={props.runtimeState?.reviewerPersona ?? ""}
      />
    );
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: any) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children }: any) => <label>{children}</label>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      team: {
        list: { invalidate: vi.fn() },
        get: { invalidate: vi.fn() },
        listBindableWorkers: { invalidate: vi.fn() },
        getOwnedWorkerBudget: { invalidate: vi.fn() },
      },
      teamRoom: {
        listByTeam: { invalidate: vi.fn() },
      },
      teamRun: {
        get: { invalidate: vi.fn() },
        chooseExplorationCandidate: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        rejectExplorationCandidates: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        approveFinalReview: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
        rejectFinalReview: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      },
      teamWorkItem: {
        listByRoom: { invalidate: vi.fn() },
      },
      persona: {
        list: { invalidate: vi.fn() },
      },
    }),
    team: {
      list: { useQuery: () => ({ data: teamListDataRef.current, isLoading: false }) },
      get: { useQuery: () => ({ data: teamGetDataRef.current }) },
      listBindableWorkers: { useQuery: () => ({ data: [] }) },
      getOwnedWorkerBudget: { useQuery: () => ({ data: null, isLoading: false }) },
      updateOwnedWorkerBudget: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      create: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
      archive: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      addMember: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      updateMember: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    teamRoom: {
      listByTeam: { useQuery: () => ({ data: teamRoomsRef.current }) },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      sendMessage: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
    },
    teamRun: {
      get: { useQuery: () => ({ data: teamRunDetailRef.current }) },
      start: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      stop: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      pause: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      resume: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      advance: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
      chooseExplorationCandidate: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      rejectExplorationCandidates: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      approveFinalReview: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      rejectFinalReview: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    teamWorkItem: {
      listByRoom: { useQuery: () => ({ data: [] }) },
    },
    persona: {
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      list: { useQuery: () => ({ data: [] }) },
    },
    groups: {
      searchTenantUsers: { useQuery: () => ({ data: [], isLoading: false }) },
    },
  },
}));

import Teams from "../Teams";

describe("Teams plan visibility", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/teams/team-1?roomId=room-1&panel=workflow");
    Object.defineProperty(window, "innerWidth", {
      value: 1440,
      configurable: true,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      value: vi.fn(),
      configurable: true,
    });
    teamListDataRef.current = [
      {
        id: "team-1",
        name: "Automation Team",
        description: null,
        category: "operations",
        status: "active",
        memberCount: 1,
      },
    ];
    teamGetDataRef.current = {
      id: "team-1",
      name: "Automation Team",
      members: [
        {
          id: "assistant-1",
          memberKind: "assistant",
          memberRole: "orchestrator",
          displayName: "Orchestrator",
          isLead: true,
        },
      ],
    };
    teamRoomsRef.current = [
      {
        id: "room-1",
        teamId: "team-1",
        roomType: "team",
        lastRunId: "run-1",
        goalPrompt: "Launch objective",
      },
    ];
    teamRunDetailRef.current = {
      id: "run-1",
      status: "running",
      stopReason: null,
      runtimeState: {
        currentPhase: "waiting_for_poll",
        waitingReason: "awaiting media job",
        policyGateReason: "verification evidence is missing",
        nextPollAt: "2026-04-16T02:30:00.000Z",
        choiceDeadlineAt: null,
        finalReviewDeadlineAt: null,
        riskClass: "medium",
        reviewerPersona: "qa_validator",
        verificationState: "pending",
        finalReview: null,
        evidenceRefs: ["media-job:media-1"],
        workOsLinkage: {
          teamId: "team-1",
          roomId: "room-1",
          projectedWorkOsState: "in_progress",
        },
        statusBridge: {
          teamRunStatus: "running",
          workOsState: "in_progress",
        },
      },
      statusBridge: {
        teamRunStatus: "running",
        workOsState: "in_progress",
      },
    };
    workflowPanelPropsRef.current = null;
    runMonitorPanelPropsRef.current = null;
  });

  it("surfaces the current runtime plan summary in the Teams workflow panel", async () => {
    render(<Teams />);

    const teamButton = await screen.findByRole("button", { name: /Automation Team/i });
    fireEvent.click(teamButton);

    const roomObjective = await screen.findByText("Launch objective");
    fireEvent.click(roomObjective.closest("button") as HTMLButtonElement);

    const panel = await screen.findByTestId("workflow-panel");
    expect(panel).toHaveAttribute("data-phase", "waiting_for_poll");
    expect(panel).toHaveAttribute("data-reviewer", "qa_validator");
    const runMonitorPanel = await screen.findByTestId("run-monitor-panel");
    expect(runMonitorPanel).toHaveAttribute("data-status", "in_progress");
    expect(workflowPanelPropsRef.current).toEqual(expect.objectContaining({
      runtimeState: expect.objectContaining({
        currentPhase: "waiting_for_poll",
        waitingReason: "awaiting media job",
        policyGateReason: "verification evidence is missing",
        reviewerPersona: "qa_validator",
        statusBridge: expect.objectContaining({
          teamRunStatus: "running",
          workOsState: "in_progress",
        }),
      }),
    }));
    expect(runMonitorPanelPropsRef.current).toEqual(expect.objectContaining({
      statusBridge: expect.objectContaining({
        teamRunStatus: "running",
        workOsState: "in_progress",
      }),
    }));
  });
});
