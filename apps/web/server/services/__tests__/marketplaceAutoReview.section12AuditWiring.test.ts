/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * post-merge gap closure (implementation-gaps.md G22, "wire the remaining
 * audit events"). New, additive file — run alongside the existing section
 * 05/12 suites, never edits them.
 *
 * Covers the two G22 items that are safely wireable post-merge:
 *  1. `sequential_reference_angles_trimmed` now has a live call site inside
 *     `runSequentialPromptPlanStage` (§5.0), emitted once per run via the
 *     persisted `metadata.observability.emittedEventKeys` claim.
 *  2. The pre-Feature-136 3x3 optimizer wrapper
 *     (`optimizeMarketplaceAutoReviewFinalImagePromptForProvider`) now tags
 *     its audit payload with `promptKind: "grid_image"`, matching the shape
 *     its sequential sibling already carries.
 *
 * The THIRD G22 item (preflight-stage guard codes `guardian_directive_missing`
 * / `assembly_demo_unverified`) is deliberately NOT touched here — see the
 * conductor's report for why that reasoning still holds post-merge.
 *
 * Mocking style cloned from `marketplaceAutoReview.sequentialEvidencePersistence.test.ts`
 * (§5.0's own suite) + `marketplaceAutoReview.observability.test.ts` (the
 * `auditLogger` mock, required because the real logger silently no-ops
 * outside its own init path in Vitest).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../mediaProviderUtils", async () => {
  const actual = await vi.importActual<typeof import("../mediaProviderUtils")>(
    "../mediaProviderUtils"
  );
  return { ...actual, getReferenceImageLimitFromConfig: vi.fn(() => 5) };
});

vi.mock("../productReviewSequentialStoryboardSkillRunner", async () => {
  const actual = await vi.importActual<
    typeof import("../productReviewSequentialStoryboardSkillRunner")
  >("../productReviewSequentialStoryboardSkillRunner");
  return {
    ...actual,
    runProductReviewSequentialStoryboardSkillLoop: vi.fn(),
  };
});

import { auditLogger } from "../auditLogger";
import { getDb } from "../../db";
import { getReferenceImageLimitFromConfig } from "../mediaProviderUtils";
import {
  runProductReviewSequentialStoryboardSkillLoop,
  type SequentialStoryboardPack,
  type SequentialStoryboardShot,
} from "../productReviewSequentialStoryboardSkillRunner";
import {
  runSequentialPromptPlanStageForTest,
  optimizeMarketplaceAutoReviewFinalImagePromptForProviderForTest,
  marketplaceAutoReviewImagePromptMaxCharsForTest,
} from "../marketplaceAutoReviewService";
import { buildSequentialReferenceAnglesTrimmedDedupeKey } from "../marketplaceAutoReviewObservability";

const mockGetDb = vi.mocked(getDb);
const mockGetReferenceImageLimitFromConfig = vi.mocked(
  getReferenceImageLimitFromConfig
);
const mockRunLoop = vi.mocked(runProductReviewSequentialStoryboardSkillLoop);

/* -------------------------------------------------------------------------- */
/* Fixtures (cloned verbatim from the established section 02/05 test files)   */
/* -------------------------------------------------------------------------- */

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
    description: "โต๊ะไม้แท้คุณภาพดี",
    specs: {},
    imageUrls: ["https://example.com/product.png"],
  },
  storyboardGuide: "Shot-by-shot storyboard guide",
  voiceoverScript: "VOICEOVER SCRIPT BY SHOT",
  productDetail:
    "PRODUCT FACTS LOCK: Greenforst โต๊ะวางของข้างเตียง. Do not alter shape, material, or shelf count.",
  shots: [],
} as any;

const readyProductReferenceAssetPack = {
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
};

const readyCharacterIdentityAssetPack = {
  status: "ready",
  assetPackId: "character-pack-1",
  sourceKind: "uploaded_reference",
  referenceImageRefs: ["character-reference:abc"],
  referenceImageUrls: ["https://cdn.example.test/person.png"],
  sourceMetadata: {
    role: "character",
    source: "user_upload",
    uploadKey: "anchors/person.png",
    hash: "personhash",
    fileEvidence: { fileName: "person.png", fileType: "image/png" },
    verifiedProviderEvidence: {
      status: "verified",
      verifiedBy: "test",
      evidenceRef: "verified-upload-reference:character:test",
    },
  },
  auditRefs: ["character-reference:abc", "character-image-sha256:person"],
  consentRefs: ["character-consent:mar_1:user_supplied_reference"],
  allowedFaceUsage: "recurring",
  allowedVoiceUsage: "tts",
  continuityDescriptors: ["same approved presenter identity"],
  blockedRefs: [],
};

