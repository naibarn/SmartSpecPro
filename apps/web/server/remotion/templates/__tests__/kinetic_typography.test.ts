import { describe, expect, it } from "vitest";

import { RemotionLayerSchema } from "../../../../shared/remotion/layerTemplateSchemas";
import type { BrandKit } from "../../../../shared/videoIntelligence/brandKit";
import type { TemplateBuildContext } from "../../../services/videoProjectCompiler";
import { buildKineticTypography } from "../kinetic_typography";

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

const VALID_PARAMS = { words: ["This", "changes", "everything"] };

describe("kinetic_typography", () => {
  it("builds only whitelisted layer types", () => {
    const layers = buildKineticTypography(VALID_PARAMS, buildCtx());
    expect(layers.every(layer => WHITELISTED_TYPES.includes(layer.type))).toBe(true);
  });

  it("respects maxItems / duration bounds", () => {
    const twelveWords = { words: Array.from({ length: 12 }, (_, index) => `word${index}`) };
    const layers = buildKineticTypography(twelveWords, buildCtx());
    expect(layers).toHaveLength(8);
  });

  it("consumes brand tokens from ctx.brandKit", () => {
    const layers = buildKineticTypography(VALID_PARAMS, buildCtx());
    expect(layers[0]).toMatchObject({ type: "text", color: "#123456", fontFamily: "Inter" });
  });

  it("rejects invalid params via paramsSchema", () => {
    expect(() => buildKineticTypography({ words: [] }, buildCtx())).toThrow();
    expect(() =>
      buildKineticTypography({ ...VALID_PARAMS, extra: 1 }, buildCtx())
    ).toThrow();
  });

  it("emits <= 40 layers", () => {
    const thirtyWords = { words: Array.from({ length: 30 }, (_, index) => `word${index}`) };
    const layers = buildKineticTypography(thirtyWords, buildCtx());
    expect(layers.length).toBeLessThanOrEqual(40);
  });

  it("every emitted layer parses under RemotionLayerSchema", () => {
    const layers = buildKineticTypography(VALID_PARAMS, buildCtx());
    for (const layer of layers) {
      expect(RemotionLayerSchema.safeParse(layer).success).toBe(true);
    }
  });
});
