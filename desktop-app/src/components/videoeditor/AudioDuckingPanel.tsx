/**
 * Audio Ducking Panel Component
 * Phase 2: Configure audio ducking for voiceover
 */

import React from 'react';
import type { DuckingConfig, Track } from '../../types/videoEditor';

interface AudioDuckingPanelProps {
  ducking: DuckingConfig;
  tracks: Track[];
  onDuckingChange: (ducking: DuckingConfig) => void;
}

export const AudioDuckingPanel: React.FC<AudioDuckingPanelProps> = ({
  ducking,
  tracks,
  onDuckingChange
}) => {
  const audioTracks = tracks.filter(t => t.type === 'audio');

  const handleChange = (field: keyof DuckingConfig, value: any) => {
    onDuckingChange({ ...ducking, [field]: value });
  };

  const handlePreset = (preset: 'subtle' | 'moderate' | 'aggressive') => {
    const presets = {
      subtle: {
        threshold: 0.05,
        ratio: 3.0,
        attack: 20,
        release: 400,
        makeupGain: 0,
        backgroundGain: -0.5
      },
      moderate: {
        threshold: 0.03,
        ratio: 6.0,
        attack: 10,
        release: 300,
        makeupGain: 0,
        backgroundGain: -1.0
      },
      aggressive: {
        threshold: 0.02,
        ratio: 10.0,
        attack: 5,
        release: 200,
        makeupGain: 0,
        backgroundGain: -2.0
      }
    };

    onDuckingChange({ ...ducking, ...presets[preset] });
  };

  return (
    <div className="audio-ducking-panel">
      <style>{`
        .audio-ducking-panel {
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 6px;
          padding: 16px;
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .panel-title {
          font-size: 14px;
          font-weight: 600;
          color: #e0e0e0;
        }

        .toggle-switch {
          position: relative;
          width: 44px;
          height: 24px;
        }

        .toggle-input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #444;
          transition: 0.3s;
          border-radius: 24px;
        }

        .toggle-slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: 0.3s;
          border-radius: 50%;
        }

        .toggle-input:checked + .toggle-slider {
          background-color: #0078d4;
        }

        .toggle-input:checked + .toggle-slider:before {
          transform: translateX(20px);
        }

        .panel-content {
          opacity: 1;
          transition: opacity 0.3s;
        }

        .panel-content.disabled {
          opacity: 0.4;
          pointer-events: none;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-label {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          font-weight: 600;
          color: #e0e0e0;
          margin-bottom: 6px;
        }

        .label-value {
          color: #0078d4;
          font-weight: 700;
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

        .form-slider {
          width: 100%;
          height: 6px;
          background: #444;
          border-radius: 3px;
          outline: none;
          -webkit-appearance: none;
        }

        .form-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          background: #0078d4;
          cursor: pointer;
          border-radius: 50%;
        }

        .form-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          background: #0078d4;
          cursor: pointer;
          border-radius: 50%;
          border: none;
        }

        .presets-section {
          margin-bottom: 16px;
        }

        .presets-label {
          font-size: 11px;
          color: #888;
          margin-bottom: 8px;
        }

        .presets-buttons {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }

        .preset-button {
          padding: 6px 12px;
          background: #1e1e1e;
          border: 1px solid #444;
          border-radius: 4px;
          color: #e0e0e0;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .preset-button:hover {
          border-color: #0078d4;
          background: #0078d420;
        }

        .info-box {
          background: #1e1e1e;
          border: 1px solid #444;
          border-radius: 4px;
          padding: 10px;
          font-size: 11px;
          color: #888;
          line-height: 1.5;
        }

        .info-title {
          font-weight: 600;
          color: #e0e0e0;
          margin-bottom: 4px;
        }
      `}</style>

      {/* Header */}
      <div className="panel-header">
        <div className="panel-title">🎚️ Audio Ducking</div>
        <label className="toggle-switch">
          <input
            type="checkbox"
            className="toggle-input"
            checked={ducking.enabled}
            onChange={(e) => handleChange('enabled', e.target.checked)}
          />
          <span className="toggle-slider"></span>
        </label>
      </div>

      {/* Content */}
      <div className={`panel-content ${!ducking.enabled ? 'disabled' : ''}`}>
        {/* Voiceover Track Selection */}
        <div className="form-group">
          <label className="form-label">
            <span>Voiceover Track</span>
          </label>
          <select
            className="form-select"
            value={ducking.voiceoverTrackId}
            onChange={(e) => handleChange('voiceoverTrackId', e.target.value)}
          >
            {audioTracks.length > 0 ? (
              audioTracks.map(track => (
                <option key={track.id} value={track.id}>
                  {track.name} ({track.clips.length} clips)
                </option>
              ))
            ) : (
              <option value="">No audio tracks</option>
            )}
          </select>
        </div>

        {/* Presets */}
        <div className="presets-section">
          <div className="presets-label">Quick Presets:</div>
          <div className="presets-buttons">
            <button
              className="preset-button"
              onClick={() => handlePreset('subtle')}
            >
              Subtle
            </button>
            <button
              className="preset-button"
              onClick={() => handlePreset('moderate')}
            >
              Moderate
            </button>
            <button
              className="preset-button"
              onClick={() => handlePreset('aggressive')}
            >
              Aggressive
            </button>
          </div>
        </div>

        {/* Threshold */}
        <div className="form-group">
          <label className="form-label">
            <span>Threshold</span>
            <span className="label-value">{ducking.threshold.toFixed(3)}</span>
          </label>
          <input
            type="range"
            className="form-slider"
            min="0.01"
            max="0.1"
            step="0.001"
            value={ducking.threshold}
            onChange={(e) => handleChange('threshold', parseFloat(e.target.value))}
          />
        </div>

        {/* Ratio */}
        <div className="form-group">
          <label className="form-label">
            <span>Ratio</span>
            <span className="label-value">{ducking.ratio.toFixed(1)}:1</span>
          </label>
          <input
            type="range"
            className="form-slider"
            min="2"
            max="20"
            step="0.5"
            value={ducking.ratio}
            onChange={(e) => handleChange('ratio', parseFloat(e.target.value))}
          />
        </div>

        {/* Attack */}
        <div className="form-group">
          <label className="form-label">
            <span>Attack</span>
            <span className="label-value">{ducking.attack}ms</span>
          </label>
          <input
            type="range"
            className="form-slider"
            min="1"
            max="100"
            step="1"
            value={ducking.attack}
            onChange={(e) => handleChange('attack', parseInt(e.target.value))}
          />
        </div>

        {/* Release */}
        <div className="form-group">
          <label className="form-label">
            <span>Release</span>
            <span className="label-value">{ducking.release}ms</span>
          </label>
          <input
            type="range"
            className="form-slider"
            min="50"
            max="1000"
            step="10"
            value={ducking.release}
            onChange={(e) => handleChange('release', parseInt(e.target.value))}
          />
        </div>

        {/* Background Gain */}
        <div className="form-group">
          <label className="form-label">
            <span>Background Gain</span>
            <span className="label-value">{ducking.backgroundGain}dB</span>
          </label>
          <input
            type="range"
            className="form-slider"
            min="-10"
            max="0"
            step="0.5"
            value={ducking.backgroundGain}
            onChange={(e) => handleChange('backgroundGain', parseFloat(e.target.value))}
          />
        </div>

        {/* Info Box */}
        <div className="info-box">
          <div className="info-title">What is Audio Ducking?</div>
          Audio ducking automatically reduces background music volume when
          voiceover is speaking, making speech clearer and more intelligible.
        </div>
      </div>
    </div>
  );
};

export default AudioDuckingPanel;