const readyEnvironmentReferenceAssetPack = {
  status: "ready",
  assetPackId: "environment-pack-1",
  sourceKind: "uploaded_reference",
  referenceImageRefs: ["environment-reference:abc"],
  referenceImageUrls: ["https://cdn.example.test/place.png"],
  sourceMetadata: {
    role: "environment",
    source: "user_upload",
    uploadKey: "anchors/place.png",
    hash: "placehash",
    fileEvidence: { fileName: "place.png", fileType: "image/png" },
    verifiedProviderEvidence: {
      status: "verified",
      verifiedBy: "test",
      evidenceRef: "verified-upload-reference:environment:test",
    },
  },
  auditRefs: ["environment-reference:abc", "environment-image-sha256:place"],
  providerUsePolicy: "style_layout_lighting_anchor",
  continuityDescriptors: ["same approved room lighting"],
  blockedRefs: [],
};

function angleEntry(overrides: Record<string, unknown> = {}) {
  return {
    url: "https://cdn.example.test/angle-default.png",
    ref: "product-image:angle-default",
    hash: "angledefaulthash",
    storageKey: null,
    source: "marketplace_product_image",
    angleLabel: "back",
    evidenceOnly: false,
    ...overrides,
  };
}

const guardianRequiredPolicy = {
  sequentialStoryboard: {
    childSubjectPolicy: { productChildRelated: true, childDepictionPlanned: true },
  },
};

function baseRunMetadata(overrides: Record<string, unknown> = {}) {
  return {
    imageModel: "some-image-model",
    videoModel: "some-video-model",
    resolvedAudioStrategy: "native_video_audio",
    overlayTextMode: "no_text",
    productReferenceAssetPack: readyProductReferenceAssetPack,
    referenceAnchors: {},
    ...overrides,
  } as any;
}

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-1",
    outputMode: "storyboard_images",
    frameStrategy: "sequential_shot_storyboard",
    tenantId: "tenant_1",
    productId: "product_1",
    ...overrides,
  } as any;
}

function makeCleanShot(shotId: number): SequentialStoryboardShot {
  return {
    shot_id: shotId,
    purpose: `beat_${shotId}`,
    duration_seconds: 5,
    demonstration_type: "usage_demo",
    depicts_minor: false,
    guardian_required: false,
    transition_from_previous: "",
    visual_summary: "shows the product in use",
    dialogue: "ใช้งานง่าย ทนทาน",
    estimated_speech_seconds: 1,
    start_frame_image_prompt: `Shot ${shotId} start frame, clean generic product shot.`,
    image_prompt_character_count: 40,
    video_prompt: `Use @Image1 as the absolute product identity reference. Shot ${shotId} video.`,
    video_prompt_character_count: 60,
    claim_trace: [{ text: "the product is easy to use", support: "visual_verified" }],
    qc: { evidence_accuracy: 9, continuity: 9, compliance: 9, length_valid: true, status: "pass" },
  };
}

function makeCleanPack(
  overrides: Partial<SequentialStoryboardPack> = {}
): SequentialStoryboardPack {
  const shots = Array.from({ length: 9 }, (_, i) => makeCleanShot(i + 1));
  return {
    skillVersion: "1.0.0",
    evidenceProfile: {
      assembly_documented: false,
      assembly_evidence: [],
      product_reference_model_conflict: null,
    },
    claimWhitelist: [],
    conflicts: [],
    reviewStrategy: {},
    childSubjectPolicy: {
      productChildRelated: false,
      childDepictionPlanned: false,
      guardianReferenceIndex: null,
      guardianPolicyActive: false,
    },
    globalContinuity: {},
    shots,
    loopReport: { selected_version: "round_1" },
    finalQc: {
      all_claims_supported: true,
      all_shots_under_10_seconds: true,
      hook_within_3_seconds: true,
      price_absent: true,
      overclaims_absent: true,
      all_image_prompts_within_budget: true,
      all_video_prompts_within_budget: true,
      global_block_present_in_every_video_prompt: true,
      guardian_policy_satisfied: true,
      tone_preset_adhered: true,
      structure_beats_present: true,
    },
    referenceManifest: [
      { index: 1, role: "primary_product", url: "https://example.com/product.png" },
    ],
    ...overrides,
  } as SequentialStoryboardPack;
}

