/**
 * History Panel Component
 * Shows undo/redo history stack with visual timeline
 */

import React from 'react';
import { type VideoEditorProject } from '../../types/videoEditor';

interface HistoryPanelProps {
  history: VideoEditorProject[];
  currentIndex: number;
  onJumpTo: (index: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
  history,
  currentIndex,
  onJumpTo,
  canUndo,
  canRedo,
  onUndo,
  onRedo
}) => {
  const getActionDescription = (index: number): string => {
    if (index === 0) return 'Initial State';

    const prev = history[index - 1];
    const current = history[index];

    // Detect what changed
    const prevClipCount = prev.timeline.tracks.reduce((sum, t) => sum + t.clips.length, 0);
    const currClipCount = current.timeline.tracks.reduce((sum, t) => sum + t.clips.length, 0);

    if (currClipCount > prevClipCount) {
      return `Add Clip (${currClipCount - prevClipCount})`;
    } else if (currClipCount < prevClipCount) {
      return `Delete Clip (${prevClipCount - currClipCount})`;
    }

    // Check for resolution changes
    if (prev.settings.width !== current.settings.width ||
        prev.settings.height !== current.settings.height) {
      return `Change Resolution (${current.settings.width}×${current.settings.height})`;
    }

    // Check for ducking changes
    if (prev.audioMixing.ducking.enabled !== current.audioMixing.ducking.enabled) {
      return current.audioMixing.ducking.enabled ? 'Enable Ducking' : 'Disable Ducking';
    }

    return 'Edit Project';
  };

  const formatTimestamp = (project: VideoEditorProject): string => {
    const date = new Date(project.modifiedAt);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="history-panel">
      <style>{`
        .history-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #1e1e1e;
          color: #e0e0e0;
        }

        .history-header {
          padding: 12px;
          border-bottom: 1px solid #333;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .history-title {
          font-size: 14px;
          font-weight: 600;
        }

        .history-controls {
          display: flex;
          gap: 4px;
        }

        .history-control-btn {
          width: 28px;
          height: 28px;
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 3px;
          color: #e0e0e0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .history-control-btn:hover:not(:disabled) {
          background: #333;
          border-color: #0078d4;
        }

        .history-control-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .history-content {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }

        .history-timeline {
          position: relative;
          padding-left: 24px;
        }

        .history-timeline::before {
          content: '';
          position: absolute;
          left: 8px;
          top: 0;
          bottom: 0;
          width: 2px;
          background: #444;
        }

        .history-item {
          position: relative;
          padding: 8px 12px;
          margin-bottom: 4px;
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .history-item:hover {
          background: #333;
          border-color: #0078d4;
        }

        .history-item.current {
          background: #0078d4;
          border-color: #0078d4;
          box-shadow: 0 0 8px rgba(0, 120, 212, 0.4);
        }

        .history-item.future {
          opacity: 0.4;
        }

        .history-item::before {
          content: '';
          position: absolute;
          left: -20px;
          top: 50%;
          transform: translateY(-50%);
          width: 8px;
          height: 8px;
          background: #666;
          border-radius: 50%;
          border: 2px solid #1e1e1e;
        }

        .history-item.current::before {
          background: #0078d4;
          box-shadow: 0 0 8px rgba(0, 120, 212, 0.6);
        }

        .history-item-description {
          font-size: 12px;
          font-weight: 500;
          margin-bottom: 2px;
        }

        .history-item-timestamp {
          font-size: 10px;
          color: #888;
        }

        .history-stats {
          padding: 12px;
          border-top: 1px solid #333;
          font-size: 11px;
          color: #888;
          text-align: center;
        }
      `}</style>

      <div className="history-header">
        <div className="history-title">📜 History</div>
        <div className="history-controls">
          <button
            className="history-control-btn"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            ↶
          </button>
          <button
            className="history-control-btn"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
          >
            ↷
          </button>
        </div>
      </div>

      <div className="history-content">
        <div className="history-timeline">
          {history.map((project, index) => (
            <div
              key={index}
              className={`history-item ${index === currentIndex ? 'current' : ''} ${index > currentIndex ? 'future' : ''}`}
              onClick={() => onJumpTo(index)}
            >
              <div className="history-item-description">
                {getActionDescription(index)}
              </div>
              <div className="history-item-timestamp">
                {formatTimestamp(project)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="history-stats">
        {currentIndex + 1} / {history.length} states • {history.length - currentIndex - 1} redos available
      </div>
    </div>
  );
};

export default HistoryPanel;
