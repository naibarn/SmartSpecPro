/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 06 §4. Tests T1–T10 for the 9-unit sequential image pipeline
 * (units, prompt dispatch, submission, per-unit QA/repair, stage gate,
 * storyboard-review handoff, resume, metrics ingredients).
 *
 * Spec: specs/feature/136-marketplace-auto-review-sequential-shot-storyboard/
 * sections/section-06-sequential-pipeline.md
 *
 * Convention: service tests exercise exported `...ForTest` helpers (no DB,
 * pure fixtures) — mirrors marketplaceAutoReviewService.test.ts.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => null),
}));

import {
  buildMarketplaceAutoReviewInitialImageUnitsForTest,
  directImageUnitIdForFrameRoleForTest,
  prepareMarketplaceAutoReviewImagePromptForTest,
  ensureTargetedRepairDirectiveInImagePromptForTest,
  resolveSequentialImageSubmitReferencePackageForTest,
  assertSequentialReferenceIndexMappingAtSubmitForTest,
  nextDirectAttemptForTest,
  buildMarketplaceAutoReviewShotFrameRepairUnitsForTest,
  filterMarketplaceAutoReviewImageRepairUnitsForTest,
  marketplaceAutoReviewImageUrlsFromDirectRefsForTest,
  marketplaceAutoReviewShotFrameCandidatesForStrategyForTest,
  buildSequentialShotFrameVisionQaContinuityLinesForTest,
  shotFrameVisionQaModeInstructionLineForTest,
  normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest,
  buildSequentialBestOfTwoCandidateUnitsForTest,
  resolveSequentialBestOfTwoSelectionForTest,
  marketplaceAutoReviewStoryboardFramesReadyForFrameStrategyForTest,
  hasMarketplaceAutoReviewMinimumImageAttemptsForTest,
  marketplaceAutoReviewImageRepairBudgetAllowsStoryboardReviewHandoffForTest,
  isMarketplaceAutoReviewImageRepairBudgetExhaustedForTest,
  buildMarketplaceAutoReviewStoryboardReviewOutputForTest,
  buildMarketplaceAutoReviewImageAttemptReviewsForTest,
  buildSequentialImageAttemptUnitOutcomesForTest,
  effectiveQualityModePolicyForTest,
  buildMarketplaceAutoReviewQualityModePolicyForTest,
  type MarketplaceAutoReviewFrameStrategy,
} from "../marketplaceAutoReviewService";

const basePlan = {
  conceptId: "concept-1",
  title: "รีวิวสินค้า",
  productTruth: {
    productId: "mp_1",
    productName: "Greenforst โต๊ะวางของข้างเตียง",
    brand: "Greenforst",
    platform: "shopee",
    externalProductId: "2162",
    externalShopId: "seller-1",
    productCategory: "furniture",
    categoryText: "เฟอร์นิเจอร์",
    categoryPath: ["บ้านและไลฟ์สไตล์", "เฟอร์นิเจอร์"],
    sourceUrl: "https://example.com/product",
    affiliateUrl: null,
    shopName: null,
    price: null,
    rating: null,
    sold: null,
    reviews: null,
    description: "",
    specs: {},
    imageUrls: ["https://example.com/product.png"],
  },
  storyboardGuide: "Shot-by-shot storyboard guide",
  voiceoverScript: "VOICEOVER SCRIPT BY SHOT",
  productDetail:
    "PRODUCT FACTS LOCK: Greenforst โต๊ะวางของข้างเตียง. Do not alter shape, material, or shelf count.",
  shots: [],
};

/** AutoReviewPlan with exactly 9 shots (order 1..9, stable ids). */
function buildSequentialPlanFixture(): any {
  return {
    ...basePlan,
    shots: Array.from({ length: 9 }, (_, index) => ({
      id: `shot-${index + 1}`,
      order: index + 1,
      title: `Shot ${index + 1}`,
      startSeconds: index * 5,
      endSeconds: (index + 1) * 5,
      durationSeconds: 5,
      storyboardGuide: `Shot ${index + 1} storyboard guide`,
      voiceover: `บทพูดช็อตที่ ${index + 1}`,
      camera: "slow push-in",
      visual: `ภาพช็อตที่ ${index + 1}`,
      movement: "slow push-in",
      productRole: "product proof",
    })),
  };
}

function buildSequentialReferenceManifestFixture() {
  return [
    {
      index: 1,
      role: "primary_product",
      url: "https://cdn.example.test/product-primary.png",
    },
    {
      index: 2,
      role: "product_angle",
      angleLabel: "front",
      url: "https://cdn.example.test/product-front.png",
    },
    {
      index: 3,
      role: "product_angle",
      angleLabel: "back",
      url: "https://cdn.example.test/product-back.png",
    },
    {
      index: 4,
      role: "product_angle",
      angleLabel: "parts_diagram",
      url: "https://cdn.example.test/product-parts.png",
      evidenceOnly: true,
    },
  ];
}

