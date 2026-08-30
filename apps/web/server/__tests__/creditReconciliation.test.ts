import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock tokens module to avoid JWT_SECRET env var requirement
vi.mock("../_core/tokens", () => ({
  signBearerToken: vi.fn(() => "mock-token"),
  verifyBearerToken: vi.fn(),
}));

// Mock dependencies before importing
vi.mock("../services/creditService", () => ({
  deductCredits: vi.fn().mockResolvedValue({}),
  refundCredits: vi.fn().mockResolvedValue({}),
  hasEnoughCredits: vi.fn().mockResolvedValue(true),
}));

vi.mock("../services/pricingCalculator", () => ({
  calculateCreditCost: vi.fn(),
}));

vi.mock("../services/redisClients", () => ({
  getCacheClient: vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
  })),
}));

// Mock getDb to avoid real database calls
vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

import { reconcileTaskCredits } from "../routers/media";
import { deductCredits, refundCredits } from "../services/creditService";
import { calculateCreditCost } from "../services/pricingCalculator";
import { getCacheClient } from "../services/redisClients";

const mockDeductCredits = vi.mocked(deductCredits);
const mockRefundCredits = vi.mocked(refundCredits);
const mockCalculateCreditCost = vi.mocked(calculateCreditCost);
const mockGetCacheClient = vi.mocked(getCacheClient);

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-123",
    status: "completed",
    model: "fal-ai/ltx-2.3/text-to-video",
    resultData: {
      actual_duration: 6,
      actual_resolution: "1080p",
      ...((overrides.resultData as Record<string, unknown>) ?? {}),
    },
    parameters: {
      __reserved_credits: 300,
      __reserved_resolution: "1080p",
      __reserved_duration: 5,
      ...((overrides.parameters as Record<string, unknown>) ?? {}),
    },
    ...overrides,
  };
}

