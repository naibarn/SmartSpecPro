/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
const mockClipboardWriteText = vi.fn().mockResolvedValue(undefined);
const mockReconcileBrowserAutomationTasks = vi.fn().mockResolvedValue(undefined);

function queryResult<T>(data: T) {
  return {
    data,
    isLoading: false,
    refetch: vi.fn(),
  };
}

vi.mock("wouter", () => ({
  useLocation: () => ["/admin/monitoring", mockNavigate],
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 7, role: "admin" },
    loading: false,
  }),
}));

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlags: () => ({
    hermesTaskModes: false,
  }),
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    locale: "en",
    t: (_key: string, defaultValue?: string | Record<string, unknown>) =>
      typeof defaultValue === "string" ? defaultValue : _key,
    i18n: {
      exists: () => true,
      resolvedLanguage: "en",
      language: "en",
      changeLanguage: vi.fn(),
    },
    setLocale: vi.fn(),
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

vi.mock("@/components/help/HelpButton", () => ({
  HelpButton: ({ label }: any) => <button type="button">{label}</button>,
}));

vi.mock("@/components/LocaleToggle", () => ({
  LocaleToggle: () => null,
}));

vi.mock("@/components/admin/OpsEarlyWarningPanel", () => ({
  OpsEarlyWarningPanel: () => <div>Ops panel</div>,
}));

vi.mock("@/lib/opsMonitoringGuidance", () => ({
  getOpsIncidentGuidance: () => ({
    summary: "summary",
    headline: "headline",
    checkNow: ["check"],
    helpTopicSlug: "help",
    helpLabel: "help",
  }),
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

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      monitoring: {
        getCurrentStatus: { invalidate: vi.fn() },
        getOpsOverview: { invalidate: vi.fn() },
        getChecks: { invalidate: vi.fn() },
        getAlerts: { invalidate: vi.fn() },
        getMetricsHistory: { invalidate: vi.fn() },
        getOpsIncidentTimeline: { invalidate: vi.fn() },
        listWorkers: { invalidate: vi.fn() },
        getTenantWorkerMcpOverview: { invalidate: vi.fn() },
        getWorkerDiagnostics: { invalidate: vi.fn() },
        getWorkerMcpInsights: { invalidate: vi.fn() },
        getWorkerBudget: { invalidate: vi.fn() },
      },
    }),
    monitoring: {
      recordIncidentAction: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      acknowledgeAlert: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      updateWorkerState: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      redactLegacyWorkerData: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      updateWorkerBudget: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      forceFreshCheck: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      getCurrentStatus: { useQuery: () => queryResult({ services: [], alerts: { critical: 0, warning: 0 }, lastCheck: null }) },
      getOpsOverview: { useQuery: () => queryResult({ health: "healthy", anomalies: [], summary: { totalAnomalies: 0, criticalCount: 0, warningCount: 0, resourceCount: 0, serviceCount: 0, monitoringCount: 0, auditCount: 0, orchestrationCount: 0 }, leadingSignals: { memoryPercent: null, cpuPercent: null, diskPercent: null, maxRestartDelta: null, llmErrorRate: null, mediaErrorRate: null, llmP95LatencyMs: null, mediaP95LatencyMs: null, fallbackRate: null, qualityRiskRate: null }, windows: { metricsHours: 6, auditHours: 6, orchestrationHours: 6 }, updatedAt: new Date().toISOString() }) },
      getWorkOsOverview: { useQuery: () => queryResult({ byState: {}, openExceptions: 0, overdueSla: 0, completed: 0 }) },
      getOpsIncidentTimeline: { useQuery: () => queryResult({ items: [], lastCheckAt: null }) },
      getChecks: { useQuery: () => queryResult({ items: [], total: 0 }) },
      getAlerts: { useQuery: () => queryResult({ items: [], total: 0 }) },
      getMetricsHistory: { useQuery: () => queryResult([]) },
      listWorkers: { useQuery: () => queryResult([]) },
      getTenantWorkerMcpOverview: { useQuery: () => queryResult(null) },
      getWorkerDiagnostics: { useQuery: () => queryResult(null) },
      getWorkerMcpInsights: { useQuery: () => queryResult(null) },
      getWorkerBudget: { useQuery: () => queryResult(null) },
    },
    workOs: {
      getBrowserAutomationHealth: { useQuery: () => queryResult({
        totalClaims: 4,
        pendingClaims: 2,
        claimedClaims: 1,
        queuedClaims: 1,
        runningClaims: 1,
        completedClaims: 1,
        failedClaims: 0,
        cancelledClaims: 0,
        staleClaims: 1,
        distinctCases: 2,
        latestClaimedAt: new Date().toISOString(),
        latestPolledAt: new Date().toISOString(),
        latestUpdatedAt: new Date().toISOString(),
        latestCompletedAt: new Date().toISOString(),
        nextPollAt: new Date().toISOString(),
      }) },
      reconcileBrowserAutomationTasks: { useMutation: () => ({ mutate: mockReconcileBrowserAutomationTasks, isPending: false }) },
    },
    usage: {
      getUsers: { useQuery: () => queryResult({ users: [] }) },
    },
  },
}));

import AdminMonitoring from "../AdminMonitoring";

describe("AdminMonitoring Work OS shortcuts", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockClipboardWriteText.mockClear();
    mockReconcileBrowserAutomationTasks.mockClear();
    Object.defineProperty(window.navigator, "clipboard", {
      value: {
        writeText: mockClipboardWriteText,
      },
      configurable: true,
    });
  });

  it("routes Work OS shortcut buttons with source filters", () => {
    render(<AdminMonitoring />);

    fireEvent.click(screen.getByRole("button", { name: /open guide/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/help/work-os");

    fireEvent.click(screen.getByRole("button", { name: /role routine/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/admin/work-os?timelineSource=role_routine");

    fireEvent.click(screen.getByRole("button", { name: /team run/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/admin/work-os?timelineSource=team_run");

    fireEvent.click(screen.getAllByRole("button", { name: /workpack/i })[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/admin/work-os?timelineSource=workpack_record");

    fireEvent.click(screen.getByRole("button", { name: /browser automation/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/admin/work-os?timelineSource=browser_automation");
  });

  it("copies Work OS shortcut links from the coverage card", () => {
    render(<AdminMonitoring />);

    fireEvent.click(screen.getByRole("button", { name: /copy permalink/i }));
    expect(mockClipboardWriteText).toHaveBeenCalledWith(`${window.location.origin}/admin/work-os`);

    fireEvent.click(screen.getByRole("button", { name: /copy role evidence/i }));
    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?timelineSource=role_routine`,
    );

    fireEvent.click(screen.getByRole("button", { name: /copy team evidence/i }));
    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?timelineSource=team_run`,
    );

    fireEvent.click(screen.getByRole("button", { name: /copy workpack evidence/i }));
    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?timelineSource=workpack_record`,
    );

    fireEvent.click(screen.getByRole("button", { name: /copy browser evidence/i }));
    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/admin/work-os?timelineSource=browser_automation`,
    );
  });

  it("shows browser automation health and can reconcile it", () => {
    render(<AdminMonitoring />);

    expect(screen.getByText(/browser automation health/i)).toBeInTheDocument();
    expect(screen.getByText(/2 pending/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reconcile browser/i })).toBeInTheDocument();
  });

  it("reconciles browser automation tasks from the coverage card", () => {
    render(<AdminMonitoring />);

    fireEvent.click(screen.getByRole("button", { name: /reconcile browser/i }));

    expect(mockReconcileBrowserAutomationTasks).toHaveBeenCalledWith({ limit: 50 });
  });
});
