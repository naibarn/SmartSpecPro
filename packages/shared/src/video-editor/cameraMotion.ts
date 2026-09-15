/**
 * v2 is the first version whose evidence fields are authoritative for the
 * Face + Activity planner. v1 remains readable so projects created before
 * Feature 191 can still be previewed and rendered during the migration
 * window.
 */
export const LEGACY_CAMERA_MOTION_PLAN_VERSION = "camera.motion.v1" as const;
export const CAMERA_MOTION_PLAN_VERSION = "camera.motion.v2" as const;
export type CameraMotionPlanVersion =
  | typeof LEGACY_CAMERA_MOTION_PLAN_VERSION
  | typeof CAMERA_MOTION_PLAN_VERSION;

export type CameraMotionMode = "auto" | "face_focus" | "product_focus" | "face_activity";
export type CameraMotionAnalysisMode = "quick" | "full_scan";
export type CameraMotionTargetKind = "face" | "person" | "hand" | "object" | "activity" | "manual";
export type CameraMotionEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";
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
const AUTO_CAMERA_STARTUP_SETTLE_MS = 850;
// Face-led shots must contain real holds. A sparse list of position endpoints
// is not enough because FFmpeg interpolates across the entire gap and turns it
// into a continuous drift. Require a sustained edge exit, hold the current
// composition for at least 15 seconds, then use one short corrective move.
const AUTO_CAMERA_FACE_MIN_HOLD_MS = 15_000;
const AUTO_CAMERA_FACE_MOVE_MS = 1_800;
const AUTO_CAMERA_FACE_EXIT_CONFIRMATIONS = 3;

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
  const sourceRatio = Number.isFinite(sourceAspectRatio) && sourceAspectRatio > 0 ? sourceAspectRatio : 16 / 9;
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

function clampToBounds(point: { x: number; y: number }, bounds: ReturnType<typeof getFeasibleCameraAnchorBounds>): { x: number; y: number } {
  return {
    x: clamp(point.x, bounds.minX, bounds.maxX),
    y: clamp(point.y, bounds.minY, bounds.maxY),
  };
}

