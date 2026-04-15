/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
const mockClipboardWriteText = vi.fn().mockResolvedValue(undefined);
const mockScrollIntoView = vi.fn();
const mockResumeAutomationCheckpoint = vi.fn();
let currentLocation = "/admin/work-os?caseId=case-2";

vi.mock("wouter", () => ({
  useLocation: () => [currentLocation, mockNavigate],
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
      resumeAutomationCheckpoint: { useMutation: () => ({ mutate: mockResumeAutomationCheckpoint, isPending: false }) },
      overview: {
        useQuery: () => ({
          data: {
            byState: {
              open: 2,
              in_progress: 1,
              completed: 3,
            },
            openExceptions: 1,
            overdueSla: 2,
            completed: 3,
          },
          refetch: vi.fn(),
        }),
      },
      inbox: {
        useQuery: () => ({
          data: [
            {
              id: "case-1",
              title: "Review refund",
              currentState: "in_progress",
              ownerType: "queue",
              ownerId: "queue-1",
              priority: "normal",
              riskLevel: "medium",
            },
            {
              id: "case-2",
              title: "Escalate billing issue",
              currentState: "waiting_for_approval",
              ownerType: "role",
              ownerId: "billing-lead",
              priority: "high",
              riskLevel: "high",
            },
          ],
          refetch: vi.fn(),
        }),
      },
      getCase: {
        useQuery: () => ({
          data: {
            case: {
              id: "case-2",
              title: "Escalate billing issue",
              summary: "Requires billing lead sign-off",
              currentState: "waiting_for_approval",
              ownerType: "role",
              ownerId: "billing-lead",
              primaryTaskId: "task-99",
              createdAt: "2026-04-14T08:00:00.000Z",
              updatedAt: "2026-04-14T10:30:00.000Z",
            },
            automation: {
              run: {
                id: "run-1",
                title: "Launch asset production",
                objective: "Create research, copy, storyboard, media, and video",
                currentMode: "semi_auto",
                status: "running",
                templateKey: "content-production",
                templateVersion: "content-production.v1",
                templateFamily: "content-production",
                templateSource: "case_intake",
                currentStepId: "step-2",
                currentCheckpointId: "checkpoint-1",
                finalDisposition: null,
                finalDispositionReason: null,
                startedAt: "2026-04-14T08:15:00.000Z",
                completedAt: null,
                createdAt: "2026-04-14T08:10:00.000Z",
                updatedAt: "2026-04-14T10:20:00.000Z",
              },
              steps: [
                {
                  id: "step-2",
                  stepKey: "draft",
                  title: "Draft",
                  status: "running",
                  surface: "skill",
                  updatedAt: "2026-04-14T10:18:00.000Z",
                },
                {
                  id: "step-1",
                  stepKey: "research",
                  title: "Research",
                  status: "succeeded",
                  surface: "agency",
                  updatedAt: "2026-04-14T09:30:00.000Z",
                },
              ],
              checkpoints: [
                {
                  id: "checkpoint-1",
                  checkpointKey: "review",
                  approvalState: "pending",
                  checkpointStatus: "open",
                  createdAt: "2026-04-14T10:19:00.000Z",
                  updatedAt: "2026-04-14T10:19:00.000Z",
                },
              ],
              events: [
                {
                  id: "evt-auto-1",
                  eventType: "automation_step_running",
                  createdAt: new Date("2026-04-14T10:18:00.000Z"),
                },
              ],
            },
            assignments: [
              {
                id: "assign-1",
                previousOwnerType: "queue",
                previousOwnerId: "queue-1",
                ownerType: "role",
                ownerId: "billing-lead",
                assignmentSource: "reassignment",
                reason: "Escalated for finance review",
                createdAt: "2026-04-14T09:00:00.000Z",
              },
            ],
            approvals: [],
            exceptions: [],
            outcomes: [],
            slas: [],
            timeline: [
              {
                id: "evt-role-1",
                source: "role_routine",
                eventType: "role_routine_completed",
                createdAt: new Date("2026-04-14T09:15:00.000Z"),
                requestId: "req-1",
                caseId: "case-2",
                taskId: "task-99",
                detailJson: {
                  routineId: "routine-9",
                  routineRunId: "role-run-7",
                  status: "completed",
                  selectedWorkpackFamily: "support_ops",
                },
              },
              {
                id: "evt-task-1",
                source: "legacy_work_item",
                eventType: "task_completed",
                createdAt: new Date("2026-04-14T09:00:00.000Z"),
                requestId: "req-1",
                caseId: "case-2",
                taskId: "task-99",
                detailJson: {
                  taskStatus: "completed",
                },
              },
              {
                id: "evt-team-1",
                source: "team_run",
                eventType: "team_run_completed",
                createdAt: new Date("2026-04-14T09:20:00.000Z"),
                requestId: "req-1",
                caseId: "case-2",
                taskId: "task-99",
                detailJson: {
                  runId: "team-run-3",
                  status: "completed",
                  teamId: "queue-1",
                },
              },
              {
                id: "evt-workpack-1",
                source: "workpack_record",
                eventType: "workpack_record_attached",
                createdAt: new Date("2026-04-14T09:25:00.000Z"),
                requestId: "req-1",
                caseId: "case-2",
                taskId: "task-99",
                detailJson: {
                  recordType: "attachment",
                  workpackId: "wp-7",
                  recordId: "record-5",
                },
              },
            ],
          },
        }),
      },
    },
  },
}));

