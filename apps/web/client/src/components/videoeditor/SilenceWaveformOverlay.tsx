import React, { useRef, useEffect, useMemo } from 'react';
import type { SilentRegion } from '../../types/videoEditor';

// ============================================================================
// Visual Constants
// ============================================================================

const HATCH_PATTERN_SIZE = 10;
const SELECTED_BORDER_DASH = [4, 4] as const;
const PLAYHEAD_LINE_WIDTH = 2;
const THROTTLE_MS = 16; // ~60fps for mousemove throttling
const DRAG_THRESHOLD_PX = 4;
const REGION_HIT_SLOP_PX = 6;

// ============================================================================
// Pure Helper Functions (exported for testability)
// ============================================================================

/**
 * Converts a time value to a pixel X position on the canvas.
 *
 * @param time - Time in seconds
 * @param duration - Total duration of the media in seconds
 * @param canvasWidth - Logical canvas width in pixels
 * @param pixelsPerSecond - Optional zoom factor (overrides duration-based calculation)
 * @param visibleStartTime - Optional start time of visible range (for virtualized rendering)
 * @returns Pixel X position
 */
export function timeToPixel(
  time: number,
  duration: number,
  canvasWidth: number,
  pixelsPerSecond?: number,
  visibleStartTime?: number
): number {
  if (pixelsPerSecond !== undefined) {
    // When using pixelsPerSecond, compute position relative to visible range start
    const relativeTime = time - (visibleStartTime || 0);
    return relativeTime * pixelsPerSecond;
  }

  if (duration === 0) {
    return 0;
  }

  return (time / duration) * canvasWidth;
}

/**
 * Converts a pixel X position to a time value.
 *
 * @param pixelX - Pixel X position on canvas
 * @param duration - Total duration of the media in seconds
 * @param canvasWidth - Logical canvas width in pixels
 * @param pixelsPerSecond - Optional zoom factor
 * @param visibleStartTime - Optional start time of visible range (for virtualized rendering)
 * @returns Time in seconds, clamped to [0, duration]
 */
export function pixelToTime(
  pixelX: number,
  duration: number,
  canvasWidth: number,
  pixelsPerSecond?: number,
  visibleStartTime?: number
): number {
  let time: number;

  if (pixelsPerSecond !== undefined) {
    // When using pixelsPerSecond, convert pixel to time relative to visible range
    const relativeTime = pixelX / pixelsPerSecond;
    time = relativeTime + (visibleStartTime || 0);
  } else if (canvasWidth === 0) {
    time = 0;
  } else {
    time = (pixelX / canvasWidth) * duration;
  }

  // Clamp to valid range
  return Math.max(0, Math.min(duration, time));
}

/**
 * Performs hit testing to find which region (if any) was clicked.
 *
 * @param clientX - Mouse X position in client coordinates
 * @param canvasRect - Canvas bounding rectangle
 * @param regions - Array of silent regions
 * @param duration - Total duration of the media in seconds
 * @param canvasWidth - Logical canvas width in pixels
 * @param pixelsPerSecond - Optional zoom factor
 * @param visibleStartTime - Optional start time of visible range (for virtualized rendering)
 * @returns Region ID if hit, null otherwise
 */
export function hitTestRegion(
  clientX: number,
  canvasRect: DOMRect,
  regions: SilentRegion[],
  duration: number,
  canvasWidth: number,
  pixelsPerSecond?: number,
  visibleStartTime?: number
): string | null {
  // Convert client coordinates to canvas-relative position
  const x = clientX - canvasRect.left;

  // Filter to non-skipped regions that contain this X, with hit slop to make
  // narrow silence segments easier to click.
  const hits = regions
    .filter(region => !region.skipped)
    .filter((region) => {
      const startX = timeToPixel(
        region.adjustedStartTime,
        duration,
        canvasWidth,
        pixelsPerSecond,
        visibleStartTime,
      );
      const endX = timeToPixel(
        region.adjustedEndTime,
        duration,
        canvasWidth,
        pixelsPerSecond,
        visibleStartTime,
      );
      const minX = Math.min(startX, endX) - REGION_HIT_SLOP_PX;
      const maxX = Math.max(startX, endX) + REGION_HIT_SLOP_PX;
      return x >= minX && x <= maxX;
    });

  if (hits.length === 0) {
    return null;
  }

  // Prefer narrowest region if there are overlaps
  const narrowest = hits.reduce((prev, curr) =>
    curr.adjustedDuration < prev.adjustedDuration ? curr : prev
  );

  return narrowest.id;
}

// ============================================================================
// Component Props
// ============================================================================