/** RunMetadata with a complete spec-§19.2 sequentialStoryboard pack. */
function buildSequentialMetadataFixture(overrides: Record<string, unknown> = {}) {
  const { sequentialStoryboard: sequentialOverridesRaw, ...topLevelOverrides } =
    overrides;
  const sequentialOverrides =
    (sequentialOverridesRaw as Record<string, unknown> | undefined) ?? {};
  return {
    imageModel: "test-image-model",
    qualityMode: "balanced",
    productReferenceAssetPack: {
      status: "ready",
      providerUsePolicy: "allowed",
      assetPackId: "product-pack-1",
      productId: "mp_1",
      selectedProductImageUrl: "https://example.com/product.png",
      selectedSource: "user_selected",
      primaryRef: "product-image:1:selected",
      supportingRefs: [],
      providerReferenceUrls: ["https://example.com/product.png"],
      sourceMetadata: {
        role: "product",
        source: "marketplace_product_image",
        uploadKey: "products/img_1.png",
        hash: "producthash",
        id: "img_1",
        verifiedProviderEvidence: {
          status: "verified",
          verifiedBy: "test",
          evidenceRef: "stored-product-image:1:test",
        },
      },
      auditRefs: ["product-image:1:selected", "product-image-sha256:product"],
      rejectedRefs: [],
      qaRefs: ["product-reference-qa:main"],
      requiredUserAction: null,
    },
    // Section 02 INPUT pack (raw attached angle images) — the resolver
    // reads from here, not from the OUTPUT `sequentialStoryboard.referenceManifest`
    // below (that is the already-resolved, persisted manifest).
    productAngleReferenceAssetPack: {
      entries: [
        {
          url: "https://cdn.example.test/product-front.png",
          ref: "angle-front-1",
          source: "upload",
          angleLabel: "front",
          evidenceOnly: false,
        },
        {
          url: "https://cdn.example.test/product-back.png",
          ref: "angle-back-1",
          source: "upload",
          angleLabel: "back",
          evidenceOnly: false,
        },
        {
          url: "https://cdn.example.test/product-parts.png",
          ref: "angle-parts-1",
          source: "upload",
          angleLabel: "parts_diagram",
          evidenceOnly: true,
        },
      ],
    },
    sequentialStoryboard: {
      shots: Array.from({ length: 9 }, (_, index) => ({
        shot_id: index + 1,
        purpose: `shot_${index + 1}`,
        duration_seconds: 5,
        demonstration_type: "usage_demo",
        depicts_minor: false,
        guardian_required: false,
        transition_from_previous: `transition into shot ${index + 1}`,
        visual_summary: `visual summary for shot ${index + 1}`,
        dialogue: `บทพูดช็อตที่ ${index + 1}`,
        estimated_speech_seconds: 2,
        start_frame_image_prompt: `Start frame prompt for shot ${index + 1} using @Image1 as the product truth.`,
        video_prompt: `Use @Image1 as the absolute product identity reference. Shot ${index + 1} video prompt.`,
        claim_trace: [],
      })),
      shotOverrides: {},
      referenceManifest: buildSequentialReferenceManifestFixture(),
      ...sequentialOverrides,
    },
    storyboardFrameUrls: [],
    ...topLevelOverrides,
  } as any;
}

/** DirectMediaTaskRef fixture. */
function buildDirectImageTaskRefFixture(
  unitId: string,
  overrides: Record<string, unknown> = {}
) {
  const shotOrder =
    (overrides.shotOrder as number | undefined) ??
    Number(unitId.replace("sequential-shot-", "")) ??
    1;
  return {
    unitId,
    mediaType: "image",
    stageKey: "image_generation",
    role: "sequential_shot_frame",
    shotId: `shot-${shotOrder}`,
    shotOrder,
    attempt: 1,
    taskId: `task-${unitId}`,
    model: "test-image-model",
    status: "completed",
    resultUrl: `https://cdn.example.test/${unitId}.png`,
    submittedAt: "2026-07-22T00:00:00.000Z",
    completedAt: "2026-07-22T00:00:05.000Z",
    ...overrides,
  } as any;
}

const SEQUENTIAL: MarketplaceAutoReviewFrameStrategy =
  "sequential_shot_storyboard" as any;
const GRID: MarketplaceAutoReviewFrameStrategy = "storyboard_3x3_split" as any;
const START_STOP: MarketplaceAutoReviewFrameStrategy =
  "video_shot_start_stop" as any;

describe("Feature 136 section 06 — T1 unit construction", () => {
  it("returns exactly 9 sequential units, zero-padded ascending ids, correct role/shot linkage", () => {
    const plan = buildSequentialPlanFixture();
    const units = buildMarketplaceAutoReviewInitialImageUnitsForTest({
      plan,
      frameStrategy: SEQUENTIAL,
    });

    expect(units).toHaveLength(9);
    units.forEach((unit, index) => {
      const n = String(index + 1).padStart(2, "0");
      expect(unit.unitId).toBe(`sequential-shot-${n}`);
      expect(unit.role).toBe("sequential_shot_frame");
      expect(unit.shotId).toBe(`shot-${index + 1}`);
      expect(unit.shotOrder).toBe(index + 1);
    });
  });

  it("owns the id scheme: directImageUnitIdForFrameRole agrees with buildInitialImageUnits for all 9 shots", () => {
    const plan = buildSequentialPlanFixture();
    const units = buildMarketplaceAutoReviewInitialImageUnitsForTest({
      plan,
      frameStrategy: SEQUENTIAL,
    });
    for (const shot of plan.shots) {
      const derivedId = directImageUnitIdForFrameRoleForTest({
        shot,
        role: "sequential_shot_frame",
      });
      const unitFromBuilder = units.find(u => u.shotOrder === shot.order);
      expect(unitFromBuilder?.unitId).toBe(derivedId);
    }
  });

  it("keeps storyboard_3x3_split behavior byte-identical (1 grid unit)", () => {
    const plan = buildSequentialPlanFixture();
    const units = buildMarketplaceAutoReviewInitialImageUnitsForTest({
      plan,
      frameStrategy: GRID,
    });
    expect(units).toEqual([
      { unitId: "storyboard-grid-image", role: "storyboard_grid" },
    ]);
  });

  it("keeps video_shot_start_stop behavior byte-identical (18 start/stop units)", () => {
    const plan = buildSequentialPlanFixture();
    const units = buildMarketplaceAutoReviewInitialImageUnitsForTest({
      plan,
      frameStrategy: START_STOP,
    });
    expect(units).toHaveLength(18);
    expect(units[0]).toEqual({
      unitId: "shot-1-start",
      role: "start_frame",
      shotId: "shot-1",
      shotOrder: 1,
    });
    expect(units[1]).toEqual({
      unitId: "shot-1-stop",
      role: "stop_frame",
      shotId: "shot-1",
      shotOrder: 1,
    });
  });
});

