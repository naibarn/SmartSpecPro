import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression coverage for `planning/marketplace-staged-skill-first-restore/plan.md`
 * P1 + P2 — restoring skill-first prompt authoring in the staged marketplace
 * auto-review pipeline:
 *
 * P1 — `handleImageProvider` used to APPEND a TS-authored character-identity
 * directive onto the compiled prompt whenever it didn't already mention the
 * expected @ImageN character tag, even when a SKILL wrote that prompt. This
 * is now a fail-closed VALIDATOR: it never rewrites the prompt, it only
 * records a non-blocking warning (`staged_prompt_reference_mapping_incomplete`).
 *
 * P2 — `compileImagePromptCheckpoints` used to compile every shot's initial
 * image prompt with the deterministic TS template unconditionally, even
 * though the underlying skills declare `execution_mode: llm-only` +
 * `fallback_policy: bounded_server_fallback`. It now tries the same
 * single-shot skill seam the per-shot "Generate Prompt" button uses
 * (`refreshSequentialShotPromptWithSkill` / `buildStagedSingleShotRefreshInput`)
 * FIRST, and only falls back to the deterministic compiler
 * (`compileStagedImagePrompt`) — recording `staged_prompt_skill_fallback` —
 * when the skill attempt fails or returns an empty prompt. One shot's
 * failure must never abort any other shot.
 */

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

vi.mock("../productReviewSequentialStoryboardSkillRunner", async importOriginal => {
  const actual = await importOriginal<
    typeof import("../productReviewSequentialStoryboardSkillRunner")
  >();
  return {
    ...actual,
    refreshSequentialShotPromptWithSkill: vi.fn(),
  };
});

vi.mock("../marketplaceAutoReviewStagedPromptCompiler", async importOriginal => {
  const actual = await importOriginal<
    typeof import("../marketplaceAutoReviewStagedPromptCompiler")
  >();
  return {
    ...actual,
    compileStagedImagePrompt: vi.fn(actual.compileStagedImagePrompt),
  };
});

import { advanceStagedMarketplaceAutoReviewRun } from "../marketplaceAutoReviewStagedPipelineService";
import { mediaGenerationService } from "../mediaGenerationService";
import {
  buildStagedCheckpoint,
  buildStagedPlanView,
  buildStagedStoryArcPlan,
} from "../marketplaceAutoReviewStoryArcPlanner";
import {
  buildStagedImagePromptContentHash,
  buildStagedVideoPromptContentHash,
  compileStagedImagePrompt,
} from "../marketplaceAutoReviewStagedPromptCompiler";
import { refreshSequentialShotPromptWithSkill } from "../productReviewSequentialStoryboardSkillRunner";
import { transitionStagedCheckpoint } from "../marketplaceAutoReviewStagedCheckpointService";
import {
  marketplaceAutoReviewRuns,
  marketplaceAutoReviewStages,
} from "../../../drizzle/schema";

