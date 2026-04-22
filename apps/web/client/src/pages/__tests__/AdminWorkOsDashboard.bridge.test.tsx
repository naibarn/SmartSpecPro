/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  currentLocationRef,
  inboxDataRef,
  caseDataRef,
  contextEngineHealthRef,
  createAutomationRunRef,
  updateRequestRef,
} = vi.hoisted(() => ({
  currentLocationRef: { current: "/admin/work-os?caseId=case-bridge" },
  inboxDataRef: { current: [] as any[] },
  caseDataRef: { current: undefined as any },
  contextEngineHealthRef: { current: null as any },
  createAutomationRunRef: { current: vi.fn() },
  updateRequestRef: { current: vi.fn() },
}));

vi.mock("wouter", () => ({
  useLocation: () => [currentLocationRef.current, vi.fn()],
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 7, role: "admin" },
    loading: false,
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    monitoring: {
      getContextEngineHealth: {
        useQuery: () => ({
          data: contextEngineHealthRef.current,
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        }),
      },
    },
    workOs: {
      resumeAutomationCheckpoint: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      createAutomationRun: {
        useMutation: () => ({
          mutate: createAutomationRunRef.current,
          isPending: false,
        }),
      },
      updateRequest: {
        useMutation: () => ({
          mutate: updateRequestRef.current,
          isPending: false,
        }),
      },
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

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, asChild: _asChild, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className, ...props }: any) => (
    <span className={className} {...props}>
      {children}
    </span>
  ),
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

vi.mock("@/lib/utils", () => ({
  cn: (...values: Array<string | false | null | undefined>) =>
    values.filter(Boolean).join(" "),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import AdminWorkOsDashboard from "../AdminWorkOsDashboard";

describe("AdminWorkOsDashboard bridge visibility", () => {
  beforeEach(() => {
    createAutomationRunRef.current.mockClear();
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
        latestExploration: {
          selectedCandidateId: "balanced-hybrid",
          selectionReason:
            "Balanced hybrid keeps exploration bounded while still committing to execution.",
          candidateCount: 3,
        },
        latestFinalReview: {
          reviewerPersona: "qa_validator",
          score: 0.87,
          recommendation: "Proceed",
          comment: "Strong outcome with balanced tradeoffs.",
        },
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
      timeline: [
        {
          id: "timeline-team-run-1",
          source: "team_run",
          eventType: "team_run_snapshot",
          createdAt: "2026-04-15T10:15:00.000Z",
          requestId: "req-bridge",
          caseId: "case-bridge",
          taskId: "task-bridge",
          detailJson: {
            runId: "run-bridge",
            teamId: "team-1",
            status: "running",
            workOsState: "in_progress",
            statusBridge: {
              teamRunStatus: "running",
              workOsState: "in_progress",
            },
            exploration: {
              selectedCandidateId: "balanced-hybrid",
              selectionReason:
                "Balanced hybrid keeps exploration bounded while still committing to execution.",
              candidateCount: 3,
              criteria: ["safety", "speed", "determinism"],
            },
            finalReview: {
              reviewerPersona: "qa_validator",
              score: 0.87,
              recommendation: "Proceed",
              comment: "Strong outcome with balanced tradeoffs.",
            },
          },
        },
        {
          id: "timeline-bridge-1",
          source: "work_os",
          eventType: "automation_step_blocked",
          createdAt: "2026-04-15T10:30:00.000Z",
          requestId: "req-bridge",
          caseId: "case-bridge",
          taskId: "task-bridge",
          detailJson: {
            verificationGate: {
              status: "blocked",
              reason:
                "Verification evidence is required before the step can succeed (artifact link)",
            },
            verificationState: "pending",
          },
        },
      ],
    };
    contextEngineHealthRef.current = null;
  });

  it("shows the same Work OS bridge state that Teams sees for in-progress work", async () => {
    const user = userEvent.setup();
    render(<AdminWorkOsDashboard />);

    expect(screen.getByRole("tab", { name: "Summary" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Evidence" })).toBeInTheDocument();
    expect(
      screen.getAllByText("Bridge: running").length
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Exploration: balanced-hybrid")[0]).toHaveClass(
      "border-violet-200",
      "bg-violet-50",
      "text-violet-700"
    );
    expect(screen.getByText("Final review")).toBeInTheDocument();
    expect(
      screen.getAllByTitle("Final review recommendation").length
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Proceed")[0]).toHaveClass(
      "border-emerald-200",
      "bg-emerald-50",
      "text-emerald-700"
    );
    expect(
      screen.getAllByText(/Reviewer qa_validator · Score 0.87/i).length
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByRole("heading", { name: "Bridge review" })
    ).toBeInTheDocument();
    expect(screen.getByText("Planning exploration")).toBeInTheDocument();
    expect(
      screen.getAllByText("Selected: balanced-hybrid").length
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("3 candidates").length).toBeGreaterThanOrEqual(
      2
    );
    expect(screen.getByText("Inbox exploration")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Evidence" }));
    expect(screen.getByText("Timeline source glossary")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Raw" }));
    expect(screen.getByText("Raw timeline payloads")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Show raw JSON/i }));
    expect(screen.getByText(/"status": "running"/i)).toBeInTheDocument();
  });

  it("surfaces context-engine traces inside the Work OS evidence timeline", async () => {
    const user = userEvent.setup();
    contextEngineHealthRef.current = {
      scope: {
        tenantId: "tenant-1",
        teamId: "team-1",
        roomId: "room-1",
        runId: "run-1",
        skillId: null,
        userId: null,
        since: new Date().toISOString(),
        limit: 8,
      },
      window: {
        matchedChecks: 1,
        latestCreatedAt: "2026-04-15T10:45:00.000Z",
      },
      totals: { total: 1, ok: 1, warning: 0, critical: 0, error: 0 },
      latest: {
        id: 10,
        checkType: "context_engine_eval",
        status: "ok",
        source: "team_run",
        createdAt: "2026-04-15T10:45:00.000Z",
        details: {
          source: "team_run",
          surface: "team_room",
          traceId: "trace-context-work-os",
          tenantId: "tenant-1",
          roomId: "room-1",
          runId: "run-1",
          latencyMs: 22,
          notes: "Fresh room context",
          intent: "summarize",
          budgetProfile: "balanced",
          retrievalModes: ["lexical", "semantic"],
          estimatedTokens: 1500,
          tokenHeadroom: 7200,
          dedupedMessages: 5,
          injectedMessages: 4,
          totalSlots: 11,
          activeNoteSlots: 1,
          recentNoteSlots: 2,
          projectStateSlots: 1,
          workingSummarySlots: 1,
          durableMemorySlots: 1,
          retrievedEvidenceSlots: 3,
          toolResultSlots: 0,
          resourceSlots: 0,
          promptAssetSlots: 0,
          freshSlots: 6,
          recentSlots: 3,
          staleSlots: 0,
          retrievalCoverage: 0.8,
          groundingScore: 0.91,
          staleContextRatio: 0.05,
          freshnessScore: 0.94,
          tokenPressureRatio: 0.2,
          healthScore: 0.89,
        },
      },
      recentChecks: [
        {
          id: 10,
          checkType: "context_engine_eval",
          status: "ok",
          source: "team_run",
          createdAt: "2026-04-15T10:45:00.000Z",
          details: {
            source: "team_run",
            surface: "team_room",
            traceId: "trace-context-work-os",
            tenantId: "tenant-1",
            roomId: "room-1",
            runId: "run-1",
            latencyMs: 22,
            notes: "Fresh room context",
            intent: "summarize",
            budgetProfile: "balanced",
            retrievalModes: ["lexical", "semantic"],
            estimatedTokens: 1500,
            tokenHeadroom: 7200,
            dedupedMessages: 5,
            injectedMessages: 4,
            totalSlots: 11,
            activeNoteSlots: 1,
            recentNoteSlots: 2,
            projectStateSlots: 1,
            workingSummarySlots: 1,
            durableMemorySlots: 1,
            retrievedEvidenceSlots: 3,
            toolResultSlots: 0,
            resourceSlots: 0,
            promptAssetSlots: 0,
            freshSlots: 6,
            recentSlots: 3,
            staleSlots: 0,
            retrievalCoverage: 0.8,
            groundingScore: 0.91,
            staleContextRatio: 0.05,
            freshnessScore: 0.94,
            tokenPressureRatio: 0.2,
            healthScore: 0.89,
          },
        },
      ],
      averages: {
        healthScore: 0.89,
        groundingScore: 0.91,
        retrievalCoverage: 0.8,
        freshnessScore: 0.94,
        staleContextRatio: 0.05,
        tokenPressureRatio: 0.2,
        latencyMs: 22,
      },
      sourceBreakdown: [{ source: "team_run", count: 1 }],
      scopeBreakdown: [
        {
          teamId: "team-1",
          roomId: "room-1",
          runId: "run-1",
          skillId: null,
          count: 1,
          latestCreatedAt: "2026-04-15T10:45:00.000Z",
          latestStatus: "ok",
          latestSource: "team_run",
          latestHealthScore: 0.89,
          latestGroundingScore: 0.91,
          latestRetrievalCoverage: 0.8,
        },
      ],
    };

    render(<AdminWorkOsDashboard />);

    await user.click(screen.getByRole("tab", { name: "Evidence" }));
    expect(screen.getByText(/Context engine live traces/i)).toBeInTheDocument();
    expect(screen.getByText(/Health trend by room\/run/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /focus traces/i })).toBeInTheDocument();
    expect(screen.getAllByText(/context engine eval/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/room room-1/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/run run-1/i).length).toBeGreaterThan(0);
  });

  it("opens the request preflight review when a case has no automation run yet", () => {
    caseDataRef.current = {
      case: {
        id: "case-start",
        title: "Start me",
        summary: "Ready for the first automation run",
        currentState: "new",
        ownerType: "queue",
        ownerId: "queue-1",
        primaryTaskId: null,
        requestId: "req-start",
        createdAt: "2026-04-15T08:00:00.000Z",
        updatedAt: "2026-04-15T10:00:00.000Z",
      },
      request: {
        id: "req-start",
        objective:
          "Use the request objective as the initial automation objective",
      },
      automation: null,
      assignments: [],
      approvals: [],
      exceptions: [],
      outcomes: [],
      slas: [],
      timeline: [],
    };
    currentLocationRef.current = "/admin/work-os?caseId=case-start";

    render(<AdminWorkOsDashboard />);

    const reviewLink = screen.getAllByRole("link", {
      name: /review and approve automation/i,
    })[0];

    expect(reviewLink).toHaveAttribute(
      "href",
      "/work/request?requestId=req-start"
    );
    expect(createAutomationRunRef.current).not.toHaveBeenCalled();
  });

  it("allows editing the request before automation starts", async () => {
    caseDataRef.current = {
      case: {
        id: "case-edit",
        title: "Original title",
        summary: "Original summary",
        currentState: "new",
        ownerType: "queue",
        ownerId: "queue-1",
        primaryTaskId: null,
        requestId: "req-edit",
        createdAt: "2026-04-15T08:00:00.000Z",
        updatedAt: "2026-04-15T10:00:00.000Z",
      },
      request: {
        id: "req-edit",
        title: "Original title",
        objective: "Original summary",
        sourceType: "manual",
        sourceRef: "source-1",
        businessDomain: "ops",
        urgency: "normal",
        riskLevel: "medium",
        defaultOwnerType: "queue",
        defaultQueueId: "queue-1",
      },
      automation: null,
      assignments: [],
      approvals: [],
      exceptions: [],
      outcomes: [],
      slas: [],
      timeline: [],
    };
    currentLocationRef.current = "/admin/work-os?caseId=case-edit";

    render(<AdminWorkOsDashboard />);

    const editRequestLink = screen.getAllByRole("link", {
      name: /edit request/i,
    })[0];

    expect(editRequestLink).toHaveAttribute(
      "href",
      "/work/request?requestId=req-edit"
    );
    expect(updateRequestRef.current).not.toHaveBeenCalled();
  });
});
