/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 07 §4. Tests 1-3, 5-12 for the shared evidence-guard package
 * (guardian presence + demonstration/assembly guard + claim exclusions)
 * behind the `marketplaceReviewEvidenceGuard` tenant flag.
 *
 * Spec: specs/feature/136-marketplace-auto-review-sequential-shot-storyboard/
 * sections/section-07-evidence-guard-shared.md
 *
 * The diff-shape snapshot (test 4) lives in `marketplaceAutoReview.snapshots.test.ts`
 * so it can reuse that file's committed WS-1 baseline fixtures directly.
 *
 * Convention: service tests exercise exported `...ForTest` helpers (no DB,
 * pure fixtures) — mirrors marketplaceAutoReviewService.test.ts /
 * marketplaceAutoReview.sequentialGate.test.ts.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => null),
}));

import {
  resolveMarketplaceReviewEvidenceGuardContextForTest,
  buildGuardianPresenceDirectiveForTest,
  buildDemonstrationEvidenceDirectiveForTest,
  buildGuardianPresenceRepairInstructionForTest,
  buildMarketplaceReviewClaimSafetyExclusionsLineForTest,
  buildMarketplaceAutoReview3x3StoryboardPromptForTest,
  buildMarketplaceAutoReviewShotFramePromptForTest,
  buildProductReferenceStoryboardSkillInputsForTest,
  normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest,
  imageReasonCodeBlocksPublishSafetyForTest,
  imageReasonCodesContainPublishSafetyBlockerForTest,
  imageReasonCodeMentionsMinorSafetyForTest,
  normalizeMarketplaceAutoReviewVisionQaMinorSafetyResultForTest,
  marketplaceAutoReviewImageRepairBudgetAllowsStoryboardReviewHandoffForTest,
  buildTargetedRepairDirectiveForTest,
  validateMarketplaceAutoReviewImagePromptPreflightForTest,
  ensureMinorSafetyClothingLockInImagePromptForTest,
  ensureMarketplaceAutoReviewEvidenceLocksInSequentialImagePromptForTest,
  prepareMarketplaceAutoReviewImagePromptForTest,
  computeMarketplaceAutoReviewChildSubjectPolicyForTest,
  marketplaceReviewEvidenceGuardQaSchemaFragmentForTest,
} from "../marketplaceAutoReviewService";
import { deriveAssemblyDocumentationFromProductTruth } from "../../../shared/marketplaceCapture/sequentialEvidencePreview";
import {
  buildSequentialStoryboardRuntimeContract,
  type SequentialStoryboardRuntimeContractInput,
} from "../productReviewSequentialStoryboardSkillRunner";

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

const baseShot = {
  id: "shot-1",
  order: 1,
  title: "เปิดปัญหา",
  startSeconds: 0,
  endSeconds: 8,
  durationSeconds: 8,
  storyboardGuide: "1. 0-8s เปิดปัญหา / มุมกล้อง: slow push-in",
  voiceover: "สั้นมาก",
  camera: "slow push-in",
  visual: "เห็นมุมข้างเตียงก่อนจัดของ",
  movement: "slow push-in",
  productRole: "context first",
};

const furniturePlan = { ...basePlan, shots: [baseShot] } as any;

/** Mother/baby category plan — triggers productChildRelated + the minor-safety trigger family. */
const motherBabyPlan = {
  ...basePlan,
  productTruth: {
    ...basePlan.productTruth,
    productName: "คอกกั้นเด็กเล่น",
    productCategory: "mother_baby",
    categoryText: "แม่และเด็ก",
  },
  shots: [baseShot],
} as any;

function enabledGuard(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    enabled: true,
    productChildRelated: false,
    childDepictionPlanned: null,
    assemblyDocumented: false,
    blockedClaims: [] as string[],
    conflictExclusions: [] as string[],
    guardianReferenceIndex: null,
    ...overrides,
  } as any;
}

function referenceImageGroups() {
  return {
    product: ["https://cdn.example.test/product.png"],
    character: [] as string[],
    environment: [] as string[],
    all: ["https://cdn.example.test/product.png"],
  };
}

/* -------------------------------------------------------------------------- */
/* Test 1 — Directive builders: off/inactive + active cases                   */
/* -------------------------------------------------------------------------- */