describe("Feature 136 section 06 — T2 prompt dispatch and overrides", () => {
  it("returns exactly sequentialStoryboard.shots[N-1].start_frame_image_prompt for unit N", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialMetadataFixture();
    const unit = {
      unitId: "sequential-shot-03",
      role: "sequential_shot_frame" as const,
      shotId: "shot-3",
      shotOrder: 3,
    };

    const prepared = prepareMarketplaceAutoReviewImagePromptForTest({
      plan,
      unit,
      metadata,
    });

    expect(prepared.prompt).toContain("Start frame prompt for shot 3");
  });

  it("honors shotOverrides[3].start_frame_image_prompt for unit 3 only", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialMetadataFixture({
      sequentialStoryboard: {
        shotOverrides: {
          "3": {
            start_frame_image_prompt: "OVERRIDDEN prompt for shot 3.",
          },
        },
      },
    });

    const unit3 = {
      unitId: "sequential-shot-03",
      role: "sequential_shot_frame" as const,
      shotId: "shot-3",
      shotOrder: 3,
    };
    const unit4 = {
      unitId: "sequential-shot-04",
      role: "sequential_shot_frame" as const,
      shotId: "shot-4",
      shotOrder: 4,
    };

    const prepared3 = prepareMarketplaceAutoReviewImagePromptForTest({
      plan,
      unit: unit3,
      metadata,
    });
    const prepared4 = prepareMarketplaceAutoReviewImagePromptForTest({
      plan,
      unit: unit4,
      metadata,
    });

    expect(prepared3.prompt).toContain("OVERRIDDEN prompt for shot 3");
    expect(prepared4.prompt).toContain("Start frame prompt for shot 4");
    expect(prepared4.prompt).not.toContain("OVERRIDDEN");
  });

  it("appends the targeted-repair directive exactly once (idempotent)", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialMetadataFixture();
    const unit = {
      unitId: "sequential-shot-05",
      role: "sequential_shot_frame" as const,
      shotId: "shot-5",
      shotOrder: 5,
      repairReasonCodes: ["product_reference_mismatch"],
      repairInstruction: "Fix the product proportions.",
    };

    const prepared = prepareMarketplaceAutoReviewImagePromptForTest({
      plan,
      unit,
      metadata,
    });

    const markerMatches = prepared.prompt.match(/TARGETED REPAIR/gi) ?? [];
    expect(markerMatches.length).toBe(1);

    // Re-running the existing idempotent appender against the already
    // repaired prompt must not add a second marker (precedent used by the
    // production code at submit time).
    const reApplied = ensureTargetedRepairDirectiveInImagePromptForTest(
      prepared.prompt,
      unit
    );
    const reAppliedMatches = reApplied.match(/TARGETED REPAIR/gi) ?? [];
    expect(reAppliedMatches.length).toBe(1);
  });

  it("throws naming the unit when the prompt is missing (no pack entry, no override)", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialMetadataFixture({
      sequentialStoryboard: {
        shots: Array.from({ length: 9 }, (_, index) => ({
          shot_id: index + 1,
          start_frame_image_prompt: index === 6 ? "" : `Prompt ${index + 1}`,
          video_prompt: "video",
          duration_seconds: 5,
          demonstration_type: "usage_demo",
          depicts_minor: false,
          guardian_required: false,
          dialogue: "",
          claim_trace: [],
        })),
      },
    });
    const unit = {
      unitId: "sequential-shot-07",
      role: "sequential_shot_frame" as const,
      shotId: "shot-7",
      shotOrder: 7,
    };

    expect(() =>
      prepareMarketplaceAutoReviewImagePromptForTest({ plan, unit, metadata })
    ).toThrow(/sequential-shot-07/);
  });
});

describe("Feature 136 section 06 — T3 submission payload", () => {
  it("resolves referenceImageUrls through the section-02 resolver (primary + angles, evidence-only excluded)", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialMetadataFixture();

    const resolved = resolveSequentialImageSubmitReferencePackageForTest({
      metadata,
      plan,
      imageModel: "test-image-model",
      publicUrl: "https://tenant.example.test",
    });

    expect(resolved.referenceImageUrls[0]).toBe(
      "https://example.com/product.png"
    );
    expect(resolved.referenceImageUrls).toContain(
      "https://cdn.example.test/product-front.png"
    );
    expect(resolved.referenceImageUrls).toContain(
      "https://cdn.example.test/product-back.png"
    );
    // parts_diagram is evidenceOnly — never attached to the provider.
    expect(resolved.referenceImageUrls).not.toContain(
      "https://cdn.example.test/product-parts.png"
    );
  });

  it("passes the persisted sequentialStoryboard.referenceManifest intact for extraParams", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialMetadataFixture();

    const resolved = resolveSequentialImageSubmitReferencePackageForTest({
      metadata,
      plan,
      imageModel: "test-image-model",
      publicUrl: "https://tenant.example.test",
    });

    // Passed intact: 4 entries, INCLUDING the evidence-only parts_diagram row.
    expect(resolved.persistedReferenceManifest).toHaveLength(4);
    expect(
      resolved.persistedReferenceManifest.some(entry => entry.evidenceOnly)
    ).toBe(true);
    expect(resolved.referenceImageRoleOrder).toEqual([
      "@Image1=primary_product",
      "@Image2=product_angle",
      "@Image3=product_angle",
      "@Image4=product_angle",
    ]);
    expect(resolved.referenceImageRoleCounts.product_angle).toBe(3);
  });

  it("submit-time re-validation throws fail-closed on a contradictory @ImageN role claim (no provider call)", () => {
    const manifest = buildSequentialReferenceManifestFixture();
    // Manifest says @Image2 is a product_angle (front); prompt explicitly
    // claims it is the guardian/character reference — a provable mismatch.
    const contradictoryPrompt =
      "Use the product from @Image1. @Image2 = guardian reference for the presenter, always keep the same identity.";

    expect(() =>
      assertSequentialReferenceIndexMappingAtSubmitForTest({
        unitId: "sequential-shot-01",
        prompt: contradictoryPrompt,
        manifest,
      })
    ).toThrow(/sequential-shot-01/);
  });

  it("submit-time re-validation does not throw for a clean, consistent prompt", () => {
    const manifest = buildSequentialReferenceManifestFixture();
    const cleanPrompt =
      "Use the product from @Image1 as the primary visual source of truth. Additional angles supplement it.";

    expect(() =>
      assertSequentialReferenceIndexMappingAtSubmitForTest({
        unitId: "sequential-shot-01",
        prompt: cleanPrompt,
        manifest,
      })
    ).not.toThrow();
  });
});

