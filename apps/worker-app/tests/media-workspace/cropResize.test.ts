import { describe, expect, it } from "vitest";
import { resizeAspectLockedCropRect, type CropRect } from "../../src/screens/media-workspace/cropResize";

describe("aspect-locked crop resizing", () => {
  const start: CropRect = { left: 300, top: 100, width: 240, height: 426.6667 };

  it("keeps the requested ratio while resizing from each corner", () => {
    for (const handle of ["top-left", "top-right", "bottom-left", "bottom-right"] as const) {
      const result = resizeAspectLockedCropRect(start, 48, 72, handle, 9 / 16, {
        width: 1000,
        height: 800,
        minWidth: 120,
        maxWidth: 480,
      });
      expect(result.width / result.height).toBeCloseTo(9 / 16, 8);
      expect(result.left).toBeGreaterThanOrEqual(0);
      expect(result.top).toBeGreaterThanOrEqual(0);
      expect(result.left + result.width).toBeLessThanOrEqual(1000);
      expect(result.top + result.height).toBeLessThanOrEqual(800);
    }
  });

  it("keeps the opposite corner fixed", () => {
    const result = resizeAspectLockedCropRect(start, 80, 120, "bottom-right", 9 / 16, {
      width: 1000,
      height: 800,
      minWidth: 120,
      maxWidth: 480,
    });
    expect(result.left).toBe(start.left);
    expect(result.top).toBe(start.top);
  });

  it("clamps the crop to the stage and configured zoom range", () => {
    const result = resizeAspectLockedCropRect(start, 5000, 5000, "bottom-right", 9 / 16, {
      width: 600,
      height: 500,
      minWidth: 120,
      maxWidth: 480,
    });
    expect(result.left + result.width).toBeLessThanOrEqual(600);
    expect(result.top + result.height).toBeLessThanOrEqual(500);
    expect(result.width).toBeLessThanOrEqual(480);
  });
});
