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
  mockGetWorkerQueueOverview,
  mockGetWorkerDiagnosticsSnapshot,
  mockGetWorkerMcpInsights,
  mockGetTenantWorkerMcpOverview,
  mockGetWorkOsOverview,
  mockGetContextEngineHealth,
  mockListContextEngineEvaluations,
  mockBuildContextEngineParitySummary,
  mockUpdateWorkerFleetState,
  mockCleanupWorkerFleetRetention,
  mockRedactLegacyWorkerData,
} = vi.hoisted(() => ({
  mockListWorkerFleet: vi.fn(),
  mockGetWorkerQueueOverview: vi.fn(),
  mockGetWorkerDiagnosticsSnapshot: vi.fn(),
  mockGetWorkerMcpInsights: vi.fn(),
  mockGetTenantWorkerMcpOverview: vi.fn(),
  mockGetWorkOsOverview: vi.fn(),
  mockGetContextEngineHealth: vi.fn(),
  mockListContextEngineEvaluations: vi.fn(),
  mockBuildContextEngineParitySummary: vi.fn(),
  mockUpdateWorkerFleetState: vi.fn(),
  mockCleanupWorkerFleetRetention: vi.fn(),
  mockRedactLegacyWorkerData: vi.fn(),
}));

vi.mock("../../services/workerFleetService", () => ({
  listWorkerFleet: mockListWorkerFleet,
  getWorkerQueueOverview: mockGetWorkerQueueOverview,
  getWorkerDiagnosticsSnapshot: mockGetWorkerDiagnosticsSnapshot,
  getWorkerMcpInsights: mockGetWorkerMcpInsights,
  getTenantWorkerMcpOverview: mockGetTenantWorkerMcpOverview,
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
  getContextEngineHealth: mockGetContextEngineHealth,
  acknowledgeAlert: vi.fn(),
  recordIncidentAction: vi.fn(),
  pushMetrics: vi.fn(),
  getMetricsHistory: vi.fn(),
  getCurrentStatus: vi.fn(),
  getOpsOverview: vi.fn(),
  getOpsIncidentTimeline: vi.fn(),
}));

vi.mock("../../services/contextEngineEvaluationService", () => ({
  listContextEngineEvaluations: mockListContextEngineEvaluations,
  buildContextEngineParitySummary: mockBuildContextEngineParitySummary,
  buildContextEngineTrendSeries: vi.fn((records: Array<{ details?: { surface?: string | null } }>) =>
    records.map((record, index) => ({
      bucket: `2026-04-17T${String(index).padStart(2, "0")}`,
      surface: record.details?.surface ?? "unknown",
      averageHealthScore: 0.8,
      averageGroundingScore: 0.7,
      averageRetrievalCoverage: 0.6,
      averageLatencyMs: 500,
    })),
  ),
}));