describe("Feature 136 section 06 — T4 per-unit attempts and resume", () => {
  it("counts attempts per unitId independently (unit 05 failure does not raise unit 06 attempt number)", () => {
    const refs = [
      buildDirectImageTaskRefFixture("sequential-shot-05", {
        attempt: 1,
        status: "failed",
        resultUrl: undefined,
      }),
      buildDirectImageTaskRefFixture("sequential-shot-06", {
        attempt: 1,
        status: "completed",
      }),
    ];

    expect(nextDirectAttemptForTest(refs, "sequential-shot-05")).toBe(2);
    expect(nextDirectAttemptForTest(refs, "sequential-shot-06")).toBe(2);
    // A brand-new unit with no refs at all always starts at attempt 1.
    expect(nextDirectAttemptForTest(refs, "sequential-shot-09")).toBe(1);
  });

  it("resume: shots with a present frame produce no repair unit; shots with an absent frame do (drives resubmission of only the missing units)", () => {
    const plan = buildSequentialPlanFixture();
    const completedShots = new Set([1, 2, 3, 4]);

    const repairUnits = plan.shots.flatMap((shot: any) => {
      const present = completedShots.has(shot.order);
      return buildMarketplaceAutoReviewShotFrameRepairUnitsForTest({
        shot,
        expectedFrameRoles: ["sequential_shot_frame"] as any,
        presentFrameRoles: present ? (["sequential_shot_frame"] as any) : [],
        qa: null,
      });
    });

    const repairUnitIds = repairUnits.map(unit => unit.unitId).sort();
    expect(repairUnitIds).toEqual([
      "sequential-shot-05",
      "sequential-shot-06",
      "sequential-shot-07",
      "sequential-shot-08",
      "sequential-shot-09",
    ]);
    // Every generated repair unit uses the SAME id builder as T1 (single
    // source — no unit for an already-completed shot 01-04 is present).
    for (const unit of repairUnits) {
      expect(unit.unitId).toMatch(/^sequential-shot-0[5-9]$/);
    }

    // Non-grid strategies pass repair units through unfiltered (§5.5, no
    // change) — proving the sequential fork reaches the same submission gate
    // the grid-only filter does not apply to.
    const filtered = filterMarketplaceAutoReviewImageRepairUnitsForTest({
      frameStrategy: SEQUENTIAL,
      pendingRepairUnits: repairUnits,
    });
    expect(filtered).toHaveLength(5);
  });
});

describe("Feature 136 section 06 — T5 result-URL mapping", () => {
  it("maps a completed sequential_shot_frame ref into storyboardFrameUrls[shotOrder-1]", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialMetadataFixture();
    const refs = [
      buildDirectImageTaskRefFixture("sequential-shot-01", {
        shotOrder: 1,
        resultUrl: "https://cdn.example.test/shot-1-final.png",
      }),
      buildDirectImageTaskRefFixture("sequential-shot-05", {
        shotOrder: 5,
        resultUrl: "https://cdn.example.test/shot-5-final.png",
      }),
    ];

    const result = marketplaceAutoReviewImageUrlsFromDirectRefsForTest({
      plan,
      metadata,
      refs,
      frameStrategy: SEQUENTIAL,
    });

    expect(result.storyboardFrameUrls?.[0]).toBe(
      "https://cdn.example.test/shot-1-final.png"
    );
    expect(result.storyboardFrameUrls?.[4]).toBe(
      "https://cdn.example.test/shot-5-final.png"
    );
  });

  it("keeps grid strategy mapping unchanged: a storyboard_frame ref never overrides storyboardFrameUrls (grid's array comes only from splitStoryboardGrid)", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialMetadataFixture({
      storyboardFrameUrls: ["https://cdn.example.test/split-shot-1.png"],
    });
    const refs = [
      {
        unitId: "shot-1-storyboard-repair",
        mediaType: "image",
        stageKey: "image_generation",
        role: "storyboard_frame",
        shotId: "shot-1",
        shotOrder: 1,
        attempt: 1,
        taskId: "task-1",
        model: "test-image-model",
        status: "completed",
        resultUrl: "https://cdn.example.test/stray-cell-repair.png",
        submittedAt: "2026-07-22T00:00:00.000Z",
      },
    ] as any;

    const result = marketplaceAutoReviewImageUrlsFromDirectRefsForTest({
      plan,
      metadata,
      refs,
      frameStrategy: GRID,
    });

    // unchanged: the previously split-derived value survives untouched.
    expect(result.storyboardFrameUrls?.[0]).toBe(
      "https://cdn.example.test/split-shot-1.png"
    );
  });

  it("keeps non-grid storyboard_frame override behavior unchanged (the flag is strategy-based, not role-based)", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialMetadataFixture();
    const refs = [
      {
        unitId: "shot-1-storyboard-repair",
        mediaType: "image",
        stageKey: "image_generation",
        role: "storyboard_frame",
        shotId: "shot-1",
        shotOrder: 1,
        attempt: 1,
        taskId: "task-1",
        model: "test-image-model",
        status: "completed",
        resultUrl: "https://cdn.example.test/non-grid-shot-1.png",
        submittedAt: "2026-07-22T00:00:00.000Z",
      },
    ] as any;

    const result = marketplaceAutoReviewImageUrlsFromDirectRefsForTest({
      plan,
      metadata,
      refs,
      frameStrategy: START_STOP,
    });

    expect(result.storyboardFrameUrls?.[0]).toBe(
      "https://cdn.example.test/non-grid-shot-1.png"
    );
  });
});

