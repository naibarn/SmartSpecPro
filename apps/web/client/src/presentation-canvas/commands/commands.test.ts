import { describe, expect, it } from "vitest";

import { CommandBus } from "./CommandBus";
import {
  arrangeSelectionCommand,
  createCanvasCommandState,
  moveSelectionCommand,
  patchSelectedElementCommand,
  resizeSelectionCommand,
  rotateSelectionCommand,
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
    });
    expect(next.rotationByElementId.a).toBe(15);
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
});
