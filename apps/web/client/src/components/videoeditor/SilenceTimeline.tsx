import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import WaveformCanvas from './WaveformCanvas';
import SilenceWaveformOverlay from './SilenceWaveformOverlay';
import type { VideoEditorProject, SilentRegion } from '../../types/videoEditor';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PIXELS_PER_SECOND = 100;
const MIN_PIXELS_PER_SECOND = 50;
const MAX_PIXELS_PER_SECOND = 500;
const ZOOM_STEP = 25;
const MAX_CANVAS_WIDTH = 16384; // Browser canvas size limit
const BUFFER_PX = 500; // Render buffer zone on each side
const WAVEFORM_HEIGHT = 80;
const TIMELINE_HEIGHT = 200;
const ZOOM_BAR_HEIGHT = 36;
const TIME_RULER_HEIGHT = 24;
const THUMBNAIL_HEIGHT = 48;
const THUMBNAIL_INTERVAL_SECONDS = 5; // Fixed interval for thumbnail placeholders

// ============================================================================
// Pure Helper Functions (exported for testability)
// ============================================================================

/**
 * Compute tick interval in seconds based on zoom level.
 * Returns 10, 5, 2, or 1 second intervals depending on pixelsPerSecond.
 */
export function getTickInterval(pixelsPerSecond: number): number {
  if (pixelsPerSecond < 75) {
    return 10; // 50-74 px/s: 10 second ticks
  } else if (pixelsPerSecond < 150) {
    return 5; // 75-149 px/s: 5 second ticks
  } else if (pixelsPerSecond < 300) {
    return 2; // 150-299 px/s: 2 second ticks
  } else {
    return 1; // 300-500 px/s: 1 second ticks
  }
}

/**
 * Compute the visible time range given scroll state.
 * Includes a buffer zone on each side to avoid flicker during scroll.
 */
export function computeVisibleRange(
  scrollLeft: number,
  viewportWidth: number,
  pixelsPerSecond: number,
  duration: number,
  bufferPx: number = BUFFER_PX,
): { startTime: number; endTime: number } {
  const startTime = Math.max(0, (scrollLeft - bufferPx) / pixelsPerSecond);
  const endTime = Math.min(duration, (scrollLeft + viewportWidth + bufferPx) / pixelsPerSecond);

  return { startTime, endTime };
}

/**
 * Compute actual canvas width respecting browser limits.
 * Never exceeds maxCanvasWidth regardless of zoom level or duration.
 */
export function computeCanvasWidth(
  startTime: number,
  endTime: number,
  pixelsPerSecond: number,
  maxCanvasWidth: number = MAX_CANVAS_WIDTH,
): number {
  if (startTime >= endTime) {
    return 0;
  }

  const logicalWidth = (endTime - startTime) * pixelsPerSecond;
  return Math.min(logicalWidth, maxCanvasWidth);
}

/**
 * Format time in seconds as MM:SS or H:MM:SS
 */
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  } else {
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}

// ============================================================================
// Component Props
// ============================================================================

interface SilenceTimelineProps {
  project: VideoEditorProject;
  regions: SilentRegion[];
  currentTime: number;
  duration: number;
  waveformData: number[];
  isPlaying?: boolean;
  onSeek: (time: number) => void;
  onRegionClick: (regionId: string) => void;
}

// ============================================================================
// Main Component
// ============================================================================

