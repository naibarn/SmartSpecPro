import { describe, expect, it } from "vitest";

import {
  RemotionTemplateConfigSchema,
  isSafeInlineSvgMarkup,
} from "../../../shared/remotion/layerTemplateSchemas";
import { buildGenericTemplateInputProps } from "../remotionTemplateService";

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
    name: "Product showcase",
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

describe("layerTemplateSchemas", () => {
  describe("RemotionTemplateConfigSchema", () => {
    it("parses a valid config with representative layer types", () => {
      const config = RemotionTemplateConfigSchema.parse(
        buildConfig({
          layers: [
            {
              ...baseLayerFields({ id: "image_layer" }),
              type: "image",
              src: "https://cdn.example.com/product.png",
            },
            {
              ...baseLayerFields({ id: "video_layer", startFrame: 30 }),
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
              shape: "star",
            },
            {
              ...baseLayerFields({ id: "scene_layer" }),
              type: "scene3d",
              sceneId: "orbiting-product",
              props: { color: "#ff0000", rotationSpeed: 0.1 },
            },
          ],
        })
      );

      expect(config.layers).toHaveLength(6);
      expect(config.layers[0]).toMatchObject({
        type: "image",
        fit: "cover",
      });
      expect(config.layers[5]).toMatchObject({
        type: "scene3d",
        sceneId: "orbiting-product",
      });
    });

    it("rejects a scene3d layer with an unknown sceneId", () => {
      const result = RemotionTemplateConfigSchema.safeParse(
        buildConfig({
          layers: [
            {
              ...baseLayerFields(),
              type: "scene3d",
              sceneId: "not-a-real-scene",
            },
          ],
        })
      );
      expect(result.success).toBe(false);
    });

    it("rejects an svg layer whose markup contains <script>", () => {
      const result = RemotionTemplateConfigSchema.safeParse(
        buildConfig({
          layers: [
            {
              ...baseLayerFields(),
              type: "svg",
              markup: "<svg><script>alert(1)</script></svg>",
            },
          ],
        })
      );
      expect(result.success).toBe(false);
    });

    it("rejects an svg layer whose markup contains an event-handler attribute", () => {
      const result = RemotionTemplateConfigSchema.safeParse(
        buildConfig({
          layers: [
            {
              ...baseLayerFields(),
              type: "svg",
              markup: '<svg onload="alert(1)"><circle r="5" /></svg>',
            },
          ],
        })
      );
      expect(result.success).toBe(false);
    });

    it("rejects an svg layer whose markup contains a javascript: URI", () => {
      const result = RemotionTemplateConfigSchema.safeParse(
        buildConfig({
          layers: [
            {
              ...baseLayerFields(),
              type: "svg",
              markup:
                '<svg><a href="javascript:alert(1)"><circle r="5" /></a></svg>',
            },
          ],
        })
      );
      expect(result.success).toBe(false);
    });

    it("rejects more than 40 layers", () => {
      const layers = Array.from({ length: 41 }, (_, index) => ({
        ...baseLayerFields({ id: `layer_${index}` }),
        type: "image" as const,
        src: "https://cdn.example.com/product.png",
      }));
      const result = RemotionTemplateConfigSchema.safeParse(
        buildConfig({ layers })
      );
      expect(result.success).toBe(false);
    });
  });

  describe("isSafeInlineSvgMarkup", () => {
    it("returns true for clean markup", () => {
      expect(isSafeInlineSvgMarkup("<svg><circle r=\"5\" /></svg>")).toBe(
        true
      );
    });

    it("returns false for markup containing <script>", () => {
      expect(
        isSafeInlineSvgMarkup("<svg><script>1</script></svg>")
      ).toBe(false);
    });
  });
});

describe("remotionTemplateService", () => {
  describe("buildGenericTemplateInputProps", () => {
    it("passes through a single-layer config", () => {
      const config = RemotionTemplateConfigSchema.parse(buildConfig());
      const inputProps = buildGenericTemplateInputProps(config);

      expect(inputProps.id).toBe("template_1");
      expect(inputProps.width).toBe(1080);
      expect(inputProps.height).toBe(1920);
      expect(inputProps.fps).toBe(30);
      expect(inputProps.durationInFrames).toBe(90);
      expect(inputProps.layers).toHaveLength(1);
      expect(inputProps.layers[0]).toMatchObject({
        type: "image",
        id: "layer_1",
      });
    });

    it("passes through a multi-layer config with defaults applied", () => {
      const config = RemotionTemplateConfigSchema.parse(
        buildConfig({
          layers: [
            {
              ...baseLayerFields({ id: "text_layer" }),
              type: "text",
              content: "Sale ends soon",
            },
            {
              ...baseLayerFields({ id: "scene_layer", startFrame: 20 }),
              type: "scene3d",
              sceneId: "orbiting-product",
            },
          ],
        })
      );
      const inputProps = buildGenericTemplateInputProps(config);

      expect(inputProps.layers).toHaveLength(2);
      const textLayer = inputProps.layers[0];
      expect(textLayer).toMatchObject({
        type: "text",
        fontFamily: "Inter",
        fontSizePx: 48,
        color: "#ffffff",
        textAlign: "center",
        fontWeight: "normal",
      });
      const sceneLayer = inputProps.layers[1];
      expect(sceneLayer).toMatchObject({
        type: "scene3d",
        sceneId: "orbiting-product",
        props: {},
      });
    });
  });
});
