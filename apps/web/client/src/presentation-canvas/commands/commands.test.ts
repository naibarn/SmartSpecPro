import { describe, expect, it } from "vitest";

import { CommandBus } from "./CommandBus";
import {
  arrangeSelectionCommand,
  createCanvasCommandState,
  moveSelectionCommand,
  patchSelectedElementCommand,
  resizeSelectionCommand,
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
      y: 347,
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
});