describe("Feature 136 section 06 — T6 QA routing", () => {
  it("builds a single sequential_shot_frame candidate for a sequential run (never grid)", () => {
    const metadata = buildSequentialMetadataFixture({
      storyboardFrameUrls: ["https://cdn.example.test/shot-1.png"],
    });

    const result = marketplaceAutoReviewShotFrameCandidatesForStrategyForTest({
      frameStrategy: SEQUENTIAL,
      metadata,
      index: 0,
    });

    expect(result.expectedFrameRoles).toEqual(["sequential_shot_frame"]);
    expect(result.frameCandidates).toEqual([
      {
        role: "sequential_shot_frame",
        url: "https://cdn.example.test/shot-1.png",
      },
    ]);
  });

  it("keeps grid and start/stop candidate selection unchanged", () => {
    const gridMetadata = buildSequentialMetadataFixture({
      storyboardFrameUrls: ["https://cdn.example.test/grid-shot-1.png"],
    });
    const gridResult = marketplaceAutoReviewShotFrameCandidatesForStrategyForTest(
      { frameStrategy: GRID, metadata: gridMetadata, index: 0 }
    );
    expect(gridResult.expectedFrameRoles).toEqual(["storyboard_frame"]);
    expect(gridResult.frameCandidates).toEqual([
      {
        role: "storyboard_frame",
        url: "https://cdn.example.test/grid-shot-1.png",
      },
    ]);

    const startStopMetadata = buildSequentialMetadataFixture({
      startFrameUrls: ["https://cdn.example.test/start-1.png"],
      stopFrameUrls: ["https://cdn.example.test/stop-1.png"],
    });
    const startStopResult =
      marketplaceAutoReviewShotFrameCandidatesForStrategyForTest({
        frameStrategy: START_STOP,
        metadata: startStopMetadata,
        index: 0,
      });
    expect(startStopResult.expectedFrameRoles).toEqual([
      "start_frame",
      "stop_frame",
    ]);
    expect(startStopResult.frameCandidates).toEqual([
      { role: "start_frame", url: "https://cdn.example.test/start-1.png" },
      { role: "stop_frame", url: "https://cdn.example.test/stop-1.png" },
    ]);
  });

  it("the sequential QA mode-instruction line names sequential_shot_frame only (no start/stop evaluation)", () => {
    const sequentialLine = shotFrameVisionQaModeInstructionLineForTest({
      frameRoles: ["sequential_shot_frame"] as any,
    });
    expect(sequentialLine).toContain("sequential_shot_frame");
    expect(sequentialLine).not.toBe(
      shotFrameVisionQaModeInstructionLineForTest({
        frameRoles: ["storyboard_frame"] as any,
      })
    );
    expect(sequentialLine).not.toBe(
      shotFrameVisionQaModeInstructionLineForTest({
        frameRoles: ["start_frame", "stop_frame"] as any,
      })
    );
  });

  it("adds sequential continuity + multi-angle fidelity criteria only for sequential frame roles", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialMetadataFixture();
    const shot = plan.shots[2];

    const sequentialLines = buildSequentialShotFrameVisionQaContinuityLinesForTest(
      {
        frameRoles: ["sequential_shot_frame"] as any,
        metadata,
        shot,
      }
    );
    expect(sequentialLines.length).toBeGreaterThan(0);
    expect(sequentialLines.join("\n")).toContain("visual_summary");
    expect(sequentialLines.join("\n")).toContain("transition_from_previous");
    expect(sequentialLines.join("\n")).toContain(
      "every attached product reference angle"
    );

    const gridLines = buildSequentialShotFrameVisionQaContinuityLinesForTest({
      frameRoles: ["storyboard_frame"] as any,
      metadata,
      shot,
    });
    expect(gridLines).toEqual([]);

    const startStopLines = buildSequentialShotFrameVisionQaContinuityLinesForTest(
      {
        frameRoles: ["start_frame", "stop_frame"] as any,
        metadata,
        shot,
      }
    );
    expect(startStopLines).toEqual([]);
  });

  it("folds continuityMatchesShot=false to storyboard_continuity_mismatch and productMatchesReference=false to product_reference_mismatch (existing codes reused)", () => {
    const plan = buildSequentialPlanFixture();
    const continuityResult =
      normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest({
        plan: plan as any,
        parsed: {
          verdict: "pass",
          score: 90,
          productMatchesReference: true,
          continuityMatchesShot: false,
          characterConsistencySafe: true,
          adWarningTextSafe: true,
          minorPresent: false,
          minorSafetyClothingSafe: true,
        },
        reasonCodes: [],
      });
    expect(continuityResult.verdict).toBe("repair");
    expect(continuityResult.reasonCodes).toContain(
      "storyboard_continuity_mismatch"
    );

    const productResult =
      normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest({
        plan: plan as any,
        parsed: {
          verdict: "pass",
          score: 90,
          productMatchesReference: false,
          continuityMatchesShot: true,
          characterConsistencySafe: true,
          adWarningTextSafe: true,
          minorPresent: false,
          minorSafetyClothingSafe: true,
        },
        reasonCodes: [],
      });
    expect(productResult.verdict).toBe("repair");
    expect(productResult.reasonCodes).toContain("product_reference_mismatch");
  });
});

