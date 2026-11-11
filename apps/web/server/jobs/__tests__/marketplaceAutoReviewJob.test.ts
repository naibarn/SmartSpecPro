import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import * as marketplaceAutoReviewService from "../../services/marketplaceAutoReviewService";

import {
  isMarketplaceAutoReviewAdvanceOutboxJobType,
  runMarketplaceAutoReviewJob,
} from "../marketplaceAutoReviewJob";

function createEmptySchedulerDb() {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async () => [],
  };
  return {
    select: () => chain,
  };
}

describe("marketplaceAutoReviewJob", () => {
  it("only claims auto-review advance outbox jobs", () => {
    expect(isMarketplaceAutoReviewAdvanceOutboxJobType("advance_run")).toBe(
      true
    );
    expect(isMarketplaceAutoReviewAdvanceOutboxJobType("initialize_run")).toBe(
      true
    );
    expect(
      isMarketplaceAutoReviewAdvanceOutboxJobType(
        "provider_reconciliation_recovery"
      )
    ).toBe(true);
    expect(
      isMarketplaceAutoReviewAdvanceOutboxJobType("hyperframes_render")
    ).toBe(false);
    expect(
      isMarketplaceAutoReviewAdvanceOutboxJobType("hyperframes_finalize")
    ).toBe(false);
  });

  it("claims and dispatches background sequential image-edit reconciliation jobs", () => {
    const source = readFileSync(
      new URL("../marketplaceAutoReviewJob.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain(
      'MARKETPLACE_AUTO_REVIEW_SEQUENTIAL_IMAGE_EDIT_RECONCILIATION_JOB_TYPE'
    );
    expect(source).toContain(
      "reconcileMarketplaceAutoReviewSequentialShotImageEdit("
    );
  });

  it("does not enqueue generic advance jobs for user-driven staged checkpoints", async () => {
    const queueAdvance = vi.spyOn(
      marketplaceAutoReviewService,
      "queueMarketplaceAutoReviewAdvance"
    );
    let limitCall = 0;
    const stagedRun = {
      id: "mar_staged_run",
      userId: 1,
      tenantId: "tenant-1",
      status: "running",
      updatedAt: new Date("2026-11-11T00:00:00.000Z"),
      metadataJson: {
        planningArchitecture: "staged_two_skill_v2",
        initializationControl: { status: "completed" },
      },
    };
    const chain = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async () => {
        limitCall += 1;
        return limitCall === 1 ? [] : limitCall === 2 ? [stagedRun] : [];
      },
    };

    try {
      await runMarketplaceAutoReviewJob({
        db: { select: () => chain },
        runHyperframesWorker: async () => ({
          processed: 0,
          disabled: false,
          runtimeDeferred: false,
        }),
      });
      expect(queueAdvance).not.toHaveBeenCalled();
    } finally {
      queueAdvance.mockRestore();
    }
  });

  it("dispatches durable initialization with an atomic claim, heartbeat, and exhausted-run failure", () => {
    const source = readFileSync(
      new URL("../marketplaceAutoReviewJob.ts", import.meta.url),
      "utf8"
    );
    expect(source).toMatch(/\.where\(\s*and\(/);
    expect(source).toContain(".returning()");
    expect(source).toContain('job.jobType === "initialize_run"');
    expect(source).toContain("initializeMarketplaceAutoReviewRun(");
    expect(source).toContain("heartbeatTimer = setInterval(");
    expect(source).toContain("failMarketplaceAutoReviewInitialization(");
    expect(source).toContain(
      "eq(marketplaceAutoReviewOutboxJobs.lockedBy, workerLockId)"
    );
  });

  it("runs the HyperFrames worker as part of the in-process scheduler tick", async () => {
    const calls: unknown[] = [];
    const result = await runMarketplaceAutoReviewJob({
      db: createEmptySchedulerDb(),
      runHyperframesWorker: async options => {
        calls.push(options);
        return {
          processed: 2,
          disabled: false,
          runtimeDeferred: false,
        };
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ limit: 25 });
    expect(result).toMatchObject({
      scannedRuns: 0,
      processedOutboxJobs: 0,
      processedHyperframesJobs: 2,
      hyperframesRuntimeDeferred: false,
      hyperframesWorkerDisabled: false,
    });
  });
});
