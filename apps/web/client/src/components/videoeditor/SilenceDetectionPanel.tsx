/**
 * Silence Detection Panel - Trigger Button
 * Opens the full-screen SilenceDetectionDialog.
 * (Converted from full sidebar panel in section-02)
 */

import React from 'react';
import './SilenceDetectionPanel.css';

interface SilenceDetectionPanelProps {
  onOpenDialog: () => void;
}

const SilenceDetectionPanel: React.FC<SilenceDetectionPanelProps> = ({
  onOpenDialog,
}) => {
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
    </div>
  );
};

export default SilenceDetectionPanel;