interface SilenceWaveformOverlayProps {
  /** Array of silent regions (from Section 01 types, with adjusted bounds) */
  regions: SilentRegion[];
  /** Total duration of the media in seconds */
  duration: number;
  /** Current playback time in seconds (drives playhead position) */
  currentTime: number;
  /** Logical width of the canvas in CSS pixels (provided by parent) */
  width: number;
  /** Logical height of the canvas in CSS pixels (provided by parent) */
  height: number;
  /** Optional pixels-per-second for zoomed timeline (used by SilenceTimeline in Section 06) */
  pixelsPerSecond?: number;
  /** Optional start time of visible range (for virtualized rendering in Section 06) */
  visibleStartTime?: number;
  /** Whether media is currently playing (controls playhead animation) */
  isPlaying?: boolean;
  /** Called when user clicks on a region -- parent toggles selection */
  onRegionClick: (regionId: string) => void;
  /** Called when user clicks empty space -- parent seeks playback to this time */
  onSeek: (time: number) => void;
  /** Optional hover callback for tooltip display */
  onRegionHover?: (regionId: string | null) => void;
  /** Optional callback to create a manual cut range by dragging */
  onRangeCreate?: (startTime: number, endTime: number) => void;
  /** Enable drag-to-create range behavior */
  enableRangeSelection?: boolean;
}

// ============================================================================
// Helper: Create hatched pattern for skipped regions
// ============================================================================

function createHatchPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  // Create an offscreen canvas for the pattern
  const patternCanvas = document.createElement('canvas');
  patternCanvas.width = HATCH_PATTERN_SIZE;
  patternCanvas.height = HATCH_PATTERN_SIZE;

  const patternCtx = patternCanvas.getContext('2d');
  if (!patternCtx) return null;

  // Draw diagonal stripes
  patternCtx.strokeStyle = 'rgba(128, 128, 128, 0.3)';
  patternCtx.lineWidth = 1;
  patternCtx.beginPath();
  patternCtx.moveTo(0, HATCH_PATTERN_SIZE);
  patternCtx.lineTo(HATCH_PATTERN_SIZE, 0);
  patternCtx.stroke();

  return ctx.createPattern(patternCanvas, 'repeat');
}

// ============================================================================
// Main Component
// ============================================================================

