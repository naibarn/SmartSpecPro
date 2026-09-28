import { describe, expect, it } from "vitest";

import {
  RemotionLayerSchema,
  RemotionTemplateConfigSchema,
} from "../layerTemplateSchemas";
import { buildGenericTemplateInputProps } from "../../../server/services/remotionTemplateService";

function baseLayerFields(overrides: Record<string, unknown> = {}) {
  return {
    id: "layer_1",
    startFrame: 0,
    durationFrames: 60,
    x: 10,
    y: 10,
    width: 80,
    height: 80,
    ...overrides,
  };
}

function buildConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: "template_1",
    name: "Audio regression config",
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames: 90,
    layers: [
      {
        ...baseLayerFields(),
        type: "image",
        src: "https://cdn.example.com/product.png",
      },
    ],
    ...overrides,
  };
}

describe("RemotionLayerSchema — audio variant", () => {
  it("parses the new audio layer variant with defaults", () => {
    const layer = RemotionLayerSchema.parse({
      ...baseLayerFields({ id: "audio_layer" }),
      type: "audio",
      src: "https://cdn.example.com/narration.mp3",
    });
    expect(layer).toMatchObject({
      type: "audio",
      trimStartSec: 0,
      volume: 1,
      loop: false,
      fadeInMs: 0,
      fadeOutMs: 0,
    });
  });

  it("accepts explicit audio field overrides", () => {
    const layer = RemotionLayerSchema.parse({
      ...baseLayerFields({ id: "audio_layer" }),
      type: "audio",
      src: "https://cdn.example.com/music.mp3",
      trimStartSec: 2.5,
      volume: 0.6,
      loop: true,
      fadeInMs: 500,
      fadeOutMs: 1000,
    });
    expect(layer).toMatchObject({
      trimStartSec: 2.5,
      volume: 0.6,
      loop: true,
      fadeInMs: 500,
      fadeOutMs: 1000,
    });
  });

  it("rejects audio.volume outside 0..1", () => {
    const result = RemotionLayerSchema.safeParse({
      ...baseLayerFields({ id: "audio_layer" }),
      type: "audio",
      src: "https://cdn.example.com/music.mp3",
      volume: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative audio.volume", () => {
    const result = RemotionLayerSchema.safeParse({
      ...baseLayerFields({ id: "audio_layer" }),
      type: "audio",
      src: "https://cdn.example.com/music.mp3",
      volume: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an audio layer missing src", () => {
    const result = RemotionLayerSchema.safeParse({
      ...baseLayerFields({ id: "audio_layer" }),
      type: "audio",
    });
    expect(result.success).toBe(false);
  });

  it("still parses every pre-existing layer variant", () => {
    const config = RemotionTemplateConfigSchema.parse(
      buildConfig({
        layers: [
          {
            ...baseLayerFields({ id: "image_layer" }),
            type: "image",
            src: "https://cdn.example.com/product.png",
          },
          {
            ...baseLayerFields({ id: "video_layer", startFrame: 10 }),
            type: "video",
            src: "https://cdn.example.com/clip.mp4",
          },
          {
            ...baseLayerFields({ id: "text_layer" }),
            type: "text",
            content: "Hello world",
          },
          {
            ...baseLayerFields({ id: "svg_layer" }),
            type: "svg",
            markup: "<svg><circle r=\"5\" /></svg>",
          },
          {
            ...baseLayerFields({ id: "motion_layer" }),
            type: "motionGraphic",
            shape: "circle",
          },
          {
            ...baseLayerFields({ id: "scene_layer" }),
            type: "scene3d",
            sceneId: "orbiting-product",
          },
          {
            ...baseLayerFields({ id: "audio_layer" }),
            type: "audio",
            src: "https://cdn.example.com/narration.mp3",
          },
        ],
      })
    );
    expect(config.layers.map(l => l.type)).toEqual([
      "image",
      "video",
      "text",
      "svg",
      "motionGraphic",
      "scene3d",
      "audio",
    ]);
  });
});

describe("buildGenericTemplateInputProps — audio passthrough", () => {
  it("survives an audio layer unchanged through inputProps passthrough", () => {
    const config = RemotionTemplateConfigSchema.parse(
      buildConfig({
        layers: [
          {
            ...baseLayerFields({ id: "audio_layer" }),
            type: "audio",
            src: "https://cdn.example.com/narration.mp3",
            volume: 0.8,
            loop: true,
            fadeInMs: 250,
            fadeOutMs: 500,
          },
        ],
      })
    );
    const inputProps = buildGenericTemplateInputProps(config);
    expect(inputProps.layers).toHaveLength(1);
    expect(inputProps.layers[0]).toMatchObject({
      type: "audio",
      src: "https://cdn.example.com/narration.mp3",
      volume: 0.8,
      loop: true,
      fadeInMs: 250,
      fadeOutMs: 500,
    });
  });
});
