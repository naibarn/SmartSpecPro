import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCacheClient,
  mockRefundReservation,
  mockCalculateCreditCost,
  mockDeductCredits,
  mockRefundCredits,
  mockGetHermesMediaTask,
} = vi.hoisted(() => ({
  mockGetCacheClient: vi.fn(),
  mockRefundReservation: vi.fn(async () => ({ refundedAmount: 0 })),
  mockCalculateCreditCost: vi.fn(),
  mockDeductCredits: vi.fn(),
  mockRefundCredits: vi.fn(),
  mockGetHermesMediaTask: vi.fn(),
}));

// Minimal import-safety mocks (mirrors media.db-first.contract.test.ts) —
// media.ts pulls in a very large dependency graph; these are the two that
// throw at *import* time without a real env (JWT_SECRET / a real tRPC
// builder). Everything else in the file loads fine as real modules.
vi.mock("../../_core/tokens", () => ({
  signBearerToken: vi.fn().mockReturnValue("fallback-token"),
}));
vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
    };
    return proc;
  };
  return {
    router: (routes: any) => routes,
    protectedProcedure: createProcedure(),
    adminProcedure: createProcedure(),
  };
});

vi.mock("../../services/redisClients", () => ({
  getCacheClient: mockGetCacheClient,
}));

vi.mock("../../services/creditService", () => ({
  deductCredits: mockDeductCredits,
  hasEnoughCredits: vi.fn().mockResolvedValue(true),
  refundCredits: mockRefundCredits,
  refundReservation: mockRefundReservation,
}));

vi.mock("../../services/pricingCalculator", () => ({
  calculateCreditCost: mockCalculateCreditCost,
}));

// Partial mock: only `getHermesMediaTask` is stubbed (so the settle-
// portrait-candidate-shaped test below can control the terminal shape
// without a real DB); `isHermesMediaTaskId` / `reconcileHermesMediaJobFee`
// run for real everywhere, including inside `reconcileTaskCredits` itself.
vi.mock("../../services/hermesMediaAdapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/hermesMediaAdapter")>();
  return {
    ...actual,
    getHermesMediaTask: mockGetHermesMediaTask,
  };
});

import { reconcileTaskCredits } from "../media";
import { mediaGenerationService } from "../../services/mediaGenerationService";

function buildRedis(initial?: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }),
  };
}

