/**
 * Text Clip Editor - Create and edit text overlays on the T1 track
 * Supports Google Fonts, colors, backgrounds, and text effects
 */

import React, { useState, useEffect, useRef } from 'react';
import type { ClipTransform, TextConfig } from '../../types/videoEditor';
import { clamp01, DEFAULT_CLIP_TRANSFORM } from './transformKeyframes';
import { STRICT_PARITY_SUPPORTED_TEXT_EFFECTS } from './textTimelineUtils';

const POPULAR_FONTS = [
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald',
  'Raleway', 'Poppins', 'Noto Sans', 'Ubuntu', 'Playfair Display',
  'Merriweather', 'Bebas Neue', 'Anton', 'Lobster', 'Pacifico',
  'Dancing Script', 'Permanent Marker', 'Shadows Into Light',
  'Kanit', 'Sarabun', 'Prompt', 'Noto Sans Thai', 'Bangers',
  'Paytone One', 'Fredoka One', 'Righteous', 'Boogaloo', 'Nunito',
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

interface TextPresetDefinition {
  id: string;
  label: string;
  previewSize: number;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  patch: Partial<TextConfig>;
}

interface TextStyleCardDefinition {
  id: string;
  label: string;
  sublabel: string;
  preview: string;
  patch: Partial<TextConfig>;
  previewStyle: React.CSSProperties;
  accent: string;
}

const TEXT_STYLE_PRESETS: TextPresetDefinition[] = [
  {
    id: 'heading',
    label: 'Heading',
    previewSize: 18,
    fontWeight: 700,
    fontStyle: 'normal',
    patch: { fontSize: 64, fontWeight: 700, fontStyle: 'normal', textAlign: 'left', lineHeight: 1.1, letterSpacing: 0, backgroundColor: 'transparent' },
  },
  {
    id: 'subheading',
    label: 'Subheading',
    previewSize: 15,
    fontWeight: 600,
    fontStyle: 'normal',
    patch: { fontSize: 44, fontWeight: 600, fontStyle: 'normal', textAlign: 'left', lineHeight: 1.2, letterSpacing: 0, backgroundColor: 'transparent' },
  },
  {
    id: 'body',
    label: 'Body',
    previewSize: 14,
    fontWeight: 400,
    fontStyle: 'normal',
    patch: { fontSize: 32, fontWeight: 400, fontStyle: 'normal', textAlign: 'left', lineHeight: 1.5, letterSpacing: 0, backgroundColor: 'transparent' },
  },
  {
    id: 'caption',
    label: 'Caption',
    previewSize: 13,
    fontWeight: 400,
    fontStyle: 'italic',
    patch: { fontSize: 22, fontWeight: 400, fontStyle: 'italic', textAlign: 'left', lineHeight: 1.4, letterSpacing: 0.05, backgroundColor: 'transparent' },
  },
  {
    id: 'citation',
    label: 'Citation',
    previewSize: 13,
    fontWeight: 500,
    fontStyle: 'italic',
    patch: { fontSize: 26, fontWeight: 500, fontStyle: 'italic', textAlign: 'right', lineHeight: 1.3, letterSpacing: 0.1, backgroundColor: 'transparent' },
  },
  {
    id: 'overline',
    label: 'OVERLINE',
    previewSize: 11,
    fontWeight: 700,
    fontStyle: 'normal',
    patch: { fontSize: 18, fontWeight: 700, fontStyle: 'normal', textAlign: 'left', lineHeight: 1.3, letterSpacing: 2, backgroundColor: 'transparent' },
  },
];

const TEXT_EFFECT_CARDS: TextStyleCardDefinition[] = [
  {
    id: 'none',
    label: 'Text',
    sublabel: 'NONE',
    preview: 'Text',
    accent: '#71717a',
    patch: { color: '#ffffff', backgroundColor: 'transparent', effect: 'none', effectColor: undefined, textShadow: undefined, textStroke: undefined, fontFamily: 'Poppins', fontWeight: 700 },
    previewStyle: { fontFamily: 'Poppins, sans-serif', fontSize: '1.7rem', color: '#e5e7eb', fontWeight: 700 },
  },
  {
    id: 'blue',
    label: 'Blue outline',
    sublabel: 'OUTLINE',
    preview: 'BLUE',
    accent: '#3b82f6',
    patch: { color: '#60a5fa', effect: 'outline', effectColor: '#ffffff', textStroke: '3px #ffffff', textShadow: '3px 3px 0px #1e3a8a, 0 0 15px #3b82f6', fontFamily: 'Bangers', fontWeight: 700 },
    previewStyle: { fontFamily: 'Bangers, cursive', fontSize: '2rem', color: '#60a5fa', WebkitTextStroke: '2.5px #ffffff', textShadow: '3px 3px 0 #1e3a8a, 0 0 12px #3b82f6' },
  },
  {
    id: 'red',
    label: 'Red bold',
    sublabel: 'BOLD',
    preview: 'RED',
    accent: '#ef4444',
    patch: { color: '#ef4444', effect: 'outline', effectColor: '#1a0000', textStroke: '3px #1a0000', textShadow: '4px 4px 0px #7f1d1d, 0 0 15px #ef4444', fontFamily: 'Paytone One', fontWeight: 700 },
    previewStyle: { fontFamily: "'Paytone One', sans-serif", fontSize: '1.9rem', color: '#ef4444', WebkitTextStroke: '2.5px #1a0000', textShadow: '4px 4px 0 #7f1d1d' },
  },
  {
    id: 'gold',
    label: 'Gold glow',
    sublabel: 'GLOW',
    preview: 'GOLD',
    accent: '#fbbf24',
    patch: { color: '#fbbf24', effect: 'glow', effectColor: '#fbbf24', textStroke: '3px #92400e', textShadow: '4px 4px 0px #78350f, 0 0 20px #fbbf24, 0 0 40px #f59e0b', fontFamily: 'Bebas Neue', fontWeight: 700, letterSpacing: 0.05 },
    previewStyle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: '2.2rem', color: '#fbbf24', WebkitTextStroke: '2.5px #92400e', textShadow: '3px 3px 0 #78350f, 0 0 16px #fbbf24' },
  },
  {
    id: 'purple',
    label: 'Purple magic',
    sublabel: 'PURPLE',
    preview: 'Magic',
    accent: '#7c3aed',
    patch: { color: '#c4b5fd', effect: 'glow', effectColor: '#7c3aed', textStroke: '3px #4c1d95', textShadow: '3px 3px 0px #4c1d95, 0 0 20px #7c3aed, 0 0 40px #7c3aed', fontFamily: 'Fredoka One', fontWeight: 700 },
    previewStyle: { fontFamily: "'Fredoka One', cursive", fontSize: '1.9rem', color: '#c4b5fd', WebkitTextStroke: '2.5px #4c1d95', textShadow: '2px 2px 0 #4c1d95, 0 0 15px #7c3aed' },
  },
  {
    id: 'neon',
    label: 'Neon green',
    sublabel: 'GLOW',
    preview: 'Neon',
    accent: '#22c55e',
    patch: { color: '#ffffff', effect: 'glow', effectColor: '#22c55e', textStroke: '2px #22c55e', textShadow: '0 0 10px #22c55e, 0 0 25px #16a34a, 0 0 50px #15803d, 0 0 80px #14532d', fontFamily: 'Righteous', fontWeight: 700 },
    previewStyle: { fontFamily: 'Righteous, cursive', fontSize: '1.9rem', color: '#ffffff', WebkitTextStroke: '1.5px #22c55e', textShadow: '0 0 10px #22c55e, 0 0 25px #16a34a, 0 0 40px #15803d' },
  },
  {
    id: '3d',
    label: '3D depth',
    sublabel: 'DEPTH',
    preview: '3D',
    accent: '#94a3b8',
    patch: { color: '#e2e8f0', effect: 'shadow', effectColor: '#475569', textStroke: '2px #475569', textShadow: '1px 1px 0 #cbd5e1, 2px 2px 0 #94a3b8, 3px 3px 0 #64748b, 4px 4px 0 #475569, 5px 5px 8px rgba(0,0,0,0.7)', fontFamily: 'Oswald', fontWeight: 700 },
    previewStyle: { fontFamily: 'Oswald, sans-serif', fontSize: '2rem', color: '#e2e8f0', WebkitTextStroke: '1.5px #475569', textShadow: '1px 1px 0 #94a3b8, 3px 3px 0 #475569, 5px 5px 6px rgba(0,0,0,0.6)' },
  },
  {
    id: 'hollow',
    label: 'Hollow',
    sublabel: 'HOLLOW',
    preview: 'Open',
    accent: '#d4d4d8',
    patch: { color: 'transparent', effect: 'outline', effectColor: '#ffffff', textStroke: '4px #ffffff', textShadow: '0 0 10px rgba(255,255,255,0.4)', fontFamily: 'Boogaloo', fontWeight: 700 },
    previewStyle: { fontFamily: 'Boogaloo, cursive', fontSize: '2rem', color: 'transparent', WebkitTextStroke: '2.5px #ffffff' },
  },
];

