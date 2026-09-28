import { describe, expect, it } from "vitest";

import { RemotionLayerSchema } from "../../../../shared/remotion/layerTemplateSchemas";
import type { BrandKit } from "../../../../shared/videoIntelligence/brandKit";
import type { TemplateBuildContext } from "../../../services/videoProjectCompiler";
import { buildProductHero } from "../product_hero";

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

const VALID_PARAMS = { assetId: 101, headline: "Meet the product" };

describe("product_hero", () => {
  it("builds only whitelisted layer types", () => {
    const layers = buildProductHero(VALID_PARAMS, buildCtx());
    expect(layers.every(layer => WHITELISTED_TYPES.includes(layer.type))).toBe(true);
  });

  it("respects maxItems / duration bounds", () => {
    const overLayers = buildProductHero(
      VALID_PARAMS,
      buildCtx({ format: { width: 1080, height: 1920, fps: 30, durationMs: 999999 } })
    );
    const media = overLayers.find(layer => layer.id === "product_hero_media")!;
    expect(media.durationFrames).toBe(Math.round((15000 / 1000) * 30));

    const underLayers = buildProductHero(
      VALID_PARAMS,
      buildCtx({ format: { width: 1080, height: 1920, fps: 30, durationMs: 100 } })
    );
    const underMedia = underLayers.find(layer => layer.id === "product_hero_media")!;
    expect(underMedia.durationFrames).toBe(Math.round((2000 / 1000) * 30));
  });

  it("consumes brand tokens from ctx.brandKit", () => {
    const layers = buildProductHero(VALID_PARAMS, buildCtx());
    const headline = layers.find(layer => layer.id === "product_hero_headline");
    expect(headline).toMatchObject({
      type: "text",
      color: "#123456",
      fontFamily: "Inter",
    });
  });

  it("rejects invalid params via paramsSchema", () => {
    expect(() => buildProductHero({ headline: "no assetId" }, buildCtx())).toThrow();
    expect(() =>
      buildProductHero({ ...VALID_PARAMS, unknownKey: true }, buildCtx())
    ).toThrow();
  });

  it("emits <= 40 layers", () => {
    const layers = buildProductHero(
      { ...VALID_PARAMS, subheadline: "Now available" },
      buildCtx()
    );
    expect(layers.length).toBeLessThanOrEqual(40);
  });

  it("every emitted layer parses under RemotionLayerSchema", () => {
    const layers = buildProductHero(
      { ...VALID_PARAMS, subheadline: "Now available", mediaKind: "video" },
      buildCtx()
    );
    for (const layer of layers) {
      expect(RemotionLayerSchema.safeParse(layer).success).toBe(true);
    }
  });
});
