import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../mediaGenerationService", () => ({
  mediaGenerationService: {
    getModel: vi.fn().mockReturnValue(null),
    generateImageAsync: vi.fn(),
  },
}));

vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn().mockResolvedValue(true),
  deductCredits: vi.fn().mockResolvedValue({ transactionId: 1 }),
  refundCredits: vi.fn().mockResolvedValue(undefined),
}));

import { advanceStagedMarketplaceAutoReviewRun } from "../marketplaceAutoReviewStagedPipelineService";
import { mediaGenerationService } from "../mediaGenerationService";
import {
  buildStagedCheckpoint,
  buildStagedPlanView,
  buildStagedStoryArcPlan,
} from "../marketplaceAutoReviewStoryArcPlanner";
import { compileStagedImagePrompt } from "../marketplaceAutoReviewStagedPromptCompiler";
import { transitionStagedCheckpoint } from "../marketplaceAutoReviewStagedCheckpointService";
import { marketplaceAutoReviewRuns } from "../../../drizzle/schema";

/**
 * Regression coverage for the "self-heal never persists before same-pass
 * dispatch" bug: `selfHealAwaitingCheckpoint` only mutated the in-memory
 * `metadata` variable, and the shot loop then fell through in the SAME
 * pass to a dispatch/consume attempt (e.g. `handleImageProvider`), which
 * re-fetches the run fresh from the database right before spending and
 * threw `checkpoint_not_ready` because the heal was never flushed to the
 * database. That throw aborted the whole pass and discarded the heal,
 * causing a permanent stall. This file mimics the database with a mutable
 * in-memory row so the fresh-DB re-fetch guard in `consumeCheckpoint` is
 * exercised for real, not stubbed away.
 */

function makeFakeDb(initialRun: Record<string, any>) {
  let runRow: Record<string, any> = { ...initialRun };
  const db = {
    update(table: unknown) {
      return {
        set(patch: Record<string, any>) {
          return {
            where(_cond: unknown) {
              return {
                async returning() {
                  if (table === marketplaceAutoReviewRuns) {
                    runRow = { ...runRow, ...patch };
                    return [{ ...runRow }];
                  }
                  return [{ id: "stage-row-1", ...patch }];
                },
              };
            },
          };
        },
      };
    },
    select(_cols?: unknown) {
      return {
        from(table: unknown) {
          return {
            where(_cond: unknown) {
              return {
                async limit(_n: number) {
                  if (table === marketplaceAutoReviewRuns) {
                    return [{ ...runRow }];
                  }
                  // No pre-existing stage row: upsertStage always inserts.
                  return [];
                },
              };
            },
          };
        },
      };
    },
    insert(_table: unknown) {
      return {
        async values(_v: Record<string, any>) {
          return undefined;
        },
      };
    },
  };
  return { db: db as any, getRunRow: () => runRow };
}

