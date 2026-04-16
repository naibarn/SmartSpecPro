/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  currentLocationRef,
  inboxDataRef,
  caseDataRef,
} = vi.hoisted(() => ({
  currentLocationRef: { current: "/admin/work-os?caseId=case-bridge" },
  inboxDataRef: { current: [] as any[] },
  caseDataRef: { current: undefined as any },
}));

vi.mock("wouter", () => ({
  useLocation: () => [currentLocationRef.current, vi.fn()],
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 7, role: "admin" },
    loading: false,
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
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
  Button: ({ children, ...props }: any) => <button type="button" {...props}>{children}</button>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className, ...props }: any) => <span className={className} {...props}>{children}</span>,
}));

vi.mock("@/lib/utils", () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" "),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import AdminWorkOsDashboard from "../AdminWorkOsDashboard";

describe("AdminWorkOsDashboard bridge visibility", () => {
  beforeEach(() => {
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
          selectionReason: "Balanced hybrid keeps exploration bounded while still committing to execution.",
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
              selectionReason: "Balanced hybrid keeps exploration bounded while still committing to execution.",
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
              reason: "Verification evidence is required before the step can succeed (artifact link)",
            },
            verificationState: "pending",
          },
        },
      ],
    };
  });

  it("shows the same Work OS bridge state that Teams sees for in-progress work", async () => {
    const user = userEvent.setup();
    render(<AdminWorkOsDashboard />);

    expect(screen.getByRole("tab", { name: "Summary" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Evidence" })).toBeInTheDocument();
    expect(screen.getAllByText("Bridge: running").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Exploration: balanced-hybrid")[0]).toHaveClass("border-violet-200", "bg-violet-50", "text-violet-700");
    expect(screen.getByText("Final review")).toBeInTheDocument();
    expect(screen.getAllByTitle("Final review recommendation").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Proceed")[0]).toHaveClass("border-emerald-200", "bg-emerald-50", "text-emerald-700");
    expect(screen.getAllByText(/Reviewer qa_validator · Score 0.87/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("heading", { name: "Bridge review" })).toBeInTheDocument();
    expect(screen.getByText("Planning exploration")).toBeInTheDocument();
    expect(screen.getAllByText("Selected: balanced-hybrid").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("3 candidates").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Inbox exploration")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Evidence" }));
    expect(screen.getByText("Timeline source glossary")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Raw" }));
    expect(screen.getByText("Raw timeline payloads")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Show raw JSON/i }));
    expect(screen.getByText(/"status": "running"/i)).toBeInTheDocument();
  });
});
