/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLIP_TRANSFORM,
  removeTransformKeyframe,
  resolveTransformAtTime,
  upsertTransformKeyframe,
} from '../transformKeyframes';

describe('transformKeyframes utilities', () => {
  it('interpolates between two keyframes', () => {
    const transform = {
      ...DEFAULT_CLIP_TRANSFORM,
      keyframes: [
        { time: 0, x: 0.2, y: 0.3, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, easing: 'linear' as const },
        { time: 1, x: 0.8, y: 0.7, scaleX: 2, scaleY: 2, rotation: 20, opacity: 0.5, easing: 'linear' as const },
      ],
    };

    const result = resolveTransformAtTime(transform, 0.5);
    expect(result.x).toBeCloseTo(0.5, 5);
    expect(result.y).toBeCloseTo(0.5, 5);
    expect(result.scaleX).toBeCloseTo(1.5, 5);
    expect(result.opacity).toBeCloseTo(0.75, 5);
  });

  it('creates an in-between keyframe from interpolated values', () => {
    const transform = {
      ...DEFAULT_CLIP_TRANSFORM,
      keyframes: [
        { time: 0, x: 0.1, y: 0.1, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, easing: 'linear' as const },
        { time: 1, x: 0.9, y: 0.9, scaleX: 2, scaleY: 2, rotation: 0, opacity: 1, easing: 'linear' as const },
      ],
    };

    const updated = upsertTransformKeyframe(transform, 0.5, { scaleX: 1.6, scaleY: 1.6 });
    expect(updated.keyframes).toHaveLength(3);
    const mid = updated.keyframes?.find((kf) => Math.abs(kf.time - 0.5) < 0.0001);
    expect(mid).toBeTruthy();
    expect(mid?.x).toBeCloseTo(0.5, 5);
    expect(mid?.y).toBeCloseTo(0.5, 5);
    expect(mid?.scaleX).toBeCloseTo(1.6, 5);
    expect(mid?.scaleY).toBeCloseTo(1.6, 5);
  });

  it('updates existing keyframe at the same time instead of duplicating', () => {
    const transform = {
      ...DEFAULT_CLIP_TRANSFORM,
      keyframes: [
        { time: 0.25, x: 0.3, y: 0.3, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, easing: 'linear' as const },
      ],
    };

    const updated = upsertTransformKeyframe(transform, 0.251, { x: 0.45 }, 0.01);
    expect(updated.keyframes).toHaveLength(1);
    expect(updated.keyframes?.[0].x).toBeCloseTo(0.45, 5);
  });

  it('removes only the keyframe at the requested time', () => {
    const transform = {
      ...DEFAULT_CLIP_TRANSFORM,
      keyframes: [
        { time: 0.1, x: 0.2, y: 0.2, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, easing: 'linear' as const },
        { time: 0.5, x: 0.6, y: 0.6, scaleX: 1.6, scaleY: 1.6, rotation: 0, opacity: 1, easing: 'linear' as const },
        { time: 0.9, x: 0.8, y: 0.8, scaleX: 2, scaleY: 2, rotation: 0, opacity: 1, easing: 'linear' as const },
      ],
    };

    const updated = removeTransformKeyframe(transform, 0.5, 0.01);
    expect(updated.keyframes).toHaveLength(2);
    expect(updated.keyframes?.some((kf) => Math.abs(kf.time - 0.5) <= 0.01)).toBe(false);
    expect(updated.keyframes?.[0].time).toBeCloseTo(0.1, 5);
    expect(updated.keyframes?.[1].time).toBeCloseTo(0.9, 5);
  });

  it('applies per-property easing overrides when present', () => {
    const transform = {
      ...DEFAULT_CLIP_TRANSFORM,
      keyframes: [
        { time: 0, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 0, easing: 'linear' as const },
        {
          time: 1,
          x: 1,
          y: 1,
          scaleX: 3,
          scaleY: 3,
          rotation: 100,
          opacity: 1,
          easing: 'linear' as const,
          easingOverrides: {
            x: 'ease-in' as const,
            y: 'ease-out' as const,
          },
        },
      ],
    };

    const result = resolveTransformAtTime(transform, 0.5);
    expect(result.x).toBeCloseTo(0.25, 5);
    expect(result.y).toBeCloseTo(0.75, 5);
    expect(result.scaleX).toBeCloseTo(2, 5);
    expect(result.scaleY).toBeCloseTo(2, 5);
    expect(result.rotation).toBeCloseTo(50, 5);
    expect(result.opacity).toBeCloseTo(0.5, 5);
  });

  it('falls back to segment easing when per-property override is absent', () => {
    const transform = {
      ...DEFAULT_CLIP_TRANSFORM,
      keyframes: [
        { time: 0, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 0, easing: 'linear' as const },
        {
          time: 1,
          x: 1,
          y: 1,
          scaleX: 3,
          scaleY: 3,
          rotation: 100,
          opacity: 1,
          easing: 'ease-in-out' as const,
          easingOverrides: {
            x: 'ease-out' as const,
          },
        },
      ],
    };

    const result = resolveTransformAtTime(transform, 0.5);
    expect(result.x).toBeCloseTo(0.75, 5);
    expect(result.y).toBeCloseTo(0.5, 5);
    expect(result.scaleX).toBeCloseTo(2, 5);
    expect(result.rotation).toBeCloseTo(50, 5);
  });
});
