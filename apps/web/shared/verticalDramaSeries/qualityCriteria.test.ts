import { describe, expect, it } from "vitest";
import {
  CRITERIA_VERSION,
  QUALITY_CRITERIA_ANCHOR_LINE_MAX_GAP_SHOTS,
  QUALITY_CRITERIA_CLUE_BUDGET_PER_SHOT,
  QUALITY_CRITERIA_SCENE_CONTRACT_OPTIONAL_FIELDS,
  QUALITY_CRITERIA_SCENE_CONTRACT_REQUIRED_FIELDS,
  QUALITY_CRITERIA_V3_SCORECARD_DIMENSIONS,
  QUALITY_FINDING_SEVERITIES,
  buildCriteriaVersionMarker,
  buildDialogueRulesV2Fragment,
  buildDramaturgyRulesFragment,
  buildSceneContractRequirementsFragment,
} from "./qualityCriteria";

describe("qualityCriteria (Feature 132 §11 shared criteria module)", () => {
  it("CRITERIA_VERSION is a positive integer", () => {
    expect(Number.isInteger(CRITERIA_VERSION)).toBe(true);
    expect(CRITERIA_VERSION).toBeGreaterThan(0);
  });

  it("QUALITY_CRITERIA_CLUE_BUDGET_PER_SHOT equals 2", () => {
    expect(QUALITY_CRITERIA_CLUE_BUDGET_PER_SHOT).toBe(2);
  });

  it("QUALITY_CRITERIA_ANCHOR_LINE_MAX_GAP_SHOTS equals 3", () => {
    expect(QUALITY_CRITERIA_ANCHOR_LINE_MAX_GAP_SHOTS).toBe(3);
  });

  it("QUALITY_FINDING_SEVERITIES contains exactly minor, moderate, major, structural in that order", () => {
    expect(QUALITY_FINDING_SEVERITIES).toEqual([
      "minor",
      "moderate",
      "major",
      "structural",
    ]);
  });

  it("QUALITY_CRITERIA_V3_SCORECARD_DIMENSIONS contains exactly the 4 new v3 dimensions", () => {
    expect(QUALITY_CRITERIA_V3_SCORECARD_DIMENSIONS).toEqual([
      "clarity",
      "character_consistency",
      "evidence_payoff",
      "threat_escalation",
    ]);
  });

  it("dialogue rules v2 fragment text includes the clue-budget, anchor-line, and spoken-register rules", () => {
    const fragment = buildDialogueRulesV2Fragment();

    // Version marker present and greppable.
    expect(fragment).toContain(buildCriteriaVersionMarker());

    // Mystery-grounding incl. the storyFunction ritual-exemption clause.
    expect(fragment).toMatch(/storyFunction/);
    expect(fragment).toMatch(/ritual|dreamlike/i);

    // Pressure-not-summary.
    expect(fragment).toMatch(/pressure/i);
    expect(fragment).toMatch(/plot summary/i);

    // Clue budget incl. "minimal context per clue".
    expect(fragment).toMatch(/clue budget/i);
    expect(fragment).toMatch(/minimal context/i);
    expect(fragment).toContain(String(QUALITY_CRITERIA_CLUE_BUDGET_PER_SHOT));

    // Anchor-line cadence.
    expect(fragment).toMatch(/anchor line/i);

    // Read-aloud one-idea-per-line.
    expect(fragment).toMatch(/read-aloud/i);
    expect(fragment).toMatch(/one main idea/i);

    // Thai spoken-register rules: particles, contractions, no written-essay
    // connectives, formality matching, narration-is-a-violation.
    expect(fragment).toMatch(/สิ\/นะ\/ล่ะ\/เหรอ|สิ.*นะ.*ล่ะ.*เหรอ/);
    expect(fragment).toMatch(/contraction/i);
    expect(fragment).toMatch(/อย่างไรก็ตาม/);
    expect(fragment).toMatch(/formality/i);
    expect(fragment).toMatch(/narration/i);
  });

  it("scene-contract requirement fragment lists all required contract fields from spec §6.1", () => {
    const fragment = buildSceneContractRequirementsFragment();

    expect(fragment).toContain(buildCriteriaVersionMarker());
    for (const field of QUALITY_CRITERIA_SCENE_CONTRACT_REQUIRED_FIELDS) {
      expect(fragment).toContain(field);
    }
    for (const field of QUALITY_CRITERIA_SCENE_CONTRACT_OPTIONAL_FIELDS) {
      expect(fragment).toContain(field);
    }
  });

  it("dramaturgy rules fragment covers want/obstacle/choice/cost, escalation, and activation", () => {
    const fragment = buildDramaturgyRulesFragment();

    expect(fragment).toContain(buildCriteriaVersionMarker());
    expect(fragment).toMatch(/want\/obstacle\/choice\/cost|want.*obstacle.*choice.*cost/i);
    expect(fragment).toMatch(/escalat/i);
    expect(fragment).toMatch(/activat/i);
  });

  it("prompt-fragment builders are deterministic (same output across calls)", () => {
    expect(buildDialogueRulesV2Fragment()).toBe(buildDialogueRulesV2Fragment());
    expect(buildSceneContractRequirementsFragment()).toBe(
      buildSceneContractRequirementsFragment(),
    );
    expect(buildDramaturgyRulesFragment()).toBe(buildDramaturgyRulesFragment());
  });

  it("buildCriteriaVersionMarker returns a stable string containing the version number", () => {
    const marker = buildCriteriaVersionMarker();
    expect(marker).toContain(String(CRITERIA_VERSION));
    expect(marker).toBe(buildCriteriaVersionMarker());
  });
});
