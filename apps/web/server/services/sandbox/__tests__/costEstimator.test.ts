import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockHasEnoughCredits, mockDeductCredits, mockRefundCredits } =
  vi.hoisted(() => ({
    mockHasEnoughCredits: vi.fn(),
    mockDeductCredits: vi.fn(),
    mockRefundCredits: vi.fn(),
  }));

vi.mock("../../creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
  deductCredits: mockDeductCredits,
  refundCredits: mockRefundCredits,
}));

import {
  estimateCost,
  reserveCredits,
  reconcileCredits,
  refundReservedCredits,
} from "../costEstimator";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("estimateCost", () => {
  it("estimates cost from profile defaults", () => {
    const cost = estimateCost({
      cpuLimit: "1000m",
      memoryLimitMb: 2048,
      timeoutSeconds: 300,
    });
    expect(typeof cost).toBe("number");
    expect(cost).toBeGreaterThan(0);
  });

  it("returns higher cost for more resources", () => {
    const low = estimateCost({
      cpuLimit: "1000m",
      memoryLimitMb: 2048,
      timeoutSeconds: 300,
    });
    const high = estimateCost({
      cpuLimit: "2000m",
      memoryLimitMb: 4096,
      timeoutSeconds: 1800,
    });
    expect(high).toBeGreaterThan(low);
  });
});

describe("reserveCredits", () => {
  it("pre-checks hasEnoughCredits before deduction", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue({ id: 1 });

    await reserveCredits({
      userId: 42,
      estimatedCost: 10,
      jobId: "job-123",
      tenantId: "tenant-1",
    });

    expect(mockHasEnoughCredits).toHaveBeenCalledWith(42, 10);
    expect(mockDeductCredits).toHaveBeenCalled();
  });

  it("throws when user has insufficient credits", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(
      reserveCredits({
        userId: 42,
        estimatedCost: 10,
        jobId: "job-123",
        tenantId: "tenant-1",
      }),
    ).rejects.toThrow("Insufficient credits");
  });
});

describe("reconcileCredits", () => {
  it("refunds overage when actual cost is lower", async () => {
    mockRefundCredits.mockResolvedValue({ id: 2 });

    await reconcileCredits({
      userId: 42,
      jobId: "job-123",
      estimatedCost: 15,
      actualCost: 10,
    });

    expect(mockRefundCredits).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42, amount: 5 }),
    );
  });

  it("deducts additional when actual cost is higher", async () => {
    mockDeductCredits.mockResolvedValue({ id: 3 });

    await reconcileCredits({
      userId: 42,
      jobId: "job-123",
      estimatedCost: 10,
      actualCost: 15,
    });

    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42, amount: 5 }),
    );
  });

  it("does nothing when estimated equals actual", async () => {
    await reconcileCredits({
      userId: 42,
      jobId: "job-123",
      estimatedCost: 10,
      actualCost: 10,
    });

    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(mockRefundCredits).not.toHaveBeenCalled();
  });
});

describe("refundReservedCredits", () => {
  it("refunds full amount on failure", async () => {
    mockRefundCredits.mockResolvedValue({ id: 4 });

    await refundReservedCredits({
      userId: 42,
      jobId: "job-123",
      reservedAmount: 10,
    });

    expect(mockRefundCredits).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42, amount: 10 }),
    );
  });
});
