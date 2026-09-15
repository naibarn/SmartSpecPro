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

    expect(plan.keyframes[0].x).toBeCloseTo(0.5, 2);
    expect(plan.keyframes.some((frame) => frame.x > 0.6)).toBe(true);
    expect(plan.keyframes.find((frame) => frame.x > 0.6)?.timeMs).toBeGreaterThan(2_000);
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
    expect(plan.keyframes[0].x).toBeCloseTo(0.5, 2);
    expect(plan.keyframes[1].timeMs).toBeLessThanOrEqual(850);
    expect(plan.keyframes[1].x).toBeGreaterThan(0.65);
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
    expect(automaticFrames.map((frame) => frame.timeMs)).toEqual([0, 850]);
    expect(automaticFrames.at(-1)?.x).toBeCloseTo(0.6, 2);
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

    expect(plan.keyframes.map((frame) => frame.timeMs)).toEqual([0, 850]);
    expect(plan.keyframes.every((frame) => Math.abs(frame.x - 0.5) < 0.001)).toBe(true);
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

    expect(plan.keyframes.map((frame) => frame.timeMs)).toEqual([0, 850]);
  });

  it("adds a real 15-second hold before one short sustained-edge correction", () => {
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

    expect(plan.keyframes.map((frame) => frame.timeMs)).toEqual([0, 20_000, 21_800]);
    expect(evaluateCameraMotionPlan(plan, 19_999).x).toBeCloseTo(0.5, 3);
    expect(evaluateCameraMotionPlan(plan, 20_900).x).toBeGreaterThan(0.5);
    expect(evaluateCameraMotionPlan(plan, 22_000).x).toBeCloseTo(0.7, 2);
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
    expect(evaluateCameraMotionPlan(plan, 59_999).x).toBeCloseTo(0.5, 3);
    expect(evaluateCameraMotionPlan(plan, 59_999).y).toBeCloseTo(0.5, 3);
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

    expect(plan.keyframes).toHaveLength(1);
    expect(plan.keyframes[0].x).toBeCloseTo(0.5, 3);
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

  it("holds centre then makes a bounded move when Full Scan first finds the person later", () => {
    const plan = createCameraMotionPlan({
      mode: "face_focus",
      durationMs: 8_000,
      focusX: 0.5,
      focusY: 0.5,
      trackPoints: [{ timeMs: 2_000, x: 0.72, y: 0.48, confidence: 0.95, kind: "face" }],
      analysisMode: "full_scan",
    });

    expect(plan.keyframes.map((frame) => frame.timeMs)).toEqual([0, 2_000, 3_800]);
    expect(evaluateCameraMotionPlan(plan, 1_999).x).toBeCloseTo(0.5, 3);
    expect(evaluateCameraMotionPlan(plan, 3_800).x).toBeCloseTo(0.72, 2);
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
