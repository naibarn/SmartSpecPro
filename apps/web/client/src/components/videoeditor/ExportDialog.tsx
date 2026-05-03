/**
 * Export Dialog Component
 * Phase 2: Export settings and presets
 */

import React, { useState, useEffect } from 'react';
import { sanitizeRenderOutputFilename } from '@smartspec/shared';
import { videoEditorMediaLibrary } from '../../services/videoEditorService';
import type { VideoEditorProject, ExportSettings } from '../../types/videoEditor';

interface ExportDialogProps {
  project: VideoEditorProject;
  onExport: (outputPath: string, settings: ExportSettings) => void;
  onCancel: () => void;
}

interface ExportPreset {
  name: string;
  description: string;
  settings: ExportSettings;
  icon: string;
}

const EXPORT_PRESETS: ExportPreset[] = [
  {
    name: 'High Quality',
    description: '1080p, 10Mbps - Best quality',
    icon: '⭐',
    settings: {
      codec: 'h264_videotoolbox',
      bitrate: 10000,
      audioCodec: 'aac',
      audioBitrate: 320
    }
  },
  {
    name: 'Standard',
    description: '1080p, 6Mbps - Balanced',
    icon: '🎬',
    settings: {
      codec: 'h264_videotoolbox',
      bitrate: 6000,
      audioCodec: 'aac',
      audioBitrate: 192
    }
  },
  {
    name: 'YouTube',
    description: '1080p, 8Mbps - YouTube recommended',
    icon: '📺',
    settings: {
      codec: 'h264_videotoolbox',
      bitrate: 8000,
      audioCodec: 'aac',
      audioBitrate: 256
    }
  },
  {
    name: 'Web',
    description: '720p, 3Mbps - Smaller file',
    icon: '🌐',
    settings: {
      codec: 'h264_videotoolbox',
      bitrate: 3000,
      audioCodec: 'aac',
      audioBitrate: 128
    }
  },
  {
    name: 'Mobile',
    description: '720p, 2Mbps - Mobile optimized',
    icon: '📱',
    settings: {
      codec: 'h264_videotoolbox',
      bitrate: 2000,
      audioCodec: 'aac',
      audioBitrate: 96
    }
  }
];

