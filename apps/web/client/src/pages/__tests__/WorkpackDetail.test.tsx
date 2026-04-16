/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useRouteMock = vi.fn();
const detailMock = vi.fn();
const startRunMock = vi.fn();
const createScheduleMock = vi.fn();
const triggerScheduleMock = vi.fn();
const runDueSchedulesMock = vi.fn();
const reconcileRunsMock = vi.fn();
const invalidateMock = vi.fn();

vi.mock("wouter", () => ({
  useRoute: (...args: unknown[]) => useRouteMock(...args),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      workpack: {
        getDetail: { invalidate: invalidateMock },
      },
    }),
    workpack: {
      getDetail: { useQuery: (...args: unknown[]) => detailMock(...args) },
      startRun: { useMutation: (...args: unknown[]) => startRunMock(...args) },
      createSchedule: { useMutation: (...args: unknown[]) => createScheduleMock(...args) },
      triggerSchedule: { useMutation: (...args: unknown[]) => triggerScheduleMock(...args) },
      runDueSchedules: { useMutation: (...args: unknown[]) => runDueSchedulesMock(...args) },
      reconcileRuns: { useMutation: (...args: unknown[]) => reconcileRunsMock(...args) },
    },
  },
}));

import WorkpackDetail from "../WorkpackDetail";

describe("WorkpackDetail", () => {
  beforeEach(() => {
    useRouteMock.mockReturnValue([true, { workpackId: "wp_1" }]);
    detailMock.mockReturnValue({
      data: {
        workpack: {
          id: "wp_1",
          title: "Support Autopilot",
          description: "Bounded support routine",
          lifecycleState: "needs_review",
          autonomyMode: "draft",
          promotionState: "unpromoted",
        },
        readiness: {
          gateResult: "review_required",
          nextAction: "Run simulation",
          evidenceCompleteness: 0.75,
          connectorHealth: "healthy",
          trustStatus: "tainted",
          benchmarkAvailable: false,
        },
        caseSources: [
          { id: "src_1", title: "SOP", type: "document", summary: "Support SOP", trace: [] },
        ],
        playbook: {
          clarificationQueue: [],
        },
        schedules: [],
        latestMetricSnapshot: {
          completionRate: 0.8,
          successRate: 0.8,
          interventionRate: 0.2,
          exceptionRate: 0.1,
          policyBlockFrequency: 0.1,
        },
        runs: [
          {
            id: "run_1",
            notes: "worker dispatch",
            status: "running",
            trigger: "manual",
            startedAt: "2026-04-10T00:00:00.000Z",
            actualSteps: [
              {
                stepId: "step_1",
                title: "Queue browser step",
                runtimePath: "browser",
                sideEffectClass: "read_only",
                status: "running",
                outputSummary: "Queued on browser via worker job worker-job-1.",
                executionRef: {
                  provider: "worker_job",
                  executionId: "worker-job-1",
                  status: "running",
                  runtimeType: "openclaw_gateway",
                },
              },
              {},
            ],
          },
        ],
        executorSnapshots: [
          {
            executionId: "worker-job-1",
            laneLabel: "Browser automation lane",
            runtimeType: "openclaw_gateway",
            jobType: "browser_automation_task",
            workerId: "worker-a",
            statusReason: "navigating_queue",
            resourceProfile: "network_heavy",
            artifactCount: 1,
            publishedArtifactCount: 0,
            latestEventType: "navigation_completed",
            laneDetails: {
              lane: "browser",
              stage: "navigate_queue",
              sessionId: "lbs_demo_123",
              browserState: "review_required",
              connectorFamilies: ["crm"],
              sourceCount: 1,
            },
            recentEvents: [
              {
                eventId: "evt-1",
                eventType: "navigation_completed",
                createdAt: "2026-04-10T00:01:00.000Z",
              },
            ],
          },
        ],
        exceptions: [],
        promotionRecords: [],
      },
      isLoading: false,
    });
    startRunMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    createScheduleMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    triggerScheduleMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    runDueSchedulesMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    reconcileRunsMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("renders lifecycle, policy posture, history, and live executor details", () => {
    render(<WorkpackDetail />);

    expect(screen.getByText("Support Autopilot")).toBeInTheDocument();
    expect(screen.getByText(/evidence completeness/i)).toBeInTheDocument();
    expect(screen.getByText("History Timeline")).toBeInTheDocument();
    expect(screen.getByText("Live Executor Status")).toBeInTheDocument();
    expect(screen.getAllByText(/worker-job-1/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Browser automation lane/i)).toBeInTheDocument();
    expect(screen.getByText(/Latest event navigation_completed/i)).toBeInTheDocument();
    expect(screen.getByText(/Stage navigate_queue/i)).toBeInTheDocument();
    expect(screen.getByText(/Session Id lbs_demo_123/i)).toBeInTheDocument();
    expect(screen.getByText(/Browser State review_required/i)).toBeInTheDocument();
    expect(screen.getByText(/Connector Families crm/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^ROI$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Discovery$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Exceptions$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refresh executor status/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /process due schedules/i })).toBeInTheDocument();
  });
});
