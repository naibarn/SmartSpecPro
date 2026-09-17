import { describe, expect, it } from "vitest";
import {
  faceRoiFromFivePointEvidence,
  isActivityAssociated,
  normalizeFivePointFace,
  validateFivePointFaceEvidence,
} from "../cameraEvidence";

describe("camera evidence", () => {
  it("normalizes the required five points and derives a protected ROI", () => {
    const evidence = normalizeFivePointFace(
      {
        left_eye: { x: 0.4, y: 0.4, confidence: 0.9 },
        right_eye: { x: 0.6, y: 0.4, confidence: 0.9 },
        nose_tip: { x: 0.5, y: 0.5, confidence: 0.9 },
        left_mouth: { x: 0.45, y: 0.6, confidence: 0.8 },
        right_mouth: { x: 0.55, y: 0.6, confidence: 0.8 },
      },
      {
        trackId: "face-1",
        timeMs: 1000,
        roi: { x: 0.35, y: 0.3, width: 0.3, height: 0.4, confidence: 0.9 },
      },
    );
    expect(validateFivePointFaceEvidence(evidence)).toEqual([]);
    expect(faceRoiFromFivePointEvidence(evidence).width).toBeGreaterThan(
      evidence.roi.width,
    );
    expect(
      isActivityAssociated(
        {
          associatedFaceTrackId: "face-1",
          timeMs: 1100,
          freshnessMs: 100,
          confidence: 0.8,
          visible: true,
        },
        new Set(["face-1"]),
      ),
    ).toBe(true);
    expect(
      isActivityAssociated(
        {
          associatedFaceTrackId: "other",
          timeMs: 1100,
          freshnessMs: 100,
          confidence: 0.8,
          visible: true,
        },
        new Set(["face-1"]),
      ),
    ).toBe(false);
  });
});