describe("reconcileTaskCredits", () => {
  let mockRedis: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
    };
    mockGetCacheClient.mockReturnValue(mockRedis as any);
    // Default: model uses matrix pricing
    mockCalculateCreditCost.mockReturnValue(300);
  });

  // --- Reconciliation logic ---

  it("refunds when actual cost < reserved", async () => {
    mockCalculateCreditCost.mockReturnValue(200); // actual cost lower
    const result = await reconcileTaskCredits({ task: makeTask() as any, userId: 1 });
    expect(result.action).toBe("refund");
    expect(result.difference).toBe(-100);
    expect(result.adjusted).toBe(true);
    expect(mockRefundCredits).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 100, userId: 1 }),
    );
  });

  it("reverses a failed fixed-credit skill settlement in its tenant", async () => {
    const result = await reconcileTaskCredits({
      task: makeTask({
        status: "failed",
        parameters: {
          skill_billing_run_id: "skill-run-1",
          transportMetadata: { tenantId: "tenant-1" },
        },
      }) as any,
      userId: 1,
    });

    expect(result).toMatchObject({ adjusted: true, action: "refund", difference: 0 });
    expect(mockRefundCredits).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: "skill",
      skillRunId: "skill-run-1",
      tenantId: "tenant-1",
    }));
  });

  it("charges when actual cost > reserved", async () => {
    mockCalculateCreditCost.mockReturnValue(400); // actual cost higher
    const result = await reconcileTaskCredits({ task: makeTask() as any, userId: 1 });
    expect(result.action).toBe("charge");
    expect(result.difference).toBe(100);
    expect(result.adjusted).toBe(true);
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 100, userId: 1 }),
    );
  });

  it("no-op when actual cost equals reserved", async () => {
    mockCalculateCreditCost.mockReturnValue(300);
    const result = await reconcileTaskCredits({ task: makeTask() as any, userId: 1 });
    expect(result.action).toBe("none");
    expect(result.adjusted).toBe(false);
    expect(mockRefundCredits).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("refunds full reservation when async task failed after submission", async () => {
    const result = await reconcileTaskCredits({
      task: makeTask({
        status: "failed",
        errorMessage: "Kie.ai task submission failed: Ratio error",
        resultData: undefined,
      }) as any,
      userId: 1,
    });

    expect(result.action).toBe("refund");
    expect(result.difference).toBe(-300);
    expect(result.adjusted).toBe(true);
    expect(mockRefundCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 300,
        userId: 1,
        metadata: expect.objectContaining({
          type: "failed_task_refund",
          error: "Kie.ai task submission failed: Ratio error",
        }),
      }),
    );
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("refunds a failed cover reservation using the image source type", async () => {
    const result = await reconcileTaskCredits({
      task: makeTask({
        status: "failed",
        resultData: undefined,
        parameters: {
          __reserved_credits: 12,
          __credit_source_type: "media_image",
          __vd_purpose: "episode_cover",
        },
      }) as any,
      userId: 1,
      tenantId: "tenant-1",
    });

    expect(result).toMatchObject({ action: "refund", difference: -12 });
    expect(mockRefundCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 12,
        sourceType: "media_image",
        tenantId: "tenant-1",
      }),
    );
  });

  it("refunds a failed Python media task whose reservation is in extra_params", async () => {
    const result = await reconcileTaskCredits({
      task: makeTask({
        status: "failed",
        resultData: undefined,
        parameters: {
          extra_params: {
            __reserved_credits: 70,
            __credit_source_type: "media_image",
            __origin_surface: "vertical_drama_start_frame",
          },
        },
      }) as any,
      userId: 1,
      tenantId: "tenant-1",
    });

    expect(result).toMatchObject({ action: "refund", difference: -70 });
    expect(mockRefundCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 70,
        sourceType: "media_image",
        tenantId: "tenant-1",
        metadata: expect.objectContaining({
          type: "failed_task_refund",
          originSurface: "vertical_drama_start_frame",
        }),
      }),
    );
  });

  it("refunds a cancelled or expired async cover reservation", async () => {
    for (const status of ["cancelled", "expired"] as const) {
      mockRedis.get.mockResolvedValue(null);
      const result = await reconcileTaskCredits({
        task: makeTask({
          id: `task-${status}`,
          status,
          resultData: undefined,
          parameters: {
            __reserved_credits: 12,
            __credit_source_type: "media_image",
          },
        }) as any,
        userId: 1,
      });

      expect(result.action).toBe("refund");
    }
    expect(mockRefundCredits).toHaveBeenCalledTimes(2);
  });

  it("skips when actual_duration missing", async () => {
    const task = makeTask({ resultData: {} });
    const result = await reconcileTaskCredits({ task: task as any, userId: 1 });
    expect(result.action).toBe("none");
    expect(result.adjusted).toBe(false);
  });

  it("skips when resultData missing", async () => {
    const task = makeTask({ resultData: undefined });
    const result = await reconcileTaskCredits({ task: task as any, userId: 1 });
    expect(result.action).toBe("none");
  });

  it("skips when already reconciled (idempotency)", async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ action: "refund" }));
    const result = await reconcileTaskCredits({ task: makeTask() as any, userId: 1 });
    expect(result.action).toBe("none");
    expect(mockRefundCredits).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  // --- Cost calculation ---

  it("uses actual_resolution from resultData", async () => {
    mockCalculateCreditCost.mockReturnValue(200);
    const task = makeTask({ resultData: { actual_duration: 6, actual_resolution: "1440p" } });
    await reconcileTaskCredits({ task: task as any, userId: 1 });
    expect(mockCalculateCreditCost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ resolution: "1440p", duration: 6 }),
    );
  });

  it("falls back to reserved resolution when actual_resolution missing", async () => {
    mockCalculateCreditCost.mockReturnValue(200);
    const task = makeTask({
      resultData: { actual_duration: 6 },
      parameters: { __reserved_credits: 300, __reserved_resolution: "1080p" },
    });
    await reconcileTaskCredits({ task: task as any, userId: 1 });
    expect(mockCalculateCreditCost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ resolution: "1080p" }),
    );
  });

  // --- Edge cases ---

  it("skips non-completed tasks", async () => {
    const task = makeTask({ status: "processing" });
    const result = await reconcileTaskCredits({ task: task as any, userId: 1 });
    expect(result.action).toBe("none");
  });

  it("catches refundCredits failure without throwing", async () => {
    mockCalculateCreditCost.mockReturnValue(200);
    mockRefundCredits.mockRejectedValue(new Error("DB error"));
    const result = await reconcileTaskCredits({ task: makeTask() as any, userId: 1 });
    // Should not throw, returns noOp on error
    expect(result.action).toBe("none");
  });

  it("catches deductCredits failure without throwing", async () => {
    mockCalculateCreditCost.mockReturnValue(400);
    mockDeductCredits.mockRejectedValue(new Error("Insufficient"));
    const result = await reconcileTaskCredits({ task: makeTask() as any, userId: 1 });
    expect(result.action).toBe("none");
  });

  it("skips when reserved_credits not present", async () => {
    const task = makeTask({ parameters: {} });
    const result = await reconcileTaskCredits({ task: task as any, userId: 1 });
    expect(result.action).toBe("none");
  });
});
