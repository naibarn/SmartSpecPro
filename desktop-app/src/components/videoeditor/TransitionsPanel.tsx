/**
 * Transitions Panel Component
 * Configure fade in/out transitions for selected clip
 */

import React, { useState, useEffect } from 'react';
import { type Clip } from '../../types/videoEditor';

interface TransitionsPanelProps {
  selectedClip: Clip | null;
  onTransitionsChange: (clipId: string, transitions: { fadeIn?: number; fadeOut?: number }) => void;
}

export const TransitionsPanel: React.FC<TransitionsPanelProps> = ({
  selectedClip,
  onTransitionsChange
}) => {
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);

  // Update local state when selected clip changes
  useEffect(() => {
    if (selectedClip) {
      setFadeIn(selectedClip.transitions?.fadeIn || 0);
      setFadeOut(selectedClip.transitions?.fadeOut || 0);
    } else {
      setFadeIn(0);
      setFadeOut(0);
    }
  }, [selectedClip]);

  const handleFadeInChange = (value: number) => {
    if (!selectedClip) return;

    // Limit fade in to clip duration
    const maxFade = Math.min(value, selectedClip.duration / 2);
    setFadeIn(maxFade);
    onTransitionsChange(selectedClip.id, {
      fadeIn: maxFade,
      fadeOut
    });
  };

  const handleFadeOutChange = (value: number) => {
    if (!selectedClip) return;

    // Limit fade out to clip duration
    const maxFade = Math.min(value, selectedClip.duration / 2);
    setFadeOut(maxFade);
    onTransitionsChange(selectedClip.id, {
      fadeIn,
      fadeOut: maxFade
    });
  };

  const handlePresetClick = (preset: 'none' | 'quick' | 'smooth' | 'slow') => {
    if (!selectedClip) return;

    let fadeInValue = 0;
    let fadeOutValue = 0;

    switch (preset) {
      case 'quick':
        fadeInValue = 0.25;
        fadeOutValue = 0.25;
        break;
      case 'smooth':
        fadeInValue = 0.5;
        fadeOutValue = 0.5;
        break;
      case 'slow':
        fadeInValue = 1.0;
        fadeOutValue = 1.0;
        break;
    }

    // Limit to half of clip duration
    fadeInValue = Math.min(fadeInValue, selectedClip.duration / 2);
    fadeOutValue = Math.min(fadeOutValue, selectedClip.duration / 2);

    setFadeIn(fadeInValue);
    setFadeOut(fadeOutValue);
    onTransitionsChange(selectedClip.id, {
      fadeIn: fadeInValue,
      fadeOut: fadeOutValue
    });
  };

  if (!selectedClip) {
    return (
      <div className="transitions-panel">
        <style>{`
          .transitions-panel {
            padding: 20px;
            text-align: center;
            color: #888;
          }

          .transitions-empty {
            font-size: 48px;
            margin-bottom: 12px;
          }
        `}</style>

        <div className="transitions-empty">🎬</div>
        <div>Select a clip to configure transitions</div>
      </div>
    );
  }

  const maxFadeDuration = selectedClip.duration / 2;

  return (
    <div className="transitions-panel">
      <style>{`
        .transitions-panel {
          padding: 12px;
          background: #1e1e1e;
          color: #e0e0e0;
        }

        .transitions-section {
          margin-bottom: 20px;
        }

        .transitions-title {
          font-size: 12px;
          font-weight: 600;
          color: #888;
          text-transform: uppercase;
          margin-bottom: 12px;
        }

        .transition-control {
          margin-bottom: 16px;
        }

        .transition-label {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          font-size: 13px;
        }

        .transition-value {
          color: #0078d4;
          font-weight: 600;
        }

        .transition-slider {
          width: 100%;
          height: 6px;
          background: #333;
          border-radius: 3px;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
        }

        .transition-slider::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          background: #0078d4;
          border-radius: 50%;
          cursor: pointer;
        }

        .transition-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          background: #0078d4;
          border-radius: 50%;
          cursor: pointer;
          border: none;
        }

        .transitions-presets {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          margin-bottom: 16px;
        }

        .preset-button {
          padding: 8px 12px;
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 4px;
          color: #e0e0e0;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .preset-button:hover {
          background: #333;
          border-color: #0078d4;
        }

        .transitions-info {
          padding: 12px;
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 4px;
          font-size: 11px;
          color: #888;
        }

        .transitions-info-title {
          color: #0078d4;
          font-weight: 600;
          margin-bottom: 4px;
        }
      `}</style>

      <div className="transitions-section">
        <div className="transitions-title">Quick Presets</div>
        <div className="transitions-presets">
          <button className="preset-button" onClick={() => handlePresetClick('none')}>
            🚫 None
          </button>
          <button className="preset-button" onClick={() => handlePresetClick('quick')}>
            ⚡ Quick (0.25s)
          </button>
          <button className="preset-button" onClick={() => handlePresetClick('smooth')}>
            🌊 Smooth (0.5s)
          </button>
          <button className="preset-button" onClick={() => handlePresetClick('slow')}>
            🐌 Slow (1.0s)
          </button>
        </div>
      </div>

      <div className="transitions-section">
        <div className="transitions-title">Custom Transitions</div>

        <div className="transition-control">
          <div className="transition-label">
            <span>Fade In</span>
            <span className="transition-value">{fadeIn.toFixed(2)}s</span>
          </div>
          <input
            type="range"
            className="transition-slider"
            min="0"
            max={maxFadeDuration}
            step="0.05"
            value={fadeIn}
            onChange={(e) => handleFadeInChange(parseFloat(e.target.value))}
          />
        </div>

        <div className="transition-control">
          <div className="transition-label">
            <span>Fade Out</span>
            <span className="transition-value">{fadeOut.toFixed(2)}s</span>
          </div>
          <input
            type="range"
            className="transition-slider"
            min="0"
            max={maxFadeDuration}
            step="0.05"
            value={fadeOut}
            onChange={(e) => handleFadeOutChange(parseFloat(e.target.value))}
          />
        </div>
      </div>

      <div className="transitions-info">
        <div className="transitions-info-title">ℹ️ Transitions Info</div>
        <div>Clip Duration: {selectedClip.duration.toFixed(2)}s</div>
        <div>Max Fade: {maxFadeDuration.toFixed(2)}s</div>
      </div>
    </div>
  );
};

export default TransitionsPanel;
