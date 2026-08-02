import { describe, expect, it } from "vitest";

import {
  buildStagedRemotionTemplate,
  normalizeStagedOverlayAnchor,
  readStagedFinalRenderSettings,
  STAGED_OVERLAY_ANCHORS,
} from "../marketplaceAutoReviewStagedRemotionRender";

const CLIPS = [
  { url: "https://example.test/a.mp4", durationSec: 5 },
  { url: "https://example.test/b.mp4", durationSec: 5 },
];

function layersOf(overlay: Parameters<typeof buildStagedRemotionTemplate>[0]) {
  return buildStagedRemotionTemplate(overlay).template.layers;
}

describe("staged final-render overlay anchors", () => {
  describe("normalizeStagedOverlayAnchor", () => {
    it("accepts every anchor in the shared list", () => {
      for (const anchor of STAGED_OVERLAY_ANCHORS) {
        expect(normalizeStagedOverlayAnchor(anchor, "top_center")).toBe(anchor);
      }
    });

    it("migrates the original three text positions to their centred equivalents", () => {
      // Runs saved before the 9-anchor picker existed must keep rendering in
      // the same place rather than silently jumping to the default.
      expect(normalizeStagedOverlayAnchor("top", "bottom_right")).toBe(
        "top_center"
      );
      expect(normalizeStagedOverlayAnchor("center", "bottom_right")).toBe(
        "middle_center"
      );
      expect(normalizeStagedOverlayAnchor("bottom", "bottom_right")).toBe(
        "bottom_center"
      );
    });

    it("falls back for unknown / empty values", () => {
      expect(normalizeStagedOverlayAnchor("nonsense", "bottom_right")).toBe(
        "bottom_right"
      );
      expect(normalizeStagedOverlayAnchor(undefined, "top_left")).toBe(
        "top_left"
      );
    });
  });

  describe("image overlay geometry", () => {
    it("pins a bottom-right image inside the 4% safe area", () => {
      const image = layersOf({
        clips: CLIPS,
        overlayImage: {
          url: "https://example.test/logo.png",
          position: "bottom_right",
          widthPercent: 20,
          opacity: 0.6,
          fit: "contain",
        },
      }).find(layer => layer.id === "overlay-image") as any;

      expect(image.width).toBe(20);
      // 1080x1920 → a 20%-of-width box is 20 * (1080/1920) = 11.25% of height.
      expect(image.height).toBeCloseTo(11.25, 5);
      expect(image.x).toBeCloseTo(100 - 20 - 4, 5);
      expect(image.y).toBeCloseTo(100 - 11.25 - 4, 5);
      expect(image.opacity).toBe(0.6);
      expect(image.fit).toBe("contain");
    });

    it("centres a middle-centre image on both axes", () => {
      const image = layersOf({
        clips: CLIPS,
        overlayImage: {
          url: "https://example.test/logo.png",
          position: "middle_center",
          widthPercent: 30,
        },
      }).find(layer => layer.id === "overlay-image") as any;

      expect(image.x).toBeCloseTo((100 - 30) / 2, 5);
      expect(image.y).toBeCloseTo((100 - 30 * (1080 / 1920)) / 2, 5);
    });

    it("clamps width and opacity into the supported range", () => {
      const image = layersOf({
        clips: CLIPS,
        overlayImage: {
          url: "https://example.test/logo.png",
          widthPercent: 999,
          opacity: 0,
        },
      }).find(layer => layer.id === "overlay-image") as any;

      expect(image.width).toBe(60);
      expect(image.opacity).toBe(0.05);
    });

    it("honours cover fit when asked", () => {
      const image = layersOf({
        clips: CLIPS,
        overlayImage: { url: "https://example.test/l.png", fit: "cover" },
      }).find(layer => layer.id === "overlay-image") as any;
      expect(image.fit).toBe("cover");
    });
  });

  describe("text overlay geometry", () => {
    it("spans the full safe area and centres when horizontally centred", () => {
      const text = layersOf({
        clips: CLIPS,
        overlayText: { content: "ลดพิเศษ", position: "bottom_center" },
      }).find(layer => layer.id === "overlay-text") as any;

      expect(text.width).toBe(92);
      expect(text.x).toBeCloseTo(4, 5);
      expect(text.y).toBeCloseTo(100 - 14 - 4, 5);
      expect(text.textAlign).toBe("center");
    });

    it("uses a half-width band hugging the side when pinned left", () => {
      const text = layersOf({
        clips: CLIPS,
        overlayText: { content: "โปรวันนี้", position: "top_left" },
      }).find(layer => layer.id === "overlay-text") as any;

      expect(text.width).toBe(46);
      expect(text.x).toBeCloseTo(4, 5);
      expect(text.y).toBeCloseTo(4, 5);
      expect(text.textAlign).toBe("left");
    });

    it("right-aligns and right-pins a right anchor", () => {
      const text = layersOf({
        clips: CLIPS,
        overlayText: { content: "โปร", position: "middle_right" },
      }).find(layer => layer.id === "overlay-text") as any;

      expect(text.x).toBeCloseTo(100 - 46 - 4, 5);
      expect(text.textAlign).toBe("right");
    });

    it("still honours a legacy `top` position saved before the grid existed", () => {
      const text = layersOf({
        clips: CLIPS,
        overlayText: { content: "เดิม", position: "top" },
      }).find(layer => layer.id === "overlay-text") as any;
      expect(text.width).toBe(92);
      expect(text.y).toBeCloseTo(4, 5);
    });

    it("omits the layer entirely for blank content", () => {
      const layers = layersOf({
        clips: CLIPS,
        overlayText: { content: "   " },
      });
      expect(layers.some(layer => layer.id === "overlay-text")).toBe(false);
    });
  });

  describe("readStagedFinalRenderSettings", () => {
    it("normalises a legacy stored text position and fills the new fields", () => {
      const settings = readStagedFinalRenderSettings({
        stagedPipeline: {
          finalRenderSettings: {
            subtitlePresetId: "neon_glow",
            overlayText: { content: "ทดสอบ", position: "bottom" },
            overlayImage: { url: "https://example.test/l.png" },
          },
        },
      });

      expect(settings.subtitlePresetId).toBe("neon_glow");
      expect(settings.overlayText).toMatchObject({
        position: "bottom_center",
        fontSizePx: 56,
        color: "#ffffff",
        fontWeight: "bold",
        opacity: 1,
      });
      expect(settings.overlayImage).toMatchObject({
        position: "bottom_right",
        widthPercent: 22,
        opacity: 1,
        fit: "contain",
      });
    });
  });
});
