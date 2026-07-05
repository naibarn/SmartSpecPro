import { describe, it, expect, vi } from "vitest";

/**
 * Regression test for the "character portrait ignores description/age" bug
 * (Vertical Drama character image generation). Root cause: `data.description`
 * — the field that actually stores a character's age/gender/core traits
 * (e.g. "เด็กชายวัยสิบสองปีที่ฉลาดเกินวัย...") — was never read by
 * `extractCharacterDescription`, so it silently dropped out of the prompt
 * fed to `generateCharacterVisualPrompts`, letting the LLM invent an
 * unconstrained (adult) identity.
 *
 * This file mocks every module-level dependency of
 * `../verticalDramaCharacters` (db, trpc procedure builders, feature-flag
 * middleware, and the paid-service imports) purely so the module can be
 * imported for its one pure helper function — no procedure/mutation logic
 * is exercised here. Mirrors the existing `vi.mock("../db", ...)` pattern
 * used by `publicSitemap.test.ts` and `media.addToLibrary.test.ts`.
 */

vi.mock("../../db", () => ({
  db: {
    get instance() {
      return Promise.reject(new Error("database unavailable"));
    },
  },
}));

vi.mock("../../_core/trpc", () => ({
  router: (routes: unknown) => routes,
  protectedProcedure: {
    use: () => ({
      input: () => ({ mutation: () => vi.fn(), query: () => vi.fn() }),
    }),
  },
}));

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

import { extractCharacterDescription } from "../verticalDramaCharacters";

describe("extractCharacterDescription", () => {
  it("includes data.description (age/gender/core traits) and lists it first", () => {
    const result = extractCharacterDescription({
      description: "เด็กชายวัยสิบสองปีที่ฉลาดเกินวัยและปกป้องแม่เสมอไม่ว่าจะเกิดอะไรขึ้น",
      personality: "warm but anxious",
    });

    expect(result).toBeDefined();
    expect(result).toContain("เด็กชายวัยสิบสองปี");
    // Description must lead the aggregated string so it isn't buried behind
    // personality/backstory prose in the downstream LLM prompt.
    expect(result!.indexOf("Description:")).toBe(0);
    expect(result!.indexOf("Description:")).toBeLessThan(result!.indexOf("Personality:"));
  });

  it("returns only the description when no other fields are present (the exact bug scenario)", () => {
    const result = extractCharacterDescription({
      description: "เด็กชายวัยสิบสองปีที่ฉลาดเกินวัยและปกป้องแม่เสมอไม่ว่าจะเกิดอะไรขึ้น",
    });

    expect(result).toBe(
      "Description: เด็กชายวัยสิบสองปีที่ฉลาดเกินวัยและปกป้องแม่เสมอไม่ว่าจะเกิดอะไรขึ้น",
    );
  });

  it("returns undefined when data is null", () => {
    expect(extractCharacterDescription(null)).toBeUndefined();
  });

  it("returns undefined when data has none of the recognized fields", () => {
    expect(extractCharacterDescription({ someOtherField: "x" })).toBeUndefined();
  });

  it("still aggregates personality/backstory/identityLock/wardrobeRules when description is absent (no regression)", () => {
    const result = extractCharacterDescription({
      personality: "brave",
      backstory: "grew up in the city",
      identityLock: "scar on left cheek",
      wardrobeRules: ["always wears a red scarf", ""],
    });

    expect(result).toBe(
      "Personality: brave | Backstory: grew up in the city | Identity lock: scar on left cheek | Wardrobe rules: always wears a red scarf",
    );
  });
});