describe("Feature 136 section 07 — directive builders (off/inactive)", () => {
  it("buildGuardianPresenceDirective returns '' when guard context is undefined", () => {
    expect(
      buildGuardianPresenceDirectiveForTest({ plan: motherBabyPlan, guard: undefined }),
    ).toBe("");
  });

  it("buildGuardianPresenceDirective returns '' when enabled: false", () => {
    expect(
      buildGuardianPresenceDirectiveForTest({
        plan: motherBabyPlan,
        guard: enabledGuard({ enabled: false, productChildRelated: true }),
      }),
    ).toBe("");
  });

  it("buildGuardianPresenceDirective returns '' when productChildRelated is false", () => {
    expect(
      buildGuardianPresenceDirectiveForTest({
        plan: furniturePlan,
        guard: enabledGuard({ productChildRelated: false }),
      }),
    ).toBe("");
  });

  it("buildDemonstrationEvidenceDirective returns '' when guard context is undefined", () => {
    expect(
      buildDemonstrationEvidenceDirectiveForTest({ plan: furniturePlan, guard: undefined }),
    ).toBe("");
  });

  it("buildDemonstrationEvidenceDirective returns '' when enabled: false", () => {
    expect(
      buildDemonstrationEvidenceDirectiveForTest({
        plan: furniturePlan,
        guard: enabledGuard({ enabled: false }),
      }),
    ).toBe("");
  });
});

