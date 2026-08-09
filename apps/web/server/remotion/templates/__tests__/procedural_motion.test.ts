import { describe, expect, it } from "vitest";

import { RemotionLayerSchema } from "../../../../shared/remotion/layerTemplateSchemas";
import type { BrandKit } from "../../../../shared/videoIntelligence/brandKit";
import type { TemplateBuildContext } from "../../../services/videoProjectCompiler";
import { buildGlowingSphere } from "../glowing_sphere";
import { buildNetworkGraph } from "../network_graph";
import { buildParticleField } from "../particle_field";

const BRAND_KIT: BrandKit = {
  colors: { primary: "#123456", secondary: "#abcdef", accent: "#654321" },
  fonts: { heading: "Inter", body: "Inter" },
  captionPresetId: "classic_box",
  locks: {},
};

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

describe("procedural motion templates", () => {
  it.each([
    ["particle_field", () => buildParticleField({ palette: ["#60a5fa"], events: [] }, buildCtx())],
    ["network_graph", () => buildNetworkGraph({ nodes: ["หัวข้อ", "เหตุผล", "ผลลัพธ์"], palette: ["#22d3ee"], events: [] }, buildCtx())],
    ["glowing_sphere", () => buildGlowingSphere({ title: "ภาพรวม", events: [{ frame: 30, kind: "emphasis" }] }, buildCtx())],
  ])("%s emits only schema-valid registered layers", (_id, build) => {
    const layers = build();
    expect(layers.length).toBeGreaterThan(0);
    for (const layer of layers) {
      expect(RemotionLayerSchema.safeParse(layer).success).toBe(true);
    }
  });

  it("keeps procedural motion as one continuous/event-driven layer", () => {
    const particleLayer = buildParticleField(
      { palette: ["#60a5fa"], events: [{ frame: 0, kind: "enter", strength: 1 }] },
      buildCtx(),
    )[0];
    expect(particleLayer).toMatchObject({
      type: "motionComposition",
      compositionId: "particle-field",
      props: { syncPolicy: "event" },
    });

    const sphereLayers = buildGlowingSphere(
      { events: [{ frame: 30, kind: "emphasis", strength: 0.8 }] },
      buildCtx(),
    );
    expect(sphereLayers[0]).toMatchObject({
      type: "scene3d",
      sceneId: "glowing-sphere",
      props: { events: [{ frame: 30, kind: "emphasis", strength: 0.8 }] },
    });
  });

  it("rejects unknown procedural params before render", () => {
    expect(() => buildParticleField({ palette: ["#60a5fa"], unknown: true }, buildCtx())).toThrow();
    expect(() => buildNetworkGraph({ nodes: ["a", "b"], palette: ["#60a5fa"], unknown: true }, buildCtx())).toThrow();
    expect(() => buildGlowingSphere({ unknown: true }, buildCtx())).toThrow();
  });

  it("accepts only the bounded event shape for 3d beat timing", () => {
    const sphere = buildGlowingSphere(
      { events: [{ frame: 30, kind: "emphasis", strength: 0.8 }] },
      buildCtx(),
    );
    expect(RemotionLayerSchema.safeParse(sphere[0]).success).toBe(true);
    expect(
      RemotionLayerSchema.safeParse({
        ...sphere[0],
        props: { ...sphere[0].props, events: [{ frame: 30, kind: "unknown" }] },
      }).success,
    ).toBe(false);
  });
});
