import { describe, expect, it } from "vitest";

import {
  applyWatermarkToSlideContent,
  extractWatermarkFromSlideContent,
} from "../presentationWatermarkService";

describe("presentationWatermarkService", () => {
  const baseSlide = {
    elements: [
      {
        id: "bg",
        type: "rect" as const,
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
        fill: "#ffffff",
      },
      {
        id: "title",
        type: "text" as const,
        x: 120,
        y: 80,
        width: 860,
        height: 140,
        text: "Hello",
        color: "#111827",
      },
    ],
    canvas: {
      width: 1280,
      height: 720,
      preset: "16:9" as const,
    },
  };

  it("adds watermark image element with expected opacity", () => {
    const result = applyWatermarkToSlideContent(baseSlide, {
      sourceUrl: "https://cdn.example.com/logo.png",
      format: "png",
      clarityPercent: 20,
    });

    expect(result.applied).toBe(true);
    const watermark = result.slideContent.elements.find((element) => (
      element.type === "image" && element.id.startsWith("watermark__")
    ));
    expect(watermark).toBeTruthy();
    if (watermark && watermark.type === "image") {
      expect(watermark.opacity).toBeCloseTo(0.2, 5);
      expect(watermark.src).toBe("https://cdn.example.com/logo.png");
    }
  });

  it("replaces previous watermark instead of duplicating", () => {
    const first = applyWatermarkToSlideContent(baseSlide, {
      sourceUrl: "https://cdn.example.com/logo.png",
      format: "png",
      clarityPercent: 20,
    });
    const second = applyWatermarkToSlideContent(first.slideContent, {
      sourceUrl: "https://cdn.example.com/logo.jpg",
      format: "jpg",
      clarityPercent: 30,
    });

    const watermarkElements = second.slideContent.elements.filter((element) => (
      element.type === "image" && element.id.startsWith("watermark__")
    ));
    expect(watermarkElements).toHaveLength(1);
    const watermark = watermarkElements[0];
    if (watermark.type === "image") {
      expect(watermark.src).toBe("https://cdn.example.com/logo.jpg");
      expect(watermark.opacity).toBeCloseTo(0.3, 5);
    }
  });

  it("extracts watermark settings from slide content", () => {
    const applied = applyWatermarkToSlideContent(baseSlide, {
      sourceUrl: "/uploads/wm-sample.jpg",
      format: "jpg",
      clarityPercent: 35,
    });

    const extracted = extractWatermarkFromSlideContent(applied.slideContent);
    expect(extracted).toEqual({
      sourceUrl: "/uploads/wm-sample.jpg",
      format: "jpg",
      clarityPercent: 35,
    });
  });
});
