/**
 * TimelineClip Component - Memoized clip for performance
 * OPTIMIZATION: Prevents re-renders of unchanged clips during drag operations
 */

import React, { memo } from 'react';
import type { Clip, Asset } from '../../types/videoEditor';

interface TimelineClipProps {
  clip: Clip;
  asset: Asset;
  zoom: number;
  trackHeight: number;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent, clipId: string) => void;
  onResizeMouseDown: (e: React.MouseEvent, clipId: string, edge: 'left' | 'right') => void;
}

export const TimelineClip: React.FC<TimelineClipProps> = memo(({
  clip,
  asset,
  zoom,
  trackHeight,
  isSelected,
  onMouseDown,
  onResizeMouseDown
}) => {
  const clipWidth = clip.duration * zoom;
  const clipLeft = clip.startTime * zoom;
  const clipSpeed = Number.isFinite(clip.speed) && clip.speed > 0 ? clip.speed : 1;
  const showSpeedBadge = Math.abs(clipSpeed - 1) > 0.01;

  const clipStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${clipLeft}px`,
    top: '5px',
    width: `${clipWidth}px`,
    height: `${trackHeight - 10}px`,
    background: asset.type === 'video' ? '#0078d4' : '#4caf50',
    border: isSelected ? '2px solid #ffa500' : '1px solid #333',
    borderRadius: '4px',
    cursor: 'move',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    padding: '0 8px',
    color: 'white',
    fontSize: '12px',
    fontWeight: '500',
    userSelect: 'none',
    boxShadow: isSelected
      ? '0 0 0 2px rgba(255, 165, 0, 0.3)'
      : '0 1px 3px rgba(0, 0, 0, 0.3)',
    transition: isSelected ? 'none' : 'all 0.2s'
  };

  const handleStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '8px',
    cursor: 'ew-resize',
    background: 'rgba(255, 255, 255, 0.1)',
    transition: 'background 0.2s'
  };

  return (
    <div
      className="timeline-clip"
      style={clipStyle}
      onMouseDown={(e) => {
        e.stopPropagation();
        onMouseDown(e, clip.id);
      }}
      title={asset.name || clip.id}
    >
      <style>{`
        .timeline-clip:hover {
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
        }

        .timeline-clip-handle:hover {
          background: rgba(255, 255, 255, 0.3) !important;
        }

        .clip-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
          pointer-events: none;
        }

        .clip-speed-badge {
          flex-shrink: 0;
          margin-left: 6px;
          padding: 1px 4px;
          border-radius: 3px;
          background: rgba(0, 0, 0, 0.35);
          color: #d8f0ff;
          font-size: 10px;
          line-height: 1.4;
          pointer-events: none;
        }
      `}</style>

      {/* Left resize handle */}
      <div
        className="timeline-clip-handle"
        style={{ ...handleStyle, left: 0 }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onResizeMouseDown(e, clip.id, 'left');
        }}
      />

      {/* Clip content */}
      <div className="clip-name">
        {asset.name || clip.id}
      </div>
      {showSpeedBadge && (
        <div className="clip-speed-badge">{clipSpeed.toFixed(2)}x</div>
      )}

      {/* Right resize handle */}
      <div
        className="timeline-clip-handle"
        style={{ ...handleStyle, right: 0 }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onResizeMouseDown(e, clip.id, 'right');
        }}
      />
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for React.memo
  // Only re-render if these props change
  return (
    prevProps.clip.id === nextProps.clip.id &&
    prevProps.clip.startTime === nextProps.clip.startTime &&
    prevProps.clip.duration === nextProps.clip.duration &&
    prevProps.clip.trimIn === nextProps.clip.trimIn &&
    prevProps.clip.speed === nextProps.clip.speed &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.zoom === nextProps.zoom &&
    prevProps.trackHeight === nextProps.trackHeight &&
    prevProps.asset.name === nextProps.asset.name
  );
});

TimelineClip.displayName = 'TimelineClip';

export default TimelineClip;
