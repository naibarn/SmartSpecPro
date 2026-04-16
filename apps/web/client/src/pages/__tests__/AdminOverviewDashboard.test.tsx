/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const setLocationMock = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/admin/dashboard", setLocationMock] as const,
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { role: "admin" },
    loading: false,
  }),
}));

vi.mock("@/components/LocaleToggle", () => ({
  LocaleToggle: () => <div>Locale</div>,
}));

vi.mock("@/components/help", () => ({
  HelpButton: () => <button type="button">Help</button>,
}));

const queryResult = (data: unknown) => ({ data, isLoading: false });

vi.mock("@/lib/trpc", () => ({
  trpc: {
    adminOps: {
      trafficStats: { useQuery: () => queryResult({ totals: { activeToday: 1, totalUsers: 10 }, daily: [{ date: "2026-04-10", userCount: 1 }] }) },
      apiHealth: { useQuery: () => queryResult({ summary: { avgLatencyMs: 120, p95LatencyMs: 240 } }) },
      jobsHealth: { useQuery: () => queryResult({ countsByStatus: { processing: 2, completed: 4 } }) },
      kieAiHealth: { useQuery: () => queryResult({ summary: { completed: 1, failed: 0 } }) },
      storageStats: { useQuery: () => queryResult({ totalSizeGb: 12.5 }) },
      securityStats: { useQuery: () => queryResult({ totalRateLimitKeys: 3 }) },
      dailyLlmUsage: { useQuery: () => queryResult({ topModels: ["gpt-4o"], daily: [] }) },
      dailyMediaUsage: { useQuery: () => queryResult({ topModels: [], daily: [] }) },
      pendingApprovalCounts: { useQuery: () => queryResult({ agencies: 1, templates: 2 }) },
      workpackReleaseHealth: { useQuery: () => queryResult({ blockers: [{ workpackId: "wp_1", gateResult: "review_required" }] }) },
    },
    audit: {
      stats: { useQuery: () => queryResult({ totalRequests: 7, errorRate: 0.02, totalCost: 4.5, requestsPerDay: [{ date: "2026-04-10", count: 5, errors: 1 }] }) },
    },
    infrastructure: {
      getSystemHealth: { useQuery: () => queryResult({ status: "healthy", services: { api: { status: "healthy" } } }) },
      getRedisHealth: { useQuery: () => queryResult({ cache: { healthy: true }, realtime: { healthy: true } }) },
      getMonitoringStatus: { useQuery: () => queryResult({ sentry: { configured: true }, posthog: { configured: true } }) },
    },
  },
}));

import AdminOverviewDashboard from "../Admin/AdminOverviewDashboard";

describe("AdminOverviewDashboard", () => {
  beforeEach(() => {
    setLocationMock.mockClear();
  });

  it("exposes the workpack access routes from the admin overview", () => {
    render(<AdminOverviewDashboard />);

    expect(screen.getByText("Workpack Access")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /intake studio/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /discovery library/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /roi dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /exceptions inbox/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /work os console/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /work os console/i }));
    expect(setLocationMock).toHaveBeenCalledWith("/admin/work-os");
  });
});
