import { describe, expect, it } from "vitest";

import { RemotionLayerSchema } from "../../../../shared/remotion/layerTemplateSchemas";
import type { BrandKit } from "../../../../shared/videoIntelligence/brandKit";
import type { TemplateBuildContext } from "../../../services/videoProjectCompiler";
import { buildAnimatedChartBasic } from "../animated_chart_basic";

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
  values: [
    { label: "Q1", value: 40 },
    { label: "Q2", value: 80 },
  ],
};

describe("animated_chart_basic", () => {
  it("builds only whitelisted layer types", () => {
    const layers = buildAnimatedChartBasic(VALID_PARAMS, buildCtx());
    expect(layers.every(layer => WHITELISTED_TYPES.includes(layer.type))).toBe(true);
  });

  it("respects maxItems / duration bounds", () => {
    const twelveValues = {
      values: Array.from({ length: 12 }, (_, index) => ({ label: `Q${index}`, value: 50 })),
    };
    const layers = buildAnimatedChartBasic(twelveValues, buildCtx());
    const bars = layers.filter(layer => layer.id.startsWith("animated_chart_bar_"));
    expect(bars).toHaveLength(8);
  });

  it("consumes brand tokens from ctx.brandKit", () => {
    const layers = buildAnimatedChartBasic(VALID_PARAMS, buildCtx());
    const bar = layers.find(layer => layer.id === "animated_chart_bar_0");
    expect(bar).toMatchObject({ type: "motionGraphic", color: "#123456" });
    const value = layers.find(layer => layer.id === "animated_chart_value_0");
    expect(value).toMatchObject({ type: "text", color: "#654321" });
  });

  it("rejects invalid params via paramsSchema", () => {
    expect(() => buildAnimatedChartBasic({ values: [] }, buildCtx())).toThrow();
    expect(() =>
      buildAnimatedChartBasic({ ...VALID_PARAMS, extra: 1 }, buildCtx())
    ).toThrow();
  });

  it("emits <= 40 layers", () => {
    const twentyValues = {
      values: Array.from({ length: 20 }, (_, index) => ({ label: `Q${index}`, value: 50 })),
    };
    const layers = buildAnimatedChartBasic(twentyValues, buildCtx());
    expect(layers.length).toBeLessThanOrEqual(40);
  });

  it("every emitted layer parses under RemotionLayerSchema", () => {
    const layers = buildAnimatedChartBasic(VALID_PARAMS, buildCtx());
    for (const layer of layers) {
      expect(RemotionLayerSchema.safeParse(layer).success).toBe(true);
    }
  });
});
