import {
  validateFivePointFaceEvidence,
  type FivePointFaceEvidence,
  type AttachedActivityEvidence,
} from "./cameraEvidence";

/**
 * v2 is the first version whose evidence fields are authoritative for the
 * Face + Activity planner. v1 remains readable so projects created before
 * Feature 191 can still be previewed and rendered during the migration
 * window.
 */
export const LEGACY_CAMERA_MOTION_PLAN_VERSION = "camera.motion.v1" as const;
export const CAMERA_MOTION_PLAN_VERSION = "camera.motion.v2" as const;
export type CameraMotionPlanVersion =
  typeof LEGACY_CAMERA_MOTION_PLAN_VERSION | typeof CAMERA_MOTION_PLAN_VERSION;

export type CameraMotionMode =
  "auto" | "face_focus" | "product_focus" | "face_activity";
export type CameraMotionAnalysisMode = "quick" | "full_scan";
export type CameraMotionTargetKind =
  "face" | "person" | "hand" | "object" | "activity" | "manual";
export type CameraMotionEasing =
  "linear" | "ease-in" | "ease-out" | "ease-in-out";
export type CameraMotionSource = "auto" | "user_mark";

export interface CameraMotionKeyframe {
  timeMs: number;
  x: number;
  y: number;
  scale: number;
  easing?: CameraMotionEasing;
  source: CameraMotionSource;
  sourceMarkId?: string;
}

export interface CameraMotionPlan {
  version: CameraMotionPlanVersion;
  mode: CameraMotionMode;
  durationMs: number;
  keyframes: CameraMotionKeyframe[];
  /** Deterministic source/plan evidence fingerprint used for stale-result checks. */
  planFingerprint?: string;
  analysisMode?: CameraMotionAnalysisMode;
  targetTracks?: CameraMotionTrackPoint[];
  evidence?: CameraMotionEvidence;
}

export interface CameraMotionTrackPoint {
  timeMs: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  confidence: number;
  kind: CameraMotionTargetKind;
  trackId?: string;
  visible?: boolean;
}

export interface CameraMotionActivityInterval {
  startMs: number;
  endMs: number;
  score: number;
  kind?: string;
}

export interface CameraMotionEvidence {
  analysisMode: CameraMotionAnalysisMode;
  status: "provisional" | "approved" | "degraded";
  sourceFingerprint?: string;
  markRevision?: number;
  policyFingerprint?: string;
  capabilityProfileFingerprint?: string;
  evidenceRef?: string;
  fivePointFace?: FivePointFaceEvidence;
  activityEvidence?: AttachedActivityEvidence[];
}

export interface CameraMotionMark {
  id: string;
  name?: string;
  time: number;
  x: number;
  y: number;
  scale?: number;
}

export interface CameraMotionPlanInput {
  durationMs: number;
  mode: CameraMotionMode;
  focusX: number;
  focusY: number;
  baseScale?: number;
  marks?: CameraMotionMark[];
  analysisMode?: CameraMotionAnalysisMode;
  trackPoints?: CameraMotionTrackPoint[];
  activityIntervals?: CameraMotionActivityInterval[];
  evidence?: CameraMotionEvidence;
  outputAspectRatio?: number;
  sourceAspectRatio?: number;
}

