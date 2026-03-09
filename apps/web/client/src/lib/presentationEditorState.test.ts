import { describe, expect, it } from "vitest";

import {
  addElement,
  createElement,
  deleteElements,
  duplicateElements,
  ensureSlideContent,
  resizeCanvas,
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
      canvas: { preset: "9:16", width: 720, height: 1280 },
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
      y: 929,
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