/** Minimal fake drizzle chain: `db.update(t).set(x).where(y).returning()`. */
function makeMockDb() {
  const setCalls: Record<string, unknown>[] = [];
  const returning = vi.fn(async () => [{ id: "run-1" }]);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn((setObj: Record<string, unknown>) => {
    setCalls.push(setObj);
    return { where };
  });
  const update = vi.fn(() => ({ set }));
  return { db: { update } as any, setCalls, update, set, where, returning };
}

function mockLoopResolvesWith(pack: SequentialStoryboardPack) {
  mockRunLoop.mockResolvedValue({
    pack,
    loopReport: { selected_version: "round_1" } as any,
    selectedVersion: "round_1",
    degraded: false,
    preflight: { blockers: [], warnings: [], perShot: {} },
    retryHistory: [],
  });
}

function auditLogCallsFor(eventType: string): Record<string, any>[] {
  const calls = (auditLogger.log as unknown as { mock: { calls: any[][] } }).mock
    .calls;
  return calls.map(call => call[0]).filter(entry => entry.eventType === eventType);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetReferenceImageLimitFromConfig.mockReturnValue(5);
});

/* -------------------------------------------------------------------------- */
/* G22 item 1 — sequential_reference_angles_trimmed live call site            */
/* -------------------------------------------------------------------------- */