export interface CameraMotionSample {
  x: number;
  y: number;
  scale: number;
  source: CameraMotionSource;
  sourceMarkId?: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 2.5;
// Keep automatic camera anchors away from the source edges. These bounds are
// intentionally conservative because the final crop can be narrower than the
// source and a mathematically valid 0..1 point can still place a face/product
// uncomfortably close to the frame edge.
const MIN_X = 0.2;
const MAX_X = 0.8;
const MIN_Y = 0.2;
const MAX_Y = 0.8;
const CYCLE_MS = 36_000;
const HOLD_MS = 9_000;
const MOVE_MS = 5_000;
// Face detectors report small, valid movements even when the current crop is
// still comfortable. Face targets are handled separately below: the camera
// must finish the move to the face centre before holding. These thresholds
// remain for non-face activity evidence so product/activity plans do not jitter.
const AUTO_CAMERA_MIN_DWELL_MS = 4_500;
const AUTO_CAMERA_MIN_DRIFT_X = 0.09;
const AUTO_CAMERA_MIN_DRIFT_Y = 0.09;
// Face-led shots must contain real holds. A sparse list of position endpoints
// is not enough because FFmpeg interpolates across the entire gap and turns it
// into a continuous drift. Require a sustained edge exit, hold the current
// composition for at least 15 seconds, then use one short corrective move.
const AUTO_CAMERA_FACE_MIN_HOLD_MS = 15_000;
const AUTO_CAMERA_FACE_MIN_MOVE_MS = 3_000;
const AUTO_CAMERA_FACE_MAX_MOVE_MS = 6_000;
const AUTO_CAMERA_FACE_EXIT_CONFIRMATIONS = 3;
// A face can remain safely inside a tall crop while still looking visibly
// off-centre. Reframe material composition drift sooner than the edge-exit
// policy, but require repeated samples so normal head movement does not pan
// the camera.
const AUTO_CAMERA_FACE_CENTER_DEADBAND = 0.055;
const AUTO_CAMERA_FACE_CENTER_HOLD_MS = 3_500;
const AUTO_CAMERA_ACTIVITY_MIN_HOLD_MS = 4_500;
const AUTO_CAMERA_ACTIVITY_MIN_MOVE_MS = 3_000;
const AUTO_CAMERA_ACTIVITY_MAX_MOVE_MS = 6_000;
const AUTO_CAMERA_ACTIVITY_CONFIRMATIONS = 2;
const AUTO_CAMERA_ACTIVITY_EVIDENCE_MAX_AGE_MS = 2_500;
const AUTO_CAMERA_ACTIVITY_SAFE_FRACTION = 0.35;
const AUTO_CAMERA_ACTIVITY_RETURN_AFTER_MS = 3_500;
const AUTO_CAMERA_ACTIVITY_FACE_CENTRAL_MIN = 0.36;
const AUTO_CAMERA_ACTIVITY_FACE_CENTRAL_MAX = 0.64;
// A clearly separated, persistent activity can briefly become the visual
// subject. Keep this path stricter than ordinary hand/object motion so a
// noisy detector cannot pull the camera away from the presenter.
const AUTO_CAMERA_STRONG_ACTIVITY_MIN_DISTANCE = 0.28;
const AUTO_CAMERA_STRONG_ACTIVITY_MIN_CONFIDENCE = 0.65;
const AUTO_CAMERA_STRONG_ACTIVITY_MIN_EXTENT = 0.07;
const AUTO_CAMERA_STRONG_ACTIVITY_MIN_HOLD_MS = 3_500;
const AUTO_CAMERA_STRONG_ACTIVITY_RETURN_AFTER_MS = 4_000;
const AUTO_CAMERA_ACTIVITY_COOLDOWN_MS = 2_500;
const AUTO_CAMERA_ACTIVITY_MAX_ZOOM = 1.38;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function safePoint(x: number, y: number): { x: number; y: number } {
  return {
    x: clamp(finiteOr(x, 0.5), MIN_X, MAX_X),
    y: clamp(finiteOr(y, 0.5), MIN_Y, MAX_Y),
  };
}

function safeScale(scale: number | undefined, fallback: number): number {
  return clamp(finiteOr(scale, fallback), MIN_SCALE, MAX_SCALE);
}

function safeConfidence(value: number | undefined): number {
  return clamp(finiteOr(value, 0), 0, 1);
}

function safeAspectRatio(value: number | undefined): number {
  return Number.isFinite(value) && value! > 0 ? value! : 9 / 16;
}

/**
 * Returns the usable source-frame anchor bounds for a crop. Coordinates are
 * normalized top-left source-frame coordinates; the result never asks FFmpeg
 * to place the crop window outside the source image.
 */
export function getFeasibleCameraAnchorBounds(
  outputAspectRatio: number | undefined,
  sourceAspectRatio: number,
  scale: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const outputRatio = safeAspectRatio(outputAspectRatio);
  const sourceRatio =
    Number.isFinite(sourceAspectRatio) && sourceAspectRatio > 0
      ? sourceAspectRatio
      : 16 / 9;
  const safeZoom = safeScale(scale, 1);
  let cropWidth = 1;
  let cropHeight = 1;
  if (outputRatio < sourceRatio) cropWidth = outputRatio / sourceRatio;
  if (outputRatio > sourceRatio) cropHeight = sourceRatio / outputRatio;
  cropWidth = clamp(cropWidth / safeZoom, 0.01, 1);
  cropHeight = clamp(cropHeight / safeZoom, 0.01, 1);
  return {
    minX: cropWidth / 2,
    maxX: 1 - cropWidth / 2,
    minY: cropHeight / 2,
    maxY: 1 - cropHeight / 2,
  };
}

function clampToBounds(
  point: { x: number; y: number },
  bounds: ReturnType<typeof getFeasibleCameraAnchorBounds>,
): { x: number; y: number } {
  return {
    x: clamp(point.x, bounds.minX, bounds.maxX),
    y: clamp(point.y, bounds.minY, bounds.maxY),
  };
}

type CameraMotionRect = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

function rectForMotionPoint(
  point: Pick<CameraMotionTrackPoint, "x" | "y" | "width" | "height">,
  fallbackWidth: number,
  fallbackHeight: number,
): CameraMotionRect {
  const width = clamp(finiteOr(point.width, fallbackWidth), 0.02, 0.8);
  const height = clamp(finiteOr(point.height, fallbackHeight), 0.02, 0.8);
  return {
    minX: clamp(point.x - width / 2, 0, 1),
    maxX: clamp(point.x + width / 2, 0, 1),
    minY: clamp(point.y - height / 2, 0, 1),
    maxY: clamp(point.y + height / 2, 0, 1),
  };
}

function cropDimensions(
  bounds: ReturnType<typeof getFeasibleCameraAnchorBounds>,
): { width: number; height: number } {
  return {
    width: clamp(bounds.minX * 2, 0.01, 1),
    height: clamp(bounds.minY * 2, 0.01, 1),
  };
}

/**
 * Chooses the closest useful activity framing while keeping the face and the
 * moving region inside the same crop whenever the source geometry allows it.
 * The old planner blended the two centres, which could place the crop between
 * both subjects without actually framing either one well.
 */
function buildJointActivityComposition(input: {
  face: Pick<CameraMotionTrackPoint, "x" | "y" | "width" | "height"> & {
    scale: number;
  };
  activity: Pick<CameraMotionTrackPoint, "x" | "y" | "width" | "height">;
  baseScale: number;
  outputAspectRatio?: number;
  sourceAspectRatio: number;
}): { target: { x: number; y: number }; scale: number; fitsBoth: boolean } {
  const faceRect = rectForMotionPoint(input.face, 0.1, 0.14);
  const activityRect = rectForMotionPoint(input.activity, 0.08, 0.08);
  const union = {
    minX: clamp(Math.min(faceRect.minX, activityRect.minX) - 0.025, 0, 1),
    maxX: clamp(Math.max(faceRect.maxX, activityRect.maxX) + 0.025, 0, 1),
    minY: clamp(Math.min(faceRect.minY, activityRect.minY) - 0.025, 0, 1),
    maxY: clamp(Math.max(faceRect.maxY, activityRect.maxY) + 0.025, 0, 1),
  };
  const desiredScale = clamp(
    Math.max(input.baseScale + 0.08, input.face.scale + 0.08),
    1,
    AUTO_CAMERA_ACTIVITY_MAX_ZOOM,
  );

  // Prefer the most useful zoom, then gracefully reduce it until both the
  // presenter and the moving item fit. This creates a real zoom-to-product
  // shot without trading away the face.
  for (let step = 0; step <= 20; step += 1) {
    const scale = Math.max(1, desiredScale - step * 0.02);
    const bounds = getFeasibleCameraAnchorBounds(
      input.outputAspectRatio,
      input.sourceAspectRatio,
      scale,
    );
    const crop = cropDimensions(bounds);
    const minAnchorX = Math.max(bounds.minX, union.maxX - crop.width / 2);
    const maxAnchorX = Math.min(bounds.maxX, union.minX + crop.width / 2);
    const minAnchorY = Math.max(bounds.minY, union.maxY - crop.height / 2);
    const maxAnchorY = Math.min(bounds.maxY, union.minY + crop.height / 2);
    if (minAnchorX <= maxAnchorX && minAnchorY <= maxAnchorY) {
      return {
        target: {
          x: clamp(input.activity.x, minAnchorX, maxAnchorX),
          y: clamp(input.activity.y, minAnchorY, maxAnchorY),
        },
        scale,
        fitsBoth: true,
      };
    }
  }

  // The two regions cannot coexist in one crop at a useful scale. Keep the
  // movement deterministic and let the strong-activity path make a slow,
  // intentional reveal instead of producing a large blended jump.
  const fallbackBounds = getFeasibleCameraAnchorBounds(
    input.outputAspectRatio,
    input.sourceAspectRatio,
    1,
  );
  return {
    target: clampToBounds(input.activity, fallbackBounds),
    scale: 1,
    fitsBoth: false,
  };
}

function adaptiveCameraMoveDurationMs(
  from: { x: number; y: number; scale: number },
  to: { x: number; y: number; scale: number },
  minMs: number,
  maxMs: number,
): number {
  const positionDistance = Math.hypot(to.x - from.x, to.y - from.y);
  const zoomDistance = Math.abs(to.scale - from.scale) * 0.75;
  const travel = Math.max(positionDistance, zoomDistance);
  return clamp(Math.round(minMs + travel * 9_000), minMs, maxMs);
}

function activityScoreAt(
  timeMs: number,
  intervals: CameraMotionActivityInterval[],
): number {
  return intervals.reduce((best, interval) => {
    if (timeMs < interval.startMs || timeMs > interval.endMs) return best;
    return Math.max(best, safeConfidence(interval.score));
  }, 0);
}

function targetWeight(kind: CameraMotionTargetKind): number {
  if (kind === "face") return 1;
  if (kind === "person") return 0.92;
  if (kind === "hand") return 0.84;
  if (kind === "object") return 0.8;
  if (kind === "activity") return 0.72;
  return 1;
}

function normalizeTrackPoint(
  point: CameraMotionTrackPoint,
): CameraMotionTrackPoint | null {
  if (
    !point ||
    !Number.isFinite(point.timeMs) ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y)
  )
    return null;
  return {
    ...point,
    timeMs: Math.max(0, Math.round(point.timeMs)),
    x: clamp(point.x, 0, 1),
    y: clamp(point.y, 0, 1),
    width: Number.isFinite(point.width) ? clamp(point.width!, 0, 1) : undefined,
    height: Number.isFinite(point.height)
      ? clamp(point.height!, 0, 1)
      : undefined,
    confidence: safeConfidence(point.confidence),
    visible: point.visible !== false,
  };
}

