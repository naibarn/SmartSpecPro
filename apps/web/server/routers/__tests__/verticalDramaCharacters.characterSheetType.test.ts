/**
 * Vertical Drama CHARACTER tab — coverage for the character-sheet
 * consolidation (vertical-drama-character-sheet-consolidation plan, Phase B):
 * the merged `generateCharacterSheet` mutation replaces the old separate
 * `generateCharacterTurnaround` + `generateCharacterSheet` endpoints with a
 * single `sheetType`-driven flow.
 *
 * Covers the two pure, exported helper functions the mutation's `sheetType`
 * resolution/asset-tagging logic is built on:
 *  - `resolveCharacterSheetType` — `"auto"` -> `"turnaround"` resolution.
 *  - `resolveCharacterSheetAssetTag` — role/metadata tagging for all 3 tiers
 *    (turnaround / full_combined / the 11 new Character Design Bible
 *    formats), including the highest-risk regression guard: none of the new
 *    formats may ever produce a role inside `CHARACTER_SHEET_ROLES`
 *    (`verticalDramaCharacterStock.ts`), which would wrongly make a
 *    non-face-bearing sheet (e.g. a color palette) eligible as a second
 *    identity-lock reference for storyboard/shot generation.
 *
 * Same minimal-mock-module-graph convention as
 * `verticalDramaCharacters.modelSelection.test.ts` — everything is mocked to
 * a no-op shape purely so the router module can be imported; only the
 * pure-ish helper functions under test are exercised.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    instance: {},
  },
}));

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      use: () => proc,
      input: () => proc,
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
    };
    return proc;
  };
  return {
    router: (routes: Record<string, unknown>) => routes,
    protectedProcedure: createProcedure(),
  };
});

vi.mock("../../middleware/requireFeatureFlag", () => ({
  requireFeatureFlag: () => (x: unknown) => x,
}));

vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: { getPrimaryPortraitUrl: vi.fn() },
  VerticalDramaCharacterStockError: class extends Error {},
}));

vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: { generateImageAsync: vi.fn() },
  DEFAULT_MODELS: { image: "google-nano-banana-pro" },
}));

vi.mock("../../services/pricingCalculator", () => ({
  calculateCreditCost: vi.fn(() => 10),
}));

vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  refundCredits: vi.fn(),
}));

vi.mock("../../_core/tokens", () => ({
  signBearerToken: vi.fn(() => "token"),
}));

vi.mock("../../services/verticalDramaCharacterImageGeneration", () => ({
  generateCharacterVisualPrompts: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));

vi.mock("../../services/rateLimiter", () => ({
  mediaGenerationLimiter: { isAllowed: vi.fn(() => true), getResetTime: vi.fn(() => 0) },
}));

vi.mock("../../services/mediaAssetService", () => ({
  createAssetFromAttachment: vi.fn(),
}));

import {
  CHARACTER_SHEET_TYPE_VALUES,
  resolveCharacterSheetType,
  resolveCharacterSheetAssetTag,
} from "../verticalDramaCharacters";

describe("resolveCharacterSheetType — auto -> turnaround resolution", () => {
  it("resolves 'auto' to 'turnaround' (preserves today's cheaper/older default)", () => {
    expect(resolveCharacterSheetType("auto")).toBe("turnaround");
  });

  it("resolves undefined (schema default not yet applied) to 'turnaround'", () => {
    expect(resolveCharacterSheetType(undefined)).toBe("turnaround");
  });

  it("passes 'turnaround' through unchanged", () => {
    expect(resolveCharacterSheetType("turnaround")).toBe("turnaround");
  });

  it("passes 'full_combined' through unchanged", () => {
    expect(resolveCharacterSheetType("full_combined")).toBe("full_combined");
  });

  it.each(
    CHARACTER_SHEET_TYPE_VALUES.filter(
      (v) => v !== "auto" && v !== "turnaround" && v !== "full_combined",
    ),
  )("passes the new Character Design Bible format '%s' through unchanged", (sheetType) => {
    expect(resolveCharacterSheetType(sheetType)).toBe(sheetType);
  });
});

describe("resolveCharacterSheetAssetTag — role/metadata tagging (3 tiers)", () => {
  it("tags 'turnaround' with the pre-existing 'character_sheet_turnaround' role and no metadata", () => {
    expect(resolveCharacterSheetAssetTag("turnaround")).toEqual({
      role: "character_sheet_turnaround",
      metadata: null,
    });
  });

  it("tags 'full_combined' with the pre-existing 'character_sheet_full' role and no metadata", () => {
    expect(resolveCharacterSheetAssetTag("full_combined")).toEqual({
      role: "character_sheet_full",
      metadata: null,
    });
  });

  it("tags a new Character Design Bible format (e.g. 'cover') with the new 'character_design_bible' role plus metadata.sheetType", () => {
    expect(resolveCharacterSheetAssetTag("cover")).toEqual({
      role: "character_design_bible",
      metadata: { sheetType: "cover" },
    });
  });

  it.each(
    CHARACTER_SHEET_TYPE_VALUES.filter(
      (v) => v !== "auto" && v !== "turnaround" && v !== "full_combined",
    ),
  )("tags every new format '%s' with role 'character_design_bible' — NEVER a CHARACTER_SHEET_ROLES value (highest-risk regression guard)", (sheetType) => {
    const tag = resolveCharacterSheetAssetTag(sheetType);
    expect(tag.role).toBe("character_design_bible");
    expect(tag.role).not.toBe("character_sheet_turnaround");
    expect(tag.role).not.toBe("character_sheet_full");
    expect(tag.metadata).toEqual({ sheetType });
  });
});
