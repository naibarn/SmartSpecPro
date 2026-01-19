/**
 * Timeline Component - Professional Video Editor Timeline
 * Phase 1: Interactive timeline with zoom, scroll, and drag & drop
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  type Track,
  type Clip,
  type Asset,
  type Timeline as TimelineData,
  formatTime
} from '../../types/videoEditor';

interface TimelineProps {
  timeline: TimelineData;
  assets: Record<string, Asset>;
  currentTime: number;
  duration: number;
  zoom: number;  // pixels per second
  onTimeChange: (time: number) => void;
  onClipSelect: (clipId: string | null) => void;
  onClipMove: (clipId: string, newStartTime: number, newTrackId: string) => void;
  onClipResize: (clipId: string, newDuration: number, newTrimIn: number) => void;
  onClipDelete: (clipId: string) => void;
  selectedClipId: string | null;
}

const TRACK_HEIGHT = 80;
const HEADER_WIDTH = 100;
const RULER_HEIGHT = 30;
const SNAP_THRESHOLD = 5; // pixels

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
  selectedClipId
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
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
  } | null>(null);
  const [hoveredClipId, setHoveredClipId] = useState<string | null>(null);

  // Calculate timeline width
  const timelineWidth = Math.max(duration * zoom, 1000);

  // Convert time to pixels
  const timeToPixels = useCallback((time: number) => {
    return time * zoom;
  }, [zoom]);

  // Convert pixels to time
  const pixelsToTime = useCallback((pixels: number) => {
    return pixels / zoom;
  }, [zoom]);

  // Handle playhead click
  const handleTimelineClick = (e: React.MouseEvent) => {
    if (draggingClip || resizingClip) return;

    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left - HEADER_WIDTH + scrollLeft;
    const time = pixelsToTime(Math.max(0, x));

    onTimeChange(Math.min(time, duration));
  };

  // Handle clip mouse down (start drag)
  const handleClipMouseDown = (e: React.MouseEvent, clip: Clip, trackId: string) => {
    e.stopPropagation();

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const offsetX = e.clientX - rect.left;

    // Check if clicking on resize handles
    const isLeftEdge = offsetX < 10;
    const isRightEdge = offsetX > rect.width - 10;

    if (isLeftEdge || isRightEdge) {
      setResizingClip({
        clipId: clip.id,
        edge: isLeftEdge ? 'left' : 'right',
        originalDuration: clip.duration,
        originalTrimIn: clip.trimIn,
        originalStartTime: clip.startTime
      });
    } else {
      setDraggingClip({
        clipId: clip.id,
        trackId,
        offsetX: pixelsToTime(offsetX),
        originalStartTime: clip.startTime
      });
    }

    onClipSelect(clip.id);
  };

  // Handle mouse move (drag or resize)
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - HEADER_WIDTH + scrollLeft;
    const time = pixelsToTime(Math.max(0, x));

    if (draggingClip) {
      // Calculate new start time
      let newStartTime = time - draggingClip.offsetX;
      newStartTime = Math.max(0, newStartTime);

      // Snap to grid (0.5 second intervals)
      if (Math.abs(newStartTime % 0.5) < 0.1) {
        newStartTime = Math.round(newStartTime * 2) / 2;
      }

      // Find track under cursor
      const y = e.clientY - rect.top - RULER_HEIGHT;
      const trackIndex = Math.floor(y / TRACK_HEIGHT);
      const track = timeline.tracks[trackIndex];

      if (track && !track.locked) {
        onClipMove(draggingClip.clipId, newStartTime, track.id);
      }
    } else if (resizingClip) {
      const clip = timeline.tracks
        .flatMap(t => t.clips)
        .find(c => c.id === resizingClip.clipId);

      if (!clip) return;

      const asset = assets[clip.assetId];
      if (!asset) return;

      if (resizingClip.edge === 'left') {
        // Resize from left (adjust trim in and start time)
        const delta = time - resizingClip.originalStartTime;
        const newTrimIn = Math.max(0, Math.min(resizingClip.originalTrimIn + delta, asset.duration));
        const newDuration = resizingClip.originalDuration - (newTrimIn - resizingClip.originalTrimIn);

        if (newDuration > 0.1) {
          onClipResize(resizingClip.clipId, newDuration, newTrimIn);
        }
      } else {
        // Resize from right (adjust duration)
        const newDuration = Math.max(0.1, time - clip.startTime);
        const maxDuration = asset.duration - clip.trimIn;

        onClipResize(
          resizingClip.clipId,
          Math.min(newDuration, maxDuration),
          clip.trimIn
        );
      }
    }
  }, [draggingClip, resizingClip, scrollLeft, zoom, timeline, assets, pixelsToTime, onClipMove, onClipResize]);

  // Handle mouse up (end drag or resize)
  const handleMouseUp = useCallback(() => {
    setDraggingClip(null);
    setResizingClip(null);
  }, []);

  // Add mouse event listeners
  useEffect(() => {
    if (draggingClip || resizingClip) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
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

  // Handle scroll
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
  };

  // Render time ruler
  const renderRuler = () => {
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
  };

  // Render clip
  const renderClip = (clip: Clip, track: Track) => {
    const asset = assets[clip.assetId];
    if (!asset) return null;

    const x = timeToPixels(clip.startTime);
    const width = timeToPixels(clip.duration);
    const isSelected = clip.id === selectedClipId;
    const isHovered = clip.id === hoveredClipId;
    const isDragging = draggingClip?.clipId === clip.id;
    const isResizing = resizingClip?.clipId === clip.id;

    return (
      <div
        key={clip.id}
        className={`timeline-clip ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''}`}
        style={{
          left: `${x}px`,
          width: `${width}px`,
          backgroundColor: track.type === 'video' ? '#0078d4' : '#00b294'
        }}
        onMouseDown={(e) => handleClipMouseDown(e, clip, track.id)}
        onMouseEnter={() => setHoveredClipId(clip.id)}
        onMouseLeave={() => setHoveredClipId(null)}
      >
        <div className="clip-resize-handle left" />
        <div className="clip-content">
          <div className="clip-name">{asset.filename}</div>
          <div className="clip-duration">{formatTime(clip.duration)}</div>
        </div>
        <div className="clip-resize-handle right" />
      </div>
    );
  };

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
          margin-left: ${HEADER_WIDTH}px;
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
          position: relative;
          flex: 1;
          display: flex;
          overflow-x: auto;
          overflow-y: auto;
        }

        .timeline-tracks-header {
          width: ${HEADER_WIDTH}px;
          background: #2a2a2a;
          border-right: 1px solid #444;
          flex-shrink: 0;
        }

        .track-header {
          height: ${TRACK_HEIGHT}px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-bottom: 1px solid #333;
          font-size: 12px;
          font-weight: 600;
        }

        .timeline-tracks {
          position: relative;
          flex: 1;
          cursor: crosshair;
        }

        .timeline-canvas {
          position: relative;
          width: ${timelineWidth}px;
          min-height: 100%;
        }

        .track-lane {
          position: relative;
          height: ${TRACK_HEIGHT}px;
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
          height: ${TRACK_HEIGHT - 10}px;
          border-radius: 4px;
          cursor: move;
          overflow: hidden;
          transition: box-shadow 0.2s;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .timeline-clip:hover {
          box-shadow: 0 0 8px rgba(0, 120, 212, 0.5);
        }

        .timeline-clip.selected {
          border: 2px solid #fff;
          box-shadow: 0 0 12px rgba(255, 255, 255, 0.5);
        }

        .timeline-clip.dragging {
          opacity: 0.7;
          cursor: grabbing;
        }

        .timeline-clip.resizing {
          opacity: 0.8;
        }

        .clip-content {
          padding: 4px 8px;
          pointer-events: none;
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
        }
      `}</style>

      {/* Ruler */}
      <div className="timeline-ruler">
        <div style={{ position: 'relative', width: `${timelineWidth}px`, height: '100%' }}>
          {renderRuler()}
        </div>
      </div>

      {/* Timeline Content */}
      <div className="timeline-content" onScroll={handleScroll}>
        {/* Track Headers */}
        <div className="timeline-tracks-header">
          {timeline.tracks.map(track => (
            <div key={track.id} className="track-header">
              {track.type === 'video' ? '🎬' : '🎤'} {track.name}
            </div>
          ))}
        </div>

        {/* Tracks */}
        <div
          ref={timelineRef}
          className="timeline-tracks"
          onClick={handleTimelineClick}
        >
          <div className="timeline-canvas">
            {timeline.tracks.map(track => (
              <div
                key={track.id}
                className={`track-lane ${track.locked ? 'locked' : ''}`}
              >
                {track.clips.map(clip => renderClip(clip, track))}
              </div>
            ))}

            {/* Playhead */}
            <div
              className="playhead"
              style={{ left: `${timeToPixels(currentTime)}px` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Timeline;