function SilenceTimelineInner(props: SilenceTimelineProps) {
  const {
    project,
    regions,
    currentTime,
    duration,
    waveformData,
    isPlaying = false,
    onSeek,
    onRegionClick,
  } = props;

  // ---- State ----

  const [pixelsPerSecond, setPixelsPerSecond] = useState(DEFAULT_PIXELS_PER_SECOND);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);

  // ---- Refs ----

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userIsScrollingRef = useRef(false);
  const lastScrollTimeRef = useRef(0);
  const scrollTimeoutRef = useRef<number | null>(null);
  const scrollRafIdRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // ---- Derived Values ----

  const logicalTimelineWidth = duration * pixelsPerSecond;

  const visibleRange = useMemo(
    () => computeVisibleRange(scrollLeft, viewportWidth, pixelsPerSecond, duration),
    [scrollLeft, viewportWidth, pixelsPerSecond, duration],
  );

  const canvasWidth = useMemo(
    () => computeCanvasWidth(visibleRange.startTime, visibleRange.endTime, pixelsPerSecond),
    [visibleRange.startTime, visibleRange.endTime, pixelsPerSecond],
  );

  const canvasOffsetX = visibleRange.startTime * pixelsPerSecond;

  // Slice waveform data to visible range
  const visibleWaveformData = useMemo(() => {
    if (waveformData.length === 0 || duration === 0) {
      return [];
    }

    const startIndex = Math.floor((visibleRange.startTime / duration) * waveformData.length);
    const endIndex = Math.ceil((visibleRange.endTime / duration) * waveformData.length);

    return waveformData.slice(startIndex, endIndex);
  }, [waveformData, duration, visibleRange.startTime, visibleRange.endTime]);

  // ---- Viewport Measurement ----

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Initial measurement
    setViewportWidth(container.clientWidth);

    // Setup ResizeObserver
    resizeObserverRef.current = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportWidth(entry.contentRect.width);
      }
    });

    resizeObserverRef.current.observe(container);

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      resizeObserverRef.current = null;
    };
  }, []);

  // ---- Scroll Handler (throttled with RAF) ----

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const newScrollLeft = e.currentTarget.scrollLeft;

    // Cancel previous RAF if it exists
    if (scrollRafIdRef.current !== null) {
      cancelAnimationFrame(scrollRafIdRef.current);
    }

    // Throttle scroll updates with RAF
    scrollRafIdRef.current = requestAnimationFrame(() => {
      setScrollLeft(newScrollLeft);

      // Mark that user is manually scrolling
      userIsScrollingRef.current = true;
      lastScrollTimeRef.current = Date.now();

      // Clear previous timeout
      if (scrollTimeoutRef.current !== null) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Clear the scrolling flag after 2 seconds of inactivity
      scrollTimeoutRef.current = window.setTimeout(() => {
        userIsScrollingRef.current = false;
      }, 2000);
    });
  }, []);

  // ---- Auto-Scroll to Playhead ----

  useEffect(() => {
    if (!isPlaying || userIsScrollingRef.current) {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) return;

    const playheadX = currentTime * pixelsPerSecond;
    const currentScrollLeft = container.scrollLeft;
    const viewportW = container.clientWidth;

    // Check if playhead is outside visible viewport
    if (playheadX < currentScrollLeft || playheadX > currentScrollLeft + viewportW) {
      // Center the playhead in the viewport
      container.scrollLeft = playheadX - viewportW / 2;
    }
  }, [currentTime, pixelsPerSecond, isPlaying]);

  // ---- Zoom Controls ----

  const handleZoomIn = () => {
    setPixelsPerSecond((prev) => Math.min(MAX_PIXELS_PER_SECOND, prev + ZOOM_STEP));
  };

  const handleZoomOut = () => {
    setPixelsPerSecond((prev) => Math.max(MIN_PIXELS_PER_SECOND, prev - ZOOM_STEP));
  };

  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPixelsPerSecond(Number(e.target.value));
  };

  // ---- Time Ruler Rendering ----

  const tickInterval = getTickInterval(pixelsPerSecond);
  const tickCount = Math.ceil(duration / tickInterval);

  const timeRulerTicks = useMemo(() => {
    const ticks: { time: number; x: number; label: string }[] = [];

    for (let i = 0; i <= tickCount; i++) {
      const time = i * tickInterval;
      if (time > duration) break;

      const x = time * pixelsPerSecond;
      ticks.push({
        time,
        x,
        label: formatTime(time),
      });
    }

    return ticks;
  }, [tickCount, tickInterval, duration, pixelsPerSecond]);

  // ---- Thumbnail Positions (Fixed 5-second interval) ----

  const thumbnailPositions = useMemo(() => {
    const positions: { time: number; x: number }[] = [];
    const count = Math.ceil(duration / THUMBNAIL_INTERVAL_SECONDS);

    for (let i = 0; i <= count; i++) {
      const time = i * THUMBNAIL_INTERVAL_SECONDS;
      if (time > duration) break;

      const x = time * pixelsPerSecond;
      positions.push({ time, x });
    }

    return positions;
  }, [duration, pixelsPerSecond]);

  // ---- Click-to-Seek (for time ruler and thumbnail areas) ----

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left + container.scrollLeft;
    const clickTime = clickX / pixelsPerSecond;

    onSeek(Math.max(0, Math.min(duration, clickTime)));
  };

  // ---- Render ----

  return (
    <div style={styles.container}>
      {/* Zoom Controls Bar */}
      <div style={styles.zoomBar}>
        <button
          onClick={handleZoomOut}
          disabled={pixelsPerSecond <= MIN_PIXELS_PER_SECOND}
          aria-label="Zoom out"
          style={styles.zoomButton}
        >
          -
        </button>
        <input
          type="range"
          min={MIN_PIXELS_PER_SECOND}
          max={MAX_PIXELS_PER_SECOND}
          step={10}
          value={pixelsPerSecond}
          onChange={handleZoomChange}
          aria-label="Zoom level"
          style={styles.zoomSlider}
        />
        <button
          onClick={handleZoomIn}
          disabled={pixelsPerSecond >= MAX_PIXELS_PER_SECOND}
          aria-label="Zoom in"
          style={styles.zoomButton}
        >
          +
        </button>
        <span style={styles.zoomLabel}>{pixelsPerSecond} px/s</span>
      </div>

      {/* Scrollable Timeline Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={styles.scrollContainer}
      >
        <div style={{ ...styles.timelineContent, width: logicalTimelineWidth }}>
          {/* Time Ruler */}
          <div style={styles.timeRuler} onClick={handleTimelineClick}>
            {timeRulerTicks.map((tick) => (
              <div
                key={tick.time}
                style={{
                  ...styles.tick,
                  left: tick.x,
                }}
              >
                <div style={styles.tickLine} />
                <div style={styles.tickLabel}>{tick.label}</div>
              </div>
            ))}
          </div>

          {/* Thumbnail Strip */}
          <div style={styles.thumbnailStrip} onClick={handleTimelineClick}>
            {/* Placeholder thumbnails at fixed 5-second intervals */}
            {thumbnailPositions.map((pos) => (
              <div
                key={`thumb-${pos.time}`}
                style={{
                  ...styles.thumbnailPlaceholder,
                  left: pos.x,
                }}
              />
            ))}
          </div>

          {/* Waveform + Overlay Stack (Virtualized) */}
          <div style={styles.waveformContainer}>
            <div
              style={{
                position: 'relative',
                width: canvasWidth,
                height: WAVEFORM_HEIGHT,
                transform: `translateX(${canvasOffsetX}px)`,
              }}
            >
              <WaveformCanvas
                waveformData={visibleWaveformData}
                width={canvasWidth}
                height={WAVEFORM_HEIGHT}
              />
              <SilenceWaveformOverlay
                regions={regions}
                duration={duration}
                currentTime={currentTime}
                width={canvasWidth}
                height={WAVEFORM_HEIGHT}
                pixelsPerSecond={pixelsPerSecond}
                visibleStartTime={visibleRange.startTime}
                isPlaying={isPlaying}
                onRegionClick={onRegionClick}
                onSeek={onSeek}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: TIMELINE_HEIGHT,
    backgroundColor: '#1a1a1a',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  zoomBar: {
    height: ZOOM_BAR_HEIGHT,
    backgroundColor: '#2a2a2a',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    gap: '8px',
    borderBottom: '1px solid #333',
  },
  zoomButton: {
    width: 28,
    height: 28,
    borderRadius: 4,
    border: '1px solid #555',
    backgroundColor: '#3a3a3a',
    color: '#e0e0e0',
    fontSize: 16,
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomSlider: {
    flex: 1,
    height: 4,
    cursor: 'pointer',
  },
  zoomLabel: {
    fontSize: 12,
    color: '#e0e0e0',
    minWidth: 60,
    textAlign: 'right',
  },
  scrollContainer: {
    flex: 1,
    overflowX: 'auto',
    overflowY: 'hidden',
    position: 'relative',
  },
  timelineContent: {
    position: 'relative',
    height: '100%',
  },
  timeRuler: {
    position: 'relative',
    height: TIME_RULER_HEIGHT,
    backgroundColor: '#1a1a1a',
    borderBottom: '1px solid #333',
  },
  tick: {
    position: 'absolute',
    top: 0,
    transform: 'translateX(-50%)', // Center tick
  },
  tickLine: {
    width: 1,
    height: 8,
    backgroundColor: '#666',
  },
  tickLabel: {
    fontSize: 10,
    color: '#aaa',
    marginTop: 2,
    whiteSpace: 'nowrap',
  },
  thumbnailStrip: {
    position: 'relative',
    height: THUMBNAIL_HEIGHT,
    backgroundColor: '#1a1a1a',
    borderBottom: '1px solid #333',
  },
  thumbnailPlaceholder: {
    position: 'absolute',
    top: 4,
    width: 64,
    height: 40,
    backgroundColor: '#333',
    borderRadius: 2,
    transform: 'translateX(-32px)', // Center on tick
  },
  waveformContainer: {
    position: 'relative',
    height: WAVEFORM_HEIGHT,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
  },
};

// ============================================================================
// Export
// ============================================================================

export const SilenceTimeline = React.memo(SilenceTimelineInner);
export default SilenceTimeline;