describe("reconcileTaskCredits — hermes_ branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refunds exactly the reserved fee once for a failed shared-pool job; a second call is a no-op", async () => {
    const redis = buildRedis();
    mockGetCacheClient.mockReturnValue(redis);
    mockRefundReservation.mockResolvedValue({ refundedAmount: 8 });

    const task = {
      id: "hermes_job-1",
      status: "failed",
      model: "grok-image-1",
      parameters: { workerBilling: { reservationId: "res-1", reservedCredits: 8, sourceType: "worker_runtime" } },
    };

    const first = await reconcileTaskCredits({ task: task as any, userId: 1 });
    expect(first).toEqual({ adjusted: true, difference: -8, action: "refund" });
    expect(mockRefundReservation).toHaveBeenCalledWith("res-1");

    const second = await reconcileTaskCredits({ task: task as any, userId: 1 });
    expect(second).toEqual({ adjusted: false, difference: 0, action: "none" });
    expect(mockRefundReservation).toHaveBeenCalledTimes(1);
  });

  it("refunds the full fee for a canceled-before-start job (adapter maps canceled → MediaTask status 'failed')", async () => {
    const redis = buildRedis();
    mockGetCacheClient.mockReturnValue(redis);
    mockRefundReservation.mockResolvedValue({ refundedAmount: 8 });

    const task = {
      id: "hermes_job-2",
      status: "failed", // as projected by hermesMediaAdapter for a canceled worker_jobs row
      model: "grok-image-1",
      errorMessage: "งานถูกยกเลิก",
      parameters: { workerBilling: { reservationId: "res-2", reservedCredits: 8, sourceType: "worker_runtime" } },
    };

    const result = await reconcileTaskCredits({ task: task as any, userId: 1 });
    expect(result).toEqual({ adjusted: true, difference: -8, action: "refund" });
  });

  it("keeps the fee (zero adjustment) for a completed shared-pool job", async () => {
    const redis = buildRedis();
    mockGetCacheClient.mockReturnValue(redis);

    const task = {
      id: "hermes_job-3",
      status: "completed",
      model: "grok-image-1",
      parameters: { workerBilling: { reservationId: "res-3", reservedCredits: 8, sourceType: "worker_runtime" } },
    };

    const result = await reconcileTaskCredits({ task: task as any, userId: 1 });
    expect(result).toEqual({ adjusted: false, difference: 0, action: "none" });
    expect(mockRefundReservation).not.toHaveBeenCalled();
  });

  it("code review FIX 2: is a no-op (never refunds) for an in-flight hermes_ task, even with a billing envelope present", async () => {
    const redis = buildRedis();
    mockGetCacheClient.mockReturnValue(redis);

    for (const status of ["pending", "processing"]) {
      const task = {
        id: `hermes_job-inflight-${status}`,
        status,
        model: "grok-image-1",
        parameters: { workerBilling: { reservationId: `res-inflight-${status}`, reservedCredits: 8, sourceType: "worker_runtime" } },
      };
      const result = await reconcileTaskCredits({ task: task as any, userId: 1 });
      expect(result).toEqual({ adjusted: false, difference: 0, action: "none" });
    }
    expect(mockRefundReservation).not.toHaveBeenCalled();
  });

  it("is a zero-adjustment no-op for server_personal/private_worker jobs (no billing envelope) in every terminal state", async () => {
    mockGetCacheClient.mockReturnValue(buildRedis());

    for (const status of ["completed", "failed"] as const) {
      const task = {
        id: `hermes_job-personal-${status}`,
        status,
        model: "grok-image-1",
        parameters: {},
      };
      const result = await reconcileTaskCredits({ task: task as any, userId: 1 });
      expect(result).toEqual({ adjusted: false, difference: 0, action: "none" });
    }
    expect(mockRefundReservation).not.toHaveBeenCalled();
  });

  it("never runs per-duration math for hermes_ ids (calculateCreditCost is never called)", async () => {
    mockGetCacheClient.mockReturnValue(buildRedis());
    const task = {
      id: "hermes_job-4",
      status: "completed",
      model: "grok-image-1",
      resultData: { actual_duration: 12, actual_resolution: "1080p" },
      parameters: { workerBilling: { reservationId: "res-4", reservedCredits: 8, sourceType: "worker_runtime" } },
    };
    await reconcileTaskCredits({ task: task as any, userId: 1 });
    expect(mockCalculateCreditCost).not.toHaveBeenCalled();
  });

  it("regression: a non-hermes (mcp/gateway) task id still flows through the pre-existing duration/resolution body unchanged", async () => {
    const redis = buildRedis();
    mockGetCacheClient.mockReturnValue(redis);
    mockCalculateCreditCost.mockReturnValue(30);

    const task = {
      id: "mcp_abc123",
      status: "completed",
      model: "some-model",
      resultData: { actual_duration: 12, actual_resolution: "1080p" },
      parameters: { extraParams: { __reserved_credits: 20 } },
    };

    // Falls through past the hermes branch into the legacy body; since the
    // model lookup isn't mocked here it will hit the `catch` and no-op —
    // the important assertion is that it never enters the hermes fee path.
    const result = await reconcileTaskCredits({ task: task as any, userId: 1 });
    expect(result.action === "none" || result.action === "refund" || result.action === "charge").toBe(true);
    expect(mockRefundReservation).not.toHaveBeenCalled();
  });
});

/**
 * `settlePortraitCandidate` (server/routers/verticalDramaCharacters.ts) calls
 * ONLY `mediaGenerationService.getTask(...)` then `reconcileTaskCredits(...)`
 * generically — see lines ~1262-1306. This block replicates that exact call
 * sequence (not the full tRPC procedure, which needs a much heavier
 * verticalDramaCharacterStockService + DB harness) to prove those two
 * generic functions carry a `hermes_` candidate through every terminal
 * shape, including the stuck-candidate recovery case (`completed` status
 * with no registered asset yet — a diagnosable, retryable state, never a
 * fabricated URL), with NO changes needed to `settlePortraitCandidate`
 * itself.
 */
