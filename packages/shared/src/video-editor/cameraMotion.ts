export const CAMERA_MOTION_PLAN_VERSION = "camera.motion.v1" as const;

export type CameraMotionMode = "auto" | "face_focus" | "product_focus";
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
  version: typeof CAMERA_MOTION_PLAN_VERSION;
  mode: CameraMotionMode;
  durationMs: number;
  keyframes: CameraMotionKeyframe[];
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
): CameraMotionKeyframe[] {
  const userFrames = marks
    .map((mark) => userKeyframe(mark, durationMs, fallbackScale))
    .sort((a, b) => a.timeMs - b.timeMs);
  if (userFrames.length === 0) return [autoKeyframe(0, fallbackPoint.x, fallbackPoint.y, 1)];

  const frames: CameraMotionKeyframe[] = [];
  const first = userFrames[0];
  if (first.timeMs > 0) {
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
  const keyframes = marks.length > 0
    ? buildMarkedKeyframes(durationMs, point, baseScale, marks)
    : buildAutomaticKeyframes(durationMs, point, baseScale, input.mode);

  return {
    version: CAMERA_MOTION_PLAN_VERSION,
    mode: input.mode,
    durationMs,
    keyframes: keyframes.length > 0 ? keyframes : [autoKeyframe(0, point.x, point.y, 1)],
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
  if (!plan || plan.version !== CAMERA_MOTION_PLAN_VERSION) errors.push("camera_motion_plan_version_invalid");
  if (!Number.isFinite(plan?.durationMs) || plan.durationMs < 0) errors.push("camera_motion_plan_duration_invalid");
  if (!Array.isArray(plan?.keyframes) || plan.keyframes.length === 0 || plan.keyframes.length > 512) {
    errors.push("camera_motion_plan_keyframes_invalid");
    return errors;
  }
  let previousTime = -1;
  for (const frame of plan.keyframes) {
    if (!Number.isFinite(frame.timeMs) || frame.timeMs < previousTime || frame.timeMs > plan.durationMs) errors.push("camera_motion_plan_time_invalid");
    if (![frame.x, frame.y, frame.scale].every(Number.isFinite)) errors.push("camera_motion_plan_value_invalid");
    if (frame.x < 0 || frame.x > 1 || frame.y < 0 || frame.y > 1) errors.push("camera_motion_plan_position_invalid");
    if (frame.scale < MIN_SCALE || frame.scale > MAX_SCALE) errors.push("camera_motion_plan_scale_invalid");
    previousTime = frame.timeMs;
  }
  return [...new Set(errors)];
}

export function cameraMotionPlanFingerprint(plan: CameraMotionPlan | null | undefined): string {
  if (!plan) return "none";
  return JSON.stringify({ version: plan.version, mode: plan.mode, durationMs: plan.durationMs, keyframes: plan.keyframes });
}
