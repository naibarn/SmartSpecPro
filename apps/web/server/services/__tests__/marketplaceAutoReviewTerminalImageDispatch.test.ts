import { beforeEach, describe, expect, it, vi } from "vitest";

const workerJobMocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  enqueueInTransaction: vi.fn(),
  findByIdempotencyKey: vi.fn(),
}));
const databaseMocks = vi.hoisted(() => ({ getDb: vi.fn() }));
const modelRegistryMocks = vi.hoisted(() => ({
  getModelById: vi.fn(() => ({ provider: "google", creditCost: 30 })),
}));

vi.mock("../marketplaceAutoReviewWorkerJob", async importOriginal => {
  const actual = await importOriginal<
    typeof import("../marketplaceAutoReviewWorkerJob")
  >();
  return {
    ...actual,
    enqueueMarketplaceAutoReviewWorkerJob: workerJobMocks.enqueue,
    enqueueMarketplaceAutoReviewWorkerJobInTransaction:
      workerJobMocks.enqueueInTransaction,
    findMarketplaceAutoReviewWorkerJobByIdempotencyKey:
      workerJobMocks.findByIdempotencyKey,
  };
});

vi.mock("../../db", () => ({ getDb: databaseMocks.getDb }));

vi.mock("../modelRegistry", async importOriginal => {
  const actual = await importOriginal<typeof import("../modelRegistry")>();
  return { ...actual, getModelById: modelRegistryMocks.getModelById };
});

import { buildStagedCheckpoint } from "../marketplaceAutoReviewStoryArcPlanner";
import { stagedMetadataStateDigest } from "../marketplaceAutoReviewStagedCheckpointOperations";
import {
  executeStagedAutoReviewBulkGeneration,
  generateStagedAutoReviewShotPrompt,
  startStagedAutoReviewBulkGeneration,
} from "../marketplaceAutoReviewStagedCheckpointRouterService";
import { selectMarketplaceAutoReviewTargetShots } from "../marketplaceAutoReviewTargetShotScope";

function terminalRun(
  status: "completed" | "failed" | "cancelled",
  prompt: string
) {
  const plan = {
    product: {
      productName: "Coffee machine",
      description: "A compact home coffee machine.",
    },
    shots: [
      {
        shotId: 1,
        title: "Coffee machine product review",
        storySummary: "The hosts demonstrate the coffee machine.",
        dialogue: "",
        durationSeconds: 4,
        visualSummary: "A home coffee machine on a counter.",
      },
    ],
  };
  const storyCheckpoint = buildStagedCheckpoint({
    checkpointId: "story-plan:run-141:r1",
    kind: "story_plan",
    revision: 1,
    contentHash: "story-hash-1",
    estimatedCredits: 0,
    model: "story-arc",
    provider: "internal-bounded",
    referenceManifestHash: "refs-1",
  });
  const metadata = {
    planningArchitecture: "staged_two_skill_v2" as const,
    planningArchitectureVersion: 1 as const,
    humanApprovalPolicy: "all_checkpoints_required" as const,
    planReview: {
      required: true as const,
      status: "approved" as const,
      planRevision: 1,
      approvedRevision: 1,
      redraftCount: 0,
      lastOperationId: null,
    },
    stagedSequentialStoryboard: {
      storyPlanStatus: "approved" as const,
      planRevision: 1,
      storyPlanHash: "story-hash-1",
      referenceManifestHash: "refs-1",
      shots: [
        {
          shotId: 1,
          revision: 1,
          state: "image_prompt_awaiting",
          storySummary: "A coffee machine review shot.",
          dialogue: "",
          imagePrompt: prompt,
          imagePromptHash: prompt.trim() ? "image-prompt-hash-1" : null,
          imageArtifactHash: null,
          videoPromptHash: null,
          videoArtifactHash: null,
        },
      ],
      reviewCheckpoints: [
        {
          ...storyCheckpoint,
          state: "approved" as const,
          approvedHash: storyCheckpoint.contentHash,
          approvedByUserId: 42,
          approvedAt: "2026-11-12T00:00:00.000Z",
        },
      ],
    },
    stagedPipeline: { tasks: {}, plan },
    sequentialStoryboard: {
      languagePlan: {
        summaryLanguage: "th",
        dialogueLanguage: "th",
        promptLanguage: "en",
      },
    },
    productTruth: {
      productName: "Coffee machine",
      productCategory: "appliance",
    },
    customReferenceManifest: [
      {
        index: 1,
        url: "https://example.test/product.png",
        role: "product",
        active: true,
      },
    ],
  };
  const run = {
    id: "run-141",
    userId: 42,
    tenantId: "tenant-1",
    productId: "product-1",
    status,
    updatedAt: new Date("2026-11-12T00:00:00.000Z"),
    metadataJson: metadata,
  };
  return { run: run as any, metadata: metadata as any };
}

