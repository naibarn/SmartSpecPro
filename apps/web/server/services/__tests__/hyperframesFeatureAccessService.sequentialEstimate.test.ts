/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) — section
 * 10 §4.2. New file — does not edit the existing
 * `hyperframesFeatureAccessService.test.ts`.
 *
 * Fixtures cloned from `hyperframesFeatureAccessService.test.ts:28-45` (preview
 * scale) and `:47-77` (final composite scale, large enough that `Math.ceil`
 * does not collapse two different multipliers to the same integer — see
 * section-10 spec §2.3a).
 */
import { describe, expect, it } from "vitest";

import { HyperframesCreditEstimateSchema } from "@shared/hyperframes/contracts";
import { buildHyperframesCreditEstimate } from "../hyperframesFeatureAccessService";

function previewFixture(imageJobCount?: number) {
  return buildHyperframesCreditEstimate({
    tenantId: "tenant_1",
    userId: 1,
    runId: "mar_1",
    renderIntent: "preview" as const,
    compositionMode: "storyboard_motion_preview" as const,
    costClass: "composition_preview" as const,
    compositionInputHash: "hf_input",
    templateVersion: "1.0.0",
    ...(imageJobCount === undefined ? {} : { imageJobCount }),
  });
}

const finalFixtureInput = {
  tenantId: "tenant_1",
  userId: 1,
  runId: "manual_run_94",
  renderIntent: "final" as const,
  compositionMode: "captioned_final_composite" as const,
  costClass: "composition_render" as const,
  compositionInputHash: "hf_final_input",
  templateVersion: "official_html_css_browser_final_composite_v1",
  platformPreset: {
    presetId: "generic_vertical_9_16",
    label: "Generic vertical 9:16",
    aspectRatio: "9:16",
    width: 1080,
    height: 1920,
    fps: 30,
    durationSeconds: 240,
    maxDurationSeconds: 240,
    safeZonePercent: 8,
    exportFormat: "mp4",
  },
} as const;

describe("buildHyperframesCreditEstimate — imageJobCount (Feature 136 §5.3)", () => {
  it("echoes imageJobCount: 9 onto the estimate", () => {
    const estimate = previewFixture(9);
    expect(estimate.imageJobCount).toBe(9);
  });

  it("omits the key when imageJobCount: 1 is passed explicitly", () => {
    const estimate = previewFixture(1);
    expect(Object.prototype.hasOwnProperty.call(estimate, "imageJobCount")).toBe(
      false
    );
  });

  it("omits the key when imageJobCount is not passed at all (baseline preserved)", () => {
    const estimate = previewFixture();
    expect(Object.prototype.hasOwnProperty.call(estimate, "imageJobCount")).toBe(
      false
    );
    expect(JSON.stringify(estimate)).not.toContain("imageJobCount");
  });

  it.each([0, -3, 2.5, Number.NaN, 999])(
    "normalizes invalid imageJobCount = %p without throwing, always inside a valid estimate",
    invalidValue => {
      const estimate = previewFixture(invalidValue as number);
      expect(() => HyperframesCreditEstimateSchema.parse(estimate)).not.toThrow();
      if (Object.prototype.hasOwnProperty.call(estimate, "imageJobCount")) {
        expect(estimate.imageJobCount).toBeGreaterThanOrEqual(1);
        expect(estimate.imageJobCount).toBeLessThanOrEqual(64);
        expect(Number.isInteger(estimate.imageJobCount)).toBe(true);
      }
    }
  );

  it("credit independence: imageJobCount never changes estimatedCredits, idempotencyKey, or estimateRef", () => {
    const withOne = previewFixture(1);
    const withNine = previewFixture(9);
    expect(withNine.estimatedCredits).toBe(withOne.estimatedCredits);
    expect(withNine.idempotencyKey).toBe(withOne.idempotencyKey);
    expect(withNine.estimateRef).toBe(withOne.estimateRef);
  });

  it("the worker complexity multiplier (not imageJobCount) still drives estimatedCredits at final-composite scale", () => {
    const base = buildHyperframesCreditEstimate({
      ...finalFixtureInput,
      workerComplexityMultiplier: 1.0,
    });
    const sequential = buildHyperframesCreditEstimate({
      ...finalFixtureInput,
      workerComplexityMultiplier: 1.1,
    });
    expect(sequential.estimatedCredits).toBeGreaterThan(base.estimatedCredits);
  });
});
