import { describe, expect, it } from "vitest";

import { RemotionLayerSchema } from "../../../../shared/remotion/layerTemplateSchemas";
import type { BrandKit } from "../../../../shared/videoIntelligence/brandKit";
import type { TemplateBuildContext } from "../../../services/videoProjectCompiler";
import { buildGlassFeatureCards } from "../glass_feature_cards";

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
  cards: [
    { title: "Fast", description: "Blazing performance" },
    { title: "Secure", description: "Encrypted end to end" },
  ],
};

describe("glass_feature_cards", () => {
  it("builds only whitelisted layer types", () => {
    const layers = buildGlassFeatureCards(VALID_PARAMS, buildCtx());
    expect(layers.every(layer => WHITELISTED_TYPES.includes(layer.type))).toBe(true);
  });

  it("respects maxItems / duration bounds", () => {
    const sixCards = {
      cards: Array.from({ length: 6 }, (_, index) => ({ title: `Card ${index}` })),
    };
    const layers = buildGlassFeatureCards(sixCards, buildCtx());
    const backgroundLayers = layers.filter(layer =>
      layer.id.startsWith("glass_feature_card_bg_")
    );
    expect(backgroundLayers).toHaveLength(4);
  });

  it("consumes brand tokens from ctx.brandKit", () => {
    const layers = buildGlassFeatureCards(VALID_PARAMS, buildCtx());
    const bg = layers.find(layer => layer.id === "glass_feature_card_bg_0");
    expect(bg).toMatchObject({ type: "motionGraphic", color: "#654321" });
    const title = layers.find(layer => layer.id === "glass_feature_card_title_0");
    expect(title).toMatchObject({ type: "text", fontFamily: "Inter" });
  });

  it("rejects invalid params via paramsSchema", () => {
    expect(() => buildGlassFeatureCards({ cards: [] }, buildCtx())).toThrow();
    expect(() =>
      buildGlassFeatureCards({ ...VALID_PARAMS, extra: true }, buildCtx())
    ).toThrow();
  });

  it("emits <= 40 layers", () => {
    const nineCards = {
      cards: Array.from({ length: 9 }, (_, index) => ({
        title: `Card ${index}`,
        description: "desc",
      })),
    };
    const layers = buildGlassFeatureCards(nineCards, buildCtx());
    expect(layers.length).toBeLessThanOrEqual(40);
  });

  it("every emitted layer parses under RemotionLayerSchema", () => {
    const layers = buildGlassFeatureCards(VALID_PARAMS, buildCtx());
    for (const layer of layers) {
      expect(RemotionLayerSchema.safeParse(layer).success).toBe(true);
    }
  });
});
