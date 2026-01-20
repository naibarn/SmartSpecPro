/**
 * Toolbar Component
 * Phase 1: Timeline controls (zoom, undo/redo, tools)
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
  isDirty
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
      onZoomChange(50); // Reset to default
    }
  };

  return (
    <div className="toolbar">
      <style>{`
        .toolbar {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 8px 16px;
          background: #2a2a2a;
          border-bottom: 1px solid #444;
        }

        .toolbar-group {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 0 8px;
          border-right: 1px solid #444;
        }

        .toolbar-group:last-child {
          border-right: none;
          margin-left: auto;
        }

        .toolbar-button {
          width: 32px;
          height: 32px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 4px;
          color: #e0e0e0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          transition: all 0.2s;
        }

        .toolbar-button:hover:not(:disabled) {
          background: #333;
          border-color: #555;
        }

        .toolbar-button:active:not(:disabled) {
          background: #1a1a1a;
        }

        .toolbar-button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .toolbar-button.primary {
          background: #0078d4;
          border-color: #0078d4;
        }

        .toolbar-button.primary:hover:not(:disabled) {
          background: #005a9e;
        }

        .toolbar-button.danger {
          color: #ff6b6b;
        }

        .zoom-display {
          font-size: 12px;
          color: #e0e0e0;
          min-width: 60px;
          text-align: center;
        }

        .save-indicator {
          font-size: 11px;
          color: #888;
        }

        .save-indicator.dirty {
          color: #ffa500;
        }

        .toolbar-label {
          font-size: 11px;
          color: #888;
          margin-right: 4px;
        }
      `}</style>

      {/* Undo/Redo Group */}
      <div className="toolbar-group">
        <button
          className="toolbar-button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          ↶
        </button>
        <button
          className="toolbar-button"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          ↷
        </button>
      </div>

      {/* Zoom Group */}
      <div className="toolbar-group">
        <span className="toolbar-label">Zoom:</span>
        <button
          className="toolbar-button"
          onClick={handleZoomOut}
          disabled={zoom <= ZOOM_LEVELS[0]}
          title="Zoom Out (Ctrl+- or Ctrl+Scroll Down)"
          aria-label="Zoom out timeline"
        >
          🔍−
        </button>
        <div className="zoom-display">{Math.round(zoom)}px/s</div>
        <button
          className="toolbar-button"
          onClick={handleZoomIn}
          disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
          title="Zoom In (Ctrl++ or Ctrl+Scroll Up)"
          aria-label="Zoom in timeline"
        >
          🔍+
        </button>
        <button
          className="toolbar-button"
          onClick={handleZoomFit}
          title="Reset Zoom (Ctrl+0)"
          aria-label="Reset timeline zoom to default"
        >
          ⊡
        </button>
      </div>

      {/* Tools Group (Placeholder for future) */}
      <div className="toolbar-group">
        <button
          className="toolbar-button"
          title="Selection Tool (V)"
        >
          ➤
        </button>
        <button
          className="toolbar-button"
          title="Razor Tool (C)"
        >
          ✂
        </button>
      </div>

      {/* Save/Export Group */}
      <div className="toolbar-group">
        <button
          className="toolbar-button"
          onClick={onSave}
          title="Save Project (Ctrl+S)"
        >
          💾
        </button>
        <span className={`save-indicator ${isDirty ? 'dirty' : ''}`}>
          {isDirty ? '● Unsaved' : '✓ Saved'}
        </span>
      </div>

      <div className="toolbar-group">
        <button
          className="toolbar-button primary"
          onClick={onExport}
          title="Export Video"
        >
          📤 Export
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
