import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
      use: () => proc,
    };
    return proc;
  };

  return {
    router: (routes: any) => routes,
    protectedProcedure: createProcedure(),
    adminProcedure: createProcedure(),
  };
});

const { mockResolveTenantIdVarchar } = vi.hoisted(() => ({
  mockResolveTenantIdVarchar: vi.fn(() => "tenant-1"),
}));

vi.mock("../../services/tenantContext", () => ({
  resolveTenantIdVarchar: mockResolveTenantIdVarchar,
}));

const {
  mockListWorkerFleet,
  mockGetWorkerDiagnosticsSnapshot,
  mockUpdateWorkerFleetState,
  mockCleanupWorkerFleetRetention,
  mockRedactLegacyWorkerData,
} = vi.hoisted(() => ({
  mockListWorkerFleet: vi.fn(),
  mockGetWorkerDiagnosticsSnapshot: vi.fn(),
  mockUpdateWorkerFleetState: vi.fn(),
  mockCleanupWorkerFleetRetention: vi.fn(),
  mockRedactLegacyWorkerData: vi.fn(),
}));

vi.mock("../../services/workerFleetService", () => ({
  listWorkerFleet: mockListWorkerFleet,
  getWorkerDiagnosticsSnapshot: mockGetWorkerDiagnosticsSnapshot,
  updateWorkerFleetState: mockUpdateWorkerFleetState,
  cleanupWorkerFleetRetention: mockCleanupWorkerFleetRetention,
  redactLegacyWorkerData: mockRedactLegacyWorkerData,
}));

const {
  mockGetWorkerBudgetSettings,
  mockUpdateWorkerBudgetSettings,
} = vi.hoisted(() => ({
  mockGetWorkerBudgetSettings: vi.fn(),
  mockUpdateWorkerBudgetSettings: vi.fn(),
}));

vi.mock("../../services/workerBudgetService", () => ({
  getWorkerBudgetSettings: mockGetWorkerBudgetSettings,
  updateWorkerBudgetSettings: mockUpdateWorkerBudgetSettings,
}));

vi.mock("../../services/monitoringService", () => ({
  getRunEvents: vi.fn(),
  captureSnapshot: vi.fn(),
  checkStuckAgent: vi.fn(),
  getChecks: vi.fn(),
  getAlerts: vi.fn(),
  acknowledgeAlert: vi.fn(),
  recordIncidentAction: vi.fn(),
  pushMetrics: vi.fn(),
  getMetricsHistory: vi.fn(),
  getCurrentStatus: vi.fn(),
  getOpsOverview: vi.fn(),
  getOpsIncidentTimeline: vi.fn(),
}));

vi.mock("../../services/orchestratorNotificationService", () => ({
  getNotifications: vi.fn(),
  markAsRead: vi.fn(),
  dismissNotification: vi.fn(),
}));

vi.mock("../../services/unifiedNotificationService", () => ({
  getUnifiedNotifications: vi.fn(),
  getUnifiedStats: vi.fn(),
}));

vi.mock("../../services/notificationHealthChecks", () => ({
  checkNotificationHealth: vi.fn(),
}));

vi.mock("../services", () => ({
  collectServiceRuntimeSnapshot: vi.fn(),
}));

import { monitoringRouter } from "../monitoring";

