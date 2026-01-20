/**
 * Aspect Ratio Selector Component
 * Allows user to change video resolution to common aspect ratios
 */

import React from 'react';
import type { ProjectSettings } from '../../types/videoEditor';

interface AspectRatioSelectorProps {
  currentSettings: ProjectSettings;
  onResolutionChange: (width: number, height: number) => void;
}

interface AspectRatioPreset {
  name: string;
  ratio: string;
  width: number;
  height: number;
  icon: string;
  description: string;
}

const ASPECT_RATIO_PRESETS: AspectRatioPreset[] = [
  // 16:9 - Landscape (YouTube, TV)
  {
    name: 'YouTube HD',
    ratio: '16:9',
    width: 1920,
    height: 1080,
    icon: '🖥️',
    description: 'YouTube, TV, Desktop'
  },
  {
    name: '4K Landscape',
    ratio: '16:9',
    width: 3840,
    height: 2160,
    icon: '🎬',
    description: '4K Ultra HD'
  },
  {
    name: 'HD Landscape',
    ratio: '16:9',
    width: 1280,
    height: 720,
    icon: '📺',
    description: '720p HD'
  },

  // 9:16 - Vertical (TikTok, Instagram Reels, Stories)
  {
    name: 'TikTok/Reels',
    ratio: '9:16',
    width: 1080,
    height: 1920,
    icon: '📱',
    description: 'TikTok, IG Reels, Stories'
  },
  {
    name: '4K Vertical',
    ratio: '9:16',
    width: 2160,
    height: 3840,
    icon: '📲',
    description: '4K Vertical'
  },

  // 1:1 - Square (Instagram Post, Facebook)
  {
    name: 'Instagram Post',
    ratio: '1:1',
    width: 1080,
    height: 1080,
    icon: '⬜',
    description: 'Instagram Feed, Facebook'
  },
  {
    name: '4K Square',
    ratio: '1:1',
    width: 2160,
    height: 2160,
    icon: '🔲',
    description: '4K Square'
  },

  // 4:5 - Portrait (Instagram Portrait)
  {
    name: 'Instagram Portrait',
    ratio: '4:5',
    width: 1080,
    height: 1350,
    icon: '📸',
    description: 'Instagram Portrait Mode'
  },
];

export const AspectRatioSelector: React.FC<AspectRatioSelectorProps> = ({
  currentSettings,
  onResolutionChange
}) => {
  const currentResolution = `${currentSettings.width}x${currentSettings.height}`;

  const handlePresetClick = (preset: AspectRatioPreset) => {
    onResolutionChange(preset.width, preset.height);
  };

  const isCurrentPreset = (preset: AspectRatioPreset): boolean => {
    return preset.width === currentSettings.width &&
           preset.height === currentSettings.height;
  };

  // Group presets by aspect ratio
  const groupedPresets = ASPECT_RATIO_PRESETS.reduce((acc, preset) => {
    if (!acc[preset.ratio]) {
      acc[preset.ratio] = [];
    }
    acc[preset.ratio].push(preset);
    return acc;
  }, {} as Record<string, AspectRatioPreset[]>);

  return (
    <div className="aspect-ratio-selector">
      <style>{`
        .aspect-ratio-selector {
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 6px;
          padding: 16px;
        }

        .selector-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .selector-title {
          font-size: 14px;
          font-weight: 600;
          color: #e0e0e0;
        }

        .current-resolution {
          font-size: 12px;
          color: #0078d4;
          font-weight: 600;
          background: #0078d420;
          padding: 4px 8px;
          border-radius: 4px;
        }

        .ratio-groups {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .ratio-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .ratio-group-header {
          font-size: 11px;
          color: #888;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .ratio-badge {
          background: #444;
          color: #e0e0e0;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 10px;
          font-weight: 700;
        }

        .presets-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }

        .preset-card {
          background: #1e1e1e;
          border: 2px solid #444;
          border-radius: 6px;
          padding: 10px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }

        .preset-card:hover {
          border-color: #0078d4;
          background: #0078d410;
        }

        .preset-card.active {
          border-color: #0078d4;
          background: #0078d420;
        }

        .preset-card.active::before {
          content: '✓';
          position: absolute;
          top: 8px;
          right: 8px;
          color: #0078d4;
          font-weight: 700;
          font-size: 14px;
        }

        .preset-card {
          position: relative;
        }

        .preset-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }

        .preset-icon {
          font-size: 20px;
        }

        .preset-name {
          font-size: 13px;
          font-weight: 600;
          color: #e0e0e0;
        }

        .preset-resolution {
          font-size: 11px;
          color: #0078d4;
          font-weight: 600;
          margin-bottom: 2px;
        }

        .preset-description {
          font-size: 10px;
          color: #888;
          line-height: 1.3;
        }

        .custom-section {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #444;
        }

        .custom-header {
          font-size: 11px;
          color: #888;
          font-weight: 600;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .custom-inputs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .custom-input-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .custom-label {
          font-size: 10px;
          color: #888;
          font-weight: 600;
        }

        .custom-input {
          padding: 6px 8px;
          background: #1e1e1e;
          border: 1px solid #444;
          border-radius: 4px;
          color: #e0e0e0;
          font-size: 12px;
        }

        .custom-input:focus {
          outline: none;
          border-color: #0078d4;
        }

        .info-box {
          margin-top: 12px;
          background: #1e1e1e;
          border: 1px solid #444;
          border-radius: 4px;
          padding: 8px;
          font-size: 10px;
          color: #888;
          line-height: 1.4;
        }

        .info-title {
          font-weight: 600;
          color: #e0e0e0;
          margin-bottom: 4px;
        }
      `}</style>

      {/* Header */}
      <div className="selector-header">
        <div className="selector-title">📐 Aspect Ratio</div>
        <div className="current-resolution">{currentResolution}</div>
      </div>

      {/* Grouped Presets */}
      <div className="ratio-groups">
        {Object.entries(groupedPresets).map(([ratio, presets]) => (
          <div key={ratio} className="ratio-group">
            <div className="ratio-group-header">
              {ratio === '16:9' && 'Landscape'}
              {ratio === '9:16' && 'Vertical'}
              {ratio === '1:1' && 'Square'}
              {ratio === '4:5' && 'Portrait'}
              <span className="ratio-badge">{ratio}</span>
            </div>

            <div className="presets-grid">
              {presets.map((preset) => (
                <div
                  key={`${preset.width}x${preset.height}`}
                  className={`preset-card ${isCurrentPreset(preset) ? 'active' : ''}`}
                  onClick={() => handlePresetClick(preset)}
                >
                  <div className="preset-header">
                    <span className="preset-icon">{preset.icon}</span>
                    <span className="preset-name">{preset.name}</span>
                  </div>
                  <div className="preset-resolution">
                    {preset.width}×{preset.height}
                  </div>
                  <div className="preset-description">{preset.description}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Info Box */}
      <div className="info-box">
        <div className="info-title">💡 Tip</div>
        Changing aspect ratio will update your project resolution. Existing clips will be
        scaled to fit the new dimensions.
      </div>
    </div>
  );
};

export default AspectRatioSelector;
