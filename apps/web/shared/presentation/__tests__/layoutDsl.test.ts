import { describe, expect, it } from "vitest";

import { normalizePresentationLayoutDslToSlideContent } from "../layoutDsl";

describe("normalizePresentationLayoutDslToSlideContent", () => {
  it("sanitizes arbitrary image URLs, clamps elements to the canvas, and enforces allowed fonts", () => {
    const slideContent = normalizePresentationLayoutDslToSlideContent({
      draft: {
        status: "ok",
        elements: [
          {
            id: "unsafe-image",
            type: "image",
            x: -40,
            y: -30,
            width: 900,
            height: 480,
            src: "https://evil.example.com/tracker.png",
            alt: "Unsafe image",
          },
          {
            id: "headline",
            type: "text",
            x: 32,
            y: 48,
            width: 760,
            height: 60,
            text: "Headline",
            color: "#111827",
            fontSize: 32,
            fontFamily: "Papyrus",
          },
        ],
      },
      canvasWidth: 800,
      canvasHeight: 600,
      allowedMediaTokens: ["link_1"],
      allowedFontFamilies: ["Inter", "Sarabun"],
      fontScale: {
        titleMin: 28,
        titleMax: 36,
        bodyMin: 14,
        bodyMax: 18,
      },
    });

    expect(slideContent).not.toBeNull();
    if (!slideContent) {
      return;
    }

    const image = slideContent.elements.find((element) => element.id === "unsafe-image");
    const headline = slideContent.elements.find((element) => element.id === "headline");

    expect(image).toEqual(expect.objectContaining({
      type: "image",
      x: 0,
      y: 0,
      width: 800,
      height: 480,
      src: "__PLACEHOLDER__",
    }));
    expect(headline).toEqual(expect.objectContaining({
      type: "text",
      fontFamily: "Inter",
      fontSize: 36,
    }));
  });

  it("preserves approved media tokens in DSL image elements", () => {
    const slideContent = normalizePresentationLayoutDslToSlideContent({
      draft: {
        status: "ok",
        elements: [
          {
            id: "hero",
            type: "image",
            x: 24,
            y: 24,
            width: 360,
            height: 220,
            src: "link_1",
            alt: "Hero",
          },
        ],
      },
      canvasWidth: 400,
      canvasHeight: 300,
      allowedMediaTokens: ["link_1", "link_2"],
      allowedFontFamilies: ["Inter"],
    });

    expect(slideContent?.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "hero", src: "link_1" }),
    ]));
  });

  it("preserves resolved media URLs when they are explicitly allowlisted", () => {
    const slideContent = normalizePresentationLayoutDslToSlideContent({
      draft: {
        status: "ok",
        elements: [
          {
            id: "hero",
            type: "image",
            x: 24,
            y: 24,
            width: 360,
            height: 220,
            src: "https://cdn.example.com/generated-slide-5.jpg",
            alt: "Resolved generated media",
          },
        ],
      },
      canvasWidth: 400,
      canvasHeight: 300,
      allowedMediaTokens: ["https://cdn.example.com/generated-slide-5.jpg"],
      allowedFontFamilies: ["Inter"],
    });

    expect(slideContent?.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "hero",
        src: "https://cdn.example.com/generated-slide-5.jpg",
      }),
    ]));
  });

  it("pushes later text blocks downward when expanded text would overlap earlier content", () => {
    const slideContent = normalizePresentationLayoutDslToSlideContent({
      draft: {
        status: "ok",
        elements: [
          {
            id: "body",
            type: "text",
            x: 48,
            y: 120,
            width: 520,
            height: 90,
            text: "ข้อความยาวมาก ".repeat(45),
            color: "#111827",
            fontSize: 20,
          },
          {
            id: "key-card",
            type: "rect",
            x: 48,
            y: 220,
            width: 520,
            height: 120,
            fill: "#e2e8f0",
          },
          {
            id: "key-title",
            type: "text",
            x: 64,
            y: 232,
            width: 488,
            height: 30,
            text: "Key Points",
            color: "#0f172a",
            fontSize: 18,
          },
          {
            id: "key-body",
            type: "text",
            x: 64,
            y: 270,
            width: 488,
            height: 60,
            text: "• สรุปข้อหนึ่ง\n• สรุปข้อสอง\n• สรุปข้อสาม",
            color: "#334155",
            fontSize: 16,
          },
        ],
      },
      canvasWidth: 640,
      canvasHeight: 900,
      allowedFontFamilies: ["Inter"],
    });

    expect(slideContent).not.toBeNull();
    if (!slideContent) {
      return;
    }

    const body = slideContent.elements.find((element) => element.id === "body");
    const keyTitle = slideContent.elements.find((element) => element.id === "key-title");
    const keyBody = slideContent.elements.find((element) => element.id === "key-body");
    const keyCard = slideContent.elements.find((element) => element.id === "key-card");

    expect(body).toEqual(expect.objectContaining({ type: "text" }));
    expect(keyTitle).toEqual(expect.objectContaining({ type: "text" }));
    expect(keyBody).toEqual(expect.objectContaining({ type: "text" }));
    expect(keyCard).toEqual(expect.objectContaining({ type: "rect" }));

    const bodyBottom = (body as { y: number; height: number }).y + (body as { y: number; height: number }).height;
    expect((keyTitle as { y: number }).y).toBeGreaterThanOrEqual(bodyBottom + 8);
    expect((keyBody as { y: number }).y).toBeGreaterThan((keyTitle as { y: number; height: number }).y);
    expect((keyCard as { y: number }).y).toBeLessThanOrEqual((keyTitle as { y: number }).y);
  });

  it("adds a contrast backdrop when text overlays an image", () => {
    const slideContent = normalizePresentationLayoutDslToSlideContent({
      draft: {
        status: "ok",
        elements: [
          {
            id: "hero",
            type: "image",
            x: 0,
            y: 0,
            width: 640,
            height: 360,
            src: "link_1",
            alt: "Hero image",
          },
          {
            id: "title",
            type: "text",
            x: 64,
            y: 80,
            width: 360,
            height: 72,
            text: "Headline on image",
            color: "#111827",
            fontSize: 32,
          },
        ],
      },
      canvasWidth: 640,
      canvasHeight: 900,
      allowedMediaTokens: ["link_1"],
      allowedFontFamilies: ["Inter"],
    });

    expect(slideContent).not.toBeNull();
    if (!slideContent) {
      return;
    }

    expect(slideContent.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "title__contrast_backdrop",
        type: "rect",
        fill: "rgba(15, 23, 42, 0.74)",
      }),
      expect.objectContaining({
        id: "title",
        type: "text",
        color: "#F8FAFC",
      }),
    ]));
  });

  it("removes decorative svg accents that overlap readable text", () => {
    const slideContent = normalizePresentationLayoutDslToSlideContent({
      draft: {
        status: "ok",
        elements: [
          {
            id: "headline",
            type: "text",
            x: 72,
            y: 180,
            width: 420,
            height: 88,
            text: "Readable headline",
            color: "#0f172a",
            fontSize: 34,
          },
          {
            id: "badge",
            type: "svg",
            x: 90,
            y: 190,
            width: 180,
            height: 120,
            svgContent: "<svg><circle cx='60' cy='60' r='55' fill='#cbd5e1' /></svg>",
            alt: "Decorative badge",
          },
        ],
      },
      canvasWidth: 640,
      canvasHeight: 900,
      allowedFontFamilies: ["Inter"],
    });

    expect(slideContent).not.toBeNull();
    if (!slideContent) {
      return;
    }

    const badge = slideContent.elements.find((element) => element.id === "badge") as
      | { x: number; y: number; width: number; height: number }
      | undefined;
    const headline = slideContent.elements.find((element) => element.id === "headline") as
      | { x: number; y: number; width: number; height: number }
      | undefined;

    if (!badge || !headline) {
      expect(badge).toBeUndefined();
      return;
    }

    const overlapsX = badge.x < headline.x + headline.width && badge.x + badge.width > headline.x;
    const overlapsY = badge.y < headline.y + headline.height && badge.y + badge.height > headline.y;
    expect(overlapsX && overlapsY).toBe(false);
  });
});
