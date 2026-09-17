/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const setLocationMock = vi.fn();

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

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string) => key === "dashboard:workerMonitor.title"
      ? "Worker Job Monitor"
      : key === "dashboard:workerMonitor.description"
        ? "Canonical worker_jobs, outbox, lease, capacity, and heartbeat health."
        : key,
  }),
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
    workerJobs: {
      adminDashboardSummary: { useQuery: () => queryResult({
        counts: { pending: 0, queued: 0, running: 0, waitingExternal: 0, retryScheduled: 0, succeeded: 0, failed: 0, canceled: 0, expired: 0, active: 0, stale: 0, executingByStatus: { leased: 0, claimed: 0, preparing: 0, running: 0, uploading: 0, publishing: 0, indexing: 0 } },
        capacity: { workersTotal: 0, workersOnline: 0, workersUnhealthy: 0, workersStale: 0, totalSlots: 0, usedSlots: 0, freeSlots: 0, queueDepth: 0, capacityKnown: true, unknownCapacityWorkers: 0, slotSources: [] },
        outbox: { pending: 0, failed: 0, quarantined: 0, oldestPendingAt: null, oldestPendingAgeSeconds: 0 },
        backlog: { oldestQueuedAt: null, oldestQueuedAgeSeconds: 0 },
        alerts: { hasIncident: false, capacityExhausted: false, capacityUnknown: false },
        openJobs: [],
        recentJobs: [],
      }) },
    },
    infrastructure: {
    },
  },
}));

import AdminCommandCenter from "../Admin/AdminCommandCenter";

describe("AdminCommandCenter", () => {
  beforeEach(() => {
    setLocationMock.mockClear();
  });

  it("shows the canonical worker job monitor", () => {
    render(<AdminCommandCenter />);

    expect(screen.getByText("Worker Job Monitor")).toBeInTheDocument();
    expect(screen.getByText("Canonical worker_jobs, outbox, lease, capacity, and heartbeat health.")).toBeInTheDocument();
  });
});
