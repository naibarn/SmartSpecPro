import { describe, expect, it } from "vitest";

import {
  addElement,
  createElement,
  deleteElements,
  duplicateElements,
  ensureSlideContent,
  reorderElementById,
  resizeElementById,
  translateElements,
  updateElementById,
  type PresentationSlideContent,
} from "./presentationEditorState";

describe("presentationEditorState", () => {
  it("normalizes unknown slide content to a safe default shape", () => {
    expect(ensureSlideContent(null)).toEqual({
      elements: [],
      transition: undefined,
      durationMs: undefined,
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
});