const SUBTITLE_STYLE_CARDS: TextStyleCardDefinition[] = [
  {
    id: 'classic',
    label: 'Classic',
    sublabel: '',
    preview: 'Lorem ipsum dolor sit amet',
    accent: '#a1a1aa',
    patch: { color: '#ffffff', backgroundColor: 'rgba(0,0,0,0.7)', effect: 'none', textStroke: undefined, textShadow: 'none', fontSize: 32, fontWeight: 400, textAlign: 'center', fontFamily: 'Poppins', lineHeight: 1.5, letterSpacing: 0 },
    previewStyle: { fontFamily: 'Poppins, sans-serif', fontSize: '0.95rem', color: '#fff', background: 'rgba(0,0,0,0.7)', padding: '4px 16px', borderRadius: '4px', fontWeight: 400 },
  },
  {
    id: 'yellow',
    label: 'Yellow',
    sublabel: '',
    preview: 'Lorem ipsum dolor sit amet',
    accent: '#facc15',
    patch: { color: '#0a0a0a', backgroundColor: '#facc15', effect: 'none', textStroke: undefined, textShadow: 'none', fontSize: 30, fontWeight: 700, textAlign: 'center', fontFamily: 'Nunito', lineHeight: 1.4, letterSpacing: 0 },
    previewStyle: { fontFamily: 'Nunito, sans-serif', fontSize: '0.9rem', fontWeight: 800, color: '#0a0a0a', background: '#facc15', padding: '4px 12px', borderRadius: '2px' },
  },
  {
    id: 'gradient',
    label: 'Gradient',
    sublabel: '',
    preview: 'Please Put Your Title Here',
    accent: '#a855f7',
    patch: { color: '#ffffff', backgroundColor: 'rgba(168,85,247,0.75)', effect: 'shadow', effectColor: '#000000', textStroke: undefined, textShadow: '0 2px 8px rgba(0,0,0,0.5)', fontSize: 30, fontWeight: 600, textAlign: 'center', fontFamily: 'Poppins', lineHeight: 1.4, letterSpacing: 0 },
    previewStyle: { fontFamily: 'Poppins, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: '#fff', background: 'linear-gradient(90deg, #ec4899 0%, #a855f7 100%)', padding: '5px 16px', borderRadius: '4px' },
  },
  {
    id: 'bordered',
    label: 'Bordered',
    sublabel: '',
    preview: 'Lorem ipsum dolor sit amet',
    accent: '#ffffff',
    patch: { color: '#ffffff', backgroundColor: 'transparent', effect: 'outline', effectColor: '#ffffff', textStroke: '2px #ffffff', textShadow: '2px 2px 8px rgba(0,0,0,0.8)', fontSize: 30, fontWeight: 700, textAlign: 'center', fontFamily: 'Montserrat', lineHeight: 1.4, letterSpacing: 1 },
    previewStyle: { fontFamily: 'Montserrat, sans-serif', fontSize: '0.9rem', fontWeight: 700, color: '#fff', WebkitTextStroke: '0.5px #fff', border: '1.5px solid #ffffff', padding: '4px 14px', borderRadius: '4px', letterSpacing: '0.05em' },
  },
  {
    id: 'cinema',
    label: 'Cinema',
    sublabel: '',
    preview: 'Lorem ipsum dolor sit amet',
    accent: '#e5e7eb',
    patch: { color: '#f8f8f8', backgroundColor: 'transparent', effect: 'shadow', effectColor: '#000000', textStroke: undefined, textShadow: '0 2px 12px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1)', fontSize: 28, fontWeight: 400, textAlign: 'center', fontFamily: 'Montserrat', lineHeight: 1.5, letterSpacing: 1 },
    previewStyle: { fontFamily: 'Montserrat, sans-serif', fontSize: '0.85rem', fontWeight: 300, color: '#f8f8f8', textShadow: '0 1px 8px rgba(0,0,0,1)', letterSpacing: '0.08em' },
  },
  {
    id: 'teal',
    label: 'Teal',
    sublabel: '',
    preview: 'Please edit your text.',
    accent: '#14b8a6',
    patch: { color: '#ccfbf1', backgroundColor: 'rgba(15,118,110,0.8)', effect: 'glow', effectColor: '#14b8a6', textStroke: undefined, textShadow: '0 0 10px #14b8a6', fontSize: 30, fontWeight: 700, textAlign: 'center', fontFamily: 'Righteous', lineHeight: 1.4, letterSpacing: 0.5 },
    previewStyle: { fontFamily: 'Righteous, cursive', fontSize: '0.9rem', fontWeight: 700, color: '#ccfbf1', background: 'rgba(15,118,110,0.85)', padding: '4px 14px', borderRadius: '4px', textShadow: '0 0 8px #14b8a6' },
  },
];

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
    textShadow: undefined,
    textStroke: undefined,
    lineHeight: 1.25,
    letterSpacing: 0,
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
  transform?: ClipTransform;
  autoSaveExisting?: boolean;
  onSave: (config: TextConfig, duration: number, transform: ClipTransform) => void;
  onCancel: () => void;
}

