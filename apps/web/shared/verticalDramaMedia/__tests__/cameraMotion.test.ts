import { describe, expect, it } from "vitest";
import { createCameraMotionPlan, evaluateCameraMotionPlan, validateCameraMotionPlan } from "@smartspec/shared";

describe("camera motion plan", () => {
  it("creates deterministic held beats for every automatic mode", () => {
    for (const mode of ["auto", "face_focus", "product_focus"] as const) {
      const plan = createCameraMotionPlan({ durationMs: 56_000, mode, focusX: 0.5, focusY: 0.4, baseScale: 1.16 });
      expect(validateCameraMotionPlan(plan)).toEqual([]);
      expect(plan.keyframes.some((frame, index) => index > 0 && frame.timeMs - plan.keyframes[index - 1].timeMs >= 9_000)).toBe(true);
      expect(plan.keyframes.some((frame) => frame.timeMs === 9_000)).toBe(true);
      expect(plan.keyframes.every((frame) => frame.x >= 0.2 && frame.x <= 0.8 && frame.y >= 0.2 && frame.y <= 0.8)).toBe(true);
      expect(plan).toEqual(createCameraMotionPlan({ durationMs: 56_000, mode, focusX: 0.5, focusY: 0.4, baseScale: 1.16 }));
    }
  });

  it("keeps user marks exact and authoritative", () => {
    const plan = createCameraMotionPlan({
      durationMs: 30_000,
      mode: "auto",
      focusX: 0.5,
      focusY: 0.5,
      marks: [{ id: "mark-1", name: "Product", time: 12, x: 0.72, y: 0.33, scale: 1.24 }],
    });
    const sample = evaluateCameraMotionPlan(plan, 12_000);
    expect(sample).toMatchObject({ x: 0.72, y: 0.33, scale: 1.24, source: "user_mark", sourceMarkId: "mark-1" });
  });
});
