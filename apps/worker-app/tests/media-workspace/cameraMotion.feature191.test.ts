import { describe, expect, it } from "vitest";
import {
  canPromoteCompositionScan,
  createCameraMotionPlan,
  evaluateCameraMotionPlan,
  getFeasibleCameraAnchorBounds,
  nextCompositionCheckpoint,
  readCameraMotionPlan,
  reduceCameraMotionTrackPoints,
  type CameraMotionPlan,
} from "@smartspec/shared";

describe("Feature 191 Face + Activity camera planner", () => {
  it("emits the evidence-aware v2 plan while reading legacy v1 plans", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 1_000,
      focusX: 0.5,
      focusY: 0.5,
    });
    expect(plan.version).toBe("camera.motion.v2");
    expect(readCameraMotionPlan({
      ...plan,
      version: "camera.motion.v1",
    })?.version).toBe("camera.motion.v1");
    expect(readCameraMotionPlan({ ...plan, version: "camera.motion.unknown" })).toBeNull();
    expect(readCameraMotionPlan({ ...plan, keyframes: [{ ...plan.keyframes[0], source: "forged" }] })).toBeNull();
  });

  it("keeps anchors inside the feasible crop window", () => {
    const bounds = getFeasibleCameraAnchorBounds(9 / 16, 16 / 9, 1.2);
    expect(bounds.minX).toBeGreaterThan(0);
    expect(bounds.maxX).toBeLessThan(1);
    expect(bounds.minY).toBeGreaterThan(0);
    expect(bounds.maxY).toBeLessThan(1);
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 4_000,
      focusX: 0,
      focusY: 1,
      outputAspectRatio: 9 / 16,
      trackPoints: [{ timeMs: 1_000, x: 0, y: 1, confidence: 0.9, kind: "face", width: 0.2, height: 0.2 }],
      evidence: { analysisMode: "quick", status: "provisional", evidenceRef: "e1" },
    });
    for (const frame of plan.keyframes) {
      expect(frame.x).toBeGreaterThanOrEqual(0);
      expect(frame.x).toBeLessThanOrEqual(1);
      expect(frame.y).toBeGreaterThanOrEqual(0);
      expect(frame.y).toBeLessThanOrEqual(1);
    }
  });

  it("starts from the first detected face instead of a stale persisted focus", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 12_000,
      // This simulates a focus value persisted by the pre-fix tracker.
      focusX: 0.05,
      focusY: 0.5,
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: 16 / 9,
      trackPoints: [
        { timeMs: 2_000, x: 0.72, y: 0.48, confidence: 0.95, kind: "face", width: 0.18, height: 0.24 },
        { timeMs: 4_000, x: 0.74, y: 0.48, confidence: 0.95, kind: "face", width: 0.18, height: 0.24 },
      ],
    });

    expect(plan.keyframes[0].timeMs).toBe(0);
    expect(plan.keyframes[0].x).toBeGreaterThan(0.6);
    expect(plan.keyframes.some((frame) => frame.x > 0.6)).toBe(true);
  });

  it("settles onto the first face quickly at clip start before applying the deadband", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 8_000,
      focusX: 0.5,
      focusY: 0.5,
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: 16 / 9,
      trackPoints: [{ timeMs: 0, x: 0.76, y: 0.48, confidence: 0.95, kind: "face", width: 0.16, height: 0.2 }],
    });

    expect(plan.keyframes[0].timeMs).toBe(0);
    expect(plan.keyframes[0].x).toBeGreaterThan(0.65);
    expect(evaluateCameraMotionPlan(plan, 7_999).x).toBeGreaterThan(0.65);
  });

  it("falls back to the source centre when face evidence is unavailable", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 8_000,
      focusX: 0.9,
      focusY: 0.2,
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: 16 / 9,
    });

    expect(plan.keyframes[0].x).toBeCloseTo(0.5, 2);
    expect(plan.keyframes[0].y).toBeCloseTo(0.5, 2);
  });

  it("keeps face tracking when optional activity pixel evidence is unavailable", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 12_000,
      focusX: 0.5,
      focusY: 0.5,
      analysisMode: "full_scan",
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: 16 / 9,
      // Full Scan may lose canvas pixel access for one codec/source while
      // MediaPipe face detections remain valid.
      trackPoints: [
        { timeMs: 0, x: 0.72, y: 0.48, confidence: 0.95, kind: "face", width: 0.16, height: 0.2 },
        { timeMs: 6_000, x: 0.72, y: 0.48, confidence: 0.95, kind: "face", width: 0.16, height: 0.2 },
      ],
    });

    expect(plan.keyframes[0].x).toBeGreaterThan(0.65);
    expect(evaluateCameraMotionPlan(plan, 11_999).x).toBeGreaterThan(0.65);
  });

  it("coalesces detector jitter while retaining meaningful movement and clip endpoints", () => {
    const points = Array.from({ length: 12 }, (_, index) => ({
      timeMs: index * 250,
      x: 0.5 + (index % 2 === 0 ? 0.002 : -0.002),
      y: 0.5,
      confidence: 0.9,
      kind: "face" as const,
    }));
    points.push({ timeMs: 3_000, x: 0.72, y: 0.52, confidence: 0.9, kind: "face" as const });
    const reduced = reduceCameraMotionTrackPoints(points);
    expect(reduced[0].timeMs).toBe(0);
    expect(reduced.at(-1)?.timeMs).toBe(3_000);
    expect(reduced.length).toBeLessThan(points.length);
    expect(reduced.some((point) => point.x > 0.7)).toBe(true);
  });

  it("keeps the opening face composition locked for the initial 15 seconds", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 9_000,
      focusX: 0.5,
      focusY: 0.5,
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: 16 / 9,
      trackPoints: [
        { timeMs: 0, x: 0.6, y: 0.5, confidence: 0.95, kind: "face", width: 0.08, height: 0.12 },
        { timeMs: 1_500, x: 0.62, y: 0.5, confidence: 0.95, kind: "face", width: 0.08, height: 0.12 },
        { timeMs: 3_000, x: 0.64, y: 0.5, confidence: 0.95, kind: "face", width: 0.08, height: 0.12 },
        { timeMs: 4_500, x: 0.66, y: 0.5, confidence: 0.95, kind: "face", width: 0.08, height: 0.12 },
        { timeMs: 6_000, x: 0.74, y: 0.5, confidence: 0.95, kind: "face", width: 0.08, height: 0.12 },
      ],
    });

    const automaticFrames = plan.keyframes.filter((frame) => frame.source === "auto");
    expect(automaticFrames.map((frame) => frame.timeMs)).toEqual([0]);
    expect(automaticFrames.at(-1)?.x).toBeCloseTo(0.64, 2);
  });

  it("recenters a materially off-centre face during Full Scan playback", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 12_000,
      focusX: 0.5,
      focusY: 0.5,
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: 16 / 9,
      analysisMode: "full_scan",
      trackPoints: [
        { timeMs: 0, x: 0.5, y: 0.5, confidence: 0.95, kind: "face", width: 0.12, height: 0.18 },
        { timeMs: 2_000, x: 0.4, y: 0.5, confidence: 0.95, kind: "face", width: 0.12, height: 0.18 },
        { timeMs: 3_000, x: 0.4, y: 0.5, confidence: 0.95, kind: "face", width: 0.12, height: 0.18 },
        { timeMs: 4_000, x: 0.4, y: 0.5, confidence: 0.95, kind: "face", width: 0.12, height: 0.18 },
        { timeMs: 5_000, x: 0.4, y: 0.5, confidence: 0.95, kind: "face", width: 0.12, height: 0.18 },
        { timeMs: 6_000, x: 0.4, y: 0.5, confidence: 0.95, kind: "face", width: 0.12, height: 0.18 },
      ],
    });

    expect(evaluateCameraMotionPlan(plan, 11_999).x).toBeCloseTo(0.4, 2);
  });

  it("does not accumulate small same-direction detector drift into a pan", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 8_000,
      focusX: 0.5,
      focusY: 0.5,
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: 16 / 9,
      trackPoints: [
        { timeMs: 0, x: 0.5, y: 0.5, confidence: 0.95, kind: "face", width: 0.16, height: 0.2 },
        { timeMs: 1_000, x: 0.54, y: 0.5, confidence: 0.95, kind: "face", width: 0.16, height: 0.2 },
        { timeMs: 2_000, x: 0.58, y: 0.5, confidence: 0.95, kind: "face", width: 0.16, height: 0.2 },
        { timeMs: 3_000, x: 0.62, y: 0.5, confidence: 0.95, kind: "face", width: 0.16, height: 0.2 },
      ],
    });

    expect(plan.keyframes.map((frame) => frame.timeMs)).toEqual([0]);
    expect(plan.keyframes.every((frame) => Math.abs(frame.x - 0.56) < 0.001)).toBe(true);
  });

  it("holds the camera for small face drift after composition", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 5_000,
      focusX: 0.5,
      focusY: 0.5,
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: 16 / 9,
      trackPoints: [
        { timeMs: 0, x: 0.5, y: 0.5, confidence: 0.95, kind: "face", width: 0.16, height: 0.2 },
        { timeMs: 1_000, x: 0.52, y: 0.51, confidence: 0.95, kind: "face", width: 0.16, height: 0.2 },
        { timeMs: 2_000, x: 0.53, y: 0.52, confidence: 0.95, kind: "face", width: 0.16, height: 0.2 },
      ],
    });

    expect(plan.keyframes.map((frame) => frame.timeMs)).toEqual([0]);
  });

  it("locks to the stable face centre instead of panning after sustained detector drift", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 25_000,
      focusX: 0.5,
      focusY: 0.5,
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: 16 / 9,
      analysisMode: "full_scan",
      trackPoints: [
        { timeMs: 0, x: 0.5, y: 0.5, confidence: 0.95, kind: "face", width: 0.12, height: 0.18 },
        { timeMs: 15_000, x: 0.7, y: 0.5, confidence: 0.95, kind: "face", width: 0.12, height: 0.18 },
        { timeMs: 17_500, x: 0.7, y: 0.5, confidence: 0.95, kind: "face", width: 0.12, height: 0.18 },
        { timeMs: 20_000, x: 0.7, y: 0.5, confidence: 0.95, kind: "face", width: 0.12, height: 0.18 },
      ],
    });

    expect(plan.keyframes).toHaveLength(1);
    expect(evaluateCameraMotionPlan(plan, 24_999).x).toBeCloseTo(0.7, 3);
  });

  it("keeps a full-minute shot static while the same person remains safely framed", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 60_000,
      focusX: 0.5,
      focusY: 0.5,
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: 16 / 9,
      analysisMode: "full_scan",
      trackPoints: [
        { timeMs: 0, x: 0.5, y: 0.5, confidence: 0.95, kind: "face", width: 0.12, height: 0.18 },
        { timeMs: 10_000, x: 0.53, y: 0.49, confidence: 0.94, kind: "face", width: 0.12, height: 0.18 },
        { timeMs: 20_000, x: 0.54, y: 0.5, confidence: 0.93, kind: "face", width: 0.12, height: 0.18 },
        { timeMs: 35_000, x: 0.52, y: 0.51, confidence: 0.94, kind: "face", width: 0.12, height: 0.18 },
        { timeMs: 50_000, x: 0.54, y: 0.5, confidence: 0.95, kind: "face", width: 0.12, height: 0.18 },
      ],
    });

    expect(plan.keyframes).toHaveLength(1);
    expect(evaluateCameraMotionPlan(plan, 59_999).x).toBeCloseTo(0.53, 3);
    expect(evaluateCameraMotionPlan(plan, 59_999).y).toBeCloseTo(0.5, 3);
  });

  it("zooms on nearby activity after the opening face lock without shifting the crop", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 14_000,
      focusX: 0.5,
      focusY: 0.5,
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: 16 / 9,
      analysisMode: "full_scan",
      trackPoints: [
        { timeMs: 0, x: 0.5, y: 0.48, confidence: 0.95, kind: "face", width: 0.08, height: 0.12 },
        { timeMs: 5_000, x: 0.5, y: 0.48, confidence: 0.95, kind: "face", width: 0.08, height: 0.12 },
        { timeMs: 5_000, x: 0.72, y: 0.56, confidence: 0.8, kind: "activity", width: 0.08, height: 0.08 },
        { timeMs: 6_000, x: 0.53, y: 0.48, confidence: 0.95, kind: "face", width: 0.08, height: 0.12 },
        { timeMs: 6_000, x: 0.76, y: 0.57, confidence: 0.85, kind: "activity", width: 0.08, height: 0.08 },
      ],
    });

    const lockedX = plan.keyframes[0].x;
    expect(plan.keyframes.some((frame) => frame.scale > 1.2)).toBe(true);
    expect(evaluateCameraMotionPlan(plan, 7_800).x).toBeCloseTo(lockedX, 3);
    expect(evaluateCameraMotionPlan(plan, 7_800).scale).toBeGreaterThan(1.2);
  });

  it("uses a multi-second eased zoom pulse for attached activity without panning", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 24_000,
      focusX: 0.5,
      focusY: 0.48,
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: 16 / 9,
      analysisMode: "full_scan",
      trackPoints: [
        { timeMs: 0, x: 0.5, y: 0.48, confidence: 0.96, kind: "face", width: 0.1, height: 0.14 },
        { timeMs: 5_000, x: 0.5, y: 0.48, confidence: 0.96, kind: "face", width: 0.1, height: 0.14 },
        { timeMs: 5_000, x: 0.78, y: 0.63, confidence: 0.9, kind: "activity", width: 0.12, height: 0.12, trackId: "full-scan-attached-motion" },
        { timeMs: 8_000, x: 0.5, y: 0.48, confidence: 0.96, kind: "face", width: 0.1, height: 0.14 },
        { timeMs: 8_000, x: 0.82, y: 0.65, confidence: 0.92, kind: "activity", width: 0.12, height: 0.12, trackId: "full-scan-attached-motion" },
      ],
    });

    const zoomStart = plan.keyframes.find((frame) => frame.timeMs === 4_000);
    const zoomEnd = plan.keyframes.find((frame) => frame.timeMs === 6_000 && frame.scale > 1.2);
    expect(zoomStart?.easing).toBe("ease-in-out");
    expect(zoomEnd).toBeDefined();
    expect(zoomEnd!.timeMs - zoomStart!.timeMs).toBe(2_000);
    expect(zoomEnd!.easing).toBe("ease-in-out");
    expect(plan.keyframes.every((frame) => Math.abs(frame.x - 0.5) < 0.001)).toBe(true);
    expect(evaluateCameraMotionPlan(plan, 5_000).scale).toBeGreaterThan(zoomStart!.scale);
  });

  it("keeps the face locked while activity triggers a restrained zoom in", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 16_000,
      focusX: 0.5,
      focusY: 0.48,
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: 16 / 9,
      analysisMode: "full_scan",
      trackPoints: [
        { timeMs: 0, x: 0.5, y: 0.48, confidence: 0.96, kind: "face", width: 0.12, height: 0.16 },
        { timeMs: 5_000, x: 0.5, y: 0.48, confidence: 0.96, kind: "face", width: 0.12, height: 0.16 },
        { timeMs: 5_000, x: 0.59, y: 0.56, confidence: 0.9, kind: "activity", width: 0.06, height: 0.08, trackId: "full-scan-attached-motion" },
        { timeMs: 8_000, x: 0.5, y: 0.48, confidence: 0.96, kind: "face", width: 0.12, height: 0.16 },
        { timeMs: 8_000, x: 0.62, y: 0.58, confidence: 0.92, kind: "activity", width: 0.06, height: 0.08, trackId: "full-scan-attached-motion" },
      ],
    });

    const activityFrame = plan.keyframes.find((frame) => frame.timeMs > 8_000 && frame.scale > 1.2);
    expect(activityFrame).toBeDefined();
    expect(activityFrame!.x).toBeLessThan(0.65);
    expect(activityFrame!.scale).toBeGreaterThan(1.2);
  });

  it("uses zoom-only activity beats around the stable face instead of panning after noisy detections", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 18_000,
      focusX: 0.5,
      focusY: 0.5,
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: 16 / 9,
      analysisMode: "full_scan",
      trackPoints: [
        // A single early detector outlier must not become the permanent crop anchor.
        { timeMs: 0, x: 0.316, y: 0.086, confidence: 0.82, kind: "face", width: 0.072, height: 0.127 },
        { timeMs: 6_000, x: 0.48, y: 0.45, confidence: 0.72, kind: "face", width: 0.06, height: 0.1 },
        { timeMs: 7_000, x: 0.81, y: 0.53, confidence: 1, kind: "activity", width: 0.32, height: 0.47, trackId: "full-scan-attached-motion" },
        { timeMs: 8_000, x: 0.49, y: 0.46, confidence: 0.86, kind: "face", width: 0.06, height: 0.1 },
        { timeMs: 8_000, x: 0.05, y: 0.15, confidence: 1, kind: "activity", width: 0.11, height: 0.33, trackId: "full-scan-attached-motion" },
        { timeMs: 9_000, x: 0.48, y: 0.46, confidence: 0.83, kind: "face", width: 0.06, height: 0.1 },
        { timeMs: 9_000, x: 0.55, y: 0.67, confidence: 1, kind: "activity", width: 0.36, height: 0.5, trackId: "full-scan-attached-motion" },
        { timeMs: 10_000, x: 0.48, y: 0.46, confidence: 0.81, kind: "face", width: 0.06, height: 0.1 },
      ],
    });

    const anchors = plan.keyframes.filter((frame) => frame.source === "auto");
    const scales = anchors.map((frame) => frame.scale);
    expect(anchors.every((frame) => Math.abs(frame.x - 0.48) < 0.03)).toBe(true);
    expect(anchors.every((frame) => Math.abs(frame.y - 0.46) < 0.04)).toBe(true);
    expect(Math.max(...scales)).toBeGreaterThan(Math.min(...scales) + 0.04);
    expect(scales.at(-1)).toBeLessThan(Math.max(...scales));
  });

  it("returns to the wider framing between separate activity bursts", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 30_000,
      focusX: 0.5,
      focusY: 0.5,
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: 16 / 9,
      trackPoints: [
        { timeMs: 0, x: 0.5, y: 0.48, confidence: 0.95, kind: "face", width: 0.08, height: 0.12 },
        { timeMs: 2_000, x: 0.2, y: 0.3, confidence: 0.9, kind: "activity" },
        { timeMs: 3_000, x: 0.8, y: 0.7, confidence: 0.9, kind: "activity" },
        { timeMs: 20_000, x: 0.3, y: 0.3, confidence: 0.9, kind: "activity" },
        { timeMs: 21_000, x: 0.7, y: 0.7, confidence: 0.9, kind: "activity" },
      ],
    });

    const idleScale = plan.keyframes[0].scale;
    expect(evaluateCameraMotionPlan(plan, 7_000).scale).toBeCloseTo(idleScale, 2);
    expect(evaluateCameraMotionPlan(plan, 21_000).scale).toBeGreaterThan(idleScale + 0.04);
    expect(evaluateCameraMotionPlan(plan, 27_000).scale).toBeCloseTo(idleScale, 2);
    expect(plan.keyframes.every((frame) => Math.abs(frame.x - 0.5) < 0.001)).toBe(true);
    expect(plan.keyframes.every((frame) => Math.abs(frame.y - 0.48) < 0.001)).toBe(true);
  });

  it("does not abandon the locked face when attached activity cannot share the crop", () => {
    const face = { x: 0.47, y: 0.45, width: 0.066, height: 0.117 };
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 18_000,
      focusX: 0.5,
      focusY: 0.5,
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: 16 / 9,
      analysisMode: "full_scan",
      trackPoints: [
        { timeMs: 0, ...face, confidence: 0.9, kind: "face" },
        { timeMs: 5_000, ...face, confidence: 0.9, kind: "face" },
        { timeMs: 5_000, x: 0.82, y: 0.62, width: 0.22, height: 0.28, confidence: 1, kind: "activity", trackId: "full-scan-attached-motion" },
        { timeMs: 8_000, ...face, confidence: 0.9, kind: "face" },
        { timeMs: 8_000, x: 0.84, y: 0.64, width: 0.22, height: 0.28, confidence: 1, kind: "activity", trackId: "full-scan-attached-motion" },
        { timeMs: 11_000, ...face, confidence: 0.9, kind: "face" },
        { timeMs: 11_000, x: 0.83, y: 0.63, width: 0.22, height: 0.28, confidence: 1, kind: "activity", trackId: "full-scan-attached-motion" },
      ],
    });

    const sample = evaluateCameraMotionPlan(plan, 12_000);
    const cropWidth = (9 / 16) / (16 / 9) / sample.scale;
    const faceLeft = face.x - face.width / 2;
    const faceRight = face.x + face.width / 2;
    const cropLeft = sample.x - cropWidth / 2;
    const cropRight = sample.x + cropWidth / 2;

    expect(cropLeft).toBeLessThanOrEqual(faceLeft - 0.015);
    expect(cropRight).toBeGreaterThanOrEqual(faceRight + 0.015);
  });

  it("keeps the face locked while confirmed distant activity only changes zoom briefly", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 16_000,
      focusX: 0.5,
      focusY: 0.48,
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: 16 / 9,
      analysisMode: "full_scan",
      trackPoints: [
        { timeMs: 0, x: 0.5, y: 0.48, confidence: 0.96, kind: "face", width: 0.1, height: 0.14 },
        { timeMs: 5_000, x: 0.5, y: 0.48, confidence: 0.96, kind: "face", width: 0.1, height: 0.14 },
        { timeMs: 5_000, x: 0.86, y: 0.58, confidence: 0.9, kind: "activity", width: 0.18, height: 0.2 },
        { timeMs: 6_000, x: 0.5, y: 0.48, confidence: 0.96, kind: "face", width: 0.1, height: 0.14 },
        { timeMs: 6_000, x: 0.87, y: 0.58, confidence: 0.92, kind: "activity", width: 0.18, height: 0.2 },
        { timeMs: 10_500, x: 0.5, y: 0.48, confidence: 0.96, kind: "face", width: 0.1, height: 0.14 },
        { timeMs: 12_000, x: 0.5, y: 0.48, confidence: 0.96, kind: "face", width: 0.1, height: 0.14 },
      ],
    });

    expect(plan.keyframes.some((frame) => frame.scale > 1.2)).toBe(true);
    expect(plan.keyframes.every((frame) => Math.abs(frame.x - 0.5) < 0.001)).toBe(true);
    expect(evaluateCameraMotionPlan(plan, 7_800).scale).toBeGreaterThan(1.2);
    expect(evaluateCameraMotionPlan(plan, 15_500).scale).toBeLessThan(1.2);
  });

  it("keeps global pixel motion face-safe instead of treating it as a distant subject", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 16_000,
      focusX: 0.5,
      focusY: 0.48,
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: 16 / 9,
      analysisMode: "full_scan",
      trackPoints: [
        { timeMs: 0, x: 0.5, y: 0.48, confidence: 0.96, kind: "face", width: 0.1, height: 0.14 },
        { timeMs: 5_000, x: 0.5, y: 0.48, confidence: 0.96, kind: "face", width: 0.1, height: 0.14 },
        { timeMs: 5_000, x: 0.86, y: 0.58, confidence: 0.98, kind: "activity", width: 0.18, height: 0.2, trackId: "full-scan-global-motion" },
        { timeMs: 6_000, x: 0.5, y: 0.48, confidence: 0.96, kind: "face", width: 0.1, height: 0.14 },
        { timeMs: 6_000, x: 0.87, y: 0.58, confidence: 0.99, kind: "activity", width: 0.18, height: 0.2, trackId: "full-scan-global-motion" },
      ],
    });

    expect(evaluateCameraMotionPlan(plan, 7_800).x).toBeLessThan(0.65);
    expect(plan.keyframes.every((frame) => frame.scale <= 1.2)).toBe(true);
  });

  it("keeps a stable face anchor even after activity evidence becomes stale", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 15_000,
      focusX: 0.5,
      focusY: 0.5,
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: 16 / 9,
      analysisMode: "full_scan",
      trackPoints: [
        { timeMs: 0, x: 0.5, y: 0.48, confidence: 0.95, kind: "face", width: 0.08, height: 0.12 },
        { timeMs: 5_000, x: 0.5, y: 0.48, confidence: 0.95, kind: "face", width: 0.08, height: 0.12 },
        { timeMs: 5_000, x: 0.72, y: 0.56, confidence: 0.8, kind: "activity", width: 0.08, height: 0.08 },
        { timeMs: 6_000, x: 0.53, y: 0.48, confidence: 0.95, kind: "face", width: 0.08, height: 0.12 },
        { timeMs: 6_000, x: 0.76, y: 0.57, confidence: 0.85, kind: "activity", width: 0.08, height: 0.08 },
        { timeMs: 11_000, x: 0.7, y: 0.48, confidence: 0.95, kind: "face", width: 0.08, height: 0.12 },
      ],
    });

    const lockedX = plan.keyframes[0].x;
    expect(evaluateCameraMotionPlan(plan, 14_500).x).toBeCloseTo(lockedX, 3);
    expect(plan.keyframes.every((frame) => Math.abs(frame.x - lockedX) < 0.001)).toBe(true);
  });

  it("does not chase activity when the verified face is already near a horizontal edge", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 10_000,
      focusX: 0.5,
      focusY: 0.5,
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: 16 / 9,
      analysisMode: "full_scan",
      trackPoints: [
        { timeMs: 0, x: 0.28, y: 0.48, confidence: 0.95, kind: "face", width: 0.08, height: 0.12 },
        { timeMs: 5_000, x: 0.28, y: 0.48, confidence: 0.95, kind: "face", width: 0.08, height: 0.12 },
        { timeMs: 5_000, x: 0.75, y: 0.55, confidence: 0.85, kind: "activity", width: 0.08, height: 0.08 },
        { timeMs: 6_000, x: 0.28, y: 0.48, confidence: 0.95, kind: "face", width: 0.08, height: 0.12 },
        { timeMs: 6_000, x: 0.78, y: 0.56, confidence: 0.85, kind: "activity", width: 0.08, height: 0.08 },
      ],
    });

    expect(plan.keyframes.some((frame) => frame.scale > 1.2)).toBe(true);
    expect(plan.keyframes.every((frame) => Math.abs(frame.x - 0.28) < 0.001)).toBe(true);
  });

  it("does not pan when distant detections alternate instead of confirming one subject exit", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 25_000,
      focusX: 0.5,
      focusY: 0.5,
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: 16 / 9,
      analysisMode: "full_scan",
      trackPoints: [
        { timeMs: 0, x: 0.5, y: 0.5, confidence: 0.95, kind: "face", width: 0.12, height: 0.18 },
        { timeMs: 15_000, x: 0.25, y: 0.7, confidence: 0.99, kind: "face", width: 0.04, height: 0.05 },
        { timeMs: 17_500, x: 0.75, y: 0.3, confidence: 0.99, kind: "face", width: 0.04, height: 0.05 },
        { timeMs: 20_000, x: 0.25, y: 0.7, confidence: 0.99, kind: "face", width: 0.04, height: 0.05 },
      ],
    });

    expect(plan.keyframes.every((frame) => Math.abs(frame.x - 0.25) < 0.001)).toBe(true);
  });

  it("uses full-scan face positions for Face Focus when evidence exists", () => {
    const plan = createCameraMotionPlan({
      mode: "face_focus",
      durationMs: 5_000,
      focusX: 0.5,
      focusY: 0.5,
      trackPoints: [{ timeMs: 0, x: 0.76, y: 0.48, confidence: 0.95, kind: "face" }],
      analysisMode: "full_scan",
    });
    expect(plan.keyframes[0].timeMs).toBe(0);
    expect(plan.keyframes[0].x).toBeGreaterThan(0.65);
    expect(plan.analysisMode).toBe("full_scan");
  });

  it("uses the immediate face lock in Quick mode before Full Scan points exist", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 8_000,
      focusX: 0.72,
      focusY: 0.46,
      analysisMode: "quick",
      trackPoints: [],
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: 16 / 9,
    });
    expect(plan.keyframes[0].x).toBeGreaterThan(0.65);
    expect(plan.keyframes[0].y).toBeCloseTo(0.46, 2);
  });

  it("locks a verified delayed Full Scan face from the opening", () => {
    const plan = createCameraMotionPlan({
      mode: "face_focus",
      durationMs: 8_000,
      focusX: 0.5,
      focusY: 0.5,
      trackPoints: [{ timeMs: 2_000, x: 0.72, y: 0.48, confidence: 0.95, kind: "face" }],
      analysisMode: "full_scan",
    });

    expect(plan.keyframes[0].timeMs).toBe(0);
    expect(plan.keyframes[0].x).toBeGreaterThan(0.65);
    expect(evaluateCameraMotionPlan(plan, 1_000).x).toBeGreaterThan(0.65);
    expect(evaluateCameraMotionPlan(plan, 7_999).x).toBeGreaterThan(0.65);
    expect(evaluateCameraMotionPlan(plan, 7_999).x).toBeGreaterThan(0.65);
  });

  it("preserves Mark precedence at the same time", () => {
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 2_000,
      focusX: 0.5,
      focusY: 0.5,
      trackPoints: [{ timeMs: 1_000, x: 0.1, y: 0.1, confidence: 1, kind: "face" }],
      marks: [{ id: "mark-1", time: 1, x: 0.8, y: 0.7, scale: 1.3 }],
    });
    const marked = plan.keyframes.find((frame) => frame.sourceMarkId === "mark-1");
    expect(marked?.source).toBe("user_mark");
    expect(marked?.x).toBeCloseTo(0.8);
    expect(marked?.y).toBeCloseTo(0.7);
  });

  it("rejects stale Full Scan promotion and supports monotonic checkpoints", () => {
    const envelope = {
      jobId: "job-1",
      contractVersion: "feature-191.v1" as const,
      tenantId: "tenant-1",
      sourceFingerprint: "source-a",
      markRevision: 2,
      policyFingerprint: "policy-a",
      capabilityProfileFingerprint: "cap-a",
      analysisMode: "full_scan" as const,
      trimRange: { startMs: 0, endMs: 10_000 },
      aspectProfile: "9:16",
      durationMs: 10_000,
    };
    const checkpoint = nextCompositionCheckpoint(null, envelope, 4_000, "evidence-a");
    const plan = createCameraMotionPlan({
      mode: "face_activity",
      durationMs: 10_000,
      focusX: 0.5,
      focusY: 0.5,
      analysisMode: "full_scan",
      evidence: { analysisMode: "full_scan", status: "approved", evidenceRef: "evidence-a" },
    }) as CameraMotionPlan;
    checkpoint.status = "approved";
    expect(canPromoteCompositionScan(checkpoint, envelope, plan)).toBe(true);
    expect(canPromoteCompositionScan(checkpoint, { ...envelope, markRevision: 3 }, plan)).toBe(false);
    expect(canPromoteCompositionScan(checkpoint, { ...envelope, aspectProfile: "16:9" }, plan)).toBe(false);
    expect(canPromoteCompositionScan(checkpoint, { ...envelope, analysisMode: "quick" }, plan)).toBe(false);
    const resumed = nextCompositionCheckpoint(checkpoint, envelope, 2_000, "evidence-a");
    expect(resumed.cursorMs).toBe(4_000);
  });
});
