import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../mediaGenerationService", () => ({
  mediaGenerationService: {
    getModel: vi.fn().mockReturnValue(null),
    generateImageAsync: vi.fn(),
    getTask: vi.fn(),
  },
}));

vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn().mockResolvedValue(true),
  deductCredits: vi.fn().mockResolvedValue({ transactionId: 1 }),
  refundCredits: vi.fn().mockResolvedValue({ transactionId: 999 }),
}));

import { advanceStagedMarketplaceAutoReviewRun } from "../marketplaceAutoReviewStagedPipelineService";
import { mediaGenerationService } from "../mediaGenerationService";
import { refundCredits } from "../creditService";
import {
  buildStagedCheckpoint,
  buildStagedPlanView,
  buildStagedStoryArcPlan,
} from "../marketplaceAutoReviewStoryArcPlanner";
import { compileStagedImagePrompt } from "../marketplaceAutoReviewStagedPromptCompiler";
import { transitionStagedCheckpoint } from "../marketplaceAutoReviewStagedCheckpointService";
import {
  marketplaceAutoReviewRuns,
  marketplaceAutoReviewStages,
} from "../../../drizzle/schema";

/**
 * Regression coverage for "one shot's provider failure must never block any
 * other shot from being reconciled or dispatched" (per-shot independence).
 * Before this fix, a throw from `reconcileVideoProvider`/`handleImageProvider`
 * /etc. for ONE shot propagated out of the entire `for (const shot of
 * plan.shots)` loop in `advanceStagedMarketplaceAutoReviewRun`, aborting the
 * whole pass before any shot after the failing one was even examined. This
 * reproduced a live production bug: shot 1's permanently-failed video task
 * made every sweep pass throw at shot 1, before shots 2-9 (fully
 * independent, ready to dispatch) were ever looked at.
 *
 * This test mimics the database with a mutable in-memory row (same pattern
 * as marketplaceAutoReviewStagedPipeline.selfHealPersist.test.ts) so the
 * real per-shot catch/refund/continue logic is exercised end-to-end, not
 * stubbed away.
 */

function makeFakeDb(initialRun: Record<string, any>) {
  let runRow: Record<string, any> = { ...initialRun };
  const stageRows: Record<string, any>[] = [];
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
    insert(table: unknown) {
      return {
        values(v: Record<string, any>) {
          // Pipeline service's local `upsertStage` does
          // `await db.insert(t).values(v)` directly (no further chaining).
          // marketplaceAutoReviewService.ts's `upsertRunStage` does
          // `.insert(t).values(v).onConflictDoUpdate(opts)`. Support both by
          // returning a thenable with an `onConflictDoUpdate` method
          // attached.
          if (table === marketplaceAutoReviewStages) {
            stageRows.push(v);
          }
          const resultPromise: any = Promise.resolve(undefined);
          resultPromise.onConflictDoUpdate = async (_opts: unknown) => {
            return undefined;
          };
          return resultPromise;
        },
      };
    },
  };
  return { db: db as any, getRunRow: () => runRow, getStageRows: () => stageRows };
}

