diff --git a/apps/web/client/src/components/videoeditor/SilenceTimeline.tsx b/apps/web/client/src/components/videoeditor/SilenceTimeline.tsx
new file mode 100644
index 0000000..5f51d0f
--- /dev/null
+++ b/apps/web/client/src/components/videoeditor/SilenceTimeline.tsx
@@ -0,0 +1,488 @@
+import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
+import WaveformCanvas from './WaveformCanvas';
+import SilenceWaveformOverlay from './SilenceWaveformOverlay';
+import type { VideoEditorProject, SilentRegion } from '../../types/videoEditor';
+
+// ============================================================================
+// Constants
+// ============================================================================
+
+const DEFAULT_PIXELS_PER_SECOND = 100;
+const MIN_PIXELS_PER_SECOND = 50;
+const MAX_PIXELS_PER_SECOND = 500;
+const ZOOM_STEP = 25;
+const MAX_CANVAS_WIDTH = 16384; // Browser canvas size limit
+const BUFFER_PX = 500; // Render buffer zone on each side
+const WAVEFORM_HEIGHT = 80;
+const TIMELINE_HEIGHT = 200;
+const ZOOM_BAR_HEIGHT = 36;
+const TIME_RULER_HEIGHT = 24;
+const THUMBNAIL_HEIGHT = 48;
+
+// ============================================================================
+// Pure Helper Functions (exported for testability)
+// ============================================================================
+
+/**
+ * Compute tick interval in seconds based on zoom level.
+ * Returns 10, 5, 2, or 1 second intervals depending on pixelsPerSecond.
+ */
+export function getTickInterval(pixelsPerSecond: number): number {
+  if (pixelsPerSecond < 75) {
+    return 10; // 50-74 px/s: 10 second ticks
+  } else if (pixelsPerSecond < 150) {
+    return 5; // 75-149 px/s: 5 second ticks
+  } else if (pixelsPerSecond < 300) {
+    return 2; // 150-299 px/s: 2 second ticks
+  } else {
+    return 1; // 300-500 px/s: 1 second ticks
+  }
+}
+
+/**
+ * Compute the visible time range given scroll state.
+ * Includes a buffer zone on each side to avoid flicker during scroll.
+ */
+export function computeVisibleRange(
+  scrollLeft: number,
+  viewportWidth: number,
+  pixelsPerSecond: number,
+  duration: number,
+  bufferPx: number = BUFFER_PX,
+): { startTime: number; endTime: number } {
+  const startTime = Math.max(0, (scrollLeft - bufferPx) / pixelsPerSecond);
+  const endTime = Math.min(duration, (scrollLeft + viewportWidth + bufferPx) / pixelsPerSecond);
+
+  return { startTime, endTime };
+}
+
+/**
+ * Compute actual canvas width respecting browser limits.
+ * Never exceeds maxCanvasWidth regardless of zoom level or duration.
+ */
+export function computeCanvasWidth(
+  startTime: number,
+  endTime: number,
+  pixelsPerSecond: number,
+  maxCanvasWidth: number = MAX_CANVAS_WIDTH,
+): number {
+  if (startTime >= endTime) {
+    return 0;
+  }
+
+  const logicalWidth = (endTime - startTime) * pixelsPerSecond;
+  return Math.min(logicalWidth, maxCanvasWidth);
+}
+
+/**
+ * Format time in seconds as MM:SS or H:MM:SS
+ */
+function formatTime(seconds: number): string {
+  const h = Math.floor(seconds / 3600);
+  const m = Math.floor((seconds % 3600) / 60);
+  const s = Math.floor(seconds % 60);
+
+  if (h > 0) {
+    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
+  } else {
+    return `${m}:${s.toString().padStart(2, '0')}`;
+  }
+}
+
+// ============================================================================
+// Component Props
+// ============================================================================
+
+interface SilenceTimelineProps {
+  project: VideoEditorProject;
+  regions: SilentRegion[];
+  currentTime: number;
+  duration: number;
+  waveformData: number[];
+  isPlaying?: boolean;
+  onSeek: (time: number) => void;
+  onRegionClick: (regionId: string) => void;
+}
+
+// ============================================================================
+// Main Component
+// ============================================================================
+
+function SilenceTimelineInner(props: SilenceTimelineProps) {
+  const {
+    project,
+    regions,
+    currentTime,
+    duration,
+    waveformData,
+    isPlaying = false,
+    onSeek,
+    onRegionClick,
+  } = props;
+
+  // ---- State ----
+
+  const [pixelsPerSecond, setPixelsPerSecond] = useState(DEFAULT_PIXELS_PER_SECOND);
+  const [scrollLeft, setScrollLeft] = useState(0);
+  const [viewportWidth, setViewportWidth] = useState(0);
+
+  // ---- Refs ----
+
+  const scrollContainerRef = useRef<HTMLDivElement>(null);
+  const userIsScrollingRef = useRef(false);
+  const lastScrollTimeRef = useRef(0);
+  const resizeObserverRef = useRef<ResizeObserver | null>(null);
+
+  // ---- Derived Values ----
+
+  const logicalTimelineWidth = duration * pixelsPerSecond;
+
+  const visibleRange = useMemo(
+    () => computeVisibleRange(scrollLeft, viewportWidth, pixelsPerSecond, duration),
+    [scrollLeft, viewportWidth, pixelsPerSecond, duration],
+  );
+
+  const canvasWidth = useMemo(
+    () => computeCanvasWidth(visibleRange.startTime, visibleRange.endTime, pixelsPerSecond),
+    [visibleRange.startTime, visibleRange.endTime, pixelsPerSecond],
+  );
+
+  const canvasOffsetX = visibleRange.startTime * pixelsPerSecond;
+
+  // Slice waveform data to visible range
+  const visibleWaveformData = useMemo(() => {
+    if (waveformData.length === 0 || duration === 0) {
+      return [];
+    }
+
+    const startIndex = Math.floor((visibleRange.startTime / duration) * waveformData.length);
+    const endIndex = Math.ceil((visibleRange.endTime / duration) * waveformData.length);
+
+    return waveformData.slice(startIndex, endIndex);
+  }, [waveformData, duration, visibleRange.startTime, visibleRange.endTime]);
+
+  // ---- Viewport Measurement ----
+
+  useEffect(() => {
+    const container = scrollContainerRef.current;
+    if (!container) return;
+
+    // Initial measurement
+    setViewportWidth(container.clientWidth);
+
+    // Setup ResizeObserver
+    resizeObserverRef.current = new ResizeObserver((entries) => {
+      for (const entry of entries) {
+        setViewportWidth(entry.contentRect.width);
+      }
+    });
+
+    resizeObserverRef.current.observe(container);
+
+    return () => {
+      resizeObserverRef.current?.disconnect();
+      resizeObserverRef.current = null;
+    };
+  }, []);
+
+  // ---- Scroll Handler ----
+
+  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
+    const newScrollLeft = e.currentTarget.scrollLeft;
+    setScrollLeft(newScrollLeft);
+
+    // Mark that user is manually scrolling
+    userIsScrollingRef.current = true;
+    lastScrollTimeRef.current = Date.now();
+
+    // Clear the scrolling flag after 2 seconds of inactivity
+    setTimeout(() => {
+      if (Date.now() - lastScrollTimeRef.current >= 2000) {
+        userIsScrollingRef.current = false;
+      }
+    }, 2100);
+  }, []);
+
+  // ---- Auto-Scroll to Playhead ----
+
+  useEffect(() => {
+    if (!isPlaying || userIsScrollingRef.current) {
+      return;
+    }
+
+    const container = scrollContainerRef.current;
+    if (!container) return;
+
+    const playheadX = currentTime * pixelsPerSecond;
+    const currentScrollLeft = container.scrollLeft;
+    const viewportW = container.clientWidth;
+
+    // Check if playhead is outside visible viewport
+    if (playheadX < currentScrollLeft || playheadX > currentScrollLeft + viewportW) {
+      // Center the playhead in the viewport
+      container.scrollLeft = playheadX - viewportW / 2;
+    }
+  }, [currentTime, pixelsPerSecond, isPlaying]);
+
+  // ---- Zoom Controls ----
+
+  const handleZoomIn = () => {
+    setPixelsPerSecond((prev) => Math.min(MAX_PIXELS_PER_SECOND, prev + ZOOM_STEP));
+  };
+
+  const handleZoomOut = () => {
+    setPixelsPerSecond((prev) => Math.max(MIN_PIXELS_PER_SECOND, prev - ZOOM_STEP));
+  };
+
+  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
+    setPixelsPerSecond(Number(e.target.value));
+  };
+
+  // ---- Time Ruler Rendering ----
+
+  const tickInterval = getTickInterval(pixelsPerSecond);
+  const tickCount = Math.ceil(duration / tickInterval);
+
+  const timeRulerTicks = useMemo(() => {
+    const ticks: { time: number; x: number; label: string }[] = [];
+
+    for (let i = 0; i <= tickCount; i++) {
+      const time = i * tickInterval;
+      if (time > duration) break;
+
+      const x = time * pixelsPerSecond;
+      ticks.push({
+        time,
+        x,
+        label: formatTime(time),
+      });
+    }
+
+    return ticks;
+  }, [tickCount, tickInterval, duration, pixelsPerSecond]);
+
+  // ---- Click-to-Seek (for time ruler and thumbnail areas) ----
+
+  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
+    const container = scrollContainerRef.current;
+    if (!container) return;
+
+    const rect = e.currentTarget.getBoundingClientRect();
+    const clickX = e.clientX - rect.left + container.scrollLeft;
+    const clickTime = clickX / pixelsPerSecond;
+
+    onSeek(Math.max(0, Math.min(duration, clickTime)));
+  };
+
+  // ---- Render ----
+
+  return (
+    <div style={styles.container}>
+      {/* Zoom Controls Bar */}
+      <div style={styles.zoomBar}>
+        <button
+          onClick={handleZoomOut}
+          disabled={pixelsPerSecond <= MIN_PIXELS_PER_SECOND}
+          style={styles.zoomButton}
+        >
+          -
+        </button>
+        <input
+          type="range"
+          min={MIN_PIXELS_PER_SECOND}
+          max={MAX_PIXELS_PER_SECOND}
+          step={10}
+          value={pixelsPerSecond}
+          onChange={handleZoomChange}
+          style={styles.zoomSlider}
+        />
+        <button
+          onClick={handleZoomIn}
+          disabled={pixelsPerSecond >= MAX_PIXELS_PER_SECOND}
+          style={styles.zoomButton}
+        >
+          +
+        </button>
+        <span style={styles.zoomLabel}>{pixelsPerSecond} px/s</span>
+      </div>
+
+      {/* Scrollable Timeline Area */}
+      <div
+        ref={scrollContainerRef}
+        onScroll={handleScroll}
+        style={styles.scrollContainer}
+      >
+        <div style={{ ...styles.timelineContent, width: logicalTimelineWidth }}>
+          {/* Time Ruler */}
+          <div style={styles.timeRuler} onClick={handleTimelineClick}>
+            {timeRulerTicks.map((tick) => (
+              <div
+                key={tick.time}
+                style={{
+                  ...styles.tick,
+                  left: tick.x,
+                }}
+              >
+                <div style={styles.tickLine} />
+                <div style={styles.tickLabel}>{tick.label}</div>
+              </div>
+            ))}
+          </div>
+
+          {/* Thumbnail Strip */}
+          <div style={styles.thumbnailStrip} onClick={handleTimelineClick}>
+            {/* Placeholder thumbnails at each tick interval */}
+            {timeRulerTicks.map((tick) => (
+              <div
+                key={`thumb-${tick.time}`}
+                style={{
+                  ...styles.thumbnailPlaceholder,
+                  left: tick.x,
+                }}
+              />
+            ))}
+          </div>
+
+          {/* Waveform + Overlay Stack (Virtualized) */}
+          <div style={styles.waveformContainer}>
+            <div
+              style={{
+                position: 'relative',
+                width: canvasWidth,
+                height: WAVEFORM_HEIGHT,
+                transform: `translateX(${canvasOffsetX}px)`,
+              }}
+            >
+              <WaveformCanvas
+                waveformData={visibleWaveformData}
+                width={canvasWidth}
+                height={WAVEFORM_HEIGHT}
+              />
+              <SilenceWaveformOverlay
+                regions={regions}
+                duration={duration}
+                currentTime={currentTime}
+                width={canvasWidth}
+                height={WAVEFORM_HEIGHT}
+                pixelsPerSecond={pixelsPerSecond}
+                isPlaying={isPlaying}
+                onRegionClick={onRegionClick}
+                onSeek={onSeek}
+              />
+            </div>
+          </div>
+        </div>
+      </div>
+    </div>
+  );
+}
+
+// ============================================================================
+// Styles
+// ============================================================================
+
+const styles: Record<string, React.CSSProperties> = {
+  container: {
+    width: '100%',
+    height: TIMELINE_HEIGHT,
+    backgroundColor: '#1a1a1a',
+    display: 'flex',
+    flexDirection: 'column',
+    overflow: 'hidden',
+  },
+  zoomBar: {
+    height: ZOOM_BAR_HEIGHT,
+    backgroundColor: '#2a2a2a',
+    display: 'flex',
+    alignItems: 'center',
+    padding: '0 12px',
+    gap: '8px',
+    borderBottom: '1px solid #333',
+  },
+  zoomButton: {
+    width: 28,
+    height: 28,
+    borderRadius: 4,
+    border: '1px solid #555',
+    backgroundColor: '#3a3a3a',
+    color: '#e0e0e0',
+    fontSize: 16,
+    fontWeight: 'bold',
+    cursor: 'pointer',
+    display: 'flex',
+    alignItems: 'center',
+    justifyContent: 'center',
+  },
+  zoomSlider: {
+    flex: 1,
+    height: 4,
+    cursor: 'pointer',
+  },
+  zoomLabel: {
+    fontSize: 12,
+    color: '#e0e0e0',
+    minWidth: 60,
+    textAlign: 'right',
+  },
+  scrollContainer: {
+    flex: 1,
+    overflowX: 'auto',
+    overflowY: 'hidden',
+    position: 'relative',
+  },
+  timelineContent: {
+    position: 'relative',
+    height: '100%',
+  },
+  timeRuler: {
+    position: 'relative',
+    height: TIME_RULER_HEIGHT,
+    backgroundColor: '#1a1a1a',
+    borderBottom: '1px solid #333',
+  },
+  tick: {
+    position: 'absolute',
+    top: 0,
+    transform: 'translateX(-1px)', // Center tick line
+  },
+  tickLine: {
+    width: 1,
+    height: 8,
+    backgroundColor: '#666',
+  },
+  tickLabel: {
+    fontSize: 10,
+    color: '#aaa',
+    marginTop: 2,
+    transform: 'translateX(-50%)',
+    whiteSpace: 'nowrap',
+  },
+  thumbnailStrip: {
+    position: 'relative',
+    height: THUMBNAIL_HEIGHT,
+    backgroundColor: '#1a1a1a',
+    borderBottom: '1px solid #333',
+  },
+  thumbnailPlaceholder: {
+    position: 'absolute',
+    top: 4,
+    width: 64,
+    height: 40,
+    backgroundColor: '#333',
+    borderRadius: 2,
+    transform: 'translateX(-32px)', // Center on tick
+  },
+  waveformContainer: {
+    position: 'relative',
+    height: WAVEFORM_HEIGHT,
+    backgroundColor: '#1a1a1a',
+    overflow: 'hidden',
+  },
+};
+
+// ============================================================================
+// Export
+// ============================================================================
+
+export const SilenceTimeline = React.memo(SilenceTimelineInner);
+export default SilenceTimeline;
diff --git a/apps/web/client/src/components/videoeditor/__tests__/SilenceTimeline.test.ts b/apps/web/client/src/components/videoeditor/__tests__/SilenceTimeline.test.ts
new file mode 100644
index 0000000..f5c24cf
--- /dev/null
+++ b/apps/web/client/src/components/videoeditor/__tests__/SilenceTimeline.test.ts
@@ -0,0 +1,148 @@
+import { describe, it, expect } from 'vitest';
+
+// Import the pure helper functions from SilenceTimeline.tsx
+import {
+  getTickInterval,
+  computeVisibleRange,
+  computeCanvasWidth,
+} from '../SilenceTimeline';
+
+// ========================================
+// Helper: getTickInterval(pixelsPerSecond)
+// ========================================
+
+describe('getTickInterval', () => {
+  it('at 50 px/s, tick interval is 10 seconds', () => {
+    expect(getTickInterval(50)).toBe(10);
+  });
+
+  it('at 74 px/s, tick interval is 10 seconds', () => {
+    expect(getTickInterval(74)).toBe(10);
+  });
+
+  it('at 75 px/s, tick interval is 5 seconds', () => {
+    expect(getTickInterval(75)).toBe(5);
+  });
+
+  it('at 100 px/s, tick interval is 5 seconds', () => {
+    expect(getTickInterval(100)).toBe(5);
+  });
+
+  it('at 149 px/s, tick interval is 5 seconds', () => {
+    expect(getTickInterval(149)).toBe(5);
+  });
+
+  it('at 150 px/s, tick interval is 2 seconds', () => {
+    expect(getTickInterval(150)).toBe(2);
+  });
+
+  it('at 200 px/s, tick interval is 2 seconds', () => {
+    expect(getTickInterval(200)).toBe(2);
+  });
+
+  it('at 299 px/s, tick interval is 2 seconds', () => {
+    expect(getTickInterval(299)).toBe(2);
+  });
+
+  it('at 300 px/s, tick interval is 1 second', () => {
+    expect(getTickInterval(300)).toBe(1);
+  });
+
+  it('at 500 px/s, tick interval is 1 second', () => {
+    expect(getTickInterval(500)).toBe(1);
+  });
+});
+
+// ========================================
+// Helper: computeVisibleRange(scrollLeft, viewportWidth, pixelsPerSecond, duration, bufferPx)
+// ========================================
+
+describe('computeVisibleRange', () => {
+  it('returns start and end time for the visible viewport', () => {
+    // scrollLeft=1000, viewport=800, pps=100, duration=60s
+    // No buffer: visible start = 1000/100 = 10s, end = (1000+800)/100 = 18s
+    const result = computeVisibleRange(1000, 800, 100, 60, 0);
+    expect(result.startTime).toBe(10);
+    expect(result.endTime).toBe(18);
+  });
+
+  it('includes buffer zone on each side', () => {
+    // scrollLeft=1000, viewport=800, pps=100, buffer=500px
+    // start = (1000-500)/100 = 5s, end = (1000+800+500)/100 = 23s
+    const result = computeVisibleRange(1000, 800, 100, 60, 500);
+    expect(result.startTime).toBe(5);
+    expect(result.endTime).toBe(23);
+  });
+
+  it('clamps startTime to >= 0', () => {
+    // scrollLeft=200, viewport=800, pps=100, buffer=500px
+    // start = (200-500)/100 = -3s -> should clamp to 0
+    const result = computeVisibleRange(200, 800, 100, 60, 500);
+    expect(result.startTime).toBe(0);
+    expect(result.endTime).toBe(15); // (200+800+500)/100 = 15s
+  });
+
+  it('clamps endTime to <= duration', () => {
+    // scrollLeft=5000, viewport=800, pps=100, duration=60s, buffer=500px
+    // end = (5000+800+500)/100 = 63s -> should clamp to 60s
+    const result = computeVisibleRange(5000, 800, 100, 60, 500);
+    expect(result.startTime).toBe(45); // (5000-500)/100 = 45s
+    expect(result.endTime).toBe(60);
+  });
+
+  it('when fully zoomed out (entire timeline fits in viewport), returns full duration', () => {
+    // Duration=60s, pps=50, total width = 3000px
+    // Viewport=4000px (wider than timeline), scrollLeft=0
+    const result = computeVisibleRange(0, 4000, 50, 60, 500);
+    expect(result.startTime).toBe(0);
+    expect(result.endTime).toBe(60);
+  });
+
+  it('uses default buffer of 500px when not specified', () => {
+    // Test with undefined buffer
+    const result = computeVisibleRange(1000, 800, 100, 60);
+    // Should use default buffer=500
+    expect(result.startTime).toBe(5);
+    expect(result.endTime).toBe(23);
+  });
+});
+
+// ========================================
+// Helper: computeCanvasWidth(startTime, endTime, pixelsPerSecond, maxCanvasWidth)
+// ========================================
+
+describe('computeCanvasWidth', () => {
+  it('canvas width = (endTime - startTime) * pixelsPerSecond for normal ranges', () => {
+    const width = computeCanvasWidth(10, 20, 100);
+    expect(width).toBe(1000); // 10s * 100 px/s = 1000px
+  });
+
+  it('canvas width does not exceed maxCanvasWidth', () => {
+    // 100s range at 500 px/s = 50,000px, but max is 16,384px
+    const width = computeCanvasWidth(0, 100, 500, 16384);
+    expect(width).toBe(16384);
+  });
+
+  it('for a 30-min video at 500 px/s (full width), logical width is 900,000 but canvas is capped', () => {
+    // 30 min = 1800s, at 500 px/s = 900,000px
+    const width = computeCanvasWidth(0, 1800, 500, 16384);
+    expect(width).toBe(16384);
+  });
+
+  it('small ranges do not get capped', () => {
+    // 5s at 200 px/s = 1000px (well under limit)
+    const width = computeCanvasWidth(5, 10, 200, 16384);
+    expect(width).toBe(1000);
+  });
+
+  it('uses default maxCanvasWidth of 16384 when not specified', () => {
+    // Large range that would exceed default max
+    const width = computeCanvasWidth(0, 1000, 500);
+    expect(width).toBe(16384);
+  });
+
+  it('returns 0 when startTime >= endTime', () => {
+    const width = computeCanvasWidth(20, 10, 100);
+    expect(width).toBe(0);
+  });
+});