// Camera detectors commonly report at frame cadence. Persisting every sample
// makes the FFmpeg crop follow tiny detection noise and produces visible
// jitter. Keep a point when the subject moved materially, or when a long hold
// would otherwise hide a real change; the first and last samples are always
// retained so the saved plan covers the complete clip.
export function reduceCameraMotionTrackPoints(
  trackPoints: CameraMotionTrackPoint[] | undefined,
): CameraMotionTrackPoint[] {
  const points = (trackPoints ?? [])
    .map(normalizeTrackPoint)
    .filter((point): point is CameraMotionTrackPoint => Boolean(point))
    .sort(
      (a, b) =>
        a.timeMs - b.timeMs ||
        safeConfidence(b.confidence) - safeConfidence(a.confidence),
    );
  if (points.length <= 2) return points;

  const minIntervalMs = 650;
  const maxHoldMs = 2_400;
  const minMovement = 0.022;
  const reduced = [points[0]];
  for (const point of points.slice(1, -1)) {
    const previous = reduced[reduced.length - 1];
    const elapsed = point.timeMs - previous.timeMs;
    const movement = Math.hypot(point.x - previous.x, point.y - previous.y);
    if (
      elapsed >= maxHoldMs ||
      (elapsed >= minIntervalMs && movement >= minMovement)
    ) {
      reduced.push(point);
    }
  }
  const last = points[points.length - 1];
  const previous = reduced[reduced.length - 1];
  if (
    last.timeMs !== previous.timeMs ||
    Math.hypot(last.x - previous.x, last.y - previous.y) >= minMovement
  ) {
    reduced.push(last);
  }
  return reduced;
}