describe("Feature 136 section 06 — T7 repair budget and best-of-2", () => {
  it("per-unit repair budget comes from effectiveQualityModePolicy(metadata).maxRepairAttemptsPerUnit", () => {
    const premiumMetadata = {
      qualityModePolicy: buildMarketplaceAutoReviewQualityModePolicyForTest({
        qualityMode: "premium_strict_qa",
      } as any),
    } as any;
    const policy = effectiveQualityModePolicyForTest(premiumMetadata);
    expect(policy.maxRepairAttemptsPerUnit).toBeGreaterThan(0);
  });

  it("schedules a second candidate for units 01-02 only under premium_strict_qa, after attempt 1 completes", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialMetadataFixture({
      qualityMode: "premium_strict_qa",
    });
    const refs = [
      buildDirectImageTaskRefFixture("sequential-shot-01", { attempt: 1 }),
      buildDirectImageTaskRefFixture("sequential-shot-02", { attempt: 1 }),
      buildDirectImageTaskRefFixture("sequential-shot-03", { attempt: 1 }),
    ];

    const candidates = buildSequentialBestOfTwoCandidateUnitsForTest({
      metadata,
      plan,
      refs,
    });

    expect(candidates.map(unit => unit.unitId).sort()).toEqual([
      "sequential-shot-01",
      "sequential-shot-02",
    ]);
    candidates.forEach(unit => {
      expect(unit.role).toBe("sequential_shot_frame");
    });
  });

  it("does not schedule a second candidate under balanced/fast_draft quality modes", () => {
    const plan = buildSequentialPlanFixture();
    const refs = [buildDirectImageTaskRefFixture("sequential-shot-01", { attempt: 1 })];

    for (const qualityMode of ["balanced", "fast_draft"]) {
      const metadata = buildSequentialMetadataFixture({ qualityMode });
      const candidates = buildSequentialBestOfTwoCandidateUnitsForTest({
        metadata,
        plan,
        refs,
      });
      expect(candidates).toEqual([]);
    }
  });

  it("does not re-request a candidate once a selection has already been decided", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialMetadataFixture({
      qualityMode: "premium_strict_qa",
      sequentialStoryboard: {
        unitCandidateSelections: {
          "sequential-shot-01": {
            selectedAttempt: 1,
            scores: { "1": 90, "2": 80 },
            decidedAt: "2026-07-22T00:00:00.000Z",
          },
        },
      },
    });
    const refs = [
      buildDirectImageTaskRefFixture("sequential-shot-01", { attempt: 1 }),
      buildDirectImageTaskRefFixture("sequential-shot-02", { attempt: 1 }),
    ];

    const candidates = buildSequentialBestOfTwoCandidateUnitsForTest({
      metadata,
      plan,
      refs,
    });

    expect(candidates.map(unit => unit.unitId)).toEqual([
      "sequential-shot-02",
    ]);
  });

  it("scores both attempts via buildImageAttemptScoreBreakdown and picks the higher-quality winner", () => {
    const attempt1Ref = buildDirectImageTaskRefFixture("sequential-shot-01", {
      attempt: 1,
      resultUrl: "https://cdn.example.test/shot-1-attempt-1.png",
    });
    const attempt2Ref = buildDirectImageTaskRefFixture("sequential-shot-01", {
      attempt: 2,
      resultUrl: "https://cdn.example.test/shot-1-attempt-2.png",
    });

    const decision = resolveSequentialBestOfTwoSelectionForTest({
      unitId: "sequential-shot-01",
      shotOrder: 1,
      attempt1: {
        ref: attempt1Ref,
        qa: { verdict: "pass", score: 70, reasonCodes: [] },
      },
      attempt2: {
        ref: attempt2Ref,
        qa: { verdict: "pass", score: 95, reasonCodes: [] },
      },
    });

    expect(decision.selectedAttempt).toBe(2);
    expect(decision.selectedUrl).toBe(
      "https://cdn.example.test/shot-1-attempt-2.png"
    );
    expect(decision.scores["2"]).toBeGreaterThan(decision.scores["1"]);
  });

  it("keeps attempt 1 as the winner on a tie or when attempt 2 scores lower", () => {
    const attempt1Ref = buildDirectImageTaskRefFixture("sequential-shot-02", {
      attempt: 1,
      resultUrl: "https://cdn.example.test/shot-2-attempt-1.png",
    });
    const attempt2Ref = buildDirectImageTaskRefFixture("sequential-shot-02", {
      attempt: 2,
      resultUrl: "https://cdn.example.test/shot-2-attempt-2.png",
    });

    const decision = resolveSequentialBestOfTwoSelectionForTest({
      unitId: "sequential-shot-02",
      shotOrder: 2,
      attempt1: {
        ref: attempt1Ref,
        qa: { verdict: "pass", score: 95, reasonCodes: [] },
      },
      attempt2: {
        ref: attempt2Ref,
        qa: { verdict: "repair", score: 40, reasonCodes: ["product_reference_mismatch"] },
      },
    });

    expect(decision.selectedAttempt).toBe(1);
    expect(decision.selectedUrl).toBe(
      "https://cdn.example.test/shot-2-attempt-1.png"
    );
  });
});

