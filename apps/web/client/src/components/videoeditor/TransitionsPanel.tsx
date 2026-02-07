/**
 * Transitions & Effects Panel Component
 * Configure clip-to-clip transitions, fade in/out, and visual filter effects
 */

import React, { useState, useEffect } from 'react';
import { type Clip, type Effect, type ClipTransition, type TransitionName, type TransitionAlignment } from '../../types/videoEditor';

interface FilterState {
  brightness: number;   // 0-200, default 100
  contrast: number;     // 0-200, default 100
  saturate: number;     // 0-200, default 100
  blur: number;         // 0-20, default 0
  grayscale: number;    // 0-100, default 0
  sepia: number;        // 0-100, default 0
  hueRotate: number;    // 0-360, default 0
  invert: number;       // 0-100, default 0
}

const DEFAULT_FILTERS: FilterState = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  blur: 0,
  grayscale: 0,
  sepia: 0,
  hueRotate: 0,
  invert: 0,
};

const TRANSITION_OPTIONS: Array<{ name: TransitionName; label: string; icon: string; category: string }> = [
  { name: 'none',        label: 'None',        icon: '\u2298', category: 'Basic' },
  { name: 'crossfade',   label: 'Crossfade',   icon: '\u2715', category: 'Basic' },
  { name: 'wipeLeft',    label: 'Wipe Left',   icon: '\u25C0', category: 'Wipe' },
  { name: 'wipeRight',   label: 'Wipe Right',  icon: '\u25B6', category: 'Wipe' },
  { name: 'wipeUp',      label: 'Wipe Up',     icon: '\u25B2', category: 'Wipe' },
  { name: 'wipeDown',    label: 'Wipe Down',   icon: '\u25BC', category: 'Wipe' },
  { name: 'slideLeft',   label: 'Slide Left',  icon: '\u2B05', category: 'Slide' },
  { name: 'slideRight',  label: 'Slide Right', icon: '\u27A1', category: 'Slide' },
  { name: 'slideUp',     label: 'Slide Up',    icon: '\u2B06', category: 'Slide' },
  { name: 'slideDown',   label: 'Slide Down',  icon: '\u2B07', category: 'Slide' },
  { name: 'zoomIn',      label: 'Zoom In',     icon: '\u2295', category: 'Zoom' },
  { name: 'zoomOut',     label: 'Zoom Out',    icon: '\u2296', category: 'Zoom' },
  { name: 'circleOpen',  label: 'Circle Open', icon: '\u25CE', category: 'Shape' },
  { name: 'circleClose', label: 'Circle Close',icon: '\u25CF', category: 'Shape' },
  { name: 'diamondOpen', label: 'Diamond',     icon: '\u25C7', category: 'Shape' },
  { name: 'blur',        label: 'Blur',        icon: '\u224B', category: 'Style' },
  { name: 'pixelize',    label: 'Pixelize',    icon: '\u25A6', category: 'Style' },
  { name: 'radial',      label: 'Radial',      icon: '\u2600', category: 'Style' },
  { name: 'smoothLeft',  label: 'Smooth L',    icon: '\u219E', category: 'Style' },
  { name: 'smoothRight', label: 'Smooth R',    icon: '\u21A0', category: 'Style' },
];

const ALIGNMENT_OPTIONS: Array<{ value: TransitionAlignment; label: string; icon: string }> = [
  { value: 'end',    label: 'At End',   icon: '\u25C1\u25AA' },
  { value: 'center', label: 'Center',   icon: '\u25AA\u25C6\u25AA' },
  { value: 'start',  label: 'At Start', icon: '\u25AA\u25B7' },
];

interface TransitionsPanelProps {
  selectedClip: Clip | null;
  previousClip: Clip | null;
  nextClip: Clip | null;
  onTransitionsChange: (clipId: string, transitions: { fadeIn?: number; fadeOut?: number }) => void;
  onEffectsChange?: (clipId: string, effects: Effect[]) => void;
  onClipTransitionChange?: (clipId: string, transition: ClipTransition | undefined) => void;
}