function buildFaceActivityKeyframes(
  input: CameraMotionPlanInput,
): CameraMotionKeyframe[] {
  const durationMs = Math.max(0, Math.round(finiteOr(input.durationMs, 0)));
  const baseScale = safeScale(input.baseScale, 1.14);
  const sourceAspect =
    Number.isFinite(input.sourceAspectRatio) &&
    (input.sourceAspectRatio ?? 0) > 0
      ? input.sourceAspectRatio!
      : 16 / 9;
  const bounds = getFeasibleCameraAnchorBounds(
    input.outputAspectRatio,
    sourceAspect,
    baseScale,
  );
  // Reduce each evidence family independently. Face and activity samples
  // commonly share a timestamp; reducing one mixed list can discard the
  // activity sample before it reaches the planner.
  const rawFacePoints = (input.trackPoints ?? []).filter(
    (point) => point.kind === "face" || point.kind === "person",
  );
  const rawActivityPoints = (input.trackPoints ?? []).filter(
    (point) =>
      point.kind === "activity" ||
      point.kind === "hand" ||
      point.kind === "object",
  );
  const reducedFacePoints = reduceCameraMotionTrackPoints(rawFacePoints);
  // Keep a nearby face sample beside each activity sample. A static face can
  // otherwise be reduced away between two activity confirmations, preventing
  // the planner from recognizing a sustained event.
  for (const activityPoint of rawActivityPoints) {
    const nearestFace = rawFacePoints.length > 0
      ? rawFacePoints.reduce((closest, candidate) => (
        Math.abs(candidate.timeMs - activityPoint.timeMs) < Math.abs(closest.timeMs - activityPoint.timeMs)
          ? candidate
          : closest
      ))
      : undefined;
    if (
      nearestFace
      && Math.abs(nearestFace.timeMs - activityPoint.timeMs) <= AUTO_CAMERA_ACTIVITY_EVIDENCE_MAX_AGE_MS
      && !reducedFacePoints.some((point) => point.timeMs === nearestFace.timeMs)
    ) {
      reducedFacePoints.push(nearestFace);
    }
  }
  const points = [
    ...reducedFacePoints,
    ...reduceCameraMotionTrackPoints(rawActivityPoints),
  ]
    .filter((point) => point.timeMs <= durationMs)
    .sort(
      (a, b) =>
        a.timeMs - b.timeMs ||
        safeConfidence(b.confidence) - safeConfidence(a.confidence),
    );
  const facePoints = points.filter(
    (point) => point.kind === "face" || point.kind === "person",
  );
  const activityPoints = points.filter(
    (point) =>
      point.kind === "activity" ||
      point.kind === "hand" ||
      point.kind === "object",
  );
  const marks = (input.marks ?? []).filter(
    (mark) => mark && typeof mark.id === "string",
  );
  const candidates = facePoints.map((point) => {
    const activity = activityScoreAt(
      point.timeMs,
      input.activityIntervals ?? [],
    );
    const weight =
      safeConfidence(point.confidence) * targetWeight(point.kind) +
      activity * 0.25;
    const extent = Math.max(point.width ?? 0, point.height ?? 0);
    const scale = clamp(
      Math.max(1.04, Math.min(1.55, baseScale + (0.16 - extent) * 0.35)),
      1,
      2.5,
    );
    const pointBounds = getFeasibleCameraAnchorBounds(
      input.outputAspectRatio,
      sourceAspect,
      scale,
    );
    return {
      timeMs: point.timeMs,
      kind: point.kind,
      ...clampToBounds({ x: point.x, y: point.y }, pointBounds),
      width: point.width,
      height: point.height,
      confidence: point.confidence,
      scale,
      weight,
      bounds: pointBounds,
    };
  });
  const keyframes: CameraMotionKeyframe[] = [];
  // A persisted manual/legacy focus can be stale (especially after the old
  // MediaPipe coordinate bug). Once Full Scan has selected a persistent,
  // credible face track, its first real subject position is the authoritative
  // initial lock even when the detector observed it after the opening frame.
  // The face may have been present before the first successful detector seek;
  // using the verified lock from time zero prevents render from opening on a
  // stale centre/background crop. With no face evidence, the planner still
  // fails safe to source centre.
  const noEvidenceAnchor = input.analysisMode === "quick"
    ? clampToBounds({ x: input.focusX, y: input.focusY }, bounds)
    : clampToBounds({ x: 0.5, y: 0.5 }, bounds);
  let previous =
    candidates.length > 0
      ? { x: candidates[0].x, y: candidates[0].y }
      : noEvidenceAnchor;
  let previousScale = candidates[0]?.scale ?? baseScale;
  let previousMoveTimeMs = 0;
  if (candidates.length > 0) {
    const first = candidates[0];
    const firstObservedTimeMs = Math.max(0, first.timeMs);
    // Face detection is an explicit framing instruction in both modes. Use
    // the verified first face as the opening lock, then keep its source-time
    // timestamp so later detector movement is still aligned with playback
    // and Dead Air remapping.
    keyframes.push(autoKeyframe(0, first.x, first.y, first.scale, "linear"));
    if (firstObservedTimeMs > 0) {
      keyframes.push(autoKeyframe(firstObservedTimeMs, first.x, first.y, first.scale, "linear"));
    }
    previousMoveTimeMs = firstObservedTimeMs;
  } else {
    keyframes.push(autoKeyframe(0, previous.x, previous.y, baseScale));
  }
  let pendingFaceExit: {
    horizontalSide: -1 | 0 | 1;
    verticalSide: -1 | 0 | 1;
    count: number;
    x: number;
    y: number;
    scale: number;
  } | null = null;
  let pendingActivity: {
    x: number;
    y: number;
    timeMs: number;
    count: number;
    strong: boolean;
    scale: number;
  } | null = null;
  let lastActivityEvidenceTimeMs = -1;
  let activityTargetUntilMs = -1;
  let activityTargetIsStrong = false;
  let activityCooldownUntilMs = -1;
  for (const candidate of candidates.slice(1)) {
    const isFaceTarget =
      candidate.kind === "face" || candidate.kind === "person";
    if (isFaceTarget) {
      const heldBounds = getFeasibleCameraAnchorBounds(
        input.outputAspectRatio,
        sourceAspect,
        previousScale,
      );
      const cropWidth = clamp(
        heldBounds.minX > 0 ? heldBounds.minX * 2 : 1,
        0.01,
        1,
      );
      const cropHeight = clamp(
        heldBounds.minY > 0 ? heldBounds.minY * 2 : 1,
        0.01,
        1,
      );
      const subjectHalfWidth = clamp(
        (candidate.width ?? 0.08) / 2,
        0.015,
        cropWidth * 0.45,
      );
      const subjectHalfHeight = clamp(
        (candidate.height ?? 0.14) / 2,
        0.015,
        cropHeight * 0.45,
      );
      const edgeMarginX = Math.max(0.008, cropWidth * 0.035);
      const edgeMarginY = Math.max(0.008, cropHeight * 0.035);
      const availableHalfX = Math.max(
        0.01,
        cropWidth / 2 - subjectHalfWidth - edgeMarginX,
      );
      const availableHalfY = Math.max(
        0.01,
        cropHeight / 2 - subjectHalfHeight - edgeMarginY,
      );
      const horizontalSide: -1 | 0 | 1 =
        candidate.x < previous.x - AUTO_CAMERA_FACE_CENTER_DEADBAND
          ? -1
          : candidate.x > previous.x + AUTO_CAMERA_FACE_CENTER_DEADBAND
            ? 1
            : 0;
      const verticalSide: -1 | 0 | 1 =
        candidate.y < previous.y - AUTO_CAMERA_FACE_CENTER_DEADBAND
          ? -1
          : candidate.y > previous.y + AUTO_CAMERA_FACE_CENTER_DEADBAND
            ? 1
            : 0;

      // Once the opening face lock has settled, a nearby moving patch (for
      // example a toy held in the presenter's hand) may pull the composition
      // toward it. The target is always clamped to the range that keeps the
      // current face fully inside the crop, so activity can improve framing
      // without recreating the old right-edge failure.
      const canStartActivityShot =
        input.mode === "face_activity"
        && activityPoints.length > 0
        && activityTargetUntilMs < 0
        && candidate.timeMs >= activityCooldownUntilMs;
      if (canStartActivityShot) {
        const activityPoint = [...activityPoints]
          .reverse()
          .find(
            (point) =>
              point.timeMs <= candidate.timeMs &&
              candidate.timeMs - point.timeMs <=
                AUTO_CAMERA_ACTIVITY_EVIDENCE_MAX_AGE_MS &&
              point.confidence >= 0.3,
          );
        const faceIsCentralEnough =
          candidate.x >= AUTO_CAMERA_ACTIVITY_FACE_CENTRAL_MIN &&
          candidate.x <= AUTO_CAMERA_ACTIVITY_FACE_CENTRAL_MAX;
        const activityDistance = activityPoint
          ? Math.hypot(activityPoint.x - candidate.x, activityPoint.y - candidate.y)
          : 0;
        const activityExtent = activityPoint
          ? Math.max(activityPoint.width ?? 0, activityPoint.height ?? 0)
          : 0;
        // Global pixel-difference motion is useful as a face-safe cue, but it
        // cannot identify whether the moving pixels are the intended subject
        // (for example a fan, car, or background object). Do not let that
        // unsemantic signal trigger the distant-subject handoff that can push
        // the presenter out of frame. Semantic/attached activity keeps the
        // existing opt-in strong-activity behavior.
        const isUnsemanticGlobalMotion =
          activityPoint?.trackId === "full-scan-global-motion";
        const isStrongActivity = Boolean(
          activityPoint
          && !isUnsemanticGlobalMotion
          && activityPoint.confidence >= AUTO_CAMERA_STRONG_ACTIVITY_MIN_CONFIDENCE
          && activityDistance >= AUTO_CAMERA_STRONG_ACTIVITY_MIN_DISTANCE
          && (activityExtent >= AUTO_CAMERA_STRONG_ACTIVITY_MIN_EXTENT || activityPoint.confidence >= 0.88),
        );
        const faceCanYieldToStrongActivity =
          candidate.x >= AUTO_CAMERA_ACTIVITY_FACE_CENTRAL_MIN - 0.04
          && candidate.x <= AUTO_CAMERA_ACTIVITY_FACE_CENTRAL_MAX + 0.04;
        if (
          activityPoint &&
          (faceIsCentralEnough || (isStrongActivity && faceCanYieldToStrongActivity)) &&
          activityPoint.timeMs > lastActivityEvidenceTimeMs
        ) {
          const desired = {
            x: candidate.x * (isStrongActivity ? 0.18 : 0.38) + activityPoint.x * (isStrongActivity ? 0.82 : 0.62),
            y: candidate.y * (isStrongActivity ? 0.18 : 0.38) + activityPoint.y * (isStrongActivity ? 0.82 : 0.62),
          };
          const isAttachedActivity =
            activityPoint.trackId === "full-scan-attached-motion";
          const jointComposition = isAttachedActivity
            ? buildJointActivityComposition({
              face: candidate,
              activity: activityPoint,
              baseScale,
              outputAspectRatio: input.outputAspectRatio,
              sourceAspectRatio: sourceAspect,
            })
            : null;
          const activityBounds = getFeasibleCameraAnchorBounds(
            input.outputAspectRatio,
            sourceAspect,
            candidate.scale,
          );
          const faceSafeTarget = jointComposition
            ? jointComposition.target
            : isStrongActivity
              ? clampToBounds(desired, activityBounds)
              : clampToBounds(
                {
                  x: clamp(
                    desired.x,
                    candidate.x -
                      availableHalfX * AUTO_CAMERA_ACTIVITY_SAFE_FRACTION,
                    candidate.x +
                      availableHalfX * AUTO_CAMERA_ACTIVITY_SAFE_FRACTION,
                  ),
                  y: clamp(
                    desired.y,
                    candidate.y -
                      availableHalfY * AUTO_CAMERA_ACTIVITY_SAFE_FRACTION,
                    candidate.y +
                      availableHalfY * AUTO_CAMERA_ACTIVITY_SAFE_FRACTION,
                  ),
                },
                activityBounds,
              );
          // Untagged activity is legacy/project evidence. Preserve its old
          // strong handoff behavior while new Full Scan evidence uses the
          // joint face+activity composition above.
          const activityScale = jointComposition?.scale
            ?? (isStrongActivity
              ? Math.min(AUTO_CAMERA_ACTIVITY_MAX_ZOOM, candidate.scale + 0.1)
              : candidate.scale);
          const canUseActivityComposition =
            !jointComposition || jointComposition.fitsBoth || isStrongActivity || isAttachedActivity;
          const activityDelta = Math.hypot(
            faceSafeTarget.x - previous.x,
            faceSafeTarget.y - previous.y,
          );
          lastActivityEvidenceTimeMs = activityPoint.timeMs;
          if (canUseActivityComposition && activityDelta >= 0.025) {
            const previousActivity: {
              x: number;
              y: number;
              timeMs: number;
              count: number;
              strong: boolean;
              scale: number;
            } | null = pendingActivity;
            const sameDirection: boolean = Boolean(
              previousActivity &&
              previousActivity.strong === isStrongActivity &&
              Math.sign(faceSafeTarget.x - previous.x) ===
                Math.sign(previousActivity.x - previous.x) &&
              Math.sign(faceSafeTarget.y - previous.y) ===
                Math.sign(previousActivity.y - previous.y),
            );
            if (sameDirection && previousActivity) {
              const activity: {
                x: number;
                y: number;
                timeMs: number;
                count: number;
                strong: boolean;
                scale: number;
              } = previousActivity;
              pendingActivity = {
                x: (activity.x * activity.count + faceSafeTarget.x) / (activity.count + 1),
                y: (activity.y * activity.count + faceSafeTarget.y) / (activity.count + 1),
                timeMs: activityPoint.timeMs,
                count: activity.count + 1,
                strong: isStrongActivity,
                scale: Math.max(activity.scale, activityScale),
              };
            } else {
              pendingActivity = {
                x: faceSafeTarget.x,
                y: faceSafeTarget.y,
                timeMs: activityPoint.timeMs,
                count: 1,
                strong: isStrongActivity,
                scale: activityScale,
              };
            }
            const holdElapsed =
              candidate.timeMs - previousMoveTimeMs >=
              (pendingActivity.strong
                ? AUTO_CAMERA_STRONG_ACTIVITY_MIN_HOLD_MS
                : AUTO_CAMERA_ACTIVITY_MIN_HOLD_MS);
            if (
              holdElapsed &&
              pendingActivity.count >= AUTO_CAMERA_ACTIVITY_CONFIRMATIONS
            ) {
              const moveStartTimeMs = Math.min(
                durationMs,
                Math.max(previousMoveTimeMs, candidate.timeMs),
              );
              const moveEndTimeMs = Math.min(
                durationMs,
                moveStartTimeMs + adaptiveCameraMoveDurationMs(
                  { ...previous, scale: previousScale },
                  {
                    x: pendingActivity.x,
                    y: pendingActivity.y,
                    scale: pendingActivity.scale,
                  },
                  AUTO_CAMERA_ACTIVITY_MIN_MOVE_MS,
                  AUTO_CAMERA_ACTIVITY_MAX_MOVE_MS,
                ),
              );
              if (moveEndTimeMs > moveStartTimeMs) {
                keyframes.push(
                  autoKeyframe(
                    moveStartTimeMs,
                    previous.x,
                    previous.y,
                    previousScale,
                    "ease-in-out",
                  ),
                );
                keyframes.push(
                  autoKeyframe(
                    moveEndTimeMs,
                    pendingActivity.x,
                    pendingActivity.y,
                    pendingActivity.scale,
                    "ease-in-out",
                  ),
                );
                previous = { x: pendingActivity.x, y: pendingActivity.y };
                previousScale = pendingActivity.scale;
                previousMoveTimeMs = moveEndTimeMs;
                activityTargetUntilMs =
                  moveEndTimeMs + (
                    pendingActivity.strong
                      ? AUTO_CAMERA_STRONG_ACTIVITY_RETURN_AFTER_MS
                      : AUTO_CAMERA_ACTIVITY_RETURN_AFTER_MS
                  );
                activityTargetIsStrong = pendingActivity.strong;
                pendingActivity = null;
              }
            }
          } else {
            pendingActivity = null;
          }
        } else if (!faceIsCentralEnough) {
          pendingActivity = null;
        }
      }

      // Activity is a temporary composition hint. If the evidence expires
      // and the face has started leaving the protected crop, return toward
      // the verified face promptly instead of holding an empty/background
      // view until the much longer face-exit dwell elapses.
      if (
        activityTargetUntilMs >= 0 &&
        candidate.timeMs >= activityTargetUntilMs &&
        (activityTargetIsStrong || horizontalSide !== 0 || verticalSide !== 0) &&
        candidate.confidence >= 0.6
      ) {
        const returnTarget = clampToBounds(
          { x: candidate.x, y: candidate.y },
          candidate.bounds,
        );
        const moveStartTimeMs = Math.min(
          durationMs,
          Math.max(previousMoveTimeMs, candidate.timeMs),
        );
        const moveEndTimeMs = Math.min(
          durationMs,
          moveStartTimeMs + adaptiveCameraMoveDurationMs(
            { ...previous, scale: previousScale },
            { ...returnTarget, scale: candidate.scale },
            AUTO_CAMERA_ACTIVITY_MIN_MOVE_MS,
            AUTO_CAMERA_ACTIVITY_MAX_MOVE_MS,
          ),
        );
        if (moveEndTimeMs > moveStartTimeMs) {
          keyframes.push(
            autoKeyframe(
              moveStartTimeMs,
              previous.x,
              previous.y,
              previousScale,
              "ease-in-out",
            ),
          );
          keyframes.push(
            autoKeyframe(
              moveEndTimeMs,
              returnTarget.x,
              returnTarget.y,
              candidate.scale,
              "ease-in-out",
            ),
          );
          previous = returnTarget;
          previousScale = candidate.scale;
          previousMoveTimeMs = moveEndTimeMs;
          activityTargetUntilMs = -1;
          activityTargetIsStrong = false;
          activityCooldownUntilMs = moveEndTimeMs + AUTO_CAMERA_ACTIVITY_COOLDOWN_MS;
          pendingFaceExit = null;
          continue;
        }
      }

      // The current subject is still fully visible. Hold indefinitely and
      // discard any partial exit sequence instead of accumulating detector
      // movement into a camera instruction.
      if (horizontalSide === 0 && verticalSide === 0) {
        pendingFaceExit = null;
        continue;
      }

      const sameExitDirection: {
        horizontalSide: -1 | 0 | 1;
        verticalSide: -1 | 0 | 1;
        count: number;
        x: number;
        y: number;
        scale: number;
      } | null = pendingFaceExit;
      const continuesExit: boolean = Boolean(
        sameExitDirection
        && sameExitDirection.horizontalSide === horizontalSide
        && sameExitDirection.verticalSide === verticalSide
      );
      if (continuesExit && sameExitDirection) {
        const exit: {
          horizontalSide: -1 | 0 | 1;
          verticalSide: -1 | 0 | 1;
          count: number;
          x: number;
          y: number;
          scale: number;
        } = sameExitDirection;
        pendingFaceExit = {
          horizontalSide,
          verticalSide,
          count: exit.count + 1,
          x: (exit.x * exit.count + candidate.x) / (exit.count + 1),
          y: (exit.y * exit.count + candidate.y) / (exit.count + 1),
          scale: (exit.scale * exit.count + candidate.scale) / (exit.count + 1),
        };
      } else {
        pendingFaceExit = {
          horizontalSide,
          verticalSide,
          count: 1,
          x: candidate.x,
          y: candidate.y,
          scale: candidate.scale,
        };
      }

      const holdElapsed =
        candidate.timeMs - previousMoveTimeMs >= (
          horizontalSide !== 0 || verticalSide !== 0
            ? AUTO_CAMERA_FACE_CENTER_HOLD_MS
            : AUTO_CAMERA_FACE_MIN_HOLD_MS
        );
      if (
        !holdElapsed ||
        pendingFaceExit.count < AUTO_CAMERA_FACE_EXIT_CONFIRMATIONS
      )
        continue;

      const targetBounds = getFeasibleCameraAnchorBounds(
        input.outputAspectRatio,
        sourceAspect,
        pendingFaceExit.scale,
      );
      const target = clampToBounds(
        { x: pendingFaceExit.x, y: pendingFaceExit.y },
        targetBounds,
      );
      const moveStartTimeMs = Math.min(
        durationMs,
        Math.max(previousMoveTimeMs, candidate.timeMs),
      );
      const moveEndTimeMs = Math.min(
        durationMs,
        moveStartTimeMs + adaptiveCameraMoveDurationMs(
          { ...previous, scale: previousScale },
          { ...target, scale: pendingFaceExit.scale },
          AUTO_CAMERA_FACE_MIN_MOVE_MS,
          AUTO_CAMERA_FACE_MAX_MOVE_MS,
        ),
      );
      if (moveEndTimeMs <= moveStartTimeMs) continue;

      // Duplicate the held position at moveStart. This is the keyframe that
      // makes both preview and FFmpeg remain mathematically still before the
      // short correction instead of interpolating from the previous move.
      keyframes.push(
        autoKeyframe(
          moveStartTimeMs,
          previous.x,
          previous.y,
          previousScale,
          "ease-in-out",
        ),
      );
      keyframes.push(
        autoKeyframe(
          moveEndTimeMs,
          target.x,
          target.y,
          pendingFaceExit.scale,
          "ease-in-out",
        ),
      );
      previous = target;
      previousScale = pendingFaceExit.scale;
      previousMoveTimeMs = moveEndTimeMs;
      pendingFaceExit = null;
      continue;
    }
    const cropWidth = clamp(
      candidate.bounds.minX > 0 ? candidate.bounds.minX * 2 : 1,
      0.01,
      1,
    );
    const cropHeight = clamp(
      candidate.bounds.minY > 0 ? candidate.bounds.minY * 2 : 1,
      0.01,
      1,
    );
    const edgeMarginX = Math.max(0.015, cropWidth * 0.06);
    const edgeMarginY = Math.max(0.015, cropHeight * 0.06);
    const subjectHalfWidth = clamp((candidate.width ?? 0.08) / 2, 0.02, 0.16);
    const subjectHalfHeight = clamp((candidate.height ?? 0.14) / 2, 0.02, 0.2);
    const safeMinX =
      previous.x - cropWidth / 2 + edgeMarginX + subjectHalfWidth;
    const safeMaxX =
      previous.x + cropWidth / 2 - edgeMarginX - subjectHalfWidth;
    const safeMinY =
      previous.y - cropHeight / 2 + edgeMarginY + subjectHalfHeight;
    const safeMaxY =
      previous.y + cropHeight / 2 - edgeMarginY - subjectHalfHeight;
    const driftX = Math.abs(candidate.x - previous.x);
    const driftY = Math.abs(candidate.y - previous.y);
    const outsideSafeZone =
      candidate.x < safeMinX ||
      candidate.x > safeMaxX ||
      candidate.y < safeMinY ||
      candidate.y > safeMaxY;
    const meaningfulDrift =
      driftX >= Math.max(AUTO_CAMERA_MIN_DRIFT_X, cropWidth * 0.32) ||
      driftY >= Math.max(AUTO_CAMERA_MIN_DRIFT_Y, cropHeight * 0.12);
    const dwellElapsed =
      candidate.timeMs - previousMoveTimeMs >= AUTO_CAMERA_MIN_DWELL_MS;
    if (!dwellElapsed || (!outsideSafeZone && !meaningfulDrift)) continue;
    const alpha = clamp(0.35 + candidate.weight * 0.35, 0.35, 0.72);
    previous = {
      x: previous.x + (candidate.x - previous.x) * alpha,
      y: previous.y + (candidate.y - previous.y) * alpha,
    };
    previousScale = candidate.scale;
    previousMoveTimeMs = candidate.timeMs;
    keyframes.push(
      autoKeyframe(candidate.timeMs, previous.x, previous.y, candidate.scale),
    );
  }
  // A scan may end before another face sample arrives after the activity
  // hold. Still reserve a slow return segment so the last part of the clip
  // does not remain parked on the product/background indefinitely.
  if (activityTargetUntilMs >= 0 && candidates.length > 0 && previousMoveTimeMs < durationMs) {
    const lastFace = candidates[candidates.length - 1];
    const returnTarget = clampToBounds(
      { x: lastFace.x, y: lastFace.y },
      lastFace.bounds,
    );
    const returnDurationMs = adaptiveCameraMoveDurationMs(
      { ...previous, scale: previousScale },
      { ...returnTarget, scale: lastFace.scale },
      AUTO_CAMERA_ACTIVITY_MIN_MOVE_MS,
      AUTO_CAMERA_ACTIVITY_MAX_MOVE_MS,
    );
    const latestStartMs = Math.max(
      previousMoveTimeMs,
      durationMs - returnDurationMs,
    );
    const returnStartMs = Math.min(
      latestStartMs,
      Math.max(previousMoveTimeMs, activityTargetUntilMs),
    );
    const returnEndMs = Math.min(durationMs, returnStartMs + returnDurationMs);
    if (returnEndMs > returnStartMs) {
      keyframes.push(
        autoKeyframe(
          returnStartMs,
          previous.x,
          previous.y,
          previousScale,
          "ease-in-out",
        ),
      );
      keyframes.push(
        autoKeyframe(
          returnEndMs,
          returnTarget.x,
          returnTarget.y,
          lastFace.scale,
          "ease-in-out",
        ),
      );
    }
  }
  const marked = buildMarkedKeyframes(
    durationMs,
    previous,
    baseScale,
    marks,
    false,
  );
  return dedupeKeyframes([...keyframes, ...marked]);
}

