/**
 * Toolbar Component
 * Positioned above the timeline with zoom, edit tools, and export
 */

import React from 'react';

interface ToolbarProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onExport: () => void;
  isDirty: boolean;
  rippleEditMode?: boolean;
  onToggleRippleEdit?: () => void;
  razorToolActive?: boolean;
  onToggleRazorTool?: () => void;
  selectedCount?: number;
  onGroupClips?: () => void;
  onUngroupClips?: () => void;
  onAddText?: () => void;
  onOpenSilenceDetection?: () => void;
  onExtractAudio?: () => void;
  onOpenKeyframes?: () => void;
}

const ZOOM_LEVELS = [10, 20, 30, 50, 75, 100, 150, 200];

export const Toolbar: React.FC<ToolbarProps> = ({
  zoom,
  onZoomChange,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onExport,
  isDirty,
  rippleEditMode = false,
  onToggleRippleEdit,
  razorToolActive = false,
  onToggleRazorTool,
  selectedCount = 0,
  onGroupClips,
  onUngroupClips,
  onAddText,
  onOpenSilenceDetection,
  onExtractAudio,
  onOpenKeyframes,
}) => {
  const handleZoomIn = () => {
    if (onZoomIn) {
      onZoomIn();
    } else {
      const currentIndex = ZOOM_LEVELS.findIndex(z => z >= zoom);
      if (currentIndex < ZOOM_LEVELS.length - 1) {
        onZoomChange(ZOOM_LEVELS[currentIndex + 1]);
      }
    }
  };

  const handleZoomOut = () => {
    if (onZoomOut) {
      onZoomOut();
    } else {
      const currentIndex = ZOOM_LEVELS.findIndex(z => z >= zoom);
      if (currentIndex > 0) {
        onZoomChange(ZOOM_LEVELS[currentIndex - 1]);
      }
    }
  };

  const handleZoomFit = () => {
    if (onResetZoom) {
      onResetZoom();
    } else {
      onZoomChange(50);
    }
  };

  return (
    <div className="toolbar">
      <style>{`
        .toolbar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          background: linear-gradient(180deg, #262626, #232323);
          border-bottom: 1px solid #333;
          min-height: 42px;
          flex-wrap: wrap;
        }

        .toolbar-group {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 3px;
          background: #1f1f1f;
          border: 1px solid #343434;
          border-radius: 8px;
        }

        .toolbar-group.right {
          margin-left: auto;
        }

        .tb {
          width: 30px;
          height: 30px;
          background: #242424;
          border: 1px solid #3a3a3a;
          border-radius: 6px;
          color: #ccc;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          transition: all 0.15s;
          flex-shrink: 0;
        }

        .tb:hover:not(:disabled) {
          background: #323232;
          border-color: #4f4f4f;
          color: #fff;
        }

        .tb:active:not(:disabled) {
          background: #1a1a1a;
        }

        .tb:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .tb.active {
          background: #0078d4;
          border-color: #0078d4;
          color: #fff;
        }

        .zoom-display {
          font-size: 11px;
          color: #aaa;
          min-width: 56px;
          text-align: center;
          white-space: nowrap;
          padding: 0 4px;
        }

        .tb-text {
          width: auto;
          min-width: 56px;
          padding: 0 10px;
          font-size: 11px;
          gap: 6px;
          font-weight: 600;
        }

        .tb-export {
          background: #0078d4;
          border-color: #0078d4;
          color: #fff;
          padding: 0 14px;
          height: 30px;
          font-size: 13px;
          font-weight: 600;
          border-radius: 6px;
          display: flex;
          align-items: center;
          gap: 6px;
          width: auto;
        }

        .tb-export:hover {
          background: #005a9e;
        }

        .save-state {
          font-size: 10px;
          color: #8fc6a0;
          border: 1px solid #3f5b48;
          background: #1f2d24;
          border-radius: 999px;
          padding: 3px 8px;
          line-height: 1;
        }

        .save-state.dirty {
          color: #ffcc7a;
          border-color: #6a5531;
          background: #30271b;
        }

        .sel-info {
          font-size: 11px;
          color: #7db8ff;
          white-space: nowrap;
          padding: 0 6px;
        }

        /* Mobile: single scrollable row instead of wrapping */
        @media (max-width: 639px) {
          .toolbar {
            flex-wrap: nowrap;
            overflow-x: auto;
            overflow-y: hidden;
            padding: 4px 8px;
            gap: 6px;
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          .toolbar::-webkit-scrollbar {
            display: none;
          }
          .toolbar-group {
            flex-shrink: 0;
          }
          .toolbar-group.right {
            margin-left: 0;
          }
          .zoom-display {
            min-width: 40px;
          }
        }
      `}</style>

      {/* Undo/Redo */}
      <div className="toolbar-group">
        <button className="tb" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">&#8630;</button>
        <button className="tb" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">&#8631;</button>
      </div>

      {/* Zoom */}
      <div className="toolbar-group">
        <button className="tb" onClick={handleZoomOut} disabled={zoom <= ZOOM_LEVELS[0]} title="Zoom Out">&#8722;</button>
        <div className="zoom-display">{Math.round(zoom)}px/s</div>
        <button className="tb" onClick={handleZoomIn} disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]} title="Zoom In">&#43;</button>
        <button className="tb" onClick={handleZoomFit} title="Reset Zoom">&#8861;</button>
      </div>

      {/* Tools */}
      <div className="toolbar-group">
        <button className="tb" title="Selection Tool (V)">&#10148;</button>
        {onToggleRazorTool && (
          <button
            className={`tb ${razorToolActive ? 'active' : ''}`}
            onClick={onToggleRazorTool}
            title={`Razor Tool: ${razorToolActive ? 'ON - Click clip to split at playhead' : 'OFF'} (C)`}
          >
            &#9986;
          </button>
        )}
        {onToggleRippleEdit && (
          <button
            className={`tb ${rippleEditMode ? 'active' : ''}`}
            onClick={onToggleRippleEdit}
            title={`Ripple Edit: ${rippleEditMode ? 'ON - close gaps while move/resize/delete' : 'OFF'}`}
          >
            &#127754;
          </button>
        )}
        {onAddText && (
          <button className="tb tb-text" onClick={onAddText} title="Add Text Overlay">
            T+
          </button>
        )}
        {onOpenSilenceDetection && (
          <button className="tb tb-text" onClick={onOpenSilenceDetection} title="Silence Detection - Cut Dead Air">
            🔇
          </button>
        )}
        {onOpenKeyframes && (
          <button className="tb tb-text" onClick={onOpenKeyframes} title="Open Keyframes Panel">
            ◆ KF
          </button>
        )}
      </div>

      {/* Selection info + Group */}
      {selectedCount > 0 && (
        <div className="toolbar-group">
          <span className="sel-info">{selectedCount} sel</span>
          {selectedCount >= 2 && onGroupClips && (
            <button className="tb tb-text" onClick={onGroupClips} title="Group clips">&#128279;</button>
          )}
          {selectedCount >= 1 && onUngroupClips && (
            <button className="tb tb-text" onClick={onUngroupClips} title="Ungroup">&#9986;</button>
          )}
          {selectedCount >= 1 && onExtractAudio && (
            <button className="tb tb-text" onClick={onExtractAudio} title="Extract Audio to A1">
              &#128266;
            </button>
          )}
        </div>
      )}

      {/* Save + Export (right-aligned) */}
      <div className="toolbar-group right">
        <button className="tb tb-text" onClick={onSave} title="Save Project (Ctrl+S)">
          <span>&#128190;</span>
          <span>Save</span>
        </button>
        <span className={`save-state ${isDirty ? 'dirty' : ''}`}>
          {isDirty ? 'Unsaved' : 'Saved'}
        </span>
        <button className="tb-export" onClick={onExport} title="Export Video">
          <span style={{ fontSize: '14px' }}>&#128228;</span>
          <span>Export</span>
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
