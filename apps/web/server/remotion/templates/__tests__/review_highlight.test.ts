import { describe, expect, it } from "vitest";

import { RemotionLayerSchema } from "../../../../shared/remotion/layerTemplateSchemas";
import type { BrandKit } from "../../../../shared/videoIntelligence/brandKit";
import type { TemplateBuildContext } from "../../../services/videoProjectCompiler";
import { buildReviewHighlight } from "../review_highlight";

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

const VALID_PARAMS = { rating: 4, quote: "This changed my workflow", authorName: "Alex" };

describe("review_highlight", () => {
  it("builds only whitelisted layer types", () => {
    const layers = buildReviewHighlight(VALID_PARAMS, buildCtx());
    expect(layers.every(layer => WHITELISTED_TYPES.includes(layer.type))).toBe(true);
  });

  it("respects maxItems / duration bounds", () => {
    const overLayers = buildReviewHighlight(
      VALID_PARAMS,
      buildCtx({ format: { width: 1080, height: 1920, fps: 30, durationMs: 999999 } })
    );
    const quote = overLayers.find(layer => layer.id === "review_highlight_quote")!;
    expect(quote.durationFrames).toBe(Math.round((12000 / 1000) * 30));
  });

  it("consumes brand tokens from ctx.brandKit", () => {
    const layers = buildReviewHighlight(VALID_PARAMS, buildCtx());
    const filledStar = layers.find(layer => layer.id === "review_highlight_star_0");
    expect(filledStar).toMatchObject({ type: "motionGraphic", color: "#654321" });
    const quote = layers.find(layer => layer.id === "review_highlight_quote");
    expect(quote).toMatchObject({ fontWeight: "bold" });
  });

  it("rejects invalid params via paramsSchema", () => {
    expect(() => buildReviewHighlight({ rating: 0, quote: "x" }, buildCtx())).toThrow();
    expect(() =>
      buildReviewHighlight({ ...VALID_PARAMS, extra: true }, buildCtx())
    ).toThrow();
  });

  it("emits <= 40 layers", () => {
    const layers = buildReviewHighlight(VALID_PARAMS, buildCtx());
    expect(layers.length).toBeLessThanOrEqual(40);
  });

  it("every emitted layer parses under RemotionLayerSchema", () => {
    const layers = buildReviewHighlight(VALID_PARAMS, buildCtx());
    for (const layer of layers) {
      expect(RemotionLayerSchema.safeParse(layer).success).toBe(true);
    }
  });
});
