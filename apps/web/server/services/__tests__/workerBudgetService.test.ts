import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetDb = vi.fn();
const mockReadDelegatedWorkerSpendBudgetPolicy = vi.fn();
const mockAuditLog = vi.fn();

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../delegatedWorkerPlatformService", () => ({
  readDelegatedWorkerSpendBudgetPolicy: mockReadDelegatedWorkerSpendBudgetPolicy,
}));

vi.mock("../auditLogger", () => ({
  auditLogger: {
    log: mockAuditLog,
  },
}));

function createDb(worker: Record<string, any> | null, usageTotal = 0) {
  let currentWorker = worker;
  const updateWhere = vi.fn(async () => undefined);
  const updateSet = vi.fn((patch: Record<string, unknown>) => {
    if (currentWorker) {
      currentWorker = { ...currentWorker, ...patch };
    }
    return { where: updateWhere };
  });
  const update = vi.fn(() => ({ set: updateSet }));
  const select = vi.fn((fields?: unknown) => {
    if (fields) {
      return {
        from: vi.fn(() => ({
          where: vi.fn(async () => [{ total: usageTotal }]),
        })),
      };
    }
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => (currentWorker ? [currentWorker] : [])),
        })),
      })),
    };
  });

  return {
    db: { select, update },
    update,
    updateSet,
    updateWhere,
    getCurrentWorker: () => currentWorker,
  };
}

describe("workerBudgetService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("summarizes worker budget windows for the owner and marks blocked caps", async () => {
    const worker = {
      id: "worker-1",
      tenantId: "tenant-1",
      displayName: "Owner Worker",
      runtimeType: "openclaw_gateway",
      registeredByUserId: 42,
      capabilitiesJson: {},
    };
    const dbHarness = createDb(worker, 7);
    mockGetDb.mockResolvedValue(dbHarness.db as any);
    mockReadDelegatedWorkerSpendBudgetPolicy.mockReturnValue({
      hourlyCredits: 5,
      fiveHourCredits: 20,
      dailyCredits: null,
      weeklyCredits: null,
      monthlyCredits: null,
    });

    const { getWorkerBudgetSettings } = await import("../workerBudgetService");
    const result = await getWorkerBudgetSettings({
      tenantId: "tenant-1",
      workerId: "worker-1",
      ownerUserId: 42,
    });

    expect(result.workerId).toBe("worker-1");
    expect(result.ownerUserId).toBe(42);
    expect(result.blockedByBudget).toBe(true);
    expect(result.windows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "hourly",
        capCredits: 5,
        usedCredits: 7,
        remainingCredits: 0,
        blocked: true,
      }),
      expect.objectContaining({
        label: "five_hour",
        capCredits: 20,
        usedCredits: 7,
        remainingCredits: 13,
        blocked: false,
      }),
    ]));
  });

  it("rejects budget access for a non-owner", async () => {
    const worker = {
      id: "worker-1",
      tenantId: "tenant-1",
      displayName: "Owner Worker",
      runtimeType: "openclaw_gateway",
      registeredByUserId: 99,
      capabilitiesJson: {},
    };
    const dbHarness = createDb(worker, 0);
    mockGetDb.mockResolvedValue(dbHarness.db as any);

    const { getWorkerBudgetSettings } = await import("../workerBudgetService");

    await expect(getWorkerBudgetSettings({
      tenantId: "tenant-1",
      workerId: "worker-1",
      ownerUserId: 42,
    })).rejects.toThrow("your own personal workers");
  });

  it("updates worker budget caps and records an audit event", async () => {
    const worker = {
      id: "worker-1",
      tenantId: "tenant-1",
      displayName: "Owner Worker",
      runtimeType: "openclaw_gateway",
      registeredByUserId: 42,
      capabilitiesJson: {
        healthy: true,
      },
    };
    const dbHarness = createDb(worker, 3);
    mockGetDb.mockResolvedValue(dbHarness.db as any);
    mockReadDelegatedWorkerSpendBudgetPolicy.mockReturnValue({
      hourlyCredits: 12,
      fiveHourCredits: null,
      dailyCredits: 100,
      weeklyCredits: null,
      monthlyCredits: null,
    });

    const { updateWorkerBudgetSettings } = await import("../workerBudgetService");
    const result = await updateWorkerBudgetSettings({
      tenantId: "tenant-1",
      workerId: "worker-1",
      actorUserId: 42,
      ownerUserId: 42,
      budgets: {
        hourlyCredits: 12,
        fiveHourCredits: 0,
        dailyCredits: 100,
        weeklyCredits: null,
        monthlyCredits: "",
      } as any,
    });

    expect(dbHarness.update).toHaveBeenCalled();
    expect(dbHarness.updateSet).toHaveBeenCalledWith(expect.objectContaining({
      capabilitiesJson: {
        healthy: true,
        delegatedSpendCaps: {
          hourlyCredits: 12,
          fiveHourCredits: null,
          dailyCredits: 100,
          weeklyCredits: null,
          monthlyCredits: null,
        },
      },
    }));
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "worker_budget_updated",
      userId: 42,
      metadata: expect.objectContaining({
        tenantId: "tenant-1",
        workerId: "worker-1",
      }),
    }));
    expect(result.budgets.hourlyCredits).toBe(12);
    expect(result.budgets.dailyCredits).toBe(100);
  });
});