describe("runSequentialPromptPlanStage -> sequential_reference_angles_trimmed (G22 item 1)", () => {
  function trimmingMetadata(overrides: Record<string, unknown> = {}) {
    return baseRunMetadata({
      characterIdentityAssetPack: readyCharacterIdentityAssetPack,
      environmentReferenceAssetPack: readyEnvironmentReferenceAssetPack,
      ...guardianRequiredPolicy,
      productAngleReferenceAssetPack: {
        entries: [
          angleEntry({ url: "https://cdn.example.test/angle-1.png", ref: "angle-1", hash: "h1", angleLabel: "back" }),
          angleEntry({ url: "https://cdn.example.test/angle-2.png", ref: "angle-2", hash: "h2", angleLabel: "side" }),
          angleEntry({ url: "https://cdn.example.test/angle-3.png", ref: "angle-3", hash: "h3", angleLabel: "top" }),
          angleEntry({ url: "https://cdn.example.test/angle-4.png", ref: "angle-4", hash: "h4", angleLabel: "detail" }),
        ],
      },
      ...overrides,
    });
  }

  it("emits exactly once, with the correct shaped payload, and persists the claimed dedupe key onto metadata.observability", async () => {
    mockGetDb.mockResolvedValue(makeMockDb().db);
    mockLoopResolvesWith(makeCleanPack());

    const result = await runSequentialPromptPlanStageForTest({
      run: makeRun(),
      metadata: trimmingMetadata(),
      plan: basePlan,
      auth: { userId: 1, tenantId: "tenant_1" },
    });

    const calls = auditLogCallsFor("sequential_reference_angles_trimmed");
    expect(calls).toHaveLength(1);
    expect(calls[0].metadata.modelCap).toBe(5);
    expect(calls[0].metadata.attachedAngleCount).toBe(2);
    expect(calls[0].metadata.trimmedAngles).toEqual(
      expect.arrayContaining([
        { ref: "angle-3", angleLabel: "top" },
        { ref: "angle-4", angleLabel: "detail" },
      ])
    );
    expect(calls[0].metadata.reservedRoles).toEqual(
      expect.arrayContaining(["guardian", "environment"])
    );
    expect(calls[0].tenantId).toBe("tenant_1");

    const observability = (result as Record<string, unknown>).observability as Record<
      string,
      unknown
    >;
    const expectedKey = buildSequentialReferenceAnglesTrimmedDedupeKey({
      modelCap: 5,
      trimmedAngles: [{ ref: "angle-3" }, { ref: "angle-4" }],
    });
    expect(observability.emittedEventKeys).toContain(expectedKey);
  });

  it("does not emit when every angle candidate fits within the model cap (trimmedAngles empty)", async () => {
    mockGetDb.mockResolvedValue(makeMockDb().db);
    mockLoopResolvesWith(makeCleanPack());

    await runSequentialPromptPlanStageForTest({
      run: makeRun(),
      metadata: baseRunMetadata({
        productAngleReferenceAssetPack: {
          entries: [
            angleEntry({ url: "https://cdn.example.test/angle-1.png", ref: "angle-1", hash: "h1", angleLabel: "back" }),
          ],
        },
      }),
      plan: basePlan,
      auth: { userId: 1, tenantId: "tenant_1" },
    });

    expect(auditLogCallsFor("sequential_reference_angles_trimmed")).toHaveLength(0);
  });

  it("does not re-emit for the same trim signature once already claimed in persisted metadata.observability, even though the stage still reaches the resolver again (mid-loop resume)", async () => {
    mockGetDb.mockResolvedValue(makeMockDb().db);
    mockLoopResolvesWith(makeCleanPack());

    const preClaimedKey = buildSequentialReferenceAnglesTrimmedDedupeKey({
      modelCap: 5,
      trimmedAngles: [{ ref: "angle-3" }, { ref: "angle-4" }],
    });
    const metadata = trimmingMetadata({
      // Simulates a prior partial attempt: loopReport exists (not yet
      // finalQc-complete, so Step 2's idempotence check does NOT short-circuit
      // this call) and `observability` (TOP-LEVEL metadata field, same
      // convention as `applyMarketplaceAutoReviewModeMetricsToMetadata`)
      // already recorded the claim.
      sequentialStoryboard: {
        loopReport: { round_1: { totalScore: 40, valid: false } },
      },
      observability: { metricsVersion: 1, emittedEventKeys: [preClaimedKey] },
    });

    await runSequentialPromptPlanStageForTest({
      run: makeRun(),
      metadata,
      plan: basePlan,
      auth: { userId: 1, tenantId: "tenant_1" },
    });

    expect(mockRunLoop).toHaveBeenCalledTimes(1);
    expect(auditLogCallsFor("sequential_reference_angles_trimmed")).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* G22 item 2 — promptKind: "grid_image" on the 3x3 optimizer wrapper         */
/* -------------------------------------------------------------------------- */

describe("optimizeMarketplaceAutoReviewFinalImagePromptForProvider — promptKind (G22 item 2)", () => {
  it("tags the audit payload with promptKind: 'grid_image' (parity with the sequential sibling's promptKind field)", async () => {
    const maxChars = marketplaceAutoReviewImagePromptMaxCharsForTest();
    const overBudgetPrompt = "x".repeat(maxChars + 200);
    const optimizedPrompt = "short optimized prompt";
    const optimizer = vi.fn(async () => ({
      execution: {
        runtime: {
          status: "completed",
          selection: { engine: "shared_skill_text_runtime", mode: "llm" },
          requestId: "req-1",
          traceId: "trace-1",
        },
      },
      value: {
        rawContent: optimizedPrompt,
        usage: { promptTokens: 1, completionTokens: 1 },
        creditsUsed: 1,
        modelId: "optimizer-model",
        providerName: "optimizer-provider",
      },
      preferredTargetChars: maxChars,
      llmMaxTokens: 800,
      promptLengthPlan: null,
      systemPromptLengthChars: 10,
      userPromptLengthChars: 10,
    }));

    const result = await optimizeMarketplaceAutoReviewFinalImagePromptForProviderForTest({
      tenantId: "tenant-1",
      userId: 1,
      runId: "run-1",
      unitId: "shot-1-start",
      attempt: 1,
      promptAttempt: null,
      sourcePrompt: overBudgetPrompt,
      optimizer: optimizer as any,
    });

    expect(optimizer).toHaveBeenCalledTimes(1);
    expect(result.audit).not.toBeNull();
    expect(result.audit?.promptKind).toBe("grid_image");
    expect(result.audit?.reason).toBe("final_image_prompt_over_provider_budget");
  });

  it("byte-identical when the prompt is already within budget: audit stays null, promptKind is never fabricated", async () => {
    const shortPrompt = "a short prompt within budget";
    const optimizer = vi.fn();

    const result = await optimizeMarketplaceAutoReviewFinalImagePromptForProviderForTest({
      tenantId: "tenant-1",
      userId: 1,
      runId: "run-1",
      unitId: "shot-1-start",
      attempt: 1,
      promptAttempt: null,
      sourcePrompt: shortPrompt,
      optimizer: optimizer as any,
    });

    expect(optimizer).not.toHaveBeenCalled();
    expect(result.audit).toBeNull();
    expect(result.prompt).toBe(shortPrompt);
  });
});