describe("Feature 136 section 06 — T8 stage gate", () => {
  it("minimumImageAttemptsReached is strategy-aware: sequential is never blocked by the grid-only >=3 rule", () => {
    const sequentialReached = hasMarketplaceAutoReviewMinimumImageAttemptsForTest(
      {
        metadata: { imageAttemptReviews: [{ attempt: 1, status: "passed" }] },
        frameStrategy: SEQUENTIAL,
      }
    );
    expect(sequentialReached).toBe(true);

    const startStopReached = hasMarketplaceAutoReviewMinimumImageAttemptsForTest(
      {
        metadata: { imageAttemptReviews: [{ attempt: 1, status: "passed" }] },
        frameStrategy: START_STOP,
      }
    );
    expect(startStopReached).toBe(true);
  });

  it("keeps grid semantics identical: requires >= 3 completed attempts", () => {
    const oneAttempt = hasMarketplaceAutoReviewMinimumImageAttemptsForTest({
      metadata: { imageAttemptReviews: [{ attempt: 1, status: "passed" }] },
      frameStrategy: GRID,
    });
    expect(oneAttempt).toBe(false);

    const threeAttempts = hasMarketplaceAutoReviewMinimumImageAttemptsForTest({
      metadata: {
        imageAttemptReviews: [
          { attempt: 1, status: "repair_required" },
          { attempt: 2, status: "repair_required" },
          { attempt: 3, status: "passed" },
        ],
      },
      frameStrategy: GRID,
    });
    expect(threeAttempts).toBe(true);
  });

  it("storyboardFramesReady reads storyboardFrameUrls for sequential (fixes a grid-only assumption), start/stop and grid stay unchanged", () => {
    const sequentialReady = marketplaceAutoReviewStoryboardFramesReadyForFrameStrategyForTest(
      {
        frameStrategy: SEQUENTIAL,
        metadata: {
          storyboardFrameUrls: Array.from(
            { length: 9 },
            (_, i) => `https://cdn.example.test/shot-${i + 1}.png`
          ),
        },
        expectedFrameCount: 9,
      }
    );
    expect(sequentialReady).toBe(true);

    // Sequential never populates startFrameUrls/stopFrameUrls — if the gate
    // still keyed off those arrays for anything other than start/stop, this
    // would incorrectly read false forever.
    const sequentialWithoutStartStopArrays =
      marketplaceAutoReviewStoryboardFramesReadyForFrameStrategyForTest({
        frameStrategy: SEQUENTIAL,
        metadata: {
          storyboardFrameUrls: Array.from(
            { length: 9 },
            (_, i) => `https://cdn.example.test/shot-${i + 1}.png`
          ),
          startFrameUrls: [],
          stopFrameUrls: [],
        },
        expectedFrameCount: 9,
      });
    expect(sequentialWithoutStartStopArrays).toBe(true);

    const gridReady = marketplaceAutoReviewStoryboardFramesReadyForFrameStrategyForTest(
      {
        frameStrategy: GRID,
        metadata: {
          storyboardFrameUrls: Array.from(
            { length: 9 },
            (_, i) => `https://cdn.example.test/shot-${i + 1}.png`
          ),
        },
        expectedFrameCount: 9,
      }
    );
    expect(gridReady).toBe(true);

    const startStopNotReady = marketplaceAutoReviewStoryboardFramesReadyForFrameStrategyForTest(
      {
        frameStrategy: START_STOP,
        metadata: {
          startFrameUrls: Array.from(
            { length: 9 },
            (_, i) => `https://cdn.example.test/start-${i + 1}.png`
          ),
          stopFrameUrls: [],
        },
        expectedFrameCount: 9,
      }
    );
    expect(startStopNotReady).toBe(false);
  });

  it("a publish-blocking code after repair-budget exhaustion is not handoff-eligible via warnings", () => {
    const repairUnits = [
      {
        unitId: "sequential-shot-04",
        role: "sequential_shot_frame",
        repairReasonCodes: ["minor_safety_child_clothing_unverified"],
      },
    ] as any;
    const budgetExhausted = isMarketplaceAutoReviewImageRepairBudgetExhaustedForTest(
      {
        repairUnits,
        refs: [
          buildDirectImageTaskRefFixture("sequential-shot-04", {
            attempt: 5,
            status: "completed",
          }),
        ],
        metadata: { qualityModePolicy: { maxRepairAttemptsPerUnit: 3 } },
      }
    );
    expect(budgetExhausted).toBe(true);
  });

  it("handoff is allowed once storyboardFrameUrls are complete, independent of start/stop arrays", () => {
    const handoffAllowed = marketplaceAutoReviewImageRepairBudgetAllowsStoryboardReviewHandoffForTest(
      {
        metadata: {
          storyboardFrameUrls: Array.from(
            { length: 9 },
            (_, i) => `https://cdn.example.test/shot-${i + 1}.png`
          ),
        },
        repairUnits: [],
        expectedFrameCount: 9,
      }
    );
    expect(handoffAllowed).toBe(true);
  });
});

describe("Feature 136 section 06 — T9 handoff", () => {
  it("passes 9 frame URLs in shot order into clips via buildStoryboardReviewOutput; no storyboardGridUrl is ever set", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialMetadataFixture({
      storyboardFrameUrls: Array.from(
        { length: 9 },
        (_, i) => `https://cdn.example.test/final-shot-${i + 1}.png`
      ),
    });
    const run = {
      id: "mar_seq_1",
      productionRunId: "prod_seq_1",
      outputMode: "storyboard_images",
      frameStrategy: "sequential_shot_storyboard",
      storyboardReviewId: null,
    } as any;

    const output = buildMarketplaceAutoReviewStoryboardReviewOutputForTest({
      run,
      plan,
      metadata,
    });

    expect(output.clips).toHaveLength(9);
    output.clips.forEach((clip: any, index: number) => {
      expect(clip.url).toBe(
        `https://cdn.example.test/final-shot-${index + 1}.png`
      );
      expect(clip.status).toBe("completed");
    });
    expect((metadata as any).storyboardGridUrl).toBeUndefined();
  });

  it("enriches clip metadata with frameStrategy, depictsMinor, guardianRequired, demonstrationType, and a claim-trace summary", () => {
    const plan = buildSequentialPlanFixture();
    const metadata = buildSequentialMetadataFixture({
      storyboardFrameUrls: Array.from(
        { length: 9 },
        (_, i) => `https://cdn.example.test/final-shot-${i + 1}.png`
      ),
      sequentialStoryboard: {
        shots: Array.from({ length: 9 }, (_, index) => ({
          shot_id: index + 1,
          duration_seconds: 5,
          demonstration_type:
            index === 0 ? "assembly_demo" : "usage_demo",
          depicts_minor: index === 0,
          guardian_required: index === 0,
          dialogue: "",
          start_frame_image_prompt: `prompt ${index + 1}`,
          video_prompt: "video",
          claim_trace:
            index === 0
              ? [{ text: "ประกอบง่ายใน 5 นาที", support: "visual_verified" }]
              : [],
        })),
      },
    });
    const run = {
      id: "mar_seq_2",
      productionRunId: "prod_seq_2",
      outputMode: "storyboard_images",
      frameStrategy: "sequential_shot_storyboard",
      storyboardReviewId: null,
    } as any;

    const output = buildMarketplaceAutoReviewStoryboardReviewOutputForTest({
      run,
      plan,
      metadata,
    });

    const firstClipMetadata = output.clips[0].metadata as any;
    expect(firstClipMetadata.frameStrategy).toBe("sequential_shot_storyboard");
    expect(firstClipMetadata.depictsMinor).toBe(true);
    expect(firstClipMetadata.guardianRequired).toBe(true);
    expect(firstClipMetadata.demonstrationType).toBe("assembly_demo");
    expect(firstClipMetadata.claimTraceSummary).toEqual([
      "ประกอบง่ายใน 5 นาที (visual_verified)",
    ]);

    const secondClipMetadata = output.clips[1].metadata as any;
    expect(secondClipMetadata.depictsMinor).toBe(false);
    expect(secondClipMetadata.claimTraceSummary).toEqual([]);
  });

  it("keeps grid/start-stop clip metadata additive-only (no depictsMinor/guardianRequired keys)", () => {
    const plan = { ...buildSequentialPlanFixture(), shots: [buildSequentialPlanFixture().shots[0]] };
    const metadata = { storyboardFrameUrls: ["https://cdn.example.test/grid-shot-1.png"] };
    const run = {
      id: "mar_grid_1",
      productionRunId: "prod_grid_1",
      outputMode: "storyboard_images",
      frameStrategy: "storyboard_3x3_split",
      storyboardReviewId: null,
    } as any;

    const output = buildMarketplaceAutoReviewStoryboardReviewOutputForTest({
      run,
      plan,
      metadata: metadata as any,
    });

    const clipMetadata = output.clips[0].metadata as any;
    expect(clipMetadata.frameStrategy).toBe("storyboard_3x3_split");
    expect(clipMetadata.depictsMinor).toBeUndefined();
    expect(clipMetadata.guardianRequired).toBeUndefined();
  });
});

