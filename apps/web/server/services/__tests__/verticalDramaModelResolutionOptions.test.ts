/**
 * Vertical Drama Storyboard Completion Plan — Phase 6.2 unit coverage for
 * `deriveModelResolutionOptions` (server/services/modelRegistry.ts):
 * normalizes a model's dynamic resolution/size options from whichever of
 * the 3 possible signal shapes (`configJson.inputFields` resolution/size
 * select, `configJson.supportedResolutions`, or the DB/static `sizes`
 * column) it carries, with per-option credit cost when pricing is
 * resolution-tiered (`pricingFormula: "matrix"`).
 */
import { describe, expect, it } from "vitest";
import { deriveModelResolutionOptions, getStaticModelById } from "../modelRegistry";

describe("deriveModelResolutionOptions (Phase 6.2)", () => {
  it("returns undefined when the model has no resolution/size signal at all (e.g. google-banana-2)", () => {
    const model = getStaticModelById("google-banana-2");
    expect(model).toBeTruthy();
    const options = deriveModelResolutionOptions({
      creditCost: model!.creditCost,
      sizes: model!.sizes,
      configJson: model!.configJson,
    });
    expect(options).toBeUndefined();
  });

  it("derives options from configJson.inputFields resolution select with per-option matrix pricing (veo-3-1, 720p/1080p/4K)", () => {
    const model = getStaticModelById("veo-3-1");
    expect(model).toBeTruthy();
    const options = deriveModelResolutionOptions({
      creditCost: model!.creditCost,
      sizes: model!.sizes,
      configJson: model!.configJson,
    });
    expect(options).toBeDefined();
    const values = options!.map((o) => o.value);
    expect(values).toEqual(["720p", "1080p", "4K"]);
    // Veo 3.1 Quality tiers: 720p=2000, 1080p=2000, 4K=4000 (from buildVeo31Config).
    expect(options!.find((o) => o.value === "720p")?.creditCost).toBe(2000);
    expect(options!.find((o) => o.value === "1080p")?.creditCost).toBe(2000);
    expect(options!.find((o) => o.value === "4K")?.creditCost).toBe(4000);
    // Labels come from the inputFields option's own `label`, not just the value.
    expect(options!.find((o) => o.value === "1080p")?.label).toBe("1080P");
  });

  it("derives options from configJson.inputFields resolution select for veo3-lite (150/300/600)", () => {
    const model = getStaticModelById("veo3/generate-veo-3-video-lite");
    expect(model).toBeTruthy();
    const options = deriveModelResolutionOptions({
      creditCost: model!.creditCost,
      sizes: model!.sizes,
      configJson: model!.configJson,
    });
    expect(options).toBeDefined();
    expect(options!.find((o) => o.value === "720p")?.creditCost).toBe(150);
    expect(options!.find((o) => o.value === "1080p")?.creditCost).toBe(300);
    expect(options!.find((o) => o.value === "4K")?.creditCost).toBe(600);
  });

  it("derives options from the flat DB/static `sizes` column when there is no configJson signal (flux-2.0)", () => {
    const model = getStaticModelById("flux-2.0");
    expect(model).toBeTruthy();
    const options = deriveModelResolutionOptions({
      creditCost: model!.creditCost,
      sizes: model!.sizes,
      configJson: model!.configJson,
    });
    expect(options).toBeDefined();
    expect(options!.map((o) => o.value)).toEqual(["1024x1024", "1024x1792", "1792x1024"]);
    // Flat-priced model — no per-option creditCost override.
    for (const o of options!) {
      expect(o.creditCost).toBeUndefined();
    }
  });

  it("derives a single-size option from `sizes` (google-banana-2-lite: 1K)", () => {
    const model = getStaticModelById("google-banana-2-lite");
    expect(model).toBeTruthy();
    const options = deriveModelResolutionOptions({
      creditCost: model!.creditCost,
      sizes: model!.sizes,
      configJson: model!.configJson,
    });
    expect(options).toEqual([{ value: "1K", label: "1K" }]);
  });

  it("derives options from configJson.supportedResolutions when there is no inputFields resolution/size select", () => {
    const options = deriveModelResolutionOptions({
      creditCost: 100,
      configJson: {
        supportedResolutions: ["480p", "720p"],
        pricingFormula: "flat",
        pricingTiers: { default: 100 },
      },
    });
    expect(options).toEqual([
      { value: "480p", label: "480p" },
      { value: "720p", label: "720p" },
    ]);
  });

  it("prefers configJson.inputFields over supportedResolutions when both are present", () => {
    const options = deriveModelResolutionOptions({
      creditCost: 100,
      configJson: {
        supportedResolutions: ["should-not-be-used"],
        inputFields: [
          {
            key: "resolution",
            label: "Resolution",
            type: "select",
            options: [{ value: "1080p", label: "Full HD" }],
          },
        ],
      },
    });
    expect(options).toEqual([{ value: "1080p", label: "Full HD" }]);
  });

  it("de-duplicates repeated option values", () => {
    const options = deriveModelResolutionOptions({
      creditCost: 100,
      configJson: {
        inputFields: [
          {
            key: "size",
            label: "Size",
            type: "select",
            options: [
              { value: "1K", label: "1K" },
              { value: "1K", label: "1K (dup)" },
              { value: "2K", label: "2K" },
            ],
          },
        ],
      },
    });
    expect(options).toEqual([
      { value: "1K", label: "1K" },
      { value: "2K", label: "2K" },
    ]);
  });

  it("returns undefined for an empty inputFields options array (falls through to no signal)", () => {
    const options = deriveModelResolutionOptions({
      creditCost: 100,
      configJson: {
        inputFields: [{ key: "resolution", label: "Resolution", type: "select", options: [] }],
      },
    });
    expect(options).toBeUndefined();
  });

  it("does not attach creditCost per option when pricingFormula is not matrix (flat HappyHorse-style config)", () => {
    const options = deriveModelResolutionOptions({
      creditCost: 100,
      configJson: {
        pricingFormula: "flat",
        pricingTiers: { default: 100 },
        inputFields: [
          {
            key: "resolution",
            label: "Resolution",
            type: "select",
            options: [
              { value: "720p", label: "720p" },
              { value: "1080p", label: "1080p" },
            ],
            affectsPricing: true,
          },
        ],
      },
    });
    expect(options).toEqual([
      { value: "720p", label: "720p" },
      { value: "1080p", label: "1080p" },
    ]);
  });

  it("falls back to the option's value as label when no label is provided", () => {
    const options = deriveModelResolutionOptions({
      creditCost: 100,
      configJson: {
        inputFields: [
          {
            key: "resolution",
            label: "Resolution",
            type: "select",
            options: [{ value: "2K" }],
          },
        ],
      },
    });
    expect(options).toEqual([{ value: "2K", label: "2K" }]);
  });
});