vi.mock("../../services/workOsService", () => ({
  getOverview: mockGetWorkOsOverview,
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
    mockGetContextEngineHealth.mockResolvedValue({
      scope: {
        tenantId: "tenant-1",
        teamId: "team-1",
        roomId: "room-1",
        runId: "run-1",
        skillId: null,
        userId: null,
        since: new Date("2026-04-17T00:00:00.000Z").toISOString(),
        limit: 12,
      },
      window: {
        matchedChecks: 1,
        latestCreatedAt: new Date("2026-04-17T00:10:00.000Z").toISOString(),
      },
      totals: {
        total: 1,
        ok: 1,
        warning: 0,
        critical: 0,
        error: 0,
      },
      latest: null,
      recentChecks: [],
      averages: {
        healthScore: 0.88,
        groundingScore: 0.76,
        retrievalCoverage: 0.61,
        freshnessScore: 0.73,
        staleContextRatio: 0.14,
        tokenPressureRatio: 0.42,
        latencyMs: 530,
      },
      sourceBreakdown: [{ source: "team_run", count: 1 }],
    });
  });

  it("returns context engine evaluation report for admins", async () => {
    mockListContextEngineEvaluations.mockResolvedValue([
      {
        id: 1,
        checkType: "context_engine_eval",
        status: "ok",
        source: "team_run",
        createdAt: new Date("2026-04-18T00:00:00.000Z").toISOString(),
        details: {
          tenantId: "tenant-1",
          surface: "team_room",
          intent: "work_execution",
          teamId: "team-1",
          roomId: "room-1",
          runId: "run-1",
          projectId: "project-1",
          userId: 1,
          skillId: "skill-1",
          healthScore: 0.91,
          groundingScore: 0.8,
          retrievalCoverage: 0.7,
          freshnessScore: 0.82,
          staleContextRatio: 0.12,
          tokenPressureRatio: 0.31,
          latencyMs: 150,
        },
      },
    ]);
    mockBuildContextEngineParitySummary.mockResolvedValue([
      {
        surface: "team_room",
        total: 1,
        ok: 1,
        warning: 0,
        critical: 0,
        averageHealthScore: 0.91,
        averageGroundingScore: 0.8,
        averageRetrievalCoverage: 0.7,
      },
    ]);

    const result = await monitoringRouter.getContextEngineEvaluationReport({
      input: {
        teamId: "team-1",
        roomId: "room-1",
        runId: "run-1",
        limit: 25,
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 7, role: "admin", currentTenantId: 1 },
      },
    } as any);

    expect(mockListContextEngineEvaluations).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        teamId: "team-1",
        roomId: "room-1",
        runId: "run-1",
        limit: 25,
      }),
    );
    expect(mockBuildContextEngineParitySummary).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        teamId: "team-1",
        roomId: "room-1",
        runId: "run-1",
        limit: 25,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        records: expect.arrayContaining([
          expect.objectContaining({
            details: expect.objectContaining({
              projectId: "project-1",
            }),
          }),
        ]),
        parity: expect.arrayContaining([
          expect.objectContaining({
            surface: "team_room",
          }),
        ]),
        trend: expect.arrayContaining([
          expect.objectContaining({
            surface: "team_room",
          }),
        ]),
      }),
    );
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

  it("returns worker queue overview for admins", async () => {
    mockGetWorkerQueueOverview.mockResolvedValue({
      tenantId: "tenant-1",
      generatedAt: "2026-06-22T12:00:00.000Z",
      hours: 24,
      totalJobs: 4,
      queuedJobCount: 1,
      activeJobCount: 2,
      stalledJobCount: 1,
      reassignableJobCount: 1,
      completedJobCount: 1,
      failedJobCount: 0,
      canceledJobCount: 0,
      oldestQueuedAt: "2026-06-22T11:30:00.000Z",
      oldestQueuedAgeMs: 1_800_000,
      verificationFailureCount: 1,
      staleUploadRejectionCount: 1,
      reassignmentCount: 1,
      securityWarningCounts: {
        tokenReplay: 0,
        deviceProofMismatch: 1,
        refreshTokenReuse: 0,
        autoBlockedConnection: 0,
      },
      runtimeVersionDistribution: [],
      recentJobs: [],
    });

    const result = await monitoringRouter.getWorkerQueueOverview({
      input: { hours: 24 },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 7, role: "admin", currentTenantId: 1 },
      },
    } as any);

    expect(mockGetWorkerQueueOverview).toHaveBeenCalledWith("tenant-1", {
      hours: 24,
    });
    expect(result).toEqual(expect.objectContaining({
      tenantId: "tenant-1",
      queuedJobCount: 1,
      stalledJobCount: 1,
      verificationFailureCount: 1,
    }));
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

  it("returns worker MCP insights for admins", async () => {
    mockGetWorkerMcpInsights.mockResolvedValue({
      workerId: "worker-1",
      manifestStatus: "ready",
      hours: 24,
      totals: {
        sessionInitializations: 1,
        toolListCalls: 2,
        toolCalls: 3,
        successCount: 2,
        deniedCount: 1,
        budgetDeniedCount: 0,
        approvalRequiredCount: 0,
        replayHitCount: 0,
        failureCount: 0,
      },
      familyMetrics: [],
      toolMetrics: [],
      denialReasons: [],
      recentEvents: [],
    });

    const result = await monitoringRouter.getWorkerMcpInsights({
      input: { workerId: "worker-1", hours: 24 },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 7, role: "admin", currentTenantId: 1 },
      },
    } as any);

    expect(mockGetWorkerMcpInsights).toHaveBeenCalledWith("tenant-1", "worker-1", {
      hours: 24,
    });
    expect(result).toEqual(expect.objectContaining({
      workerId: "worker-1",
      manifestStatus: "ready",
    }));
  });

  it("returns tenant worker MCP overview for admins", async () => {
    mockGetTenantWorkerMcpOverview.mockResolvedValue({
      tenantId: "tenant-1",
      hours: 24,
      totalWorkers: 3,
      workersWithRecentMcpCalls: 2,
      workersWithActiveDelegatedSessions: 1,
      manifestStatusCounts: {
        ready: 1,
        stale: 1,
        unavailable: 1,
      },
      operatorPolicy: {
        enabled: true,
        disabledFamilies: [],
        disabledToolGroups: [],
        approvalRequiredToolGroups: [],
      },
      totals: {
        sessionInitializations: 1,
        toolListCalls: 2,
        toolCalls: 5,
        successCount: 4,
        deniedCount: 1,
        budgetDeniedCount: 0,
        approvalRequiredCount: 0,
        replayHitCount: 0,
        failureCount: 0,
      },
      familyMetrics: [],
      toolMetrics: [],
      denialReasons: [],
      workerMetrics: [],
      recentEvents: [],
    });

    const result = await monitoringRouter.getTenantWorkerMcpOverview({
      input: { hours: 24 },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 7, role: "admin", currentTenantId: 1 },
      },
    } as any);

    expect(mockGetTenantWorkerMcpOverview).toHaveBeenCalledWith("tenant-1", {
      hours: 24,
    });
    expect(result).toEqual(expect.objectContaining({
      tenantId: "tenant-1",
      totalWorkers: 3,
    }));
  });

  it("returns context engine health for admins", async () => {
    const result = await monitoringRouter.getContextEngineHealth({
      input: {
        teamId: "team-1",
        roomId: "room-1",
        runId: "run-1",
        limit: 12,
      },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 7, role: "admin", currentTenantId: 1 },
      },
    } as any);

    expect(mockGetContextEngineHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        teamId: "team-1",
        roomId: "room-1",
        runId: "run-1",
        limit: 12,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        scope: expect.objectContaining({
          tenantId: "tenant-1",
        }),
      }),
    );
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

  it("returns work os overview for admins", async () => {
    mockGetWorkOsOverview.mockResolvedValue({
      byState: {
        open: 2,
        in_progress: 1,
        completed: 3,
      },
      openExceptions: 1,
      overdueSla: 2,
      completed: 3,
    });

    const result = await monitoringRouter.getWorkOsOverview({
      ctx: {
        tenantId: "tenant-1",
        user: { id: 18, role: "admin", currentTenantId: 1 },
      },
    } as any);

    expect(mockGetWorkOsOverview).toHaveBeenCalledWith("tenant-1");
    expect(result).toEqual(expect.objectContaining({
      openExceptions: 1,
      overdueSla: 2,
      completed: 3,
    }));
  });
});
