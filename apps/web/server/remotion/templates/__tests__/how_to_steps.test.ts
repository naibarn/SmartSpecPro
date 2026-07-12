import { describe, expect, it } from "vitest";

import { RemotionLayerSchema } from "../../../../shared/remotion/layerTemplateSchemas";
import type { BrandKit } from "../../../../shared/videoIntelligence/brandKit";
import type { TemplateBuildContext } from "../../../services/videoProjectCompiler";
import { buildHowToSteps } from "../how_to_steps";

const BRAND_KIT: BrandKit = {
  colors: { primary: "#123456", secondary: "#abcdef", accent: "#654321" },
  fonts: { heading: "Playfair", body: "Inter" },
  captionPresetId: "karaoke_word",
  locks: {},
};

const WHITELISTED_TYPES = ["image", "video", "text", "svg", "motionGraphic", "audio"];

function buildCtx(overrides: Partial<TemplateBuildContext> = {}): TemplateBuildContext {
  return {
    format: { width: 1080, height: 1920, fps: 30, durationMs: 12000 },
    brandKit: BRAND_KIT,
    assetResolver: {
      url: id => `https://cdn.example.com/proxy/asset/${id}`,
      sha256: () => undefined,
    },
    ...overrides,
  };
}

const VALID_PARAMS = { steps: ["Open the app", "Tap create", "Publish"] };

describe("how_to_steps", () => {
  it("builds only whitelisted layer types", () => {
    const layers = buildHowToSteps(VALID_PARAMS, buildCtx());
    expect(layers.every(layer => WHITELISTED_TYPES.includes(layer.type))).toBe(true);
  });

  it("respects maxItems / duration bounds", () => {
    const tenSteps = { steps: Array.from({ length: 10 }, (_, index) => `Step ${index}`) };
    const layers = buildHowToSteps(tenSteps, buildCtx());
    const badges = layers.filter(layer => layer.id.startsWith("how_to_step_badge_"));
    expect(badges).toHaveLength(6);
  });

  it("consumes brand tokens from ctx.brandKit", () => {
    const layers = buildHowToSteps(VALID_PARAMS, buildCtx());
    const label = layers.find(layer => layer.id === "how_to_step_label_0");
    expect(label).toMatchObject({ type: "text", color: "#123456", fontWeight: "bold" });
  });

  it("rejects invalid params via paramsSchema", () => {
    expect(() => buildHowToSteps({ steps: [] }, buildCtx())).toThrow();
    expect(() => buildHowToSteps({ ...VALID_PARAMS, extra: 1 }, buildCtx())).toThrow();
  });

  it("emits <= 40 layers", () => {
    const twentySteps = { steps: Array.from({ length: 20 }, (_, index) => `Step ${index}`) };
    const layers = buildHowToSteps(twentySteps, buildCtx());
    expect(layers.length).toBeLessThanOrEqual(40);
  });

  it("every emitted layer parses under RemotionLayerSchema", () => {
    const layers = buildHowToSteps(VALID_PARAMS, buildCtx());
    for (const layer of layers) {
      expect(RemotionLayerSchema.safeParse(layer).success).toBe(true);
    }
  });
});
