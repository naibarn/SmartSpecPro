import { describe, expect, it } from "vitest";

import { RemotionLayerSchema } from "../../../../shared/remotion/layerTemplateSchemas";
import type { BrandKit } from "../../../../shared/videoIntelligence/brandKit";
import type { TemplateBuildContext } from "../../../services/videoProjectCompiler";
import { buildComparisonStage } from "../comparison_stage";

const BRAND_KIT: BrandKit = {
  colors: { primary: "#123456", secondary: "#abcdef", accent: "#654321" },
  fonts: { heading: "Playfair", body: "Inter" },
  captionPresetId: "karaoke_word",
  locks: {},
};

const WHITELISTED_TYPES = ["image", "video", "text", "svg", "motionGraphic", "audio"];

function buildCtx(overrides: Partial<TemplateBuildContext> = {}): TemplateBuildContext {
  return {
    format: { width: 1080, height: 1920, fps: 30, durationMs: 8000 },
    brandKit: BRAND_KIT,
    assetResolver: {
      url: id => `https://cdn.example.com/proxy/asset/${id}`,
      sha256: () => undefined,
    },
    ...overrides,
  };
}

const VALID_PARAMS = {
  items: [
    { assetId: 1, label: "Before" },
    { assetId: 2, label: "After" },
  ],
};

describe("comparison_stage", () => {
  it("builds only whitelisted layer types", () => {
    const layers = buildComparisonStage(VALID_PARAMS, buildCtx());
    expect(layers.every(layer => WHITELISTED_TYPES.includes(layer.type))).toBe(true);
  });

  it("respects maxItems / duration bounds", () => {
    const fourItems = {
      items: [
        { assetId: 1, label: "A" },
        { assetId: 2, label: "B" },
        { assetId: 3, label: "C" },
        { assetId: 4, label: "D" },
      ],
    };
    const layers = buildComparisonStage(fourItems, buildCtx());
    const images = layers.filter(layer => layer.id.startsWith("comparison_stage_image_"));
    expect(images).toHaveLength(2);
  });

  it("consumes brand tokens from ctx.brandKit", () => {
    const layers = buildComparisonStage(VALID_PARAMS, buildCtx());
    const label = layers.find(layer => layer.id === "comparison_stage_label_0");
    expect(label).toMatchObject({ type: "text", color: "#654321", fontFamily: "Inter" });
  });

  it("rejects invalid params via paramsSchema", () => {
    expect(() => buildComparisonStage({ items: [] }, buildCtx())).toThrow();
    expect(() =>
      buildComparisonStage({ ...VALID_PARAMS, extra: 1 }, buildCtx())
    ).toThrow();
  });

  it("emits <= 40 layers", () => {
    const layers = buildComparisonStage(VALID_PARAMS, buildCtx());
    expect(layers.length).toBeLessThanOrEqual(40);
  });

  it("every emitted layer parses under RemotionLayerSchema", () => {
    const layers = buildComparisonStage(VALID_PARAMS, buildCtx());
    for (const layer of layers) {
      expect(RemotionLayerSchema.safeParse(layer).success).toBe(true);
    }
  });
});
