import React, { useRef, useEffect, useMemo } from 'react';
import type { SilentRegion } from '../../types/videoEditor';

// ============================================================================
// Visual Constants
// ============================================================================

const HATCH_PATTERN_SIZE = 10;
const SELECTED_BORDER_DASH = [4, 4] as const;
const PLAYHEAD_LINE_WIDTH = 2;
const THROTTLE_MS = 16; // ~60fps for mousemove throttling

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
 * @returns Pixel X position
 */
export function timeToPixel(
  time: number,
  duration: number,
  canvasWidth: number,
  pixelsPerSecond?: number
): number {
  if (pixelsPerSecond !== undefined) {
    return time * pixelsPerSecond;
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
 * @returns Time in seconds, clamped to [0, duration]
 */
export function pixelToTime(
  pixelX: number,
  duration: number,
  canvasWidth: number,
  pixelsPerSecond?: number
): number {
  let time: number;

  if (pixelsPerSecond !== undefined) {
    time = pixelX / pixelsPerSecond;
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
 * @returns Region ID if hit, null otherwise
 */
export function hitTestRegion(
  clientX: number,
  canvasRect: DOMRect,
  regions: SilentRegion[],
  duration: number,
  canvasWidth: number,
  pixelsPerSecond?: number
): string | null {
  // Convert client coordinates to canvas-relative position
  const x = clientX - canvasRect.left;

  // Convert pixel position to time
  const time = pixelToTime(x, duration, canvasWidth, pixelsPerSecond);

  // Filter to non-skipped regions that contain this time
  const hits = regions
    .filter(region => !region.skipped)
    .filter(region =>
      time >= region.adjustedStartTime &&
      time <= region.adjustedEndTime
    );

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
  /** Whether media is currently playing (controls playhead animation) */
  isPlaying?: boolean;
  /** Called when user clicks on a region -- parent toggles selection */
  onRegionClick: (regionId: string) => void;
  /** Called when user clicks empty space -- parent seeks playback to this time */
  onSeek: (time: number) => void;
  /** Optional hover callback for tooltip display */
  onRegionHover?: (regionId: string | null) => void;
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
    isPlaying = true,
    onRegionClick,
    onSeek,
    onRegionHover,
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
      const x = timeToPixel(region.adjustedStartTime, duration, width, pixelsPerSecond);
      const endX = timeToPixel(region.adjustedEndTime, duration, width, pixelsPerSecond);
      const regionWidth = endX - x;

      if (region.skipped) {
        // Draw hatched pattern with fallback
        if (hatchPattern) {
          ctx.fillStyle = hatchPattern;
        } else {
          ctx.fillStyle = 'rgba(128, 128, 128, 0.2)';
        }
        ctx.fillRect(x, 0, regionWidth, height)
      } else if (region.selected) {
        // Draw selected region: semi-transparent red with dashed cyan border
        ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        ctx.fillRect(x, 0, regionWidth, height);

        ctx.strokeStyle = 'cyan';
        ctx.lineWidth = 1.5;
        ctx.setLineDash(SELECTED_BORDER_DASH);
        ctx.strokeRect(x, 0, regionWidth, height);
        ctx.setLineDash([]); // Reset
      } else {
        // Draw deselected region: lower opacity red
        ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
        ctx.fillRect(x, 0, regionWidth, height);
      }
    }
  }, [regions, duration, width, height, pixelsPerSecond]);

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
      const x = timeToPixel(time, duration, width, pixelsPerSecond);
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
  }, [currentTime, duration, width, height, pixelsPerSecond, isPlaying]);

  // ---- Click handler ----

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = playheadCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const regionId = hitTestRegion(
      e.clientX,
      rect,
      regions,
      duration,
      width,
      pixelsPerSecond
    );

    if (regionId) {
      onRegionClick(regionId);
    } else {
      const x = e.clientX - rect.left;
      const time = pixelToTime(x, duration, width, pixelsPerSecond);
      onSeek(time);
    }
  };

  // ---- Hover handler (throttled for performance) ----

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
      pixelsPerSecond
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
        onClick={handleCanvasClick}
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
