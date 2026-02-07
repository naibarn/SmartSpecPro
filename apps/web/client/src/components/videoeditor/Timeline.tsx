/**
 * Timeline Component - Professional Video Editor Timeline
 * Phase 1: Interactive timeline with zoom, scroll, and drag & drop
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  type Track,
  type Clip,
  type Asset,
  type Timeline as TimelineData,
  type MediaLibraryAsset,
  formatTime
} from '../../types/videoEditor';
import WaveformCanvas from './WaveformCanvas';

interface TimelineProps {
  timeline: TimelineData;
  assets: Readonly<Record<string, Asset>>;
  currentTime: number;
  duration: number;
  zoom: number;  // pixels per second
  onTimeChange: (time: number) => void;
  onClipSelect: (clipId: string, isMultiSelect: boolean) => void;
  onClipMove: (clipId: string, newStartTime: number, newTrackId: string) => void;
  onClipResize: (clipId: string, newDuration: number, newTrimIn: number) => void;
  onClipDelete: (clipId: string) => void;
  selectedClipId: string | null;
  selectedClipIds?: string[];
  onTrackToggleLock?: (trackId: string) => void;
  onTrackToggleMute?: (trackId: string) => void;
  onTrackToggleVisible?: (trackId: string) => void;
  onDropAsset?: (asset: MediaLibraryAsset, trackId: string, startTime: number) => void;
}

// Type guards for better type safety
const isValidTime = (time: number): time is number => {
  return typeof time === 'number' && !isNaN(time) && isFinite(time) && time >= 0;
};

const isValidZoom = (zoom: number): zoom is number => {
  return typeof zoom === 'number' && !isNaN(zoom) && isFinite(zoom) && zoom > 0;
};

const TRACK_HEIGHT = 80;
const OVERLAY_TRACK_HEIGHT = 60;
const TEXT_TRACK_HEIGHT = 50;
const HEADER_WIDTH = 100;
const RULER_HEIGHT = 30;
const SNAP_THRESHOLD = 5; // pixels
const PLAYHEAD_SNAP_DISTANCE = 0.2; // seconds - snap when within 0.2s of playhead

function getTrackHeight(track: Track): number {
  if (track.height) return track.height;
  switch (track.type) {
    case 'overlay': return OVERLAY_TRACK_HEIGHT;
    case 'text': return TEXT_TRACK_HEIGHT;
    default: return TRACK_HEIGHT;
  }
}

function getTrackIcon(type: Track['type']): string {
  switch (type) {
    case 'video': return '🎬';
    case 'audio': return '🎤';
    case 'overlay': return '🎞️';
    case 'text': return '🅃';
  }
}

function getTrackColor(type: Track['type']): string {
  switch (type) {
    case 'video': return '#0078d4';
    case 'audio': return '#00b294';
    case 'overlay': return '#ff6b6b';
    case 'text': return '#ffa726';
  }
}

export const Timeline: React.FC<TimelineProps> = ({
  timeline,
  assets,
  currentTime,
  duration,
  zoom,
  onTimeChange,
  onClipSelect,
  onClipMove,
  onClipResize,
  onClipDelete,
  selectedClipId,
  selectedClipIds = [],
  onTrackToggleLock,
  onTrackToggleMute,
  onTrackToggleVisible,
  onDropAsset
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [draggingClip, setDraggingClip] = useState<{
    clipId: string;
    trackId: string;
    offsetX: number;
    originalStartTime: number;
  } | null>(null);
  const [resizingClip, setResizingClip] = useState<{
    clipId: string;
    edge: 'left' | 'right';
    originalDuration: number;
    originalTrimIn: number;
    originalStartTime: number;
    startMouseTime: number;  // mouse position in timeline seconds when resize started
  } | null>(null);
  const [hoveredClipId, setHoveredClipId] = useState<string | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // Calculate timeline width
  const timelineWidth = Math.max(duration * zoom, 1000);

  // Convert time to pixels
  const timeToPixels = useCallback((time: number): number => {
    if (!isValidTime(time) || !isValidZoom(zoom)) {
      console.warn('Invalid time or zoom value', { time, zoom });
      return 0;
    }
    return time * zoom;
  }, [zoom]);

  // Convert pixels to time
  const pixelsToTime = useCallback((pixels: number): number => {
    if (!isValidZoom(zoom)) {
      console.warn('Invalid zoom value', { zoom });
      return 0;
    }
    if (!isValidTime(pixels)) {
      console.warn('Invalid pixels value', { pixels });
      return 0;
    }
    return pixels / zoom;
  }, [zoom]);

  // Handle playhead click
  const handleTimelineClick = (e: React.MouseEvent) => {
    if (draggingClip || resizingClip) return;

    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;

    // rect.left moves with scroll since .timeline-tracks expands to full width,
    // so e.clientX - rect.left gives absolute position in the timeline canvas.
    const x = e.clientX - rect.left;
    const time = pixelsToTime(Math.max(0, x));

    onTimeChange(Math.min(time, duration));
  };

  // Handle clip mouse down (start drag)
  const handleClipMouseDown = (e: React.MouseEvent, clip: Clip, trackId: string) => {
    e.stopPropagation();

    const clipRect = (e.target as HTMLElement).getBoundingClientRect();
    const offsetX = e.clientX - clipRect.left;

    // Check if clicking on resize handles
    const isLeftEdge = offsetX < 10;
    const isRightEdge = offsetX > clipRect.width - 10;

    if (isLeftEdge || isRightEdge) {
      // Calculate the initial mouse time position on the timeline
      const timelineRect = timelineRef.current?.getBoundingClientRect();
      const mouseX = timelineRect ? e.clientX - timelineRect.left : 0;
      const startMouseTime = pixelsToTime(Math.max(0, mouseX));

      setResizingClip({
        clipId: clip.id,
        edge: isLeftEdge ? 'left' : 'right',
        originalDuration: clip.duration,
        originalTrimIn: clip.trimIn,
        originalStartTime: clip.startTime,
        startMouseTime
      });
    } else {
      setDraggingClip({
        clipId: clip.id,
        trackId,
        offsetX: pixelsToTime(offsetX),
        originalStartTime: clip.startTime
      });
    }

    // Multi-select with Shift or Ctrl key
    const isMultiSelect = e.shiftKey || e.ctrlKey;
    onClipSelect(clip.id, isMultiSelect);
  };

  // Handle mouse move (drag or resize)
  const handleMouseMove = useCallback((e: MouseEvent) => {
    // Prevent race conditions by checking ref existence
    if (!timelineRef.current) return;

    // Cancel previous animation frame to prevent race conditions
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    // Use requestAnimationFrame to throttle updates and prevent race conditions
    rafIdRef.current = requestAnimationFrame(() => {
      if (!timelineRef.current) return;

      const rect = timelineRef.current.getBoundingClientRect();
      // rect.left moves with scroll since .timeline-tracks expands to full width
      const x = e.clientX - rect.left;
      const time = pixelsToTime(Math.max(0, x));

      if (draggingClip) {
        // Calculate new start time
        let newStartTime = time - draggingClip.offsetX;
        newStartTime = Math.max(0, newStartTime);

        // Snap to playhead (priority snapping)
        const distanceToPlayhead = Math.abs(newStartTime - currentTime);
        if (distanceToPlayhead < PLAYHEAD_SNAP_DISTANCE) {
          newStartTime = currentTime;
        }
        // Otherwise, snap to grid (0.5 second intervals)
        else if (Math.abs(newStartTime % 0.5) < 0.1) {
          newStartTime = Math.round(newStartTime * 2) / 2;
        }

        // Find track under cursor (variable heights)
        const y = e.clientY - rect.top;
        let cumulativeY = 0;
        let track: typeof timeline.tracks[number] | undefined;
        for (const t of timeline.tracks) {
          const h = getTrackHeight(t);
          if (y < cumulativeY + h) {
            track = t;
            break;
          }
          cumulativeY += h;
        }

        if (track && !track.locked) {
          onClipMove(draggingClip.clipId, newStartTime, track.id);
        }
      } else if (resizingClip) {
        const asset = (() => {
          for (const t of timeline.tracks) {
            const c = t.clips.find(c => c.id === resizingClip.clipId);
            if (c) return assets[c.assetId];
          }
          return undefined;
        })();
        if (!asset) return;

        // Delta = how far the mouse has moved from where resize started
        const delta = time - resizingClip.startMouseTime;

        if (resizingClip.edge === 'left') {
          // Resize from left: moving mouse right = trim more (shorter clip)
          // moving mouse left = trim less (longer clip)
          const newTrimIn = Math.max(0, Math.min(resizingClip.originalTrimIn + delta, asset.duration - 0.1));
          const trimDelta = newTrimIn - resizingClip.originalTrimIn;
          const newDuration = resizingClip.originalDuration - trimDelta;

          if (newDuration > 0.1) {
            onClipResize(resizingClip.clipId, newDuration, newTrimIn);
          }
        } else {
          // Resize from right: moving mouse right = longer, left = shorter
          const newDuration = Math.max(0.1, resizingClip.originalDuration + delta);
          const maxDuration = asset.duration - resizingClip.originalTrimIn;

          onClipResize(
            resizingClip.clipId,
            Math.min(newDuration, maxDuration),
            resizingClip.originalTrimIn
          );
        }
      }
    });
  }, [draggingClip, resizingClip, zoom, timeline, assets, pixelsToTime, onClipMove, onClipResize, currentTime]);

  // Handle mouse up (end drag or resize)
  const handleMouseUp = useCallback(() => {
    // Cancel any pending animation frame to prevent race conditions
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    setDraggingClip(null);
    setResizingClip(null);
  }, []);

  // Add mouse event listeners
  useEffect(() => {
    if (draggingClip || resizingClip) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        // Cleanup: remove event listeners and cancel any pending animation frames
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
      };
    }
  }, [draggingClip, resizingClip, handleMouseMove, handleMouseUp]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedClipId) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          onClipDelete(selectedClipId);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedClipId, onClipDelete]);

  // Handle scroll — sync ruler with timeline content
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const sl = e.currentTarget.scrollLeft;
    setScrollLeft(sl);
    if (rulerRef.current) {
      rulerRef.current.scrollLeft = sl;
    }
  };

  // Horizontal wheel scroll on timeline
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Shift+wheel or trackpad horizontal scroll
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // Let native horizontal scroll handle deltaX
        if (e.shiftKey && e.deltaX === 0) {
          e.preventDefault();
          el.scrollLeft += e.deltaY;
        }
      } else {
        // Convert vertical wheel to horizontal scroll on the timeline
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Handle drag-over (allow drop)
  const [dropIndicator, setDropIndicator] = useState<{ trackId: string; time: number } | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/video-editor-asset')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';

    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const time = pixelsToTime(Math.max(0, x));

    let cumulativeY = 0;
    for (const t of timeline.tracks) {
      const h = getTrackHeight(t);
      if (y < cumulativeY + h) {
        setDropIndicator({ trackId: t.id, time });
        break;
      }
      cumulativeY += h;
    }
  }, [timeline, pixelsToTime]);

  const handleDragLeave = useCallback(() => {
    setDropIndicator(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropIndicator(null);

    const raw = e.dataTransfer.getData('application/video-editor-asset');
    if (!raw || !onDropAsset) return;

    try {
      const asset: MediaLibraryAsset = JSON.parse(raw);
      if (!timelineRef.current) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const time = pixelsToTime(Math.max(0, x));

      // Find track under cursor
      let cumulativeY = 0;
      for (const t of timeline.tracks) {
        const h = getTrackHeight(t);
        if (y < cumulativeY + h) {
          if (!t.locked) {
            onDropAsset(asset, t.id, time);
          }
          break;
        }
        cumulativeY += h;
      }
    } catch {
      console.error('Failed to parse dropped asset');
    }
  }, [timeline, pixelsToTime, onDropAsset]);

  // Render time ruler - memoized for performance
  const rulerMarkers = useMemo(() => {
    const markers = [];
    const interval = zoom > 50 ? 1 : zoom > 20 ? 5 : 10; // seconds

    for (let t = 0; t <= duration; t += interval) {
      const x = timeToPixels(t);
      markers.push(
        <div
          key={t}
          className="ruler-marker"
          style={{ left: `${x}px` }}
        >
          <div className="ruler-tick" />
          <div className="ruler-label">{formatTime(t)}</div>
        </div>
      );
    }

    return markers;
  }, [zoom, duration, timeToPixels]);

  // Render clip - optimized with useCallback
  const renderClip = useCallback((clip: Clip, track: Track) => {
    const asset = assets[clip.assetId];
    if (!asset) return null;

    const x = timeToPixels(clip.startTime);
    const width = timeToPixels(clip.duration);
    const isSelected = clip.id === selectedClipId || selectedClipIds.includes(clip.id);
    const isHovered = clip.id === hoveredClipId;
    const isDragging = draggingClip?.clipId === clip.id;
    const isResizing = resizingClip?.clipId === clip.id;
    const isMultiSelected = selectedClipIds.includes(clip.id);
    const isOverlay = track.type === 'overlay' || track.type === 'text';
    const hasTransform = !!clip.transform;
    const trackH = getTrackHeight(track);
    const isGrouped = !!clip.groupId;
    const isTextClip = !!clip.textConfig;

    return (
      <div
        key={clip.id}
        className={`timeline-clip ${isSelected ? 'selected' : ''} ${isMultiSelected ? 'multi-selected' : ''} ${isHovered ? 'hovered' : ''} ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''} ${isOverlay ? 'overlay-clip' : ''} ${isGrouped ? 'grouped-clip' : ''}`}
        style={{
          left: `${x}px`,
          width: `${width}px`,
          height: `${trackH - 10}px`,
          backgroundColor: getTrackColor(track.type)
        }}
        onMouseDown={(e) => handleClipMouseDown(e, clip, track.id)}
        onMouseEnter={() => setHoveredClipId(clip.id)}
        onMouseLeave={() => setHoveredClipId(null)}
        role="button"
        tabIndex={0}
        aria-label={`${track.type} clip: ${asset.filename}, duration ${formatTime(clip.duration)}, starts at ${formatTime(clip.startTime)}`}
        aria-selected={isSelected}
        aria-grabbed={isDragging}
      >
        <div className="clip-resize-handle left" aria-label="Resize clip from start" role="button" tabIndex={-1} />

        {/* Waveform for audio clips */}
        {asset.type === 'image' && asset.path && (
          <img
            src={asset.thumbnailPath || asset.path}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.35,
              pointerEvents: 'none',
              borderRadius: 'inherit',
            }}
          />
        )}

        {track.type === 'audio' && asset.waveformData && asset.waveformData.length > 0 && (
          <div className="clip-waveform">
            <WaveformCanvas
              waveformData={asset.waveformData}
              width={width}
              height={trackH - 10}
              color="rgba(255, 255, 255, 0.6)"
              backgroundColor="transparent"
            />
          </div>
        )}

        <div className="clip-content">
          <div className="clip-name">{isTextClip ? clip.textConfig!.text.slice(0, 20) : asset.filename}</div>
          <div className="clip-duration">{formatTime(clip.duration)}</div>
          {hasTransform && (
            <div className="clip-transform-indicator" title="Has transform/keyframes">
              🎨
            </div>
          )}
          {isGrouped && (
            <div className="clip-group-badge" title="Grouped clip">🔗</div>
          )}
        </div>
        <div className="clip-resize-handle right" aria-label="Resize clip from end" role="button" tabIndex={-1} />
      </div>
    );
  }, [assets, zoom, selectedClipId, selectedClipIds, hoveredClipId, draggingClip, resizingClip, timeToPixels, handleClipMouseDown]);

  return (
    <div className="timeline-container">
      <style>{`
        .timeline-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #1e1e1e;
          color: #e0e0e0;
          user-select: none;
        }

        .timeline-ruler {
          position: relative;
          height: ${RULER_HEIGHT}px;
          background: #2a2a2a;
          border-bottom: 1px solid #444;
          min-width: 0;
          overflow: hidden;
          scrollbar-width: none;
        }

        .timeline-ruler::-webkit-scrollbar {
          display: none;
        }

        .timeline-body {
          display: flex;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }

        .ruler-marker {
          position: absolute;
          top: 0;
          height: 100%;
        }

        .ruler-tick {
          width: 1px;
          height: 8px;
          background: #666;
        }

        .ruler-label {
          font-size: 10px;
          color: #888;
          margin-top: 2px;
          white-space: nowrap;
        }

        .timeline-content {
          flex: 1;
          min-width: 0;
          overflow-x: scroll;
          overflow-y: auto;
          scrollbar-color: #555 #1e1e1e;
        }

        .timeline-content::-webkit-scrollbar {
          height: 10px;
        }

        .timeline-content::-webkit-scrollbar-track {
          background: #1e1e1e;
        }

        .timeline-content::-webkit-scrollbar-thumb {
          background: #555;
          border-radius: 5px;
        }

        .timeline-content::-webkit-scrollbar-thumb:hover {
          background: #777;
        }

        .timeline-tracks-header {
          width: ${HEADER_WIDTH}px;
          background: #2a2a2a;
          border-right: 1px solid #444;
          flex-shrink: 0;
        }

        .track-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border-bottom: 1px solid #333;
          font-size: 12px;
          font-weight: 600;
          padding: 4px;
          gap: 4px;
        }

        .track-header-name {
          font-size: 11px;
        }

        .track-header-controls {
          display: flex;
          gap: 4px;
        }

        .track-control-btn {
          width: 24px;
          height: 24px;
          background: #1e1e1e;
          border: 1px solid #444;
          border-radius: 3px;
          color: #888;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          transition: all 0.2s;
        }

        .track-control-btn:hover {
          background: #333;
          border-color: #0078d4;
        }

        .track-control-btn.active {
          background: #0078d4;
          border-color: #0078d4;
          color: #fff;
        }

        .timeline-tracks {
          position: relative;
          cursor: crosshair;
        }

        .timeline-canvas {
          position: relative;
          min-width: ${timelineWidth}px;
          min-height: 100%;
        }

        .track-lane {
          position: relative;
          border-bottom: 1px solid #333;
          background: repeating-linear-gradient(
            90deg,
            #1a1a1a,
            #1a1a1a 1px,
            transparent 1px,
            transparent ${zoom}px
          );
        }

        .track-lane.locked {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .timeline-clip {
          position: absolute;
          top: 5px;
          border-radius: 4px;
          cursor: move;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.1);
          transform: translateZ(0);
          will-change: left, width;
          contain: layout style;
        }

        .timeline-clip:hover {
          box-shadow: 0 0 8px rgba(0, 120, 212, 0.5);
          transform: translateY(-1px);
        }

        .timeline-clip.selected {
          border: 2px solid #fff;
          box-shadow: 0 0 12px rgba(255, 255, 255, 0.5);
          animation: pulse 2s ease-in-out infinite;
        }

        .timeline-clip.multi-selected {
          border: 2px solid #ff9800;
          box-shadow: 0 0 12px rgba(255, 152, 0, 0.6);
        }

        .timeline-clip.overlay-clip {
          border-left: 3px solid #ff6b6b;
        }

        .timeline-clip.grouped-clip {
          border: 2px dashed rgba(255, 215, 0, 0.7);
        }

        .clip-group-badge {
          position: absolute;
          top: 2px;
          right: 20px;
          font-size: 10px;
        }

        .clip-transform-indicator {
          position: absolute;
          top: 4px;
          right: 4px;
          font-size: 14px;
          filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.8));
        }

        @keyframes pulse {
          0%, 100% {
            box-shadow: 0 0 12px rgba(255, 255, 255, 0.5);
          }
          50% {
            box-shadow: 0 0 16px rgba(255, 255, 255, 0.7);
          }
        }

        .timeline-clip.dragging {
          opacity: 0.7;
          cursor: grabbing;
          transform: scale(1.05) rotate(1deg);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          z-index: 1000;
        }

        .timeline-clip.resizing {
          opacity: 0.8;
          box-shadow: 0 2px 8px rgba(0, 120, 212, 0.6);
        }

        .clip-waveform {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          opacity: 0.4;
        }

        .clip-content {
          position: relative;
          padding: 4px 8px;
          pointer-events: none;
          z-index: 1;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
        }

        .clip-name {
          font-size: 11px;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .clip-duration {
          font-size: 9px;
          color: rgba(255, 255, 255, 0.7);
          margin-top: 2px;
        }

        .clip-resize-handle {
          position: absolute;
          top: 0;
          width: 10px;
          height: 100%;
          cursor: ew-resize;
          background: transparent;
          transition: background 0.2s;
        }

        .clip-resize-handle:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .clip-resize-handle.left {
          left: 0;
        }

        .clip-resize-handle.right {
          right: 0;
        }

        .playhead {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 2px;
          background: #ff4444;
          pointer-events: none;
          z-index: 100;
          box-shadow: 0 0 8px rgba(255, 68, 68, 0.6);
          animation: playhead-glow 1.5s ease-in-out infinite;
        }

        @keyframes playhead-glow {
          0%, 100% {
            box-shadow: 0 0 8px rgba(255, 68, 68, 0.6);
          }
          50% {
            box-shadow: 0 0 12px rgba(255, 68, 68, 0.9);
          }
        }

        .playhead::before {
          content: '';
          position: absolute;
          top: -8px;
          left: -6px;
          width: 0;
          height: 0;
          border-left: 7px solid transparent;
          border-right: 7px solid transparent;
          border-top: 8px solid #ff4444;
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
        }
      `}</style>

      {/* Ruler row: fixed header spacer + scrollable ruler */}
      <div style={{ display: 'flex' }}>
        <div style={{ width: `${HEADER_WIDTH}px`, flexShrink: 0, background: '#2a2a2a', borderBottom: '1px solid #444' }} />
        <div ref={rulerRef} className="timeline-ruler" style={{ overflowX: 'scroll', flex: 1 }} role="presentation" aria-label="Timeline ruler">
          <div style={{ position: 'relative', width: `${timelineWidth}px`, height: '100%' }}>
            {rulerMarkers}
          </div>
        </div>
      </div>

      {/* Timeline body: fixed track headers + scrollable tracks */}
      <div className="timeline-body">
        {/* Track Headers — fixed, don't scroll horizontally */}
        <div className="timeline-tracks-header" role="complementary" aria-label="Track headers">
          {timeline.tracks.map(track => (
            <div
              key={track.id}
              className="track-header"
              style={{ height: `${getTrackHeight(track)}px` }}
              role="heading"
              aria-level={2}
              aria-label={`${track.type} track ${track.name}`}
            >
              <div className="track-header-name">
                {getTrackIcon(track.type)} {track.name}
              </div>
              <div className="track-header-controls">
                <button
                  className={`track-control-btn ${track.locked ? 'active' : ''}`}
                  onClick={() => onTrackToggleLock?.(track.id)}
                  title={track.locked ? 'Unlock Track' : 'Lock Track'}
                  aria-label={track.locked ? 'Unlock track' : 'Lock track'}
                  aria-pressed={track.locked}
                >
                  {track.locked ? '🔒' : '🔓'}
                </button>
                <button
                  className={`track-control-btn ${track.muted ? 'active' : ''}`}
                  onClick={() => onTrackToggleMute?.(track.id)}
                  title={track.muted ? 'Unmute Track' : 'Mute Track'}
                  aria-label={track.muted ? 'Unmute track' : 'Mute track'}
                  aria-pressed={track.muted}
                >
                  {track.muted ? '🔇' : '🔊'}
                </button>
                <button
                  className={`track-control-btn ${track.visible === false ? 'active' : ''}`}
                  onClick={() => onTrackToggleVisible?.(track.id)}
                  title={track.visible === false ? 'Show Track' : 'Hide Track'}
                  aria-label={track.visible === false ? 'Show track' : 'Hide track'}
                  aria-pressed={track.visible === false}
                >
                  {track.visible === false ? '🚫' : '👁️'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Scrollable tracks area */}
        <div ref={contentRef} className="timeline-content" onScroll={handleScroll} role="region" aria-label="Timeline editor">
          <div
            ref={timelineRef}
            className="timeline-tracks"
            onClick={handleTimelineClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            role="application"
            aria-label="Timeline tracks"
          >
          <div className="timeline-canvas">
            {timeline.tracks.map(track => {
              const h = getTrackHeight(track);
              return (
                <div
                  key={track.id}
                  className={`track-lane ${track.locked ? 'locked' : ''} ${track.visible === false ? 'hidden-track' : ''}`}
                  style={{ height: `${h}px`, opacity: track.visible === false ? 0.3 : 1 }}
                  role="group"
                  aria-label={`${track.name} track lane`}
                  aria-readonly={track.locked}
                >
                  {track.clips.map(clip => renderClip(clip, track))}
                </div>
              );
            })}

            {/* Playhead */}
            <div
              className="playhead"
              style={{ left: `${timeToPixels(currentTime)}px` }}
              role="slider"
              aria-label="Playhead position"
              aria-valuenow={currentTime}
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
            />
          </div>
        </div>
      </div>{/* .timeline-content */}
      </div>{/* .timeline-body */}
    </div>
  );
};

export default React.memo(Timeline);
