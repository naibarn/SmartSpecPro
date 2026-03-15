import { describe, expect, it } from "vitest";

import type { PresentationSlideContent } from "@shared/presentation/contracts";
import { applyResolvedMediaToAIRecipeSlideContent } from "../aiPresentationComponentRecipes";

function buildRecipeSlideContent(): PresentationSlideContent {
  return {
    elements: [],
    components: [
      {
        id: "component-a4-grid-1",
        componentId: "a4-photo-grid",
        componentType: "built-in",
        definitionRevision: 1,
        slotBindings: [
          {
            slotId: "hero-photo",
            type: "image",
            src: "https://cdn.example.com/original-hero.jpg",
            alt: "Original hero",
          },
        ],
        fallbackElements: [
          {
            id: "component-a4-grid-1::hero-image",
            type: "image",
            x: 56,
            y: 154,
            width: 560,
            height: 624,
            src: "https://cdn.example.com/original-hero.jpg",
            alt: "Original hero",
            imageFit: "cover",
          },
          {
            id: "component-a4-grid-1::hero-placeholder",
            type: "text",
            x: 72,
            y: 176,
            width: 180,
            height: 28,
            text: "Hero",
            color: "#0f172a",
          },
        ],
      },
    ],
    renderOrder: ["component:component-a4-grid-1"],
  };
}

describe("applyResolvedMediaToAIRecipeSlideContent", () => {
  it("switches a mixed media slot from image to video and replaces the slot binding", () => {
    const result = applyResolvedMediaToAIRecipeSlideContent(
      buildRecipeSlideContent(),
      {
        id: "job-1",
        mediaType: "video",
        mediaTaskId: "task-1",
        targetElementId: "component-a4-grid-1::hero-image",
        targetX: 56,
        targetY: 154,
        targetWidth: 560,
        targetHeight: 624,
        createdAt: "2026-03-15T00:00:00.000Z",
      },
      "https://cdn.example.com/hero.mp4",
      "Hero Story",
    );

    const component = result.components?.[0];
    expect(component?.slotBindings).toEqual([
      {
        slotId: "hero-photo",
        type: "video",
        src: "https://cdn.example.com/hero.mp4",
        poster: "",
        title: "Hero Story",
      },
    ]);
    expect(component?.fallbackElements.find((element) => element.id === "component-a4-grid-1::hero-image")).toMatchObject({
      type: "video",
      src: "https://cdn.example.com/hero.mp4",
    });
    expect(component?.fallbackElements.some((element) => element.id === "component-a4-grid-1::hero-placeholder")).toBe(false);
  });

  it("switches a mixed media slot from video back to image using the target slot id", () => {
    const base = buildRecipeSlideContent();
    base.components![0]!.slotBindings = [
      {
        slotId: "hero-photo",
        type: "video",
        src: "https://cdn.example.com/original-hero.mp4",
        poster: "",
        title: "Original hero clip",
      },
    ];
    base.components![0]!.fallbackElements[0] = {
      id: "component-a4-grid-1::hero-image",
      type: "video",
      x: 56,
      y: 154,
      width: 560,
      height: 624,
      src: "https://cdn.example.com/original-hero.mp4",
      poster: "",
      title: "Original hero clip",
      muted: true,
      loop: true,
      videoFit: "cover",
      videoPositionX: 50,
      videoPositionY: 50,
      videoZoom: 1,
    };

    const result = applyResolvedMediaToAIRecipeSlideContent(
      base,
      {
        id: "job-2",
        mediaType: "image",
        mediaTaskId: "task-2",
        targetElementId: "component-a4-grid-1::hero-image",
        targetSlotId: "hero-photo",
        targetX: 56,
        targetY: 154,
        targetWidth: 560,
        targetHeight: 624,
        createdAt: "2026-03-15T00:00:00.000Z",
      },
      "https://cdn.example.com/final-hero.jpg",
      "Hero Story",
    );

    const component = result.components?.[0];
    expect(component?.slotBindings).toEqual([
      {
        slotId: "hero-photo",
        type: "image",
        src: "https://cdn.example.com/final-hero.jpg",
        alt: "Hero Story",
      },
    ]);
    expect(component?.fallbackElements.find((element) => element.id === "component-a4-grid-1::hero-image")).toMatchObject({
      type: "image",
      src: "https://cdn.example.com/final-hero.jpg",
    });
  });
});
