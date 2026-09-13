/**
 * Silence Detection Panel - Trigger Button
 * Opens the full-screen SilenceDetectionDialog.
 * (Converted from full sidebar panel in section-02)
 */

import React from 'react';
import './SilenceDetectionPanel.css';
import type { QueueEditorOperation } from './EditorPanelShared';

interface SilenceDetectionPanelProps {
  onOpenDialog: () => void;
  onQueueOperation?: QueueEditorOperation;
  sourceAssetIds?: string[];
}

const SilenceDetectionPanel: React.FC<SilenceDetectionPanelProps> = ({
  onOpenDialog,
  onQueueOperation,
  sourceAssetIds = [],
}) => {
  const queueSilenceAnalysis = async () => {
    if (!onQueueOperation) return;
    await onQueueOperation('media.silence_detect', {
      preset: 'natural',
      thresholdDb: -35,
      minimumSilenceSeconds: 0.4,
      paddingBeforeSeconds: 0.08,
      paddingAfterSeconds: 0.08,
      reviewRequired: true,
    }, sourceAssetIds);
  };

  return (
    <div className="silence-detection-panel">
      <div className="panel-header">
        <h3>Silence Detection</h3>
        <p className="panel-description">
          Automatically detect and remove silent regions from your video
        </p>
      </div>

      <button
        className="analyze-button"
        onClick={onOpenDialog}
        data-testid="open-silence-dialog"
      >
        Open Silence Detection
      </button>
      {onQueueOperation && sourceAssetIds.length > 0 && (
        <button
          className="analyze-button"
          onClick={() => void queueSilenceAnalysis()}
          data-testid="queue-silence-worker"
        >
          ส่ง Quick Silence Cut เข้า Worker
        </button>
      )}
    </div>
  );
};

export default SilenceDetectionPanel;
