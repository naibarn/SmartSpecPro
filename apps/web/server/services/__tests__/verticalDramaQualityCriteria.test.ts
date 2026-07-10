import { describe, expect, it } from "vitest";
import {
  CRITERIA_VERSION,
  QUALITY_FINDING_SEVERITIES,
} from "@shared/verticalDramaSeries/qualityCriteria";
import {
  getVerticalDramaQualityCriteriaBundle,
  renderCriteriaVersionMarker,
} from "../verticalDramaQualityCriteria";

describe("verticalDramaQualityCriteria server wrapper (spec §11)", () => {
  it("getVerticalDramaQualityCriteriaBundle returns a bundle stamped with the current CRITERIA_VERSION", () => {
    const bundle = getVerticalDramaQualityCriteriaBundle();

    expect(bundle.version).toBe(CRITERIA_VERSION);
    expect(typeof bundle.dialogueRulesV2).toBe("string");
    expect(bundle.dialogueRulesV2.length).toBeGreaterThan(0);
    expect(typeof bundle.sceneContractRequirements).toBe("string");
    expect(bundle.sceneContractRequirements.length).toBeGreaterThan(0);
    expect(typeof bundle.dramaturgyRules).toBe("string");
    expect(bundle.dramaturgyRules.length).toBeGreaterThan(0);
    expect(Array.isArray(bundle.severityTaxonomy)).toBe(true);
  });

  it("renderCriteriaVersionMarker returns a stable, greppable string containing the version number", () => {
    const marker = renderCriteriaVersionMarker();

    expect(marker).toContain(String(CRITERIA_VERSION));
    expect(marker).toBe(renderCriteriaVersionMarker());
    // Greppable literal convention: HTML-comment-style marker.
    expect(marker).toMatch(/VD_QUALITY_CRITERIA_V\d+/);
  });

  it("bundle.severityTaxonomy matches shared QUALITY_FINDING_SEVERITIES exactly", () => {
    const bundle = getVerticalDramaQualityCriteriaBundle();

    expect(bundle.severityTaxonomy).toEqual(QUALITY_FINDING_SEVERITIES);
  });

  it("marker changes only when CRITERIA_VERSION changes (embeds the exact version value)", () => {
    const marker = renderCriteriaVersionMarker();
    expect(marker).toContain(`V${CRITERIA_VERSION}`);
  });
});
