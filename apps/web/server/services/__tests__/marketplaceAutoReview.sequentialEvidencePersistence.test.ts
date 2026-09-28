/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 05. TDD suite for:
 *  - §5.0 `runSequentialPromptPlanStage` (+ `...ForTest`) — the prompt_plan
 *    call site that actually invokes the section-04 runner.
 *  - §5.1 `applySequentialStoryboardPackToRunMetadata` (+ `...ForTest`) —
 *    non-destructive persistence transformer.
 *  - §5.2 `computeMarketplaceAutoReviewChildSubjectPolicy` (+ `...ForTest`
 *    and its direct export, G4 precedent) — facts-only child-subject policy.
 *  - §5.3 claim-whitelist -> `claimEvidenceMapping.blockedClaims` fold.
 *  - G7 (implementation-gaps.md) — SVC infers the product category and
 *    passes it into the section-04 runner's loop input.
 *
 * `getDb` is mocked with a FUNCTIONAL fake (not `null`, unlike most section
 * 01/02 tests) because §5.0's `persistRoundReport` effect must exercise a
 * real `db.update(...).set(...).where(...).returning()` write for the
 * per-round durability test. `productReviewSequentialStoryboardSkillRunner`
 * is mocked at the `runProductReviewSequentialStoryboardSkillLoop` export
 * only (via `vi.importActual` passthrough for everything else, incl. the
 * real `SequentialStoryboardStructuralError` class so `instanceof` checks in
 * SVC still work). `getReferenceImageLimitFromConfig` is mocked so the
 * capacity-failure test does not depend on real static model registry data.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

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

import { getDb } from "../../db";
import { getReferenceImageLimitFromConfig } from "../mediaProviderUtils";
import {
  runProductReviewSequentialStoryboardSkillLoop,
  SequentialStoryboardStructuralError,
  type SequentialStoryboardPack,
  type SequentialStoryboardShot,
} from "../productReviewSequentialStoryboardSkillRunner";
import {
  applySequentialStoryboardPackToRunMetadataForTest,
  computeMarketplaceAutoReviewChildSubjectPolicy,
  computeMarketplaceAutoReviewChildSubjectPolicyForTest,
  runSequentialPromptPlanStageForTest,
  buildMarketplaceAutoReview3x3StoryboardPromptForTest,
} from "../marketplaceAutoReviewService";

const mockGetDb = vi.mocked(getDb);
const mockGetReferenceImageLimitFromConfig = vi.mocked(
  getReferenceImageLimitFromConfig
);
const mockRunLoop = vi.mocked(runProductReviewSequentialStoryboardSkillLoop);