describe("Feature 136 section 06 — T10 metrics ingredients", () => {
  it("tags imageAttemptReviews[] with frameStrategy for both grid and sequential", () => {
    const sequentialReviews = buildMarketplaceAutoReviewImageAttemptReviewsForTest(
      {
        metadata: {
          storyboardFrameUrls: Array.from(
            { length: 9 },
            (_, i) => `https://cdn.example.test/shot-${i + 1}.png`
          ),
        } as any,
        refs: Array.from({ length: 9 }, (_, i) =>
          buildDirectImageTaskRefFixture(
            `sequential-shot-${String(i + 1).padStart(2, "0")}`,
            { shotOrder: i + 1 }
          )
        ),
        status: "passed",
        expectedFrameCount: 9,
        frameStrategy: SEQUENTIAL,
      }
    );
    expect(sequentialReviews[0].frameStrategy).toBe(SEQUENTIAL);

    const gridReviews = buildMarketplaceAutoReviewImageAttemptReviewsForTest({
      metadata: {
        storyboardGridUrl: "https://cdn.example.test/grid.png",
      } as any,
      refs: [
        {
          unitId: "storyboard-grid-image",
          mediaType: "image",
          stageKey: "image_generation",
          role: "storyboard_grid",
          attempt: 1,
          taskId: "task-1",
          status: "completed",
          resultUrl: "https://cdn.example.test/grid.png",
          submittedAt: "2026-07-22T00:00:00.000Z",
        },
      ] as any,
      status: "passed",
      expectedFrameCount: 9,
      frameStrategy: GRID,
    });
    expect(gridReviews[0].frameStrategy).toBe(GRID);
  });

  it("includes a per-unit outcome summary for sequential runs (unitId, verdict, reasonCodes, repairAttempts, qualityScore)", () => {
    const refs = [
      buildDirectImageTaskRefFixture("sequential-shot-01", { attempt: 1 }),
      buildDirectImageTaskRefFixture("sequential-shot-02", {
        attempt: 2,
        status: "completed",
      }),
    ];
    const qaEnvelopes = [
      {
        shotId: "shot-1",
        verdict: "pass",
        reasonCodes: [],
        frameUrls: ["https://cdn.example.test/sequential-shot-01.png"],
      },
      {
        shotId: "shot-2",
        verdict: "repair",
        reasonCodes: ["product_reference_mismatch"],
        frameUrls: ["https://cdn.example.test/sequential-shot-02.png"],
      },
    ];

    const outcomes = buildSequentialImageAttemptUnitOutcomesForTest({
      refs,
      qaEnvelopes,
    });

    const shot1 = outcomes.find(o => o.unitId === "sequential-shot-01");
    const shot2 = outcomes.find(o => o.unitId === "sequential-shot-02");
    expect(shot1?.verdict).toBe("pass");
    expect(shot1?.reasonCodes).toEqual([]);
    expect(shot1?.repairAttempts).toBe(0);
    expect(typeof shot1?.qualityScore).toBe("number");

    expect(shot2?.verdict).toBe("repair");
    expect(shot2?.reasonCodes).toContain("product_reference_mismatch");
    expect(shot2?.repairAttempts).toBe(1);
  });
});

describe("Feature 136 section 06 — deliverable #11: partial-failure credit isolation", () => {
  it("a mid-stage hard block on one shot never produces a repair unit (and therefore never re-reserves credit) for an already-completed shot", () => {
    const plan = buildSequentialPlanFixture();
    // Shots 1-6 completed and QA-passed; shot 7 hard-blocked by a
    // publish-safety code after repair-budget exhaustion; shots 8-9 also
    // completed and passed. Only shot 7 should ever produce a repair unit.
    const completed = new Set([1, 2, 3, 4, 5, 6, 8, 9]);
    const repairUnits = plan.shots.flatMap((shot: any) => {
      const present = completed.has(shot.order);
      return buildMarketplaceAutoReviewShotFrameRepairUnitsForTest({
        shot,
        expectedFrameRoles: ["sequential_shot_frame"] as any,
        presentFrameRoles: present ? (["sequential_shot_frame"] as any) : [],
        qa: present
          ? {
              verdict: "pass",
              reasonCodes: [],
            }
          : null,
      });
    });

    expect(repairUnits).toHaveLength(1);
    expect(repairUnits[0].unitId).toBe("sequential-shot-07");

    // The completed refs for shots 1-6/8-9 are simply never referenced by
    // any repair unit — their credit fields (creditTransactionId etc.) are
    // therefore never touched by a subsequent scheduleImageAttempt pass,
    // which only submits/credits units present in `repairUnits`.
    const untouchedRefs = Array.from(completed).map(order =>
      buildDirectImageTaskRefFixture(
        `sequential-shot-${String(order).padStart(2, "0")}`,
        { shotOrder: order, creditTransactionId: 1000 + order }
      )
    );
    const repairUnitIds = new Set(repairUnits.map(unit => unit.unitId));
    for (const ref of untouchedRefs) {
      expect(repairUnitIds.has(ref.unitId)).toBe(false);
    }
  });
});
