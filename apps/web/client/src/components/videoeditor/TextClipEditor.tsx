/**
 * Text Clip Editor - Create and edit text overlays on the T1 track
 * Supports Google Fonts, colors, backgrounds, and text effects
 */

import React, { useState, useEffect } from 'react';
import type { TextConfig } from '../../types/videoEditor';
import { STRICT_PARITY_SUPPORTED_TEXT_EFFECTS } from './textTimelineUtils';

const POPULAR_FONTS = [
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald',
  'Raleway', 'Poppins', 'Noto Sans', 'Ubuntu', 'Playfair Display',
  'Merriweather', 'Bebas Neue', 'Anton', 'Lobster', 'Pacifico',
  'Dancing Script', 'Permanent Marker', 'Shadows Into Light',
  'Kanit', 'Sarabun', 'Prompt', 'Noto Sans Thai',
];

const FONT_WEIGHTS = [
  { label: 'Light', value: 300 },
  { label: 'Regular', value: 400 },
  { label: 'Medium', value: 500 },
  { label: 'Semi Bold', value: 600 },
  { label: 'Bold', value: 700 },
  { label: 'Extra Bold', value: 800 },
];

const ALL_TEXT_EFFECTS = [
  { label: 'None', value: 'none' as const },
  { label: 'Shadow', value: 'shadow' as const },
  { label: 'Outline', value: 'outline' as const },
  { label: 'Glow', value: 'glow' as const },
  { label: 'Typewriter', value: 'typewriter' as const },
  { label: 'Fade In Word', value: 'fade-in-word' as const },
];

const TEXT_EFFECTS = ALL_TEXT_EFFECTS.filter((effect) =>
  STRICT_PARITY_SUPPORTED_TEXT_EFFECTS.includes(effect.value as (typeof STRICT_PARITY_SUPPORTED_TEXT_EFFECTS)[number]),
);

function getDefaultTextConfig(): TextConfig {
  return {
    text: 'Your Text Here',
    fontFamily: 'Roboto',
    fontSize: 48,
    fontWeight: 700,
    fontStyle: 'normal',
    color: '#ffffff',
    backgroundColor: 'transparent',
    textAlign: 'center',
    effect: 'none',
  };
}

// Load Google Font dynamically
function loadGoogleFont(family: string, weight: number = 400) {
  const id = `gfont-${family.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`;
  document.head.appendChild(link);
}

interface TextClipEditorProps {
  config?: TextConfig;
  duration?: number;
  onSave: (config: TextConfig, duration: number) => void;
  onCancel: () => void;
}

