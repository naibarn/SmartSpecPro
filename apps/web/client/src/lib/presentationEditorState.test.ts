import { describe, expect, it } from "vitest";

import {
  addElement,
  createElement,
  ensureSlideContent,
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
});
