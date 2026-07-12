import { describe, expect, it } from "vitest";

import { RemotionLayerSchema } from "../../../../shared/remotion/layerTemplateSchemas";
import type { BrandKit } from "../../../../shared/videoIntelligence/brandKit";
import type { TemplateBuildContext } from "../../../services/videoProjectCompiler";
import { buildFloatingGallery } from "../floating_gallery";

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

const VALID_PARAMS = { assetIds: [1, 2, 3], caption: "Our latest looks" };

describe("floating_gallery", () => {
  it("builds only whitelisted layer types", () => {
    const layers = buildFloatingGallery(VALID_PARAMS, buildCtx());
    expect(layers.every(layer => WHITELISTED_TYPES.includes(layer.type))).toBe(true);
  });

  it("respects maxItems / duration bounds", () => {
    const fifteenAssets = {
      assetIds: Array.from({ length: 15 }, (_, index) => index + 1),
      caption: "Gallery",
    };
    const layers = buildFloatingGallery(fifteenAssets, buildCtx());
    const images = layers.filter(layer => layer.id.startsWith("floating_gallery_image_"));
    expect(images).toHaveLength(9);
  });

  it("consumes brand tokens from ctx.brandKit", () => {
    const layers = buildFloatingGallery(VALID_PARAMS, buildCtx());
    const caption = layers.find(layer => layer.id === "floating_gallery_caption");
    expect(caption).toMatchObject({ type: "text", fontFamily: "Inter" });
  });

  it("rejects invalid params via paramsSchema", () => {
    expect(() => buildFloatingGallery({ assetIds: [], caption: "x" }, buildCtx())).toThrow();
    expect(() =>
      buildFloatingGallery({ ...VALID_PARAMS, extra: 1 }, buildCtx())
    ).toThrow();
  });

  it("emits <= 40 layers", () => {
    const thirtyAssets = {
      assetIds: Array.from({ length: 30 }, (_, index) => index + 1),
      caption: "Gallery",
    };
    const layers = buildFloatingGallery(thirtyAssets, buildCtx());
    expect(layers.length).toBeLessThanOrEqual(40);
  });

  it("every emitted layer parses under RemotionLayerSchema", () => {
    const layers = buildFloatingGallery(VALID_PARAMS, buildCtx());
    for (const layer of layers) {
      expect(RemotionLayerSchema.safeParse(layer).success).toBe(true);
    }
  });
});
