import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────

// Mock traceContext
vi.mock("../traceContext", () => ({
  getTraceId: vi.fn(() => "trace-001"),
}));

// Mock auditLogger
vi.mock("../auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

// Track mock DB operations
const mockInsertValues = vi.fn().mockReturnThis();
const mockInsertReturning = vi.fn().mockResolvedValue([{ id: 100 }]);
const mockInsert = vi.fn().mockReturnValue({
  values: mockInsertValues,
  returning: mockInsertReturning,
});
// Make values() return object with returning()
mockInsertValues.mockReturnValue({ returning: mockInsertReturning });

const mockUpdateSet = vi.fn().mockReturnThis();
const mockUpdateWhere = vi.fn().mockReturnThis();
const mockUpdateReturning = vi.fn();
const mockUpdate = vi.fn().mockReturnValue({
  set: mockUpdateSet,
});
mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });

const mockSelectFrom = vi.fn().mockReturnThis();
const mockSelectWhere = vi.fn().mockReturnThis();
const mockSelectLimit = vi.fn().mockReturnThis();
const mockSelectOrderBy = vi.fn().mockReturnThis();
const mockSelectOffset = vi.fn().mockReturnThis();
const mockSelectGroupBy = vi.fn().mockReturnThis();
const mockSelect = vi.fn().mockReturnValue({
  from: mockSelectFrom,
});
mockSelectFrom.mockReturnValue({
  where: mockSelectWhere,
  orderBy: mockSelectOrderBy,
  limit: mockSelectLimit,
});
mockSelectWhere.mockReturnValue({
  orderBy: mockSelectOrderBy,
  limit: mockSelectLimit,
  groupBy: mockSelectGroupBy,
});
mockSelectOrderBy.mockReturnValue({
  limit: mockSelectLimit,
  offset: mockSelectOffset,
});
mockSelectLimit.mockReturnValue({
  offset: mockSelectOffset,
});
mockSelectGroupBy.mockReturnValue({
  orderBy: mockSelectOrderBy,
});

const mockTx = {
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 200 }]),
    }),
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ newBalance: 900 }]),
      }),
    }),
  }),
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{ credits: 500 }]),
      }),
    }),
  }),
};

const mockTransaction = vi.fn(async (cb: (tx: typeof mockTx) => Promise<void>) => {
  await cb(mockTx);
});

vi.mock("../../db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

// Mock drizzle schema (minimal — just need exports to exist)
vi.mock("../../../drizzle/schema", () => ({
  users: { id: "users.id", credits: "users.credits" },
  creditTransactions: { id: "creditTransactions.id" },
  creatorSettlements: {
    idempotencyKey: "creatorSettlements.idempotencyKey",
    creatorId: "creatorSettlements.creatorId",
    entityType: "creatorSettlements.entityType",
    entityId: "creatorSettlements.entityId",
    createdAt: "creatorSettlements.createdAt",
    tenantId: "creatorSettlements.tenantId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ type: "eq", a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
  gte: vi.fn((a, b) => ({ type: "gte", a, b })),
  desc: vi.fn((a) => ({ type: "desc", a })),
  sql: Object.assign(vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: "sql",
    strings,
    values,
  })), { raw: vi.fn((s: string) => s) }),
}));

import {
  settleCreatorFee,
  type SettleCreatorFeeParams,
  type SettlementResult,
} from "../creatorRevenueService";
import { auditLogger } from "../auditLogger";

// ── Helpers ──────────────────────────────────────────────────────────

