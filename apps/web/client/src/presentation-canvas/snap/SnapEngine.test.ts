import { describe, expect, it } from "vitest";

import { computeSnapPosition } from "./SnapEngine";

describe("SnapEngine", () => {
  it("snaps moved rect to nearest candidate edge/center within threshold", () => {
    const result = computeSnapPosition(
      { x: 96, y: 93, width: 100, height: 50 },
      [{ id: "peer", x: 200, y: 120, width: 100, height: 50 }],
      { threshold: 8 },
    );

    expect(result.x).toBe(100);
    expect(result.y).toBe(95);
    expect(result.guides).toHaveLength(2);
    expect(result.guides[0].axis).toBe("x");
    expect(result.guides[1].axis).toBe("y");
  });

  it("leaves position unchanged when outside threshold", () => {
    const result = computeSnapPosition(
      { x: 10, y: 10, width: 100, height: 50 },
      [{ id: "peer", x: 300, y: 300, width: 100, height: 50 }],
      { threshold: 8 },
    );

    expect(result).toEqual({
      x: 10,
      y: 10,
      guides: [],
    });
  });
});