export const TextClipEditor: React.FC<TextClipEditorProps> = ({
  config,
  duration: initialDuration = 5,
  onSave,
  onCancel,
}) => {
  const [textConfig, setTextConfig] = useState<TextConfig>(config || getDefaultTextConfig());
  const [duration, setDuration] = useState(initialDuration);

  // Load the selected font
  useEffect(() => {
    loadGoogleFont(textConfig.fontFamily, textConfig.fontWeight);
  }, [textConfig.fontFamily, textConfig.fontWeight]);

  const update = (partial: Partial<TextConfig>) => {
    setTextConfig(prev => ({ ...prev, ...partial }));
  };

  const getPreviewStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      fontFamily: `'${textConfig.fontFamily}', sans-serif`,
      fontSize: `${Math.min(textConfig.fontSize, 60)}px`,
      fontWeight: textConfig.fontWeight,
      fontStyle: textConfig.fontStyle,
      color: textConfig.color,
      backgroundColor: textConfig.backgroundColor === 'transparent' ? 'transparent' : textConfig.backgroundColor,
      textAlign: textConfig.textAlign,
      padding: '8px 16px',
      borderRadius: '4px',
      wordBreak: 'break-word',
      maxWidth: '100%',
    };

    if (textConfig.effect === 'shadow') {
      base.textShadow = `2px 2px 4px ${textConfig.effectColor || '#000000'}`;
    } else if (textConfig.effect === 'outline') {
      const c = textConfig.effectColor || '#000000';
      base.textShadow = `-1px -1px 0 ${c}, 1px -1px 0 ${c}, -1px 1px 0 ${c}, 1px 1px 0 ${c}`;
    } else if (textConfig.effect === 'glow') {
      const c = textConfig.effectColor || '#0078d4';
      base.textShadow = `0 0 10px ${c}, 0 0 20px ${c}, 0 0 40px ${c}`;
    }

    return base;
  };

  return (
    <div className="text-clip-editor">
      <style>{`
        .text-clip-editor {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #1e1e1e;
          color: #e0e0e0;
        }
        .tce-header {
          padding: 12px;
          border-bottom: 1px solid #333;
          font-size: 14px;
          font-weight: 600;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .tce-body {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .tce-preview {
          background: #000;
          border-radius: 6px;
          min-height: 100px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          overflow: hidden;
        }
        .tce-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .tce-label {
          font-size: 11px;
          color: #888;
          text-transform: uppercase;
        }
        .tce-input, .tce-select, .tce-textarea {
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 4px;
          color: #e0e0e0;
          padding: 6px 8px;
          font-size: 12px;
          outline: none;
        }
        .tce-input:focus, .tce-select:focus, .tce-textarea:focus {
          border-color: #0078d4;
        }
        .tce-textarea {
          resize: vertical;
          min-height: 60px;
          font-family: inherit;
        }
        .tce-row {
          display: flex;
          gap: 8px;
        }
        .tce-row > .tce-field {
          flex: 1;
        }
        .tce-color-input {
          width: 36px;
          height: 30px;
          padding: 2px;
          border: 1px solid #444;
          border-radius: 4px;
          background: #2a2a2a;
          cursor: pointer;
        }
        .tce-color-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .tce-btn-group {
          display: flex;
          gap: 4px;
        }
        .tce-btn-group button {
          flex: 1;
          padding: 6px;
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 4px;
          color: #888;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s;
        }
        .tce-btn-group button:hover {
          background: #333;
        }
        .tce-btn-group button.active {
          background: #0078d4;
          border-color: #0078d4;
          color: #fff;
        }
        .tce-effects-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 4px;
        }
        .tce-effect-btn {
          padding: 6px 4px;
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 4px;
          color: #888;
          cursor: pointer;
          font-size: 11px;
          transition: all 0.2s;
          text-align: center;
        }
        .tce-effect-btn:hover {
          background: #333;
        }
        .tce-effect-btn.active {
          background: #0078d4;
          border-color: #0078d4;
          color: #fff;
        }
        .tce-footer {
          padding: 12px;
          border-top: 1px solid #333;
          display: flex;
          gap: 8px;
        }
        .tce-footer button {
          flex: 1;
          padding: 8px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
        }
        .tce-save-btn {
          background: #0078d4;
          color: #fff;
        }
        .tce-save-btn:hover {
          background: #005a9e;
        }
        .tce-cancel-btn {
          background: #444;
          color: #e0e0e0;
        }
        .tce-cancel-btn:hover {
          background: #555;
        }
      `}</style>

      <div className="tce-header">
        <span>Add Text Overlay</span>
      </div>

      <div className="tce-body">
        {/* Live Preview */}
        <div className="tce-preview">
          <div style={getPreviewStyle()}>
            {textConfig.text || 'Preview'}
          </div>
        </div>

        {/* Text Input */}
        <div className="tce-field">
          <div className="tce-label">Text</div>
          <textarea
            className="tce-textarea"
            value={textConfig.text}
            onChange={e => update({ text: e.target.value })}
            placeholder="Enter text..."
          />
        </div>

        {/* Font Family */}
        <div className="tce-field">
          <div className="tce-label">Font</div>
          <select
            className="tce-select"
            value={textConfig.fontFamily}
            onChange={e => update({ fontFamily: e.target.value })}
          >
            {POPULAR_FONTS.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        {/* Font Size + Weight */}
        <div className="tce-row">
          <div className="tce-field">
            <div className="tce-label">Size (px)</div>
            <input
              type="number"
              className="tce-input"
              min={8}
              max={200}
              value={textConfig.fontSize}
              onChange={e => update({ fontSize: parseInt(e.target.value) || 48 })}
            />
          </div>
          <div className="tce-field">
            <div className="tce-label">Weight</div>
            <select
              className="tce-select"
              value={textConfig.fontWeight}
              onChange={e => update({ fontWeight: parseInt(e.target.value) })}
            >
              {FONT_WEIGHTS.map(w => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Style + Align */}
        <div className="tce-row">
          <div className="tce-field">
            <div className="tce-label">Style</div>
            <div className="tce-btn-group">
              <button
                className={textConfig.fontStyle === 'normal' ? 'active' : ''}
                onClick={() => update({ fontStyle: 'normal' })}
              >
                Normal
              </button>
              <button
                className={textConfig.fontStyle === 'italic' ? 'active' : ''}
                onClick={() => update({ fontStyle: 'italic' })}
              >
                <em>Italic</em>
              </button>
            </div>
          </div>
          <div className="tce-field">
            <div className="tce-label">Align</div>
            <div className="tce-btn-group">
              <button className={textConfig.textAlign === 'left' ? 'active' : ''} onClick={() => update({ textAlign: 'left' })}>L</button>
              <button className={textConfig.textAlign === 'center' ? 'active' : ''} onClick={() => update({ textAlign: 'center' })}>C</button>
              <button className={textConfig.textAlign === 'right' ? 'active' : ''} onClick={() => update({ textAlign: 'right' })}>R</button>
            </div>
          </div>
        </div>

        {/* Colors */}
        <div className="tce-row">
          <div className="tce-field">
            <div className="tce-label">Text Color</div>
            <div className="tce-color-row">
              <input
                type="color"
                className="tce-color-input"
                value={textConfig.color}
                onChange={e => update({ color: e.target.value })}
              />
              <input
                type="text"
                className="tce-input"
                value={textConfig.color}
                onChange={e => update({ color: e.target.value })}
                style={{ flex: 1 }}
              />
            </div>
          </div>
          <div className="tce-field">
            <div className="tce-label">Background</div>
            <div className="tce-color-row">
              <input
                type="color"
                className="tce-color-input"
                value={textConfig.backgroundColor === 'transparent' ? '#000000' : textConfig.backgroundColor}
                onChange={e => update({ backgroundColor: e.target.value })}
              />
              <button
                style={{
                  padding: '4px 8px', background: textConfig.backgroundColor === 'transparent' ? '#0078d4' : '#2a2a2a',
                  border: '1px solid #444', borderRadius: '4px', color: '#e0e0e0', cursor: 'pointer', fontSize: '10px'
                }}
                onClick={() => update({ backgroundColor: textConfig.backgroundColor === 'transparent' ? '#000000' : 'transparent' })}
              >
                {textConfig.backgroundColor === 'transparent' ? 'None' : 'Clear'}
              </button>
            </div>
          </div>
        </div>

        {/* Effects */}
        <div className="tce-field">
          <div className="tce-label">Effect</div>
          <div className="tce-effects-grid">
            {TEXT_EFFECTS.map(eff => (
              <button
                key={eff.value}
                className={`tce-effect-btn ${textConfig.effect === eff.value ? 'active' : ''}`}
                onClick={() => update({ effect: eff.value })}
              >
                {eff.label}
              </button>
            ))}
          </div>
        </div>

        {/* Effect color (for shadow/outline/glow) */}
        {(textConfig.effect === 'shadow' || textConfig.effect === 'outline' || textConfig.effect === 'glow') && (
          <div className="tce-field">
            <div className="tce-label">Effect Color</div>
            <div className="tce-color-row">
              <input
                type="color"
                className="tce-color-input"
                value={textConfig.effectColor || '#000000'}
                onChange={e => update({ effectColor: e.target.value })}
              />
              <input
                type="text"
                className="tce-input"
                value={textConfig.effectColor || '#000000'}
                onChange={e => update({ effectColor: e.target.value })}
                style={{ flex: 1 }}
              />
            </div>
          </div>
        )}

        {/* Duration */}
        <div className="tce-field">
          <div className="tce-label">Duration (seconds)</div>
          <input
            type="number"
            className="tce-input"
            min={0.5}
            max={60}
            step={0.5}
            value={duration}
            onChange={e => setDuration(parseFloat(e.target.value) || 5)}
          />
        </div>
      </div>

      <div className="tce-footer">
        <button className="tce-cancel-btn" onClick={onCancel}>Cancel</button>
        <button
          className="tce-save-btn"
          onClick={() => onSave(textConfig, duration)}
          disabled={!textConfig.text.trim()}
        >
          {config ? 'Update Text' : 'Add to Timeline'}
        </button>
      </div>
    </div>
  );
};

export default TextClipEditor;
