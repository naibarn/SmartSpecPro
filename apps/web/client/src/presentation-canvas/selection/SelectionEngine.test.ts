import { describe, expect, it } from "vitest";

import { SelectionEngine } from "./SelectionEngine";

describe("SelectionEngine", () => {
  it("supports single and additive toggle selection", () => {
    const single = SelectionEngine.single("a");
    expect(single).toEqual({
      selectedIds: ["a"],
      activeId: "a",
    });

    const added = SelectionEngine.toggle(single, "b");
    expect(added.selectedIds).toEqual(["a", "b"]);
    expect(added.activeId).toBe("b");

    const removed = SelectionEngine.toggle(added, "a");
    expect(removed.selectedIds).toEqual(["b"]);
    expect(removed.activeId).toBe("b");
  });

  it("applies marquee selection deterministically", () => {
    const base = SelectionEngine.single("seed");
    const next = SelectionEngine.marquee(
      base,
      { x: 0, y: 0, width: 60, height: 60 },
      [
        { id: "a", x: 10, y: 10, width: 20, height: 20 },
        { id: "b", x: 50, y: 50, width: 20, height: 20 },
        { id: "c", x: 120, y: 120, width: 20, height: 20 },
      ],
      { additive: true },
    );

    expect(next.selectedIds).toEqual(["seed", "a", "b"]);
    expect(next.activeId).toBe("b");
  });
});
