import type { ClipTransform, TransformKeyframe } from '../../types/videoEditor';

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

export function applyTransformEasing(t: number, easing: string): number {
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
      const eased = applyTransformEasing(progress, b.easing || 'linear');
      return {
        time,
        x: a.x + (b.x - a.x) * eased,
        y: a.y + (b.y - a.y) * eased,
        scaleX: a.scaleX + (b.scaleX - a.scaleX) * eased,
        scaleY: a.scaleY + (b.scaleY - a.scaleY) * eased,
        rotation: a.rotation + (b.rotation - a.rotation) * eased,
        opacity: a.opacity + (b.opacity - a.opacity) * eased,
        easing: b.easing || 'linear',
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
