import { describe, it, expect } from "vitest";
import {
  planTieIn,
  screenClaims,
  evaluateFatigue,
  isDisclosureSeparateFromPrompt,
  approveTieIn,
  removeTieIn,
  canRunPaidGeneration,
  buildTieInProvenance,
  isRegulatedCategory,
  type PlanTieInInput,
} from "../verticalDramaProductTieIn";
import type { VerticalDramaProductTieInConfig } from "@shared/verticalDramaSeries";

function config(overrides: Partial<VerticalDramaProductTieInConfig> = {}): VerticalDramaProductTieInConfig {
  return {
    enabled: true,
    productName: "GlowCream",
    referenceAssetIds: ["asset-1"],
    productSource: "marketplace",
    disclosurePolicy: "caption_disclosure",
    regulatedCategory: "none",
    allowedStoryFunctions: ["daily_use"],
    forbiddenClaims: [],
    maxEpisodesWithTieInPerTenEpisodes: 3,
    requireHumanApproval: true,
    ...overrides,
  };
}

function planInput(overrides: Partial<PlanTieInInput> = {}): PlanTieInInput {
  return {
    config: config(),
    episodeNumber: 5,
    shotNumbers: [3, 4],
    storyFunction: "daily_use",
    ...overrides,
  };
}

describe("tie-in compliance", () => {
  it("blocks when the product unrealistically solves the main conflict", () => {
    const r = planTieIn(planInput({ resolvesMainConflict: true }));
    expect(r.blocked).toBe(true);
    expect(r.warnings.some((w) => w.code === "VD_TIE_IN_RESOLVES_MAIN_CONFLICT")).toBe(true);
  });

  it("requires an explicit story function", () => {
    const r = planTieIn(planInput({ storyFunction: "" }));
    expect(r.blocked).toBe(true);
    expect(r.warnings.some((w) => w.code === "VD_TIE_IN_MISSING_STORY_FUNCTION")).toBe(true);
  });

  it("blocks unsupported regulated (medical) claims", () => {
    const r = planTieIn(planInput({ config: config({ regulatedCategory: "medical" }), proposedClaims: ["clinically proven to cure acne"] }));
    expect(r.blocked).toBe(true);
    expect(r.usage.claimsReview.unsupportedClaimsDetected).toBe(true);
  });

  it("hard-blocks explicitly forbidden claims regardless of category", () => {
    const res = screenClaims(config({ forbiddenClaims: ["miracle"] }), ["a miracle serum"]);
    expect(res.hardBlock).toBe(true);
  });
});

describe("fatigue / diversity", () => {
  it("prevents repeated placement over the limit", () => {
    const history = Array.from({ length: 9 }, (_v, i) => ({ episodeNumber: i + 1, hadTieIn: true }));
    const f = evaluateFatigue(history, 3);
    expect(f.exceeded).toBe(true);
    const r = planTieIn(planInput({ placementHistory: history }));
    expect(r.warnings.some((w) => w.code === "VD_TIE_IN_PLACEMENT_FATIGUE")).toBe(true);
  });

  it("allows placement under the limit", () => {
    const history = [{ episodeNumber: 1, hadTieIn: true }];
    expect(evaluateFatigue(history, 3).exceeded).toBe(false);
  });
});

describe("disclosure separation", () => {
  it("stores disclosure text separate from the video prompt", () => {
    const r = planTieIn(planInput({ disclosureText: "Paid partnership" }));
    expect(r.usage.disclosureRequired).toBe(true);
    expect(r.usage.disclosureText).toBe("Paid partnership");
  });

  it("detects disclosure copy leaking into the prompt payload", () => {
    expect(isDisclosureSeparateFromPrompt({ prompt: "hero walks" }, "Paid partnership")).toBe(true);
    expect(isDisclosureSeparateFromPrompt({ prompt: "hero walks. Paid partnership" }, "Paid partnership")).toBe(false);
  });
});

describe("approval gate + provenance", () => {
  it("requires human approval before paid generation and records the approver", () => {
    const r = planTieIn(planInput());
    expect(r.requiresHumanApproval).toBe(true);
    expect(canRunPaidGeneration(r, r.usage)).toBe(false);
    const approved = approveTieIn(r.usage, "42");
    expect(approved.approvedByUserId).toBe("42");
    expect(canRunPaidGeneration(r, approved)).toBe(true);
  });

  it("regulated categories require manual review first", () => {
    const r = planTieIn(planInput({ config: config({ regulatedCategory: "beauty" }) }));
    expect(r.requiresRegulatedManualReview).toBe(true);
    expect(isRegulatedCategory("beauty")).toBe(true);
    expect(isRegulatedCategory("none")).toBe(false);
  });

  it("is removable and retains productSource provenance", () => {
    const r = planTieIn(planInput());
    const provenance = buildTieInProvenance(config(), r.usage);
    expect(provenance.productSource).toBe("marketplace");
    const removed = removeTieIn(r.usage);
    expect(removed.enabled).toBe(false);
    expect(removed.approvedByUserId).toBeUndefined();
  });
});
