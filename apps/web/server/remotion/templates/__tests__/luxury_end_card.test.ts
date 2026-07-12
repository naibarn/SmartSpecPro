import { describe, expect, it } from "vitest";

import { RemotionLayerSchema } from "../../../../shared/remotion/layerTemplateSchemas";
import type { BrandKit } from "../../../../shared/videoIntelligence/brandKit";
import type { TemplateBuildContext } from "../../../services/videoProjectCompiler";
import { buildLuxuryEndCard } from "../luxury_end_card";

const BRAND_KIT: BrandKit = {
  colors: { primary: "#123456", secondary: "#abcdef", accent: "#654321" },
  fonts: { heading: "Playfair", body: "Inter" },
  captionPresetId: "karaoke_word",
  locks: {},
};

const WHITELISTED_TYPES = ["image", "video", "text", "svg", "motionGraphic", "audio"];

function buildCtx(overrides: Partial<TemplateBuildContext> = {}): TemplateBuildContext {
  return {
    format: { width: 1080, height: 1920, fps: 30, durationMs: 4000 },
    brandKit: BRAND_KIT,
    assetResolver: {
      url: id => `https://cdn.example.com/proxy/asset/${id}`,
      sha256: () => undefined,
    },
    ...overrides,
  };
}

const VALID_PARAMS = { ctaText: "Shop now", logoAssetId: 55 };

describe("luxury_end_card", () => {
  it("builds only whitelisted layer types", () => {
    const layers = buildLuxuryEndCard(VALID_PARAMS, buildCtx());
    expect(layers.every(layer => WHITELISTED_TYPES.includes(layer.type))).toBe(true);
  });

  it("respects maxItems / duration bounds", () => {
    const overLayers = buildLuxuryEndCard(
      VALID_PARAMS,
      buildCtx({ format: { width: 1080, height: 1920, fps: 30, durationMs: 999999 } })
    );
    const cta = overLayers.find(layer => layer.id === "luxury_end_card_cta")!;
    expect(cta.durationFrames).toBe(Math.round((8000 / 1000) * 30));
  });

  it("consumes brand tokens from ctx.brandKit", () => {
    const layers = buildLuxuryEndCard(VALID_PARAMS, buildCtx());
    const background = layers.find(layer => layer.id === "luxury_end_card_background");
    expect(background).toMatchObject({ type: "motionGraphic", color: "#123456" });
    const cta = layers.find(layer => layer.id === "luxury_end_card_cta");
    expect(cta).toMatchObject({ color: "#654321", fontFamily: "Playfair" });
  });

  it("rejects invalid params via paramsSchema", () => {
    expect(() => buildLuxuryEndCard({}, buildCtx())).toThrow();
    expect(() =>
      buildLuxuryEndCard({ ...VALID_PARAMS, extra: 1 }, buildCtx())
    ).toThrow();
  });

  it("emits <= 40 layers", () => {
    const layers = buildLuxuryEndCard(VALID_PARAMS, buildCtx());
    expect(layers.length).toBeLessThanOrEqual(40);
  });

  it("every emitted layer parses under RemotionLayerSchema", () => {
    const layers = buildLuxuryEndCard(VALID_PARAMS, buildCtx());
    for (const layer of layers) {
      expect(RemotionLayerSchema.safeParse(layer).success).toBe(true);
    }
    const layersNoLogo = buildLuxuryEndCard({ ctaText: "Shop now" }, buildCtx());
    for (const layer of layersNoLogo) {
      expect(RemotionLayerSchema.safeParse(layer).success).toBe(true);
    }
  });
});
