import { describe, expect, it } from "vitest";

import {
  applyPinchPanGesture,
  createMobileInteractionState,
  isTouchTargetSafe,
  setMobileInteractionMode,
} from "../presentation-canvas/mobile/MobileInteractionState";

describe("presentation-editor mobile e2e gates", () => {
  it("supports pan/zoom/select-safe flow without viewport drift", () => {
    const initial = createMobileInteractionState();
    const editMode = setMobileInteractionMode(initial, "edit_mode");
    const firstGesture = applyPinchPanGesture(
      editMode,
      {
        startDistance: 100,
        currentDistance: 120,
        deltaX: 14,
        deltaY: 8,
      },
      101,
    );
    const secondGesture = applyPinchPanGesture(
      firstGesture,
      {
        startDistance: 120,
        currentDistance: 120,
        deltaX: -4,
        deltaY: 6,
      },
      202,
    );

    expect(secondGesture.mode).toBe("edit_mode");
    expect(secondGesture.viewport.scale).toBeCloseTo(1.2, 6);
    expect(secondGesture.viewport.offsetX).toBe(10);
    expect(secondGesture.viewport.offsetY).toBe(14);
    expect(secondGesture.lastGestureAt).toBe(202);
  });

  it("keeps unsafe transform handles blocked by touch-target threshold", () => {
    expect(isTouchTargetSafe(24)).toBe(false);
    expect(isTouchTargetSafe(40)).toBe(true);
  });
});
