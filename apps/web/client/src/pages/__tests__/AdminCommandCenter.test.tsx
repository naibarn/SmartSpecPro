/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const setLocationMock = vi.fn();
const doctorMutationMock = vi.fn();

function queryResult<T>(data: T) {
  return { data, isLoading: false, refetch: vi.fn() };
}

vi.mock("wouter", () => ({
  useLocation: () => ["/admin/dashboard", setLocationMock] as const,
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, role: "admin" }, loading: false }),
}));

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlag: () => false,
}));

vi.mock("@/features/desktop-host/useDesktopHostStatus", () => ({
  useDesktopHostStatus: () => ({
    status: { devices: [], reportedAt: new Date().toISOString() },
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/components/LocaleToggle", () => ({
  LocaleToggle: () => <div>Locale</div>,
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

vi.mock("@/components/admin/OpsEarlyWarningPanel", () => ({
  OpsEarlyWarningPanel: () => <div>Ops panel</div>,
}));

vi.mock("@/lib/utils", () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" "),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    monitoring: {
      getOpsOverview: { useQuery: () => queryResult({ health: "healthy", anomalies: [], summary: { totalAnomalies: 0, criticalCount: 0, warningCount: 0, resourceCount: 0, serviceCount: 0, monitoringCount: 0, auditCount: 0, orchestrationCount: 0 }, leadingSignals: { memoryPercent: null, cpuPercent: null, diskPercent: null, maxRestartDelta: null, llmErrorRate: null, mediaErrorRate: null, llmP95LatencyMs: null, mediaP95LatencyMs: null, fallbackRate: null, qualityRiskRate: null }, windows: { metricsHours: 6, auditHours: 6, orchestrationHours: 6 }, updatedAt: new Date().toISOString() }) },
      getCurrentStatus: { useQuery: () => queryResult({ alerts: { critical: 0, warning: 0 }, lastCheck: new Date().toISOString(), services: [] }) },
      getOpsIncidentTimeline: { useQuery: () => queryResult({ items: [] }) },
      getAlerts: { useQuery: () => queryResult({ alerts: [] }) },
      getUnifiedStats: { useQuery: () => queryResult({ today: 0, critical: 0 }) },
      getUnifiedNotifications: { useQuery: () => queryResult({ items: [] }) },
      syncOpsAlerts: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    queues: {
      getSystemStatus: { useQuery: () => queryResult({ limiters: { totalQueued: 0 }, cloudTasks: { totalTasks: 0 } }) },
    },
    infrastructure: {
      getCeleryMediaDoctorStatus: { useQuery: () => queryResult({
        checkedAt: new Date().toISOString(),
        overallStatus: "healthy",
        workers: {
          media: { service: "celery-media", containerName: "smartspec-celery-media", status: "running", project: "smartspecpro", health: "healthy", restartCount: 0, startedAt: null, duplicate: false, candidates: [] },
          beat: { service: "celery-beat", containerName: "smartspec-celery-beat", status: "running", project: "smartspecpro", health: "healthy", restartCount: 0, startedAt: null, duplicate: false, candidates: [] },
        },
        queue: { redisMediaDepth: 0, pendingCount: 0, processingCount: 0, stalePendingCount: 0 },
        users: [], selectedUser: null, repair: { available: false, reason: null },
      }) },
      runCeleryMediaDoctor: { useMutation: () => ({ mutate: doctorMutationMock, isPending: false }) },
    },
  },
}));

import AdminCommandCenter from "../Admin/AdminCommandCenter";

describe("AdminCommandCenter", () => {
  beforeEach(() => {
    setLocationMock.mockClear();
    doctorMutationMock.mockClear();
  });

  it("shows the exact-admin Celery doctor and can run a safe repair", () => {
    render(<AdminCommandCenter />);

    expect(screen.getByText("Celery Media Doctor")).toBeInTheDocument();
    expect(screen.getByText("celery-media")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /run doctor/i }));
    expect(doctorMutationMock).toHaveBeenCalledTimes(1);
  });

  it("exposes workpack routes from the command center", () => {
    render(<AdminCommandCenter />);

    expect(screen.getByText("Workpack Hub")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /intake studio/i }));
    expect(setLocationMock).toHaveBeenCalledWith("/workpacks/intake?entrypoint=dashboard");

    fireEvent.click(screen.getByRole("button", { name: /discovery library/i }));
    expect(setLocationMock).toHaveBeenCalledWith("/workpacks/discovery?entrypoint=dashboard");

    fireEvent.click(screen.getByRole("button", { name: /roi dashboard/i }));
    expect(setLocationMock).toHaveBeenCalledWith("/workpacks/roi?entrypoint=dashboard");

    fireEvent.click(screen.getByRole("button", { name: /exceptions inbox/i }));
    expect(setLocationMock).toHaveBeenCalledWith(
      "/workpacks/exceptions?entrypoint=dashboard"
    );
  });
});
