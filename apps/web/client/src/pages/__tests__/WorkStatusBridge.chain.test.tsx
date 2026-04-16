/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describeStatusBridge } from "../../../../shared/workStatusBridge";

const {
  teamListDataRef,
  teamGetDataRef,
  teamRoomsRef,
  teamRunDetailRef,
  workflowPanelPropsRef,
  runMonitorPanelPropsRef,
  currentLocationRef,
  inboxDataRef,
  caseDataRef,
} = vi.hoisted(() => ({
  teamListDataRef: { current: [] as any[] },
  teamGetDataRef: { current: undefined as any },
  teamRoomsRef: { current: [] as any[] },
  teamRunDetailRef: { current: undefined as any },
  workflowPanelPropsRef: { current: null as any },
  runMonitorPanelPropsRef: { current: null as any },
  currentLocationRef: { current: "/admin/work-os?caseId=case-bridge" },
  inboxDataRef: { current: [] as any[] },
  caseDataRef: { current: undefined as any },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
  }),
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 7, role: "admin" },
    loading: false,
  }),
}));

vi.mock("wouter", () => ({
  useLocation: () => [currentLocationRef.current, vi.fn()],
  useRoute: () => [true, { teamId: "team-1" }],
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
    return <div data-testid="workflow-panel" data-phase={props.runtimeState?.currentPhase ?? ""} />;
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

vi.mock("@/components/dashboard", () => ({
  DashboardCard: ({ title, description, children }: any) => (
    <section>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {children}
    </section>
  ),
  DashboardKpiCard: ({ label, value }: any) => (
    <div>
      <span>{label}</span>
      <span>{String(value)}</span>
    </div>
  ),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" "),
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
    workOs: {
      resumeAutomationCheckpoint: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      overview: {
        useQuery: () => ({
          data: { byState: {}, openExceptions: 0, overdueSla: 0, completed: 0 },
          refetch: vi.fn(),
        }),
      },
      inbox: {
        useQuery: () => ({
          data: inboxDataRef.current,
          refetch: vi.fn(),
        }),
      },
      getCase: {
        useQuery: () => ({
          data: caseDataRef.current,
        }),
      },
    },
  },
}));

import Teams from "../Teams";
import AdminWorkOsDashboard from "../AdminWorkOsDashboard";

describe("Work status bridge chain", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: vi.fn(), configurable: true });

    teamListDataRef.current = [
      { id: "team-1", name: "Automation Team", description: null, category: "operations", status: "active", memberCount: 1 },
    ];
    teamGetDataRef.current = {
      id: "team-1",
      name: "Automation Team",
      members: [{ id: "assistant-1", memberKind: "assistant", memberRole: "orchestrator", displayName: "Orchestrator", isLead: true }],
    };
    teamRoomsRef.current = [
      { id: "room-1", teamId: "team-1", roomType: "team", lastRunId: "run-1", goalPrompt: "Launch objective" },
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
    runMonitorPanelPropsRef.current = null;
    workflowPanelPropsRef.current = null;

    currentLocationRef.current = "/admin/work-os?caseId=case-bridge";
    inboxDataRef.current = [
      {
        id: "case-bridge",
        title: "Bridge review",
        currentState: "in_progress",
        ownerType: "queue",
        ownerId: "queue-1",
        priority: "normal",
        riskLevel: "medium",
      },
    ];
    caseDataRef.current = {
      case: {
        id: "case-bridge",
        title: "Bridge review",
        summary: "Keep Work OS and Teams aligned",
        currentState: "in_progress",
        ownerType: "queue",
        ownerId: "queue-1",
        primaryTaskId: "task-bridge",
        createdAt: "2026-04-15T08:00:00.000Z",
        updatedAt: "2026-04-15T10:00:00.000Z",
      },
      automation: null,
      assignments: [],
      approvals: [],
      exceptions: [],
      outcomes: [],
      slas: [],
      timeline: [],
    };
  });

  it("keeps the team run, Teams workflow panel, and Work OS console aligned", () => {
    expect(describeStatusBridge("running")).toEqual(expect.objectContaining({
      teamRunStatus: "running",
      workOsState: "in_progress",
    }));

    render(<Teams />);
    fireEvent.click(screen.getByRole("button", { name: /Automation Team/i }));
    fireEvent.click(screen.getByText("Launch objective").closest("button") as HTMLButtonElement);

    expect(screen.getByTestId("workflow-panel")).toHaveAttribute("data-phase", "waiting_for_poll");
    expect(screen.getByTestId("run-monitor-panel")).toHaveAttribute("data-status", "in_progress");
    expect(workflowPanelPropsRef.current).toEqual(expect.objectContaining({
      runtimeState: expect.objectContaining({
        policyGateReason: "verification evidence is missing",
        statusBridge: expect.objectContaining({
          teamRunStatus: "running",
          workOsState: "in_progress",
        }),
      }),
    }));

    render(<AdminWorkOsDashboard />);
    expect(screen.getAllByText("Bridge: running").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("heading", { name: "Bridge review" })).toBeInTheDocument();
  });
});