/* -------------------------------------------------------------------------- */
/* Fixtures (cloned from the established repo convention — see               */
/* marketplaceAutoReview.sequentialReferences.test.ts's own header comment)   */
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
  overrides: Partial<SequentialStoryboardPack> = {},
  shotCount = 9
): SequentialStoryboardPack {
  const shots = Array.from({ length: shotCount }, (_, i) => makeCleanShot(i + 1));
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

beforeEach(() => {
  vi.clearAllMocks();
  mockGetReferenceImageLimitFromConfig.mockReturnValue(5);
});

/* -------------------------------------------------------------------------- */
/* §5.2 computeMarketplaceAutoReviewChildSubjectPolicy                        */
/* -------------------------------------------------------------------------- */

describe("computeMarketplaceAutoReviewChildSubjectPolicy (§5.2)", () => {
  it("mother_baby category -> productChildRelated: true", () => {
    const policy = computeMarketplaceAutoReviewChildSubjectPolicyForTest({
      categoryText: "mother_baby",
      productTexts: ["โต๊ะเปลี่ยนผ้าอ้อม"],
    });
    expect(policy.productChildRelated).toBe(true);
  });

  it("non-child category + minor-safety text signal -> true", () => {
    const policy = computeMarketplaceAutoReviewChildSubjectPolicyForTest({
      categoryText: "furniture",
      productTexts: ["รถเข็นเด็กพับได้ น้ำหนักเบา"],
    });
    expect(policy.productChildRelated).toBe(true);
  });

  it("negated minor-safety mention -> false (reuses the shared negation stripper)", () => {
    const policy = computeMarketplaceAutoReviewChildSubjectPolicyForTest({
      categoryText: "furniture",
      productTexts: ["โต๊ะทำงาน ไม่มีเด็กในภาพ เหมาะกับผู้ใหญ่เท่านั้น"],
    });
    expect(policy.productChildRelated).toBe(false);
  });

  it("childDepictionPlanned: true when any shot has depicts_minor true", () => {
    const policy = computeMarketplaceAutoReviewChildSubjectPolicyForTest({
      categoryText: "mother_baby",
      productTexts: [],
      shots: [{ depicts_minor: false }, { depicts_minor: true }],
    });
    expect(policy.childDepictionPlanned).toBe(true);
  });

  it("childDepictionPlanned: false when shots is omitted (pre-skill call)", () => {
    const policy = computeMarketplaceAutoReviewChildSubjectPolicyForTest({
      categoryText: "mother_baby",
      productTexts: [],
    });
    expect(policy.childDepictionPlanned).toBe(false);
  });

  it("guardianReferenceRef threads through from the resolved character anchor when provided", () => {
    const policy = computeMarketplaceAutoReviewChildSubjectPolicyForTest({
      categoryText: "furniture",
      productTexts: [],
      guardianReferenceRef: "character-reference:abc",
    });
    expect(policy.guardianReferenceRef).toBe("character-reference:abc");
  });

  it("guardrail: does not modify the shared minor-safety lock — an existing non-child 3x3 fixture still produces no lock", () => {
    // `buildMarketplaceAutoReview3x3StoryboardPromptForTest` calls
    // `buildMinorSafetyClothingLock`, which calls
    // `marketplaceAutoReviewPlanNeedsMinorSafetyLock` — this is a
    // regression tripwire proving section 05 never touched that function.
    const prompt = buildMarketplaceAutoReview3x3StoryboardPromptForTest({
      plan: basePlan,
      overlayTextMode: "no_text",
    });
    expect(prompt).not.toContain("MINOR SAFETY CLOTHING LOCK");
  });

  it("is exported directly (not merely a ...ForTest alias) for cross-module use (G4 precedent)", () => {
    expect(typeof computeMarketplaceAutoReviewChildSubjectPolicy).toBe("function");
    expect(computeMarketplaceAutoReviewChildSubjectPolicyForTest).toBe(
      computeMarketplaceAutoReviewChildSubjectPolicy
    );
  });
});

/* -------------------------------------------------------------------------- */
/* §5.1 applySequentialStoryboardPackToRunMetadata + §5.3 claim fold          */
/* -------------------------------------------------------------------------- */

describe("applySequentialStoryboardPackToRunMetadata (§5.1)", () => {
  it("pack persistence shape: stores every §19.2 field and preserves loopReport/shotOverrides byte-for-byte (non-destructive merge)", () => {
    const metadata = baseRunMetadata({
      unrelatedTopLevelKey: "untouched",
      sequentialStoryboard: {
        loopReport: {
          round_1: { evidence_accuracy: 8, totalScore: 64, valid: true },
          round_2: { evidence_accuracy: 9, totalScore: 70, valid: true },
          round_3: { evidence_accuracy: 9, totalScore: 72, valid: true },
        },
        shotOverrides: { "1": { dialogue: "overridden dialogue" } },
      },
    });
    const pack = makeCleanPack();
    const policy = { productChildRelated: false, childDepictionPlanned: false };

    const next = applySequentialStoryboardPackToRunMetadataForTest({
      metadata,
      pack,
      referenceManifest: [
        { index: 1, role: "primary_product" },
      ] as any,
      childSubjectPolicy: policy,
    });

    expect(next.unrelatedTopLevelKey).toBe("untouched");
    const seq = next.sequentialStoryboard as Record<string, unknown>;
    expect(seq.evidenceProfile).toEqual(pack.evidenceProfile);
    expect((seq.evidenceProfile as any).assembly_documented).toBe(false);
    expect(seq.claimWhitelist).toEqual([]);
    expect(seq.conflicts).toEqual([]);
    expect(seq.reviewStrategy).toEqual({});
    expect(seq.globalContinuity).toEqual({});
    expect(seq.shots).toEqual(pack.shots);
    expect(seq.finalQc).toEqual(pack.finalQc);
    expect(seq.referenceManifest).toEqual([{ index: 1, role: "primary_product" }]);
    expect(seq.skillVersion).toBe("1.0.0");
    expect(seq.childSubjectPolicy).toEqual(policy);

    // Byte-for-byte preserved (non-destructive merge).
    expect((seq.loopReport as any).round_1).toEqual({
      evidence_accuracy: 8,
      totalScore: 64,
      valid: true,
    });
    expect((seq.loopReport as any).round_2).toEqual({
      evidence_accuracy: 9,
      totalScore: 70,
      valid: true,
    });
    expect((seq.loopReport as any).round_3).toEqual({
      evidence_accuracy: 9,
      totalScore: 72,
      valid: true,
    });
    expect(seq.shotOverrides).toEqual({ "1": { dialogue: "overridden dialogue" } });
  });

  it("claim fold — gate-neutral exclusions: excluded/conflicting claims fold to status 'omitted' (never gates paid stages)", () => {
    const metadata = baseRunMetadata();
    const pack = makeCleanPack({
      claimWhitelist: [{ text: "กันน้ำ 100%", confidence: "unsupported" }],
      conflicts: [
        {
          attribute: "สี",
          claimed_value: "สีเทา",
          visual_finding: "สีน้ำตาล",
          resolution: "excluded",
        },
      ],
      evidenceProfile: {
        assembly_documented: false,
        assembly_evidence: [],
        product_reference_model_conflict: null,
        excluded_claims: [{ text: "ลดราคาพิเศษ", reason: "price_claim" }],
      } as any,
    });

    const next = applySequentialStoryboardPackToRunMetadataForTest({
      metadata,
      pack,
      referenceManifest: [] as any,
      childSubjectPolicy: { productChildRelated: false, childDepictionPlanned: false },
    });

    const blockedClaims = (next.claimEvidenceMapping as any).blockedClaims as Array<
      Record<string, unknown>
    >;
    expect(blockedClaims.length).toBe(3);
    for (const claim of blockedClaims) {
      // status "omitted" is unconditionally excluded from the counted set
      // that gates paid stages (SVC blockedClaimEvidenceCount, unmodified).
      expect(claim.status).toBe("omitted");
    }
    expect(blockedClaims.map(c => c.claimText)).toEqual(
      expect.arrayContaining(["กันน้ำ 100%", "สีเทา", "ลดราคาพิเศษ"])
    );
  });

  it("claim fold — gate-enforcing violations: a prohibited claim surviving into final shots produces status 'blocked' and a positive gate-relevant count", () => {
    const metadata = baseRunMetadata();
    const survivingClaimText = "รักษาอาการปวดหลังให้หายขาด";
    const pack = makeCleanPack({
      evidenceProfile: {
        assembly_documented: false,
        assembly_evidence: [],
        product_reference_model_conflict: null,
        excluded_claims: [{ text: survivingClaimText, reason: "medical_claim" }],
      } as any,
      shots: [
        { ...makeCleanShot(1), dialogue: `สินค้านี้${survivingClaimText}แน่นอน` },
        ...Array.from({ length: 8 }, (_, i) => makeCleanShot(i + 2)),
      ],
    });

    const next = applySequentialStoryboardPackToRunMetadataForTest({
      metadata,
      pack,
      referenceManifest: [] as any,
      childSubjectPolicy: { productChildRelated: false, childDepictionPlanned: false },
    });

    const blockedClaims = (next.claimEvidenceMapping as any).blockedClaims as Array<
      Record<string, unknown>
    >;
    const violation = blockedClaims.find(c => c.claimText === survivingClaimText);
    expect(violation?.status).toBe("blocked");
    expect(
      blockedClaims.filter(c =>
        ["blocked", "requires_approval", "repair_required"].includes(
          String(c.status)
        )
      ).length
    ).toBeGreaterThan(0);
  });

  it("confirmedAttributes upgrade: a conflicting attribute covered by confirmedAttributes is stored user_confirmed with NO blockedClaims entry; without the confirmation it stays out of claimWhitelist and records an omitted entry", () => {
    const conflictingText = "รับน้ำหนักได้ 50 กก.";
    const packWithoutConfirmation = makeCleanPack({
      claimWhitelist: [],
      conflicts: [
        {
          attribute: "น้ำหนักที่รับได้",
          claimed_value: conflictingText,
          resolution: "pending",
        },
      ],
    });
    const withoutConfirmation = applySequentialStoryboardPackToRunMetadataForTest({
      metadata: baseRunMetadata(),
      pack: packWithoutConfirmation,
      referenceManifest: [] as any,
      childSubjectPolicy: { productChildRelated: false, childDepictionPlanned: false },
    });
    const withoutSeq = withoutConfirmation.sequentialStoryboard as Record<string, unknown>;
    expect(
      (withoutSeq.claimWhitelist as unknown[]).some(
        entry => (entry as any).text === conflictingText
      )
    ).toBe(false);
    const withoutBlocked = (withoutConfirmation.claimEvidenceMapping as any)
      .blockedClaims as Array<Record<string, unknown>>;
    expect(withoutBlocked.some(c => c.claimText === conflictingText && c.status === "omitted")).toBe(
      true
    );
    // Fixture-level scan: the conflicting text never appears in any stored prompt/dialogue.
    for (const shot of packWithoutConfirmation.shots) {
      expect(shot.dialogue).not.toContain(conflictingText);
      expect(shot.start_frame_image_prompt).not.toContain(conflictingText);
      expect(shot.video_prompt).not.toContain(conflictingText);
    }

    const packWithConfirmation = makeCleanPack({
      claimWhitelist: [{ text: conflictingText, confidence: "conflicting" }],
      conflicts: [],
    });
    const withConfirmation = applySequentialStoryboardPackToRunMetadataForTest({
      metadata: baseRunMetadata({
        sequentialStoryboard: {
          userInputs: { confirmedAttributes: { น้ำหนักที่รับได้: conflictingText } },
        },
      }),
      pack: packWithConfirmation,
      referenceManifest: [] as any,
      childSubjectPolicy: { productChildRelated: false, childDepictionPlanned: false },
    });
    const withSeq = withConfirmation.sequentialStoryboard as Record<string, unknown>;
    const upgradedEntry = (withSeq.claimWhitelist as unknown[]).find(
      entry => (entry as any).text === conflictingText
    ) as Record<string, unknown> | undefined;
    expect(upgradedEntry?.confidence).toBe("user_confirmed");
    const withBlocked = (withConfirmation.claimEvidenceMapping as any)
      .blockedClaims as Array<Record<string, unknown>>;
    expect(withBlocked.some(c => c.claimText === conflictingText)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* §5.0 runSequentialPromptPlanStage                                          */
/* -------------------------------------------------------------------------- */

describe("runSequentialPromptPlanStage (§5.0)", () => {
  it("non-sequential run -> returns the input metadata object unchanged (identity), runner mock not called", async () => {
    mockGetDb.mockResolvedValue(makeMockDb().db);
    const metadata = baseRunMetadata();
    const result = await runSequentialPromptPlanStageForTest({
      run: makeRun({ frameStrategy: "storyboard_3x3_split" }),
      metadata,
      plan: basePlan,
      auth: { userId: 1, tenantId: "tenant_1" },
    });
    expect(result).toBe(metadata);
    expect(mockRunLoop).not.toHaveBeenCalled();
  });

  it("sequential run -> runner called exactly once; input carries the step-3 manifest and the step-4 policy with childDepictionPlanned: false", async () => {
    mockGetDb.mockResolvedValue(makeMockDb().db);
    mockRunLoop.mockResolvedValue({
      pack: makeCleanPack(),
      loopReport: { selected_version: "round_1" } as any,
      selectedVersion: "round_1",
      degraded: false,
      preflight: { blockers: [], warnings: [], perShot: {} },
      retryHistory: [],
    });

    await runSequentialPromptPlanStageForTest({
      run: makeRun(),
      metadata: baseRunMetadata(),
      plan: basePlan,
      auth: { userId: 1, tenantId: "tenant_1" },
    });

    expect(mockRunLoop).toHaveBeenCalledTimes(1);
    const [loopInput] = mockRunLoop.mock.calls[0];
    expect(loopInput.referenceManifest).toEqual([
      {
        index: 1,
        role: "primary_product",
        url: "https://example.com/product.png",
      },
    ]);
    expect(loopInput.childSubjectPolicy.childDepictionPlanned).toBe(false);
    // G7 — the inferred category is threaded into the runner's input.
    expect(loopInput.productCategory).toBe("furniture");
  });

  it("Feature 136 section 13 — threads metadata.imageModel and metadata.startFramePromptStyle into the runner's loop input", async () => {
    mockGetDb.mockResolvedValue(makeMockDb().db);
    mockRunLoop.mockResolvedValue({
      pack: makeCleanPack(),
      loopReport: { selected_version: "round_1" } as any,
      selectedVersion: "round_1",
      degraded: false,
      preflight: { blockers: [], warnings: [], perShot: {} },
      retryHistory: [],
    });

    await runSequentialPromptPlanStageForTest({
      run: makeRun(),
      metadata: baseRunMetadata({
        imageModel: "google-nano-banana-pro",
        startFramePromptStyle: "cinematic_auto",
      }),
      plan: basePlan,
      auth: { userId: 1, tenantId: "tenant_1" },
    });

    expect(mockRunLoop).toHaveBeenCalledTimes(1);
    const [loopInput] = mockRunLoop.mock.calls[0];
    expect(loopInput.imageModel).toBe("google-nano-banana-pro");
    expect(loopInput.startFramePromptStyle).toBe("cinematic_auto");
  });

  it("Feature 136 section 13 — an invalid/absent metadata.startFramePromptStyle threads through as undefined (byte-identical default path)", async () => {
    mockGetDb.mockResolvedValue(makeMockDb().db);
    mockRunLoop.mockResolvedValue({
      pack: makeCleanPack(),
      loopReport: { selected_version: "round_1" } as any,
      selectedVersion: "round_1",
      degraded: false,
      preflight: { blockers: [], warnings: [], perShot: {} },
      retryHistory: [],
    });

    await runSequentialPromptPlanStageForTest({
      run: makeRun(),
      metadata: baseRunMetadata(),
      plan: basePlan,
      auth: { userId: 1, tenantId: "tenant_1" },
    });

    const [loopInput] = mockRunLoop.mock.calls[0];
    expect(loopInput.startFramePromptStyle).toBeUndefined();
  });

  it("capacity failure (guardian required, cap 1) -> throws before the runner mock is called (no LLM spend)", async () => {
    mockGetDb.mockResolvedValue(makeMockDb().db);
    mockGetReferenceImageLimitFromConfig.mockReturnValue(1);
    const metadata = baseRunMetadata({
      characterIdentityAssetPack: {
        status: "ready",
        referenceImageUrls: ["https://cdn.example.test/person.png"],
        sourceMetadata: {},
        auditRefs: [],
      },
      sequentialStoryboard: {
        childSubjectPolicy: { productChildRelated: true, childDepictionPlanned: true },
      },
    });

    await expect(
      runSequentialPromptPlanStageForTest({
        run: makeRun(),
        metadata,
        plan: basePlan,
        auth: { userId: 1, tenantId: "tenant_1" },
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mockRunLoop).not.toHaveBeenCalled();
  });

  it("persistRoundReport writes to the DB per round, ordered before the next invokeSkillRound (mocked at the loop boundary)", async () => {
    const mockDb = makeMockDb();
    mockGetDb.mockResolvedValue(mockDb.db);
    const callLog: string[] = [];

    mockRunLoop.mockImplementation(async (_loopInput, effectsOverride) => {
      for (const round of [1, 2, 3] as const) {
        callLog.push(`invoke:${round}`);
        await effectsOverride?.persistRoundReport?.(round, {
          round,
          totalScore: 60,
          normalizedScore: 75,
          valid: true,
          disqualifiers: [],
          retained: round === 3,
        } as any);
        callLog.push(`persist:${round}`);
      }
      return {
        pack: makeCleanPack(),
        loopReport: { selected_version: "round_3" } as any,
        selectedVersion: "round_3",
        degraded: false,
        preflight: { blockers: [], warnings: [], perShot: {} },
        retryHistory: [],
      };
    });

    await runSequentialPromptPlanStageForTest({
      run: makeRun(),
      metadata: baseRunMetadata(),
      plan: basePlan,
      auth: { userId: 1, tenantId: "tenant_1" },
    });

    expect(callLog).toEqual([
      "invoke:1",
      "persist:1",
      "invoke:2",
      "persist:2",
      "invoke:3",
      "persist:3",
    ]);
    // One DB write per round.
    expect(mockDb.update).toHaveBeenCalledTimes(3);
    expect(
      (mockDb.setCalls[0].metadataJson as any).sequentialStoryboard.loopReport
        .round_1
    ).toBeTruthy();
    expect(
      (mockDb.setCalls[2].metadataJson as any).sequentialStoryboard.loopReport
        .round_3
    ).toBeTruthy();
  });

  it("completed pack already in metadata -> runner not called (idempotent resume)", async () => {
    mockGetDb.mockResolvedValue(makeMockDb().db);
    const metadata = baseRunMetadata({
      sequentialStoryboard: {
        finalQc: makeCleanPack().finalQc,
        shots: makeCleanPack().shots,
      },
    });

    const result = await runSequentialPromptPlanStageForTest({
      run: makeRun(),
      metadata,
      plan: basePlan,
      auth: { userId: 1, tenantId: "tenant_1" },
    });

    expect(result).toBe(metadata);
    expect(mockRunLoop).not.toHaveBeenCalled();
  });

  it("partial loopReport only (no finalQc) -> runner IS called (not treated as a completed resume)", async () => {
    mockGetDb.mockResolvedValue(makeMockDb().db);
    mockRunLoop.mockResolvedValue({
      pack: makeCleanPack(),
      loopReport: { selected_version: "round_1" } as any,
      selectedVersion: "round_1",
      degraded: false,
      preflight: { blockers: [], warnings: [], perShot: {} },
      retryHistory: [],
    });
    const metadata = baseRunMetadata({
      sequentialStoryboard: {
        loopReport: { round_1: { totalScore: 40, valid: false } },
      },
    });

    await runSequentialPromptPlanStageForTest({
      run: makeRun(),
      metadata,
      plan: basePlan,
      auth: { userId: 1, tenantId: "tenant_1" },
    });

    expect(mockRunLoop).toHaveBeenCalledTimes(1);
  });

  it("mapping mismatch surviving the corrective retry -> throws, nothing further persisted", async () => {
    mockGetDb.mockResolvedValue(makeMockDb().db);
    const mismatchedShot = {
      ...makeCleanShot(1),
      start_frame_image_prompt:
        "@Image1 = guardian presenter. Clean generic product shot.",
    };
    const mismatchedPack = makeCleanPack({
      shots: [mismatchedShot, ...Array.from({ length: 8 }, (_, i) => makeCleanShot(i + 2))],
    });
    mockRunLoop.mockResolvedValue({
      pack: mismatchedPack,
      loopReport: { selected_version: "round_1" } as any,
      selectedVersion: "round_1",
      degraded: false,
      preflight: { blockers: [], warnings: [], perShot: {} },
      retryHistory: [],
    });

    await expect(
      runSequentialPromptPlanStageForTest({
        run: makeRun(),
        metadata: baseRunMetadata(),
        plan: basePlan,
        auth: { userId: 1, tenantId: "tenant_1" },
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    // Initial call + exactly one corrective retry.
    expect(mockRunLoop).toHaveBeenCalledTimes(2);
  });

  // 2026-07-24 field follow-up (mar_76cb03fe0f29a20ec6422480f5a6840b): this
  // used to assert on a fabricated 9-shot deterministic pack
  // (`buildDegradedSequentialStoryboardPack`, now deleted). The run now
  // holds with NO shots at all and a classified `draftFailure.reasonCode`
  // instead — see classifySequentialStoryboardDraftFailureReason's own
  // dedicated test file, marketplaceAutoReview.draftFailureClassifier.test.ts.
  it("SequentialStoryboardStructuralError -> no fabricated shots persisted; draftFailure classified, audit emitted, no throw", async () => {
    mockGetDb.mockResolvedValue(makeMockDb().db);
    mockRunLoop.mockRejectedValue(
      new SequentialStoryboardStructuralError("every round failed", [])
    );
    const auditSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await runSequentialPromptPlanStageForTest({
      run: makeRun(),
      metadata: baseRunMetadata(),
      plan: basePlan,
      auth: { userId: 1, tenantId: "tenant_1" },
    });

    const seq = result.sequentialStoryboard as Record<string, unknown>;
    expect(seq.degraded).toBe(true);
    expect(seq.shots).toBeUndefined();
    expect(seq.draftFailure).toEqual({
      reasonCode: "unknown",
      failedAt: expect.any(String),
      roundsAttempted: 0,
    });
    expect(
      auditSpy.mock.calls.some(call =>
        String(call[0]).includes("sequential_prompt_degraded_fallback")
      )
    ).toBe(true);
    auditSpy.mockRestore();
  });

  it("SequentialStoryboardStructuralError with a vision-capability retryHistory entry -> draftFailure.reasonCode classifies it (never fabricates shots)", async () => {
    mockGetDb.mockResolvedValue(makeMockDb().db);
    mockRunLoop.mockRejectedValue(
      new SequentialStoryboardStructuralError("every round failed", [
        {
          round: 1,
          status: "invocation_failed",
          error:
            "product-review-sequential-storyboard LLM call failed: No endpoints found that support image input",
        },
      ])
    );

    const result = await runSequentialPromptPlanStageForTest({
      run: makeRun(),
      metadata: baseRunMetadata(),
      plan: basePlan,
      auth: { userId: 1, tenantId: "tenant_1" },
    });

    const seq = result.sequentialStoryboard as Record<string, unknown>;
    expect(seq.degraded).toBe(true);
    expect(seq.shots).toBeUndefined();
    const draftFailure = seq.draftFailure as Record<string, unknown>;
    expect(draftFailure.reasonCode).toBe("vision_capability");
    expect(draftFailure.roundsAttempted).toBe(1);
    expect(typeof draftFailure.failedAt).toBe("string");
  });
});
