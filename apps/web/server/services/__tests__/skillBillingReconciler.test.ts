import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, getDbMock, refundCreditsMock } = vi.hoisted(() => {
  const dbMock = { select: vi.fn() };
  return {
    dbMock,
    getDbMock: vi.fn(() => dbMock),
    refundCreditsMock: vi.fn().mockResolvedValue({ success: true, duplicate: false }),
  };
});

vi.mock("../../db", () => ({ getDb: getDbMock }));
vi.mock("../creditService", () => ({ refundCredits: refundCreditsMock }));
vi.mock("../../../drizzle/schema", () => ({
    sandboxJobs: {
      id: "id",
      userId: "userId",
      tenantId: "tenantId",
      featureType: "featureType",
    status: "status",
    idempotencyKey: "idempotencyKey",
    updatedAt: "updatedAt",
  },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  isNotNull: vi.fn(),
}));

function selectChain(rows: unknown[]) {
  const chain: Record<string, any> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(rows);
  return chain;
}

describe("skill billing terminal reconciler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDbMock.mockReturnValue(dbMock);
    refundCreditsMock.mockResolvedValue({ success: true, duplicate: false });
  });

  it("refunds terminal failed sandbox skill runs without polling", async () => {
    dbMock.select.mockReturnValue(selectChain([
      { id: "job-1", userId: 11, tenantId: "tenant-1", status: "timed_out", idempotencyKey: "run-1" },
    ]));

    const { reconcileTerminalSkillSandboxJobs } = await import("../skillBillingReconciler");
    await expect(reconcileTerminalSkillSandboxJobs()).resolves.toEqual({
      scanned: 1,
      reversed: 1,
      failed: 0,
    });
    expect(refundCreditsMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 11,
      sourceType: "skill",
      skillRunId: "run-1",
      tenantId: "tenant-1",
      amount: 0,
    }));
  });

  it("isolates one refund failure and continues the batch", async () => {
    dbMock.select.mockReturnValue(selectChain([
      { id: "job-1", userId: 11, tenantId: "tenant-1", status: "failed", idempotencyKey: "run-1" },
      { id: "job-2", userId: 12, tenantId: "tenant-2", status: "canceled", idempotencyKey: "run-2" },
    ]));
    refundCreditsMock
      .mockRejectedValueOnce(new Error("temporary database failure"))
      .mockResolvedValueOnce({ success: true, duplicate: false });

    const { reconcileTerminalSkillSandboxJobs } = await import("../skillBillingReconciler");
    await expect(reconcileTerminalSkillSandboxJobs()).resolves.toEqual({
      scanned: 2,
      reversed: 1,
      failed: 1,
    });
  });
});
