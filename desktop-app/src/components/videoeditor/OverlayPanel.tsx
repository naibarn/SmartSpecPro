/**
 * Overlay Panel Component
 * Configure position, scale, rotation, and pan/zoom keyframes for overlay clips
 */

import React, { useState, useEffect } from 'react';
import { type Clip, type ClipTransform, type TransformKeyframe } from '../../types/videoEditor';

interface OverlayPanelProps {
  selectedClip: Clip | null;
  onTransformChange: (clipId: string, transform: ClipTransform) => void;
  onGenerateOverlay?: (prompt: string, type: 'image' | 'video') => Promise<void>;
}

export const OverlayPanel: React.FC<OverlayPanelProps> = ({
  selectedClip,
  onTransformChange,
  onGenerateOverlay
}) => {
  // Default transform values
  const defaultTransform: ClipTransform = {
    x: 0.5,
    y: 0.5,
    scaleX: 1.0,
    scaleY: 1.0,
    rotation: 0,
    opacity: 1.0,
    keyframes: []
  };

  const [transform, setTransform] = useState<ClipTransform>(defaultTransform);
  const [selectedKeyframe, setSelectedKeyframe] = useState<number>(-1);
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [generateType, setGenerateType] = useState<'image' | 'video'>('image');
  const [isGenerating, setIsGenerating] = useState(false);

  // Update local state when selected clip changes
  useEffect(() => {
    if (selectedClip?.transform) {
      setTransform(selectedClip.transform);
    } else if (selectedClip) {
      setTransform(defaultTransform);
    }
  }, [selectedClip]);

  const handleTransformUpdate = (updates: Partial<ClipTransform>) => {
    if (!selectedClip) return;

    const newTransform = { ...transform, ...updates };
    setTransform(newTransform);
    onTransformChange(selectedClip.id, newTransform);
  };

  const handleAddKeyframe = () => {
    if (!selectedClip) return;

    const newKeyframe: TransformKeyframe = {
      time: 0.5, // Middle of clip
      x: transform.x,
      y: transform.y,
      scaleX: transform.scaleX,
      scaleY: transform.scaleY,
      rotation: transform.rotation,
      opacity: transform.opacity,
      easing: 'ease-in-out'
    };

    const newKeyframes = [...(transform.keyframes || []), newKeyframe];
    newKeyframes.sort((a, b) => a.time - b.time);

    handleTransformUpdate({ keyframes: newKeyframes });
  };

  const handleUpdateKeyframe = (index: number, updates: Partial<TransformKeyframe>) => {
    if (!selectedClip || !transform.keyframes) return;

    const newKeyframes = [...transform.keyframes];
    newKeyframes[index] = { ...newKeyframes[index], ...updates };
    handleTransformUpdate({ keyframes: newKeyframes });
  };

  const handleDeleteKeyframe = (index: number) => {
    if (!selectedClip || !transform.keyframes) return;

    const newKeyframes = transform.keyframes.filter((_, i) => i !== index);
    handleTransformUpdate({ keyframes: newKeyframes });
    setSelectedKeyframe(-1);
  };

  const handleGenerate = async () => {
    if (!onGenerateOverlay || !generatePrompt.trim()) return;

    setIsGenerating(true);
    try {
      await onGenerateOverlay(generatePrompt, generateType);
      setGeneratePrompt('');
    } catch (error) {
      console.error('Failed to generate overlay:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  // Preset transforms
  const applyPreset = (preset: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'pip') => {
    const presets: Record<string, Partial<ClipTransform>> = {
      'center': { x: 0.5, y: 0.5, scaleX: 1.0, scaleY: 1.0 },
      'top-left': { x: 0.2, y: 0.2, scaleX: 0.3, scaleY: 0.3 },
      'top-right': { x: 0.8, y: 0.2, scaleX: 0.3, scaleY: 0.3 },
      'bottom-left': { x: 0.2, y: 0.8, scaleX: 0.3, scaleY: 0.3 },
      'bottom-right': { x: 0.8, y: 0.8, scaleX: 0.3, scaleY: 0.3 },
      'pip': { x: 0.85, y: 0.85, scaleX: 0.25, scaleY: 0.25 }
    };

    handleTransformUpdate(presets[preset]);
  };

  if (!selectedClip) {
    return (
      <div className="overlay-panel">
        <style>{styles}</style>

        <div className="overlay-empty">
          <div className="empty-icon">🎨</div>
          <div>Select an overlay clip to configure</div>
        </div>

        {onGenerateOverlay && (
          <div className="generate-section">
            <div className="section-title">Generate Overlay</div>
            <div className="generate-controls">
              <div className="type-selector">
                <button
                  className={`type-button ${generateType === 'image' ? 'active' : ''}`}
                  onClick={() => setGenerateType('image')}
                >
                  🖼️ Image
                </button>
                <button
                  className={`type-button ${generateType === 'video' ? 'active' : ''}`}
                  onClick={() => setGenerateType('video')}
                >
                  🎬 Video
                </button>
              </div>

              <textarea
                className="generate-input"
                value={generatePrompt}
                onChange={(e) => setGeneratePrompt(e.target.value)}
                placeholder={`Describe the ${generateType} you want to generate...`}
                rows={3}
              />

              <button
                className="generate-button"
                onClick={handleGenerate}
                disabled={!generatePrompt.trim() || isGenerating}
              >
                {isGenerating ? '⏳ Generating...' : `✨ Generate ${generateType === 'image' ? 'Image' : 'Video'}`}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="overlay-panel">
      <style>{styles}</style>

      {/* Preset Layouts */}
      <div className="section">
        <div className="section-title">Layout Presets</div>
        <div className="presets-grid">
          <button className="preset-btn" onClick={() => applyPreset('center')}>
            📍 Center
          </button>
          <button className="preset-btn" onClick={() => applyPreset('top-left')}>
            ↖️ Top Left
          </button>
          <button className="preset-btn" onClick={() => applyPreset('top-right')}>
            ↗️ Top Right
          </button>
          <button className="preset-btn" onClick={() => applyPreset('bottom-left')}>
            ↙️ Bottom Left
          </button>
          <button className="preset-btn" onClick={() => applyPreset('bottom-right')}>
            ↘️ Bottom Right
          </button>
          <button className="preset-btn" onClick={() => applyPreset('pip')}>
            📺 PiP
          </button>
        </div>
      </div>

      {/* Transform Controls */}
      <div className="section">
        <div className="section-title">Transform</div>

        <div className="control-group">
          <label className="control-label">
            Position X
            <span className="control-value">{(transform.x * 100).toFixed(0)}%</span>
          </label>
          <input
            type="range"
            className="control-slider"
            min="0"
            max="1"
            step="0.01"
            value={transform.x}
            onChange={(e) => handleTransformUpdate({ x: parseFloat(e.target.value) })}
          />
        </div>

        <div className="control-group">
          <label className="control-label">
            Position Y
            <span className="control-value">{(transform.y * 100).toFixed(0)}%</span>
          </label>
          <input
            type="range"
            className="control-slider"
            min="0"
            max="1"
            step="0.01"
            value={transform.y}
            onChange={(e) => handleTransformUpdate({ y: parseFloat(e.target.value) })}
          />
        </div>

        <div className="control-group">
          <label className="control-label">
            Scale X
            <span className="control-value">{(transform.scaleX * 100).toFixed(0)}%</span>
          </label>
          <input
            type="range"
            className="control-slider"
            min="0.1"
            max="3"
            step="0.01"
            value={transform.scaleX}
            onChange={(e) => handleTransformUpdate({ scaleX: parseFloat(e.target.value) })}
          />
        </div>

        <div className="control-group">
          <label className="control-label">
            Scale Y
            <span className="control-value">{(transform.scaleY * 100).toFixed(0)}%</span>
          </label>
          <input
            type="range"
            className="control-slider"
            min="0.1"
            max="3"
            step="0.01"
            value={transform.scaleY}
            onChange={(e) => handleTransformUpdate({ scaleY: parseFloat(e.target.value) })}
          />
        </div>

        <div className="control-group">
          <label className="control-label">
            Rotation
            <span className="control-value">{transform.rotation.toFixed(0)}°</span>
          </label>
          <input
            type="range"
            className="control-slider"
            min="0"
            max="360"
            step="1"
            value={transform.rotation}
            onChange={(e) => handleTransformUpdate({ rotation: parseFloat(e.target.value) })}
          />
        </div>

        <div className="control-group">
          <label className="control-label">
            Opacity
            <span className="control-value">{(transform.opacity * 100).toFixed(0)}%</span>
          </label>
          <input
            type="range"
            className="control-slider"
            min="0"
            max="1"
            step="0.01"
            value={transform.opacity}
            onChange={(e) => handleTransformUpdate({ opacity: parseFloat(e.target.value) })}
          />
        </div>
      </div>

      {/* Keyframes */}
      <div className="section">
        <div className="section-header">
          <div className="section-title">Keyframes (Pan & Zoom)</div>
          <button className="add-keyframe-btn" onClick={handleAddKeyframe}>
            ➕ Add
          </button>
        </div>

        {transform.keyframes && transform.keyframes.length > 0 ? (
          <div className="keyframes-list">
            {transform.keyframes.map((kf, index) => (
              <div
                key={index}
                className={`keyframe-item ${selectedKeyframe === index ? 'selected' : ''}`}
                onClick={() => setSelectedKeyframe(index)}
              >
                <div className="keyframe-header">
                  <span>Keyframe {index + 1}</span>
                  <span className="keyframe-time">{(kf.time * 100).toFixed(0)}%</span>
                  <button
                    className="delete-keyframe-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteKeyframe(index);
                    }}
                  >
                    🗑️
                  </button>
                </div>

                {selectedKeyframe === index && (
                  <div className="keyframe-controls">
                    <label className="keyframe-control">
                      Time: {(kf.time * 100).toFixed(0)}%
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={kf.time}
                        onChange={(e) => handleUpdateKeyframe(index, { time: parseFloat(e.target.value) })}
                      />
                    </label>

                    <label className="keyframe-control">
                      Easing
                      <select
                        value={kf.easing || 'ease-in-out'}
                        onChange={(e) => handleUpdateKeyframe(index, { easing: e.target.value as any })}
                      >
                        <option value="linear">Linear</option>
                        <option value="ease-in">Ease In</option>
                        <option value="ease-out">Ease Out</option>
                        <option value="ease-in-out">Ease In-Out</option>
                      </select>
                    </label>

                    <div className="keyframe-values">
                      <span>Pos: ({(kf.x * 100).toFixed(0)}%, {(kf.y * 100).toFixed(0)}%)</span>
                      <span>Scale: ({(kf.scaleX * 100).toFixed(0)}%, {(kf.scaleY * 100).toFixed(0)}%)</span>
                      <span>Rot: {kf.rotation.toFixed(0)}°</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="keyframes-empty">
            No keyframes. Add keyframes to create pan & zoom effects.
          </div>
        )}
      </div>

      {/* Info */}
      <div className="info-box">
        <div className="info-title">💡 Tips</div>
        <ul className="info-list">
          <li>Use presets for quick positioning</li>
          <li>Add keyframes for smooth pan & zoom animations</li>
          <li>Adjust scale to resize overlay</li>
          <li>Use opacity for fade effects</li>
        </ul>
      </div>
    </div>
  );
};

const styles = `
  .overlay-panel {
    padding: 12px;
    background: #1e1e1e;
    color: #e0e0e0;
    height: 100%;
    overflow-y: auto;
  }

  .overlay-empty {
    text-align: center;
    padding: 40px 20px;
    color: #888;
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: 12px;
  }

  .section {
    margin-bottom: 20px;
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 12px;
  }

  .section-title {
    font-size: 12px;
    font-weight: 600;
    color: #0078d4;
    text-transform: uppercase;
    margin-bottom: 12px;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .presets-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .preset-btn {
    padding: 8px;
    background: #333;
    border: 1px solid #555;
    border-radius: 4px;
    color: #e0e0e0;
    cursor: pointer;
    font-size: 11px;
    transition: all 0.2s;
  }

  .preset-btn:hover {
    background: #444;
    border-color: #0078d4;
    transform: translateY(-1px);
  }

  .control-group {
    margin-bottom: 16px;
  }

  .control-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
    font-size: 11px;
    color: #ccc;
  }

  .control-value {
    color: #0078d4;
    font-weight: 600;
  }

  .control-slider {
    width: 100%;
    height: 6px;
    background: #333;
    border-radius: 3px;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
  }

  .control-slider::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    background: #0078d4;
    border-radius: 50%;
    cursor: pointer;
  }

  .control-slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    background: #0078d4;
    border-radius: 50%;
    cursor: pointer;
    border: none;
  }

  .add-keyframe-btn {
    padding: 4px 8px;
    background: #0078d4;
    border: none;
    border-radius: 4px;
    color: white;
    cursor: pointer;
    font-size: 11px;
    transition: background 0.2s;
  }

  .add-keyframe-btn:hover {
    background: #005a9e;
  }

  .keyframes-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .keyframe-item {
    background: #333;
    border: 1px solid #555;
    border-radius: 4px;
    padding: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .keyframe-item:hover {
    border-color: #0078d4;
  }

  .keyframe-item.selected {
    border-color: #0078d4;
    background: #3a3a3a;
  }

  .keyframe-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
  }

  .keyframe-time {
    color: #0078d4;
    font-weight: 600;
  }

  .delete-keyframe-btn {
    background: transparent;
    border: none;
    color: #ff6b6b;
    cursor: pointer;
    font-size: 14px;
    padding: 0;
    transition: transform 0.2s;
  }

  .delete-keyframe-btn:hover {
    transform: scale(1.2);
  }

  .keyframe-controls {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #555;
  }

  .keyframe-control {
    display: block;
    margin-bottom: 8px;
    font-size: 10px;
    color: #aaa;
  }

  .keyframe-control input,
  .keyframe-control select {
    width: 100%;
    margin-top: 4px;
    padding: 4px;
    background: #2a2a2a;
    border: 1px solid #555;
    border-radius: 3px;
    color: #e0e0e0;
    font-size: 11px;
  }

  .keyframe-values {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 8px;
    font-size: 10px;
    color: #888;
  }

  .keyframes-empty {
    text-align: center;
    padding: 20px;
    color: #666;
    font-size: 11px;
  }

  .info-box {
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 12px;
    margin-top: 20px;
  }

  .info-title {
    font-size: 11px;
    font-weight: 600;
    color: #ffa500;
    margin-bottom: 8px;
  }

  .info-list {
    margin: 0;
    padding-left: 20px;
    font-size: 10px;
    color: #aaa;
    line-height: 1.6;
  }

  .generate-section {
    margin-top: 20px;
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 12px;
  }

  .generate-controls {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .type-selector {
    display: flex;
    gap: 8px;
  }

  .type-button {
    flex: 1;
    padding: 8px;
    background: #333;
    border: 1px solid #555;
    border-radius: 4px;
    color: #e0e0e0;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }

  .type-button:hover {
    border-color: #0078d4;
  }

  .type-button.active {
    background: #0078d4;
    border-color: #0078d4;
  }

  .generate-input {
    width: 100%;
    padding: 8px;
    background: #1e1e1e;
    border: 1px solid #555;
    border-radius: 4px;
    color: #e0e0e0;
    font-size: 12px;
    font-family: inherit;
    resize: vertical;
  }

  .generate-button {
    padding: 10px;
    background: #0078d4;
    border: none;
    border-radius: 4px;
    color: white;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.2s;
  }

  .generate-button:hover:not(:disabled) {
    background: #005a9e;
    transform: translateY(-1px);
  }

  .generate-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export default OverlayPanel;