function makeFakeDb(
  initialRun: Record<string, any>,
  options: {
    failRunUpdate?: (
      patch: Record<string, any>,
      current: Record<string, any>
    ) => boolean;
  } = {}
) {
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
                    if (options.failRunUpdate?.(patch, runRow)) {
                      throw new Error("simulated_worker_lease_loss");
                    }
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

function skillImagePrompt(shotId: number) {
  return `Shot ${shotId}: detailed vertical 9:16 product-review start frame using @Image1 as the exact product reference; preserve its geometry, color, and materials. Place the presenter naturally beside the product, use soft daylight, a clean background, deliberate camera composition, and sharp product focus. No on-screen text or captions.`;
}

function buildApprovedStoryCheckpoint(plan: ReturnType<typeof buildStagedStoryArcPlan>) {
  const raw = buildStagedCheckpoint({
    checkpointId: `story-plan:${plan.runId}:r${plan.planRevision}`,
    kind: "story_plan",
    revision: plan.planRevision,
    contentHash: plan.storyPlanHash,
    model: "story-arc",
    provider: "internal-bounded",
    estimatedCredits: 0,
    referenceManifestHash: plan.referenceManifestHash,
  });
  const approved = transitionStagedCheckpoint(raw, {
    type: "approve",
    expected: {
      revision: raw.revision,
      contentHash: raw.contentHash,
      model: "story-arc",
      provider: "internal-bounded",
      safetyVerdict: "passed",
      referenceManifestHash: plan.referenceManifestHash ?? "none",
      estimatedCredits: 0,
    },
    userId: 42,
    approvedAt: "2026-07-29T00:00:00.000Z",
  });
  if (!approved.ok) throw new Error("test setup failed: story checkpoint not approved");
  return approved.checkpoint;
}

describe("marketplace staged pipeline — skill-first prompt authoring restore (P1 + P2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("P1 — validates missing @ImageN character tags instead of appending to the prompt, and dispatches the prompt byte-identical", async () => {
    (mediaGenerationService.generateImageAsync as any).mockResolvedValue({
      id: "provider-task-1",
      status: "pending",
    });

    const runId = "run-p1-validator";
    const plan = buildStagedStoryArcPlan({
      runId,
      product: {
        productId: "product-1",
        productName: "แก้วน้ำตัวอย่าง",
        description: "สินค้าสำหรับทดสอบ validator",
        imageUrls: ["https://example.test/product.png"],
      },
      referenceManifestHash: "refs-p1-validator",
    });
    const shot1 = plan.shots[0];

    const approvedStory = buildApprovedStoryCheckpoint(plan);

    // A prompt that deliberately does NOT mention the expected character
    // tag (@Image2 — one product item at index 1, one character item at
    // index 2). Stored verbatim — nothing in the pipeline may rewrite it.
    const rawPrompt =
      "A lovingly lit product photo of the item on a wooden table, photographed vertically at 9:16 with the complete product clearly visible, crisp material detail, natural daylight, a calm uncluttered kitchen background, realistic proportions, and clean commercial composition. Keep the camera steady and preserve the exact product shape, color, markings, and controls from the reference image.";
    const contentHash = buildStagedImagePromptContentHash({
      revision: plan.planRevision,
      shotId: shot1.shotId,
      prompt: rawPrompt,
      referenceManifestHash: plan.referenceManifestHash,
    });
    const promptCheckpoints = plan.shots.map(shot => {
      const prompt = shot.shotId === shot1.shotId
        ? rawPrompt
        : skillImagePrompt(shot.shotId);
      return buildStagedCheckpoint({
        checkpointId: `image-prompt:${runId}:shot-${shot.shotId}:r${plan.planRevision}`,
        kind: "image_prompt",
        shotId: shot.shotId,
        revision: plan.planRevision,
        contentHash: shot.shotId === shot1.shotId
          ? contentHash
          : buildStagedImagePromptContentHash({
              revision: plan.planRevision,
              shotId: shot.shotId,
              prompt,
              referenceManifestHash: plan.referenceManifestHash,
            }),
        model: "google-banana-2",
        provider: "media-provider",
        estimatedCredits: 5,
        referenceManifestHash: plan.referenceManifestHash,
        ...(shot.shotId === shot1.shotId
          ? { autoApprove: { userId: 42, approvedAt: "2026-07-29T00:00:00.000Z" } }
          : {}),
      });
    });

    const shots = plan.shots.map(shot => ({
      shotId: shot.shotId,
      revision: plan.planRevision,
      state: "image_prompt_awaiting",
      storySummary: shot.storySummary,
      dialogue: shot.dialogue,
      imagePromptHash: shot.shotId === shot1.shotId
        ? contentHash
        : promptCheckpoints[shot.shotId - 1].contentHash,
      imageArtifactHash: null,
      videoPromptHash: null,
      videoArtifactHash: null,
      imagePrompt: shot.shotId === shot1.shotId
        ? rawPrompt
        : skillImagePrompt(shot.shotId),
    }));

    const metadata = {
      productImageUrls: ["https://example.test/product.png"],
      planningArchitecture: "staged_two_skill_v2" as const,
      planningArchitectureVersion: 1 as const,
      humanApprovalPolicy: "all_checkpoints_required" as const,
      // Product item at manifest index 1, character item at index 2 —
      // matches `handleImageProvider`'s `@Image${productCount + i + 1}`
      // index math (productCount = 1 here).
      customReferenceManifest: [
        { url: "https://example.test/product.png", role: "product", active: true },
        { url: "https://example.test/character.png", role: "character", active: true },
      ],
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
        reviewCheckpoints: [approvedStory, ...promptCheckpoints],
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

    const { db, getStageRows } = makeFakeDb(initialRun);
    const auth = { userId: 42, tenantId: "tenant-1" };
    // Non-"internal" userToken so `resolveStagedUserToken` skips
    // `signBearerToken` entirely (avoids requiring JWT_SECRET in tests).
    const runtime = { userToken: "test-fixture-token", publicUrl: "https://app.test" };

    await advanceStagedMarketplaceAutoReviewRun({
      db,
      run: initialRun as any,
      auth,
      runtime,
    });

    // The dispatched prompt must be byte-identical to the checkpoint's
    // prompt — no TS-authored directive appended.
    expect(mediaGenerationService.generateImageAsync).toHaveBeenCalledTimes(1);
    const dispatchedRequest = (mediaGenerationService.generateImageAsync as any).mock
      .calls[0][0];
    expect(dispatchedRequest.prompt).toBe(rawPrompt);

    // The gap is surfaced as a non-blocking warning, not silently fixed.
    const imageGenerationStage = getStageRows().find(
      row => row.stageKey === "image_generation"
    );
    expect(imageGenerationStage?.outputJson?.statusDetail?.reasonCodes).toContain(
      "staged_prompt_reference_mapping_incomplete"
    );
    expect(imageGenerationStage?.outputJson?.statusDetail?.userActionRequired).toBe(
      false
    );
  });

  it("P2 — attempts the skill first and uses its output as the compiled prompt for every shot", async () => {
    (refreshSequentialShotPromptWithSkill as any).mockImplementation(
      async (input: { targetShotId: number }) => ({
        startFrameImagePrompt: skillImagePrompt(input.targetShotId),
        videoPrompt: `Use the accepted image as the exact visual source. Keep product identity and shot ${input.targetShotId} continuity; use restrained camera motion and natural lighting. Approved dialogue remains unchanged.`,
        degraded: false,
      })
    );

    const runId = "run-p2-skill-first";
    const plan = buildStagedStoryArcPlan({
      runId,
      product: {
        productId: "product-1",
        productName: "แก้วน้ำตัวอย่าง",
        description: "สินค้าสำหรับทดสอบ skill-first",
        imageUrls: ["https://example.test/product.png"],
      },
      referenceManifestHash: "refs-p2-skill-first",
    });

    const approvedStory = buildApprovedStoryCheckpoint(plan);
    const shots = plan.shots.map(shot => ({
      shotId: shot.shotId,
      revision: plan.planRevision,
      state: "story_awaiting" as const,
      storySummary: shot.storySummary,
      dialogue: shot.dialogue,
      imagePromptHash: null,
      imageArtifactHash: null,
      videoPromptHash: null,
      videoArtifactHash: null,
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
        // No image_prompt checkpoints at all yet — this is exactly the
        // trigger condition for `compileImagePromptCheckpoints`.
        reviewCheckpoints: [approvedStory],
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
      currentStage: "concept_story",
      stageIndex: 3,
      resultJson: {},
      completedAt: null,
      metadataJson: metadata,
    };

    const { db, getRunRow } = makeFakeDb(initialRun);
    const auth = { userId: 42, tenantId: "tenant-1" };
    const runtime = { userToken: "test-fixture-token", publicUrl: "https://app.test" };

    await advanceStagedMarketplaceAutoReviewRun({
      db,
      run: initialRun as any,
      auth,
      runtime,
    });

    expect(refreshSequentialShotPromptWithSkill).toHaveBeenCalledTimes(
      plan.shots.length
    );
    // Deterministic fallback must never have been reached — the skill
    // succeeded for every shot.
    expect(compileStagedImagePrompt).not.toHaveBeenCalled();

    const persisted = getRunRow();
    for (const shot of plan.shots) {
      const persistedShot =
        persisted.metadataJson.stagedSequentialStoryboard.shots.find(
          (s: any) => s.shotId === shot.shotId
        );
      const expectedPrompt = skillImagePrompt(shot.shotId);
      expect(persistedShot?.imagePrompt).toBe(expectedPrompt);

      const persistedCheckpoint =
        persisted.metadataJson.stagedSequentialStoryboard.reviewCheckpoints.find(
          (cp: any) => cp.kind === "image_prompt" && cp.shotId === shot.shotId
        );
      const expectedHash = buildStagedImagePromptContentHash({
        revision: plan.planRevision,
        shotId: shot.shotId,
        prompt: expectedPrompt,
        referenceManifestHash: plan.referenceManifestHash,
      });
      expect(persistedCheckpoint?.contentHash).toBe(expectedHash);
    }
  });

  it("resumes after a worker interruption without losing or regenerating prompts already persisted", async () => {
    const runId = "run-p2-worker-resume";
    const plan = buildStagedStoryArcPlan({
      runId,
      product: {
        productId: "product-1",
        productName: "แก้วน้ำตัวอย่าง",
        description: "สินค้าใช้ทดสอบการกลับมาทำงานต่อ",
        imageUrls: ["https://example.test/product.png"],
      },
      referenceManifestHash: "refs-p2-worker-resume",
    });
    const approvedStory = buildApprovedStoryCheckpoint(plan);
    const shots = plan.shots.map(shot => ({
      shotId: shot.shotId,
      revision: plan.planRevision,
      state: "story_awaiting" as const,
      storySummary: shot.storySummary,
      dialogue: shot.dialogue,
      imagePromptHash: null,
      imageArtifactHash: null,
      videoPromptHash: null,
      videoArtifactHash: null,
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
        reviewCheckpoints: [approvedStory],
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
      currentStage: "concept_story",
      stageIndex: 3,
      resultJson: {},
      completedAt: null,
      metadataJson: metadata,
    };
    let simulatedLeaseLoss = false;
    const { db, getRunRow } = makeFakeDb(initialRun, {
      failRunUpdate: patch => {
        const promptCount = (patch.metadataJson as any)?.stagedSequentialStoryboard?.reviewCheckpoints?.filter(
          (checkpoint: any) => checkpoint.kind === "image_prompt"
        ).length;
        if (!simulatedLeaseLoss && promptCount === 5) {
          simulatedLeaseLoss = true;
          return true;
        }
        return false;
      },
    });
    const auth = { userId: 42, tenantId: "tenant-1" };
    const runtime = {
      userToken: "test-fixture-token",
      publicUrl: "https://app.test",
    };
    (refreshSequentialShotPromptWithSkill as any).mockImplementation(
      async (input: { targetShotId: number }) => ({
        startFrameImagePrompt: skillImagePrompt(input.targetShotId),
        videoPrompt: "A complete motion prompt with camera direction and continuity.",
        degraded: false,
      })
    );

    await expect(
      advanceStagedMarketplaceAutoReviewRun({
        db,
        run: initialRun as any,
        auth,
        runtime,
      })
    ).rejects.toThrow("simulated_worker_lease_loss");
    expect(refreshSequentialShotPromptWithSkill).toHaveBeenCalledTimes(5);
    const persistedBeforeRetry = getRunRow();
    expect(
      persistedBeforeRetry.metadataJson.stagedSequentialStoryboard.shots
        .slice(0, 4)
        .every((shot: any) => shot.imagePrompt === skillImagePrompt(shot.shotId))
    ).toBe(true);

    await advanceStagedMarketplaceAutoReviewRun({
      db,
      run: persistedBeforeRetry as any,
      auth,
      runtime,
    });

    const attemptedShotIds = (refreshSequentialShotPromptWithSkill as any).mock.calls
      .map(([input]: [{ targetShotId: number }]) => input.targetShotId);
    expect(attemptedShotIds).toEqual([1, 2, 3, 4, 5, 5, 6, 7, 8, 9]);
    const resumed = getRunRow();
    expect(
      resumed.metadataJson.stagedSequentialStoryboard.shots.every(
        (shot: any) => shot.imagePrompt === skillImagePrompt(shot.shotId)
      )
    ).toBe(true);
  });

  it("authors the video prompt from the accepted image and persists it with the approved dialogue intact", async () => {
    const runId = "run-video-prompt-skill-first";
    const imageUrl = "https://example.test/accepted-shot-1.png";
    const imageHash = "accepted-shot-image-hash";
    const plan = buildStagedStoryArcPlan({
      runId,
      product: {
        productId: "product-1",
        productName: "แก้วน้ำตัวอย่าง",
        description: "สินค้าใช้ทดสอบ prompt วิดีโอ",
        imageUrls: ["https://example.test/product.png"],
      },
      referenceManifestHash: "refs-video-prompt-skill-first",
    });
    const approvedStory = buildApprovedStoryCheckpoint(plan);
    const shot1 = plan.shots[0];
    const imagePromptData = plan.shots.map(shot =>
      compileStagedImagePrompt({ plan, shot })
    );
    const imagePromptCheckpoints = plan.shots.map((shot, index) =>
      buildStagedCheckpoint({
        checkpointId: `image-prompt:${runId}:shot-${shot.shotId}:r${plan.planRevision}`,
        kind: "image_prompt",
        shotId: shot.shotId,
        revision: plan.planRevision,
        contentHash: imagePromptData[index].contentHash,
        model: "google-banana-2",
        provider: "media-provider",
        estimatedCredits: 5,
        referenceManifestHash: plan.referenceManifestHash,
        autoApprove: { userId: 42 },
      })
    );
    const imageResultCheckpoint = buildStagedCheckpoint({
      checkpointId: `image-result:${runId}:shot-1:r${plan.planRevision}`,
      kind: "image_result",
      shotId: shot1.shotId,
      revision: plan.planRevision,
      contentHash: imageHash,
      model: "google-banana-2",
      provider: "media-provider",
      estimatedCredits: 0,
      referenceManifestHash: plan.referenceManifestHash,
      autoApprove: { userId: 42 },
    });
    const shots = plan.shots.map((shot, index) => ({
      shotId: shot.shotId,
      revision: plan.planRevision,
      state: shot.shotId === shot1.shotId ? "image_result_approved" : "image_prompt_awaiting",
      storySummary: shot.storySummary,
      dialogue: shot.dialogue,
      imagePrompt: imagePromptData[index].prompt,
      imagePromptHash: imagePromptData[index].contentHash,
      imageArtifactHash: shot.shotId === shot1.shotId ? imageHash : null,
      imageArtifactUrl: shot.shotId === shot1.shotId ? imageUrl : null,
      videoPrompt: null,
      videoPromptHash: null,
      videoArtifactHash: null,
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
        reviewCheckpoints: [
          approvedStory,
          ...imagePromptCheckpoints,
          imageResultCheckpoint,
        ],
      },
      stagedPipeline: {
        plan,
        planView: buildStagedPlanView(plan),
        tasks: {
          "image:1": { taskId: "completed-image-task", status: "completed" },
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
      outputMode: "video_shots",
      status: "running",
      currentStage: "storyboard_review",
      stageIndex: 6,
      resultJson: {},
      completedAt: null,
      metadataJson: metadata,
    };
    const { db, getRunRow } = makeFakeDb(initialRun);
    const auth = { userId: 42, tenantId: "tenant-1" };
    const runtime = {
      userToken: "test-fixture-token",
      publicUrl: "https://app.test",
    };
    const videoPrompt = `Create a vertical 9:16 product-review video from the accepted image as the exact visual source. Approved dialogue must remain verbatim: ${shot1.dialogue}. Show a natural opening, one clear product interaction, and a smooth closing camera move while preserving product geometry. No on-screen text or captions.`;
    (refreshSequentialShotPromptWithSkill as any).mockImplementation(
      async (input: any) => {
        expect(
          input.referenceManifest.some(
            (entry: any) =>
              entry.role === "approved_shot_image" && entry.url === imageUrl
          )
        ).toBe(true);
        return {
          startFrameImagePrompt: skillImagePrompt(input.targetShotId),
          videoPrompt,
          degraded: false,
        };
      }
    );

    await advanceStagedMarketplaceAutoReviewRun({
      db,
      run: initialRun as any,
      auth,
      runtime,
    });

    const persisted = getRunRow();
    const persistedShot = persisted.metadataJson.stagedSequentialStoryboard.shots.find(
      (shot: any) => shot.shotId === shot1.shotId
    );
    expect(persistedShot.videoPrompt).toBe(videoPrompt);
    expect(
      refreshSequentialShotPromptWithSkill
    ).toHaveBeenCalledTimes(1);
    const checkpoint = persisted.metadataJson.stagedSequentialStoryboard.reviewCheckpoints.find(
      (item: any) => item.kind === "video_prompt" && item.shotId === shot1.shotId
    );
    expect(checkpoint.contentHash).toBe(
      buildStagedVideoPromptContentHash({
        revision: plan.planRevision,
        shotId: shot1.shotId,
        prompt: videoPrompt,
        imageArtifactHash: imageHash,
      })
    );
    expect(
      persisted.metadataJson.stagedPipeline.promptGeneration["video:1"].source
    ).toBe("skill");
  });

  it("P2 — falls back to the deterministic compiler and records staged_prompt_skill_fallback when the skill fails for one shot, without aborting sibling shots", async () => {
    const actual = await vi.importActual<
      typeof import("../marketplaceAutoReviewStagedPromptCompiler")
    >("../marketplaceAutoReviewStagedPromptCompiler");

    (refreshSequentialShotPromptWithSkill as any).mockImplementation(
      async (input: { targetShotId: number }) => {
        if (input.targetShotId === 1) {
          throw new Error("skill invocation failed (test)");
        }
        return {
          startFrameImagePrompt: skillImagePrompt(input.targetShotId),
          videoPrompt: `Use the accepted image as the exact visual source. Keep product identity and shot ${input.targetShotId} continuity; use restrained camera motion and natural lighting. Approved dialogue remains unchanged.`,
          degraded: false,
        };
      }
    );

    const runId = "run-p2-skill-fallback";
    const plan = buildStagedStoryArcPlan({
      runId,
      product: {
        productId: "product-1",
        productName: "แก้วน้ำตัวอย่าง",
        description: "สินค้าสำหรับทดสอบ skill fallback",
        imageUrls: ["https://example.test/product.png"],
      },
      referenceManifestHash: "refs-p2-skill-fallback",
    });
    const shot1 = plan.shots[0];
    const shot2 = plan.shots[1];

    const approvedStory = buildApprovedStoryCheckpoint(plan);
    const shots = plan.shots.map(shot => ({
      shotId: shot.shotId,
      revision: plan.planRevision,
      state: "story_awaiting" as const,
      storySummary: shot.storySummary,
      dialogue: shot.dialogue,
      imagePromptHash: null,
      imageArtifactHash: null,
      videoPromptHash: null,
      videoArtifactHash: null,
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
        reviewCheckpoints: [approvedStory],
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
      currentStage: "concept_story",
      stageIndex: 3,
      resultJson: {},
      completedAt: null,
      metadataJson: metadata,
    };

    const { db, getRunRow, getStageRows } = makeFakeDb(initialRun);
    const auth = { userId: 42, tenantId: "tenant-1" };
    const runtime = { userToken: "test-fixture-token", publicUrl: "https://app.test" };

    await advanceStagedMarketplaceAutoReviewRun({
      db,
      run: initialRun as any,
      auth,
      runtime,
    });

    // Shot 1's skill attempt failed -> deterministic fallback used.
    expect(compileStagedImagePrompt).toHaveBeenCalledTimes(1);
    expect(compileStagedImagePrompt).toHaveBeenCalledWith(
      expect.objectContaining({ shot: expect.objectContaining({ shotId: 1 }) })
    );

    const persisted = getRunRow();
    const persistedShot1 =
      persisted.metadataJson.stagedSequentialStoryboard.shots.find(
        (s: any) => s.shotId === shot1.shotId
      );
    const deterministicShot1 = actual.compileStagedImagePrompt({
      plan,
      shot: shot1,
      customManifest: [],
    });
    expect(persistedShot1?.imagePrompt).toBe(deterministicShot1.prompt);

    // Shot 2's skill attempt succeeded — proves shot 1's failure never
    // aborted the loop for its siblings.
    const persistedShot2 =
      persisted.metadataJson.stagedSequentialStoryboard.shots.find(
        (s: any) => s.shotId === shot2.shotId
      );
    expect(persistedShot2?.imagePrompt).toBe(skillImagePrompt(shot2.shotId));

    // Every other shot (3-9) also succeeded via the skill.
    for (const shot of plan.shots.slice(2)) {
      const persistedShot =
        persisted.metadataJson.stagedSequentialStoryboard.shots.find(
          (s: any) => s.shotId === shot.shotId
        );
      expect(persistedShot?.imagePrompt).toBe(skillImagePrompt(shot.shotId));
    }

    const promptPlanStage = getStageRows().find(row => row.stageKey === "prompt_plan");
    expect(promptPlanStage?.outputJson?.statusDetail?.reasonCodes).toContain(
      "staged_prompt_skill_fallback"
    );
  });
});