function makeParams(overrides?: Partial<SettleCreatorFeeParams>): SettleCreatorFeeParams {
  return {
    runId: "run-001",
    entityType: "agency",
    entityId: "agency-001",
    runnerId: 10,
    creatorId: 20,
    tenantId: "tenant-001",
    totalFee: 100,
    platformSharePct: 20,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("creatorRevenueService", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: no existing settlement (idempotency check returns empty)
    mockSelectLimit.mockResolvedValue([]);

    // Default: runner has sufficient balance
    // First select = idempotency check (empty), second select = runner balance
    let selectCallCount = 0;
    mockSelectLimit.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return Promise.resolve([]); // idempotency
      if (selectCallCount === 2) return Promise.resolve([{ credits: 500 }]); // runner balance
      return Promise.resolve([]);
    });

    // Default: transaction update succeeds
    const txUpdateReturning = vi.fn().mockResolvedValue([{ newBalance: 400 }]);
    const txUpdateWhere = vi.fn().mockReturnValue({ returning: txUpdateReturning });
    const txUpdateSet = vi.fn().mockReturnValue({ where: txUpdateWhere });
    mockTx.update.mockReturnValue({ set: txUpdateSet });

    // Default: transaction insert succeeds
    const txInsertReturning = vi.fn().mockResolvedValue([{ id: 200 }]);
    const txInsertValues = vi.fn().mockReturnValue({ returning: txInsertReturning });
    mockTx.insert.mockReturnValue({ values: txInsertValues });
  });

  describe("settleCreatorFee", () => {
    it("skips when totalFee is 0", async () => {
      const result = await settleCreatorFee(makeParams({ totalFee: 0 }));

      expect(result.status).toBe("skipped");
      expect(result.actualCharged).toBe(0);
      expect(result.creatorShare).toBe(0);
      expect(result.platformShare).toBe(0);
      expect(result.debitTransactionId).toBeNull();
      expect(result.creditTransactionId).toBeNull();
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("skips when totalFee is negative", async () => {
      const result = await settleCreatorFee(makeParams({ totalFee: -5 }));

      expect(result.status).toBe("skipped");
      expect(result.actualCharged).toBe(0);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("skips when runner === creator (self-run)", async () => {
      const result = await settleCreatorFee(
        makeParams({ runnerId: 42, creatorId: 42 }),
      );

      expect(result.status).toBe("skipped");
      expect(result.actualCharged).toBe(0);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("returns existing settlement on duplicate runId (idempotency)", async () => {
      const existingSettlement = {
        status: "completed",
        actualCharged: 100,
        creatorShare: 80,
        platformShare: 20,
        debitTransactionId: 50,
        creditTransactionId: 51,
      };

      // Idempotency check returns existing record
      mockSelectLimit.mockResolvedValueOnce([existingSettlement]);

      const result = await settleCreatorFee(makeParams());

      expect(result.status).toBe("completed");
      expect(result.actualCharged).toBe(100);
      expect(result.creatorShare).toBe(80);
      expect(result.platformShare).toBe(20);
      expect(result.debitTransactionId).toBe(50);
      expect(result.creditTransactionId).toBe(51);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("skips when runner balance is 0", async () => {
      // Idempotency check: no existing
      // Runner balance: 0
      let callCount = 0;
      mockSelectLimit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([]); // idempotency
        if (callCount === 2) return Promise.resolve([{ credits: 0 }]); // runner balance
        return Promise.resolve([]);
      });

      const result = await settleCreatorFee(makeParams());

      expect(result.status).toBe("skipped");
      expect(result.actualCharged).toBe(0);
      // Should have inserted a skipped settlement record
      expect(mockInsert).toHaveBeenCalled();
    });

    it("skips when runner not found", async () => {
      let callCount = 0;
      mockSelectLimit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([]); // idempotency
        if (callCount === 2) return Promise.resolve([]); // no runner
        return Promise.resolve([]);
      });

      const result = await settleCreatorFee(makeParams());

      expect(result.status).toBe("skipped");
      expect(result.actualCharged).toBe(0);
    });

    it("performs full settlement with 80/20 split", async () => {
      let callCount = 0;
      mockSelectLimit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([]); // idempotency
        if (callCount === 2) return Promise.resolve([{ credits: 500 }]); // runner
        return Promise.resolve([]);
      });

      const result = await settleCreatorFee(makeParams({ totalFee: 100, platformSharePct: 20 }));

      expect(result.status).toBe("completed");
      expect(result.actualCharged).toBe(100);
      expect(result.creatorShare).toBe(80); // 100 * 80%
      expect(result.platformShare).toBe(20); // 100 * 20%

      // Transaction should have been called
      expect(mockTransaction).toHaveBeenCalledTimes(1);

      // Audit logger should have been called
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "creator_fee_settled",
          userId: 10,
          metadata: expect.objectContaining({
            runId: "run-001",
            entityType: "agency",
            creatorId: 20,
            totalFee: 100,
            actualCharged: 100,
            creatorShare: 80,
            platformShare: 20,
            status: "completed",
          }),
        }),
      );
    });

    it("performs partial charge when runner balance < fee", async () => {
      let callCount = 0;
      mockSelectLimit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([]); // idempotency
        if (callCount === 2) return Promise.resolve([{ credits: 30 }]); // runner has 30
        return Promise.resolve([]);
      });

      const result = await settleCreatorFee(makeParams({ totalFee: 100, platformSharePct: 20 }));

      expect(result.status).toBe("partial");
      expect(result.actualCharged).toBe(30); // capped at runner balance
      expect(result.creatorShare).toBe(24); // floor(30 * 80%) = 24
      expect(result.platformShare).toBe(6); // 30 - 24 = 6
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it("calculates correct split for different percentages", async () => {
      let callCount = 0;
      mockSelectLimit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([]);
        if (callCount === 2) return Promise.resolve([{ credits: 1000 }]);
        return Promise.resolve([]);
      });

      // 70/30 split
      const result = await settleCreatorFee(makeParams({ totalFee: 100, platformSharePct: 30 }));

      expect(result.creatorShare).toBe(70); // 100 * 70%
      expect(result.platformShare).toBe(30); // 100 * 30%
      expect(result.creatorShare + result.platformShare).toBe(result.actualCharged);
    });

    it("handles rounding correctly (creatorShare + platformShare === actualCharged)", async () => {
      let callCount = 0;
      mockSelectLimit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([]);
        if (callCount === 2) return Promise.resolve([{ credits: 1000 }]);
        return Promise.resolve([]);
      });

      // 33% platform → 67% creator. 77 * 0.67 = 51.59 → floor = 51
      const result = await settleCreatorFee(makeParams({ totalFee: 77, platformSharePct: 33 }));

      expect(result.creatorShare).toBe(Math.floor(77 * 67 / 100)); // 51
      expect(result.platformShare).toBe(77 - result.creatorShare); // 26
      expect(result.creatorShare + result.platformShare).toBe(77);
    });

    it("handles 0% platform share (creator gets everything)", async () => {
      let callCount = 0;
      mockSelectLimit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([]);
        if (callCount === 2) return Promise.resolve([{ credits: 1000 }]);
        return Promise.resolve([]);
      });

      const result = await settleCreatorFee(makeParams({ totalFee: 50, platformSharePct: 0 }));

      expect(result.creatorShare).toBe(50);
      expect(result.platformShare).toBe(0);
    });

    it("handles 100% platform share (creator gets nothing)", async () => {
      let callCount = 0;
      mockSelectLimit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([]);
        if (callCount === 2) return Promise.resolve([{ credits: 1000 }]);
        return Promise.resolve([]);
      });

      const result = await settleCreatorFee(makeParams({ totalFee: 50, platformSharePct: 100 }));

      expect(result.creatorShare).toBe(0);
      expect(result.platformShare).toBe(50);
    });

    it("uses correct entityType for different entity types", async () => {
      let callCount = 0;
      mockSelectLimit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([]);
        if (callCount === 2) return Promise.resolve([{ credits: 500 }]);
        return Promise.resolve([]);
      });

      await settleCreatorFee(makeParams({ entityType: "workflow" }));

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            entityType: "workflow",
          }),
        }),
      );
    });
  });
});

