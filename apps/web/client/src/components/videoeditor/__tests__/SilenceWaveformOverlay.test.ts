import { describe, it, expect } from 'vitest';

// Import the pure helper functions extracted from SilenceWaveformOverlay.tsx
// These are exported for testability alongside the React component.
import {
  timeToPixel,
  pixelToTime,
  hitTestRegion,
} from '../SilenceWaveformOverlay';

import type { SilentRegion } from '../../../types/videoEditor';

// ---- Canvas dimension tests ----

describe('timeToPixel', () => {
  it('converts time to correct pixel position given duration and canvas width', () => {
    // Halfway through a 10s clip on 800px canvas
    expect(timeToPixel(5, 10, 800)).toBe(400);

    // Quarter way through
    expect(timeToPixel(2.5, 10, 800)).toBe(200);

    // Three quarters
    expect(timeToPixel(7.5, 10, 800)).toBe(600);
  });

  it('returns 0 for time=0', () => {
    expect(timeToPixel(0, 10, 800)).toBe(0);
  });

  it('returns canvasWidth for time=duration', () => {
    expect(timeToPixel(10, 10, 800)).toBe(800);
  });

  it('handles pixelsPerSecond override (used when timeline zoom is active)', () => {
    // With 100 pixels per second, 5 seconds = 500 pixels
    expect(timeToPixel(5, 10, 800, 100)).toBe(500);

    // Duration is ignored when pixelsPerSecond is provided
    expect(timeToPixel(3, 10, 800, 50)).toBe(150);
  });

  it('handles duration === 0 safely', () => {
    expect(timeToPixel(0, 0, 800)).toBe(0);
    expect(timeToPixel(5, 0, 800)).toBe(0);
  });
});

describe('pixelToTime', () => {
  it('converts pixel X position back to time', () => {
    // Halfway through canvas = halfway through duration
    expect(pixelToTime(400, 10, 800)).toBe(5.0);

    // Quarter way
    expect(pixelToTime(200, 10, 800)).toBe(2.5);
  });

  it('clamps result to [0, duration]', () => {
    // Negative pixel position
    expect(pixelToTime(-100, 10, 800)).toBe(0);

    // Beyond canvas width
    expect(pixelToTime(1000, 10, 800)).toBe(10);
  });

  it('handles pixelsPerSecond override', () => {
    // With 100 pixels per second, 500 pixels = 5 seconds
    expect(pixelToTime(500, 10, 800, 100)).toBe(5);

    // Duration is used for clamping even with pixelsPerSecond
    expect(pixelToTime(1500, 10, 800, 100)).toBe(10);
  });

  it('handles zero canvas width safely', () => {
    expect(pixelToTime(100, 10, 0)).toBe(0);
  });
});

describe('hitTestRegion', () => {
  const createRegion = (id: string, start: number, end: number, selected = false, skipped = false): SilentRegion => ({
    id,
    startTime: start,
    endTime: end,
    duration: end - start,
    adjustedStartTime: start,
    adjustedEndTime: end,
    adjustedDuration: end - start,
    selected,
    skipped,
  });

  const canvasRect: DOMRect = {
    left: 0,
    top: 0,
    right: 800,
    bottom: 100,
    width: 800,
    height: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };

  it('returns regionId when click X falls within a region\'s time range', () => {
    const regions = [
      createRegion('region-1', 2.0, 5.0),
    ];

    // 10s duration, 800px canvas: click at x=280 = time 3.5s
    // Region is 2.0-5.0s, so this should hit
    const result = hitTestRegion(280, canvasRect, regions, 10, 800);
    expect(result).toBe('region-1');
  });

  it('returns null when click X is outside all regions', () => {
    const regions = [
      createRegion('region-1', 2.0, 5.0),
    ];

    // Click at x=80 = time 1.0s (before region starts at 2.0s)
    expect(hitTestRegion(80, canvasRect, regions, 10, 800)).toBeNull();

    // Click at x=560 = time 7.0s (after region ends at 5.0s)
    expect(hitTestRegion(560, canvasRect, regions, 10, 800)).toBeNull();
  });

  it('prefers the narrowest (most specific) region when regions overlap', () => {
    const regions = [
      createRegion('wide-region', 2.0, 8.0),    // 6s duration
      createRegion('narrow-region', 3.0, 4.0), // 1s duration
    ];

    // Click at x=280 = time 3.5s (falls in both regions)
    // Should return the narrower region
    const result = hitTestRegion(280, canvasRect, regions, 10, 800);
    expect(result).toBe('narrow-region');
  });

  it('skipped regions are excluded from hit testing (click passes through)', () => {
    const regions = [
      createRegion('skipped-region', 2.0, 5.0, false, true),
      createRegion('active-region', 3.0, 6.0, false, false),
    ];

    // Click at x=200 = time 2.5s (only in skipped region)
    // Should return null since skipped regions don't register hits
    expect(hitTestRegion(200, canvasRect, regions, 10, 800)).toBeNull();

    // Click at x=280 = time 3.5s (in both, but skipped is ignored)
    // Should return active-region
    expect(hitTestRegion(280, canvasRect, regions, 10, 800)).toBe('active-region');
  });

  it('handles canvas rect offset', () => {
    const offsetRect: DOMRect = {
      left: 100,
      top: 50,
      right: 900,
      bottom: 150,
      width: 800,
      height: 100,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    };

    const regions = [
      createRegion('region-1', 2.0, 5.0),
    ];

    // ClientX=380, but canvas starts at left=100, so relative x=280 = time 3.5s
    const result = hitTestRegion(380, offsetRect, regions, 10, 800);
    expect(result).toBe('region-1');
  });

  it('handles pixelsPerSecond zoom mode', () => {
    const regions = [
      createRegion('region-1', 2.0, 5.0),
    ];

    // With 100 pixels per second: region 2.0-5.0s = pixels 200-500
    // Click at x=300 = time 3.0s (within region)
    const result = hitTestRegion(300, canvasRect, regions, 10, 800, 100);
    expect(result).toBe('region-1');
  });
});
