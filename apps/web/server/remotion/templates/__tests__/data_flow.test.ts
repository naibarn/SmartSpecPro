import { describe, expect, it } from "vitest";

import { RemotionLayerSchema } from "../../../../shared/remotion/layerTemplateSchemas";
import type { BrandKit } from "../../../../shared/videoIntelligence/brandKit";
import type { TemplateBuildContext } from "../../../services/videoProjectCompiler";
import { buildDataFlow } from "../data_flow";

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

const VALID_PARAMS = { nodes: ["Input", "Process", "Output"] };

describe("data_flow", () => {
  it("builds only whitelisted layer types", () => {
    const layers = buildDataFlow(VALID_PARAMS, buildCtx());
    expect(layers.every(layer => WHITELISTED_TYPES.includes(layer.type))).toBe(true);
  });

  it("respects maxItems / duration bounds", () => {
    const tenNodes = { nodes: Array.from({ length: 10 }, (_, index) => `Node ${index}`) };
    const layers = buildDataFlow(tenNodes, buildCtx());
    const nodeLayers = layers.filter(layer => /^data_flow_node_\d+$/.test(layer.id));
    expect(nodeLayers).toHaveLength(6);
  });

  it("consumes brand tokens from ctx.brandKit", () => {
    const layers = buildDataFlow(VALID_PARAMS, buildCtx());
    const node = layers.find(layer => layer.id === "data_flow_node_0");
    expect(node).toMatchObject({ type: "motionGraphic", color: "#654321" });
    const connector = layers.find(layer => layer.id === "data_flow_connector_1");
    expect(connector?.type).toBe("svg");
    if (connector?.type === "svg") {
      expect(connector.markup).toContain("#654321");
    }
  });

  it("rejects invalid params via paramsSchema", () => {
    expect(() => buildDataFlow({ nodes: ["only one"] }, buildCtx())).toThrow();
    expect(() => buildDataFlow({ ...VALID_PARAMS, extra: 1 }, buildCtx())).toThrow();
  });

  it("emits <= 40 layers", () => {
    const twentyNodes = { nodes: Array.from({ length: 20 }, (_, index) => `Node ${index}`) };
    const layers = buildDataFlow(twentyNodes, buildCtx());
    expect(layers.length).toBeLessThanOrEqual(40);
  });

  it("every emitted layer parses under RemotionLayerSchema", () => {
    const layers = buildDataFlow(VALID_PARAMS, buildCtx());
    for (const layer of layers) {
      expect(RemotionLayerSchema.safeParse(layer).success).toBe(true);
    }
  });
});