describe("advanceStagedMarketplaceAutoReviewRun self-heal persistence (bug fix)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mediaGenerationService.generateImageAsync as any).mockResolvedValue({
      id: "provider-task-1",
      status: "pending",
    });
  });

  it("persists a self-healed awaiting image_prompt checkpoint before attempting same-pass dispatch, then dispatches on the next pass", async () => {
    const runId = "run-selfheal-1";
    const plan = buildStagedStoryArcPlan({
      runId,
      product: {
        productId: "product-1",
        productName: "แก้วน้ำตัวอย่าง",
        description: "สินค้าสำหรับทดสอบ self-heal",
        imageUrls: ["https://example.test/product.png"],
      },
      referenceManifestHash: "refs-selfheal-1",
    });

    // Approved story_plan checkpoint (mirrors the state after the concept
    // review step already passed).
    const rawStoryCheckpoint = buildStagedCheckpoint({
      checkpointId: `story-plan:${runId}:r${plan.planRevision}`,
      kind: "story_plan",
      revision: plan.planRevision,
      contentHash: plan.storyPlanHash,
      model: "story-arc",
      provider: "internal-bounded",
      estimatedCredits: 0,
      referenceManifestHash: plan.referenceManifestHash,
    });
    const approvedStory = transitionStagedCheckpoint(rawStoryCheckpoint, {
      type: "approve",
      expected: {
        revision: rawStoryCheckpoint.revision,
        contentHash: rawStoryCheckpoint.contentHash,
        model: "story-arc",
        provider: "internal-bounded",
        safetyVerdict: "passed",
        referenceManifestHash: plan.referenceManifestHash ?? "none",
        estimatedCredits: 0,
      },
      userId: 42,
      approvedAt: "2026-07-29T00:00:00.000Z",
    });
    expect(approvedStory.ok).toBe(true);
    if (!approvedStory.ok) throw new Error("test setup failed");

    // Shot 1's image_prompt checkpoint left in literal "awaiting" state —
    // this reproduces a checkpoint that predates the auto-approve change
    // (every non-story checkpoint is now born already `approved`).
    const shot1 = plan.shots[0];
    const compiledImagePrompt = compileStagedImagePrompt({ plan, shot: shot1 });
    const awaitingImagePromptCheckpoint = buildStagedCheckpoint({
      checkpointId: `image-prompt:${runId}:shot-${shot1.shotId}:r${plan.planRevision}`,
      kind: "image_prompt",
      shotId: shot1.shotId,
      revision: plan.planRevision,
      contentHash: compiledImagePrompt.contentHash,
      estimatedCredits: 0,
      referenceManifestHash: plan.referenceManifestHash,
      // No autoApprove — simulates the pre-migration "awaiting" checkpoint.
    });
    expect(awaitingImagePromptCheckpoint.state).toBe("awaiting");

    const shots = plan.shots.map(shot => ({
      shotId: shot.shotId,
      revision: plan.planRevision,
      state:
        shot.shotId === shot1.shotId
          ? "image_prompt_awaiting"
          : "story_awaiting",
      storySummary: shot.storySummary,
      dialogue: shot.dialogue,
      imagePromptHash:
        shot.shotId === shot1.shotId ? compiledImagePrompt.contentHash : null,
      imageArtifactHash: null,
      videoPromptHash: null,
      videoArtifactHash: null,
      imagePrompt:
        shot.shotId === shot1.shotId ? compiledImagePrompt.prompt : null,
    }));

    const metadata = {
      productImageUrls: ["https://example.test/product.png"],
      planningArchitecture: "staged_two_skill_v2" as const,
      planningArchitectureVersion: 1 as const,
      humanApprovalPolicy: "all_checkpoints_required" as const,
      planReview: {
        required: true as const,
        status: "approved" as const,
        planRevision: plan.planRevision,
        approvedRevision: plan.planRevision,
        redraftCount: 0,
        lastOperationId: null,
      },
      stagedSequentialStoryboard: {
        storyPlanStatus: "approved" as const,
        planRevision: plan.planRevision,
        storyPlanHash: plan.storyPlanHash,
        referenceManifestHash: plan.referenceManifestHash,
        shots,
        reviewCheckpoints: [approvedStory.checkpoint, awaitingImagePromptCheckpoint],
      },
      stagedPipeline: {
        plan,
        planView: buildStagedPlanView(plan),
        tasks: {},
        audioPlan: null,
        finalAssembly: null,
      },
    };

    const initialRun = {
      id: runId,
      userId: 42,
      tenantId: "tenant-1",
      productId: "product-1",
      outputMode: "storyboard_images",
      status: "running",
      currentStage: "prompt_plan",
      stageIndex: 4,
      resultJson: {},
      completedAt: null,
      metadataJson: metadata,
    };

    const { db, getRunRow } = makeFakeDb(initialRun);
    const auth = { userId: 42, tenantId: "tenant-1" };
    const runtime = { userToken: "internal", publicUrl: "https://app.test" };

    // --- Pass 1: self-heal must persist, and must NOT throw. -------------
    const pass1 = await advanceStagedMarketplaceAutoReviewRun({
      db,
      run: initialRun as any,
      auth,
      runtime,
    });

    expect(pass1.finalAssemblyApproved).toBe(false);

    // The healed checkpoint must be reflected in the PERSISTED database
    // row, not just in a discarded local variable.
    const persistedAfterPass1 = getRunRow();
    const persistedCheckpoint =
      persistedAfterPass1.metadataJson.stagedSequentialStoryboard.reviewCheckpoints.find(
        (cp: any) => cp.kind === "image_prompt" && cp.shotId === shot1.shotId
      );
    expect(persistedCheckpoint?.state).toBe("approved");

    // Dispatch must NOT have happened yet in this same pass — that would
    // mean the old same-pass fall-through raced consumeCheckpoint's
    // fresh-DB guard again.
    expect(mediaGenerationService.generateImageAsync).not.toHaveBeenCalled();

    // --- Pass 2: now that the heal is persisted, dispatch proceeds. ------
    // Re-fetch from the (fake) database rather than reusing `pass1.run`,
    // matching how the real caller re-fetches the run row from Postgres on
    // each sweep/poll-triggered pass instead of holding the in-memory
    // return value across passes.
    const pass2 = await advanceStagedMarketplaceAutoReviewRun({
      db,
      run: getRunRow() as any,
      auth,
      runtime,
    });

    expect(pass2.finalAssemblyApproved).toBe(false);
    expect(mediaGenerationService.generateImageAsync).toHaveBeenCalledTimes(1);

    const persistedAfterPass2 = getRunRow();
    const task =
      persistedAfterPass2.metadataJson.stagedPipeline.tasks[
        `image:${shot1.shotId}`
      ];
    expect(task?.taskId).toBe("provider-task-1");
  });
});
