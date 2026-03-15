import { describe, expect, it } from "vitest";

import { buildPresentationBlockPreset } from "./presentationBlockPresets";
import {
  buildBuiltInPresentationComponentInstance,
  buildBuiltInPresentationComponentInstanceFromSlotBindings,
} from "./presentationComponentCatalog";

const LANDSCAPE_CANVAS = {
  preset: "16:9" as const,
  width: 1280,
  height: 720,
};

const PORTRAIT_CANVAS = {
  preset: "9:16" as const,
  width: 720,
  height: 1280,
};

function makeIdFactory() {
  let index = 0;
  return (type: string) => `${type}-${++index}`;
}

describe("presentation block layout sizing", () => {
  it("keeps long-form preset copy in taller text regions", () => {
    const featureHighlights = buildPresentationBlockPreset("feature-highlights", {
      canvas: LANDSCAPE_CANVAS,
      makeId: makeIdFactory(),
    });
    const quoteCallout = buildPresentationBlockPreset("quote-callout", {
      canvas: LANDSCAPE_CANVAS,
      makeId: makeIdFactory(),
    });
    const videoSpotlight = buildPresentationBlockPreset("video-spotlight", {
      canvas: LANDSCAPE_CANVAS,
      makeId: makeIdFactory(),
    });

    const featureTitle = featureHighlights.find((element) => (
      element.type === "text" && element.text.includes("marketing points")
    ));
    const quoteText = quoteCallout.find((element) => (
      element.type === "text" && element.text.includes("Lead with one idea per slide")
    ));
    const benefitsText = videoSpotlight.find((element) => (
      element.type === "text" && element.text.includes("Keep the headline short")
    ));

    expect(featureTitle?.height ?? 0).toBeGreaterThanOrEqual(58);
    expect(quoteText?.height ?? 0).toBeGreaterThanOrEqual(90);
    expect(benefitsText?.height ?? 0).toBeGreaterThanOrEqual(57);
  });

  it("mirrors the safer text-box sizing in editable built-in components", () => {
    const processSteps = buildBuiltInPresentationComponentInstance("process-steps", {
      canvas: LANDSCAPE_CANVAS,
      instanceId: "component-process",
    });
    const featureHighlights = buildBuiltInPresentationComponentInstance("feature-highlights", {
      canvas: LANDSCAPE_CANVAS,
      instanceId: "component-features",
    });
    const videoSpotlight = buildBuiltInPresentationComponentInstance("video-spotlight", {
      canvas: LANDSCAPE_CANVAS,
      instanceId: "component-video",
    });

    expect(processSteps.fallbackElements.find((element) => element.id.endsWith("card-1-body"))?.height ?? 0).toBeGreaterThanOrEqual(34);
    expect(featureHighlights.fallbackElements.find((element) => element.id.endsWith("feature-1-body"))?.height ?? 0).toBeGreaterThanOrEqual(42);
    expect(videoSpotlight.fallbackElements.find((element) => element.id.endsWith("benefits"))?.height ?? 0).toBeGreaterThanOrEqual(57);
  });

  it("renders A4 long-form components as near full-page layouts on portrait canvases", () => {
    const articleFocus = buildBuiltInPresentationComponentInstance("article-focus", {
      canvas: PORTRAIT_CANVAS,
      instanceId: "component-a4-article",
    });
    const sectionedExplainer = buildBuiltInPresentationComponentInstance("sectioned-explainer", {
      canvas: PORTRAIT_CANVAS,
      instanceId: "component-a4-explainer",
    });

    const articleBg = articleFocus.fallbackElements.find((element) => element.id.endsWith("bg"));
    const articleTitle = articleFocus.fallbackElements.find((element) => element.id.endsWith("title"));
    const explainerBg = sectionedExplainer.fallbackElements.find((element) => element.id.endsWith("canvas-bg"));

    expect(articleBg?.width ?? 0).toBeGreaterThanOrEqual(620);
    expect(articleBg?.y ?? 9999).toBeLessThanOrEqual(80);
    expect(articleTitle?.width ?? 0).toBeGreaterThanOrEqual(340);
    expect(explainerBg?.width ?? 0).toBeGreaterThanOrEqual(620);
    expect(explainerBg?.y ?? 9999).toBeLessThanOrEqual(80);
  });

  it("renders empty media slots as real media elements so properties can target them", () => {
    const photoBoard = buildBuiltInPresentationComponentInstance("a4-photo-grid", {
      canvas: PORTRAIT_CANVAS,
      instanceId: "component-a4-photo-grid",
    });

    const heroMedia = photoBoard.fallbackElements.find((element) => element.id.endsWith("hero-image"));
    const detailMedia = photoBoard.fallbackElements.find((element) => element.id.endsWith("detail-1-image"));

    expect(heroMedia?.type).toBe("image");
    expect(heroMedia).toMatchObject({ src: "", imagePrompt: "" });
    expect(detailMedia?.type).toBe("image");
  });

  it("clamps oversized slot text to recipe budgets before rebuilding components", () => {
    const component = buildBuiltInPresentationComponentInstanceFromSlotBindings("sectioned-explainer", {
      canvas: PORTRAIT_CANVAS,
      instanceId: "component-clamped-a4",
      slotBindings: [
        { slotId: "eyebrow", type: "text", text: "Health" },
        { slotId: "title", type: "text", text: "A".repeat(400) },
        { slotId: "summary", type: "text", text: "B".repeat(600) },
        { slotId: "hero", type: "image", src: "", alt: "Hero" },
        { slotId: "takeaways", type: "list", items: Array.from({ length: 8 }, (_, index) => `Point ${index + 1} `.repeat(30)) },
      ],
    });

    const titleBinding = component.slotBindings.find((binding) => binding.slotId === "title" && binding.type === "text");
    const takeawayBinding = component.slotBindings.find((binding) => binding.slotId === "takeaways" && binding.type === "list");

    expect(titleBinding?.type).toBe("text");
    expect((titleBinding as { text: string }).text.length).toBeLessThan(400);
    expect(takeawayBinding?.type).toBe("list");
    expect((takeawayBinding as { items: string[] }).items.length).toBeLessThanOrEqual(4);
  });
});
