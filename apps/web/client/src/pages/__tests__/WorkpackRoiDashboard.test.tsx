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
      },
      isLoading: false,
    });
  });

  it("renders KPI cards and readiness summaries", () => {
    render(<WorkpackRoiDashboard />);

    expect(screen.getByText("Completion rate")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText(/expand supervised usage/i)).toBeInTheDocument();
  });
});
