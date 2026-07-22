/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 08 §5.2. T5-T17.
 *
 * Scope note (documented per this section's own OUTPUT contract item 5):
 * T14 and T17 are NOT driven through the full, real `advanceMarketplace
 * AutoReviewRun` -> `scheduleImageAttempt` -> `mediaGenerationService.
 * generateImageAsync` chain. That chain also does credit reservation,
 * product-access lookups, provider status polling, and (for this section's
 * OWN scope) section-06's `ensureStoryboardFrames`/`createStoryboardReview`
 * handoff — none of which section 08 owns or may re-implement, and NONE of
 * which the repo's own 8800+ line `marketplaceAutoReviewService.test.ts`
 * exercises either (verified: that suite never calls `advanceMarketplace
 * AutoReviewRun` or mocks `mediaGenerationService`). Driving it for real
 * here would require reproducing that entire mock surface for a single
 * section's tests and would still not prove anything section 06 doesn't
 * already prove itself (`marketplaceAutoReview.sequentialPipeline.test.ts`).
 *
 * Instead:
 *  - T14 is proven by composing section-06's REAL, unmodified exported
 *    helpers (`prepareMarketplaceAutoReviewImagePromptForSubmitForTest` +
 *    `assertSequentialReferenceIndexMappingAtSubmitForTest`) end-to-end on
 *    the exact override this section persists — proving regen's override
 *    precedence surfaces the bad prompt UNMODIFIED and that section-06's
 *    guard (unmodified) rejects it.
 *  - T17's reopen DECISION (the part section 08 owns) is proven exhaustively
 *    via `resolveSequentialShotRegenerationOutcomeForTest` (pure/async, no
 *    DB), plus one DB-backed wiring test asserting the FIRST `db.update()`
 *    call `regenerateMarketplaceAutoReviewSequentialShot` issues carries the
 *    correct reopen fields — tolerating (via `.catch()`) whatever section-06
 *    machinery does afterward inside the same real, unmocked
 *    `advanceMarketplaceAutoReviewRun` call.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../db", () => ({ getDb: vi.fn() }));

vi.mock("../productReviewSequentialStoryboardSkillRunner", async () => {
  const actual = await vi.importActual<
    typeof import("../productReviewSequentialStoryboardSkillRunner")
  >("../productReviewSequentialStoryboardSkillRunner");
  return {
    ...actual,
    runProductReviewSequentialStoryboardSkillLoop: vi.fn(),
  };
});

import { getDb } from "../../db";
import { marketplaceAutoReviewRuns, tenants } from "../../../drizzle/schema";
import {
  runProductReviewSequentialStoryboardSkillLoop,
  SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER,
} from "../productReviewSequentialStoryboardSkillRunner";
import {
  MARKETPLACE_AUTO_REVIEW_SEQUENTIAL_MAX_USER_REGENERATIONS_PER_SHOT,
  applySequentialShotOverrideToRunMetadataForTest,
  assertSequentialShotRegenerationPreconditionsForTest,
  assertSequentialReferenceIndexMappingAtSubmitForTest,
  buildSequentialShotRegenerationPlanForTest,
  effectiveQualityModePolicyForTest,
  evaluateSequentialShotOverrideForTest,
  prepareMarketplaceAutoReviewImagePromptForSubmitForTest,
  prepareMarketplaceAutoReviewImagePromptForTest,
  regenerateMarketplaceAutoReviewSequentialShot,
  resolveSequentialShotRegenerationOutcomeForTest,
  saveMarketplaceAutoReviewSequentialShotOverride,
  sequentialShotUnitAttemptCapForTest,
} from "../marketplaceAutoReviewService";

const mockGetDb = vi.mocked(getDb);
const mockRunLoop = vi.mocked(runProductReviewSequentialStoryboardSkillLoop);

/* -------------------------------------------------------------------------- */
/* Fixtures (§5.2 preamble — copied locally, not imported from another test   */
/* file, per section-08's own convention)                                     */
/* -------------------------------------------------------------------------- */

function buildSequentialPlanFixture(): any {
  return {
    conceptId: "concept-1",
    title: "รีวิวสินค้า",
    productTruth: {
      productId: "mp_1",
      productName: "Test Product",
      brand: "TestBrand",
      platform: "shopee",
      externalProductId: "ext_1",
      externalShopId: "shop_1",
      productCategory: "furniture",
      categoryText: "เฟอร์นิเจอร์",
      categoryPath: [],
      sourceUrl: "https://example.com/product",
      affiliateUrl: null,
      shopName: null,
      price: null,
      rating: null,
      sold: null,
      reviews: null,
      description: "Test product description",
      specs: {},
      imageUrls: ["https://example.com/product.png"],
    },
    storyboardGuide: "guide",
    voiceoverScript: "script",
    productDetail: "detail",
    shots: Array.from({ length: 9 }, (_, i) => ({
      id: `shot-${i + 1}`,
      order: i + 1,
      title: `Shot ${i + 1}`,
      startSeconds: i * 5,
      endSeconds: i * 5 + 5,
      durationSeconds: 5,
      storyboardGuide: "",
      voiceover: "",
      camera: "",
      visual: "",
      movement: "",
      productRole: "",
    })),
  };
}

function makeSequentialShot(
  shotId: number,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const startFrameImagePrompt =
    (overrides.start_frame_image_prompt as string) ??
    `Clean generic product shot for shot ${shotId}.`;
  const videoPrompt =
    (overrides.video_prompt as string) ??
    `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER}. Shot ${shotId} video action.`;
  return {
    shot_id: shotId,
    purpose: `beat_${shotId}`,
    duration_seconds: 5,
    demonstration_type: "usage_demo",
    depicts_minor: false,
    guardian_required: false,
    transition_from_previous: "",
    visual_summary: `shot ${shotId} visual summary`,
    dialogue: `บทพูดช็อตที่ ${shotId}`,
    estimated_speech_seconds: 1,
    image_prompt_character_count: startFrameImagePrompt.length,
    video_prompt_character_count: videoPrompt.length,
    claim_trace: [],
    qc: {},
    ...overrides,
    start_frame_image_prompt: startFrameImagePrompt,
    video_prompt: videoPrompt,
  };
}

/** RunMetadata with a complete §19.2 pack: 9 shots, empty shotOverrides,
 *  referenceManifest (primary + 2 angles + guardian), childSubjectPolicy,
 *  evidenceProfile.assembly_documented=false, loopReport rounds 1..3,
 *  directImageTasks with 9 completed refs, storyboardFrameUrls[0..8]. */
function buildRegenMetadataFixture(
  overrides: {
    metadata?: Record<string, unknown>;
    sequential?: Record<string, unknown>;
  } = {}
): any {
  const shots = Array.from({ length: 9 }, (_, i) => makeSequentialShot(i + 1));
  const baseSequential: Record<string, unknown> = {
    referenceManifest: [
      {
        index: 1,
        role: "primary_product",
        url: "https://cdn.example.test/product.png",
      },
      {
        index: 2,
        role: "product_angle",
        angleLabel: "back",
        url: "https://cdn.example.test/back.png",
      },
      {
        index: 3,
        role: "product_angle",
        angleLabel: "side",
        url: "https://cdn.example.test/side.png",
      },
      {
        index: 4,
        role: "character",
        url: "https://cdn.example.test/guardian.png",
      },
    ],
    childSubjectPolicy: {
      productChildRelated: false,
      childDepictionPlanned: false,
    },
    evidenceProfile: {
      assembly_documented: false,
      product_reference_model_conflict: null,
    },
    globalContinuity: {},
    shots,
    shotOverrides: {},
    loopReport: {
      round_1: { totalScore: 60 },
      round_2: { totalScore: 65 },
      round_3: { totalScore: 70 },
      selected_version: "round_3",
    },
    finalQc: {},
  };
  const base: Record<string, unknown> = {
    imageModel: "some-image-model",
    videoModel: "some-video-model",
    directImageTasks: Array.from({ length: 9 }, (_, i) => ({
      unitId: `sequential-shot-0${i + 1}`,
      mediaType: "image",
      stageKey: "image_generation",
      role: "sequential_shot_frame",
      shotId: `shot-${i + 1}`,
      shotOrder: i + 1,
      attempt: 1,
      taskId: `task-${i + 1}`,
      model: "some-image-model",
      status: "completed",
      resultUrl: `https://cdn.example.test/frame-${i + 1}.png`,
      submittedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:05.000Z",
    })),
    storyboardFrameUrls: Array.from(
      { length: 9 },
      (_, i) => `https://cdn.example.test/frame-${i + 1}.png`
    ),
  };
  return {
    ...base,
    ...(overrides.metadata ?? {}),
    sequentialStoryboard: { ...baseSequential, ...(overrides.sequential ?? {}) },
  };
}

function baseRunFixture(overrides: Record<string, unknown> = {}): any {
  return {
    id: "mar_1",
    tenantId: "tenant_1",
    productId: "mp_1",
    productionRunId: "prod_1",
    frameStrategy: "sequential_shot_storyboard",
    status: "running",
    outputMode: "storyboard_images",
    currentStage: "image_generation",
    storyboardReviewId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* -------------------------------------------------------------------------- */
/* T5 — regen re-runs exactly one unit                                        */
/* -------------------------------------------------------------------------- */

describe("T5 — buildSequentialShotRegenerationPlanForTest re-runs exactly one unit", () => {
  it("seeds unit sequential-shot-04, no repair directive, replaces pendingImageRepairUnits, leaves other units/frames untouched", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildRegenMetadataFixture();

    const result = buildSequentialShotRegenerationPlanForTest({
      metadata,
      plan,
      shotId: 4,
      requestedBy: "7",
      requestedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.unit.unitId).toBe("sequential-shot-04");
    expect(result.unit.role).toBe("sequential_shot_frame");
    expect(result.unit.shotOrder).toBe(4);
    expect(result.unit.repairInstruction).toBeUndefined();
    expect(result.unit.repairReasonCodes).toBeUndefined();
    expect(result.metadata.pendingImageRepairUnits).toHaveLength(1);
    expect(result.metadata.pendingImageRepairUnits?.[0]).toEqual(result.unit);

    // Every other unit's directImageTasks refs are identical (deep-equal,
    // including attempt) to the input fixture.
    expect(result.metadata.directImageTasks).toEqual(metadata.directImageTasks);

    // storyboardFrameUrls still holds all 9 previous URLs.
    expect(result.metadata.storyboardFrameUrls).toEqual(
      metadata.storyboardFrameUrls
    );
    expect(result.metadata.storyboardFrameUrls).toHaveLength(9);
  });

  it("throws NOT_FOUND when the plan has no shot at the requested order", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildRegenMetadataFixture();
    expect(() =>
      buildSequentialShotRegenerationPlanForTest({
        metadata,
        plan,
        shotId: 99,
        requestedBy: "7",
        requestedAt: "2026-01-01T00:00:00.000Z",
      })
    ).toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* T6 / T7 / T8 — resolveSequentialShotRegenerationOutcomeForTest (refresh)   */
/* -------------------------------------------------------------------------- */

describe("T6 — no loop re-run; refresh effect called at most once", () => {
  it("refreshPrompt: true, refresh succeeds -> effect called once; runProductReviewSequentialStoryboardSkillLoop never called; loopReport unchanged", async () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildRegenMetadataFixture();
    const refreshFn = vi.fn().mockResolvedValue({
      startFrameImagePrompt: "A fresh, valid, in-budget start frame prompt.",
      videoPrompt: `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER}. Refreshed video action.`,
      degraded: false,
    });

    const outcome = await resolveSequentialShotRegenerationOutcomeForTest({
      metadata,
      plan,
      shotId: 4,
      refreshPrompt: true,
      requestedBy: "7",
      requestedAt: "2026-01-01T00:00:00.000Z",
      imageBudget: 4000,
      currentStage: "image_generation",
      tenantId: "tenant_1",
      userId: 7,
      runId: "mar_1",
      effects: { refreshSequentialShotPromptWithSkill: refreshFn },
    });

    expect(refreshFn).toHaveBeenCalledTimes(1);
    expect(mockRunLoop).not.toHaveBeenCalled();
    expect(
      (outcome.metadata.sequentialStoryboard as any).loopReport
    ).toEqual((metadata.sequentialStoryboard as any).loopReport);
    expect(
      (outcome.metadata.sequentialStoryboard as any).loopReport.selected_version
    ).toBe("round_3");

    // Accepted candidate replaces shot 4's pack prompt (fail-open ACCEPT path).
    const shots = (outcome.metadata.sequentialStoryboard as any).shots;
    expect(shots[3].start_frame_image_prompt).toBe(
      "A fresh, valid, in-budget start frame prompt."
    );
    const lastRegen = (
      outcome.metadata.sequentialStoryboard as any
    ).shotRegenerations.at(-1);
    expect(lastRegen.promptSource).toBe("single_shot_refresh");
  });

  it("refreshPrompt: false (default) -> the refresh effect is not called at all", async () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildRegenMetadataFixture();
    const refreshFn = vi.fn();

    await resolveSequentialShotRegenerationOutcomeForTest({
      metadata,
      plan,
      shotId: 4,
      refreshPrompt: false,
      requestedBy: "7",
      requestedAt: "2026-01-01T00:00:00.000Z",
      imageBudget: 4000,
      currentStage: "image_generation",
      tenantId: "tenant_1",
      userId: 7,
      runId: "mar_1",
      effects: { refreshSequentialShotPromptWithSkill: refreshFn },
    });

    expect(refreshFn).not.toHaveBeenCalled();
    expect(mockRunLoop).not.toHaveBeenCalled();
  });
});

describe("T7 — refresh never overwrites a user edit", () => {
  it("a passing shotOverrides[4] -> refresh effect not invoked, override preserved byte-for-byte, promptSource: user_override", async () => {
    const plan = buildSequentialPlanFixture();
    const savedOverride = {
      start_frame_image_prompt: "The user's own saved override prompt.",
      editedAt: "2026-01-01T00:00:00.000Z",
      editedBy: "7",
    };
    const metadata = buildRegenMetadataFixture({
      sequential: { shotOverrides: { "4": savedOverride } },
    });
    const refreshFn = vi.fn();

    const outcome = await resolveSequentialShotRegenerationOutcomeForTest({
      metadata,
      plan,
      shotId: 4,
      refreshPrompt: true,
      requestedBy: "7",
      requestedAt: "2026-01-01T00:00:00.000Z",
      imageBudget: 4000,
      currentStage: "image_generation",
      tenantId: "tenant_1",
      userId: 7,
      runId: "mar_1",
      effects: { refreshSequentialShotPromptWithSkill: refreshFn },
    });

    expect(refreshFn).not.toHaveBeenCalled();
    expect(
      (outcome.metadata.sequentialStoryboard as any).shotOverrides["4"]
    ).toEqual(savedOverride);
    const lastRegen = (
      outcome.metadata.sequentialStoryboard as any
    ).shotRegenerations.at(-1);
    expect(lastRegen.promptSource).toBe("user_override");
  });
});

describe("T8 — refresh is fail-open", () => {
  it("a candidate that trips a shot-scoped blocker (over budget) is discarded; previous prompt kept; refreshRejectedBlockers recorded; regen still proceeds (no throw)", async () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildRegenMetadataFixture();
    const originalPrompt = (metadata.sequentialStoryboard as any).shots[3]
      .start_frame_image_prompt;
    const refreshFn = vi.fn().mockResolvedValue({
      startFrameImagePrompt: "a".repeat(5000), // over the 4000 budget
      videoPrompt: `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER}. ok.`,
      degraded: false,
    });

    const outcome = await resolveSequentialShotRegenerationOutcomeForTest({
      metadata,
      plan,
      shotId: 4,
      refreshPrompt: true,
      requestedBy: "7",
      requestedAt: "2026-01-01T00:00:00.000Z",
      imageBudget: 4000,
      currentStage: "image_generation",
      tenantId: "tenant_1",
      userId: 7,
      runId: "mar_1",
      effects: { refreshSequentialShotPromptWithSkill: refreshFn },
    });

    const shots = (outcome.metadata.sequentialStoryboard as any).shots;
    expect(shots[3].start_frame_image_prompt).toBe(originalPrompt);
    const lastRegen = (
      outcome.metadata.sequentialStoryboard as any
    ).shotRegenerations.at(-1);
    expect(lastRegen.refreshRejectedBlockers).toContain(
      "prompt_too_long_for_image_provider"
    );
    expect(lastRegen.promptSource).toBe("skill_pack");
    // Regen still proceeds — exactly one unit still seeded.
    expect(outcome.metadata.pendingImageRepairUnits).toHaveLength(1);
  });

  it("a thrown refresh error is swallowed (fail-open); regen still proceeds", async () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildRegenMetadataFixture();
    const originalPrompt = (metadata.sequentialStoryboard as any).shots[3]
      .start_frame_image_prompt;
    const refreshFn = vi.fn().mockRejectedValue(new Error("provider timeout"));

    const outcome = await resolveSequentialShotRegenerationOutcomeForTest({
      metadata,
      plan,
      shotId: 4,
      refreshPrompt: true,
      requestedBy: "7",
      requestedAt: "2026-01-01T00:00:00.000Z",
      imageBudget: 4000,
      currentStage: "image_generation",
      tenantId: "tenant_1",
      userId: 7,
      runId: "mar_1",
      effects: { refreshSequentialShotPromptWithSkill: refreshFn },
    });

    const shots = (outcome.metadata.sequentialStoryboard as any).shots;
    expect(shots[3].start_frame_image_prompt).toBe(originalPrompt);
    const lastRegen = (
      outcome.metadata.sequentialStoryboard as any
    ).shotRegenerations.at(-1);
    expect(lastRegen.refreshRejectedBlockers?.[0]).toContain("provider timeout");
    expect(outcome.metadata.pendingImageRepairUnits).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* T9 — override save happy path (pure)                                       */
/* -------------------------------------------------------------------------- */

describe("T9 — applySequentialShotOverrideToRunMetadataForTest", () => {
  it("writes shotOverrides['3'] with the edited fields; pack shots[] and unrelated metadata untouched", () => {
    const metadata = buildRegenMetadataFixture({
      metadata: { unrelatedTopLevelKey: "untouched" },
      sequential: { shotOverrides: { "5": { dialogue: "other shot" } } },
    });
    const originalShots = (metadata.sequentialStoryboard as any).shots;

    const next = applySequentialShotOverrideToRunMetadataForTest({
      metadata,
      shotId: 3,
      edit: {
        dialogue: "new dialogue",
        startFrameImagePrompt: "new image prompt",
      },
      editedBy: "7",
      editedAt: "2026-01-01T00:00:00.000Z",
    });

    expect((next.sequentialStoryboard as any).shotOverrides["3"]).toEqual({
      dialogue: "new dialogue",
      start_frame_image_prompt: "new image prompt",
      editedAt: "2026-01-01T00:00:00.000Z",
      editedBy: "7",
    });
    // Other shots' overrides untouched.
    expect((next.sequentialStoryboard as any).shotOverrides["5"]).toEqual({
      dialogue: "other shot",
    });
    // shots[] in the pack is untouched (overrides are a separate layer).
    expect((next.sequentialStoryboard as any).shots).toBe(originalShots);
    expect((next as any).unrelatedTopLevelKey).toBe("untouched");
  });

  it("clear variant (edit: null) deletes only that shot's key", () => {
    const metadata = buildRegenMetadataFixture({
      sequential: {
        shotOverrides: {
          "3": { dialogue: "to be cleared" },
          "5": { dialogue: "kept" },
        },
      },
    });
    const next = applySequentialShotOverrideToRunMetadataForTest({
      metadata,
      shotId: 3,
      edit: null,
      editedBy: "7",
      editedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(
      (next.sequentialStoryboard as any).shotOverrides["3"]
    ).toBeUndefined();
    expect((next.sequentialStoryboard as any).shotOverrides["5"]).toEqual({
      dialogue: "kept",
    });
  });
});

/* -------------------------------------------------------------------------- */
/* T10 / T11 — evaluateSequentialShotOverrideForTest                          */
/* -------------------------------------------------------------------------- */

describe("T10 — override rejection, one case per blocker family", () => {
  it("prompt_too_long_for_image_provider (incl. a provider cap < 4000 binding the limit)", () => {
    const metadata = buildRegenMetadataFixture();
    const result = evaluateSequentialShotOverrideForTest({
      metadata,
      shotId: 3,
      edit: { startFrameImagePrompt: "a".repeat(600) },
      imageBudget: 500, // simulates a binding provider cap below 4000
    });
    expect(result.blockers).toContain("prompt_too_long_for_image_provider");
  });

  it("prompt_too_long_for_video_provider (2001 chars)", () => {
    const metadata = buildRegenMetadataFixture();
    const result = evaluateSequentialShotOverrideForTest({
      metadata,
      shotId: 3,
      edit: {
        videoPrompt: `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER}. ${"a".repeat(2000)}`,
      },
      imageBudget: 4000,
    });
    expect(result.blockers).toContain("prompt_too_long_for_video_provider");
  });

  it("video_global_block_missing (video prompt without the frozen global-block marker)", () => {
    const metadata = buildRegenMetadataFixture();
    const result = evaluateSequentialShotOverrideForTest({
      metadata,
      shotId: 3,
      edit: { videoPrompt: "A short valid video prompt with no marker." },
      imageBudget: 4000,
    });
    expect(result.blockers).toContain("video_global_block_missing");
  });

  it("price_claim_detected (Thai discount claim)", () => {
    const metadata = buildRegenMetadataFixture();
    const result = evaluateSequentialShotOverrideForTest({
      metadata,
      shotId: 3,
      edit: { dialogue: "ลด 50% วันนี้เท่านั้น" },
      imageBudget: 4000,
    });
    expect(result.blockers).toContain("price_claim_detected");
  });

  it("price_claim_detected (numeric baht symbol)", () => {
    const metadata = buildRegenMetadataFixture();
    const result = evaluateSequentialShotOverrideForTest({
      metadata,
      shotId: 3,
      edit: { dialogue: "เพียง ฿199 เท่านั้น" },
      imageBudget: 4000,
    });
    expect(result.blockers).toContain("price_claim_detected");
  });

  it("dialogue_exceeds_shot_duration (Thai ~17 chars/s estimate over the 5s shot)", () => {
    const metadata = buildRegenMetadataFixture();
    const result = evaluateSequentialShotOverrideForTest({
      metadata,
      shotId: 3,
      edit: { dialogue: "ก".repeat(150) }, // ~8.8s > 5s
      imageBudget: 4000,
    });
    expect(result.blockers).toContain("dialogue_exceeds_shot_duration");
  });

  it("reference_index_mapping_mismatch (explicit @ImageN claim contradicting the manifest)", () => {
    const metadata = buildRegenMetadataFixture();
    const result = evaluateSequentialShotOverrideForTest({
      metadata,
      shotId: 3,
      edit: {
        startFrameImagePrompt:
          "@Image2 = guardian presenter reference. Clean generic shot.",
      },
      imageBudget: 4000,
    });
    expect(result.blockers).toContain("reference_index_mapping_mismatch");
  });

  it("whitespace-only edit -> sequential_prompt_set_incomplete (G10: the runner folds prompt_empty into this id; it never emits a bare prompt_empty)", () => {
    const metadata = buildRegenMetadataFixture();
    const result = evaluateSequentialShotOverrideForTest({
      metadata,
      shotId: 3,
      edit: { startFrameImagePrompt: "   " },
      imageBudget: 4000,
    });
    expect(result.blockers).toContain("sequential_prompt_set_incomplete");
  });

  it("a clean edit produces no blockers", () => {
    const metadata = buildRegenMetadataFixture();
    const result = evaluateSequentialShotOverrideForTest({
      metadata,
      shotId: 3,
      edit: {
        dialogue: "บทพูดใหม่ที่สั้นและปลอดภัย",
        startFrameImagePrompt: "A clean, valid, in-budget start frame prompt.",
        videoPrompt: `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER}. Clean video action.`,
      },
      imageBudget: 4000,
    });
    expect(result.blockers).toEqual([]);
  });
});

describe("T11 — cross-shot isolation of blockers", () => {
  it("shot 7 already broken in the persisted pack must NOT block a clean edit on shot 3", () => {
    const metadata = buildRegenMetadataFixture({
      sequential: {
        shots: Array.from({ length: 9 }, (_, i) =>
          makeSequentialShot(i + 1, {
            ...(i === 6
              ? { video_prompt: "video prompt missing the global block" }
              : {}),
          })
        ),
      },
    });
    const result = evaluateSequentialShotOverrideForTest({
      metadata,
      shotId: 3,
      edit: {
        startFrameImagePrompt: "A clean, valid, in-budget start frame prompt.",
      },
      imageBudget: 4000,
    });
    expect(result.blockers).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* T13 — override precedence at regeneration (via section-06's REAL           */
/* dispatcher, unmodified)                                                    */
/* -------------------------------------------------------------------------- */

describe("T13 — override precedence at regeneration", () => {
  it("shot 3 resolves to the override exactly; shots 1,2,4-9 resolve to their pack prompts", () => {
    const plan = buildSequentialPlanFixture();
    const overrideText =
      "Use @Image1 as the absolute product identity reference. Override prompt for shot 3.";
    const metadata = applySequentialShotOverrideToRunMetadataForTest({
      metadata: buildRegenMetadataFixture(),
      shotId: 3,
      edit: { startFrameImagePrompt: overrideText },
      editedBy: "7",
      editedAt: "2026-01-01T00:00:00.000Z",
    });

    for (let shotId = 1; shotId <= 9; shotId += 1) {
      const shot = plan.shots.find((s: any) => s.order === shotId);
      const unit = {
        unitId: `sequential-shot-0${shotId}`,
        role: "sequential_shot_frame" as const,
        shotId: shot.id,
        shotOrder: shot.order,
      };
      const prepared = prepareMarketplaceAutoReviewImagePromptForTest({
        plan,
        unit,
        metadata,
      });
      if (shotId === 3) {
        expect(prepared.prompt).toBe(overrideText);
      } else {
        const packEntry = (metadata.sequentialStoryboard as any).shots[
          shotId - 1
        ];
        expect(prepared.prompt).toBe(packEntry.start_frame_image_prompt);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* T14 — submit-time mapping re-validation still applies                      */
/* -------------------------------------------------------------------------- */

describe("T14 — submit-time mapping re-validation still applies (regen does not bypass it)", () => {
  it("a shot 4 override claiming @Image2 = guardian (contradicting the manifest) surfaces unmodified and section-06's guard rejects it", async () => {
    const plan = buildSequentialPlanFixture();
    const mismatchedPrompt =
      "@Image2 = guardian presenter reference. Use @Image1 as the absolute product identity reference. Clean generic shot.";
    const metadata = applySequentialShotOverrideToRunMetadataForTest({
      metadata: buildRegenMetadataFixture(),
      shotId: 4,
      edit: { startFrameImagePrompt: mismatchedPrompt },
      editedBy: "7",
      editedAt: "2026-01-01T00:00:00.000Z",
    });
    const shot4 = plan.shots.find((s: any) => s.order === 4);
    const unit = {
      unitId: "sequential-shot-04",
      role: "sequential_shot_frame" as const,
      shotId: shot4.id,
      shotOrder: shot4.order,
    };

    const submitPrepared = await prepareMarketplaceAutoReviewImagePromptForSubmitForTest({
      tenantId: "tenant_1",
      auth: { userId: 7, tenantId: "tenant_1" },
      runId: "mar_1",
      plan,
      unit,
      attempt: 1,
      overlayTextMode: "no_text",
      referenceImageGroups: {} as any,
      publicUrl: null,
      metadata,
    });
    // The override is surfaced UNMODIFIED — never silently rewritten.
    expect(submitPrepared.prompt).toContain("@Image2");
    expect(submitPrepared.prompt).toContain("guardian");

    const manifest = (metadata.sequentialStoryboard as any).referenceManifest;
    expect(() =>
      assertSequentialReferenceIndexMappingAtSubmitForTest({
        unitId: "sequential-shot-04",
        prompt: submitPrepared.prompt,
        manifest,
      })
    ).toThrow(/mapping mismatch/i);
  });
});

/* -------------------------------------------------------------------------- */
/* T15 — guards (pure precondition function)                                  */
/* -------------------------------------------------------------------------- */

describe("T15 — regeneration/save preconditions", () => {
  const plan = buildSequentialPlanFixture();
  const flagsOn = { marketplaceSequentialStoryboard: true };
  const flagsOff = { marketplaceSequentialStoryboard: false };

  it("non-sequential frameStrategy -> BAD_REQUEST", () => {
    expect(() =>
      assertSequentialShotRegenerationPreconditionsForTest({
        run: baseRunFixture({ frameStrategy: "storyboard_3x3_split" }),
        metadata: buildRegenMetadataFixture(),
        plan,
        shotId: 4,
        tenantFlags: flagsOn,
        includeSpendGuards: true,
      })
    ).toThrow(expect.objectContaining({ code: "BAD_REQUEST" }));
  });

  it("tenant flag off -> FORBIDDEN", () => {
    expect(() =>
      assertSequentialShotRegenerationPreconditionsForTest({
        run: baseRunFixture(),
        metadata: buildRegenMetadataFixture(),
        plan,
        shotId: 4,
        tenantFlags: flagsOff,
        includeSpendGuards: true,
      })
    ).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("status cancelled -> BAD_REQUEST; status failed -> BAD_REQUEST", () => {
    for (const status of ["cancelled", "failed"]) {
      expect(() =>
        assertSequentialShotRegenerationPreconditionsForTest({
          run: baseRunFixture({ status }),
          metadata: buildRegenMetadataFixture(),
          plan,
          shotId: 4,
          tenantFlags: flagsOn,
          includeSpendGuards: true,
        })
      ).toThrow(expect.objectContaining({ code: "BAD_REQUEST" }));
    }
  });

  it("status completed + full_video outputMode -> BAD_REQUEST (rejected)", () => {
    expect(() =>
      assertSequentialShotRegenerationPreconditionsForTest({
        run: baseRunFixture({ status: "completed", outputMode: "full_video" }),
        metadata: buildRegenMetadataFixture(),
        plan,
        shotId: 4,
        tenantFlags: flagsOn,
        includeSpendGuards: true,
      })
    ).toThrow(expect.objectContaining({ code: "BAD_REQUEST" }));
  });

  it("status completed + storyboard_images outputMode -> allowed (no throw)", () => {
    expect(() =>
      assertSequentialShotRegenerationPreconditionsForTest({
        run: baseRunFixture({
          status: "completed",
          outputMode: "storyboard_images",
          currentStage: "storyboard_review",
        }),
        metadata: buildRegenMetadataFixture(),
        plan,
        shotId: 4,
        tenantFlags: flagsOn,
        includeSpendGuards: true,
      })
    ).not.toThrow();
  });

  it("shotId beyond plan.shots.length -> NOT_FOUND (pack presence passes — 9 pack shots — but plan.shots itself is shorter)", () => {
    // Isolates step 6b (plan.shots.find) from step 6a (pack presence): the
    // persisted pack has all 9 shots (so 6a passes), but `plan.shots` — a
    // SEPARATE structure — only has 7, so shotId 8 is not found in it.
    const shortPlan = { ...plan, shots: plan.shots.slice(0, 7) };
    expect(() =>
      assertSequentialShotRegenerationPreconditionsForTest({
        run: baseRunFixture(),
        metadata: buildRegenMetadataFixture(),
        plan: shortPlan,
        shotId: 8,
        tenantFlags: flagsOn,
        includeSpendGuards: true,
      })
    ).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
  });

  it("no persisted pack yet -> BAD_REQUEST", () => {
    const metadata = buildRegenMetadataFixture({ sequential: { shots: [] } });
    expect(() =>
      assertSequentialShotRegenerationPreconditionsForTest({
        run: baseRunFixture(),
        metadata,
        plan,
        shotId: 4,
        tenantFlags: flagsOn,
        includeSpendGuards: true,
      })
    ).toThrow(expect.objectContaining({ code: "BAD_REQUEST" }));
  });

  it("a provider-reached, non-terminal ref for the target unit -> CONFLICT", () => {
    const metadata = buildRegenMetadataFixture({
      metadata: {
        directImageTasks: [
          {
            unitId: "sequential-shot-04",
            mediaType: "image",
            stageKey: "image_generation",
            role: "sequential_shot_frame",
            attempt: 1,
            taskId: "task-in-flight",
            model: "some-image-model",
            status: "processing",
            submittedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    expect(() =>
      assertSequentialShotRegenerationPreconditionsForTest({
        run: baseRunFixture(),
        metadata,
        plan,
        shotId: 4,
        tenantFlags: flagsOn,
        includeSpendGuards: true,
      })
    ).toThrow(expect.objectContaining({ code: "CONFLICT" }));
  });

  it("the in-flight guard is skipped when includeSpendGuards is false (save path is always allowed)", () => {
    const metadata = buildRegenMetadataFixture({
      metadata: {
        directImageTasks: [
          {
            unitId: "sequential-shot-04",
            mediaType: "image",
            stageKey: "image_generation",
            role: "sequential_shot_frame",
            attempt: 1,
            taskId: "task-in-flight",
            model: "some-image-model",
            status: "processing",
            submittedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    expect(() =>
      assertSequentialShotRegenerationPreconditionsForTest({
        run: baseRunFixture(),
        metadata,
        plan,
        shotId: 4,
        tenantFlags: flagsOn,
        includeSpendGuards: false,
      })
    ).not.toThrow();
  });

  it(`allowance exhausted (${MARKETPLACE_AUTO_REVIEW_SEQUENTIAL_MAX_USER_REGENERATIONS_PER_SHOT}) -> BAD_REQUEST`, () => {
    const metadata = buildRegenMetadataFixture({
      sequential: {
        userRegenerationAllowance: {
          "sequential-shot-04":
            MARKETPLACE_AUTO_REVIEW_SEQUENTIAL_MAX_USER_REGENERATIONS_PER_SHOT,
        },
      },
    });
    expect(() =>
      assertSequentialShotRegenerationPreconditionsForTest({
        run: baseRunFixture(),
        metadata,
        plan,
        shotId: 4,
        tenantFlags: flagsOn,
        includeSpendGuards: true,
      })
    ).toThrow(expect.objectContaining({ code: "BAD_REQUEST" }));
  });

  it("a clean run/shot with allowance below the cap passes every guard", () => {
    expect(() =>
      assertSequentialShotRegenerationPreconditionsForTest({
        run: baseRunFixture(),
        metadata: buildRegenMetadataFixture(),
        plan,
        shotId: 4,
        tenantFlags: flagsOn,
        includeSpendGuards: true,
      })
    ).not.toThrow();
  });
});

describe("T15 (DB-backed) — run not found -> NOT_FOUND, no provider call", () => {
  it("regenerateMarketplaceAutoReviewSequentialShot rejects NOT_FOUND when the run row does not exist", async () => {
    mockGetDb.mockResolvedValue({
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [] }) }),
      }),
    } as any);

    await expect(
      regenerateMarketplaceAutoReviewSequentialShot(
        { runId: "does-not-exist", shotId: 1 },
        { userId: 7, tenantId: "tenant_1" },
        {}
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

/* -------------------------------------------------------------------------- */
/* T16 — allowance arithmetic                                                 */
/* -------------------------------------------------------------------------- */

describe("T16 — allowance arithmetic", () => {
  it("after one regen, userRegenerationAllowance['sequential-shot-04'] === 1", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildRegenMetadataFixture();
    const result = buildSequentialShotRegenerationPlanForTest({
      metadata,
      plan,
      shotId: 4,
      requestedBy: "7",
      requestedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(
      (result.metadata.sequentialStoryboard as any).userRegenerationAllowance[
        "sequential-shot-04"
      ]
    ).toBe(1);
  });

  it("effective cap = policy cap + allowance; absent allowance is byte-identical to today's value for every strategy", () => {
    const metadataWithAllowance = buildRegenMetadataFixture({
      sequential: { userRegenerationAllowance: { "sequential-shot-04": 1 } },
    });
    const policy = effectiveQualityModePolicyForTest(metadataWithAllowance);

    const capWithAllowance = sequentialShotUnitAttemptCapForTest({
      metadata: metadataWithAllowance,
      unitId: "sequential-shot-04",
      effectiveMaxRepairAttemptsPerUnit: policy.maxRepairAttemptsPerUnit,
    });
    expect(capWithAllowance).toBe(policy.maxRepairAttemptsPerUnit + 1);

    // No allowance entry for THIS unit -> byte-identical, regardless of
    // strategy (the function does not branch on frameStrategy at all).
    const capNoAllowanceForOtherUnit = sequentialShotUnitAttemptCapForTest({
      metadata: metadataWithAllowance,
      unitId: "sequential-shot-05",
      effectiveMaxRepairAttemptsPerUnit: policy.maxRepairAttemptsPerUnit,
    });
    expect(capNoAllowanceForOtherUnit).toBe(policy.maxRepairAttemptsPerUnit);

    const capGridStrategy = sequentialShotUnitAttemptCapForTest({
      metadata: buildRegenMetadataFixture(),
      unitId: "storyboard-grid-image",
      effectiveMaxRepairAttemptsPerUnit: policy.maxRepairAttemptsPerUnit,
    });
    expect(capGridStrategy).toBe(policy.maxRepairAttemptsPerUnit);

    const capNoSequentialAtAll = sequentialShotUnitAttemptCapForTest({
      metadata: { imageModel: "x" } as any,
      unitId: "any-unit",
      effectiveMaxRepairAttemptsPerUnit: 3,
    });
    expect(capNoSequentialAtAll).toBe(3);
  });
});

/* -------------------------------------------------------------------------- */
/* T17 — storyboard-review reopen                                             */
/* -------------------------------------------------------------------------- */

describe("T17 — storyboard-review reopen (decision, pure/async)", () => {
  it("reopening=true when currentStage is storyboard_review; previousStoryboardReviewId recorded on the last shotRegenerations entry", async () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildRegenMetadataFixture();
    const outcome = await resolveSequentialShotRegenerationOutcomeForTest({
      metadata,
      plan,
      shotId: 4,
      refreshPrompt: false,
      requestedBy: "7",
      requestedAt: "2026-01-01T00:00:00.000Z",
      imageBudget: 4000,
      currentStage: "storyboard_review",
      previousStoryboardReviewId: "sbr_old_1",
      tenantId: "tenant_1",
      userId: 7,
      runId: "mar_1",
    });
    expect(outcome.reopening).toBe(true);
    const lastRegen = (
      outcome.metadata.sequentialStoryboard as any
    ).shotRegenerations.at(-1);
    expect(lastRegen.previousStoryboardReviewId).toBe("sbr_old_1");
  });

  it("reopening=false when currentStage is image_generation; no previousStoryboardReviewId recorded", async () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildRegenMetadataFixture();
    const outcome = await resolveSequentialShotRegenerationOutcomeForTest({
      metadata,
      plan,
      shotId: 4,
      refreshPrompt: false,
      requestedBy: "7",
      requestedAt: "2026-01-01T00:00:00.000Z",
      imageBudget: 4000,
      currentStage: "image_generation",
      previousStoryboardReviewId: "sbr_old_1",
      tenantId: "tenant_1",
      userId: 7,
      runId: "mar_1",
    });
    expect(outcome.reopening).toBe(false);
    const lastRegen = (
      outcome.metadata.sequentialStoryboard as any
    ).shotRegenerations.at(-1);
    expect(lastRegen.previousStoryboardReviewId).toBeUndefined();
  });
});

describe("T17 (DB-backed wiring) — regenerateMarketplaceAutoReviewSequentialShot persists the correct reopen fields before advancing", () => {
  function makeMockDb(input: {
    run: Record<string, unknown> | null;
    tenantFeatureFlags?: Record<string, boolean>;
  }) {
    const updateSpy = vi.fn();
    const chain = (table: unknown) => ({
      where: () => ({
        limit: async () => {
          if (table === marketplaceAutoReviewRuns)
            return input.run ? [input.run] : [];
          if (table === tenants)
            return input.tenantFeatureFlags
              ? [{ featureFlags: input.tenantFeatureFlags }]
              : [];
          return [];
        },
        orderBy: async () => [],
      }),
    });
    const select = vi.fn((_cols?: unknown) => ({
      from: (table: unknown) => chain(table),
    }));
    const update = vi.fn((_table: unknown) => ({
      set: (setObj: Record<string, unknown>) => {
        updateSpy(setObj);
        return {
          where: () => ({
            returning: async () =>
              input.run ? [{ ...input.run, ...setObj }] : [],
          }),
        };
      },
    }));
    const insert = vi.fn(() => ({
      values: () => ({
        onConflictDoUpdate: async () => undefined,
        onConflictDoNothing: async () => undefined,
      }),
    }));
    return { db: { select, update, insert } as any, updateSpy };
  }

  function runRowWithConcept(overrides: Record<string, unknown> = {}) {
    return baseRunFixture({
      metadataJson: {
        ...buildRegenMetadataFixture(),
        concept: buildSequentialPlanFixture(),
      },
      ...overrides,
    });
  }

  it("reopening: sets currentStage image_generation, status running, storyboardReviewId null", async () => {
    const run = runRowWithConcept({
      currentStage: "storyboard_review",
      storyboardReviewId: "sbr_old_1",
    });
    const { db, updateSpy } = makeMockDb({
      run,
      tenantFeatureFlags: { marketplaceSequentialStoryboard: true },
    });
    mockGetDb.mockResolvedValue(db);

    // The real, unmodified `advanceMarketplaceAutoReviewRun` runs afterward
    // (section 08 calls it verbatim, per §6.6 step 3) and is NOT mocked here
    // — its deep section-06 machinery (credits, media generation, product
    // access) is out of this section's scope and is not exercised by this
    // repo's own top-level SVC test suite either. We only assert on the
    // FIRST `db.update()` call, which happens synchronously before that.
    await regenerateMarketplaceAutoReviewSequentialShot(
      { runId: "mar_1", shotId: 4 },
      { userId: 7, tenantId: "tenant_1" },
      {}
    ).catch(() => {});

    expect(updateSpy).toHaveBeenCalled();
    const firstCall = updateSpy.mock.calls[0][0];
    expect(firstCall).toMatchObject({
      status: "running",
      currentStage: "image_generation",
      storyboardReviewId: null,
      completedAt: null,
    });
  });

  it("not reopening (still in image_generation): storyboardReviewId is omitted from the update set entirely", async () => {
    const run = runRowWithConcept({
      currentStage: "image_generation",
      storyboardReviewId: null,
    });
    const { db, updateSpy } = makeMockDb({
      run,
      tenantFeatureFlags: { marketplaceSequentialStoryboard: true },
    });
    mockGetDb.mockResolvedValue(db);

    await regenerateMarketplaceAutoReviewSequentialShot(
      { runId: "mar_1", shotId: 4 },
      { userId: 7, tenantId: "tenant_1" },
      {}
    ).catch(() => {});

    expect(updateSpy).toHaveBeenCalled();
    const firstCall = updateSpy.mock.calls[0][0];
    expect(firstCall.currentStage).toBe("image_generation");
    expect(firstCall.status).toBe("running");
    expect(Object.prototype.hasOwnProperty.call(firstCall, "storyboardReviewId")).toBe(
      false
    );
  });
});

/* -------------------------------------------------------------------------- */
/* T12 — override rejection is atomic and Thai                                */
/* -------------------------------------------------------------------------- */

describe("T12 — saveMarketplaceAutoReviewSequentialShotOverride rejection is atomic", () => {
  it("throws BAD_REQUEST with Thai copy + raw id list; updateRun not called; input metadata not mutated", async () => {
    const runMetadata = {
      ...buildRegenMetadataFixture(),
      concept: buildSequentialPlanFixture(),
    };
    const run = baseRunFixture({ metadataJson: runMetadata });
    const updateSpy = vi.fn();
    mockGetDb.mockResolvedValue({
      select: (_cols?: unknown) => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: async () => {
              if (table === marketplaceAutoReviewRuns) return [run];
              if (table === tenants)
                return [
                  { featureFlags: { marketplaceSequentialStoryboard: true } },
                ];
              return [];
            },
          }),
        }),
      }),
      update: (_table: unknown) => ({
        set: (setObj: Record<string, unknown>) => {
          updateSpy(setObj);
          return { where: () => ({ returning: async () => [run] }) };
        },
      }),
    } as any);

    const originalSnapshot = JSON.parse(JSON.stringify(runMetadata));

    await expect(
      saveMarketplaceAutoReviewSequentialShotOverride(
        { runId: "mar_1", shotId: 3, startFrameImagePrompt: "a".repeat(5000) },
        { userId: 7, tenantId: "tenant_1" }
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(updateSpy).not.toHaveBeenCalled();
    expect(runMetadata).toEqual(originalSnapshot);
  });

  it("a clean edit is saved and returned; a subsequent clear removes it", async () => {
    const runMetadata = {
      ...buildRegenMetadataFixture(),
      concept: buildSequentialPlanFixture(),
    };
    const run = baseRunFixture({ metadataJson: runMetadata });
    const updateSpy = vi.fn();
    mockGetDb.mockResolvedValue({
      select: (_cols?: unknown) => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: async () => {
              if (table === marketplaceAutoReviewRuns) return [run];
              if (table === tenants)
                return [
                  { featureFlags: { marketplaceSequentialStoryboard: true } },
                ];
              return [];
            },
          }),
        }),
      }),
      update: (_table: unknown) => ({
        set: (setObj: Record<string, unknown>) => {
          updateSpy(setObj);
          return { where: () => ({ returning: async () => [run] }) };
        },
      }),
    } as any);

    const result = await saveMarketplaceAutoReviewSequentialShotOverride(
      {
        runId: "mar_1",
        shotId: 3,
        startFrameImagePrompt: "A clean, valid, in-budget start frame prompt.",
      },
      { userId: 7, tenantId: "tenant_1" }
    );
    expect(result.shotId).toBe(3);
    expect(result.override?.start_frame_image_prompt).toBe(
      "A clean, valid, in-budget start frame prompt."
    );
    expect(updateSpy).toHaveBeenCalledTimes(1);

    const clearResult = await saveMarketplaceAutoReviewSequentialShotOverride(
      { runId: "mar_1", shotId: 3, clear: true },
      { userId: 7, tenantId: "tenant_1" }
    );
    expect(clearResult.override).toBeNull();
    expect(updateSpy).toHaveBeenCalledTimes(2);
  });
});
