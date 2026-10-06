diff --git a/apps/web/client/src/components/videoeditor/SilenceWaveformOverlay.tsx b/apps/web/client/src/components/videoeditor/SilenceWaveformOverlay.tsx
new file mode 100644
index 0000000..579584d
--- /dev/null
+++ b/apps/web/client/src/components/videoeditor/SilenceWaveformOverlay.tsx
@@ -0,0 +1,378 @@
+import React, { useRef, useEffect } from 'react';
+import type { SilentRegion } from '../../types/videoEditor';
+
+// ============================================================================
+// Pure Helper Functions (exported for testability)
+// ============================================================================
+
+/**
+ * Converts a time value to a pixel X position on the canvas.
+ *
+ * @param time - Time in seconds
+ * @param duration - Total duration of the media in seconds
+ * @param canvasWidth - Logical canvas width in pixels
+ * @param pixelsPerSecond - Optional zoom factor (overrides duration-based calculation)
+ * @returns Pixel X position
+ */
+export function timeToPixel(
+  time: number,
+  duration: number,
+  canvasWidth: number,
+  pixelsPerSecond?: number
+): number {
+  if (pixelsPerSecond !== undefined) {
+    return time * pixelsPerSecond;
+  }
+
+  if (duration === 0) {
+    return 0;
+  }
+
+  return (time / duration) * canvasWidth;
+}
+
+/**
+ * Converts a pixel X position to a time value.
+ *
+ * @param pixelX - Pixel X position on canvas
+ * @param duration - Total duration of the media in seconds
+ * @param canvasWidth - Logical canvas width in pixels
+ * @param pixelsPerSecond - Optional zoom factor
+ * @returns Time in seconds, clamped to [0, duration]
+ */
+export function pixelToTime(
+  pixelX: number,
+  duration: number,
+  canvasWidth: number,
+  pixelsPerSecond?: number
+): number {
+  let time: number;
+
+  if (pixelsPerSecond !== undefined) {
+    time = pixelX / pixelsPerSecond;
+  } else if (canvasWidth === 0) {
+    time = 0;
+  } else {
+    time = (pixelX / canvasWidth) * duration;
+  }
+
+  // Clamp to valid range
+  return Math.max(0, Math.min(duration, time));
+}
+
+/**
+ * Performs hit testing to find which region (if any) was clicked.
+ *
+ * @param clientX - Mouse X position in client coordinates
+ * @param canvasRect - Canvas bounding rectangle
+ * @param regions - Array of silent regions
+ * @param duration - Total duration of the media in seconds
+ * @param canvasWidth - Logical canvas width in pixels
+ * @param pixelsPerSecond - Optional zoom factor
+ * @returns Region ID if hit, null otherwise
+ */
+export function hitTestRegion(
+  clientX: number,
+  canvasRect: DOMRect,
+  regions: SilentRegion[],
+  duration: number,
+  canvasWidth: number,
+  pixelsPerSecond?: number
+): string | null {
+  // Convert client coordinates to canvas-relative position
+  const x = clientX - canvasRect.left;
+
+  // Convert pixel position to time
+  const time = pixelToTime(x, duration, canvasWidth, pixelsPerSecond);
+
+  // Filter to non-skipped regions that contain this time
+  const hits = regions
+    .filter(region => !region.skipped)
+    .filter(region =>
+      time >= region.adjustedStartTime &&
+      time <= region.adjustedEndTime
+    );
+
+  if (hits.length === 0) {
+    return null;
+  }
+
+  // Prefer narrowest region if there are overlaps
+  const narrowest = hits.reduce((prev, curr) =>
+    curr.adjustedDuration < prev.adjustedDuration ? curr : prev
+  );
+
+  return narrowest.id;
+}
+
+// ============================================================================
+// Component Props
+// ============================================================================
+
+interface SilenceWaveformOverlayProps {
+  /** Array of silent regions (from Section 01 types, with adjusted bounds) */
+  regions: SilentRegion[];
+  /** Total duration of the media in seconds */
+  duration: number;
+  /** Current playback time in seconds (drives playhead position) */
+  currentTime: number;
+  /** Logical width of the canvas in CSS pixels (provided by parent) */
+  width: number;
+  /** Logical height of the canvas in CSS pixels (provided by parent) */
+  height: number;
+  /** Optional pixels-per-second for zoomed timeline (used by SilenceTimeline in Section 06) */
+  pixelsPerSecond?: number;
+  /** Called when user clicks on a region -- parent toggles selection */
+  onRegionClick: (regionId: string) => void;
+  /** Called when user clicks empty space -- parent seeks playback to this time */
+  onSeek: (time: number) => void;
+  /** Optional hover callback for tooltip display */
+  onRegionHover?: (regionId: string | null) => void;
+}
+
+// ============================================================================
+// Helper: Create hatched pattern for skipped regions
+// ============================================================================
+
+function createHatchPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
+  // Create an offscreen canvas for the pattern
+  const patternCanvas = document.createElement('canvas');
+  patternCanvas.width = 10;
+  patternCanvas.height = 10;
+
+  const patternCtx = patternCanvas.getContext('2d');
+  if (!patternCtx) return null;
+
+  // Draw diagonal stripes
+  patternCtx.strokeStyle = 'rgba(128, 128, 128, 0.3)';
+  patternCtx.lineWidth = 1;
+  patternCtx.beginPath();
+  patternCtx.moveTo(0, 10);
+  patternCtx.lineTo(10, 0);
+  patternCtx.stroke();
+
+  return ctx.createPattern(patternCanvas, 'repeat');
+}
+
+// ============================================================================
+// Main Component
+// ============================================================================
+
+function SilenceWaveformOverlayInner(props: SilenceWaveformOverlayProps) {
+  const {
+    regions,
+    duration,
+    currentTime,
+    width,
+    height,
+    pixelsPerSecond,
+    onRegionClick,
+    onSeek,
+    onRegionHover,
+  } = props;
+
+  // Two canvas refs: one for regions, one for playhead
+  const regionsCanvasRef = useRef<HTMLCanvasElement>(null);
+  const playheadCanvasRef = useRef<HTMLCanvasElement>(null);
+
+  // Track animation frame for playhead
+  const rafIdRef = useRef<number | null>(null);
+
+  // Track last hovered region to avoid excessive callbacks
+  const lastHoveredRef = useRef<string | null>(null);
+
+  // ---- Draw regions canvas (only when regions/dimensions change) ----
+
+  useEffect(() => {
+    const canvas = regionsCanvasRef.current;
+    if (!canvas) return;
+
+    const ctx = canvas.getContext('2d');
+    if (!ctx) return;
+
+    // Apply devicePixelRatio scaling for crisp rendering
+    const dpr = window.devicePixelRatio || 1;
+    canvas.width = width * dpr;
+    canvas.height = height * dpr;
+    canvas.style.width = `${width}px`;
+    canvas.style.height = `${height}px`;
+    ctx.scale(dpr, dpr);
+
+    // Clear canvas with transparent background
+    ctx.clearRect(0, 0, width, height);
+
+    // Create hatch pattern once for skipped regions
+    const hatchPattern = createHatchPattern(ctx);
+
+    // Draw each region
+    for (const region of regions) {
+      const x = timeToPixel(region.adjustedStartTime, duration, width, pixelsPerSecond);
+      const endX = timeToPixel(region.adjustedEndTime, duration, width, pixelsPerSecond);
+      const regionWidth = endX - x;
+
+      if (region.skipped) {
+        // Draw hatched pattern
+        if (hatchPattern) {
+          ctx.fillStyle = hatchPattern;
+          ctx.fillRect(x, 0, regionWidth, height);
+        }
+      } else if (region.selected) {
+        // Draw selected region: semi-transparent red with dashed cyan border
+        ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
+        ctx.fillRect(x, 0, regionWidth, height);
+
+        ctx.strokeStyle = 'cyan';
+        ctx.lineWidth = 1.5;
+        ctx.setLineDash([4, 4]);
+        ctx.strokeRect(x, 0, regionWidth, height);
+        ctx.setLineDash([]); // Reset
+      } else {
+        // Draw deselected region: lower opacity red
+        ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
+        ctx.fillRect(x, 0, regionWidth, height);
+      }
+    }
+  }, [regions, duration, width, height, pixelsPerSecond]);
+
+  // ---- Draw playhead canvas (animates with currentTime) ----
+
+  useEffect(() => {
+    const canvas = playheadCanvasRef.current;
+    if (!canvas) return;
+
+    const ctx = canvas.getContext('2d');
+    if (!ctx) return;
+
+    // Apply devicePixelRatio scaling
+    const dpr = window.devicePixelRatio || 1;
+    canvas.width = width * dpr;
+    canvas.height = height * dpr;
+    canvas.style.width = `${width}px`;
+    canvas.style.height = `${height}px`;
+    ctx.scale(dpr, dpr);
+
+    // Animation loop for smooth playhead
+    const drawPlayhead = () => {
+      // Clear previous frame
+      ctx.clearRect(0, 0, width, height);
+
+      // Draw playhead line
+      const x = timeToPixel(currentTime, duration, width, pixelsPerSecond);
+      ctx.strokeStyle = '#ff3333';
+      ctx.lineWidth = 2;
+      ctx.beginPath();
+      ctx.moveTo(x, 0);
+      ctx.lineTo(x, height);
+      ctx.stroke();
+
+      // Continue animation
+      rafIdRef.current = requestAnimationFrame(drawPlayhead);
+    };
+
+    // Start animation
+    drawPlayhead();
+
+    // Cleanup
+    return () => {
+      if (rafIdRef.current !== null) {
+        cancelAnimationFrame(rafIdRef.current);
+        rafIdRef.current = null;
+      }
+    };
+  }, [currentTime, duration, width, height, pixelsPerSecond]);
+
+  // ---- Click handler ----
+
+  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
+    const canvas = playheadCanvasRef.current;
+    if (!canvas) return;
+
+    const rect = canvas.getBoundingClientRect();
+    const regionId = hitTestRegion(
+      e.clientX,
+      rect,
+      regions,
+      duration,
+      width,
+      pixelsPerSecond
+    );
+
+    if (regionId) {
+      onRegionClick(regionId);
+    } else {
+      const x = e.clientX - rect.left;
+      const time = pixelToTime(x, duration, width, pixelsPerSecond);
+      onSeek(time);
+    }
+  };
+
+  // ---- Hover handler ----
+
+  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
+    if (!onRegionHover) return;
+
+    const canvas = playheadCanvasRef.current;
+    if (!canvas) return;
+
+    const rect = canvas.getBoundingClientRect();
+    const regionId = hitTestRegion(
+      e.clientX,
+      rect,
+      regions,
+      duration,
+      width,
+      pixelsPerSecond
+    );
+
+    // Update cursor
+    canvas.style.cursor = regionId ? 'pointer' : 'crosshair';
+
+    // Only call callback if hovered region changed
+    if (regionId !== lastHoveredRef.current) {
+      lastHoveredRef.current = regionId;
+      onRegionHover(regionId);
+    }
+  };
+
+  // ---- Render ----
+
+  return (
+    <div
+      style={{
+        position: 'absolute',
+        top: 0,
+        left: 0,
+        width: '100%',
+        height: '100%',
+        pointerEvents: 'auto',
+      }}
+    >
+      <canvas
+        ref={regionsCanvasRef}
+        style={{
+          position: 'absolute',
+          top: 0,
+          left: 0,
+          width: '100%',
+          height: '100%',
+        }}
+      />
+      <canvas
+        ref={playheadCanvasRef}
+        onClick={handleCanvasClick}
+        onMouseMove={handleMouseMove}
+        style={{
+          position: 'absolute',
+          top: 0,
+          left: 0,
+          width: '100%',
+          height: '100%',
+          cursor: 'crosshair',
+        }}
+      />
+    </div>
+  );
+}
+
+// Wrap in React.memo for performance optimization
+export default React.memo(SilenceWaveformOverlayInner);
diff --git a/apps/web/client/src/components/videoeditor/__tests__/SilenceWaveformOverlay.test.ts b/apps/web/client/src/components/videoeditor/__tests__/SilenceWaveformOverlay.test.ts
new file mode 100644
index 0000000..d2c8809
--- /dev/null
+++ b/apps/web/client/src/components/videoeditor/__tests__/SilenceWaveformOverlay.test.ts
@@ -0,0 +1,186 @@
+import { describe, it, expect } from 'vitest';
+
+// Import the pure helper functions extracted from SilenceWaveformOverlay.tsx
+// These are exported for testability alongside the React component.
+import {
+  timeToPixel,
+  pixelToTime,
+  hitTestRegion,
+} from '../SilenceWaveformOverlay';
+
+import type { SilentRegion } from '../../../types/videoEditor';
+
+// ---- Canvas dimension tests ----
+
+describe('timeToPixel', () => {
+  it('converts time to correct pixel position given duration and canvas width', () => {
+    // Halfway through a 10s clip on 800px canvas
+    expect(timeToPixel(5, 10, 800)).toBe(400);
+
+    // Quarter way through
+    expect(timeToPixel(2.5, 10, 800)).toBe(200);
+
+    // Three quarters
+    expect(timeToPixel(7.5, 10, 800)).toBe(600);
+  });
+
+  it('returns 0 for time=0', () => {
+    expect(timeToPixel(0, 10, 800)).toBe(0);
+  });
+
+  it('returns canvasWidth for time=duration', () => {
+    expect(timeToPixel(10, 10, 800)).toBe(800);
+  });
+
+  it('handles pixelsPerSecond override (used when timeline zoom is active)', () => {
+    // With 100 pixels per second, 5 seconds = 500 pixels
+    expect(timeToPixel(5, 10, 800, 100)).toBe(500);
+
+    // Duration is ignored when pixelsPerSecond is provided
+    expect(timeToPixel(3, 10, 800, 50)).toBe(150);
+  });
+
+  it('handles duration === 0 safely', () => {
+    expect(timeToPixel(0, 0, 800)).toBe(0);
+    expect(timeToPixel(5, 0, 800)).toBe(0);
+  });
+});
+
+describe('pixelToTime', () => {
+  it('converts pixel X position back to time', () => {
+    // Halfway through canvas = halfway through duration
+    expect(pixelToTime(400, 10, 800)).toBe(5.0);
+
+    // Quarter way
+    expect(pixelToTime(200, 10, 800)).toBe(2.5);
+  });
+
+  it('clamps result to [0, duration]', () => {
+    // Negative pixel position
+    expect(pixelToTime(-100, 10, 800)).toBe(0);
+
+    // Beyond canvas width
+    expect(pixelToTime(1000, 10, 800)).toBe(10);
+  });
+
+  it('handles pixelsPerSecond override', () => {
+    // With 100 pixels per second, 500 pixels = 5 seconds
+    expect(pixelToTime(500, 10, 800, 100)).toBe(5);
+
+    // Duration is used for clamping even with pixelsPerSecond
+    expect(pixelToTime(1500, 10, 800, 100)).toBe(10);
+  });
+
+  it('handles zero canvas width safely', () => {
+    expect(pixelToTime(100, 10, 0)).toBe(0);
+  });
+});
+
+describe('hitTestRegion', () => {
+  const createRegion = (id: string, start: number, end: number, selected = false, skipped = false): SilentRegion => ({
+    id,
+    startTime: start,
+    endTime: end,
+    duration: end - start,
+    adjustedStartTime: start,
+    adjustedEndTime: end,
+    adjustedDuration: end - start,
+    selected,
+    skipped,
+  });
+
+  const canvasRect: DOMRect = {
+    left: 0,
+    top: 0,
+    right: 800,
+    bottom: 100,
+    width: 800,
+    height: 100,
+    x: 0,
+    y: 0,
+    toJSON: () => ({}),
+  };
+
+  it('returns regionId when click X falls within a region\'s time range', () => {
+    const regions = [
+      createRegion('region-1', 2.0, 5.0),
+    ];
+
+    // 10s duration, 800px canvas: click at x=280 = time 3.5s
+    // Region is 2.0-5.0s, so this should hit
+    const result = hitTestRegion(280, canvasRect, regions, 10, 800);
+    expect(result).toBe('region-1');
+  });
+
+  it('returns null when click X is outside all regions', () => {
+    const regions = [
+      createRegion('region-1', 2.0, 5.0),
+    ];
+
+    // Click at x=80 = time 1.0s (before region starts at 2.0s)
+    expect(hitTestRegion(80, canvasRect, regions, 10, 800)).toBeNull();
+
+    // Click at x=560 = time 7.0s (after region ends at 5.0s)
+    expect(hitTestRegion(560, canvasRect, regions, 10, 800)).toBeNull();
+  });
+
+  it('prefers the narrowest (most specific) region when regions overlap', () => {
+    const regions = [
+      createRegion('wide-region', 2.0, 8.0),    // 6s duration
+      createRegion('narrow-region', 3.0, 4.0), // 1s duration
+    ];
+
+    // Click at x=280 = time 3.5s (falls in both regions)
+    // Should return the narrower region
+    const result = hitTestRegion(280, canvasRect, regions, 10, 800);
+    expect(result).toBe('narrow-region');
+  });
+
+  it('skipped regions are excluded from hit testing (click passes through)', () => {
+    const regions = [
+      createRegion('skipped-region', 2.0, 5.0, false, true),
+      createRegion('active-region', 3.0, 6.0, false, false),
+    ];
+
+    // Click at x=200 = time 2.5s (only in skipped region)
+    // Should return null since skipped regions don't register hits
+    expect(hitTestRegion(200, canvasRect, regions, 10, 800)).toBeNull();
+
+    // Click at x=280 = time 3.5s (in both, but skipped is ignored)
+    // Should return active-region
+    expect(hitTestRegion(280, canvasRect, regions, 10, 800)).toBe('active-region');
+  });
+
+  it('handles canvas rect offset', () => {
+    const offsetRect: DOMRect = {
+      left: 100,
+      top: 50,
+      right: 900,
+      bottom: 150,
+      width: 800,
+      height: 100,
+      x: 100,
+      y: 50,
+      toJSON: () => ({}),
+    };
+
+    const regions = [
+      createRegion('region-1', 2.0, 5.0),
+    ];
+
+    // ClientX=380, but canvas starts at left=100, so relative x=280 = time 3.5s
+    const result = hitTestRegion(380, offsetRect, regions, 10, 800);
+    expect(result).toBe('region-1');
+  });
+
+  it('handles pixelsPerSecond zoom mode', () => {
+    const regions = [
+      createRegion('region-1', 2.0, 5.0),
+    ];
+
+    // With 100 pixels per second: region 2.0-5.0s = pixels 200-500
+    // Click at x=300 = time 3.0s (within region)
+    const result = hitTestRegion(300, canvasRect, regions, 10, 800, 100);
+    expect(result).toBe('region-1');
+  });
+});