function activityScoreAt(timeMs: number, intervals: CameraMotionActivityInterval[]): number {
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

function normalizeTrackPoint(point: CameraMotionTrackPoint): CameraMotionTrackPoint | null {
  if (!point || !Number.isFinite(point.timeMs) || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return {
    ...point,
    timeMs: Math.max(0, Math.round(point.timeMs)),
    x: clamp(point.x, 0, 1),
    y: clamp(point.y, 0, 1),
    width: Number.isFinite(point.width) ? clamp(point.width!, 0, 1) : undefined,
    height: Number.isFinite(point.height) ? clamp(point.height!, 0, 1) : undefined,
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
    .sort((a, b) => a.timeMs - b.timeMs || safeConfidence(b.confidence) - safeConfidence(a.confidence));
  if (points.length <= 2) return points;

  const minIntervalMs = 650;
  const maxHoldMs = 2_400;
  const minMovement = 0.022;
  const reduced = [points[0]];
  for (const point of points.slice(1, -1)) {
    const previous = reduced[reduced.length - 1];
    const elapsed = point.timeMs - previous.timeMs;
    const movement = Math.hypot(point.x - previous.x, point.y - previous.y);
    if (elapsed >= maxHoldMs || (elapsed >= minIntervalMs && movement >= minMovement)) {
      reduced.push(point);
    }
  }
  const last = points[points.length - 1];
  const previous = reduced[reduced.length - 1];
  if (last.timeMs !== previous.timeMs || Math.hypot(last.x - previous.x, last.y - previous.y) >= minMovement) {
    reduced.push(last);
  }
  return reduced;
}

function buildFaceActivityKeyframes(input: CameraMotionPlanInput): CameraMotionKeyframe[] {
  const durationMs = Math.max(0, Math.round(finiteOr(input.durationMs, 0)));
  const baseScale = safeScale(input.baseScale, 1.14);
  const sourceAspect = Number.isFinite(input.sourceAspectRatio) && (input.sourceAspectRatio ?? 0) > 0
    ? input.sourceAspectRatio!
    : 16 / 9;
  const bounds = getFeasibleCameraAnchorBounds(input.outputAspectRatio, sourceAspect, baseScale);
  const points = reduceCameraMotionTrackPoints(input.trackPoints)
    .filter((point) => point.timeMs <= durationMs)
    .sort((a, b) => a.timeMs - b.timeMs || safeConfidence(b.confidence) - safeConfidence(a.confidence));
  const marks = (input.marks ?? []).filter((mark) => mark && typeof mark.id === "string");
  const candidates = points.map((point) => {
    const activity = activityScoreAt(point.timeMs, input.activityIntervals ?? []);
    const weight = safeConfidence(point.confidence) * targetWeight(point.kind) + activity * 0.25;
    const extent = Math.max(point.width ?? 0, point.height ?? 0);
    const scale = clamp(Math.max(1.04, Math.min(1.55, baseScale + (0.16 - extent) * 0.35)), 1, 2.5);
    const pointBounds = getFeasibleCameraAnchorBounds(input.outputAspectRatio, sourceAspect, scale);
    return {
      timeMs: point.timeMs,
      kind: point.kind,
      ...clampToBounds({ x: point.x, y: point.y }, pointBounds),
      width: point.width,
      height: point.height,
      scale,
      weight,
      bounds: pointBounds,
    };
  });
  const keyframes: CameraMotionKeyframe[] = [];
  // A persisted manual/legacy focus can be stale (especially after the old
  // MediaPipe coordinate bug). Once face evidence exists, never let that
  // value decide the first rendered frame: preview tracking may have already
  // moved toward the face while the render plan is built synchronously.
  // Start from a neutral frame, then settle on the first observed face quickly.
  // This gives the opening a useful subject-facing shot without turning every
  // later detector sample into a new camera move. With no evidence, retain the
  // explicit source-centre fallback.
  let previous = candidates.length > 0
    ? { x: candidates[0].x, y: candidates[0].y }
    // Face + Activity must fail safe to the source centre when no evidence
    // exists. A persisted focus may belong to an earlier clip or the old
    // detector and can otherwise lock the entire render onto an empty edge.
    : clampToBounds({ x: 0.5, y: 0.5 }, bounds);
  let previousScale = candidates[0]?.scale ?? baseScale;
  let previousMoveTimeMs = 0;
  if (candidates.length > 0) {
    const first = candidates[0];
    const firstObservedTimeMs = Math.max(0, first.timeMs);
    const renderHasPrecomputedPosition = input.analysisMode === "full_scan";
    const startupSettleTimeMs = Math.min(
      durationMs,
      firstObservedTimeMs + AUTO_CAMERA_STARTUP_SETTLE_MS,
    );
    const startupOrigin = clampToBounds({ x: 0.5, y: 0.5 }, bounds);
    if (renderHasPrecomputedPosition && firstObservedTimeMs === 0) {
      // A full scan already resolved the opening composition. Do not render
      // an artificial centre-to-face travel shot and make the subject appear
      // late in the exported video.
      keyframes.push(autoKeyframe(0, first.x, first.y, first.scale, "linear"));
      previousMoveTimeMs = 0;
    } else {
      keyframes.push(autoKeyframe(
        0,
        startupOrigin.x,
        startupOrigin.y,
        1,
        renderHasPrecomputedPosition ? "linear" : "ease-out",
      ));
      if (firstObservedTimeMs > 0) {
        keyframes.push(autoKeyframe(
          firstObservedTimeMs,
          startupOrigin.x,
          startupOrigin.y,
          1,
          renderHasPrecomputedPosition ? "ease-in-out" : "ease-out",
        ));
      }
      const firstMoveEndTimeMs = renderHasPrecomputedPosition
        ? Math.min(durationMs, firstObservedTimeMs + AUTO_CAMERA_FACE_MOVE_MS)
        : startupSettleTimeMs;
      keyframes.push(autoKeyframe(
        firstMoveEndTimeMs,
        first.x,
        first.y,
        first.scale,
        "linear",
      ));
      previousMoveTimeMs = firstMoveEndTimeMs;
    }
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
  for (const candidate of candidates.slice(1)) {
    const isFaceTarget = candidate.kind === "face";
    if (isFaceTarget) {
      const heldBounds = getFeasibleCameraAnchorBounds(input.outputAspectRatio, sourceAspect, previousScale);
      const cropWidth = clamp(heldBounds.minX > 0 ? heldBounds.minX * 2 : 1, 0.01, 1);
      const cropHeight = clamp(heldBounds.minY > 0 ? heldBounds.minY * 2 : 1, 0.01, 1);
      const subjectHalfWidth = clamp((candidate.width ?? 0.08) / 2, 0.015, cropWidth * 0.45);
      const subjectHalfHeight = clamp((candidate.height ?? 0.14) / 2, 0.015, cropHeight * 0.45);
      const edgeMarginX = Math.max(0.008, cropWidth * 0.035);
      const edgeMarginY = Math.max(0.008, cropHeight * 0.035);
      const availableHalfX = Math.max(0.01, cropWidth / 2 - subjectHalfWidth - edgeMarginX);
      const availableHalfY = Math.max(0.01, cropHeight / 2 - subjectHalfHeight - edgeMarginY);
      const horizontalSide: -1 | 0 | 1 = candidate.x < previous.x - availableHalfX
        ? -1
        : candidate.x > previous.x + availableHalfX
          ? 1
          : 0;
      const verticalSide: -1 | 0 | 1 = candidate.y < previous.y - availableHalfY
        ? -1
        : candidate.y > previous.y + availableHalfY
          ? 1
          : 0;

      // The current subject is still fully visible. Hold indefinitely and
      // discard any partial exit sequence instead of accumulating detector
      // movement into a camera instruction.
      if (horizontalSide === 0 && verticalSide === 0) {
        pendingFaceExit = null;
        continue;
      }

      const sameExitDirection = pendingFaceExit
        && pendingFaceExit.horizontalSide === horizontalSide
        && pendingFaceExit.verticalSide === verticalSide;
      pendingFaceExit = sameExitDirection
        ? {
          horizontalSide,
          verticalSide,
          count: pendingFaceExit.count + 1,
          x: (pendingFaceExit.x * pendingFaceExit.count + candidate.x) / (pendingFaceExit.count + 1),
          y: (pendingFaceExit.y * pendingFaceExit.count + candidate.y) / (pendingFaceExit.count + 1),
          scale: (pendingFaceExit.scale * pendingFaceExit.count + candidate.scale) / (pendingFaceExit.count + 1),
        }
        : {
          horizontalSide,
          verticalSide,
          count: 1,
          x: candidate.x,
          y: candidate.y,
          scale: candidate.scale,
        };

      const holdElapsed = candidate.timeMs - previousMoveTimeMs >= AUTO_CAMERA_FACE_MIN_HOLD_MS;
      if (!holdElapsed || pendingFaceExit.count < AUTO_CAMERA_FACE_EXIT_CONFIRMATIONS) continue;

      const targetBounds = getFeasibleCameraAnchorBounds(input.outputAspectRatio, sourceAspect, pendingFaceExit.scale);
      const target = clampToBounds({ x: pendingFaceExit.x, y: pendingFaceExit.y }, targetBounds);
      const moveStartTimeMs = Math.min(durationMs, Math.max(previousMoveTimeMs, candidate.timeMs));
      const moveEndTimeMs = Math.min(durationMs, moveStartTimeMs + AUTO_CAMERA_FACE_MOVE_MS);
      if (moveEndTimeMs <= moveStartTimeMs) continue;

      // Duplicate the held position at moveStart. This is the keyframe that
      // makes both preview and FFmpeg remain mathematically still before the
      // short correction instead of interpolating from the previous move.
      keyframes.push(autoKeyframe(moveStartTimeMs, previous.x, previous.y, previousScale, "ease-in-out"));
      keyframes.push(autoKeyframe(moveEndTimeMs, target.x, target.y, pendingFaceExit.scale, "linear"));
      previous = target;
      previousScale = pendingFaceExit.scale;
      previousMoveTimeMs = moveEndTimeMs;
      pendingFaceExit = null;
      continue;
    }
    const cropWidth = clamp(candidate.bounds.minX > 0 ? candidate.bounds.minX * 2 : 1, 0.01, 1);
    const cropHeight = clamp(candidate.bounds.minY > 0 ? candidate.bounds.minY * 2 : 1, 0.01, 1);
    const edgeMarginX = Math.max(0.015, cropWidth * 0.06);
    const edgeMarginY = Math.max(0.015, cropHeight * 0.06);
    const subjectHalfWidth = clamp((candidate.width ?? 0.08) / 2, 0.02, 0.16);
    const subjectHalfHeight = clamp((candidate.height ?? 0.14) / 2, 0.02, 0.2);
    const safeMinX = previous.x - cropWidth / 2 + edgeMarginX + subjectHalfWidth;
    const safeMaxX = previous.x + cropWidth / 2 - edgeMarginX - subjectHalfWidth;
    const safeMinY = previous.y - cropHeight / 2 + edgeMarginY + subjectHalfHeight;
    const safeMaxY = previous.y + cropHeight / 2 - edgeMarginY - subjectHalfHeight;
    const driftX = Math.abs(candidate.x - previous.x);
    const driftY = Math.abs(candidate.y - previous.y);
    const outsideSafeZone = candidate.x < safeMinX
      || candidate.x > safeMaxX
      || candidate.y < safeMinY
      || candidate.y > safeMaxY;
    const meaningfulDrift = driftX >= Math.max(AUTO_CAMERA_MIN_DRIFT_X, cropWidth * 0.32)
      || driftY >= Math.max(AUTO_CAMERA_MIN_DRIFT_Y, cropHeight * 0.12);
    const dwellElapsed = candidate.timeMs - previousMoveTimeMs >= AUTO_CAMERA_MIN_DWELL_MS;
    if (!dwellElapsed || (!outsideSafeZone && !meaningfulDrift)) continue;
    const alpha = clamp(0.35 + candidate.weight * 0.35, 0.35, 0.72);
    previous = { x: previous.x + (candidate.x - previous.x) * alpha, y: previous.y + (candidate.y - previous.y) * alpha };
    previousScale = candidate.scale;
    previousMoveTimeMs = candidate.timeMs;
    keyframes.push(autoKeyframe(candidate.timeMs, previous.x, previous.y, candidate.scale));
  }
  const marked = buildMarkedKeyframes(durationMs, previous, baseScale, marks, false);
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

function userKeyframe(mark: CameraMotionMark, durationMs: number, fallbackScale: number): CameraMotionKeyframe {
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

function dedupeKeyframes(keyframes: CameraMotionKeyframe[]): CameraMotionKeyframe[] {
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
    return includeFallbackStart ? [autoKeyframe(0, fallbackPoint.x, fallbackPoint.y, 1)] : [];
  }

  const frames: CameraMotionKeyframe[] = [];
  const first = userFrames[0];
  if (first.timeMs > 0 && includeFallbackStart) {
    const approachStart = Math.max(0, first.timeMs - Math.min(MOVE_MS, first.timeMs));
    frames.push(autoKeyframe(0, fallbackPoint.x, fallbackPoint.y, 1));
    frames.push(autoKeyframe(approachStart, fallbackPoint.x, fallbackPoint.y, 1));
  }

  for (let index = 0; index < userFrames.length; index += 1) {
    const current = userFrames[index];
    const next = userFrames[index + 1];
    const availableMoveMs = next ? Math.max(0, next.timeMs - current.timeMs) : Math.max(0, durationMs - current.timeMs);
    const holdUntil = Math.min(
      durationMs,
      current.timeMs + 7_000,
      next ? Math.max(current.timeMs, next.timeMs - Math.min(MOVE_MS, availableMoveMs / 2)) : durationMs,
    );
    frames.push(current);
    if (holdUntil > current.timeMs) {
      frames.push({ ...current, timeMs: holdUntil });
    }
    if (next && next.timeMs > holdUntil) {
      frames.push({ ...current, timeMs: next.timeMs - Math.min(MOVE_MS, next.timeMs - holdUntil) });
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

  for (let cycleStart = 0, cycleIndex = 0; cycleStart < durationMs; cycleStart += CYCLE_MS, cycleIndex += 1) {
    const remaining = durationMs - cycleStart;
    const cycleEnd = Math.min(durationMs, cycleStart + CYCLE_MS);
    const pattern = patterns[cycleIndex % patterns.length];
    const direction = cycleIndex % 2 === 0 ? 1 : -1;
    const target = safePoint(
      point.x + pattern.x * direction,
      point.y + (mode === "face_focus" ? pattern.y * 0.6 : pattern.y),
    );
    const startScale = mode === "product_focus" ? Math.min(targetScale, 1.04) : 1;
    const endMove = Math.min(cycleEnd, cycleStart + HOLD_MS + MOVE_MS);
    const returnStart = Math.min(cycleEnd, cycleStart + HOLD_MS + MOVE_MS + HOLD_MS);
    const returnEnd = Math.min(cycleEnd, returnStart + MOVE_MS);
    const isShortCycle = remaining < HOLD_MS + MOVE_MS;

    frames.push(autoKeyframe(cycleStart, point.x, point.y, startScale));
    if (isShortCycle) {
      frames.push(autoKeyframe(cycleEnd, target.x, target.y, pattern.scale));
      continue;
    }
    frames.push(autoKeyframe(cycleStart + HOLD_MS, point.x, point.y, startScale));
    frames.push(autoKeyframe(endMove, target.x, target.y, pattern.scale));
    frames.push(autoKeyframe(returnStart, target.x, target.y, pattern.scale));
    frames.push(autoKeyframe(returnEnd, point.x, point.y, startScale));
    frames.push(autoKeyframe(cycleEnd, point.x, point.y, startScale, "linear"));
  }

  return dedupeKeyframes(frames);
}

export function createCameraMotionPlan(input: CameraMotionPlanInput): CameraMotionPlan {
  const durationMs = Math.max(0, Math.round(finiteOr(input.durationMs, 0)));
  const point = safePoint(input.focusX, input.focusY);
  const baseScale = safeScale(input.baseScale, input.mode === "face_focus" ? 1.18 : 1.16);
  const marks = (input.marks ?? []).filter((mark) => mark && typeof mark.id === "string");
  const keyframes = (input.mode === "face_activity" || (input.mode === "face_focus" && (input.trackPoints?.length ?? 0) > 0))
    ? buildFaceActivityKeyframes(input)
    : marks.length > 0
    ? buildMarkedKeyframes(durationMs, point, baseScale, marks)
    : buildAutomaticKeyframes(durationMs, point, baseScale, input.mode);

  return {
    version: CAMERA_MOTION_PLAN_VERSION,
    mode: input.mode,
    durationMs,
    keyframes: keyframes.length > 0 ? keyframes : [autoKeyframe(0, point.x, point.y, 1)],
    analysisMode: input.analysisMode,
    targetTracks: reduceCameraMotionTrackPoints(input.trackPoints).slice(0, 256),
    evidence: input.evidence,
  };
}

function applyEasing(progress: number, easing: CameraMotionEasing = "ease-in-out"): number {
  const p = clamp(progress, 0, 1);
  if (easing === "linear") return p;
  if (easing === "ease-in") return p * p;
  if (easing === "ease-out") return 1 - (1 - p) * (1 - p);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

export function evaluateCameraMotionPlan(plan: CameraMotionPlan, timeMs: number): CameraMotionSample {
  const frames = dedupeKeyframes(plan.keyframes);
  if (frames.length === 0) {
    return { x: 0.5, y: 0.5, scale: 1, source: "auto" };
  }
  const time = clamp(finiteOr(timeMs, 0), 0, Math.max(plan.durationMs, frames[frames.length - 1].timeMs));
  if (time <= frames[0].timeMs) return { ...frames[0] };
  for (let index = 1; index < frames.length; index += 1) {
    const next = frames[index];
    const previous = frames[index - 1];
    if (time <= next.timeMs) {
      const span = Math.max(1, next.timeMs - previous.timeMs);
      const progress = applyEasing((time - previous.timeMs) / span, previous.easing);
      return {
        x: previous.x + (next.x - previous.x) * progress,
        y: previous.y + (next.y - previous.y) * progress,
        scale: previous.scale + (next.scale - previous.scale) * progress,
        source: previous.source === "user_mark" || next.source === "user_mark" ? "user_mark" : "auto",
        sourceMarkId: next.source === "user_mark" ? next.sourceMarkId : previous.sourceMarkId,
      };
    }
  }
  return { ...frames[frames.length - 1] };
}

export function validateCameraMotionPlan(plan: CameraMotionPlan): string[] {
  const errors: string[] = [];
  if (!plan || ![LEGACY_CAMERA_MOTION_PLAN_VERSION, CAMERA_MOTION_PLAN_VERSION].includes(plan.version)) {
    errors.push("camera_motion_plan_version_invalid");
  }
  if (!plan || !["auto", "face_focus", "product_focus", "face_activity"].includes(plan.mode)) errors.push("camera_motion_plan_mode_invalid");
  if (!Number.isFinite(plan?.durationMs) || plan.durationMs < 0) errors.push("camera_motion_plan_duration_invalid");
  if (!Array.isArray(plan?.keyframes) || plan.keyframes.length === 0 || plan.keyframes.length > 512) {
    errors.push("camera_motion_plan_keyframes_invalid");
    return errors;
  }
  let previousTime = -1;
  for (const frame of plan.keyframes) {
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) {
      errors.push("camera_motion_plan_keyframe_invalid");
      continue;
    }
    if (!Number.isFinite(frame.timeMs) || frame.timeMs < previousTime || frame.timeMs > plan.durationMs) errors.push("camera_motion_plan_time_invalid");
    if (![frame.x, frame.y, frame.scale].every(Number.isFinite)) errors.push("camera_motion_plan_value_invalid");
    if (frame.x < 0 || frame.x > 1 || frame.y < 0 || frame.y > 1) errors.push("camera_motion_plan_position_invalid");
    if (frame.scale < MIN_SCALE || frame.scale > MAX_SCALE) errors.push("camera_motion_plan_scale_invalid");
    if (!["auto", "user_mark"].includes(frame.source)) errors.push("camera_motion_plan_source_invalid");
    if (frame.easing && !["linear", "ease-in", "ease-out", "ease-in-out"].includes(frame.easing)) errors.push("camera_motion_plan_easing_invalid");
    if (frame.sourceMarkId && frame.sourceMarkId.length > 128) errors.push("camera_motion_plan_mark_id_invalid");
    previousTime = frame.timeMs;
  }
  if (plan?.targetTracks && (!Array.isArray(plan.targetTracks) || plan.targetTracks.length > 256)) errors.push("camera_motion_plan_tracks_invalid");
  if (plan?.analysisMode && !["quick", "full_scan"].includes(plan.analysisMode)) errors.push("camera_motion_plan_analysis_mode_invalid");
  if (plan?.targetTracks && JSON.stringify(plan.targetTracks).length > 64_000) errors.push("camera_motion_plan_evidence_too_large");
  if (plan?.evidence && JSON.stringify(plan.evidence).length > 8_000) errors.push("camera_motion_plan_provenance_too_large");
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

export function cameraMotionPlanFingerprint(plan: CameraMotionPlan | null | undefined): string {
  if (!plan) return "none";
  return JSON.stringify({
    version: plan.version,
    mode: plan.mode,
    durationMs: plan.durationMs,
    analysisMode: plan.analysisMode,
    evidence: plan.evidence,
    keyframes: plan.keyframes,
  });
}