vi.mock("@/components/dashboard", () => {
  const React = require("react");
  return {
    DashboardCard: ({ title, description, children, trailing }: any) => (
      <section>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
        {trailing}
        {children}
      </section>
    ),
    DashboardKpiCard: ({ label, value }: any) => (
      <div>
        <span>{label}</span>
        <span>{String(value)}</span>
      </div>
    ),
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

vi.mock("@/lib/utils", () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" "),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import AdminWorkOsDashboard from "../AdminWorkOsDashboard";

describe("AdminWorkOsDashboard", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockClipboardWriteText.mockClear();
    mockScrollIntoView.mockClear();
    mockResumeAutomationCheckpoint.mockClear();
    mockClipboardWriteText.mockResolvedValue(undefined);
    currentLocation = "/admin/work-os?caseId=case-2";
    Object.defineProperty(window.navigator, "clipboard", {
      value: {
        writeText: mockClipboardWriteText,
      },
      configurable: true,
    });
    window.HTMLElement.prototype.scrollIntoView = mockScrollIntoView;
  });

  it("opens the selected case from the URL and renders evidence summaries", () => {
    render(<AdminWorkOsDashboard />);

    expect(screen.getByRole("heading", { name: /work os console/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Escalate billing issue" })).toBeInTheDocument();
    expect(screen.getByText("Open Exceptions")).toBeInTheDocument();
    expect(screen.getByText("Automation Run Summary")).toBeInTheDocument();
    expect(screen.getByText("Launch asset production")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("routine routine-9 · run role-run-7 · family support_ops")).toBeInTheDocument();
    expect(screen.getByText("task completed · task completed")).toBeInTheDocument();
  });

  it("copies a deep link for the selected case", async () => {
    render(<AdminWorkOsDashboard />);

    fireEvent.click(screen.getAllByRole("button", { name: /copy permalink/i })[0]);

    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?caseId=case-2`,
    );
  });

  it("resumes the latest checkpoint from the automation summary", () => {
    render(<AdminWorkOsDashboard />);

    fireEvent.click(screen.getByRole("button", { name: /resume checkpoint/i }));

    expect(mockResumeAutomationCheckpoint).toHaveBeenCalledWith({
      caseId: "case-2",
      runId: "run-1",
      checkpointId: "checkpoint-1",
    });
  });

  it("opens the Work OS guide from the console header", () => {
    render(<AdminWorkOsDashboard />);

    fireEvent.click(screen.getAllByRole("button", { name: /open guide/i })[0]);

    expect(mockNavigate).toHaveBeenCalledWith("/help/work-os");
  });

  it("copies the filtered case view when a timeline source is present in the URL", () => {
    currentLocation = "/admin/work-os?caseId=case-2&timelineSource=role_routine";

    render(<AdminWorkOsDashboard />);

    fireEvent.click(screen.getAllByRole("button", { name: /copy permalink/i })[0]);

    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?caseId=case-2&timelineSource=role_routine`,
    );
  });

  it("copies the current permalink from the share panel", () => {
    currentLocation = "/admin/work-os?caseId=case-2&timelineSource=team_run";

    render(<AdminWorkOsDashboard />);

    fireEvent.click(screen.getAllByRole("button", { name: /copy permalink/i })[1]);

    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?caseId=case-2&timelineSource=team_run`,
    );
  });

  it("copies source-specific case links from the timeline source chips", () => {
    render(<AdminWorkOsDashboard />);

    fireEvent.click(screen.getAllByRole("button", { name: /copy role routine evidence/i })[0]);
    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?caseId=case-2&timelineSource=role_routine`,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /copy team run evidence/i })[0]);
    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?caseId=case-2&timelineSource=team_run`,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /copy workpack evidence/i })[0]);
    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?caseId=case-2&timelineSource=workpack_record`,
    );
  });

  it("filters the timeline by evidence source", () => {
    render(<AdminWorkOsDashboard />);

    fireEvent.click(screen.getByRole("button", { name: /^role routine$/i }));

    expect(mockNavigate).toHaveBeenCalledWith("/admin/work-os?caseId=case-2&timelineSource=role_routine", { replace: true });
    expect(screen.getByText("1 of 4 entries")).toBeInTheDocument();
    expect(screen.getByText("routine routine-9 · run role-run-7 · family support_ops")).toBeInTheDocument();
    expect(screen.queryByText("task completed · task completed")).not.toBeInTheDocument();
    expect(mockScrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("explains timeline source keys and links to the Work OS guide", () => {
    render(<AdminWorkOsDashboard />);

    expect(screen.getByText(/timeline source glossary/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /open guide/i })[0]);

    expect(mockNavigate).toHaveBeenCalledWith("/help/work-os");
  });

  it("syncs the inbox selection into the URL", () => {
    render(<AdminWorkOsDashboard />);

    fireEvent.click(screen.getByRole("button", { name: /review refund/i }));

    expect(mockNavigate).toHaveBeenCalledWith("/admin/work-os?caseId=case-1", { replace: true });
  });
});