function autoKeyframe(
  timeMs: number,
  x: number,
  y: number,
  scale: number,
  easing: CameraMotionEasing = "ease-in-out",
): CameraMotionKeyframe {
  return {
    timeMs: Math.max(0, Math.round(timeMs)),
    x: clamp(x, MIN_X, MAX_X),
    y: clamp(y, MIN_Y, MAX_Y),
    scale: safeScale(scale, 1),
    easing,
    source: "auto",
  };
}

function userKeyframe(
  mark: CameraMotionMark,
  durationMs: number,
  fallbackScale: number,
): CameraMotionKeyframe {
  const point = safePoint(mark.x, mark.y);
  return {
    timeMs: clamp(Math.round(finiteOr(mark.time, 0) * 1000), 0, durationMs),
    x: point.x,
    y: point.y,
    scale: safeScale(mark.scale, fallbackScale),
    easing: "ease-in-out",
    source: "user_mark",
    sourceMarkId: mark.id,
  };
}

function dedupeKeyframes(
  keyframes: CameraMotionKeyframe[],
): CameraMotionKeyframe[] {
  const sorted = [...keyframes]
    .filter((frame) => Number.isFinite(frame.timeMs))
    .sort((a, b) => a.timeMs - b.timeMs || (a.source === "user_mark" ? -1 : 1));
  const result: CameraMotionKeyframe[] = [];
  for (const frame of sorted) {
    const previous = result[result.length - 1];
    if (previous && previous.timeMs === frame.timeMs) {
      if (frame.source === "user_mark" && previous.source !== "user_mark") {
        result[result.length - 1] = frame;
      }
      continue;
    }
    result.push(frame);
  }
  return result;
}

