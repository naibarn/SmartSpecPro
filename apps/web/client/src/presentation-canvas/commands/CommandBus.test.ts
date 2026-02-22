import { describe, expect, it } from "vitest";

import { CommandBus } from "./CommandBus";

describe("CommandBus", () => {
  it("applies commands and supports deterministic undo/redo", () => {
    const bus = new CommandBus({ count: 0 });

    bus.execute({
      id: "inc",
      apply: (state) => ({ count: state.count + 1 }),
    });
    bus.execute({
      id: "inc",
      apply: (state) => ({ count: state.count + 1 }),
    });

    expect(bus.getState().count).toBe(2);
    expect(bus.canUndo()).toBe(true);

    bus.undo();
    expect(bus.getState().count).toBe(1);

    bus.redo();
    expect(bus.getState().count).toBe(2);
  });
});