function SilenceWaveformOverlayInner(props: SilenceWaveformOverlayProps) {
  const {
    regions,
    duration,
    currentTime,
    width,
    height,
    pixelsPerSecond,
    visibleStartTime,
    isPlaying = true,
    onRegionClick,
    onSeek,
    onRegionHover,
    onRangeCreate,
    enableRangeSelection = false,
  } = props;

  // Two canvas refs: one for regions, one for playhead
  const regionsCanvasRef = useRef<HTMLCanvasElement>(null);
  const playheadCanvasRef = useRef<HTMLCanvasElement>(null);

  // Track animation frame for playhead
  const rafIdRef = useRef<number | null>(null);

  // Track last hovered region to avoid excessive callbacks
  const lastHoveredRef = useRef<string | null>(null);

  // Track last mousemove time for throttling
  const lastMouseMoveRef = useRef<number>(0);
  const dragStartRef = useRef<{ clientX: number; time: number } | null>(null);

  // ---- Memoize hatch pattern (doesn't depend on props) ----

  const hatchPattern = useMemo(() => {
    // Create a temporary canvas context to generate the pattern
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;
    return createHatchPattern(tempCtx);
  }, []);

  // ---- Draw regions canvas (only when regions/dimensions change) ----

  useEffect(() => {
    const canvas = regionsCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Apply devicePixelRatio scaling for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas with transparent background
    ctx.clearRect(0, 0, width, height);

    // Draw each region
    for (const region of regions) {
      const x = timeToPixel(region.adjustedStartTime, duration, width, pixelsPerSecond, visibleStartTime);
      const endX = timeToPixel(region.adjustedEndTime, duration, width, pixelsPerSecond, visibleStartTime);
      const regionWidth = endX - x;

      if (region.skipped) {
        // Draw hatched pattern with fallback
        if (hatchPattern) {
          ctx.fillStyle = hatchPattern;
        } else {
          ctx.fillStyle = 'rgba(128, 128, 128, 0.2)';
        }
        ctx.fillRect(x, 0, regionWidth, height);
        ctx.strokeStyle = 'rgba(180, 180, 180, 0.75)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, 0.5, Math.max(0, regionWidth - 1), Math.max(0, height - 1));
      } else if (region.selected) {
        // Selected = will be cut/skipped
        ctx.fillStyle = 'rgba(255, 59, 59, 0.42)';
        ctx.fillRect(x, 0, regionWidth, height);

        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([]);
        ctx.strokeRect(x, 0, regionWidth, height);
      } else {
        // Deselected = keep (do not cut/skip)
        ctx.fillStyle = 'rgba(56, 211, 110, 0.30)';
        ctx.fillRect(x, 0, regionWidth, height);
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 1.2;
        ctx.setLineDash(SELECTED_BORDER_DASH);
        ctx.strokeRect(x + 0.5, 0.5, Math.max(0, regionWidth - 1), Math.max(0, height - 1));
        ctx.setLineDash([]);
      }
    }
  }, [regions, duration, width, height, pixelsPerSecond, visibleStartTime, hatchPattern]);

  // ---- Draw playhead canvas (animates with currentTime when playing) ----

  useEffect(() => {
    const canvas = playheadCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Apply devicePixelRatio scaling
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Helper to draw playhead at current time
    const drawPlayheadAtTime = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      const x = timeToPixel(time, duration, width, pixelsPerSecond, visibleStartTime);
      ctx.strokeStyle = '#ff3333';
      ctx.lineWidth = PLAYHEAD_LINE_WIDTH;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    };

    // If playing, use animation loop; otherwise draw once
    if (isPlaying) {
      let rafId: number | null = null;

      const drawPlayhead = () => {
        drawPlayheadAtTime(currentTime);
        rafId = requestAnimationFrame(drawPlayhead);
      };

      rafId = requestAnimationFrame(drawPlayhead);

      // Cleanup: cancel specific RAF ID
      return () => {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
      };
    } else {
      // When paused, draw once
      drawPlayheadAtTime(currentTime);
    }
  }, [currentTime, duration, width, height, pixelsPerSecond, visibleStartTime, isPlaying]);

  // ---- Click/drag handlers ----

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!enableRangeSelection) return;
    const canvas = playheadCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = pixelToTime(x, duration, width, pixelsPerSecond, visibleStartTime);
    dragStartRef.current = { clientX: e.clientX, time };
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = playheadCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dragStart = dragStartRef.current;
    dragStartRef.current = null;

    if (enableRangeSelection && dragStart && onRangeCreate) {
      const deltaX = Math.abs(e.clientX - dragStart.clientX);
      if (deltaX >= DRAG_THRESHOLD_PX) {
        const endX = e.clientX - rect.left;
        const endTime = pixelToTime(endX, duration, width, pixelsPerSecond, visibleStartTime);
        const rangeStart = Math.min(dragStart.time, endTime);
        const rangeEnd = Math.max(dragStart.time, endTime);
        if (Number.isFinite(rangeStart) && Number.isFinite(rangeEnd) && rangeEnd - rangeStart > 0.01) {
          onRangeCreate(rangeStart, rangeEnd);
          return;
        }
      }
    }

    const regionId = hitTestRegion(
      e.clientX,
      rect,
      regions,
      duration,
      width,
      pixelsPerSecond,
      visibleStartTime
    );

    if (regionId) {
      onRegionClick(regionId);
    } else {
      const x = e.clientX - rect.left;
      const time = pixelToTime(x, duration, width, pixelsPerSecond, visibleStartTime);
      onSeek(time);
    }
  };

  // ---- Hover handler (throttled for performance) ----

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragStartRef.current) {
      return;
    }
    if (!onRegionHover) return;

    // Throttle hit testing to ~60fps (16ms)
    const now = Date.now();
    if (now - lastMouseMoveRef.current < THROTTLE_MS) {
      return;
    }
    lastMouseMoveRef.current = now;

    const canvas = playheadCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const regionId = hitTestRegion(
      e.clientX,
      rect,
      regions,
      duration,
      width,
      pixelsPerSecond,
      visibleStartTime
    );

    // Update cursor
    canvas.style.cursor = regionId ? 'pointer' : 'crosshair';

    // Only call callback if hovered region changed
    if (regionId !== lastHoveredRef.current) {
      lastHoveredRef.current = regionId;
      onRegionHover(regionId);
    }
  };

  // ---- Render ----

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'auto',
      }}
    >
      <canvas
        ref={regionsCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
      />
      <canvas
        ref={playheadCanvasRef}
        onMouseDown={handleCanvasMouseDown}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={() => { dragStartRef.current = null; }}
        onMouseMove={handleMouseMove}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          cursor: 'crosshair',
        }}
      />
    </div>
  );
}

// Wrap in React.memo for performance optimization
export default React.memo(SilenceWaveformOverlayInner);
