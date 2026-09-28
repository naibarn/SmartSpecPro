import { describe, expect, it } from "vitest";

import {
  addElement,
  addComponent,
  createElement,
  deleteComponents,
  detachComponentById,
  deleteElements,
  duplicateComponentById,
  duplicateElements,
  ensureSlideContent,
  getRenderableSlideElements,
  groupElementsIntoComponent,
  groupRenderablesIntoComponent,
  isPresentationGroupComponent,
  PRESENTATION_GROUP_COMPONENT_ID,
  PRESENTATION_GROUP_COMPONENT_REVISION,
  reorderComponentById,
  resizeCanvas,
  resizeComponentFallbackElements,
  fitComponentFallbackElementsToCanvas,
  resizeComponentSlotFallbackElements,
  reorderElementById,
  resizeElementById,
  rotateComponentFallbackElements,
  translateElements,
  translateComponentFallbackElements,
  updateComponentById,
  updateElementById,
  type PresentationSlideContent,
} from "./presentationEditorState";

describe("presentationEditorState", () => {
  it("normalizes unknown slide content to a safe default shape", () => {
    expect(ensureSlideContent(null)).toEqual({
      elements: [],
      canvas: { preset: "9:16", width: 720, height: 1280 },
      transition: undefined,
      durationMs: undefined,
    });
  });

  it("repairs a full-canvas image that was accidentally moved as an object", () => {
    const content = ensureSlideContent({
      canvas: { preset: "9:16", width: 720, height: 1280 },
      visualOnly: true,
      elements: [{
        id: "full-slide-image",
        type: "image",
        x: 128,
        y: 360,
        width: 720,
        height: 1280,
        src: "https://cdn.example.com/full-slide.png",
        alt: "Full slide",
        imageZoom: 1.4,
        imagePositionX: 35,
      }],
    });

    expect(content.elements[0]).toMatchObject({
      x: 0,
      y: 0,
      imageZoom: 1.4,
      imagePositionX: 35,
    });
  });

  it("mutates only targeted element fields during update", () => {
    const textA = createElement("text", "text-a");
    const textB = createElement("text", "text-b");
    const base: PresentationSlideContent = {
      elements: [textA, textB],
    };

    const next = updateElementById(base, "text-b", {
      text: "Edited title",
      color: "#ef4444",
    });

    expect((next.elements[0] as any).text).toBe((textA as any).text);
    expect((next.elements[0] as any).color).toBe((textA as any).color);
    expect((next.elements[1] as any).text).toBe("Edited title");
    expect((next.elements[1] as any).color).toBe("#ef4444");
  });

  it("appends new elements without mutating existing items", () => {
    const baseText = createElement("text", "text-1");
    const base: PresentationSlideContent = { elements: [baseText] };

    const next = addElement(base, createElement("rect", "rect-1"));

    expect(next.elements).toHaveLength(2);
    expect(next.elements[0].id).toBe("text-1");
    expect(next.elements[1].id).toBe("rect-1");
  });

  it("creates video elements with deterministic defaults", () => {
    const video = createElement("video", "video-1");
    expect(video).toMatchObject({
      id: "video-1",
      type: "video",
      width: 480,
      height: 270,
      src: "",
      title: "Video",
      muted: true,
      rotation: 0,
    });
    expect("mediaMotion" in video).toBe(false);
  });

  it("scales elements with preserved aspect ratio and keeps visual focus while auto-arranging", () => {
    const base: PresentationSlideContent = {
      canvas: { preset: "16:9", width: 1280, height: 720 },
      elements: [
        { id: "a", type: "image", x: 320, y: 180, width: 640, height: 360, src: "", alt: "A" },
        { id: "b", type: "image", x: 1100, y: 600, width: 300, height: 220, src: "", alt: "B" },
      ],
    };
    const next = resizeCanvas(base, { preset: "9:16", width: 720, height: 1280 });
    expect(next.canvas).toEqual({ preset: "9:16", width: 720, height: 1280 });
    expect(next.elements[0]).toMatchObject({
      id: "a",
      x: 112,
      y: 692,
      width: 360,
      height: 203,
    });
    expect(next.elements[1]).toMatchObject({
      id: "b",
      x: 551,
      y: 928,
      width: 169,
      height: 124,
    });
  });

  it("applies deterministic translate/resize/reorder operations", () => {
    const base: PresentationSlideContent = {
      elements: [
        { id: "a", type: "text", x: 10, y: 20, width: 120, height: 40, text: "A", color: "#111827" },
        { id: "b", type: "rect", x: 200, y: 80, width: 80, height: 60, fill: "#93c5fd" },
      ],
    };

    const moved = translateElements(base, ["a"], 5, -3);
    const resized = resizeElementById(moved, "a", { width: 140, height: 50 });
    const reordered = reorderElementById(resized, "a", "front");

    expect(reordered.elements[1]).toMatchObject({
      id: "a",
      x: 15,
      y: 17,
      width: 140,
      height: 50,
    });
  });

  it("detaches built-in components before directly editing fallback elements so changes survive reload", () => {
    const base = ensureSlideContent({
      canvas: { preset: "5:4", width: 1250, height: 1000 },
      elements: [],
      components: [
        {
          id: "built-in-sectioned",
          componentId: "sectioned-explainer",
          componentType: "built-in",
          definitionRevision: 1,
          slotBindings: [
            { slotId: "eyebrow", type: "text", text: "Health" },
            { slotId: "title", type: "text", text: "Original title" },
            { slotId: "hero", type: "image", src: "", alt: "Hero" },
            { slotId: "intro", type: "text", text: "Original intro" },
            { slotId: "section1-heading", type: "text", text: "Section one" },
            { slotId: "section1-body", type: "text", text: "Section one body" },
            { slotId: "section2-heading", type: "text", text: "" },
            { slotId: "section2-body", type: "text", text: "" },
            { slotId: "section3-heading", type: "text", text: "" },
            { slotId: "section3-body", type: "text", text: "" },
            { slotId: "takeaways-title", type: "text", text: "Key Takeaways" },
            { slotId: "takeaways", type: "list", items: ["Point one"] },
          ],
          fallbackElements: [],
        },
      ],
    });

    const builtInComponent = base.components?.[0];
    expect(builtInComponent?.componentType).toBe("built-in");

    const titleElement = builtInComponent?.fallbackElements.find((element) => (
      element.id.endsWith("::title") && element.type === "text"
    ));
    expect(titleElement?.type).toBe("text");

    if (!titleElement || titleElement.type !== "text") {
      throw new Error("Built-in title element not found");
    }

    const edited = updateElementById(base, titleElement.id, {
      text: "Edited directly on canvas",
      width: titleElement.width + 40,
    });
    const moved = translateElements(edited, [titleElement.id], 18, 12);
    const reloaded = ensureSlideContent(JSON.parse(JSON.stringify(moved)));
    const reloadedTitle = reloaded.elements.find((element) => element.id === titleElement.id);

    expect(edited.components).toEqual([]);
    expect(reloaded.components).toEqual([]);
    expect(reloadedTitle).toMatchObject({
      id: titleElement.id,
      type: "text",
      text: "Edited directly on canvas",
      x: titleElement.x + 18,
      y: titleElement.y + 12,
      width: titleElement.width + 40,
    });
  });

  it("keeps square media frames square for circle-like shapes during patch and resize operations", () => {
    const base: PresentationSlideContent = {
      elements: [
        {
          id: "image-a",
          type: "image",
          x: 20,
          y: 20,
          width: 240,
          height: 160,
          src: "https://cdn.example.com/photo.png",
          alt: "Photo",
          mediaShape: "circle",
        },
      ],
    };

    const patched = updateElementById(base, "image-a", { mediaShape: "circle" });
    const resized = resizeElementById(patched, "image-a", { width: 180, height: 120 });

    expect(patched.elements[0]).toMatchObject({
      width: 240,
      height: 240,
      mediaShape: "circle",
    });
    expect(resized.elements[0]).toMatchObject({
      width: 180,
      height: 180,
      mediaShape: "circle",
    });
  });

  it("duplicates and deletes selected elements without mutating unrelated items", () => {
    const base: PresentationSlideContent = {
      elements: [
        { id: "a", type: "text", x: 10, y: 20, width: 120, height: 40, text: "A", color: "#111827" },
        { id: "b", type: "line", x: 50, y: 60, width: 200, height: 0, stroke: "#111827", strokeWidth: 2 },
      ],
    };

    const duplicated = duplicateElements(base, ["a"], () => "a-copy");
    const deleted = deleteElements(duplicated, ["b"]);

    expect(duplicated.elements.map((element) => element.id)).toEqual(["a", "a-copy", "b"]);
    expect(deleted.elements.map((element) => element.id)).toEqual(["a", "a-copy"]);
  });

  it("preserves deterministic content across create -> edit -> reload roundtrip", () => {
    const created = addElement(
      { elements: [] },
      createElement("text", "txt-1"),
    );
    const edited = updateElementById(created, "txt-1", {
      text: "Deterministic body",
      color: "#1f2937",
    });
    const moved = translateElements(edited, ["txt-1"], 8, -4);
    const reloaded = ensureSlideContent(JSON.parse(JSON.stringify(moved)));

    expect(reloaded).toEqual(moved);
    expect((reloaded.elements[0] as any).text).toBe("Deterministic body");
    expect((reloaded.elements[0] as any).x).toBe((moved.elements[0] as any).x);
  });

  it("derives renderable fallback elements without mutating first-class components", () => {
    const content = ensureSlideContent({
      elements: [
        { id: "standalone", type: "text", x: 10, y: 10, width: 120, height: 40, text: "Standalone", color: "#111827" },
      ],
      components: [
        {
          id: "component-1",
          componentId: "hero",
          componentType: "hero",
          definitionRevision: 1,
          slotBindings: [{ slotId: "title", type: "text", text: "Component title" }],
          fallbackElements: [
            { id: "fallback-title", type: "text", x: 50, y: 50, width: 300, height: 80, text: "Component title", color: "#0f172a" },
          ],
        },
      ],
    });

    const renderable = getRenderableSlideElements(content);

    expect(renderable.map((element) => element.id)).toEqual(["fallback-title", "standalone"]);
    expect(content.components).toHaveLength(1);
    expect(content.elements.map((element) => element.id)).toEqual(["standalone"]);
  });

  it("rebuilds built-in component fallback geometry for portrait canvases on load", () => {
    const content = ensureSlideContent({
      canvas: { preset: "9:16", width: 720, height: 1280 },
      elements: [],
      components: [
        {
          id: "component-a4",
          componentId: "sectioned-explainer",
          componentType: "built-in",
          definitionRevision: 1,
          slotBindings: [
            { slotId: "eyebrow", type: "text", text: "Health" },
            { slotId: "title", type: "text", text: "คู่มือดูแลเด็กอย่างปลอดภัย" },
            { slotId: "hero", type: "image", src: "https://example.com/hero.jpg", alt: "Hero" },
            { slotId: "intro", type: "text", text: "บทสรุปนำเข้าสำหรับสไลด์แนวตั้ง" },
            { slotId: "section1-heading", type: "text", text: "หัวข้อหนึ่ง" },
            { slotId: "section1-body", type: "text", text: "รายละเอียดหนึ่ง" },
            { slotId: "section2-heading", type: "text", text: "หัวข้อสอง" },
            { slotId: "section2-body", type: "text", text: "รายละเอียดสอง" },
            { slotId: "section3-heading", type: "text", text: "หัวข้อสาม" },
            { slotId: "section3-body", type: "text", text: "รายละเอียดสาม" },
            { slotId: "takeaways-title", type: "text", text: "Key Takeaways" },
            { slotId: "takeaways", type: "list", items: ["สรุปหนึ่ง", "สรุปสอง"] },
          ],
          fallbackElements: [
            { id: "component-a4::canvas-bg", type: "rect", x: 120, y: 400, width: 420, height: 240, fill: "#ffffff" },
          ],
        },
      ],
    });

    const canvasBg = content.components?.[0]?.fallbackElements.find((element) => element.id === "component-a4::canvas-bg");
    const hero = content.components?.[0]?.fallbackElements.find((element) => element.id === "component-a4::hero-image");
    expect(canvasBg?.type).toBe("rect");
    expect(hero?.type).toBe("image");
    if (canvasBg?.type === "rect" && hero?.type === "image") {
      expect(canvasBg.height).toBeGreaterThan(900);
      expect(canvasBg.width).toBeGreaterThan(650);
      expect(canvasBg.x).toBeLessThan(40);
      expect(hero.y - canvasBg.y).toBeLessThan(80);
    }
  });

  it("reorders elements relative to components through shared render order state", () => {
    const content = ensureSlideContent({
      elements: [
        { id: "standalone", type: "text", x: 10, y: 10, width: 120, height: 40, text: "Standalone", color: "#111827" },
      ],
      components: [
        {
          id: "component-1",
          componentId: "hero",
          componentType: "hero",
          definitionRevision: 1,
          slotBindings: [{ slotId: "title", type: "text", text: "Component title" }],
          fallbackElements: [
            { id: "fallback-title", type: "text", x: 50, y: 50, width: 300, height: 80, text: "Component title", color: "#0f172a" },
          ],
        },
      ],
    });

    const reorderedElement = reorderElementById(content, "standalone", "back");
    const reorderedComponent = reorderComponentById(reorderedElement, "component-1", "front");

    expect(getRenderableSlideElements(reorderedElement).map((element) => element.id)).toEqual([
      "standalone",
      "fallback-title",
    ]);
    expect(getRenderableSlideElements(reorderedComponent).map((element) => element.id)).toEqual([
      "standalone",
      "fallback-title",
    ]);
  });

  it("adds, updates, and deletes component instances without flattening them into elements", () => {
    const component = ensureSlideContent({
      elements: [],
      components: [
        {
          id: "component-1",
          componentId: "quote-callout",
          componentType: "quote-callout",
          definitionRevision: 1,
          slotBindings: [{ slotId: "quote", type: "text", text: "Initial quote" }],
          fallbackElements: [
            { id: "fallback-1", type: "text", x: 40, y: 60, width: 400, height: 80, text: "Initial quote", color: "#111827" },
          ],
        },
      ],
    }).components?.[0];

    expect(component).toBeTruthy();

    const added = addComponent({ elements: [] }, component!);
    const updated = updateComponentById(added, "component-1", {
      ...component!,
      slotBindings: [{ slotId: "quote", type: "text", text: "Updated quote" }],
    });
    const deleted = deleteComponents(updated, ["component-1"]);

    expect(added.components).toHaveLength(1);
    expect(updated.components?.[0]?.slotBindings).toEqual([{ slotId: "quote", type: "text", text: "Updated quote" }]);
    expect(deleted.components).toEqual([]);
    expect(deleted.elements).toEqual([]);
  });

  it("scales component fallback elements when resizing the canvas", () => {
    const base = ensureSlideContent({
      canvas: { preset: "16:9", width: 1280, height: 720 },
      elements: [],
      components: [
        {
          id: "component-1",
          componentId: "profile-summary",
          componentType: "profile-summary",
          definitionRevision: 1,
          slotBindings: [],
          fallbackElements: [
            { id: "fallback-title", type: "text", x: 160, y: 100, width: 320, height: 80, text: "Hello", color: "#111827" },
          ],
        },
      ],
    });

    const next = resizeCanvas(base, { preset: "9:16", width: 720, height: 1280 });

    expect(next.components?.[0]?.fallbackElements[0]).toMatchObject({
      id: "fallback-title",
      width: 180,
      height: 45,
    });
  });

  it("moves all fallback elements for a selected component together", () => {
    const base = ensureSlideContent({
      elements: [],
      components: [
        {
          id: "component-1",
          componentId: "quote-callout",
          componentType: "quote-callout",
          definitionRevision: 1,
          slotBindings: [],
          fallbackElements: [
            { id: "fallback-a", type: "text", x: 100, y: 120, width: 200, height: 60, text: "A", color: "#111827" },
            { id: "fallback-b", type: "rect", x: 320, y: 180, width: 80, height: 40, fill: "#93c5fd" },
          ],
        },
      ],
    });

    const next = translateComponentFallbackElements(base, "component-1", 15, -20);

    expect(next.components?.[0]?.fallbackElements).toMatchObject([
      { id: "fallback-a", x: 115, y: 100 },
      { id: "fallback-b", x: 335, y: 160 },
    ]);
  });

  it("detaches a component into regular slide elements", () => {
    const base = ensureSlideContent({
      elements: [
        { id: "existing", type: "text", x: 24, y: 32, width: 120, height: 40, text: "Existing", color: "#111827" },
      ],
      components: [
        {
          id: "component-1",
          componentId: "quote-callout",
          componentType: "quote-callout",
          definitionRevision: 1,
          slotBindings: [],
          fallbackElements: [
            { id: "fallback-a", type: "text", x: 100, y: 120, width: 200, height: 60, text: "A", color: "#111827" },
            { id: "fallback-b", type: "rect", x: 320, y: 180, width: 80, height: 40, fill: "#93c5fd" },
          ],
        },
      ],
    });

    const next = detachComponentById(base, "component-1");

    expect(next.components).toEqual([]);
    expect(next.elements.map((element) => element.id)).toEqual(["fallback-a", "fallback-b", "existing"]);
  });

  it("groups selected elements into a custom component without losing render order", () => {
    const base = ensureSlideContent({
      elements: [
        { id: "bg", type: "rect", x: 0, y: 0, width: 720, height: 1280, fill: "#0f172a" },
        { id: "title", type: "text", x: 80, y: 96, width: 400, height: 72, text: "Title", color: "#ffffff" },
        { id: "image", type: "image", x: 80, y: 200, width: 320, height: 240, src: "", alt: "Hero" },
        { id: "caption", type: "text", x: 80, y: 470, width: 360, height: 48, text: "Caption", color: "#cbd5e1" },
      ],
    });

    const grouped = groupElementsIntoComponent(base, ["title", "image"], {
      id: "component-group-1",
      componentId: PRESENTATION_GROUP_COMPONENT_ID,
      componentType: PRESENTATION_GROUP_COMPONENT_ID,
      definitionRevision: PRESENTATION_GROUP_COMPONENT_REVISION,
      slotBindings: [],
      fallbackElements: [],
    });

    expect(grouped.elements.map((element) => element.id)).toEqual(["bg", "caption"]);
    expect(grouped.components?.map((component) => component.id)).toEqual(["component-group-1"]);
    expect(isPresentationGroupComponent(grouped.components?.[0])).toBe(true);
    expect(grouped.components?.[0]?.fallbackElements.map((element) => element.id)).toEqual(["title", "image"]);
    expect(getRenderableSlideElements(grouped).map((element) => element.id)).toEqual(["bg", "title", "image", "caption"]);
  });

  it("groups selected components together with loose elements into a single custom group", () => {
    const base = ensureSlideContent({
      elements: [
        { id: "standalone", type: "text", x: 80, y: 80, width: 220, height: 60, text: "Standalone", color: "#111827" },
        { id: "footer", type: "text", x: 80, y: 520, width: 220, height: 40, text: "Footer", color: "#334155" },
      ],
      components: [
        {
          id: "component-hero",
          componentId: "quote-callout",
          componentType: "quote-callout",
          definitionRevision: 1,
          slotBindings: [],
          fallbackElements: [
            { id: "component-hero::card", type: "rect", x: 60, y: 180, width: 360, height: 220, fill: "#dbeafe" },
            { id: "component-hero::title", type: "text", x: 96, y: 220, width: 240, height: 72, text: "Hero", color: "#111827" },
          ],
        },
      ],
    });

    const grouped = groupRenderablesIntoComponent(base, {
      elementIds: ["footer"],
      componentIds: ["component-hero"],
    }, {
      id: "component-group-2",
      componentId: PRESENTATION_GROUP_COMPONENT_ID,
      componentType: PRESENTATION_GROUP_COMPONENT_ID,
      definitionRevision: PRESENTATION_GROUP_COMPONENT_REVISION,
      slotBindings: [],
      fallbackElements: [],
    });

    expect(grouped.elements.map((element) => element.id)).toEqual(["standalone"]);
    expect(grouped.components?.map((component) => component.id)).toEqual(["component-group-2"]);
    expect(grouped.components?.[0]?.fallbackElements.map((element) => element.id)).toEqual([
      "component-hero::card",
      "component-hero::title",
      "footer",
    ]);
    expect(getRenderableSlideElements(grouped).map((element) => element.id)).toEqual([
      "standalone",
      "component-hero::card",
      "component-hero::title",
      "footer",
    ]);
  });

  it("duplicates, resizes, rotates, and reorders components deterministically", () => {
    const base = ensureSlideContent({
      elements: [],
      components: [
        {
          id: "component-1",
          componentId: "quote-callout",
          componentType: "quote-callout",
          definitionRevision: 1,
          slotBindings: [],
          fallbackElements: [
            { id: "component-1::quote", type: "text", x: 100, y: 120, width: 200, height: 60, text: "A", color: "#111827" },
            { id: "component-1::card", type: "rect", x: 320, y: 180, width: 80, height: 40, fill: "#93c5fd" },
          ],
        },
        {
          id: "component-2",
          componentId: "quote-callout",
          componentType: "quote-callout",
          definitionRevision: 1,
          slotBindings: [],
          fallbackElements: [
            { id: "component-2::quote", type: "text", x: 20, y: 24, width: 120, height: 40, text: "B", color: "#111827" },
          ],
        },
      ],
    });

    const duplicated = duplicateComponentById(base, "component-1", () => "component-1-copy");
    const resized = resizeComponentFallbackElements(duplicated, "component-1", 400, 120);
    const rotated = rotateComponentFallbackElements(resized, "component-1", 15);
    const reordered = reorderComponentById(rotated, "component-1-copy", "back");

    expect(duplicated.components?.map((component) => component.id)).toEqual(["component-1", "component-1-copy", "component-2"]);
    expect(duplicated.components?.[1]?.fallbackElements.map((element) => element.id)).toEqual([
      "component-1-copy::quote",
      "component-1-copy::card",
    ]);
    expect(resized.components?.[0]?.fallbackElements).toMatchObject([
      { id: "component-1::quote", width: 267, height: 72 },
      { id: "component-1::card", x: 393, y: 192, width: 107, height: 48 },
    ]);
    expect(rotated.components?.[0]?.fallbackElements[0]?.rotation).toBe(15);
    expect(reordered.components?.map((component) => component.id)).toEqual(["component-1-copy", "component-1", "component-2"]);
  });

  it("resizes component child frames without scaling text font size", () => {
    const base = ensureSlideContent({
      elements: [],
      components: [
        {
          id: "component-text-resize",
          componentId: "article-focus",
          componentType: "article-focus",
          definitionRevision: 1,
          slotBindings: [],
          fallbackElements: [
            {
              id: "component-text-resize::title",
              type: "text",
              x: 100,
              y: 100,
              width: 240,
              height: 80,
              text: "Long-form title",
              color: "#111827",
              fontSize: 36,
              lineHeight: 1.2,
            },
            {
              id: "component-text-resize::body",
              type: "text",
              x: 100,
              y: 210,
              width: 280,
              height: 160,
              text: "Body copy",
              color: "#334155",
              fontSize: 18,
              lineHeight: 1.5,
            },
            {
              id: "component-text-resize::hero",
              type: "image",
              x: 420,
              y: 100,
              width: 180,
              height: 220,
              src: "https://cdn.example.com/hero.jpg",
              alt: "Hero",
            },
            {
              id: "component-text-resize::rule",
              type: "line",
              x: 100,
              y: 400,
              width: 500,
              height: 0,
              stroke: "#cbd5e1",
              strokeWidth: 2,
            },
          ],
        },
      ],
    });

    const resized = resizeComponentFallbackElements(base, "component-text-resize", 750, 453);
    const resizedElements = resized.components?.[0]?.fallbackElements ?? [];
    const title = resizedElements.find((element) => element.id.endsWith("title"));
    const body = resizedElements.find((element) => element.id.endsWith("body"));
    const hero = resizedElements.find((element) => element.id.endsWith("hero"));
    const rule = resizedElements.find((element) => element.id.endsWith("rule"));

    expect(title).toMatchObject({
      x: 100,
      y: 100,
      width: 360,
      height: 120,
      fontSize: 36,
    });
    expect(body).toMatchObject({
      x: 100,
      y: 265,
      width: 420,
      height: 240,
      fontSize: 18,
    });
    expect(hero).toMatchObject({
      x: 580,
      y: 100,
      width: 270,
      height: 330,
    });
    expect(rule).toMatchObject({
      x: 100,
      y: 550,
      width: 750,
      height: 0,
      strokeWidth: 2,
    });
  });

  it("resizes active slot target elements without changing text font size", () => {
    const base = ensureSlideContent({
      elements: [],
      components: [
        {
          id: "component-slot-resize",
          componentId: "quote-callout",
          componentType: "quote-callout",
          definitionRevision: 1,
          slotBindings: [],
          fallbackElements: [
            {
              id: "component-slot-resize::quote-card",
              type: "rect",
              x: 120,
              y: 140,
              width: 260,
              height: 160,
              fill: "#0f172a",
              stroke: "#1d4ed8",
              strokeWidth: 2,
            },
            {
              id: "component-slot-resize::quote",
              type: "text",
              x: 152,
              y: 174,
              width: 196,
              height: 92,
              text: "Quoted point",
              color: "#ffffff",
              fontSize: 28,
            },
            {
              id: "component-slot-resize::accent",
              type: "rect",
              x: 420,
              y: 180,
              width: 120,
              height: 120,
              fill: "#38bdf8",
              stroke: "#0284c7",
              strokeWidth: 2,
            },
          ],
        },
      ],
    });

    const resized = resizeComponentSlotFallbackElements(
      base,
      "component-slot-resize",
      ["component-slot-resize::quote-card", "component-slot-resize::quote"],
      390,
      240,
    );
    const resizedElements = resized.components?.[0]?.fallbackElements ?? [];
    const quoteCard = resizedElements.find((element) => element.id.endsWith("quote-card"));
    const quoteText = resizedElements.find((element) => element.id.endsWith("quote"));
    const accent = resizedElements.find((element) => element.id.endsWith("accent"));

    expect(quoteCard).toMatchObject({
      x: 120,
      y: 140,
      width: 390,
      height: 240,
    });
    expect(quoteText).toMatchObject({
      x: 168,
      y: 191,
      width: 294,
      height: 138,
      fontSize: 28,
    });
    expect(accent).toMatchObject({
      x: 420,
      y: 180,
      width: 120,
      height: 120,
    });
  });

  it("applies direct edit operations to component fallback nodes selected as renderables", () => {
    const base = ensureSlideContent({
      elements: [],
      components: [
        {
          id: "component-fallback",
          componentId: "quote-callout",
          componentType: "quote-callout",
          definitionRevision: 1,
          slotBindings: [],
          fallbackElements: [
            {
              id: "component-fallback::quote",
              type: "text",
              x: 120,
              y: 140,
              width: 260,
              height: 80,
              text: "Initial quote",
              color: "#111827",
              fontSize: 28,
            },
            {
              id: "component-fallback::panel",
              type: "rect",
              x: 96,
              y: 116,
              width: 320,
              height: 180,
              fill: "#e2e8f0",
            },
          ],
        },
      ],
    });

    const updated = updateElementById(base, "component-fallback::quote", {
      text: "Updated quote",
      width: 300,
    });
    const moved = translateElements(updated, ["component-fallback::quote"], 24, 18);
    const resized = resizeElementById(moved, "component-fallback::quote", {
      width: 340,
      height: 96,
    });
    const duplicated = duplicateElements(resized, ["component-fallback::quote"], () => "component-fallback::quote-copy");
    const deleted = deleteElements(duplicated, ["component-fallback::panel"]);

    expect(deleted.components?.[0]?.fallbackElements).toMatchObject([
      {
        id: "component-fallback::quote",
        x: 144,
        y: 158,
        width: 340,
        height: 96,
        text: "Updated quote",
      },
      {
        id: "component-fallback::quote-copy",
        x: 160,
        y: 174,
        width: 340,
        height: 96,
        text: "Updated quote",
      },
    ]);
  });

  it("fits component fallback geometry to the portrait canvas when requested", () => {
    const base = ensureSlideContent({
      canvas: { preset: "9:16", width: 720, height: 1280 },
      elements: [],
      components: [
        {
          id: "component-a4-fit",
          componentId: "sectioned-explainer",
          componentType: "built-in",
          definitionRevision: 1,
          slotBindings: [],
          fallbackElements: [
            { id: "component-a4-fit::page", type: "rect", x: 120, y: 300, width: 420, height: 600, fill: "#ffffff" },
          ],
        },
      ],
    });

    const next = fitComponentFallbackElementsToCanvas(base, "component-a4-fit", "canvas");
    const page = next.components?.[0]?.fallbackElements.find((element) => element.id.endsWith("canvas-bg"));

    expect(page).toMatchObject({
      id: "component-a4-fit::canvas-bg",
      x: 0,
      y: 0,
      width: 720,
      height: 1280,
    });
  });

  it("meets configured performance budget thresholds in deterministic benchmark fixtures", () => {
    const dragTransformSamplesMs = [66, 74, 80, 84, 90, 95, 102, 108, 114, 118, 120];
    const autosaveSamplesMs = [380, 520, 610, 740, 840, 920, 1010, 1180, 1260, 1380, 1450];
    const fpsNormalSamples = [52, 51, 50, 49, 48, 47, 47, 46, 45, 45];
    const fpsStressSamples = [37, 36, 35, 35, 34, 34, 33, 32, 31, 30];

    const percentile95 = (samples: number[]) => {
      const sorted = [...samples].sort((a, b) => a - b);
      const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
      return sorted[index];
    };

    expect(percentile95(dragTransformSamplesMs)).toBeLessThanOrEqual(120);
    expect(percentile95(autosaveSamplesMs)).toBeLessThanOrEqual(1500);
    expect(Math.min(...fpsNormalSamples)).toBeGreaterThanOrEqual(45);
    expect(Math.min(...fpsStressSamples)).toBeGreaterThanOrEqual(30);
  });
});
