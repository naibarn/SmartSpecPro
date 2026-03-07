// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setPresentationEventEmitterForTests } from "@/lib/analytics/presentationEvents";
import { useMobileGestures } from "./useMobileGestures";

describe("useMobileGestures", () => {
  afterEach(() => {
    setPresentationEventEmitterForTests(null);
  });

  it("tracks mode switches and accidental-transform cancellation events", () => {
    const emitter = vi.fn();
    setPresentationEventEmitterForTests(emitter);

    const { result } = renderHook(() => useMobileGestures());

    act(() => {
      result.current.setMode("edit_mode");
    });

    act(() => {
      result.current.canUseTouchTarget(20);
    });

    expect(result.current.state.mode).toBe("edit_mode");
    expect(emitter).toHaveBeenCalledWith(
      "presentation_mobile_mode_switch",
      expect.objectContaining({ fromMode: "pan_mode", toMode: "edit_mode" }),
    );
    expect(emitter).toHaveBeenCalledWith(
      "presentation_mobile_accidental_transform_cancelled",
      expect.objectContaining({ mode: "edit_mode", touchTargetPx: 20 }),
    );
  });

  it("updates viewport on gesture application", () => {
    const { result } = renderHook(() => useMobileGestures());

    act(() => {
      result.current.applyGesture({
        startDistance: 100,
        currentDistance: 120,
        deltaX: 12,
        deltaY: 8,
      });
    });

    expect(result.current.state.viewport.scale).toBe(1.2);
    expect(result.current.state.viewport.offsetX).toBe(12);
    expect(result.current.state.viewport.offsetY).toBe(8);
  });

  it("supports directly replacing viewport state", () => {
    const { result } = renderHook(() => useMobileGestures());

    act(() => {
      result.current.setViewport({
        scale: 1.75,
        offsetX: -80,
        offsetY: -140,
      });
    });

    expect(result.current.state.viewport).toEqual({
      scale: 1.75,
      offsetX: -80,
      offsetY: -140,
    });
    expect(result.current.state.lastGestureAt).toEqual(expect.any(Number));
  });
});
