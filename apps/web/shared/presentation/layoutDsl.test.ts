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
      x: 40,
      y: 80,
    });
    expect(slideContent?.elements[1]).toMatchObject({
      id: "card__title",
      type: "text",
      x: 72,
      y: 116,
    });
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