function normalizeTransform(transform?: ClipTransform): ClipTransform {
  const source = transform || DEFAULT_CLIP_TRANSFORM;
  const scaleX = Number.isFinite(source.scaleX) ? Math.max(0.1, Math.min(5, source.scaleX)) : 1;
  const scaleY = Number.isFinite(source.scaleY) ? Math.max(0.1, Math.min(5, source.scaleY)) : 1;
  const rotation = Number.isFinite(source.rotation) ? source.rotation : 0;
  const opacity = Number.isFinite(source.opacity) ? Math.max(0, Math.min(1, source.opacity)) : 1;
  return {
    x: clamp01(source.x),
    y: clamp01(source.y),
    scaleX,
    scaleY,
    rotation,
    opacity,
    keyframes: source.keyframes || [],
  };
}

export const TextClipEditor: React.FC<TextClipEditorProps> = ({
  config,
  duration: initialDuration = 5,
  transform,
  autoSaveExisting = false,
  onSave,
  onCancel,
}) => {
  const [textConfig, setTextConfig] = useState<TextConfig>(config || getDefaultTextConfig());
  const [duration, setDuration] = useState(initialDuration);
  const [textTransform, setTextTransform] = useState<ClipTransform>(() => normalizeTransform(transform));
  const [isDraggingPreviewText, setIsDraggingPreviewText] = useState(false);
  const previewCanvasRef = useRef<HTMLDivElement | null>(null);
  const isHydratingRef = useRef(false);
  const autoSaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    isHydratingRef.current = true;
    setTextConfig(config || getDefaultTextConfig());
    setDuration(initialDuration);
    setTextTransform(normalizeTransform(transform));
    window.setTimeout(() => {
      isHydratingRef.current = false;
    }, 0);
  }, [config, initialDuration, transform]);

  useEffect(() => () => {
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
  }, []);

  // Load the selected font
  useEffect(() => {
    loadGoogleFont(textConfig.fontFamily, textConfig.fontWeight);
  }, [textConfig.fontFamily, textConfig.fontWeight]);

  const scheduleAutoSave = (nextConfig: TextConfig, nextDuration = duration, nextTransform = textTransform) => {
    if (!autoSaveExisting || isHydratingRef.current || !nextConfig.text.trim()) return;
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      onSave(nextConfig, nextDuration, nextTransform);
      autoSaveTimerRef.current = null;
    }, 120);
  };

  const update = (partial: Partial<TextConfig>) => {
    setTextConfig(prev => {
      const next = { ...prev, ...partial };
      scheduleAutoSave(next);
      return next;
    });
  };

  const applyTextPatch = (patch: Partial<TextConfig>) => {
    setTextConfig(prev => {
      const next = { ...prev, ...patch };
      scheduleAutoSave(next);
      return next;
    });
  };

  const updateTransform = (partial: Partial<ClipTransform>) => {
    setTextTransform((prev) => {
      const nextScaleX = partial.scaleX === undefined ? prev.scaleX : Math.max(0.1, Math.min(5, partial.scaleX));
      const nextScaleY = partial.scaleY === undefined ? prev.scaleY : Math.max(0.1, Math.min(5, partial.scaleY));
      const next = {
        ...prev,
        ...partial,
        x: partial.x === undefined ? prev.x : clamp01(partial.x),
        y: partial.y === undefined ? prev.y : clamp01(partial.y),
        scaleX: nextScaleX,
        scaleY: nextScaleY,
      };
      scheduleAutoSave(textConfig, duration, next);
      return next;
    });
  };

  const updateDuration = (nextDuration: number) => {
    setDuration(nextDuration);
    scheduleAutoSave(textConfig, nextDuration, textTransform);
  };

  const updatePositionFromPointer = (clientX: number, clientY: number) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const x = clamp01((clientX - rect.left) / rect.width);
    const y = clamp01((clientY - rect.top) / rect.height);
    updateTransform({ x, y });
  };

  useEffect(() => {
    if (!isDraggingPreviewText) return;

    const handleMouseMove = (event: MouseEvent) => {
      updatePositionFromPointer(event.clientX, event.clientY);
    };
    const handleMouseUp = () => {
      setIsDraggingPreviewText(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPreviewText]);

  const getPreviewStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      left: `${textTransform.x * 100}%`,
      top: `${textTransform.y * 100}%`,
      transform: `translate(-50%, -50%) scale(${textTransform.scaleX}, ${textTransform.scaleY})`,
      transformOrigin: 'center center',
      fontFamily: `'${textConfig.fontFamily}', sans-serif`,
      fontSize: `${Math.min(textConfig.fontSize, 60)}px`,
      fontWeight: textConfig.fontWeight,
      fontStyle: textConfig.fontStyle,
      color: textConfig.color,
      backgroundColor: textConfig.backgroundColor === 'transparent' ? 'transparent' : textConfig.backgroundColor,
      textAlign: textConfig.textAlign,
      WebkitTextStroke: textConfig.textStroke,
      textShadow: textConfig.textShadow === 'none' ? undefined : textConfig.textShadow,
      lineHeight: textConfig.lineHeight ?? 1.25,
      letterSpacing: textConfig.letterSpacing ? `${textConfig.letterSpacing}px` : undefined,
      padding: '8px 16px',
      borderRadius: '4px',
      wordBreak: 'break-word',
      maxWidth: '100%',
      cursor: isDraggingPreviewText ? 'grabbing' : 'grab',
      userSelect: 'none',
    };

    if (textConfig.effect === 'shadow') {
      base.textShadow = textConfig.textShadow || `2px 2px 4px ${textConfig.effectColor || '#000000'}`;
    } else if (textConfig.effect === 'outline') {
      const c = textConfig.effectColor || '#000000';
      base.textShadow = textConfig.textShadow || `-1px -1px 0 ${c}, 1px -1px 0 ${c}, -1px 1px 0 ${c}, 1px 1px 0 ${c}`;
    } else if (textConfig.effect === 'glow') {
      const c = textConfig.effectColor || '#0078d4';
      base.textShadow = textConfig.textShadow || `0 0 10px ${c}, 0 0 20px ${c}, 0 0 40px ${c}`;
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
          background: #e9eef5;
          color: #111827;
        }
        .tce-header {
          padding: 12px;
          border-bottom: 1px solid #d7dee8;
          font-size: 14px;
          font-weight: 600;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #f7f9fc;
        }
        .tce-body {
          flex: 1;
          overflow-y: auto;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .tce-preview {
          background: #111318;
          border: 1px solid #d7dee8;
          border-radius: 14px;
          min-height: 180px;
          padding: 16px;
          overflow: hidden;
          position: relative;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04);
        }
        .tce-preview-canvas {
          position: absolute;
          inset: 16px;
          overflow: hidden;
        }
        .tce-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .tce-label {
          font-size: 12px;
          color: #98a2b3;
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.08em;
        }
        .tce-input, .tce-select, .tce-textarea {
          background: #25272d;
          border: 1px solid #25272d;
          border-radius: 18px;
          color: #f8fafc;
          padding: 9px 12px;
          font-size: 13px;
          outline: none;
        }
        .tce-input:focus, .tce-select:focus, .tce-textarea:focus {
          border-color: #2f80ff;
          box-shadow: 0 0 0 2px rgba(47,128,255,0.18);
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
          border: 1px solid #25272d;
          border-radius: 10px;
          background: #25272d;
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
          background: #25272d;
          border: 1px solid #25272d;
          border-radius: 12px;
          color: #d7dee8;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s;
        }
        .tce-btn-group button:hover {
          background: #31343b;
        }
        .tce-btn-group button.active {
          background: #2f80ff;
          border-color: #2f80ff;
          color: #fff;
        }
        .tce-presets-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .tce-preset-button {
          min-height: 48px;
          border: 1px solid #d7dee8;
          border-radius: 16px;
          background: #25272d;
          color: #f8fafc;
          cursor: pointer;
          transition: all 0.18s;
          overflow: hidden;
        }
        .tce-preset-button:hover {
          border-color: #2f80ff;
          box-shadow: 0 0 0 2px rgba(47,128,255,0.16);
        }
        .tce-card-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .tce-style-card {
          min-height: 104px;
          border: 1px solid #d7dee8;
          border-radius: 22px;
          background: #17181d;
          color: #f8fafc;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.18s;
          overflow: hidden;
        }
        .tce-style-card:hover {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent);
        }
        .tce-style-preview {
          line-height: 1;
          max-width: 92%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .tce-style-sublabel {
          font-size: 10px;
          color: #98a2b3;
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }
        .tce-subtitle-list {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        .tce-subtitle-card {
          min-height: 64px;
          border: 1px solid #d7dee8;
          border-radius: 20px;
          background: #0d0e12;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          transition: all 0.18s;
        }
        .tce-subtitle-card:hover {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 24%, transparent);
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
          border-top: 1px solid #d7dee8;
          display: flex;
          gap: 8px;
          background: #f7f9fc;
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
          background: #2f80ff;
          color: #fff;
        }
        .tce-save-btn:hover {
          background: #1d68d8;
        }
        .tce-cancel-btn {
          background: #25272d;
          color: #e0e7ef;
        }
        .tce-cancel-btn:hover {
          background: #31343b;
        }
      `}</style>

      <div className="tce-header">
        <span>{config ? 'Edit Text Overlay' : 'Add Text Overlay'}</span>
      </div>

      <div className="tce-body">
        {/* Live Preview */}
        <div className="tce-preview" data-testid="text-preview-stage">
          <div className="tce-preview-canvas" ref={previewCanvasRef}>
            <div
              data-testid="text-preview-draggable"
              style={getPreviewStyle()}
              onMouseDown={(e) => {
                e.preventDefault();
                setIsDraggingPreviewText(true);
                updatePositionFromPointer(e.clientX, e.clientY);
              }}
            >
            {textConfig.text || 'Preview'}
            </div>
          </div>
        </div>

        {/* Text Input */}
        <div className="tce-field">
          <div className="tce-label">Content</div>
          <textarea
            className="tce-textarea"
            value={textConfig.text}
            onChange={e => update({ text: e.target.value })}
            placeholder="Add your text"
          />
        </div>

        <div className="tce-field">
          <div className="tce-label">Text Presets</div>
          <div className="tce-presets-grid">
            {TEXT_STYLE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="tce-preset-button"
                style={{
                  fontSize: preset.previewSize,
                  fontWeight: preset.fontWeight,
                  fontStyle: preset.fontStyle,
                }}
                onClick={() => applyTextPatch(preset.patch)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="tce-field">
          <div className="tce-label">Text Effects</div>
          <div className="tce-card-grid">
            {TEXT_EFFECT_CARDS.map((card) => (
              <button
                key={card.id}
                type="button"
                className="tce-style-card"
                style={{ '--accent': card.accent } as React.CSSProperties}
                onClick={() => applyTextPatch(card.patch)}
                aria-label={card.label}
              >
                <span className="tce-style-preview" style={card.previewStyle}>{card.preview}</span>
                <span className="tce-style-sublabel">{card.sublabel}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="tce-field">
          <div className="tce-label">Subtitle Styles</div>
          <div className="tce-subtitle-list">
            {SUBTITLE_STYLE_CARDS.map((card) => (
              <button
                key={card.id}
                type="button"
                className="tce-subtitle-card"
                style={{ '--accent': card.accent } as React.CSSProperties}
                onClick={() => applyTextPatch(card.patch)}
                aria-label={card.label}
              >
                <span style={card.previewStyle}>{card.preview}</span>
              </button>
            ))}
          </div>
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

        {/* Position + Scale */}
        <div className="tce-row">
          <div className="tce-field">
            <div className="tce-label">Position X ({Math.round(textTransform.x * 100)}%)</div>
            <input
              aria-label="Text position X"
              type="range"
              className="tce-input"
              min={0}
              max={100}
              step={1}
              value={Math.round(textTransform.x * 100)}
              onChange={(e) => updateTransform({ x: parseFloat(e.target.value) / 100 })}
            />
          </div>
          <div className="tce-field">
            <div className="tce-label">Position Y ({Math.round(textTransform.y * 100)}%)</div>
            <input
              aria-label="Text position Y"
              type="range"
              className="tce-input"
              min={0}
              max={100}
              step={1}
              value={Math.round(textTransform.y * 100)}
              onChange={(e) => updateTransform({ y: parseFloat(e.target.value) / 100 })}
            />
          </div>
        </div>

        <div className="tce-row">
          <div className="tce-field">
            <div className="tce-label">Scale X</div>
            <input
              aria-label="Text scale X"
              type="number"
              className="tce-input"
              min={0.1}
              max={5}
              step={0.1}
              value={textTransform.scaleX}
              onChange={(e) => updateTransform({ scaleX: parseFloat(e.target.value) || 1 })}
            />
          </div>
          <div className="tce-field">
            <div className="tce-label">Scale Y</div>
            <input
              aria-label="Text scale Y"
              type="number"
              className="tce-input"
              min={0.1}
              max={5}
              step={0.1}
              value={textTransform.scaleY}
              onChange={(e) => updateTransform({ scaleY: parseFloat(e.target.value) || 1 })}
            />
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
                onClick={() => update({
                  effect: eff.value,
                  textShadow: undefined,
                  textStroke: undefined,
                  effectColor: eff.value === 'none' ? undefined : textConfig.effectColor,
                })}
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
            onChange={e => updateDuration(parseFloat(e.target.value) || 5)}
          />
        </div>
      </div>

      <div className="tce-footer">
        <button className="tce-cancel-btn" onClick={onCancel}>Cancel</button>
        <button
          className="tce-save-btn"
          onClick={() => onSave(textConfig, duration, textTransform)}
          disabled={!textConfig.text.trim()}
        >
          {autoSaveExisting ? 'Apply Now' : 'Add to Timeline'}
        </button>
      </div>
    </div>
  );
};

export default TextClipEditor;