function buildMarkedKeyframes(
  durationMs: number,
  fallbackPoint: { x: number; y: number },
  fallbackScale: number,
  marks: CameraMotionMark[],
  includeFallbackStart = true,
): CameraMotionKeyframe[] {
  const userFrames = marks
    .map((mark) => userKeyframe(mark, durationMs, fallbackScale))
    .sort((a, b) => a.timeMs - b.timeMs);
  if (userFrames.length === 0) {
    return includeFallbackStart
      ? [autoKeyframe(0, fallbackPoint.x, fallbackPoint.y, 1)]
      : [];
  }

  const frames: CameraMotionKeyframe[] = [];
  const first = userFrames[0];
  if (first.timeMs > 0 && includeFallbackStart) {
    const approachStart = Math.max(
      0,
      first.timeMs - Math.min(MOVE_MS, first.timeMs),
    );
    frames.push(autoKeyframe(0, fallbackPoint.x, fallbackPoint.y, 1));
    frames.push(
      autoKeyframe(approachStart, fallbackPoint.x, fallbackPoint.y, 1),
    );
  }

  for (let index = 0; index < userFrames.length; index += 1) {
    const current = userFrames[index];
    const next = userFrames[index + 1];
    const availableMoveMs = next
      ? Math.max(0, next.timeMs - current.timeMs)
      : Math.max(0, durationMs - current.timeMs);
    const holdUntil = Math.min(
      durationMs,
      current.timeMs + 7_000,
      next
        ? Math.max(
            current.timeMs,
            next.timeMs - Math.min(MOVE_MS, availableMoveMs / 2),
          )
        : durationMs,
    );
    frames.push(current);
    if (holdUntil > current.timeMs) {
      frames.push({ ...current, timeMs: holdUntil });
    }
    if (next && next.timeMs > holdUntil) {
      frames.push({
        ...current,
        timeMs: next.timeMs - Math.min(MOVE_MS, next.timeMs - holdUntil),
      });
    }
  }

  const last = userFrames[userFrames.length - 1];
  if (last.timeMs < durationMs) {
    frames.push({ ...last, timeMs: durationMs });
  }
  return dedupeKeyframes(frames);
}