describe("monitoringRouter worker fleet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveTenantIdVarchar.mockReturnValue("tenant-1");
  });

  it("lists tenant workers for admins", async () => {
    mockListWorkerFleet.mockResolvedValue([
      {
        id: "worker-1",
        displayName: "Gateway Alpha",
        status: "online",
      },
    ]);

    const result = await monitoringRouter.listWorkers({
      ctx: {
        tenantId: "tenant-1",
        user: { id: 7, role: "admin", currentTenantId: 1 },
      },
    } as any);

    expect(mockListWorkerFleet).toHaveBeenCalledWith("tenant-1");
    expect(result).toEqual([
      expect.objectContaining({ id: "worker-1" }),
    ]);
  });

  it("returns worker diagnostics snapshots for admins", async () => {
    mockGetWorkerDiagnosticsSnapshot.mockResolvedValue({
      workerId: "worker-1",
      detailsJson: { healthy: true },
    });

    const result = await monitoringRouter.getWorkerDiagnostics({
      input: { workerId: "worker-1" },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 7, role: "admin", currentTenantId: 1 },
      },
    } as any);

    expect(mockGetWorkerDiagnosticsSnapshot).toHaveBeenCalledWith("tenant-1", "worker-1");
    expect(result).toEqual(expect.objectContaining({
      workerId: "worker-1",
    }));
  });

  it("updates worker fleet state with the acting admin id", async () => {
    mockUpdateWorkerFleetState.mockResolvedValue({
      id: "worker-1",
      status: "draining",
    });

    const result = await monitoringRouter.updateWorkerState({
      input: {
        workerId: "worker-1",
        action: "drain",
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 9, role: "admin", currentTenantId: 1 },
      },
    } as any);

    expect(mockUpdateWorkerFleetState).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      workerId: "worker-1",
      action: "drain",
      actorUserId: 9,
    });
    expect(result).toEqual({
      success: true,
      workerId: "worker-1",
      status: "draining",
    });
  });

  it("runs worker retention cleanup on demand", async () => {
    mockCleanupWorkerFleetRetention.mockResolvedValue({
      deletedHeartbeats: 2,
      deletedJobEvents: 3,
      deletedUnpublishedArtifacts: 1,
      expiredJobs: 4,
    });

    const result = await monitoringRouter.cleanupWorkerRetention({
      ctx: {
        tenantId: "tenant-1",
        user: { id: 11, role: "admin", currentTenantId: 1 },
      },
    } as any);

    expect(mockCleanupWorkerFleetRetention).toHaveBeenCalledWith({ tenantId: "tenant-1" });
    expect(result).toEqual(expect.objectContaining({
      deletedHeartbeats: 2,
      expiredJobs: 4,
    }));
  });

  it("runs legacy worker data redaction on demand", async () => {
    mockRedactLegacyWorkerData.mockResolvedValue({
      tenantId: "tenant-1",
      scannedWorkers: 2,
      updatedWorkers: 1,
      scannedArtifacts: 3,
      updatedArtifacts: 2,
    });

    const result = await monitoringRouter.redactLegacyWorkerData({
      ctx: {
        tenantId: "tenant-1",
        user: { id: 13, role: "admin", currentTenantId: 1 },
      },
    } as any);

    expect(mockRedactLegacyWorkerData).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      actorUserId: 13,
    });
    expect(result).toEqual(expect.objectContaining({
      updatedWorkers: 1,
      updatedArtifacts: 2,
    }));
  });

  it("returns worker budget guardrails for admins", async () => {
    mockGetWorkerBudgetSettings.mockResolvedValue({
      workerId: "worker-1",
      blockedByBudget: false,
      windows: [],
    });

    const result = await monitoringRouter.getWorkerBudget({
      input: { workerId: "worker-1" },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 15, role: "admin", currentTenantId: 1 },
      },
    } as any);

    expect(mockGetWorkerBudgetSettings).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      workerId: "worker-1",
    });
    expect(result).toEqual(expect.objectContaining({
      workerId: "worker-1",
      blockedByBudget: false,
    }));
  });

  it("updates worker budget guardrails for admins", async () => {
    mockUpdateWorkerBudgetSettings.mockResolvedValue({
      workerId: "worker-1",
      budgets: { hourlyCredits: 20 },
      blockedByBudget: false,
      windows: [],
    });

    const result = await monitoringRouter.updateWorkerBudget({
      input: {
        workerId: "worker-1",
        hourlyCredits: 20,
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 16, role: "admin", currentTenantId: 1 },
      },
    } as any);

    expect(mockUpdateWorkerBudgetSettings).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      workerId: "worker-1",
      actorUserId: 16,
      budgets: {
        hourlyCredits: 20,
        fiveHourCredits: null,
        dailyCredits: null,
        weeklyCredits: null,
        monthlyCredits: null,
      },
    });
    expect(result).toEqual(expect.objectContaining({
      workerId: "worker-1",
    }));
  });
});
