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
  compileStagedImagePrompt,
} from "../marketplaceAutoReviewStagedPromptCompiler";
import { refreshSequentialShotPromptWithSkill } from "../productReviewSequentialStoryboardSkillRunner";
import { transitionStagedCheckpoint } from "../marketplaceAutoReviewStagedCheckpointService";
import {
  marketplaceAutoReviewRuns,
  marketplaceAutoReviewStages,
} from "../../../drizzle/schema";

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
      "A lovingly lit product photo of the item on a wooden table.";
    const contentHash = buildStagedImagePromptContentHash({
      revision: plan.planRevision,
      shotId: shot1.shotId,
      prompt: rawPrompt,
      referenceManifestHash: plan.referenceManifestHash,
    });
    const imagePromptCheckpoint = buildStagedCheckpoint({
      checkpointId: `image-prompt:${runId}:shot-${shot1.shotId}:r${plan.planRevision}`,
      kind: "image_prompt",
      shotId: shot1.shotId,
      revision: plan.planRevision,
      contentHash,
      model: "google-banana-2",
      provider: "media-provider",
      estimatedCredits: 5,
      referenceManifestHash: plan.referenceManifestHash,
      autoApprove: { userId: 42, approvedAt: "2026-07-29T00:00:00.000Z" },
    });

    const shots = plan.shots.map(shot =>
      shot.shotId === shot1.shotId
        ? {
            shotId: shot.shotId,
            revision: plan.planRevision,
            state: "image_prompt_awaiting",
            storySummary: shot.storySummary,
            dialogue: shot.dialogue,
            imagePromptHash: contentHash,
            imageArtifactHash: null,
            videoPromptHash: null,
            videoArtifactHash: null,
            imagePrompt: rawPrompt,
          }
        : {
            shotId: shot.shotId,
            revision: plan.planRevision,
            state: "story_awaiting",
            storySummary: shot.storySummary,
            dialogue: shot.dialogue,
            imagePromptHash: null,
            imageArtifactHash: null,
            videoPromptHash: null,
            videoArtifactHash: null,
          }
    );

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
        reviewCheckpoints: [approvedStory, imagePromptCheckpoint],
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
        startFrameImagePrompt: `skill-prompt-shot-${input.targetShotId}`,
        videoPrompt: `skill-video-prompt-shot-${input.targetShotId}`,
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
      const expectedPrompt = `skill-prompt-shot-${shot.shotId}`;
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
          startFrameImagePrompt: `skill-prompt-shot-${input.targetShotId}`,
          videoPrompt: `skill-video-prompt-shot-${input.targetShotId}`,
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
    expect(persistedShot2?.imagePrompt).toBe(`skill-prompt-shot-${shot2.shotId}`);

    // Every other shot (3-9) also succeeded via the skill.
    for (const shot of plan.shots.slice(2)) {
      const persistedShot =
        persisted.metadataJson.stagedSequentialStoryboard.shots.find(
          (s: any) => s.shotId === shot.shotId
        );
      expect(persistedShot?.imagePrompt).toBe(`skill-prompt-shot-${shot.shotId}`);
    }

    const promptPlanStage = getStageRows().find(row => row.stageKey === "prompt_plan");
    expect(promptPlanStage?.outputJson?.statusDetail?.reasonCodes).toContain(
      "staged_prompt_skill_fallback"
    );
  });
});
