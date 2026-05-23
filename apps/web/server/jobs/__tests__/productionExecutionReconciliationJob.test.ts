import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  mockReconcilePendingProductionExecutions,
  mockSignBearerToken,
  selectErrorsQueue,
  selectRowsQueue,
  db,
  resetHarness,
} = vi.hoisted(() => {
  const selectErrorsQueue: any[] = [];
  const selectRowsQueue: any[][] = [];
  const db = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => {
        const query: any = {};
        query.where = vi.fn().mockReturnValue(query);
        query.orderBy = vi.fn().mockReturnValue(query);
        query.limit = vi.fn().mockImplementation(() => {
          if (selectErrorsQueue.length > 0) {
            return Promise.reject(selectErrorsQueue.shift());
          }
          return Promise.resolve(selectRowsQueue.shift() ?? []);
        });
        return query;
      }),
    })),
  } as any;

  return {
    selectErrorsQueue,
    selectRowsQueue,
    db,
    mockGetDb: vi.fn(() => db),
    mockReconcilePendingProductionExecutions: vi.fn(),
    mockSignBearerToken: vi.fn(() => "production-reconcile-token"),
    resetHarness: () => {
      selectErrorsQueue.length = 0;
      selectRowsQueue.length = 0;
      db.select.mockClear();
      mockGetDb.mockClear();
      mockReconcilePendingProductionExecutions.mockReset();
      mockSignBearerToken.mockClear();
    },
  };
});

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../../_core/tokens", () => ({
  signBearerToken: mockSignBearerToken,
}));

vi.mock("../../services/productionSpaceService", () => ({
  isProductionSpaceStorageUnavailable: (error: unknown) => {
    const raw = error as { code?: string; message?: string };
    return raw?.code === "42P01" && String(raw?.message ?? "").includes("media_production_spaces");
  },
  reconcilePendingProductionExecutions: mockReconcilePendingProductionExecutions,
}));

describe("productionExecutionReconciliationJob", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllTimers();
    vi.useRealTimers();
    delete process.env.FEATURE116_PRODUCTION_RECONCILER_SCHEDULER_MODE;
    delete process.env.USE_CLOUD_TASKS;
    resetHarness();
  });

  it("scans active production tenants and reconciles each unique tenant with a production token resolver", async () => {
    const { runProductionExecutionReconciliationJob } = await import("../productionExecutionReconciliationJob");
    selectRowsQueue.push([
      { tenantId: "tenant-1" },
      { tenantId: "tenant-1" },
      { tenantId: "tenant-2" },
    ]);
    mockReconcilePendingProductionExecutions
      .mockResolvedValueOnce({
        scannedSpaces: 2,
        pendingAttempts: 1,
        reconciledAttempts: 1,
        skippedAttempts: 0,
        alerts: [],
      })
      .mockImplementationOnce(async (input: any) => {
        const token = await input.tokenResolver({
          userId: 42,
          tenantId: "tenant-2",
          productionRunId: "run-2",
        });
        return {
          scannedSpaces: 1,
          pendingAttempts: 1,
          reconciledAttempts: token === "production-reconcile-token" ? 1 : 0,
          skippedAttempts: 0,
          alerts: [{ code: "credit_ledger_mismatch" }],
        };
      });

    const summary = await runProductionExecutionReconciliationJob({ tenantLimit: 10, spaceLimit: 7 });

    expect(summary).toMatchObject({
      tenantsScanned: 2,
      scannedSpaces: 3,
      pendingAttempts: 2,
      reconciledAttempts: 2,
      skippedAttempts: 0,
    });
    expect(summary.alerts).toHaveLength(1);
    expect(mockReconcilePendingProductionExecutions).toHaveBeenCalledTimes(2);
    expect(mockReconcilePendingProductionExecutions).toHaveBeenCalledWith(expect.objectContaining({
      db,
      tenantId: "tenant-1",
      limit: 7,
      tokenResolver: expect.any(Function),
    }));
    expect(mockSignBearerToken).toHaveBeenCalledWith(expect.objectContaining({
      sub: "42",
      userId: 42,
      tenantId: "tenant-2",
      type: "access",
      tokenUse: "production_execution_reconcile",
      scopes: ["media:generate"],
    }), "15m");
  });

  it("does not run duplicate reconciliation ticks while a tick is in flight", async () => {
    const { runProductionExecutionReconciliationJob } = await import("../productionExecutionReconciliationJob");
    selectRowsQueue.push([{ tenantId: "tenant-1" }]);
    let release: (() => void) | null = null;
    mockReconcilePendingProductionExecutions.mockImplementation(() => new Promise((resolve) => {
      release = () => resolve({
        scannedSpaces: 1,
        pendingAttempts: 1,
        reconciledAttempts: 1,
        skippedAttempts: 0,
        alerts: [],
      });
    }));

    const first = runProductionExecutionReconciliationJob();
    await Promise.resolve();
    const second = await runProductionExecutionReconciliationJob();
    expect(release).toBeTypeOf("function");
    release?.();
    const firstSummary = await first;

    expect(second.tenantsScanned).toBe(0);
    expect(firstSummary.tenantsScanned).toBe(1);
  });

  it("skips quietly when ProductionSpace storage is not migrated yet", async () => {
    const { runProductionExecutionReconciliationJob } = await import("../productionExecutionReconciliationJob");
    selectErrorsQueue.push(Object.assign(
      new Error('relation "media_production_spaces" does not exist'),
      { code: "42P01" },
    ));

    const summary = await runProductionExecutionReconciliationJob();

    expect(summary).toEqual({
      tenantsScanned: 0,
      scannedSpaces: 0,
      pendingAttempts: 0,
      reconciledAttempts: 0,
      skippedAttempts: 0,
      alerts: [],
      tenantErrors: [],
    });
    expect(mockReconcilePendingProductionExecutions).not.toHaveBeenCalled();
  });

  it("does not start an in-process interval when Cloud Tasks owns scheduling", async () => {
    vi.useFakeTimers();
    process.env.USE_CLOUD_TASKS = "true";
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { initializeProductionExecutionReconciliationJob, shutdownProductionExecutionReconciliationJob } = await import("../productionExecutionReconciliationJob");

    await initializeProductionExecutionReconciliationJob();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockGetDb).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("In-process interval disabled"));
    shutdownProductionExecutionReconciliationJob();
    consoleSpy.mockRestore();
  });

  it("can force the in-process interval for non-serverless deployments", async () => {
    vi.useFakeTimers();
    process.env.USE_CLOUD_TASKS = "true";
    process.env.FEATURE116_PRODUCTION_RECONCILER_SCHEDULER_MODE = "interval";
    const { initializeProductionExecutionReconciliationJob, shutdownProductionExecutionReconciliationJob } = await import("../productionExecutionReconciliationJob");
    selectRowsQueue.push([]);

    await initializeProductionExecutionReconciliationJob();

    expect(mockGetDb).toHaveBeenCalledTimes(1);
    shutdownProductionExecutionReconciliationJob();
  });
});
