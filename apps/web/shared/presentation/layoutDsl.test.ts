import { describe, expect, it } from "vitest";

import {
  normalizePresentationLayoutDslToSlideContent,
  presentationLayoutDslResponseSchema,
} from "./layoutDsl";

describe("layoutDsl", () => {
  it("normalizes bounded DSL groups into slide elements", () => {
    const parsed = presentationLayoutDslResponseSchema.parse({
      status: "ok",
      elements: [
        {
          id: "card",
          type: "group",
          x: 40,
          y: 80,
          width: 640,
          height: 420,
          children: [
            {
              id: "bg",
              type: "rect",
              x: 0,
              y: 0,
              width: 640,
              height: 420,
              fill: "#ffffff",
            },
            {
              id: "title",
              type: "text",
              x: 32,
              y: 36,
              width: 576,
              height: 72,
              text: "หัวข้อสำคัญ",
              color: "#112233",
              fontSize: 42,
            },
          ],
        },
      ],
    });

    const slideContent = normalizePresentationLayoutDslToSlideContent({
      draft: parsed,
      canvasWidth: 720,
      canvasHeight: 1280,
    });

    expect(slideContent?.elements).toHaveLength(2);
    expect(slideContent?.elements[0]).toMatchObject({
      id: "card__bg",
      type: "rect",
    });
    expect(slideContent?.elements[1]).toMatchObject({
      id: "card__title",
      type: "text",
    });
  });

  it("normalizes common LLM aliases into schema-safe layout drafts", () => {
    const parsed = presentationLayoutDslResponseSchema.parse({
      status: "success",
      elements: [
        {
          type: "rect",
          x: 24,
          y: 40,
          width: 240,
          height: 160,
          color: "#f4f4f5",
        },
        {
          type: "line",
          x: 24,
          y: 220,
          width: 240,
          height: 2,
          color: "#1f2937",
        },
        {
          type: "text",
          x: 40,
          y: 64,
          width: 208,
          height: 72,
          text: "หัวข้อสำคัญ",
          fill: "#0f172a",
          fontSize: 32,
        },
      ],
      fallbackSuggestion: "Switch to a simpler layout.",
    });

    expect(parsed.status).toBe("ok");
    expect(parsed.fallbackSuggestion).toEqual({
      action: "switch_mode",
      reason: "Switch to a simpler layout.",
    });
    expect(parsed.elements[0]).toMatchObject({
      id: "dsl-el-1",
      type: "rect",
      fill: "#f4f4f5",
    });
    expect(parsed.elements[1]).toMatchObject({
      id: "dsl-el-2",
      type: "line",
      stroke: "#1f2937",
    });
    expect(parsed.elements[2]).toMatchObject({
      id: "dsl-el-3",
      type: "text",
      color: "#0f172a",
    });

    const slideContent = normalizePresentationLayoutDslToSlideContent({
      draft: parsed,
      canvasWidth: 720,
      canvasHeight: 1280,
    });

    expect(slideContent).not.toBeNull();
    expect(slideContent?.elements).toHaveLength(3);
  });

  it("rejects drafts that exceed bounded group limits", () => {
    const parsed = presentationLayoutDslResponseSchema.parse({
      status: "ok",
      elements: Array.from({ length: 5 }, (_, index) => ({
        id: `group-${index}`,
        type: "group",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        children: [
          {
            id: `rect-${index}`,
            type: "rect",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            fill: "#fff",
          },
        ],
      })),
    });

    const slideContent = normalizePresentationLayoutDslToSlideContent({
      draft: parsed,
      canvasWidth: 720,
      canvasHeight: 1280,
    });

    expect(slideContent).toBeNull();
  });
});