export const ExportDialog: React.FC<ExportDialogProps> = ({
  project,
  onExport,
  onCancel
}) => {
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [customSettings, setCustomSettings] = useState<ExportSettings>(EXPORT_PRESETS[0].settings);
  const [outputPath, setOutputPath] = useState('');
  const [availableEncoders, setAvailableEncoders] = useState<string[]>([]);
  const [isCustom, setIsCustom] = useState(false);
  const [estimatedSize, setEstimatedSize] = useState(0);

  useEffect(() => {
    loadEncoders();
    generateDefaultOutputPath();
  }, []);

  useEffect(() => {
    calculateEstimatedSize();
  }, [customSettings, project.settings.duration]);

  const loadEncoders = async () => {
    try {
      const encoders = await videoEditorMediaLibrary.detectEncoders();
      setAvailableEncoders(encoders);

      // Update preset codecs to first available
      if (encoders.length > 0) {
        const firstEncoder = encoders[0];
        setCustomSettings(prev => ({ ...prev, codec: firstEncoder }));
      }
    } catch (error) {
      console.error('Failed to load encoders:', error);
    }
  };

  const generateDefaultOutputPath = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = sanitizeRenderOutputFilename(`${project.name}_${timestamp}.mp4`);
    setOutputPath(filename);
  };

  const calculateEstimatedSize = () => {
    // Estimate: (video bitrate + audio bitrate) * duration / 8 / 1024
    const totalBitrate = (customSettings.bitrate + customSettings.audioBitrate);
    const sizeKB = (totalBitrate * project.settings.duration) / 8;
    const sizeMB = sizeKB / 1024;
    setEstimatedSize(sizeMB);
  };

  const handlePresetSelect = (index: number) => {
    setSelectedPreset(index);
    setIsCustom(false);
    const preset = EXPORT_PRESETS[index];

    // Use first available encoder
    const settings = { ...preset.settings };
    if (availableEncoders.length > 0) {
      settings.codec = availableEncoders[0];
    }

    setCustomSettings(settings);
  };

  const handleCustomChange = (field: keyof ExportSettings, value: any) => {
    setIsCustom(true);
    setCustomSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleExport = () => {
    if (!outputPath.trim()) {
      alert('Please enter output filename');
      return;
    }

    const safeOutputPath = sanitizeRenderOutputFilename(outputPath);
    setOutputPath(safeOutputPath);
    onExport(safeOutputPath, customSettings);
  };

  const formatFileSize = (mb: number): string => {
    if (mb < 1000) {
      return `${mb.toFixed(1)} MB`;
    }
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  return (
    <div className="export-dialog-overlay">
      <style>{`
        .export-dialog-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .export-dialog {
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 8px;
          width: 700px;
          max-width: 90vw;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .dialog-header {
          padding: 16px 20px;
          border-bottom: 1px solid #444;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .dialog-title {
          font-size: 18px;
          font-weight: 600;
          color: #e0e0e0;
        }

        .close-button {
          background: transparent;
          border: none;
          color: #888;
          font-size: 24px;
          cursor: pointer;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .close-button:hover {
          color: #e0e0e0;
        }

        .dialog-content {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }

        .section {
          margin-bottom: 24px;
        }

        .section-title {
          font-size: 14px;
          font-weight: 600;
          color: #e0e0e0;
          margin-bottom: 12px;
        }

        .presets-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px;
        }

        .preset-card {
          background: #1e1e1e;
          border: 2px solid #444;
          border-radius: 6px;
          padding: 12px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
        }

        .preset-card:hover {
          border-color: #0078d4;
        }

        .preset-card.selected {
          border-color: #0078d4;
          background: #0078d420;
        }

        .preset-card.custom {
          border-color: #ffa500;
          background: #ffa50020;
        }

        .preset-icon {
          font-size: 32px;
          margin-bottom: 8px;
        }

        .preset-name {
          font-size: 13px;
          font-weight: 600;
          color: #e0e0e0;
          margin-bottom: 4px;
        }

        .preset-desc {
          font-size: 10px;
          color: #888;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: #e0e0e0;
          margin-bottom: 6px;
        }

        .form-input {
          width: 100%;
          padding: 8px 12px;
          background: #1e1e1e;
          border: 1px solid #444;
          border-radius: 4px;
          color: #e0e0e0;
          font-size: 13px;
        }

        .form-input:focus {
          outline: none;
          border-color: #0078d4;
        }

        .form-select {
          width: 100%;
          padding: 8px 12px;
          background: #1e1e1e;
          border: 1px solid #444;
          border-radius: 4px;
          color: #e0e0e0;
          font-size: 13px;
          cursor: pointer;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .info-box {
          background: #1e1e1e;
          border: 1px solid #444;
          border-radius: 6px;
          padding: 12px;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          margin-bottom: 6px;
        }

        .info-row:last-child {
          margin-bottom: 0;
        }

        .info-label {
          color: #888;
        }

        .info-value {
          color: #e0e0e0;
          font-weight: 600;
        }

        .dialog-footer {
          padding: 16px 20px;
          border-top: 1px solid #444;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .footer-left {
          font-size: 12px;
          color: #888;
        }

        .footer-buttons {
          display: flex;
          gap: 12px;
        }

        .dialog-button {
          padding: 8px 20px;
          border: none;
          border-radius: 4px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .dialog-button.secondary {
          background: #444;
          color: #e0e0e0;
        }

        .dialog-button.secondary:hover {
          background: #555;
        }

        .dialog-button.primary {
          background: #0078d4;
          color: white;
        }

        .dialog-button.primary:hover {
          background: #005a9e;
        }

        .encoder-badge {
          display: inline-block;
          padding: 2px 8px;
          background: #0078d420;
          border: 1px solid #0078d4;
          border-radius: 3px;
          font-size: 10px;
          color: #0078d4;
          margin-left: 8px;
        }
      `}</style>

      <div className="export-dialog">
        {/* Header */}
        <div className="dialog-header">
          <div className="dialog-title">📤 Export Video</div>
          <button className="close-button" onClick={onCancel}>×</button>
        </div>

        {/* Content */}
        <div className="dialog-content">
          {/* Presets */}
          <div className="section">
            <div className="section-title">Export Presets</div>
            <div className="presets-grid">
              {EXPORT_PRESETS.map((preset, index) => (
                <div
                  key={index}
                  className={`preset-card ${selectedPreset === index && !isCustom ? 'selected' : ''}`}
                  onClick={() => handlePresetSelect(index)}
                >
                  <div className="preset-icon">{preset.icon}</div>
                  <div className="preset-name">{preset.name}</div>
                  <div className="preset-desc">{preset.description}</div>
                </div>
              ))}
              {isCustom && (
                <div className="preset-card custom">
                  <div className="preset-icon">⚙️</div>
                  <div className="preset-name">Custom</div>
                  <div className="preset-desc">Modified settings</div>
                </div>
              )}
            </div>
          </div>

          {/* Output Settings */}
          <div className="section">
            <div className="section-title">Output File</div>
            <div className="form-group">
              <label className="form-label">Filename</label>
              <input
                type="text"
                className="form-input"
                aria-label="Filename"
                value={outputPath}
                onChange={(e) => setOutputPath(e.target.value)}
                placeholder="output.mp4"
              />
            </div>
          </div>

          {/* Video Settings */}
          <div className="section">
            <div className="section-title">Video Settings</div>
            <div className="form-group">
              <label className="form-label">
                Encoder
                {availableEncoders.length > 0 && (
                  <span className="encoder-badge">Hardware Accelerated</span>
                )}
              </label>
              <select
                className="form-select"
                value={customSettings.codec}
                onChange={(e) => handleCustomChange('codec', e.target.value)}
              >
                {availableEncoders.length > 0 ? (
                  availableEncoders.map(encoder => (
                    <option key={encoder} value={encoder}>{encoder}</option>
                  ))
                ) : (
                  <option value="h264_videotoolbox">h264_videotoolbox</option>
                )}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Video Bitrate (kbps)</label>
                <input
                  type="number"
                  className="form-input"
                  value={customSettings.bitrate}
                  onChange={(e) => handleCustomChange('bitrate', parseInt(e.target.value))}
                  min="1000"
                  max="50000"
                  step="1000"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Resolution</label>
                <select className="form-select" disabled>
                  <option>{project.settings.width}×{project.settings.height}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Audio Settings */}
          <div className="section">
            <div className="section-title">Audio Settings</div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Audio Codec</label>
                <select
                  className="form-select"
                  value={customSettings.audioCodec}
                  onChange={(e) => handleCustomChange('audioCodec', e.target.value)}
                >
                  <option value="aac">AAC</option>
                  <option value="mp3">MP3</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Audio Bitrate (kbps)</label>
                <input
                  type="number"
                  className="form-input"
                  value={customSettings.audioBitrate}
                  onChange={(e) => handleCustomChange('audioBitrate', parseInt(e.target.value))}
                  min="64"
                  max="320"
                  step="32"
                />
              </div>
            </div>
          </div>

          {/* Project Info */}
          <div className="section">
            <div className="section-title">Project Summary</div>
            <div className="info-box">
              <div className="info-row">
                <span className="info-label">Duration:</span>
                <span className="info-value">{project.settings.duration.toFixed(1)}s</span>
              </div>
              <div className="info-row">
                <span className="info-label">Clips:</span>
                <span className="info-value">
                  {project.timeline.tracks.reduce((sum, t) => sum + t.clips.length, 0)}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Estimated Size:</span>
                <span className="info-value">{formatFileSize(estimatedSize)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="dialog-footer">
          <div className="footer-left">
            <div>Export enters the render queue.</div>
            <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
              You can close this dialog and track progress in{' '}
              <a href="/tasks" target="_blank" rel="noopener noreferrer" style={{ color: '#0078d4', textDecoration: 'underline' }}>Task Queue</a>.
            </div>
          </div>
          <div className="footer-buttons">
            <button className="dialog-button secondary" onClick={onCancel}>
              Cancel
            </button>
            <button className="dialog-button primary" onClick={handleExport}>
              Export
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportDialog;
