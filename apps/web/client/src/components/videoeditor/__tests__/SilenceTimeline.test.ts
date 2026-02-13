import { describe, it, expect } from 'vitest';

// Import the pure helper functions from SilenceTimeline.tsx
import {
  getTickInterval,
  computeVisibleRange,
  computeCanvasWidth,
} from '../SilenceTimeline';

// ========================================
// Helper: getTickInterval(pixelsPerSecond)
// ========================================

describe('getTickInterval', () => {
  it('at 50 px/s, tick interval is 10 seconds', () => {
    expect(getTickInterval(50)).toBe(10);
  });

  it('at 74 px/s, tick interval is 10 seconds', () => {
    expect(getTickInterval(74)).toBe(10);
  });

  it('at 75 px/s, tick interval is 5 seconds', () => {
    expect(getTickInterval(75)).toBe(5);
  });

  it('at 100 px/s, tick interval is 5 seconds', () => {
    expect(getTickInterval(100)).toBe(5);
  });

  it('at 149 px/s, tick interval is 5 seconds', () => {
    expect(getTickInterval(149)).toBe(5);
  });

  it('at 150 px/s, tick interval is 2 seconds', () => {
    expect(getTickInterval(150)).toBe(2);
  });

  it('at 200 px/s, tick interval is 2 seconds', () => {
    expect(getTickInterval(200)).toBe(2);
  });

  it('at 299 px/s, tick interval is 2 seconds', () => {
    expect(getTickInterval(299)).toBe(2);
  });

  it('at 300 px/s, tick interval is 1 second', () => {
    expect(getTickInterval(300)).toBe(1);
  });

  it('at 500 px/s, tick interval is 1 second', () => {
    expect(getTickInterval(500)).toBe(1);
  });
});

// ========================================
// Helper: computeVisibleRange(scrollLeft, viewportWidth, pixelsPerSecond, duration, bufferPx)
// ========================================

describe('computeVisibleRange', () => {
  it('returns start and end time for the visible viewport', () => {
    // scrollLeft=1000, viewport=800, pps=100, duration=60s
    // No buffer: visible start = 1000/100 = 10s, end = (1000+800)/100 = 18s
    const result = computeVisibleRange(1000, 800, 100, 60, 0);
    expect(result.startTime).toBe(10);
    expect(result.endTime).toBe(18);
  });

  it('includes buffer zone on each side', () => {
    // scrollLeft=1000, viewport=800, pps=100, buffer=500px
    // start = (1000-500)/100 = 5s, end = (1000+800+500)/100 = 23s
    const result = computeVisibleRange(1000, 800, 100, 60, 500);
    expect(result.startTime).toBe(5);
    expect(result.endTime).toBe(23);
  });

  it('clamps startTime to >= 0', () => {
    // scrollLeft=200, viewport=800, pps=100, buffer=500px
    // start = (200-500)/100 = -3s -> should clamp to 0
    const result = computeVisibleRange(200, 800, 100, 60, 500);
    expect(result.startTime).toBe(0);
    expect(result.endTime).toBe(15); // (200+800+500)/100 = 15s
  });

  it('clamps endTime to <= duration', () => {
    // scrollLeft=5000, viewport=800, pps=100, duration=60s, buffer=500px
    // end = (5000+800+500)/100 = 63s -> should clamp to 60s
    const result = computeVisibleRange(5000, 800, 100, 60, 500);
    expect(result.startTime).toBe(45); // (5000-500)/100 = 45s
    expect(result.endTime).toBe(60);
  });

  it('when fully zoomed out (entire timeline fits in viewport), returns full duration', () => {
    // Duration=60s, pps=50, total width = 3000px
    // Viewport=4000px (wider than timeline), scrollLeft=0
    const result = computeVisibleRange(0, 4000, 50, 60, 500);
    expect(result.startTime).toBe(0);
    expect(result.endTime).toBe(60);
  });

  it('uses default buffer of 500px when not specified', () => {
    // Test with undefined buffer
    const result = computeVisibleRange(1000, 800, 100, 60);
    // Should use default buffer=500
    expect(result.startTime).toBe(5);
    expect(result.endTime).toBe(23);
  });
});

// ========================================
// Helper: computeCanvasWidth(startTime, endTime, pixelsPerSecond, maxCanvasWidth)
// ========================================

describe('computeCanvasWidth', () => {
  it('canvas width = (endTime - startTime) * pixelsPerSecond for normal ranges', () => {
    const width = computeCanvasWidth(10, 20, 100);
    expect(width).toBe(1000); // 10s * 100 px/s = 1000px
  });

  it('canvas width does not exceed maxCanvasWidth', () => {
    // 100s range at 500 px/s = 50,000px, but max is 16,384px
    const width = computeCanvasWidth(0, 100, 500, 16384);
    expect(width).toBe(16384);
  });

  it('for a 30-min video at 500 px/s (full width), logical width is 900,000 but canvas is capped', () => {
    // 30 min = 1800s, at 500 px/s = 900,000px
    const width = computeCanvasWidth(0, 1800, 500, 16384);
    expect(width).toBe(16384);
  });

  it('small ranges do not get capped', () => {
    // 5s at 200 px/s = 1000px (well under limit)
    const width = computeCanvasWidth(5, 10, 200, 16384);
    expect(width).toBe(1000);
  });

  it('uses default maxCanvasWidth of 16384 when not specified', () => {
    // Large range that would exceed default max
    const width = computeCanvasWidth(0, 1000, 500);
    expect(width).toBe(16384);
  });

  it('returns 0 when startTime >= endTime', () => {
    const width = computeCanvasWidth(20, 10, 100);
    expect(width).toBe(0);
  });
});