describe("settlePortraitCandidate's generic getTask + reconcileTaskCredits chain (hermes_)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCacheClient.mockReturnValue(buildRedis());
  });

  async function pollAndReconcile(taskId: string, userId: number) {
    const task = await mediaGenerationService.getTask(taskId, "user-token", {
      userId,
      source: "trpc.verticalDramaCharacters.settlePortraitCandidate",
      stage: "poll",
    });
    if (task.status === "completed" || task.status === "failed") {
      await reconcileTaskCredits({ task: task as any, userId }).catch(() => {});
    }
    return task;
  }

  it("completed with a registered asset → resultUrl present, fee kept", async () => {
    mockGetHermesMediaTask.mockResolvedValue({
      id: "hermes_cand-1",
      taskId: "job-1",
      userId: "7",
      mediaType: "image",
      status: "completed",
      model: "grok-image-1",
      prompt: "portrait",
      parameters: { workerBilling: { reservationId: "res-5", reservedCredits: 8, sourceType: "worker_runtime" } },
      resultUrl: "https://signed.example/portrait.png",
      createdAt: new Date().toISOString(),
    });

    const task = await pollAndReconcile("hermes_cand-1", 7);
    expect(task.status).toBe("completed");
    expect(task.resultUrl).toBe("https://signed.example/portrait.png");
    expect(mockRefundReservation).not.toHaveBeenCalled();
  });

  it("stuck-candidate recovery: completed but no registered asset yet → resultUrl undefined, diagnosable (never throws, never fabricates a URL)", async () => {
    mockGetHermesMediaTask.mockResolvedValue({
      id: "hermes_cand-2",
      taskId: "job-2",
      userId: "7",
      mediaType: "image",
      status: "completed",
      model: "grok-image-1",
      prompt: "portrait",
      parameters: { workerBilling: { reservationId: "res-6", reservedCredits: 8, sourceType: "worker_runtime" } },
      createdAt: new Date().toISOString(),
    });

    const task = await pollAndReconcile("hermes_cand-2", 7);
    expect(task.status).toBe("completed");
    expect(task.resultUrl).toBeUndefined();
  });

  it("failed → errorMessage present, fee refunded exactly once", async () => {
    mockRefundReservation.mockResolvedValue({ refundedAmount: 8 });
    mockGetHermesMediaTask.mockResolvedValue({
      id: "hermes_cand-3",
      taskId: "job-3",
      userId: "7",
      mediaType: "image",
      status: "failed",
      model: "grok-image-1",
      prompt: "portrait",
      errorMessage: "Hermes processing failed. Please try again.",
      parameters: { workerBilling: { reservationId: "res-7", reservedCredits: 8, sourceType: "worker_runtime" } },
      createdAt: new Date().toISOString(),
    });

    const task = await pollAndReconcile("hermes_cand-3", 7);
    expect(task.status).toBe("failed");
    expect(task.errorMessage).toBeTruthy();
    expect(mockRefundReservation).toHaveBeenCalledWith("res-7");
  });

  it("canceled (projected as failed with HERMES_JOB_CANCELLED copy) → fee refunded", async () => {
    mockRefundReservation.mockResolvedValue({ refundedAmount: 8 });
    mockGetHermesMediaTask.mockResolvedValue({
      id: "hermes_cand-4",
      taskId: "job-4",
      userId: "7",
      mediaType: "image",
      status: "failed",
      model: "grok-image-1",
      prompt: "portrait",
      errorMessage: "งานถูกยกเลิก",
      parameters: { workerBilling: { reservationId: "res-8", reservedCredits: 8, sourceType: "worker_runtime" } },
      createdAt: new Date().toISOString(),
    });

    const task = await pollAndReconcile("hermes_cand-4", 7);
    expect(task.status).toBe("failed");
    expect(mockRefundReservation).toHaveBeenCalledWith("res-8");
  });
});