describe("saved image prompt dispatch from terminal staged runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workerJobMocks.findByIdempotencyKey.mockResolvedValue(null);
    workerJobMocks.enqueue.mockResolvedValue({ jobId: "worker-job-1" });
    workerJobMocks.enqueueInTransaction.mockResolvedValue({
      jobId: "advance-job-1",
    });
  });

  it.each(["completed", "failed", "cancelled"] as const)(
    "creates a Worker Job for an existing prompt when the run is %s",
    async status => {
      const { run, metadata } = terminalRun(
        status,
        "Create a product review image for shot one."
      );
      databaseMocks.getDb.mockResolvedValue({
        select: () => ({
          from: () => ({ where: () => ({ limit: async () => [run] }) }),
        }),
      });

      const result = await startStagedAutoReviewBulkGeneration({
        runId: run.id,
        expectedStateDigest: stagedMetadataStateDigest(metadata),
        idempotencyKey: `image-dispatch-${status}`,
        targets: [{ shotId: 1, stage: "image", model: "google-banana-2" }],
        auth: { userId: 42, tenantId: "tenant-1" },
      });

      expect(result).toMatchObject({
        workerJobId: "worker-job-1",
        operation: "staged_bulk_generation",
        status: "queued",
      });
      expect(workerJobMocks.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: run.id,
          operation: expect.objectContaining({
            operation: "staged_bulk_generation",
            targets: [
              expect.objectContaining({
                shotId: 1,
                stage: "image",
                model: "google-banana-2",
              }),
            ],
          }),
        })
      );
    }
  );

  it("stops before queueing only when the selected shot has no saved prompt", async () => {
    const { run, metadata } = terminalRun("failed", "   ");
    databaseMocks.getDb.mockResolvedValue({
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [run] }) }),
      }),
    });

    await expect(
      startStagedAutoReviewBulkGeneration({
        runId: run.id,
        expectedStateDigest: stagedMetadataStateDigest(metadata),
        idempotencyKey: "image-dispatch-no-prompt",
        targets: [{ shotId: 1, stage: "image", model: "google-banana-2" }],
        auth: { userId: 42, tenantId: "tenant-1" },
      })
    ).rejects.toMatchObject({ message: "staged_image_prompt_missing" });
    expect(workerJobMocks.enqueue).not.toHaveBeenCalled();
  });

  it("queues the latest validated target even when another shot changed the client digest", async () => {
    const { run } = terminalRun(
      "failed",
      "Create a product review image for shot one."
    );
    databaseMocks.getDb.mockResolvedValue({
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [run] }) }),
      }),
    });

    const result = await startStagedAutoReviewBulkGeneration({
      runId: run.id,
      expectedStateDigest: "stale-because-another-shot-updated",
      idempotencyKey: "image-dispatch-stale-digest",
      targets: [{ shotId: 1, stage: "image", model: "google-banana-2" }],
      auth: { userId: 42, tenantId: "tenant-1" },
    });

    expect(result).toMatchObject({
      workerJobId: "worker-job-1",
      status: "queued",
    });
    expect(workerJobMocks.enqueue).toHaveBeenCalledTimes(1);
  });

  it("queues a shot prompt from the latest shot context when another shot changed the client digest", async () => {
    const { run } = terminalRun(
      "failed",
      "Create a product review image for shot one."
    );
    run.status = "review";
    databaseMocks.getDb.mockResolvedValue({
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [run] }) }),
      }),
    });

    const result = await generateStagedAutoReviewShotPrompt({
      runId: run.id,
      shotId: 1,
      stage: "image",
      expectedStateDigest: "stale-because-another-shot-updated",
      idempotencyKey: "prompt-generation-stale-digest",
      auth: { userId: 42, tenantId: "tenant-1" },
    });

    expect(result).toMatchObject({
      workerJobId: "worker-job-1",
      operation: "staged_prompt_generation",
      status: "queued",
    });
    expect(workerJobMocks.enqueue).toHaveBeenCalledTimes(1);
    expect(workerJobMocks.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: expect.objectContaining({
          operation: "staged_prompt_generation",
          shotId: 1,
          expectedShotRevision: 1,
          promptContextDigest: expect.any(String),
        }),
      })
    );
  });

  it("reopens the failed run and queues image work for that shot alone", async () => {
    const savedPrompt = "Create a product review image for shot one.";
    const { run, metadata } = terminalRun("failed", savedPrompt);
    const writes: Array<Record<string, unknown>> = [];
    const tx = {
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [run] }) }),
      }),
      update: () => ({
        set: (patch: Record<string, unknown>) => {
          writes.push(patch);
          return {
            where: () => ({ returning: async () => [{ id: run.id }] }),
          };
        },
      }),
    };
    databaseMocks.getDb.mockResolvedValue({
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [run] }) }),
      }),
      transaction: async (callback: (transaction: any) => Promise<unknown>) =>
        callback(tx),
    });

    const result = await executeStagedAutoReviewBulkGeneration({
      runId: run.id,
      expectedStateDigest: stagedMetadataStateDigest(metadata),
      requestIdempotencyKey: "image-dispatch-execute-1",
      targets: [{ shotId: 1, stage: "image", model: "google-banana-2" }],
      auth: { userId: 42, tenantId: "tenant-1" },
    });

    expect(result).toMatchObject({ runId: run.id, status: "queued" });
    expect(writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "running",
          currentStage: "image_generation",
          completedAt: null,
        }),
      ])
    );
    const savedMetadata = writes[0].metadataJson as any;
    expect(savedMetadata.stagedSequentialStoryboard.shots[0].imagePrompt).toBe(
      savedPrompt
    );
    expect(
      savedMetadata.stagedSequentialStoryboard.reviewCheckpoints.find(
        (checkpoint: any) =>
          checkpoint.kind === "image_prompt" && checkpoint.shotId === 1
      )
    ).toMatchObject({
      state: "approved",
      mediaDispatchIntent: { requestedByUserId: 42 },
    });
    expect(workerJobMocks.enqueueInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        admission: expect.objectContaining({
          operation: expect.objectContaining({
            operation: "advance_run",
            targetShotIds: [1],
          }),
        }),
      })
    );
  });

  it("keeps a shot-scoped advance isolated from all other shots", () => {
    const shots = [
      { shotId: 1, title: "One" },
      { shotId: 2, title: "Two" },
      { shotId: 3, title: "Three" },
    ];

    expect(selectMarketplaceAutoReviewTargetShots(shots, [2])).toEqual([
      shots[1],
    ]);
    expect(() => selectMarketplaceAutoReviewTargetShots(shots, [2, 2])).toThrow(
      "staged_target_shot_ids_invalid"
    );
    expect(() => selectMarketplaceAutoReviewTargetShots(shots, [4])).toThrow(
      "staged_target_shot_not_found"
    );
  });
});