// ── Pure math validation (no mocks needed) ──────────────────────────

describe("settlement math", () => {
  it.each([
    // [totalFee, runnerBalance, platformPct, expectedActual, expectedCreator, expectedPlatform]
    [100, 500, 20, 100, 80, 20],
    [100, 30, 20, 30, 24, 6],
    [50, 50, 20, 50, 40, 10],
    [1, 1000, 20, 1, 0, 1], // floor(1 * 0.8) = 0
    [200, 150, 25, 150, 112, 38],
    [1000, 1000, 0, 1000, 1000, 0],
    [1000, 1000, 100, 1000, 0, 1000],
    [77, 1000, 33, 77, 51, 26],
  ])(
    "fee=%d, balance=%d, platform=%d%% → charged=%d, creator=%d, platform=%d",
    (totalFee, runnerBalance, platformSharePct, expectedActual, expectedCreator, expectedPlatform) => {
      const actualCharged = Math.min(totalFee, runnerBalance);
      const creatorShare = Math.floor((actualCharged * (100 - platformSharePct)) / 100);
      const platformShare = actualCharged - creatorShare;

      expect(actualCharged).toBe(expectedActual);
      expect(creatorShare).toBe(expectedCreator);
      expect(platformShare).toBe(expectedPlatform);
      expect(creatorShare + platformShare).toBe(actualCharged);
    },
  );
});