function buildAutomaticKeyframes(
  durationMs: number,
  point: { x: number; y: number },
  targetScale: number,
  mode: CameraMotionMode,
): CameraMotionKeyframe[] {
  const frames: CameraMotionKeyframe[] = [];
  const patterns = [
    { x: 0, y: 0, scale: targetScale },
    { x: 0.09, y: 0, scale: Math.max(1.04, targetScale - 0.04) },
    { x: 0.07, y: -0.07, scale: targetScale },
    { x: -0.06, y: 0.08, scale: Math.max(1.04, targetScale - 0.02) },
  ] as const;

  for (
    let cycleStart = 0, cycleIndex = 0;
    cycleStart < durationMs;
    cycleStart += CYCLE_MS, cycleIndex += 1
  ) {
    const remaining = durationMs - cycleStart;
    const cycleEnd = Math.min(durationMs, cycleStart + CYCLE_MS);
    const pattern = patterns[cycleIndex % patterns.length];
    const direction = cycleIndex % 2 === 0 ? 1 : -1;
    const target = safePoint(
      point.x + pattern.x * direction,
      point.y + (mode === "face_focus" ? pattern.y * 0.6 : pattern.y),
    );
    const startScale =
      mode === "product_focus" ? Math.min(targetScale, 1.04) : 1;
    const endMove = Math.min(cycleEnd, cycleStart + HOLD_MS + MOVE_MS);
    const returnStart = Math.min(
      cycleEnd,
      cycleStart + HOLD_MS + MOVE_MS + HOLD_MS,
    );
    const returnEnd = Math.min(cycleEnd, returnStart + MOVE_MS);
    const isShortCycle = remaining < HOLD_MS + MOVE_MS;

    frames.push(autoKeyframe(cycleStart, point.x, point.y, startScale));
    if (isShortCycle) {
      frames.push(autoKeyframe(cycleEnd, target.x, target.y, pattern.scale));
      continue;
    }
    frames.push(
      autoKeyframe(cycleStart + HOLD_MS, point.x, point.y, startScale),
    );
    frames.push(autoKeyframe(endMove, target.x, target.y, pattern.scale));
    frames.push(autoKeyframe(returnStart, target.x, target.y, pattern.scale));
    frames.push(autoKeyframe(returnEnd, point.x, point.y, startScale));
    frames.push(autoKeyframe(cycleEnd, point.x, point.y, startScale, "linear"));
  }

  return dedupeKeyframes(frames);
}

