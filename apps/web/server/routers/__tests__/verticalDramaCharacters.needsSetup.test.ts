import { describe, it, expect, vi } from "vitest";

/**
 * Regression/unit tests for the character-roster completeness signal
 * (`planning/vd-stuck-generation-and-lost-characters/plan.md`, Set B).
 *
 * `ensureRosterCharactersFromStory` inserts story-introduced roster rows
 * with `data.source: "auto_registered_from_story"`, no DNA, no portrait —
 * but nothing surfaced that fact to the client. `computeCharacterNeedsSetupReasons`
 * (the pure helper `characterRowToDto` calls) is what closes that gap; this
 * file exercises it directly, mirroring the existing
 * `verticalDramaCharacters.extractDescription.test.ts` "mock every module-
 * level dependency so the module can be imported for its pure helpers"
 * pattern.
 */

vi.mock("../../db", () => ({
  db: {
    get instance() {
      return Promise.reject(new Error("database unavailable"));
    },
  },
}));

vi.mock("../../_core/trpc", () => {
  const proc: any = {
    use: () => proc,
    input: () => proc,
    mutation: () => vi.fn(),
    query: () => vi.fn(),
  };
  return {
    router: (routes: unknown) => routes,
    protectedProcedure: proc,
    adminProcedure: proc,
  };
});

vi.mock("../../middleware/requireFeatureFlag", () => ({
  requireFeatureFlag: () => (opts: unknown) => opts,
}));

vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: {},
  VerticalDramaCharacterStockError: class extends Error {},
}));

vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: {},
  DEFAULT_MODELS: { image: "test-model" },
}));

vi.mock("../../services/pricingCalculator", () => ({
  calculateCreditCost: vi.fn(),
}));

vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  refundCredits: vi.fn(),
}));

vi.mock("../../_core/tokens", () => ({
  signBearerToken: vi.fn(),
}));

vi.mock("../../services/verticalDramaCharacterImageGeneration", () => ({
  generateCharacterVisualPrompts: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));

vi.mock("../../services/rateLimiter", () => ({
  mediaGenerationLimiter: { isAllowed: vi.fn(), getResetTime: vi.fn() },
}));

vi.mock("../../services/mediaAssetService", () => ({
  createAssetFromAttachment: vi.fn(),
}));

import { computeCharacterNeedsSetupReasons } from "../verticalDramaCharacters";
import { verticalDramaCharacterDesignDnaSchema } from "@shared/verticalDramaSeries/characterProfile";

const VALID_DESIGN_DNA = verticalDramaCharacterDesignDnaSchema.parse({
  designIntent: "quietly resilient",
  seriesDnaAlignment: ["grounded family drama"],
  roleTier: "support",
  beautyArchetype: "natural warmth",
  ageRange: "adult",
  faceIdentity: {
    facialGeometry: "soft oval",
    eyesAndGaze: "steady gaze",
    brows: "natural brows",
    nose: "straight nose",
    lipsAndSmile: "subtle smile",
    skinAndTexture: "natural skin texture",
    hair: "shoulder-length dark hair",
    distinctiveAsymmetry: "slight left dimple",
  },
  bodyLanguage: {
    posture: "upright",
    gesturePattern: "measured gestures",
    movementRhythm: "calm rhythm",
    tensionTell: "tightens hands",
  },
  recallStack: {
    face: "steady eyes",
    silhouette: "slim silhouette",
    color: "deep blue",
    behavior: "observant stillness",
    emotionalHook: "protective resolve",
  },
  costumeGrammar: "practical clothing",
  publicMask: "composed helper",
  hiddenTruth: "fears abandonment",
  narrativePromise: "will choose herself",
  attractiveContradiction: "gentle but firm",
  forbiddenDrift: ["generic glamour"],
  antiCloneChecks: {
    distinctFacialDimensions: ["soft oval", "steady gaze", "left dimple"],
    distinctHairDimensions: ["shoulder length", "dark natural hair"],
    distinctBodyLanguageDimensions: ["upright posture", "measured gestures"],
    signatureDifference: "protective resolve",
  },
  scores: {
    storyFit: 7,
    screenPresence: 7,
    emotionalReadability: 7,
    ensembleContrast: 7,
    crossSeriesUniqueness: 10,
    thresholdStatus: "provisional",
    rationale: "fits the supporting role",
  },
  comparisonEvidence: {
    candidateDirectionCount: 3,
    currentCastCompared: 0,
    recentSeriesCompared: 0,
    priorLeadDnaCompared: 0,
    historyCompleteness: "none",
  },
});

describe("computeCharacterNeedsSetupReasons", () => {
  it("flags an auto-registered-from-story row with no portrait/description with all three reasons", () => {
    const reasons = computeCharacterNeedsSetupReasons({
      data: { source: "auto_registered_from_story" },
      hasApprovedOrGeneratedPortrait: false,
    });

    expect(reasons).toEqual(
      expect.arrayContaining([
        "auto_registered_from_story",
        "missing_portrait",
        "missing_dna",
      ])
    );
    expect(reasons).toHaveLength(3);
  });

  it("returns an empty array (needsSetup: false) for a fully-built character", () => {
    const reasons = computeCharacterNeedsSetupReasons({
      data: {
        source: "manual",
        description: "เด็กชายวัยสิบสองปีที่ฉลาดเกินวัย",
        visualBible: { designDna: VALID_DESIGN_DNA },
      },
      hasApprovedOrGeneratedPortrait: true,
    });

    expect(reasons).toEqual([]);
  });

  it("does NOT add missing_portrait when the portrait signal is unknown (undefined) — avoids a false positive for un-batched call sites", () => {
    const reasons = computeCharacterNeedsSetupReasons({
      data: { description: "has DNA" },
      hasApprovedOrGeneratedPortrait: undefined,
    });

    expect(reasons).not.toContain("missing_portrait");
  });

  it("flags description-only rows as missing DNA", () => {
    const reasons = computeCharacterNeedsSetupReasons({
      data: { source: "manual", description: "มีคำอธิบายตัวละครแล้ว" },
      hasApprovedOrGeneratedPortrait: true,
    });

    expect(reasons).toEqual(["missing_dna"]);
  });

  it("flags malformed persisted design DNA instead of treating it as canonical", () => {
    const reasons = computeCharacterNeedsSetupReasons({
      data: {
        description: "มีคำอธิบายตัวละครแล้ว",
        visualBible: {
          designDna: { faceIdentity: { hair: "only one field" } },
        },
      },
      hasApprovedOrGeneratedPortrait: true,
    });

    expect(reasons).toEqual(["missing_dna"]);
  });

  it("flags missing_dna when description is an empty/whitespace string", () => {
    const reasons = computeCharacterNeedsSetupReasons({
      data: { description: "   " },
      hasApprovedOrGeneratedPortrait: true,
    });

    expect(reasons).toEqual(["missing_dna"]);
  });

  it("flags missing_dna when data is null/undefined", () => {
    expect(
      computeCharacterNeedsSetupReasons({
        data: null,
        hasApprovedOrGeneratedPortrait: true,
      })
    ).toEqual(["missing_dna"]);
    expect(
      computeCharacterNeedsSetupReasons({
        data: undefined,
        hasApprovedOrGeneratedPortrait: true,
      })
    ).toEqual(["missing_dna"]);
  });

  it("does not flag auto_registered_from_story for a manually-created character", () => {
    const reasons = computeCharacterNeedsSetupReasons({
      data: { source: "manual", description: "full DNA text" },
      hasApprovedOrGeneratedPortrait: true,
    });

    expect(reasons).not.toContain("auto_registered_from_story");
  });
});
