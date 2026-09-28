import { describe, expect, it } from "vitest";

import { estimateRenderCost } from "../cost";
import type {
  RemotionLayer,
  RemotionTemplateConfig,
} from "../../remotion/layerTemplateSchemas";

function baseFields(id: string, durationFrames: number) {
  return {
    id,
    startFrame: 0,
    durationFrames,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotationDeg: 0,
    opacity: 1,
    zIndex: 0,
  };
}

function imageLayer(id: string, durationFrames: number): RemotionLayer {
  return {
    ...baseFields(id, durationFrames),
    type: "image",
    src: "https://cdn.example.com/a.png",
    fit: "cover",
  };
}

function textLayer(id: string, durationFrames: number): RemotionLayer {
  return {
    ...baseFields(id, durationFrames),
    type: "text",
    content: "hi",
    fontFamily: "Inter",
    fontSizePx: 32,
    color: "#ffffff",
    textAlign: "center",
    fontWeight: "normal",
  };
}

function videoLayer(id: string, durationFrames: number): RemotionLayer {
  return {
    ...baseFields(id, durationFrames),
    type: "video",
    src: "https://cdn.example.com/a.mp4",
    trimStartSec: 0,
    volume: 1,
    muted: false,
  };
}

function svgLayer(id: string, durationFrames: number): RemotionLayer {
  return {
    ...baseFields(id, durationFrames),
    type: "svg",
    markup: "<svg></svg>",
    animation: "none",
  };
}

function motionCompositionLayer(id: string, durationFrames: number): RemotionLayer {
  return {
    ...baseFields(id, durationFrames),
    type: "motionComposition",
    compositionId: "particle-field",
    props: { density: "medium" },
  };
}

function buildConfig(
  layers: RemotionLayer[],
  durationInFrames = 100
): RemotionTemplateConfig {
  return {
    id: "cfg",
    name: "Cfg",
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames,
    layers,
  };
}

describe("estimateRenderCost", () => {
  it("scores cost = Σ layers × frames × class-weight", () => {
    const cfg = buildConfig([
      textLayer("t1", 100),
      textLayer("t2", 100),
      imageLayer("i1", 50),
      videoLayer("v1", 30),
      svgLayer("s1", 40),
    ]);
    // score = 100*1 + 100*1 + 50*1 + 30*3 + 40*2 = 420
    expect(estimateRenderCost(cfg)).toEqual({
      score: 420,
      cls: "low",
      recommendPreRender: false,
    });
  });

  it("flags recommendPreRender only above budget", () => {
    const belowBudget = buildConfig([imageLayer("i1", 19999)]);
    expect(estimateRenderCost(belowBudget)).toEqual({
      score: 19999,
      cls: "medium",
      recommendPreRender: false,
    });

    const atBudget = buildConfig([imageLayer("i1", 20000)]);
    expect(estimateRenderCost(atBudget)).toEqual({
      score: 20000,
      cls: "high",
      recommendPreRender: true,
    });
  });

  it("clamps/handles empty layer sets", () => {
    const empty = buildConfig([]);
    expect(estimateRenderCost(empty)).toEqual({
      score: 0,
      cls: "low",
      recommendPreRender: false,
    });
  });

  it("assigns procedural motion a medium render-cost weight", () => {
    const cfg = buildConfig([motionCompositionLayer("motion", 100)]);
    expect(estimateRenderCost(cfg)).toMatchObject({ score: 400 });
  });
});
