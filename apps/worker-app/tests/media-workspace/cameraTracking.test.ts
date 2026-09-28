import { describe, expect, it, vi } from "vitest";
import {
  buildDominantFaceTrack,
  deduplicateFaceCandidates,
  hasRenderableFaceCameraPlan,
  detectAttachedMotionPoint,
  detectGlobalMotionPoint,
  hasRenderableFaceScanCoverage,
  hasFaceRenderEvidence,
  buildFallbackFaceTrack,
  normalizedKeypointCenter,
  observedFaceLandmarks,
  selectFallbackFaceCandidate,
  selectTrackedFaceCandidate,
  stableFaceCenter,
  resetMediaPipeDetectorSession,
  shouldResumeLiveFaceProbeAfterFullScan,
  selectFreshOrPreviousCameraPlan,
} from "../../src/screens/media-workspace/cameraTracking";

describe("MediaPipe camera tracking coordinates", () => {
  it("requires five observed normalized landmarks before automatic face planning", () => {
    const points = [
      { x: 0.45, y: 0.35 }, { x: 0.55, y: 0.35 },
      { x: 0.5, y: 0.42 }, { x: 0.5, y: 0.52 },
      { x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 },
    ];
    expect(observedFaceLandmarks(points)).toEqual(points);
    expect(observedFaceLandmarks(points.slice(0, 4))).toBeNull();
    expect(observedFaceLandmarks([{ x: -1, y: 0.35 }, { x: 2, y: 0.35 }, ...points.slice(2)])).toBeNull();
  });

  it("counts any five valid model landmarks instead of requiring the first five", () => {
    const points = [
      { x: -1, y: 0.35 },
      { x: 0.55, y: 0.35 },
      { x: 0.5, y: 0.42 },
      { x: 0.5, y: 0.52 },
      { x: 0.4, y: 0.4 },
      { x: 0.6, y: 0.4 },
    ];
    expect(observedFaceLandmarks(points)).toHaveLength(5);
  });

  it("does not approve a whole-clip camera plan from a few face samples", () => {
    expect(hasRenderableFaceScanCoverage(0, 0, 84_000)).toBe(false);
    expect(hasRenderableFaceScanCoverage(3, 30_000, 84_000)).toBe(false);
    expect(hasRenderableFaceScanCoverage(12, 4_000, 84_000)).toBe(false);
    expect(hasRenderableFaceScanCoverage(12, 28_000, 84_000)).toBe(true);
  });

  it("allows a degraded face-first render when any face evidence exists", () => {
    expect(hasFaceRenderEvidence([{ kind: "face" }])).toBe(true);
    expect(hasFaceRenderEvidence([{ kind: "activity" }])).toBe(false);
  });

  it("only accepts a concrete Full Scan plan for Face + Activity render", () => {
    const basePlan = {
      version: "camera.motion.v2" as const,
      mode: "face_activity" as const,
      durationMs: 10_000,
      keyframes: [{ timeMs: 0, x: 0.6, y: 0.5, scale: 1.16, source: "auto" as const }],
      targetTracks: [{ kind: "face" as const }],
      analysisMode: "full_scan" as const,
    };
    expect(hasRenderableFaceCameraPlan(basePlan)).toBe(true);
    expect(hasRenderableFaceCameraPlan({ ...basePlan, keyframes: [] })).toBe(false);
    expect(hasRenderableFaceCameraPlan({ ...basePlan, analysisMode: "quick" })).toBe(false);
    expect(hasRenderableFaceCameraPlan({ ...basePlan, targetTracks: [{ kind: "activity" as const }] })).toBe(false);
  });

  it("keeps the last valid Full Scan plan when a repeated scan has no result", () => {
    const previousPlan = {
      version: "camera.motion.v2" as const,
      mode: "face_activity" as const,
      durationMs: 10_000,
      keyframes: [{ timeMs: 0, x: 0.6, y: 0.5, scale: 1.16, source: "auto" as const }],
      targetTracks: [{ kind: "face" as const }],
      analysisMode: "full_scan" as const,
    };

    expect(selectFreshOrPreviousCameraPlan(null, previousPlan)).toBe(previousPlan);
    expect(selectFreshOrPreviousCameraPlan(previousPlan, null)).toBe(previousPlan);
    expect(selectFreshOrPreviousCameraPlan(null, null)).toBeNull();
  });

  it("does not rerun the live detector after an authoritative full scan", () => {
    expect(shouldResumeLiveFaceProbeAfterFullScan("approved")).toBe(false);
    expect(shouldResumeLiveFaceProbeAfterFullScan("degraded")).toBe(false);
    expect(shouldResumeLiveFaceProbeAfterFullScan("scanning")).toBe(true);
  });

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

  it("collapses overlapping duplicate detections for one physical face", () => {
    const presenter = { x: 0.42, y: 0.41, width: 0.05, height: 0.09, confidence: 0.82 };
    const duplicatePresenter = { x: 0.421, y: 0.417, width: 0.04, height: 0.071, confidence: 0.41 };
    const distantFace = { x: 0.16, y: 0.67, width: 0.087, height: 0.155, confidence: 0.44 };
    expect(deduplicateFaceCandidates([duplicatePresenter, distantFace, presenter])).toEqual([
      presenter,
      distantFace,
    ]);
  });

  it("keeps the real presenter track when duplicate detections would fragment it", () => {
    const falseFace = { x: 0.16, y: 0.67, width: 0.087, height: 0.155, confidence: 0.44 };
    const presenter = (x: number, y: number, width: number, height: number, confidence: number) => ({
      x, y, width, height, confidence,
    });
    const frames = [
      [presenter(0.423, 0.413, 0.052, 0.092, 0.76), falseFace],
      [presenter(0.438, 0.405, 0.048, 0.085, 0.82), falseFace],
      [presenter(0.420, 0.401, 0.046, 0.082, 0.85), falseFace],
      [presenter(0.430, 0.402, 0.042, 0.075, 0.66), falseFace, presenter(0.421, 0.417, 0.040, 0.071, 0.41)],
      [presenter(0.402, 0.415, 0.049, 0.087, 0.75), falseFace],
      [presenter(0.382, 0.407, 0.045, 0.080, 0.67), presenter(0.393, 0.436, 0.043, 0.077, 0.61)],
      [presenter(0.393, 0.418, 0.051, 0.091, 0.85), falseFace],
      [presenter(0.404, 0.418, 0.052, 0.092, 0.69)],
      [presenter(0.412, 0.406, 0.052, 0.091, 0.73), falseFace],
      [presenter(0.423, 0.417, 0.049, 0.087, 0.82), falseFace],
      [presenter(0.420, 0.413, 0.047, 0.083, 0.82), falseFace],
      [presenter(0.420, 0.419, 0.050, 0.088, 0.85), falseFace],
    ];
    const track = buildDominantFaceTrack(frames.map((candidates, index) => ({
      timeMs: 11_343 + index * 700,
      candidates,
    })));
    expect(track.length).toBeGreaterThanOrEqual(10);
    expect(track.every((point) => point.x > 0.3)).toBe(true);
  });

  it("prefers a smaller high-confidence presenter over a larger persistent false face", () => {
    const frames = Array.from({ length: 101 }, (_, index) => ({
      timeMs: index * 1_200,
      candidates: [
        ...(index >= 17 ? [{
          x: 0.205,
          y: 0.875,
          width: 0.057,
          height: 0.101,
          confidence: 0.44,
        }] : []),
        ...(index >= 24 && index <= 64 ? [{
          x: 0.43 + (index % 3) * 0.004,
          y: 0.50,
          width: 0.039,
          height: 0.070,
          confidence: 0.55,
        }] : []),
      ],
    }));

    const track = buildDominantFaceTrack(frames);

    expect(track.length).toBeGreaterThanOrEqual(30);
    expect(track.every((point) => point.x > 0.3)).toBe(true);
  });

  it("closes the old detector and resets the MediaPipe session clock", () => {
    const close = vi.fn();
    const state = resetMediaPipeDetectorSession({
      detector: { close },
      initPromise: Promise.resolve(null),
      lastTimestamp: 120_518_001,
    });

    expect(close).toHaveBeenCalledOnce();
    expect(state).toEqual({ detector: null, initPromise: null, lastTimestamp: -1 });
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

  it("falls back to a detected face for the initial lock when strict selection rejects it", () => {
    const smallFace = { x: 0.38, y: 0.42, width: 0.025, height: 0.035, confidence: 0.22 };
    expect(selectTrackedFaceCandidate([smallFace], null)).toBeNull();
    expect(selectFallbackFaceCandidate([smallFace], null)).toBe(smallFace);
  });

  it("builds a degraded face track from detected faces when strict size or confidence gates fail", () => {
    const frames = Array.from({ length: 4 }, (_, index) => ({
      timeMs: index * 1_000,
      candidates: [],
      fallbackCandidates: [{
        x: 0.38 + index * 0.01,
        y: 0.42,
        width: 0.025,
        height: 0.035,
        confidence: 0.22,
      }],
    }));
    expect(buildFallbackFaceTrack(frames)).toHaveLength(4);
  });

  it("accepts a persistent long-shot face while still rejecting a smaller printed face", () => {
    const longShotFace = { x: 0.58, y: 0.48, width: 0.04, height: 0.08, confidence: 0.62 };
    const printedFace = { x: 0.78, y: 0.52, width: 0.04, height: 0.05, confidence: 0.99 };
    expect(selectTrackedFaceCandidate([longShotFace], null)).toBe(longShotFace);
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

  it("does not merge a late presenter face into a different opening face track", () => {
    const openingFalseFace = { x: 0.16, y: 0.67, width: 0.087, height: 0.155, confidence: 0.54 };
    const presenter = { x: 0.40, y: 0.42, width: 0.05, height: 0.09, confidence: 0.82 };
    const frames = [
      { timeMs: 11_343, candidates: [openingFalseFace] },
      { timeMs: 12_761, candidates: [openingFalseFace] },
      { timeMs: 14_876, candidates: [presenter] },
      { timeMs: 15_585, candidates: [presenter] },
      { timeMs: 16_303, candidates: [presenter] },
      { timeMs: 17_010, candidates: [presenter] },
      { timeMs: 18_427, candidates: [presenter] },
      { timeMs: 19_842, candidates: [presenter] },
    ];

    const track = buildDominantFaceTrack(frames);

    expect(track.length).toBeGreaterThanOrEqual(5);
    expect(track[0].x).toBeCloseTo(presenter.x, 2);
    expect(track.every((point) => point.x > 0.3)).toBe(true);
  });

  it("prefers the persistent high-confidence presenter over a larger low-confidence false face", () => {
    const falseFace = { x: 0.16, y: 0.67, width: 0.087, height: 0.155, confidence: 0.44 };
    const presenter = { x: 0.40, y: 0.42, width: 0.05, height: 0.09, confidence: 0.82 };
    const frames = Array.from({ length: 10 }, (_, index) => ({
      timeMs: 11_000 + index * 1_000,
      candidates: index < 2 ? [falseFace] : [presenter, falseFace],
    }));

    const track = buildDominantFaceTrack(frames);

    expect(track.length).toBeGreaterThanOrEqual(7);
    expect(track.every((point) => point.x > 0.3)).toBe(true);
  });

  it("fails safe to no track when a full scan contains only small false detections", () => {
    const frames = Array.from({ length: 8 }, (_, index) => ({
      timeMs: index * 1_000,
      candidates: [{ x: 0.8, y: 0.55, width: 0.04, height: 0.05, confidence: 0.99 }],
    }));
    expect(buildDominantFaceTrack(frames)).toEqual([]);
  });

  it("finds a moving hand-held patch beside the face and ignores the face region", () => {
    const width = 16;
    const height = 10;
    const makeFrame = (patchX: number) => {
      const pixels = new Uint8ClampedArray(width * height * 4);
      for (let index = 0; index < pixels.length; index += 4) pixels[index + 3] = 255;
      for (let y = 4; y <= 6; y += 1) {
        for (let x = patchX; x <= patchX + 2; x += 1) {
          const offset = (y * width + x) * 4;
          pixels[offset] = 255;
          pixels[offset + 1] = 255;
          pixels[offset + 2] = 255;
        }
      }
      return { timeMs: patchX, width, height, pixels };
    };
    const motion = detectAttachedMotionPoint(
      makeFrame(9),
      makeFrame(12),
      { x: 0.45, y: 0.4, width: 0.2, height: 0.25, confidence: 0.9 },
    );
    expect(motion).not.toBeNull();
    expect(motion!.x).toBeGreaterThan(0.6);
    expect(motion!.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it("selects the strongest attached motion cluster instead of blending separate moving regions", () => {
    const width = 64;
    const height = 36;
    const makeFrame = (smallX: number, largeX: number) => {
      const pixels = new Uint8ClampedArray(width * height * 4);
      for (let index = 0; index < pixels.length; index += 4) pixels[index + 3] = 255;
      for (let y = 15; y <= 17; y += 1) {
        for (let x = smallX; x <= smallX + 2; x += 1) {
          const offset = (y * width + x) * 4;
          pixels[offset] = 255;
          pixels[offset + 1] = 255;
          pixels[offset + 2] = 255;
        }
      }
      for (let y = 13; y <= 19; y += 1) {
        for (let x = largeX; x <= largeX + 6; x += 1) {
          const offset = (y * width + x) * 4;
          pixels[offset] = 255;
          pixels[offset + 1] = 255;
          pixels[offset + 2] = 255;
        }
      }
      return { timeMs: smallX, width, height, pixels };
    };
    const motion = detectAttachedMotionPoint(
      makeFrame(8, 46),
      makeFrame(11, 50),
      { x: 0.35, y: 0.4, width: 0.12, height: 0.16, confidence: 0.9 },
    );
    expect(motion).not.toBeNull();
    expect(motion!.x).toBeGreaterThan(0.7);
    expect(motion!.width).toBeGreaterThan(0.1);
  });

  it("finds a strong moving subject away from the face without treating the whole frame as activity", () => {
    const width = 32;
    const height = 18;
    const makeFrame = (patchX: number) => {
      const pixels = new Uint8ClampedArray(width * height * 4);
      for (let index = 0; index < pixels.length; index += 4) pixels[index + 3] = 255;
      for (let y = 8; y <= 13; y += 1) {
        for (let x = patchX; x <= patchX + 7; x += 1) {
          const offset = (y * width + x) * 4;
          pixels[offset] = 255;
          pixels[offset + 1] = 255;
          pixels[offset + 2] = 255;
        }
      }
      return { timeMs: patchX, width, height, pixels };
    };
    const motion = detectGlobalMotionPoint(
      makeFrame(23),
      makeFrame(15),
      { x: 0.25, y: 0.35, width: 0.12, height: 0.16, confidence: 0.9 },
    );
    expect(motion).not.toBeNull();
    expect(motion!.x).toBeGreaterThan(0.45);
    expect(motion!.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it("rejects uniform frame-wide exposure changes as a global activity target", () => {
    const width = 32;
    const height = 18;
    const makeFrame = (value: number) => {
      const pixels = new Uint8ClampedArray(width * height * 4);
      for (let index = 0; index < pixels.length; index += 4) {
        pixels[index] = value;
        pixels[index + 1] = value;
        pixels[index + 2] = value;
        pixels[index + 3] = 255;
      }
      return { timeMs: value, width, height, pixels };
    };
    expect(detectGlobalMotionPoint(makeFrame(30), makeFrame(180))).toBeNull();
  });
});
