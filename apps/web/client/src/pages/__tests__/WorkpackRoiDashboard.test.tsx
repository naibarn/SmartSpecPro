/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const roiMock = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    workpack: {
      roiDashboard: { useQuery: (...args: unknown[]) => roiMock(...args) },
    },
  },
}));

import WorkpackRoiDashboard from "../WorkpackRoiDashboard";

describe("WorkpackRoiDashboard", () => {
  beforeEach(() => {
    roiMock.mockReturnValue({
      data: {
        totals: {
          completionRate: 0.82,
          interventionRate: 0.12,
          exceptionRate: 0.06,
          throughputPerDay: 28,
          averageCostPerRun: 1.7,
          estimatedTimeSavedMinutes: 320,
        },
        readiness: [
          {
            workpackId: "wp_1",
            gateResult: "ready",
            nextAction: "Expand supervised usage",
          },
        ],
        roadmapProgress: [
          {
            workpackId: "wp_1",
            title: "Support ops",
            updatedAt: "2026-04-16T10:00:00.000Z",
            phases: [
              {
                phase: 1,
                title: "Governed Context Fabric",
                status: "ready",
                owner: "platform owner",
                reviewer: "security owner",
                blockers: [],
                nextAction: "Context assembly is stable.",
                evidenceRefs: [],
              },
              {
                phase: 2,
                title: "Tracing, Replay, And Release Gates",
                status: "review_required",
                owner: "observability owner",
                reviewer: "security owner",
                blockers: ["release_gate_missing"],
                nextAction: "Tighten release gate.",
                evidenceRefs: [],
              },
            ],
          },
        ],
        roadmapSummary: {
          workpackCount: 1,
          phaseCounts: { ready: 4, review_required: 1, blocked: 0 },
          blockerCounts: [
            { blocker: "no_scoped_context", count: 1 },
          ],
        },
        roadmapTrend: [
          {
            workpackId: "wp_1",
            title: "Support ops",
            updatedAt: "2026-04-16T10:00:00.000Z",
            sequence: 1,
            ready: 4,
            review_required: 1,
            blocked: 0,
            totalPhases: 5,
          },
        ],
        recommendations: [],
        slices: [],
      },
      isLoading: false,
    });
  });

  it("renders KPI cards and readiness summaries", () => {
    render(<WorkpackRoiDashboard />);

    expect(screen.getByText("Completion rate")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("097 Roadmap Control Plane")).toBeInTheDocument();
    expect(screen.getByText("097 Roadmap Trend")).toBeInTheDocument();
    expect(screen.getByText("Trend scope")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Workpack" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Phase owner" })).toBeInTheDocument();
    expect(screen.getAllByText(/Showing 1 point\(s\) · scope All workpacks/i).length).toBeGreaterThan(0);
    expect(screen.getByText("no_scoped_context · 1")).toBeInTheDocument();
    expect(screen.getByText(/expand supervised usage/i)).toBeInTheDocument();
  });
});