describe("Feature 136 section 07 — directive builders (active)", () => {
  it("buildGuardianPresenceDirective returns non-empty text with the stable marker when active", () => {
    const text = buildGuardianPresenceDirectiveForTest({
      plan: motherBabyPlan,
      guard: enabledGuard({ productChildRelated: true }),
    });
    expect(text).not.toBe("");
    expect(text).toContain("GUARDIAN PRESENCE LOCK:");
    expect(text.toLowerCase()).toContain("supervising adult guardian");
    expect(text.toLowerCase()).toContain("unaccompanied minor");
  });

  it("buildGuardianPresenceDirective names @Image<N> when guardianReferenceIndex is set", () => {
    const text = buildGuardianPresenceDirectiveForTest({
      plan: motherBabyPlan,
      guard: enabledGuard({ productChildRelated: true, guardianReferenceIndex: 3 }),
    });
    expect(text).toContain("@Image3");
  });

  it("buildDemonstrationEvidenceDirective returns non-empty text with the stable marker when active (undocumented)", () => {
    const text = buildDemonstrationEvidenceDirectiveForTest({
      plan: furniturePlan,
      guard: enabledGuard({ assemblyDocumented: false }),
    });
    expect(text).not.toBe("");
    expect(text).toContain("DEMONSTRATION EVIDENCE LOCK:");
    expect(text.toLowerCase()).toContain("assembl");
  });

  it("buildDemonstrationEvidenceDirective still returns active text when assembly is documented (restricted wording)", () => {
    const text = buildDemonstrationEvidenceDirectiveForTest({
      plan: furniturePlan,
      guard: enabledGuard({ assemblyDocumented: true }),
    });
    expect(text).not.toBe("");
    expect(text).toContain("DEMONSTRATION EVIDENCE LOCK:");
  });

  it("markers appear exactly once each within a single directive string", () => {
    const guardianText = buildGuardianPresenceDirectiveForTest({
      plan: motherBabyPlan,
      guard: enabledGuard({ productChildRelated: true }),
    });
    const demoText = buildDemonstrationEvidenceDirectiveForTest({
      plan: furniturePlan,
      guard: enabledGuard({}),
    });
    expect(guardianText.match(/GUARDIAN PRESENCE LOCK:/g)?.length).toBe(1);
    expect(demoText.match(/DEMONSTRATION EVIDENCE LOCK:/g)?.length).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Test 2 — childSubjectPolicy activation (re-asserted; owned by section 05)  */
/* -------------------------------------------------------------------------- */

describe("Feature 136 section 07 — childSubjectPolicy activation (section-05 helper)", () => {
  it("mother_baby category + a depicts_minor shot => active", () => {
    const policy = computeMarketplaceAutoReviewChildSubjectPolicyForTest({
      categoryText: "mother_baby",
      productTexts: ["คอกกั้นเด็ก"],
      shots: [{ depicts_minor: true }],
    });
    expect(policy.productChildRelated).toBe(true);
    expect(policy.childDepictionPlanned).toBe(true);
  });

  it("adult-only plan => inactive", () => {
    const policy = computeMarketplaceAutoReviewChildSubjectPolicyForTest({
      categoryText: "furniture",
      productTexts: ["โต๊ะวางของข้างเตียง"],
      shots: [{ depicts_minor: false }],
    });
    expect(policy.productChildRelated).toBe(false);
    expect(policy.childDepictionPlanned).toBe(false);
  });

  it("plan-text minor-safety signal (ของเล่นเด็ก) triggers productChildRelated without the category", () => {
    // "ของเล่นเด็ก" (children's toy) is one of the literal alternatives in
    // `MARKETPLACE_AUTO_REVIEW_MINOR_SAFETY_SIGNAL_RE` — the SAME shared
    // trigger family this helper reuses (never a copy of the regex).
    const policy = computeMarketplaceAutoReviewChildSubjectPolicyForTest({
      categoryText: "furniture",
      productTexts: ["ของเล่นเด็ก สำหรับเสริมพัฒนาการ"],
      shots: undefined,
    });
    expect(policy.productChildRelated).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Test 3 — Injection presence (idempotent, exactly once) at the 3x3 sites +  */
/* the sequential runner contract.                                            */
/* -------------------------------------------------------------------------- */

describe("Feature 136 section 07 — injection presence (guard ON)", () => {
  it("build3x3StoryboardPrompt contains both markers exactly once when guard is on", () => {
    const prompt = buildMarketplaceAutoReview3x3StoryboardPromptForTest({
      plan: motherBabyPlan,
      overlayTextMode: "no_text",
      guard: enabledGuard({ productChildRelated: true, assemblyDocumented: false }),
    } as any);
    expect(prompt.match(/GUARDIAN PRESENCE LOCK:/g)?.length).toBe(1);
    expect(prompt.match(/DEMONSTRATION EVIDENCE LOCK:/g)?.length).toBe(1);
  });

  it("buildShotFramePrompt (start/stop dispatcher) contains both markers exactly once when guard is on", () => {
    const prompt = buildMarketplaceAutoReviewShotFramePromptForTest({
      plan: motherBabyPlan,
      shot: baseShot as any,
      role: "start",
      overlayTextMode: "no_text",
      guard: enabledGuard({ productChildRelated: true, assemblyDocumented: false }),
    } as any);
    expect(prompt.match(/GUARDIAN PRESENCE LOCK:/g)?.length).toBe(1);
    expect(prompt.match(/DEMONSTRATION EVIDENCE LOCK:/g)?.length).toBe(1);
  });

  it("the 3x3 skill runtime_contract (buildProductReferenceStoryboardSkillInputs) carries both directives + claim exclusions exactly once", () => {
    const metadata = {
      evidenceGuard: { enabled: true },
      claimEvidenceMapping: {
        blockedClaims: [{ claimText: "รับประกันหายขาด" }],
      },
    } as any;
    const inputs = buildProductReferenceStoryboardSkillInputsForTest({
      plan: motherBabyPlan,
      unit: { unitId: "storyboard-grid-image", role: "storyboard_grid" } as any,
      overlayTextMode: "no_text",
      referenceImageGroups: referenceImageGroups(),
      metadata,
      promptSkillAttempt: 1,
    });
    const runtimeContract = String((inputs as any).runtime_contract ?? "");
    expect(runtimeContract.match(/GUARDIAN PRESENCE LOCK:/g)?.length).toBe(1);
    expect(runtimeContract.match(/DEMONSTRATION EVIDENCE LOCK:/g)?.length).toBe(1);
    expect(runtimeContract.match(/CLAIM SAFETY EXCLUSIONS:/g)?.length).toBe(1);
    expect(runtimeContract).toContain("รับประกันหายขาด");
  });

  it("the sequential runner contract assembly carries both directives exactly once", () => {
    const input: SequentialStoryboardRuntimeContractInput = {
      imageBudget: 4000,
      referenceManifest: [{ index: 1, role: "product", url: "https://cdn.example.test/a.png" }],
      productTruthText: "product truth",
      blockedClaims: [],
      forbiddenClaims: [],
      confirmedAttributes: {},
      childSubjectPolicy: { productChildRelated: true, childDepictionPlanned: true },
      guardianPresenceDirective: "GUARDIAN PRESENCE LOCK: text",
      demonstrationEvidenceDirective: "DEMONSTRATION EVIDENCE LOCK: text",
    } as any;
    const contract = buildSequentialStoryboardRuntimeContract(input);
    expect(contract.match(/GUARDIAN PRESENCE LOCK:/g)?.length).toBe(1);
    expect(contract.match(/DEMONSTRATION EVIDENCE LOCK:/g)?.length).toBe(1);
  });
});

describe("Feature 136 section 07 — injection presence (guard OFF/undefined => markers absent)", () => {
  it("build3x3StoryboardPrompt has no markers when guard is undefined", () => {
    const prompt = buildMarketplaceAutoReview3x3StoryboardPromptForTest({
      plan: motherBabyPlan,
      overlayTextMode: "no_text",
    });
    expect(prompt).not.toContain("GUARDIAN PRESENCE LOCK:");
    expect(prompt).not.toContain("DEMONSTRATION EVIDENCE LOCK:");
  });

  it("buildShotFramePrompt has no markers when guard is undefined", () => {
    const prompt = buildMarketplaceAutoReviewShotFramePromptForTest({
      plan: motherBabyPlan,
      shot: baseShot as any,
      role: "start",
      overlayTextMode: "no_text",
    });
    expect(prompt).not.toContain("GUARDIAN PRESENCE LOCK:");
    expect(prompt).not.toContain("DEMONSTRATION EVIDENCE LOCK:");
  });

  it("the 3x3 skill runtime_contract has no markers when metadata.evidenceGuard is absent", () => {
    const inputs = buildProductReferenceStoryboardSkillInputsForTest({
      plan: motherBabyPlan,
      unit: { unitId: "storyboard-grid-image", role: "storyboard_grid" } as any,
      overlayTextMode: "no_text",
      referenceImageGroups: referenceImageGroups(),
      promptSkillAttempt: 1,
    });
    const runtimeContract = String((inputs as any).runtime_contract ?? "");
    expect(runtimeContract).not.toContain("GUARDIAN PRESENCE LOCK:");
    expect(runtimeContract).not.toContain("DEMONSTRATION EVIDENCE LOCK:");
    expect(runtimeContract).not.toContain("CLAIM SAFETY EXCLUSIONS:");
  });

  it("the sequential runner contract has no markers when the directive inputs are absent", () => {
    const input: SequentialStoryboardRuntimeContractInput = {
      imageBudget: 4000,
      referenceManifest: [{ index: 1, role: "product", url: "https://cdn.example.test/a.png" }],
      productTruthText: "product truth",
      blockedClaims: [],
      forbiddenClaims: [],
      confirmedAttributes: {},
      childSubjectPolicy: { productChildRelated: false, childDepictionPlanned: false },
    };
    const contract = buildSequentialStoryboardRuntimeContract(input);
    expect(contract).not.toContain("GUARDIAN PRESENCE LOCK:");
    expect(contract).not.toContain("DEMONSTRATION EVIDENCE LOCK:");
  });
});

/* -------------------------------------------------------------------------- */
/* Test 5 — QA normalizer: guardian FAIL-CLOSED                               */
/* -------------------------------------------------------------------------- */

describe("Feature 136 section 07 — QA normalizer guardian (FAIL-CLOSED)", () => {
  const evidenceGuardOn = { enabled: true, assemblyDocumented: false };

  it("minorPresent true + adultGuardianPresent missing => repair + guardian_presence_missing", () => {
    const result = normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest({
      parsed: { verdict: "pass", minorPresent: true },
      plan: motherBabyPlan,
      reasonCodes: [],
      evidenceGuard: evidenceGuardOn,
    } as any);
    expect(result.verdict).toBe("repair");
    expect(result.reasonCodes).toContain("guardian_presence_missing");
  });

  it("minorPresent true + adultGuardianPresent: false => repair + guardian_presence_missing", () => {
    const result = normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest({
      parsed: { verdict: "pass", minorPresent: true, adultGuardianPresent: false },
      plan: motherBabyPlan,
      reasonCodes: [],
      evidenceGuard: evidenceGuardOn,
    } as any);
    expect(result.verdict).toBe("repair");
    expect(result.reasonCodes).toContain("guardian_presence_missing");
  });

  it("minorPresent true + adultGuardianPresent: true => no guardian code, pass", () => {
    const result = normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest({
      parsed: {
        verdict: "pass",
        minorPresent: true,
        adultGuardianPresent: true,
      },
      plan: motherBabyPlan,
      reasonCodes: [],
      evidenceGuard: evidenceGuardOn,
    } as any);
    expect(result.reasonCodes).not.toContain("guardian_presence_missing");
    expect(result.verdict).toBe("pass");
  });

  it("minorPresent false => no guardian code regardless of adultGuardianPresent", () => {
    const result = normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest({
      parsed: { verdict: "pass", minorPresent: false, adultGuardianPresent: false },
      plan: motherBabyPlan,
      reasonCodes: [],
      evidenceGuard: evidenceGuardOn,
    } as any);
    expect(result.reasonCodes).not.toContain("guardian_presence_missing");
  });

  it("evidenceGuard absent => today's behavior is unchanged for the same parsed fixture (regression pin)", () => {
    const parsed = {
      verdict: "pass",
      minorPresent: true,
      productMatchesReference: true,
      continuityMatchesShot: true,
      characterConsistencySafe: true,
      adWarningTextSafe: true,
    };
    const withoutGuard = normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest({
      parsed,
      plan: furniturePlan,
      reasonCodes: [],
    } as any);
    // Same pin fields the pre-section-07 normalizer already returned.
    expect(withoutGuard.verdict).toBe("pass");
    expect(withoutGuard.reasonCodes).toEqual([]);
    expect(withoutGuard.minorPresent).toBe(true);
    expect(withoutGuard.minorSafetyClothingSafe).toBe(true);
    expect(withoutGuard.productMatchesReference).toBe(true);
    expect(withoutGuard.continuityMatchesShot).toBe(true);
    expect(withoutGuard.characterConsistencySafe).toBe(true);
    expect(withoutGuard.adWarningTextSafe).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Test 6 — QA normalizer: assembly                                           */
/* -------------------------------------------------------------------------- */

describe("Feature 136 section 07 — QA normalizer assembly", () => {
  it("assemblyContentDetected true + assemblyDocumented false => repair + assembly_content_unverified", () => {
    const result = normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest({
      parsed: { verdict: "pass", assemblyContentDetected: true },
      plan: furniturePlan,
      reasonCodes: [],
      evidenceGuard: { enabled: true, assemblyDocumented: false },
    } as any);
    expect(result.verdict).toBe("repair");
    expect(result.reasonCodes).toContain("assembly_content_unverified");
  });

  it("assemblyContentDetected true + assemblyDocumented true => pass, no assembly code", () => {
    const result = normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest({
      parsed: { verdict: "pass", assemblyContentDetected: true },
      plan: furniturePlan,
      reasonCodes: [],
      evidenceGuard: { enabled: true, assemblyDocumented: true },
    } as any);
    expect(result.reasonCodes).not.toContain("assembly_content_unverified");
    expect(result.verdict).toBe("pass");
  });

  it("evidenceGuard absent => assemblyContentDetected field is ignored for verdict purposes", () => {
    const result = normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest({
      parsed: { verdict: "pass", assemblyContentDetected: true },
      plan: furniturePlan,
      reasonCodes: [],
    } as any);
    expect(result.reasonCodes).not.toContain("assembly_content_unverified");
    expect(result.verdict).toBe("pass");
  });
});

/* -------------------------------------------------------------------------- */
/* Test 7 — Publish-block semantics                                           */
/* -------------------------------------------------------------------------- */

describe("Feature 136 section 07 — publish-block semantics", () => {
  it("guardian_presence_missing satisfies the publish-safety predicate", () => {
    expect(imageReasonCodeBlocksPublishSafetyForTest("guardian_presence_missing")).toBe(
      true,
    );
    expect(
      imageReasonCodesContainPublishSafetyBlockerForTest(["guardian_presence_missing"]),
    ).toBe(true);
  });

  it("existing minor-safety publish-safety matches are preserved", () => {
    expect(imageReasonCodeBlocksPublishSafetyForTest("child_shirtless_bare_torso")).toBe(
      true,
    );
  });

  it("assembly_content_unverified does NOT satisfy the publish-safety predicate", () => {
    expect(imageReasonCodeBlocksPublishSafetyForTest("assembly_content_unverified")).toBe(
      false,
    );
  });

  it("the accept-with-warnings handoff gate refuses a unit whose reason codes include assembly_content_unverified (guard on)", () => {
    const allowed = marketplaceAutoReviewImageRepairBudgetAllowsStoryboardReviewHandoffForTest({
      metadata: {
        evidenceGuard: { enabled: true },
        storyboardFrameUrls: Array.from({ length: 9 }, (_, i) => `https://cdn.example.test/${i}.png`),
      } as any,
      repairUnits: [
        {
          unitId: "sequential-shot-01",
          role: "sequential_shot_frame",
          repairReasonCodes: ["assembly_content_unverified"],
        } as any,
      ],
      expectedFrameCount: 9,
    });
    expect(allowed).toBe(false);
  });

  it("the accept-with-warnings handoff gate allows the same unit when the evidence guard is off (unrelated to structural readiness)", () => {
    const allowed = marketplaceAutoReviewImageRepairBudgetAllowsStoryboardReviewHandoffForTest({
      metadata: {
        storyboardFrameUrls: Array.from({ length: 9 }, (_, i) => `https://cdn.example.test/${i}.png`),
      } as any,
      repairUnits: [
        {
          unitId: "sequential-shot-01",
          role: "sequential_shot_frame",
          repairReasonCodes: ["assembly_content_unverified"],
        } as any,
      ],
      expectedFrameCount: 9,
    });
    expect(allowed).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Test 8 — Swallow-proofing regression                                       */
/* -------------------------------------------------------------------------- */

describe("Feature 136 section 07 — swallow-proofing regression", () => {
  it("imageReasonCodeMentionsMinorSafety matches neither new code", () => {
    expect(imageReasonCodeMentionsMinorSafetyForTest("guardian_presence_missing")).toBe(
      false,
    );
    expect(imageReasonCodeMentionsMinorSafetyForTest("assembly_content_unverified")).toBe(
      false,
    );
  });

  it("a parsed QA result carrying guardian_presence_missing survives normalizeVisionQaMinorSafetyResult folding unchanged", () => {
    const result = normalizeMarketplaceAutoReviewVisionQaMinorSafetyResultForTest({
      parsed: { minorPresent: false },
      plan: furniturePlan,
      reasonCodes: ["guardian_presence_missing"],
    });
    expect(result.reasonCodes).toContain("guardian_presence_missing");
  });
});

/* -------------------------------------------------------------------------- */
/* Test 9 — Repair registry                                                   */
/* -------------------------------------------------------------------------- */

describe("Feature 136 section 07 — targeted repair registry", () => {
  it("a unit with repairReasonCodes guardian_presence_missing includes the guardian sentence", () => {
    const directive = buildTargetedRepairDirectiveForTest({
      repairReasonCodes: ["guardian_presence_missing"],
    } as any);
    expect(directive.toLowerCase()).toContain("guardian");
  });

  it("a unit with repairReasonCodes assembly_content_unverified includes the assembly sentence", () => {
    const directive = buildTargetedRepairDirectiveForTest({
      repairReasonCodes: ["assembly_content_unverified"],
    } as any);
    expect(directive.toLowerCase()).toContain("assembl");
  });

  it("buildGuardianPresenceRepairInstruction emits the @Image(K+1) variant when the index is known", () => {
    const instruction = buildGuardianPresenceRepairInstructionForTest({
      plan: motherBabyPlan,
      guard: enabledGuard({ productChildRelated: true, guardianReferenceIndex: 4 }),
    });
    expect(instruction).toContain("@Image4");
  });

  it("buildGuardianPresenceRepairInstruction returns '' when policy inactive", () => {
    const instruction = buildGuardianPresenceRepairInstructionForTest({
      plan: furniturePlan,
      guard: enabledGuard({ productChildRelated: false }),
    });
    expect(instruction).toBe("");
  });
});

/* -------------------------------------------------------------------------- */
/* Test 10 — QA schema fragment strings                                       */
/* -------------------------------------------------------------------------- */

describe("Feature 136 section 07 — QA schema fields", () => {
  it("the evidence-guard QA field fragment contains the three new fields when guard is on", () => {
    const fragment = marketplaceReviewEvidenceGuardQaSchemaFragmentForTest(
      enabledGuard({}),
    );
    expect(fragment).toContain('"adultGuardianPresent"');
    expect(fragment).toContain('"framesMissingGuardian"');
    expect(fragment).toContain('"assemblyContentDetected"');
  });

  it("the evidence-guard QA field fragment is '' when guard is off", () => {
    expect(marketplaceReviewEvidenceGuardQaSchemaFragmentForTest(undefined)).toBe(
      "",
    );
    expect(
      marketplaceReviewEvidenceGuardQaSchemaFragmentForTest(
        enabledGuard({ enabled: false }),
      ),
    ).toBe("");
  });
});

/* -------------------------------------------------------------------------- */
/* Test 11 — Preflight blockers                                               */
/* -------------------------------------------------------------------------- */

describe("Feature 136 section 07 — shared preflight blockers", () => {
  it("guardian_directive_missing fires for a policy-active plan whose prompt lacks the marker", () => {
    const result = validateMarketplaceAutoReviewImagePromptPreflightForTest({
      prompt: "A photorealistic product review frame with no guardian text.",
      unit: { unitId: "u1", role: "storyboard_frame" } as any,
      plan: motherBabyPlan,
      overlayTextMode: "no_text",
      guard: enabledGuard({ productChildRelated: true }),
    } as any);
    expect(result.blockers).toContain("guardian_directive_missing");
  });

  it("guardian_directive_missing does not fire when the marker is present", () => {
    const result = validateMarketplaceAutoReviewImagePromptPreflightForTest({
      prompt: "GUARDIAN PRESENCE LOCK: supervising adult guardian must appear.",
      unit: { unitId: "u1", role: "storyboard_frame" } as any,
      plan: motherBabyPlan,
      overlayTextMode: "no_text",
      guard: enabledGuard({ productChildRelated: true }),
    } as any);
    expect(result.blockers).not.toContain("guardian_directive_missing");
  });

  it("guardian_directive_missing does not fire when guard is off", () => {
    const result = validateMarketplaceAutoReviewImagePromptPreflightForTest({
      prompt: "A photorealistic product review frame with no guardian text.",
      unit: { unitId: "u1", role: "storyboard_frame" } as any,
      plan: motherBabyPlan,
      overlayTextMode: "no_text",
    } as any);
    expect(result.blockers).not.toContain("guardian_directive_missing");
  });

  it("assembly_demo_unverified fires on a crafted assembly-staging prompt when undocumented", () => {
    const result = validateMarketplaceAutoReviewImagePromptPreflightForTest({
      prompt:
        "Show the disassembled parts spread across the table with screws and fasteners next to an exploded view diagram.",
      unit: { unitId: "u1", role: "storyboard_frame" } as any,
      plan: furniturePlan,
      overlayTextMode: "no_text",
      guard: enabledGuard({ assemblyDocumented: false }),
    } as any);
    expect(result.blockers).toContain("assembly_demo_unverified");
  });

  it("assembly_demo_unverified does not fire when assembly is documented", () => {
    const result = validateMarketplaceAutoReviewImagePromptPreflightForTest({
      prompt:
        "Show the disassembled parts spread across the table with screws and fasteners next to an exploded view diagram.",
      unit: { unitId: "u1", role: "storyboard_frame" } as any,
      plan: furniturePlan,
      overlayTextMode: "no_text",
      guard: enabledGuard({ assemblyDocumented: true }),
    } as any);
    expect(result.blockers).not.toContain("assembly_demo_unverified");
  });

  it("assembly_demo_unverified does NOT trigger on a finished-product phrase (false-positive guard)", () => {
    const result = validateMarketplaceAutoReviewImagePromptPreflightForTest({
      prompt: "Show the fully assembled product exactly as shown in the reference images.",
      unit: { unitId: "u1", role: "storyboard_frame" } as any,
      plan: furniturePlan,
      overlayTextMode: "no_text",
      guard: enabledGuard({ assemblyDocumented: false }),
    } as any);
    expect(result.blockers).not.toContain("assembly_demo_unverified");
  });
});

/* -------------------------------------------------------------------------- */
/* Test 12 — Flag snapshot                                                    */
/* -------------------------------------------------------------------------- */

describe("Feature 136 section 07 — flag snapshot resolver", () => {
  it("resolveMarketplaceReviewEvidenceGuardContext(undefined, plan) never throws and returns an all-off context", () => {
    expect(() =>
      resolveMarketplaceReviewEvidenceGuardContextForTest({ metadata: undefined, plan: furniturePlan }),
    ).not.toThrow();
    const context = resolveMarketplaceReviewEvidenceGuardContextForTest({
      metadata: undefined,
      plan: furniturePlan,
    });
    expect(context.enabled).toBe(false);
    expect(context.blockedClaims).toEqual([]);
    expect(context.conflictExclusions).toEqual([]);
    expect(context.guardianReferenceIndex).toBeNull();
  });

  it("metadata.evidenceGuard.enabled === true snapshots enabled: true", () => {
    const context = resolveMarketplaceReviewEvidenceGuardContextForTest({
      metadata: { evidenceGuard: { enabled: true } } as any,
      plan: furniturePlan,
    });
    expect(context.enabled).toBe(true);
  });

  it("metadata.evidenceGuard absent snapshots enabled: false", () => {
    const context = resolveMarketplaceReviewEvidenceGuardContextForTest({
      metadata: {} as any,
      plan: furniturePlan,
    });
    expect(context.enabled).toBe(false);
  });

  it("wiring grep-guard: startMarketplaceAutoReviewRun reads marketplaceReviewEvidenceGuard and snapshots it into evidenceGuard", () => {
    const filePath = path.resolve(
      import.meta.dirname,
      "../marketplaceAutoReviewService.ts",
    );
    const content = fs.readFileSync(filePath, "utf-8");
    const signature = /export async function startMarketplaceAutoReviewRun\(/;
    const match = signature.exec(content);
    expect(match).not.toBeNull();
    const startIndex = match!.index;
    const rest = content.slice(startIndex + match![0].length);
    const nextTopLevel =
      /\n(?:export\s+)?(?:async\s+)?function\s+\w+|\nexport\s+(?:const|class|interface|type)\s+\w+/.exec(
        rest,
      );
    const body = nextTopLevel
      ? content.slice(startIndex, startIndex + match![0].length + nextTopLevel.index)
      : content.slice(startIndex);
    expect(body).toContain("marketplaceReviewEvidenceGuard");
    expect(body).toContain("evidenceGuard");
  });
});

/* -------------------------------------------------------------------------- */
/* Claim safety exclusions builder (§3.6, deliverable 9)                      */
/* -------------------------------------------------------------------------- */

describe("Feature 136 section 07 — claim safety exclusions line", () => {
  it("returns '' when guard is off", () => {
    expect(
      buildMarketplaceReviewClaimSafetyExclusionsLineForTest({ guard: undefined }),
    ).toBe("");
  });

  it("returns a CLAIM SAFETY EXCLUSIONS line listing blocked claims when guard is on", () => {
    const line = buildMarketplaceReviewClaimSafetyExclusionsLineForTest({
      guard: enabledGuard({ blockedClaims: ["รักษาโรค"], conflictExclusions: ["กันน้ำ 100%"] }),
    });
    expect(line).toContain("CLAIM SAFETY EXCLUSIONS:");
    expect(line).toContain("รักษาโรค");
    expect(line).toContain("กันน้ำ 100%");
  });
});

/* -------------------------------------------------------------------------- */
/* G9 closure — minor-safety lock (+ guard directives) reach skill-authored   */
/* sequential prompts end-to-end through the actual submission-prep path.     */
/* -------------------------------------------------------------------------- */

describe("Feature 136 section 07 — G9 closure (sequential minor-safety + guard injection)", () => {
  function sequentialUnit(): any {
    return {
      unitId: "sequential-shot-01",
      role: "sequential_shot_frame",
      shotId: "shot-1",
      shotOrder: 1,
    };
  }

  it("ensureMarketplaceAutoReviewEvidenceLocksInSequentialImagePrompt injects the minor-safety lock unconditionally (bug fix, not guard-gated)", () => {
    const guarded = ensureMarketplaceAutoReviewEvidenceLocksInSequentialImagePromptForTest({
      prompt: "A skill-authored Thai-language sequential shot prompt with no safety text.",
      plan: motherBabyPlan,
      guard: undefined,
    });
    expect(guarded).toContain("MINOR SAFETY CLOTHING LOCK:");
  });

  it("[end-to-end] a child-product sequential fixture: prompt carries the minor-safety lock and the shared preflight passes", () => {
    const metadata = {
      sequentialStoryboard: {
        shots: [
          {
            shot_id: 1,
            start_frame_image_prompt:
              "ภาพเด็กเล่นกับคอกกั้นเด็กในห้องนั่งเล่นที่สว่างสบาย ไม่มีข้อความบนภาพ",
          },
        ],
      },
    } as any;

    const { prompt, preflight } = prepareMarketplaceAutoReviewImagePromptForTest({
      plan: motherBabyPlan,
      unit: sequentialUnit(),
      overlayTextMode: "no_text",
      metadata,
    });

    expect(prompt).toContain("MINOR SAFETY CLOTHING LOCK:");
    expect(preflight.status).toBe("passed");
    expect(preflight.blockers).not.toContain("minor_safety_clothing_lock_missing");
  });

  it("[end-to-end] with the evidence guard on and guardian policy active, the guardian lock also reaches the sequential prompt", () => {
    const metadata = {
      evidenceGuard: { enabled: true },
      sequentialStoryboard: {
        shots: [
          {
            shot_id: 1,
            depicts_minor: true,
            start_frame_image_prompt:
              "ภาพเด็กเล่นกับคอกกั้นเด็กในห้องนั่งเล่นที่สว่างสบาย ไม่มีข้อความบนภาพ",
          },
        ],
      },
    } as any;

    const { prompt } = prepareMarketplaceAutoReviewImagePromptForTest({
      plan: motherBabyPlan,
      unit: sequentialUnit(),
      overlayTextMode: "no_text",
      metadata,
    });

    expect(prompt).toContain("MINOR SAFETY CLOTHING LOCK:");
    expect(prompt).toContain("GUARDIAN PRESENCE LOCK:");
  });

  it("without the fix, the same fixture would have failed preflight (pin: minor-safety marker regex is what the preflight checks)", () => {
    // Regression pin proving the fixture actually exercises the bug family:
    // the raw skill-authored prompt (before injection) does not itself
    // contain the marker, so the fix is load-bearing, not a fixture no-op.
    const rawPrompt =
      "ภาพเด็กเล่นกับคอกกั้นเด็กในห้องนั่งเล่นที่สว่างสบาย ไม่มีข้อความบนภาพ";
    expect(/MINOR SAFETY CLOTHING LOCK/i.test(rawPrompt)).toBe(false);
    const guarded = ensureMinorSafetyClothingLockInImagePromptForTest({
      prompt: rawPrompt,
      plan: motherBabyPlan,
    });
    expect(guarded).toContain("MINOR SAFETY CLOTHING LOCK:");
  });
});

/* -------------------------------------------------------------------------- */
/* deriveAssemblyDocumentationFromProductTruth reachability (guard resolver   */
/* fallback for the 3x3 / pre-pack path).                                     */
/* -------------------------------------------------------------------------- */

describe("Feature 136 section 07 — assemblyDocumented resolution fallback", () => {
  it("resolveMarketplaceReviewEvidenceGuardContext falls back to deriveAssemblyDocumentationFromProductTruth for 3x3 (no sequential pack)", () => {
    const documentedPlan = {
      ...furniturePlan,
      productTruth: {
        ...furniturePlan.productTruth,
        description: "Assembly instructions: Step 1 attach legs. Step 2 attach top.",
      },
    };
    const context = resolveMarketplaceReviewEvidenceGuardContextForTest({
      metadata: { evidenceGuard: { enabled: true } } as any,
      plan: documentedPlan,
    });
    const expected = deriveAssemblyDocumentationFromProductTruth({
      productName: documentedPlan.productTruth.productName,
      description: documentedPlan.productTruth.description,
      specs: documentedPlan.productTruth.specs,
    });
    expect(context.assemblyDocumented).toBe(expected.documented);
    expect(context.assemblyDocumented).toBe(true);
  });

  it("never defaults assemblyDocumented to true for an undocumented product", () => {
    const context = resolveMarketplaceReviewEvidenceGuardContextForTest({
      metadata: { evidenceGuard: { enabled: true } } as any,
      plan: furniturePlan,
    });
    expect(context.assemblyDocumented).toBe(false);
  });

  it("prefers the sequential pack's evidenceProfile.assembly_documented when present", () => {
    const context = resolveMarketplaceReviewEvidenceGuardContextForTest({
      metadata: {
        evidenceGuard: { enabled: true },
        sequentialStoryboard: { evidenceProfile: { assembly_documented: true } },
      } as any,
      plan: furniturePlan,
    });
    expect(context.assemblyDocumented).toBe(true);
  });
});