describe("advanceStagedMarketplaceAutoReviewRun per-shot independence (bug fix)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mediaGenerationService.generateImageAsync as any).mockResolvedValue({
      id: "provider-task-shot2",
      status: "pending",
    });
    (mediaGenerationService.getTask as any).mockResolvedValue({
      id: "provider-video-task-shot1-dead",
      status: "failed",
      resultUrl: undefined,
    });
    (refundCredits as any).mockResolvedValue({ transactionId: 999 });
  });

  it("does not throw when shot 1's video task is permanently failed, still dispatches shot 2's ready image, and refunds shot 1's spent credit", async () => {
    const runId = "run-independence-1";
    const plan = buildStagedStoryArcPlan({
      runId,
      product: {
        productId: "product-1",
        productName: "แก้วน้ำตัวอย่าง",
        description: "สินค้าสำหรับทดสอบ per-shot independence",
        imageUrls: ["https://example.test/product.png"],
      },
      referenceManifestHash: "refs-independence-1",
    });

    const shot1 = plan.shots[0];
    const shot2 = plan.shots[1];

    // --- story_plan: approved -------------------------------------------
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

    // --- shot 1: image already completed, video dispatched but the
    // provider now reports it permanently failed (reconcileVideoProvider
    // will throw `staged_video_provider_failed:shot:1`). -------------------
    const shot1ImagePrompt = compileStagedImagePrompt({ plan, shot: shot1 });
    const shot1ImagePromptCheckpoint = buildStagedCheckpoint({
      checkpointId: `image-prompt:${runId}:shot-${shot1.shotId}:r${plan.planRevision}`,
      kind: "image_prompt",
      shotId: shot1.shotId,
      revision: plan.planRevision,
      contentHash: shot1ImagePrompt.contentHash,
      model: "google-banana-2",
      provider: "media-provider",
      estimatedCredits: 5,
      referenceManifestHash: plan.referenceManifestHash,
      autoApprove: { userId: 42, approvedAt: "2026-07-29T00:00:00.000Z" },
    });
    const shot1ImageResultCheckpoint = buildStagedCheckpoint({
      checkpointId: `image-result:${runId}:shot-${shot1.shotId}:r${plan.planRevision}`,
      kind: "image_result",
      shotId: shot1.shotId,
      revision: plan.planRevision,
      contentHash: "shot1-image-artifact-hash",
      model: "google-banana-2",
      provider: "media-provider",
      estimatedCredits: 0,
      referenceManifestHash: plan.referenceManifestHash,
      autoApprove: { userId: 42, approvedAt: "2026-07-29T00:00:00.000Z" },
    });
    const shot1VideoPromptCheckpoint = buildStagedCheckpoint({
      checkpointId: `video-prompt:${runId}:shot-${shot1.shotId}:r${plan.planRevision}`,
      kind: "video_prompt",
      shotId: shot1.shotId,
      revision: plan.planRevision,
      contentHash: "shot1-video-prompt-hash",
      model: "veo3/generate-veo-3-video-lite",
      provider: "media-provider",
      estimatedCredits: 8,
      referenceManifestHash: plan.referenceManifestHash,
      autoApprove: { userId: 42, approvedAt: "2026-07-29T00:00:00.000Z" },
    });

    // --- shot 2: image_prompt approved, nothing dispatched yet — fully
    // ready to dispatch, and must NOT be blocked by shot 1's failure. ------
    const shot2ImagePrompt = compileStagedImagePrompt({ plan, shot: shot2 });
    const shot2ImagePromptCheckpoint = buildStagedCheckpoint({
      checkpointId: `image-prompt:${runId}:shot-${shot2.shotId}:r${plan.planRevision}`,
      kind: "image_prompt",
      shotId: shot2.shotId,
      revision: plan.planRevision,
      contentHash: shot2ImagePrompt.contentHash,
      model: "google-banana-2",
      provider: "media-provider",
      estimatedCredits: 5,
      referenceManifestHash: plan.referenceManifestHash,
      autoApprove: { userId: 42, approvedAt: "2026-07-29T00:00:00.000Z" },
    });

    const shots = plan.shots.map(shot => {
      if (shot.shotId === shot1.shotId) {
        return {
          shotId: shot.shotId,
          revision: plan.planRevision,
          state: "video_processing",
          storySummary: shot.storySummary,
          dialogue: shot.dialogue,
          imagePromptHash: shot1ImagePrompt.contentHash,
          imageArtifactHash: "shot1-image-artifact-hash",
          imageArtifactUrl: "https://example.test/shot1-image.png",
          videoPromptHash: "shot1-video-prompt-hash",
          videoPrompt: "shot1 video prompt text",
          videoArtifactHash: null,
          imagePrompt: shot1ImagePrompt.prompt,
        };
      }
      if (shot.shotId === shot2.shotId) {
        return {
          shotId: shot.shotId,
          revision: plan.planRevision,
          state: "image_prompt_awaiting",
          storySummary: shot.storySummary,
          dialogue: shot.dialogue,
          imagePromptHash: shot2ImagePrompt.contentHash,
          imageArtifactHash: null,
          videoPromptHash: null,
          videoArtifactHash: null,
          imagePrompt: shot2ImagePrompt.prompt,
        };
      }
      // Shots 3-9: untouched (no checkpoints at all) — must remain no-ops
      // in the loop, proving they're never gated on shot 1 or shot 2.
      return {
        shotId: shot.shotId,
        revision: plan.planRevision,
        state: "story_awaiting",
        storySummary: shot.storySummary,
        dialogue: shot.dialogue,
        imagePromptHash: null,
        imageArtifactHash: null,
        videoPromptHash: null,
        videoArtifactHash: null,
      };
    });

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
        reviewCheckpoints: [
          approvedStory.checkpoint,
          shot1ImagePromptCheckpoint,
          shot1ImageResultCheckpoint,
          shot1VideoPromptCheckpoint,
          shot2ImagePromptCheckpoint,
        ],
      },
      stagedPipeline: {
        plan,
        planView: buildStagedPlanView(plan),
        tasks: {
          [`image:${shot1.shotId}`]: {
            taskId: "provider-image-task-shot1",
            model: "google-banana-2",
            provider: "media-provider",
            status: "completed",
            resultUrl: "https://example.test/shot1-image.png",
            creditAmount: 5,
            creditTransactionId: 111,
            creditIdempotencyKey: `staged:${runId}:image:shot-${shot1.shotId}-r${plan.planRevision}`,
            submittedAt: "2026-07-29T00:00:00.000Z",
          },
          [`video:${shot1.shotId}`]: {
            // No `status` field — mirrors the real dispatch path
            // (`handleVideoProvider`'s `setTaskRecord` never writes one),
            // so this ref is still "cancellable" per
            // `isCancellableDirectMediaRef` at the moment the refund logic
            // reads it, exactly like the live production bug.
            taskId: "provider-video-task-shot1-dead",
            model: "veo3/generate-veo-3-video-lite",
            provider: "media-provider",
            creditAmount: 8,
            creditTransactionId: 777,
            creditIdempotencyKey: `staged:${runId}:video:shot-${shot1.shotId}-r${plan.planRevision}`,
            submittedAt: "2026-07-29T00:00:00.000Z",
          },
        },
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
      currentStage: "video_generation",
      stageIndex: 7,
      resultJson: {},
      completedAt: null,
      metadataJson: metadata,
    };

    const { db, getRunRow } = makeFakeDb(initialRun);
    const auth = { userId: 42, tenantId: "tenant-1" };
    const runtime = { userToken: "internal", publicUrl: "https://app.test" };

    // --- The actual regression assertion: must NOT throw. -----------------
    await expect(
      advanceStagedMarketplaceAutoReviewRun({
        db,
        run: initialRun as any,
        auth,
        runtime,
      })
    ).resolves.not.toThrow();

    // Shot 1's dead video task was reconciled (its provider status was
    // polled) — proves the loop actually reached and processed shot 1
    // instead of skipping it outright.
    expect(mediaGenerationService.getTask).toHaveBeenCalledWith(
      "provider-video-task-shot1-dead",
      expect.any(String),
      expect.objectContaining({ stage: "video_generation" })
    );

    // Shot 2's ready-to-dispatch image was NOT blocked by shot 1's failure
    // — this is the core of the fix: sibling shots must keep progressing.
    expect(mediaGenerationService.generateImageAsync).toHaveBeenCalledTimes(1);
    const persisted = getRunRow();
    const shot2Task =
      persisted.metadataJson.stagedPipeline.tasks[`image:${shot2.shotId}`];
    expect(shot2Task?.taskId).toBe("provider-task-shot2");

    // Shot 1's spent credit for the now-permanently-failed video task was
    // refunded — the CRITICAL CONSTRAINT: making the loop non-blocking must
    // not silently keep the user's spent credits.
    expect(refundCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        amount: 8,
        originalTransactionId: 777,
      })
    );
  });
});
