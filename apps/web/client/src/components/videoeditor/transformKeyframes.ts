import type {
  ClipTransform,
  TransformEasing,
  TransformKeyframe,
  TransformKeyframeProperty,
} from '../../types/videoEditor';

const VALID_EASINGS: TransformEasing[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out'];

export const DEFAULT_CLIP_TRANSFORM: ClipTransform = {
  x: 0.5,
  y: 0.5,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
  keyframes: [],
};

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeTransformEasing(value: unknown, fallback: TransformEasing = 'linear'): TransformEasing {
  if (typeof value !== 'string') return fallback;
  return (VALID_EASINGS as string[]).includes(value) ? (value as TransformEasing) : fallback;
}

function resolveEasingForProperty(
  keyframe: TransformKeyframe,
  property: TransformKeyframeProperty,
  segmentEasing: TransformEasing,
): TransformEasing {
  const override = keyframe.easingOverrides?.[property];
  return normalizeTransformEasing(override, segmentEasing);
}

export function applyTransformEasing(t: number, easing: TransformEasing): number {
  switch (easing) {
    case 'ease-in':
      return t * t;
    case 'ease-out':
      return t * (2 - t);
    case 'ease-in-out':
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    default:
      return t;
  }
}

export function resolveTransformAtTime(
  transform: ClipTransform | undefined,
  normalizedTime: number,
): TransformKeyframe {
  const source = transform ?? DEFAULT_CLIP_TRANSFORM;
  const base: TransformKeyframe = {
    time: clamp01(normalizedTime),
    x: source.x,
    y: source.y,
    scaleX: source.scaleX,
    scaleY: source.scaleY,
    rotation: source.rotation,
    opacity: source.opacity,
    easing: 'linear',
  };

  if (!source.keyframes || source.keyframes.length === 0) return base;

  const keyframes = [...source.keyframes].sort((a, b) => a.time - b.time);
  const time = clamp01(normalizedTime);

  if (time <= keyframes[0].time) return { ...keyframes[0] };
  if (time >= keyframes[keyframes.length - 1].time) return { ...keyframes[keyframes.length - 1] };

  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (time >= a.time && time <= b.time) {
      const progress = (time - a.time) / Math.max(0.000001, b.time - a.time);
      const segmentEasing = normalizeTransformEasing(b.easing, 'linear');
      const easedX = applyTransformEasing(progress, resolveEasingForProperty(b, 'x', segmentEasing));
      const easedY = applyTransformEasing(progress, resolveEasingForProperty(b, 'y', segmentEasing));
      const easedScaleX = applyTransformEasing(progress, resolveEasingForProperty(b, 'scaleX', segmentEasing));
      const easedScaleY = applyTransformEasing(progress, resolveEasingForProperty(b, 'scaleY', segmentEasing));
      const easedRotation = applyTransformEasing(progress, resolveEasingForProperty(b, 'rotation', segmentEasing));
      const easedOpacity = applyTransformEasing(progress, resolveEasingForProperty(b, 'opacity', segmentEasing));
      return {
        time,
        x: a.x + (b.x - a.x) * easedX,
        y: a.y + (b.y - a.y) * easedY,
        scaleX: a.scaleX + (b.scaleX - a.scaleX) * easedScaleX,
        scaleY: a.scaleY + (b.scaleY - a.scaleY) * easedScaleY,
        rotation: a.rotation + (b.rotation - a.rotation) * easedRotation,
        opacity: a.opacity + (b.opacity - a.opacity) * easedOpacity,
        easing: segmentEasing,
        ...(b.easingOverrides ? { easingOverrides: { ...b.easingOverrides } } : {}),
      };
    }
  }

  return base;
}

export function upsertTransformKeyframe(
  transform: ClipTransform | undefined,
  normalizedTime: number,
  updates: Partial<TransformKeyframe>,
  epsilon = 0.01,
): ClipTransform {
  const source = transform ?? DEFAULT_CLIP_TRANSFORM;
  const time = clamp01(normalizedTime);
  const keyframes = [...(source.keyframes || [])].sort((a, b) => a.time - b.time);
  const existingIndex = keyframes.findIndex((kf) => Math.abs(kf.time - time) <= epsilon);

  if (existingIndex >= 0) {
    keyframes[existingIndex] = {
      ...keyframes[existingIndex],
      ...updates,
      time: clamp01(updates.time ?? keyframes[existingIndex].time),
    };
  } else {
    const base = resolveTransformAtTime(source, time);
    keyframes.push({
      ...base,
      ...updates,
      time: clamp01(updates.time ?? time),
    });
  }

  keyframes.sort((a, b) => a.time - b.time);

  return {
    ...source,
    keyframes,
  };
}

export function removeTransformKeyframe(
  transform: ClipTransform | undefined,
  normalizedTime: number,
  epsilon = 0.01,
): ClipTransform {
  const source = transform ?? DEFAULT_CLIP_TRANSFORM;
  const time = clamp01(normalizedTime);
  const keyframes = [...(source.keyframes || [])]
    .filter((kf) => Math.abs(kf.time - time) > epsilon)
    .sort((a, b) => a.time - b.time);

  return {
    ...source,
    keyframes,
  };
}