export function createCameraMotionPlan(
  input: CameraMotionPlanInput,
): CameraMotionPlan {
  const durationMs = Math.max(0, Math.round(finiteOr(input.durationMs, 0)));
  const point = safePoint(input.focusX, input.focusY);
  const baseScale = safeScale(
    input.baseScale,
    input.mode === "face_focus" ? 1.18 : 1.16,
  );
  const marks = (input.marks ?? []).filter(
    (mark) => mark && typeof mark.id === "string",
  );
  const keyframes =
    input.mode === "face_activity" ||
    (input.mode === "face_focus" && (input.trackPoints?.length ?? 0) > 0)
      ? buildFaceActivityKeyframes(input)
      : marks.length > 0
        ? buildMarkedKeyframes(durationMs, point, baseScale, marks)
        : buildAutomaticKeyframes(durationMs, point, baseScale, input.mode);

  const plan: CameraMotionPlan = {
    version: CAMERA_MOTION_PLAN_VERSION,
    mode: input.mode,
    durationMs,
    keyframes:
      keyframes.length > 0 ? keyframes : [autoKeyframe(0, point.x, point.y, 1)],
    analysisMode: input.analysisMode,
    targetTracks: reduceCameraMotionTrackPoints(input.trackPoints).slice(
      0,
      256,
    ),
    evidence: input.evidence,
  };
  plan.planFingerprint = cameraMotionPlanFingerprint(plan);
  return plan;
}

function applyEasing(
  progress: number,
  easing: CameraMotionEasing = "ease-in-out",
): number {
  const p = clamp(progress, 0, 1);
  if (easing === "linear") return p;
  if (easing === "ease-in") return p * p;
  if (easing === "ease-out") return 1 - (1 - p) * (1 - p);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

export function evaluateCameraMotionPlan(
  plan: CameraMotionPlan,
  timeMs: number,
): CameraMotionSample {
  const frames = dedupeKeyframes(plan.keyframes);
  if (frames.length === 0) {
    return { x: 0.5, y: 0.5, scale: 1, source: "auto" };
  }
  const time = clamp(
    finiteOr(timeMs, 0),
    0,
    Math.max(plan.durationMs, frames[frames.length - 1].timeMs),
  );
  if (time <= frames[0].timeMs) return { ...frames[0] };
  for (let index = 1; index < frames.length; index += 1) {
    const next = frames[index];
    const previous = frames[index - 1];
    if (time <= next.timeMs) {
      const span = Math.max(1, next.timeMs - previous.timeMs);
      const progress = applyEasing(
        (time - previous.timeMs) / span,
        previous.easing,
      );
      return {
        x: previous.x + (next.x - previous.x) * progress,
        y: previous.y + (next.y - previous.y) * progress,
        scale: previous.scale + (next.scale - previous.scale) * progress,
        source:
          previous.source === "user_mark" || next.source === "user_mark"
            ? "user_mark"
            : "auto",
        sourceMarkId:
          next.source === "user_mark"
            ? next.sourceMarkId
            : previous.sourceMarkId,
      };
    }
  }
  return { ...frames[frames.length - 1] };
}

export function validateCameraMotionPlan(plan: CameraMotionPlan): string[] {
  const errors: string[] = [];
  if (
    !plan ||
    ![LEGACY_CAMERA_MOTION_PLAN_VERSION, CAMERA_MOTION_PLAN_VERSION].includes(
      plan.version,
    )
  ) {
    errors.push("camera_motion_plan_version_invalid");
  }
  if (
    !plan ||
    !["auto", "face_focus", "product_focus", "face_activity"].includes(
      plan.mode,
    )
  )
    errors.push("camera_motion_plan_mode_invalid");
  if (!Number.isFinite(plan?.durationMs) || plan.durationMs < 0)
    errors.push("camera_motion_plan_duration_invalid");
  if (
    !Array.isArray(plan?.keyframes) ||
    plan.keyframes.length === 0 ||
    plan.keyframes.length > 512
  ) {
    errors.push("camera_motion_plan_keyframes_invalid");
    return errors;
  }
  let previousTime = -1;
  for (const frame of plan.keyframes) {
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) {
      errors.push("camera_motion_plan_keyframe_invalid");
      continue;
    }
    if (
      !Number.isFinite(frame.timeMs) ||
      frame.timeMs < previousTime ||
      frame.timeMs > plan.durationMs
    )
      errors.push("camera_motion_plan_time_invalid");
    if (![frame.x, frame.y, frame.scale].every(Number.isFinite))
      errors.push("camera_motion_plan_value_invalid");
    if (frame.x < 0 || frame.x > 1 || frame.y < 0 || frame.y > 1)
      errors.push("camera_motion_plan_position_invalid");
    if (frame.scale < MIN_SCALE || frame.scale > MAX_SCALE)
      errors.push("camera_motion_plan_scale_invalid");
    if (!["auto", "user_mark"].includes(frame.source))
      errors.push("camera_motion_plan_source_invalid");
    if (
      frame.easing &&
      !["linear", "ease-in", "ease-out", "ease-in-out"].includes(frame.easing)
    )
      errors.push("camera_motion_plan_easing_invalid");
    if (frame.sourceMarkId && frame.sourceMarkId.length > 128)
      errors.push("camera_motion_plan_mark_id_invalid");
    previousTime = frame.timeMs;
  }
  if (
    plan?.targetTracks &&
    (!Array.isArray(plan.targetTracks) || plan.targetTracks.length > 256)
  )
    errors.push("camera_motion_plan_tracks_invalid");
  if (plan?.analysisMode && !["quick", "full_scan"].includes(plan.analysisMode))
    errors.push("camera_motion_plan_analysis_mode_invalid");
  if (plan?.targetTracks && JSON.stringify(plan.targetTracks).length > 64_000)
    errors.push("camera_motion_plan_evidence_too_large");
  if (plan?.evidence && JSON.stringify(plan.evidence).length > 8_000)
    errors.push("camera_motion_plan_provenance_too_large");
  if (plan?.evidence?.fivePointFace) {
    errors.push(...validateFivePointFaceEvidence(plan.evidence.fivePointFace));
  }
  if (
    plan?.evidence?.activityEvidence &&
    plan.evidence.activityEvidence.some(
      (activity) => !activity.associatedFaceTrackId || activity.freshnessMs < 0,
    )
  )
    errors.push("camera_motion_activity_association_invalid");
  if (
    plan?.version === CAMERA_MOTION_PLAN_VERSION &&
    plan.planFingerprint &&
    plan.planFingerprint !== cameraMotionPlanFingerprint(plan)
  )
    errors.push("camera_motion_plan_fingerprint_invalid");
  return [...new Set(errors)];
}

/**
 * Compatibility reader for persisted project metadata. It accepts the legacy
 * point-only v1 projection and the v2 evidence-aware projection, but never
 * fabricates evidence for a legacy plan. New plans are emitted as v2 by
 * createCameraMotionPlan().
 */
export function readCameraMotionPlan(value: unknown): CameraMotionPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as CameraMotionPlan;
  if (validateCameraMotionPlan(candidate).length > 0) return null;
  return candidate;
}

export function cameraMotionPlanFingerprint(
  plan: CameraMotionPlan | null | undefined,
): string {
  if (!plan) return "none";
  return JSON.stringify({
    version: plan.version,
    mode: plan.mode,
    durationMs: plan.durationMs,
    analysisMode: plan.analysisMode,
    evidence: plan.evidence,
    targetTracks: plan.targetTracks ?? [],
    keyframes: plan.keyframes,
  });
}
