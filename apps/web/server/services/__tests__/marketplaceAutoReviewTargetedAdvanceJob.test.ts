import { beforeEach, describe, expect, it, vi } from "vitest";

const workerRuntimeMocks = vi.hoisted(() => ({
  advanceRun: vi.fn(),
  createRuntime: vi.fn(),
}));

vi.mock("../marketplaceAutoReviewService", () => ({
  advanceMarketplaceAutoReviewRun: workerRuntimeMocks.advanceRun,
}));

vi.mock("../marketplaceAutoReviewWorkerRuntime", () => ({
  createMarketplaceAutoReviewWorkerRuntime: workerRuntimeMocks.createRuntime,
}));

import {
  executeMarketplaceAutoReviewWorkerJob,
  marketplaceAutoReviewWorkerInputSchema,
} from "../marketplaceAutoReviewWorkerJob";

describe("shot-targeted Marketplace Auto Review advance jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workerRuntimeMocks.createRuntime.mockResolvedValue({
      publicUrl: "https://app.test",
    });
    workerRuntimeMocks.advanceRun.mockResolvedValue({
      runId: "run-auto-review-1",
    });
  });

  it("accepts a nonempty unique shot scope and rejects malformed scopes", () => {
    expect(
      marketplaceAutoReviewWorkerInputSchema.parse({
        operation: "advance_run",
        runId: "run-auto-review-1",
        targetShotIds: [7],
      })
    ).toMatchObject({ targetShotIds: [7] });

    for (const targetShotIds of [[], [7, 7]]) {
      expect(() =>
        marketplaceAutoReviewWorkerInputSchema.parse({
          operation: "advance_run",
          runId: "run-auto-review-1",
          targetShotIds,
        })
      ).toThrow();
    }
  });

  it("forwards the selected shot scope into staged advance processing", async () => {
    const job = marketplaceAutoReviewWorkerInputSchema.parse({
      operation: "advance_run",
      runId: "run-auto-review-1",
      targetShotIds: [7],
    });

    await executeMarketplaceAutoReviewWorkerJob({
      job,
      tenantId: "tenant-marketplace",
      userId: 42,
      jobId: "advance-job-1",
    });

    expect(workerRuntimeMocks.advanceRun).toHaveBeenCalledWith(
      "run-auto-review-1",
      { userId: 42, tenantId: "tenant-marketplace" },
      expect.objectContaining({ publicUrl: "https://app.test" }),
      [7]
    );
  });
});
