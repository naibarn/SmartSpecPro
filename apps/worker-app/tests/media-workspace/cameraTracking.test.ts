import { describe, expect, it } from "vitest";
import {
  buildDominantFaceTrack,
  normalizedKeypointCenter,
  selectTrackedFaceCandidate,
  stableFaceCenter,
} from "../../src/screens/media-workspace/cameraTracking";

describe("MediaPipe camera tracking coordinates", () => {
  it("keeps normalized keypoints in image space for the render plan", () => {
    expect(normalizedKeypointCenter([{ x: 0.78, y: 0.31 }], { x: 0.5, y: 0.5 })).toEqual({
      x: 0.78,
      y: 0.31,
    });
  });

  it("averages valid keypoints and clamps malformed values", () => {
    expect(normalizedKeypointCenter([
      { x: 0.7, y: 0.2 },
      { x: 1.2, y: -0.2 },
    ], { x: 0.5, y: 0.5 })).toEqual({
      x: 0.95,
      y: 0,
    });
  });

  it("falls back to the bounding-box center when keypoints are absent", () => {
    expect(normalizedKeypointCenter([], { x: 0.62, y: 0.44 })).toEqual({
      x: 0.62,
      y: 0.44,
    });
  });

  it("keeps talking-face landmark movement anchored to the steadier bounding box", () => {
    const center = stableFaceCenter(
      [{ x: 0.7, y: 0.34 }, { x: 0.74, y: 0.38 }],
      { x: 0.6, y: 0.4 },
    );
    expect(center.x).toBeCloseTo(0.624, 6);
    expect(center.y).toBeCloseTo(0.392, 6);
  });

  it("chooses the largest credible face for the initial subject lock", () => {
    const person = { x: 0.62, y: 0.4, width: 0.18, height: 0.24, confidence: 0.82 };
    const printedFace = { x: 0.35, y: 0.7, width: 0.04, height: 0.05, confidence: 0.99 };
    expect(selectTrackedFaceCandidate([printedFace, person], null)).toBe(person);
  });

  it("keeps the same nearby person instead of switching to a distant printed face", () => {
    const previous = { x: 0.62, y: 0.4, width: 0.18, height: 0.24, confidence: 0.85 };
    const person = { x: 0.64, y: 0.41, width: 0.17, height: 0.23, confidence: 0.75 };
    const printedFace = { x: 0.32, y: 0.7, width: 0.05, height: 0.06, confidence: 0.99 };
    expect(selectTrackedFaceCandidate([printedFace, person], previous)).toBe(person);
    expect(selectTrackedFaceCandidate([printedFace], previous)).toBeNull();
  });

  it("rejects a nearby but much smaller printed face when the person is briefly missed", () => {
    const previous = { x: 0.62, y: 0.4, width: 0.18, height: 0.24, confidence: 0.85 };
    const nearbyPrintedFace = { x: 0.55, y: 0.5, width: 0.045, height: 0.055, confidence: 0.99 };
    expect(selectTrackedFaceCandidate([nearbyPrintedFace], previous)).toBeNull();
  });

  it("does not acquire a small printed face as the live subject", () => {
    const printedFace = { x: 0.78, y: 0.52, width: 0.04, height: 0.05, confidence: 0.99 };
    expect(selectTrackedFaceCandidate([printedFace], null)).toBeNull();
  });

  it("chooses the persistent large presenter across the whole scan instead of the first false face", () => {
    const printedFace = { x: 0.8, y: 0.55, width: 0.04, height: 0.05, confidence: 0.99 };
    const frames = [
      { timeMs: 0, candidates: [printedFace] },
      { timeMs: 1_000, candidates: [printedFace, { x: 0.5, y: 0.42, width: 0.17, height: 0.23, confidence: 0.82 }] },
      { timeMs: 2_000, candidates: [printedFace, { x: 0.51, y: 0.42, width: 0.18, height: 0.24, confidence: 0.84 }] },
      { timeMs: 3_000, candidates: [printedFace, { x: 0.5, y: 0.43, width: 0.17, height: 0.23, confidence: 0.83 }] },
      { timeMs: 4_000, candidates: [printedFace, { x: 0.52, y: 0.42, width: 0.18, height: 0.24, confidence: 0.85 }] },
    ];

    const track = buildDominantFaceTrack(frames);
    expect(track).toHaveLength(4);
    expect(track.every((point) => point.x < 0.6)).toBe(true);
  });

  it("fails safe to no track when a full scan contains only small false detections", () => {
    const frames = Array.from({ length: 8 }, (_, index) => ({
      timeMs: index * 1_000,
      candidates: [{ x: 0.8, y: 0.55, width: 0.04, height: 0.05, confidence: 0.99 }],
    }));
    expect(buildDominantFaceTrack(frames)).toEqual([]);
  });
});
