import { describe, expect, it } from "vitest";

import { CommandBus } from "./CommandBus";
import { PRESENTATION_GROUP_COMPONENT_ID } from "@/lib/presentationEditorState";
import {
  addElementsCommand,
  arrangeComponentCommand,
  arrangeSelectionCommand,
  createCanvasCommandState,
  deleteComponentCommand,
  detachComponentCommand,
  duplicateComponentCommand,
  groupSelectionCommand,
  moveComponentCommand,
  moveSelectionCommand,
  patchSelectedElementCommand,
  resizeComponentCommand,
  resizeSelectionCommand,
  rotateComponentCommand,
  rotateSelectionCommand,
  setCanvasSizeCommand,
  selectElementsCommand,
} from "./commands";

describe("commands", () => {
  it("updates geometry deterministically through move/resize/rotate", () => {
    const bus = new CommandBus(
      createCanvasCommandState({
        elements: [
          { id: "a", type: "text", x: 10, y: 20, width: 100, height: 40, text: "A", color: "#111827" },
          { id: "b", type: "rect", x: 200, y: 120, width: 80, height: 40, fill: "#93c5fd" },
        ],
      }, ["a"]),
    );

    bus.execute(moveSelectionCommand(5, 6));
    bus.execute(resizeSelectionCommand(120, 55));
    bus.execute(rotateSelectionCommand(15));

    const next = bus.getState();
    expect(next.content.elements[0]).toMatchObject({
      id: "a",
      x: 15,
      y: 26,
      width: 120,
      height: 55,
      rotation: 15,
    });
  });

  it("can move selection without snap lock", () => {
    const bus = new CommandBus(
      createCanvasCommandState({
        elements: [
          { id: "a", type: "text", x: 95, y: 94, width: 100, height: 50, text: "A", color: "#111827" },
          { id: "b", type: "rect", x: 200, y: 120, width: 100, height: 50, fill: "#93c5fd" },
        ],
      }, ["a"]),
    );

    bus.execute(moveSelectionCommand(1, 1, false));
    const moved = bus.getState().content.elements.find((element) => element.id === "a");

    expect(moved).toMatchObject({
      id: "a",
      x: 96,
      y: 95,
    });
    expect(bus.getState().snapGuides).toEqual([]);
  });

  it("keeps arrange ordering deterministic and supports property patching", () => {
    const bus = new CommandBus(
      createCanvasCommandState({
        elements: [
          { id: "a", type: "text", x: 10, y: 10, width: 100, height: 40, text: "A", color: "#111827" },
          { id: "b", type: "text", x: 10, y: 80, width: 100, height: 40, text: "B", color: "#111827" },
          { id: "c", type: "text", x: 10, y: 140, width: 100, height: 40, text: "C", color: "#111827" },
        ],
      }, ["b"]),
    );

    bus.execute(arrangeSelectionCommand("front"));
    expect(bus.getState().content.elements.map((element) => element.id)).toEqual(["a", "c", "b"]);

    bus.execute(arrangeSelectionCommand("back"));
    expect(bus.getState().content.elements.map((element) => element.id)).toEqual(["b", "a", "c"]);

    bus.execute(selectElementsCommand(["a"]));
    bus.execute(patchSelectedElementCommand({ text: "Edited" }));
    expect((bus.getState().content.elements[1] as any).text).toBe("Edited");
  });

  it("broadcasts style patches across multi-selected elements of the same type", () => {
    const bus = new CommandBus(
      createCanvasCommandState({
        elements: [
          { id: "a", type: "text", x: 10, y: 10, width: 100, height: 40, text: "A", color: "#111827", fontSize: 32 },
          { id: "b", type: "text", x: 10, y: 80, width: 100, height: 40, text: "B", color: "#111827", fontSize: 32 },
          { id: "c", type: "rect", x: 200, y: 120, width: 80, height: 40, fill: "#93c5fd" },
        ],
      }, ["a", "b", "c"]),
    );

    bus.execute(patchSelectedElementCommand({ fontSize: 56, color: "#ef4444" }));
    const next = bus.getState().content.elements;
    const a = next.find((element) => element.id === "a");
    const b = next.find((element) => element.id === "b");
    const c = next.find((element) => element.id === "c");

    expect(a).toMatchObject({ fontSize: 56, color: "#ef4444" });
    expect(b).toMatchObject({ fontSize: 56, color: "#ef4444" });
    expect(c).toMatchObject({ fill: "#93c5fd" });
  });

  it("does not broadcast text-content patches across multi-selected text elements", () => {
    const bus = new CommandBus(
      createCanvasCommandState({
        elements: [
          { id: "a", type: "text", x: 10, y: 10, width: 100, height: 40, text: "A", color: "#111827" },
          { id: "b", type: "text", x: 10, y: 80, width: 100, height: 40, text: "B", color: "#111827" },
        ],
      }, ["a", "b"]),
    );

    bus.execute(patchSelectedElementCommand({ text: "Edited only first" }));
    const next = bus.getState().content.elements;
    expect(next.find((element) => element.id === "a")).toMatchObject({ text: "Edited only first" });
    expect(next.find((element) => element.id === "b")).toMatchObject({ text: "B" });
  });

  it("scales multiple selected elements proportionally when resizing selection", () => {
    const bus = new CommandBus(
      createCanvasCommandState({
        elements: [
          { id: "a", type: "text", x: 10, y: 10, width: 100, height: 40, text: "A", color: "#111827", fontSize: 40 },
          { id: "b", type: "rect", x: 200, y: 120, width: 60, height: 30, fill: "#93c5fd" },
          { id: "c", type: "rect", x: 320, y: 180, width: 80, height: 20, fill: "#60a5fa" },
        ],
      }, ["a", "b", "c"]),
    );

    bus.execute(resizeSelectionCommand(150, 80));
    const next = bus.getState().content.elements;
    expect(next.find((element) => element.id === "a")).toMatchObject({ width: 150, height: 80, fontSize: 60 });
    expect(next.find((element) => element.id === "b")).toMatchObject({ width: 90, height: 60 });
    expect(next.find((element) => element.id === "c")).toMatchObject({ width: 120, height: 40 });
  });

  it("uniformly scales and repositions canvas content while preserving visual focus", () => {
    const bus = new CommandBus(
      createCanvasCommandState({
        elements: [
          { id: "a", type: "rect", x: 128, y: 72, width: 640, height: 360, fill: "#93c5fd" },
        ],
        canvas: { preset: "16:9", width: 1280, height: 720 },
      }),
    );

    bus.execute(setCanvasSizeCommand({ preset: "9:16", width: 720, height: 1280 }));
    const next = bus.getState();

    expect(next.content.canvas).toEqual({ preset: "9:16", width: 720, height: 1280 });
    expect(next.content.elements[0]).toMatchObject({
      id: "a",
      x: 72,
      y: 346,
      width: 360,
      height: 203,
    });
  });

  it("prioritizes selected element focus when resizing canvas ratio", () => {
    const baseState = {
      elements: [
        { id: "bg", type: "rect", x: 0, y: 0, width: 800, height: 600, fill: "#94a3b8" },
        { id: "headline", type: "text", x: 1000, y: 500, width: 200, height: 120, text: "Focus", color: "#111827" },
      ],
      canvas: { preset: "16:9", width: 1280, height: 720 } as const,
    };
    const bus = new CommandBus(
      createCanvasCommandState({
        ...baseState,
      }, ["headline"]),
    );
    const baselineBus = new CommandBus(createCanvasCommandState({ ...baseState }, []));

    bus.execute(setCanvasSizeCommand({ preset: "9:16", width: 720, height: 1280 }));
    baselineBus.execute(setCanvasSizeCommand({ preset: "9:16", width: 720, height: 1280 }));
    const next = bus.getState();
    const baseline = baselineBus.getState();
    const selected = next.content.elements.find((element) => element.id === "headline");
    const baselineSelected = baseline.content.elements.find((element) => element.id === "headline");
    expect(selected).toBeTruthy();
    expect(baselineSelected).toBeTruthy();

    const targetCenterX = (1000 + 100) / 1280;
    const targetCenterY = (500 + 60) / 720;

    const selectedCenterX = (selected!.x + (selected!.width / 2)) / next.content.canvas.width;
    const selectedCenterY = (selected!.y + (selected!.height / 2)) / next.content.canvas.height;
    const baselineCenterX = (baselineSelected!.x + (baselineSelected!.width / 2)) / baseline.content.canvas.width;
    const baselineCenterY = (baselineSelected!.y + (baselineSelected!.height / 2)) / baseline.content.canvas.height;

    expect(Math.abs(selectedCenterX - targetCenterX)).toBeLessThan(0.08);
    expect(Math.abs(selectedCenterY - targetCenterY)).toBeLessThan(Math.abs(baselineCenterY - targetCenterY));
  });

  it("adds multiple elements in one command and selects the inserted set", () => {
    const bus = new CommandBus(
      createCanvasCommandState({
        elements: [
          { id: "seed", type: "text", x: 10, y: 10, width: 100, height: 40, text: "Seed", color: "#111827" },
        ],
      }, ["seed"]),
    );

    bus.execute(addElementsCommand([
      { id: "rect-1", type: "rect", x: 20, y: 20, width: 240, height: 120, fill: "#dbeafe", stroke: "#2563eb", strokeWidth: 2 },
      { id: "text-1", type: "text", x: 40, y: 50, width: 180, height: 40, text: "Block title", color: "#111827", fontSize: 28 },
    ]));

    expect(bus.getState().content.elements.map((element) => element.id)).toEqual(["seed", "rect-1", "text-1"]);
    expect(bus.getState().selectedElementIds).toEqual(["rect-1", "text-1"]);

    bus.undo();
    expect(bus.getState().content.elements.map((element) => element.id)).toEqual(["seed"]);
    expect(bus.getState().selectedElementIds).toEqual(["seed"]);
  });

  it("keeps component commands undoable through the shared command bus", () => {
    const bus = new CommandBus(
      createCanvasCommandState({
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
      }),
    );

    bus.execute(moveComponentCommand("component-1", 10, 5));
    bus.execute(resizeComponentCommand("component-1", 400, 120));
    bus.execute(rotateComponentCommand("component-1", 15));
    bus.execute(duplicateComponentCommand("component-1", () => "component-3"));
    bus.execute(arrangeComponentCommand("component-3", "back"));

    let next = bus.getState();
    expect(next.content.components?.map((component) => component.id)).toEqual(["component-3", "component-1", "component-2"]);
    expect(next.content.components?.[1]?.fallbackElements[0]).toMatchObject({
      id: "component-1::quote",
      x: 118,
      y: 109,
      width: 267,
      height: 72,
      rotation: 15,
    });

    bus.undo();
    next = bus.getState();
    expect(next.content.components?.map((component) => component.id)).toEqual(["component-1", "component-3", "component-2"]);

    bus.execute(detachComponentCommand("component-3"));
    next = bus.getState();
    expect(next.content.components?.map((component) => component.id)).toEqual(["component-1", "component-2"]);
    expect(next.content.elements.map((element) => element.id)).toContain("component-3::quote");

    bus.execute(deleteComponentCommand("component-2"));
    expect(bus.getState().content.components?.map((component) => component.id)).toEqual(["component-1"]);
  });

  it("groups a multi-selection into a reusable component and restores it through undo", () => {
    const bus = new CommandBus(
      createCanvasCommandState({
        elements: [
          { id: "title", type: "text", x: 32, y: 40, width: 220, height: 64, text: "Title", color: "#111827" },
          { id: "card", type: "rect", x: 24, y: 24, width: 280, height: 140, fill: "#dbeafe" },
          { id: "caption", type: "text", x: 32, y: 180, width: 180, height: 40, text: "Caption", color: "#334155" },
        ],
      }, ["title", "card"]),
    );

    bus.execute(groupSelectionCommand(() => "component-group-1"));

    let next = bus.getState();
    expect(next.selectedElementIds).toEqual([]);
    expect(next.content.elements.map((element) => element.id)).toEqual(["caption"]);
    expect(next.content.components).toHaveLength(1);
    expect(next.content.components?.[0]).toMatchObject({
      id: "component-group-1",
      componentId: PRESENTATION_GROUP_COMPONENT_ID,
      componentType: PRESENTATION_GROUP_COMPONENT_ID,
    });
    expect(next.content.components?.[0]?.fallbackElements.map((element) => element.id)).toEqual(["title", "card"]);

    bus.undo();
    next = bus.getState();
    expect(next.content.components ?? []).toEqual([]);
    expect(next.content.elements.map((element) => element.id)).toEqual(["title", "card", "caption"]);
    expect(next.selectedElementIds).toEqual(["title", "card"]);

    bus.redo();
    expect(bus.getState().content.components?.[0]?.id).toBe("component-group-1");
  });
});
