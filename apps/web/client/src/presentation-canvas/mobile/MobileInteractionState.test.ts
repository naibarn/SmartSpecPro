import { describe, expect, it } from "vitest";

import {
  applyPinchPanGesture,
  createMobileInteractionState,
  isTouchTargetSafe,
  setMobileInteractionMode,
} from "./MobileInteractionState";

describe("MobileInteractionState", () => {
  it("applies pinch/pan updates while preserving interaction mode", () => {
    const initial = setMobileInteractionMode(createMobileInteractionState(), "edit_mode");
    const next = applyPinchPanGesture(
      initial,
      {
        startDistance: 100,
        currentDistance: 130,
        deltaX: 10,
        deltaY: -6,
      },
      123,
    );

    expect(next.mode).toBe("edit_mode");
    expect(next.viewport).toEqual({
      scale: 1.3,
      offsetX: 10,
      offsetY: -6,
    });
    expect(next.lastGestureAt).toBe(123);
  });

  it("enforces minimum touch target threshold", () => {
    expect(isTouchTargetSafe(40)).toBe(true);
    expect(isTouchTargetSafe(39)).toBe(false);
  });
});
