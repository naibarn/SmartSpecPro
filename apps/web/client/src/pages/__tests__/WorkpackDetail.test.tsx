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
          { id: "run_1", notes: "simulation", status: "succeeded", startedAt: "2026-04-10T00:00:00.000Z", actualSteps: [{}, {}] },
        ],
        exceptions: [],
        promotionRecords: [],
      },
      isLoading: false,
    });
    startRunMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    createScheduleMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    triggerScheduleMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("renders lifecycle, policy posture, and history", () => {
    render(<WorkpackDetail />);

    expect(screen.getByText("Support Autopilot")).toBeInTheDocument();
    expect(screen.getByText(/evidence completeness/i)).toBeInTheDocument();
    expect(screen.getByText("History Timeline")).toBeInTheDocument();
  });
});