export const TransitionsPanel: React.FC<TransitionsPanelProps> = ({
  selectedClip,
  previousClip,
  nextClip,
  onTransitionsChange,
  onEffectsChange,
  onClipTransitionChange,
}) => {
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);
  const [filters, setFilters] = useState<FilterState>({ ...DEFAULT_FILTERS });
  const [transitionDuration, setTransitionDuration] = useState(500);
  // Track which transition the user is editing: 'incoming' (on selectedClip) or 'outgoing' (on nextClip)
  const [editingDirection, setEditingDirection] = useState<'incoming' | 'outgoing'>('incoming');

  // The "active transition clip" is the clip whose inTransition we're editing
  // incoming: selectedClip.inTransition, outgoing: nextClip.inTransition
  const transitionClip = editingDirection === 'incoming' ? selectedClip : nextClip;
  const adjacentClip = editingDirection === 'incoming' ? previousClip : selectedClip;

  // Determine which directions are available
  const hasIncoming = !!previousClip;
  const hasOutgoing = !!nextClip;

  // Auto-select valid direction when selectedClip changes
  useEffect(() => {
    if (hasIncoming) {
      setEditingDirection('incoming');
    } else if (hasOutgoing) {
      setEditingDirection('outgoing');
    }
  }, [selectedClip?.id, hasIncoming, hasOutgoing]);

  // Update local state when selected clip changes
  useEffect(() => {
    if (selectedClip) {
      setFadeIn(selectedClip.transitions?.fadeIn || 0);
      setFadeOut(selectedClip.transitions?.fadeOut || 0);

      // Load transition duration from the relevant clip
      const trClip = editingDirection === 'incoming' ? selectedClip : nextClip;
      setTransitionDuration(trClip?.inTransition?.durationMs || 500);

      // Load existing filter effects
      const filterEffect = selectedClip.effects?.find(e => e.type === 'filter');
      if (filterEffect?.parameters) {
        setFilters({ ...DEFAULT_FILTERS, ...filterEffect.parameters });
      } else {
        setFilters({ ...DEFAULT_FILTERS });
      }
    } else {
      setFadeIn(0);
      setFadeOut(0);
      setTransitionDuration(500);
      setFilters({ ...DEFAULT_FILTERS });
    }
  }, [selectedClip, editingDirection, nextClip]);

  // Auto-clamp transition duration when clips change (e.g. after resize/trim)
  useEffect(() => {
    if (!transitionClip?.inTransition || !adjacentClip || !onClipTransitionChange) return;
    if (transitionClip.inTransition.name === 'none') return;
    const maxMs = Math.floor(Math.min(transitionClip.duration, adjacentClip.duration) * 1000);
    if (maxMs <= 0) return;
    if (transitionClip.inTransition.durationMs > maxMs) {
      setTransitionDuration(maxMs);
      onClipTransitionChange(transitionClip.id, {
        name: transitionClip.inTransition.name,
        durationMs: maxMs,
        alignment: transitionClip.inTransition.alignment,
      });
    }
  }, [transitionClip?.id, transitionClip?.duration, adjacentClip?.duration]);

  const handleFadeInChange = (value: number) => {
    if (!selectedClip) return;
    const maxFade = Math.min(value, selectedClip.duration / 2);
    setFadeIn(maxFade);
    onTransitionsChange(selectedClip.id, { fadeIn: maxFade, fadeOut });
  };

  const handleFadeOutChange = (value: number) => {
    if (!selectedClip) return;
    const maxFade = Math.min(value, selectedClip.duration / 2);
    setFadeOut(maxFade);
    onTransitionsChange(selectedClip.id, { fadeIn, fadeOut: maxFade });
  };

  const handlePresetClick = (preset: 'none' | 'quick' | 'smooth' | 'slow') => {
    if (!selectedClip) return;
    let fadeInValue = 0;
    let fadeOutValue = 0;
    switch (preset) {
      case 'quick': fadeInValue = 0.25; fadeOutValue = 0.25; break;
      case 'smooth': fadeInValue = 0.5; fadeOutValue = 0.5; break;
      case 'slow': fadeInValue = 1.0; fadeOutValue = 1.0; break;
    }
    fadeInValue = Math.min(fadeInValue, selectedClip.duration / 2);
    fadeOutValue = Math.min(fadeOutValue, selectedClip.duration / 2);
    setFadeIn(fadeInValue);
    setFadeOut(fadeOutValue);
    onTransitionsChange(selectedClip.id, { fadeIn: fadeInValue, fadeOut: fadeOutValue });
  };

  const handleFilterChange = (key: keyof FilterState, value: number) => {
    if (!selectedClip || !onEffectsChange) return;
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    emitFilterEffects(newFilters);
  };

  const emitFilterEffects = (f: FilterState) => {
    if (!selectedClip || !onEffectsChange) return;

    const isDefault = Object.keys(DEFAULT_FILTERS).every(
      k => f[k as keyof FilterState] === DEFAULT_FILTERS[k as keyof FilterState]
    );

    const otherEffects = (selectedClip.effects || []).filter(e => e.type !== 'filter');
    if (isDefault) {
      onEffectsChange(selectedClip.id, otherEffects);
    } else {
      onEffectsChange(selectedClip.id, [
        ...otherEffects,
        { type: 'filter', parameters: { ...f } },
      ]);
    }
  };

  const handleFilterPreset = (preset: 'none' | 'warm' | 'cool' | 'bw' | 'vintage' | 'vivid') => {
    if (!selectedClip || !onEffectsChange) return;
    let f: FilterState;
    switch (preset) {
      case 'warm':    f = { ...DEFAULT_FILTERS, saturate: 120, hueRotate: 10, brightness: 105 }; break;
      case 'cool':    f = { ...DEFAULT_FILTERS, saturate: 90, hueRotate: 200, brightness: 95 }; break;
      case 'bw':      f = { ...DEFAULT_FILTERS, grayscale: 100 }; break;
      case 'vintage': f = { ...DEFAULT_FILTERS, sepia: 40, contrast: 110, brightness: 95, saturate: 80 }; break;
      case 'vivid':   f = { ...DEFAULT_FILTERS, saturate: 160, contrast: 115, brightness: 105 }; break;
      default:        f = { ...DEFAULT_FILTERS }; break;
    }
    setFilters(f);
    emitFilterEffects(f);
  };

  const handleClipTransitionSelect = (name: TransitionName) => {
    if (!transitionClip || !onClipTransitionChange) return;
    if (name === 'none') {
      onClipTransitionChange(transitionClip.id, undefined);
    } else {
      const currentAlignment = transitionClip.inTransition?.alignment || 'center';
      onClipTransitionChange(transitionClip.id, { name, durationMs: transitionDuration, alignment: currentAlignment });
    }
  };

  const handleTransitionDurationChange = (ms: number) => {
    if (!transitionClip || !onClipTransitionChange) return;
    setTransitionDuration(ms);
    const currentName = transitionClip.inTransition?.name;
    if (currentName && currentName !== 'none') {
      onClipTransitionChange(transitionClip.id, {
        name: currentName,
        durationMs: ms,
        alignment: transitionClip.inTransition?.alignment || 'center',
      });
    }
  };

  const handleAlignmentChange = (alignment: TransitionAlignment) => {
    if (!transitionClip || !onClipTransitionChange) return;
    const current = transitionClip.inTransition;
    if (!current || current.name === 'none') return;
    onClipTransitionChange(transitionClip.id, { ...current, alignment });
  };

  if (!selectedClip) {
    return (
      <div className="transitions-panel">
        <style>{`
          .transitions-panel { padding: 20px; text-align: center; color: #888; }
          .transitions-empty { font-size: 48px; margin-bottom: 12px; }
        `}</style>
        <div className="transitions-empty">✨</div>
        <div>Select a clip to configure effects</div>
      </div>
    );
  }

  const maxFadeDuration = selectedClip.duration / 2;

  const filterControls: Array<{ key: keyof FilterState; label: string; min: number; max: number; step: number; unit: string }> = [
    { key: 'brightness', label: 'Brightness', min: 0, max: 200, step: 1, unit: '%' },
    { key: 'contrast',   label: 'Contrast',   min: 0, max: 200, step: 1, unit: '%' },
    { key: 'saturate',   label: 'Saturation',  min: 0, max: 200, step: 1, unit: '%' },
    { key: 'blur',       label: 'Blur',        min: 0, max: 20,  step: 0.5, unit: 'px' },
    { key: 'grayscale',  label: 'Grayscale',   min: 0, max: 100, step: 1, unit: '%' },
    { key: 'sepia',      label: 'Sepia',       min: 0, max: 100, step: 1, unit: '%' },
    { key: 'hueRotate',  label: 'Hue Rotate',  min: 0, max: 360, step: 1, unit: '°' },
    { key: 'invert',     label: 'Invert',      min: 0, max: 100, step: 1, unit: '%' },
  ];

  // Current active transition (from whichever direction is being edited)
  const activeTransition = transitionClip?.inTransition;
  const currentAlignment = activeTransition?.alignment || 'center';

  return (
    <div className="transitions-panel">
      <style>{`
        .transitions-panel { padding: 12px; background: #1e1e1e; color: #e0e0e0; overflow-y: auto; max-height: 100%; }
        .transitions-section { margin-bottom: 20px; }
        .transitions-title { font-size: 12px; font-weight: 600; color: #888; text-transform: uppercase; margin-bottom: 12px; }
        .transition-control { margin-bottom: 12px; }
        .transition-label { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 13px; }
        .transition-value { color: #0078d4; font-weight: 600; font-size: 12px; }
        .transition-slider { width: 100%; height: 6px; background: #333; border-radius: 3px; cursor: pointer; appearance: none; -webkit-appearance: none; }
        .transition-slider::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; background: #0078d4; border-radius: 50%; cursor: pointer; }
        .transition-slider::-moz-range-thumb { width: 14px; height: 14px; background: #0078d4; border-radius: 50%; cursor: pointer; border: none; }
        .transitions-presets { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-bottom: 12px; }
        .preset-button { padding: 6px 10px; background: #2a2a2a; border: 1px solid #444; border-radius: 4px; color: #e0e0e0; font-size: 11px; cursor: pointer; transition: all 0.2s; }
        .preset-button:hover { background: #333; border-color: #0078d4; }
        .filter-presets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 12px; }
        .filter-preset-btn { padding: 8px 4px; background: #2a2a2a; border: 1px solid #444; border-radius: 4px; color: #e0e0e0; font-size: 10px; cursor: pointer; transition: all 0.2s; text-align: center; }
        .filter-preset-btn:hover { background: #333; border-color: #0078d4; }
        .filter-preset-icon { font-size: 18px; display: block; margin-bottom: 2px; }
        .filter-reset-btn { display: inline-block; font-size: 10px; color: #888; cursor: pointer; margin-left: 8px; text-decoration: underline; }
        .filter-reset-btn:hover { color: #0078d4; }
        .clip-transition-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-bottom: 12px; }
        .clip-transition-btn { padding: 6px 2px; background: #2a2a2a; border: 1px solid #444; border-radius: 4px; color: #e0e0e0; font-size: 9px; cursor: pointer; transition: all 0.2s; text-align: center; }
        .clip-transition-btn:hover { background: #333; border-color: #0078d4; }
        .clip-transition-btn.active { background: #0078d420; border-color: #0078d4; color: #0078d4; }
        .clip-transition-icon { font-size: 16px; display: block; margin-bottom: 1px; }
        .clip-transition-unavailable { padding: 12px; text-align: center; color: #666; font-size: 11px; font-style: italic; }
        .section-divider { border: none; border-top: 1px solid #333; margin: 16px 0; }
        .transitions-info { padding: 10px; background: #2a2a2a; border: 1px solid #444; border-radius: 4px; font-size: 11px; color: #888; }
        .transitions-info-title { color: #0078d4; font-weight: 600; margin-bottom: 4px; }
        .direction-tabs { display: flex; gap: 4px; margin-bottom: 12px; }
        .direction-tab { flex: 1; padding: 6px 8px; background: #2a2a2a; border: 1px solid #444; border-radius: 4px; color: #888; font-size: 11px; cursor: pointer; transition: all 0.2s; text-align: center; }
        .direction-tab:hover { background: #333; border-color: #555; }
        .direction-tab.active { background: #0078d420; border-color: #0078d4; color: #0078d4; }
        .direction-tab.disabled { opacity: 0.35; cursor: not-allowed; pointer-events: none; }
        .alignment-row { display: flex; gap: 4px; margin-bottom: 12px; }
        .alignment-btn { flex: 1; padding: 5px 4px; background: #2a2a2a; border: 1px solid #444; border-radius: 4px; color: #aaa; font-size: 10px; cursor: pointer; transition: all 0.2s; text-align: center; }
        .alignment-btn:hover { background: #333; border-color: #555; }
        .alignment-btn.active { background: #0078d420; border-color: #0078d4; color: #0078d4; }
        .alignment-icon { font-size: 11px; display: block; margin-bottom: 1px; letter-spacing: 1px; }
      `}</style>

      {/* Clip-to-Clip Transitions Section */}
      <div className="transitions-section">
        <div className="transitions-title">Clip Transitions</div>

        {(hasIncoming || hasOutgoing) ? (
          <>
            {/* Direction tabs: Incoming / Outgoing */}
            <div className="direction-tabs">
              <button
                className={`direction-tab ${editingDirection === 'incoming' ? 'active' : ''} ${!hasIncoming ? 'disabled' : ''}`}
                onClick={() => hasIncoming && setEditingDirection('incoming')}
                title={hasIncoming ? 'Transition from previous clip' : 'No previous clip'}
              >
                ← Incoming
              </button>
              <button
                className={`direction-tab ${editingDirection === 'outgoing' ? 'active' : ''} ${!hasOutgoing ? 'disabled' : ''}`}
                onClick={() => hasOutgoing && setEditingDirection('outgoing')}
                title={hasOutgoing ? 'Transition to next clip' : 'No next clip'}
              >
                Outgoing →
              </button>
            </div>

            {/* Transition type grid */}
            <div className="clip-transition-grid">
              {TRANSITION_OPTIONS.map(({ name, label, icon }) => (
                <button
                  key={name}
                  className={`clip-transition-btn ${
                    (activeTransition?.name === name || (!activeTransition && name === 'none'))
                      ? 'active' : ''
                  }`}
                  onClick={() => handleClipTransitionSelect(name)}
                  title={label}
                >
                  <span className="clip-transition-icon">{icon}</span>
                  {label}
                </button>
              ))}
            </div>

            {/* Duration slider + alignment — shown when a transition is active */}
            {activeTransition && activeTransition.name !== 'none' && transitionClip && adjacentClip && (() => {
              const rawMax = Math.floor(Math.min(transitionClip.duration, adjacentClip.duration) * 1000);
              const sliderMin = Math.min(200, rawMax);
              const sliderMax = Math.max(sliderMin, Math.min(2000, rawMax));
              const clampedValue = Math.max(sliderMin, Math.min(transitionDuration, sliderMax));
              return (
                <>
                  <div className="transition-control">
                    <div className="transition-label">
                      <span>Duration</span>
                      <span className="transition-value">{clampedValue}ms</span>
                    </div>
                    <input
                      type="range"
                      className="transition-slider"
                      min={sliderMin}
                      max={sliderMax}
                      step={50}
                      value={clampedValue}
                      onChange={(e) => handleTransitionDurationChange(parseInt(e.target.value))}
                    />
                  </div>
                  <div className="transition-control">
                    <div className="transition-label">
                      <span>Alignment</span>
                      <span className="transition-value">{currentAlignment}</span>
                    </div>
                    <div className="alignment-row">
                      {ALIGNMENT_OPTIONS.map(({ value, label, icon }) => (
                        <button
                          key={value}
                          className={`alignment-btn ${currentAlignment === value ? 'active' : ''}`}
                          onClick={() => handleAlignmentChange(value)}
                          title={label}
                        >
                          <span className="alignment-icon">{icon}</span>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}
          </>
        ) : (
          <div className="clip-transition-unavailable">
            Single clip on track — no clip transition available
          </div>
        )}
      </div>

      <hr className="section-divider" />

      {/* Fade In/Out Section */}
      <div className="transitions-section">
        <div className="transitions-title">Fade Presets</div>
        <div className="transitions-presets">
          <button className="preset-button" onClick={() => handlePresetClick('none')}>None</button>
          <button className="preset-button" onClick={() => handlePresetClick('quick')}>Quick (0.25s)</button>
          <button className="preset-button" onClick={() => handlePresetClick('smooth')}>Smooth (0.5s)</button>
          <button className="preset-button" onClick={() => handlePresetClick('slow')}>Slow (1.0s)</button>
        </div>
      </div>

      <div className="transitions-section">
        <div className="transitions-title">Fade In / Out</div>
        <div className="transition-control">
          <div className="transition-label">
            <span>Fade In</span>
            <span className="transition-value">{fadeIn.toFixed(2)}s</span>
          </div>
          <input type="range" className="transition-slider" min="0" max={maxFadeDuration} step="0.05" value={fadeIn} onChange={(e) => handleFadeInChange(parseFloat(e.target.value))} />
        </div>
        <div className="transition-control">
          <div className="transition-label">
            <span>Fade Out</span>
            <span className="transition-value">{fadeOut.toFixed(2)}s</span>
          </div>
          <input type="range" className="transition-slider" min="0" max={maxFadeDuration} step="0.05" value={fadeOut} onChange={(e) => handleFadeOutChange(parseFloat(e.target.value))} />
        </div>
      </div>

      <hr className="section-divider" />

      {/* Filter Effects Section */}
      <div className="transitions-section">
        <div className="transitions-title">Filter Presets</div>
        <div className="filter-presets">
          <button className="filter-preset-btn" onClick={() => handleFilterPreset('none')}><span className="filter-preset-icon">⊘</span>None</button>
          <button className="filter-preset-btn" onClick={() => handleFilterPreset('warm')}><span className="filter-preset-icon">🌅</span>Warm</button>
          <button className="filter-preset-btn" onClick={() => handleFilterPreset('cool')}><span className="filter-preset-icon">❄️</span>Cool</button>
          <button className="filter-preset-btn" onClick={() => handleFilterPreset('bw')}><span className="filter-preset-icon">⬛</span>B&W</button>
          <button className="filter-preset-btn" onClick={() => handleFilterPreset('vintage')}><span className="filter-preset-icon">📷</span>Vintage</button>
          <button className="filter-preset-btn" onClick={() => handleFilterPreset('vivid')}><span className="filter-preset-icon">🎨</span>Vivid</button>
        </div>
      </div>

      <div className="transitions-section">
        <div className="transitions-title">
          Adjustments
          <span className="filter-reset-btn" onClick={() => handleFilterPreset('none')}>Reset All</span>
        </div>
        {filterControls.map(({ key, label, min, max, step, unit }) => (
          <div className="transition-control" key={key}>
            <div className="transition-label">
              <span>{label}</span>
              <span className="transition-value">{filters[key]}{unit}</span>
            </div>
            <input type="range" className="transition-slider" min={min} max={max} step={step} value={filters[key]} onChange={(e) => handleFilterChange(key, parseFloat(e.target.value))} />
          </div>
        ))}
      </div>

      <div className="transitions-info">
        <div className="transitions-info-title">Clip Info</div>
        <div>Duration: {selectedClip.duration.toFixed(2)}s</div>
        <div>Max Fade: {maxFadeDuration.toFixed(2)}s</div>
      </div>
    </div>
  );
};

export default TransitionsPanel;
