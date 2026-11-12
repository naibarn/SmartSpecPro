import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../mediaGenerationService", () => ({
  mediaGenerationService: {
    getModel: vi.fn().mockReturnValue(null),
    generateImageAsync: vi.fn(),
    generateVideoAsync: vi.fn(),
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
import { buildStagedImagePromptContentHash } from "../marketplaceAutoReviewStagedPromptCompiler";
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
    const generatedPlan = buildStagedStoryArcPlan({
      runId,
      product: {
        productId: "product-1",
        productName: "แก้วน้ำตัวอย่าง",
        description: "สินค้าสำหรับทดสอบ per-shot independence",
        imageUrls: ["https://example.test/product.png"],
      },
      referenceManifestHash: "refs-independence-1",
    });
    // Keep the worker plan scoped to three shots so the pipeline does not
    // stop first to compile the other six shots' intentionally absent prompt
    // checkpoints. Shot 3 also covers recovery from an already-consumed
    // checkpoint whose previous provider hand-off never recorded a task.
    const plan = { ...generatedPlan, shots: generatedPlan.shots.slice(0, 3) };

    const shot1 = plan.shots[0];
    const shot2 = plan.shots[1];
    const shot3 = plan.shots[2];

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
      model: "gpt-image-2-5-sunburst-text-to-image",
      provider: "kie.ai",
      estimatedCredits: 30,
      referenceManifestHash: plan.referenceManifestHash,
      autoApprove: { userId: 42, approvedAt: "2026-07-29T00:00:00.000Z" },
    });
    const shot3ImagePrompt = compileStagedImagePrompt({ plan, shot: shot3 });
    const shot3ImagePromptCheckpoint = buildStagedCheckpoint({
      checkpointId: `image-prompt:${runId}:shot-${shot3.shotId}:r${plan.planRevision}`,
      kind: "image_prompt",
      shotId: shot3.shotId,
      revision: plan.planRevision,
      contentHash: shot3ImagePrompt.contentHash,
      model: "google-banana-2",
      provider: "media-provider",
      estimatedCredits: 5,
      referenceManifestHash: plan.referenceManifestHash,
      autoApprove: { userId: 42, approvedAt: "2026-07-29T00:00:00.000Z" },
    });
    const consumedShot3ImagePrompt = transitionStagedCheckpoint(
      shot3ImagePromptCheckpoint,
      {
        type: "consume",
        operationId: "prior-image-provider-handoff",
        consumedAt: "2026-07-29T00:01:00.000Z",
      }
    );
    expect(consumedShot3ImagePrompt.ok).toBe(true);
    if (!consumedShot3ImagePrompt.ok) throw new Error("test setup failed");
    const shot3VideoPromptCheckpoint = buildStagedCheckpoint({
      checkpointId: `video-prompt:${runId}:shot-${shot3.shotId}:r${plan.planRevision}`,
      kind: "video_prompt",
      shotId: shot3.shotId,
      revision: plan.planRevision,
      contentHash: "shot3-video-prompt-hash",
      model: "veo3/generate-veo-3-video-lite",
      provider: "media-provider",
      estimatedCredits: 8,
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
      if (shot.shotId === shot3.shotId) {
        return {
          shotId: shot.shotId,
          revision: plan.planRevision,
          state: "image_prompt_awaiting",
          storySummary: shot.storySummary,
          dialogue: shot.dialogue,
          imagePromptHash: shot3ImagePrompt.contentHash,
          imageArtifactHash: null,
          imageArtifactUrl: null,
          videoPromptHash: null,
          videoArtifactHash: null,
          imagePrompt: shot3ImagePrompt.prompt,
        };
      }
      // Shots 4-9: untouched (no checkpoints at all) — must remain no-ops
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
      customReferenceManifest: [
        {
          role: "primary_product",
          label: "product",
          url: "https://smartaihub.app/api/storage/files/tenant-1/product.webp",
          active: true,
        },
      ],
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
          consumedShot3ImagePrompt.checkpoint,
          shot3VideoPromptCheckpoint,
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

    const { db, getRunRow, getStageRows } = makeFakeDb(initialRun);
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
    const dispatchedImageRequest = (mediaGenerationService.generateImageAsync as any)
      .mock.calls[0][0];
    expect(dispatchedImageRequest.referenceImageUrls).toEqual([
      "https://smartaihub.app/api/storage/files/tenant-1/product.webp",
    ]);
    expect(dispatchedImageRequest.publicUrl).toBe("https://app.test");
    expect(dispatchedImageRequest.auditContext).toMatchObject({
      userId: 42,
      tenantId: "tenant-1",
      source: "marketplace_auto_review_staged",
    });
    const persisted = getRunRow();
    const shot2Task =
      persisted.metadataJson.stagedPipeline.tasks[`image:${shot2.shotId}`];
    expect(shot2Task?.taskId).toBe("provider-task-shot2");
    expect(
      persisted.metadataJson.stagedPipeline.tasks[`image:${shot3.shotId}`]
    ).toBeUndefined();
    expect(
      persisted.metadataJson.stagedSequentialStoryboard.reviewCheckpoints.find(
        (checkpoint: any) =>
          checkpoint.shotId === shot3.shotId && checkpoint.kind === "image_prompt"
      )?.consumedByOperationId
    ).toBe("prior-image-provider-handoff");
    expect(persisted.metadataJson.correctionRequired?.reasonCode).not.toBe(
      "checkpoint_consumed"
    );
    expect(mediaGenerationService.generateVideoAsync).not.toHaveBeenCalled();
    expect(getStageRows()).toContainEqual(
      expect.objectContaining({
        stageKey: "video_generation",
        status: "blocked_needs_user",
        outputJson: expect.objectContaining({
          shotId: shot3.shotId,
          statusDetail: expect.objectContaining({
            state: "waiting_for_approved_image",
            retryable: true,
          }),
        }),
      })
    );

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

    const failedVideoPollsBeforeNextPass =
      (mediaGenerationService.getTask as any).mock.calls.filter(
        ([taskId]: [string]) => taskId === "provider-video-task-shot1-dead"
      ).length;
    await advanceStagedMarketplaceAutoReviewRun({
      db,
      run: getRunRow() as any,
      auth,
      runtime,
    });
    expect(
      (mediaGenerationService.getTask as any).mock.calls.filter(
        ([taskId]: [string]) => taskId === "provider-video-task-shot1-dead"
      )
    ).toHaveLength(failedVideoPollsBeforeNextPass);
  });

  it("dispatches a saved prompt with a pending story revision, then polls the same task without resubmitting", async () => {
    const runId = "run-saved-prompt-pending-story";
    const plan = {
      planRevision: 1,
      title: "Story saved prompt regression",
      storySummary: "A saved prompt remains dispatchable.",
      product: {
        productId: "product-1",
        productName: "แก้วน้ำตัวอย่าง",
        description: "สินค้าสำหรับทดสอบ saved prompt dispatch",
        imageUrls: ["https://example.test/product.png"],
      },
      shots: [
        {
          shotId: 1,
          title: "Demonstrate the product",
          storySummary: "Show the product in use.",
          dialogue: "",
          durationSeconds: 10,
        },
      ],
      referenceManifestHash: "refs-saved-prompt-pending-story",
      storyPlanHash: "story-hash-saved-prompt-pending-story",
      source: "llm_story_arc" as const,
      authoring: { model: "test-model", provider: "test-provider", creditsUsed: 0 },
    };
    const shot = plan.shots[0];
    const prompt = "Approved saved image prompt for this shot.";
    const promptHash = buildStagedImagePromptContentHash({
      revision: plan.planRevision,
      shotId: shot.shotId,
      prompt,
      referenceManifestHash: plan.referenceManifestHash,
    });
    const storyCheckpoint = buildStagedCheckpoint({
      checkpointId: `story-plan:${runId}:r${plan.planRevision}`,
      kind: "story_plan",
      revision: plan.planRevision,
      contentHash: plan.storyPlanHash,
      model: "user-edit",
      provider: "user",
      estimatedCredits: 0,
      referenceManifestHash: plan.referenceManifestHash,
    });
    const imagePromptCheckpoint = buildStagedCheckpoint({
      checkpointId: `image-prompt:${runId}:shot-${shot.shotId}:r${plan.planRevision}`,
      kind: "image_prompt",
      shotId: shot.shotId,
      revision: plan.planRevision,
      contentHash: promptHash,
      model: "google-banana-2",
      provider: "media-provider",
      estimatedCredits: 5,
      referenceManifestHash: plan.referenceManifestHash,
      autoApprove: { userId: 42 },
      mediaDispatchIntent: { requestedByUserId: 42 },
    });
    const metadata = {
      productImageUrls: ["https://example.test/product.png"],
      customReferenceManifest: [
        {
          role: "primary_product",
          label: "product",
          url: "https://smartaihub.app/api/storage/files/tenant-1/product.webp",
          active: true,
        },
      ],
      planningArchitecture: "staged_two_skill_v2" as const,
      planningArchitectureVersion: 1 as const,
      humanApprovalPolicy: "all_checkpoints_required" as const,
      planReview: {
        required: true as const,
        status: "awaiting" as const,
        planRevision: plan.planRevision,
        approvedRevision: null,
        redraftCount: 0,
        lastOperationId: null,
      },
      stagedSequentialStoryboard: {
        storyPlanStatus: "awaiting" as const,
        planRevision: plan.planRevision,
        storyPlanHash: plan.storyPlanHash,
        referenceManifestHash: plan.referenceManifestHash,
        shots: [
          {
            shotId: shot.shotId,
            revision: plan.planRevision,
            state: "image_prompt_awaiting",
            storySummary: shot.storySummary,
            dialogue: shot.dialogue,
            imagePromptHash: promptHash,
            imagePrompt: prompt,
            imageArtifactHash: null,
            imageArtifactUrl: null,
            videoPromptHash: null,
            videoArtifactHash: null,
          },
        ],
        reviewCheckpoints: [storyCheckpoint, imagePromptCheckpoint],
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
      currentStage: "image_generation",
      stageIndex: 5,
      resultJson: {},
      completedAt: null,
      metadataJson: metadata,
    };
    const { db, getRunRow } = makeFakeDb(initialRun);
    const auth = { userId: 42, tenantId: "tenant-1" };
    const runtime = { userToken: "internal", publicUrl: "https://app.test" };

    await advanceStagedMarketplaceAutoReviewRun({
      db,
      run: initialRun as any,
      auth,
      runtime,
      targetShotIds: [shot.shotId],
    });

    expect(mediaGenerationService.generateImageAsync).toHaveBeenCalledTimes(1);
    expect(
      getRunRow().metadataJson.stagedPipeline.tasks[`image:${shot.shotId}`]
        ?.taskId
    ).toBe("provider-task-shot2");

    (mediaGenerationService.getTask as any).mockResolvedValue({
      id: "provider-task-shot2",
      status: "processing",
    });
    await advanceStagedMarketplaceAutoReviewRun({
      db,
      run: getRunRow() as any,
      auth,
      runtime,
      targetShotIds: [shot.shotId],
    });

    expect(mediaGenerationService.getTask).toHaveBeenCalledWith(
      "provider-task-shot2",
      expect.any(String),
      expect.objectContaining({ stage: "image_generation" })
    );
    expect(mediaGenerationService.generateImageAsync).toHaveBeenCalledTimes(1);
  });
});
