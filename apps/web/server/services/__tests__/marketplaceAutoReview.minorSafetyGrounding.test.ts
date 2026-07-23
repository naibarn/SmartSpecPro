/**
 * Minor-safety QA grounding (2026-07-23, user-reported false positives).
 *
 * A `mother_baby` run used to arm a RUN-WIDE minor-safety assertion on every
 * frame: when the vision model stayed silent about minors (the normal case
 * for an empty-chair / hands-only frame), `minorSafetyLockRequired &&
 * !presence.known` treated silence as "a child may be present" and emitted
 * `minor_safety_child_clothing_unverified` / kept `child_shirtless_bare_torso`
 * — blocking whole attempt waves of child-free frames.
 *
 * The fix grounds the silent-model fallback in the per-shot contract
 * (`sequentialStoryboard.shots[i].depicts_minor`, mandated by the skill's
 * guardian-presence.md): a shot declared child-free passes on silence, while
 * `depicts_minor: true` / absent keeps the fail-closed behavior byte-for-byte
 * and an AFFIRMATIVE model sighting always wins over the contract.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => null),
}));

import {
  normalizeMarketplaceAutoReviewVisionQaMinorSafetyResultForTest,
  normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest,
  normalizeMarketplaceAutoReviewCachedShotFrameVisionQaEnvelopeForTest,
} from "../marketplaceAutoReviewService";

// Minimal plan that arms `marketplaceAutoReviewPlanNeedsMinorSafetyLock`
// via the mother_baby category (the user's real failing case).
const motherBabyPlan = {
  conceptId: "concept-minor-safety",
  title: "รีวิวเก้าอี้เด็ก",
  productTruth: {
    productId: "mp_minor_1",
    productName: "เก้าอี้ฝึกทานอาหารสำหรับเด็ก",
    brand: "TestBrand",
    platform: "shopee",
    externalProductId: "1",
    externalShopId: "s1",
    productCategory: "mother_baby",
    categoryText: "แม่และเด็ก",
    categoryPath: ["แม่และเด็ก"],
    sourceUrl: "https://example.com/p",
    affiliateUrl: null,
    shopName: null,
    price: null,
    rating: null,
    sold: null,
    reviews: null,
    description: "เก้าอี้กินข้าวเด็ก พลาสติกแข็งแรง",
    specs: {},
    imageUrls: ["https://example.com/product.png"],
  },
  storyboardGuide: "Shot-by-shot storyboard guide",
  voiceoverScript: "VOICEOVER SCRIPT BY SHOT",
  productDetail: "PRODUCT FACTS LOCK: เก้าอี้เด็กพลาสติก",
  shots: [],
} as any;

const SHIRTLESS = "child_shirtless_bare_torso";
const UNVERIFIED = "minor_safety_child_clothing_unverified";

describe("normalizeVisionQaMinorSafetyResult — per-shot depicts_minor grounding", () => {
  it("(a) child-free shot + silent model ⇒ NO minor-safety codes, clothing safe", () => {
    const result =
      normalizeMarketplaceAutoReviewVisionQaMinorSafetyResultForTest({
        parsed: {},
        plan: motherBabyPlan,
        reasonCodes: [SHIRTLESS],
        shotDepictsMinor: false,
      });
    expect(result.reasonCodes).not.toContain(SHIRTLESS);
    expect(result.reasonCodes).not.toContain(UNVERIFIED);
    expect(result.minorSafetyClothingSafe).toBe(true);
    expect(result.minorPresent).toBeNull();
  });

  it("(a2) child-free shot + silent model drops non-blocker minor codes too", () => {
    const result =
      normalizeMarketplaceAutoReviewVisionQaMinorSafetyResultForTest({
        parsed: {},
        plan: motherBabyPlan,
        reasonCodes: [UNVERIFIED],
        shotDepictsMinor: false,
      });
    expect(result.reasonCodes).toEqual([]);
    expect(result.minorSafetyClothingSafe).toBe(true);
  });

  it("(b) depicts_minor:true + silent model stays fail-closed (code kept)", () => {
    const result =
      normalizeMarketplaceAutoReviewVisionQaMinorSafetyResultForTest({
        parsed: {},
        plan: motherBabyPlan,
        reasonCodes: [SHIRTLESS],
        shotDepictsMinor: true,
      });
    expect(result.reasonCodes).toContain(SHIRTLESS);
    expect(result.minorSafetyClothingSafe).toBe(false);
  });

  it("(b2) absent depicts_minor (3x3 / legacy) keeps today's fail-closed behavior", () => {
    const result =
      normalizeMarketplaceAutoReviewVisionQaMinorSafetyResultForTest({
        parsed: {},
        plan: motherBabyPlan,
        reasonCodes: [SHIRTLESS],
      });
    expect(result.reasonCodes).toContain(SHIRTLESS);
    expect(result.minorSafetyClothingSafe).toBe(false);
  });

  it("(c) affirmative model sighting overrides a child-free contract (still blocked)", () => {
    const result =
      normalizeMarketplaceAutoReviewVisionQaMinorSafetyResultForTest({
        parsed: { minorPresent: true },
        plan: motherBabyPlan,
        reasonCodes: [SHIRTLESS],
        shotDepictsMinor: false,
      });
    expect(result.reasonCodes).toContain(SHIRTLESS);
    expect(result.minorSafetyClothingSafe).toBe(false);
    expect(result.minorPresent).toBe(true);
  });

  it('(d) string "false" is a REAL negative answer, not "unknown"', () => {
    const result =
      normalizeMarketplaceAutoReviewVisionQaMinorSafetyResultForTest({
        parsed: { minorPresent: "false" },
        plan: motherBabyPlan,
        reasonCodes: [SHIRTLESS],
        // no shotDepictsMinor — the string answer alone must be enough
      });
    expect(result.reasonCodes).not.toContain(SHIRTLESS);
    expect(result.reasonCodes).not.toContain(UNVERIFIED);
    expect(result.minorPresent).toBe(false);
    expect(result.minorSafetyClothingSafe).toBe(true);
  });

  it('(d2) string "true" still counts as an affirmative sighting', () => {
    const result =
      normalizeMarketplaceAutoReviewVisionQaMinorSafetyResultForTest({
        parsed: { minorPresent: "true" },
        plan: motherBabyPlan,
        reasonCodes: [SHIRTLESS],
        shotDepictsMinor: false,
      });
    expect(result.reasonCodes).toContain(SHIRTLESS);
    expect(result.minorSafetyClothingSafe).toBe(false);
  });
});

describe("normalizeShotFrameVisionQaDecision — guardian arming is image-grounded", () => {
  const guard = { enabled: true, assemblyDocumented: true };

  it("childPresent:true alone (child-RELATED product) no longer arms the guardian check", () => {
    const decision =
      normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest({
        parsed: { verdict: "pass", childPresent: true },
        plan: motherBabyPlan,
        reasonCodes: [],
        evidenceGuard: guard,
      });
    expect(decision.reasonCodes).not.toContain("guardian_presence_missing");
    expect(decision.verdict).toBe("pass");
  });

  it("strict minorPresent:true with no guardian answer stays FAIL-CLOSED (blocked)", () => {
    const decision =
      normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest({
        parsed: { verdict: "pass", minorPresent: true },
        plan: motherBabyPlan,
        reasonCodes: [],
        evidenceGuard: guard,
      });
    expect(decision.reasonCodes).toContain("guardian_presence_missing");
    expect(decision.verdict).toBe("repair");
  });

  it("strict minorPresent:true + adultGuardianPresent:true passes", () => {
    const decision =
      normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest({
        parsed: {
          verdict: "pass",
          minorPresent: true,
          adultGuardianPresent: true,
        },
        plan: motherBabyPlan,
        reasonCodes: [],
        evidenceGuard: guard,
      });
    expect(decision.reasonCodes).not.toContain("guardian_presence_missing");
    expect(decision.verdict).toBe("pass");
  });

  it("shirtless sighting on a depicts_minor:true shot still hard-fails end to end", () => {
    const decision =
      normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest({
        parsed: { verdict: "pass", minorPresent: true },
        plan: motherBabyPlan,
        reasonCodes: [SHIRTLESS],
        evidenceGuard: guard,
        shotDepictsMinor: true,
      });
    expect(decision.reasonCodes).toContain(SHIRTLESS);
    expect(decision.verdict).toBe("repair");
  });

  it("child-free shot + silent model passes at the decision level too", () => {
    const decision =
      normalizeMarketplaceAutoReviewShotFrameVisionQaDecisionForTest({
        parsed: { verdict: "pass" },
        plan: motherBabyPlan,
        reasonCodes: [SHIRTLESS],
        evidenceGuard: guard,
        shotDepictsMinor: false,
      });
    expect(decision.reasonCodes).not.toContain(SHIRTLESS);
    expect(decision.verdict).toBe("pass");
  });
});

describe("cached envelope path gets the same per-shot grounding (no bug-from-cache)", () => {
  it("cached repair_required envelope for a child-free shot re-normalizes to clean", () => {
    const cached = {
      verdict: "repair",
      reasonCodes: [SHIRTLESS, UNVERIFIED],
      minorPresent: null,
      minorSafetyClothingSafe: false,
    };
    const normalized =
      normalizeMarketplaceAutoReviewCachedShotFrameVisionQaEnvelopeForTest(
        cached,
        motherBabyPlan,
        false
      );
    expect(normalized.reasonCodes).not.toContain(SHIRTLESS);
    expect(normalized.reasonCodes).not.toContain(UNVERIFIED);
    expect(normalized.minorSafetyClothingSafe).toBe(true);
  });

  it("cached envelope for a depicts_minor:true shot keeps the block (fail-closed)", () => {
    const cached = {
      verdict: "repair",
      reasonCodes: [SHIRTLESS],
      minorPresent: null,
      minorSafetyClothingSafe: false,
    };
    const normalized =
      normalizeMarketplaceAutoReviewCachedShotFrameVisionQaEnvelopeForTest(
        cached,
        motherBabyPlan,
        true
      );
    expect(normalized.reasonCodes).toContain(SHIRTLESS);
    expect(normalized.minorSafetyClothingSafe).toBe(false);
  });
});
