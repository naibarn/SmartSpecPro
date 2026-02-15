/**
 * Preview Player Component
 * Video preview with playback controls, zoom levels, and fullscreen
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { formatTime } from '../../types/videoEditor';
import type { ClipTransform, TransformKeyframe, Effect, TextConfig, TransitionName } from '../../types/videoEditor';
import { clamp01, DEFAULT_CLIP_TRANSFORM, resolveTransformAtTime } from './transformKeyframes';

export interface ActiveClipInfo {
  id?: string;
  videoUrl: string;
  clipStartTime: number;  // where the clip starts on the timeline
  trimIn: number;         // trim offset within the source file
  clipDuration: number;   // visible duration on timeline
  isImage?: boolean;      // true for image clips (renders <img> instead of <video>)
  transitions?: { fadeIn?: number; fadeOut?: number };
  transform?: ClipTransform;
  effects?: Effect[];
}

export interface ActiveTextClipInfo {
  id: string;
  clipStartTime: number;
  clipDuration: number;
  textConfig: TextConfig;
  transform?: ClipTransform;
}

export interface PreviewTextFontResolution {
  clipId: string;
  requested: string;
  resolved: string;
  fallback: boolean;
}

export interface PreviewTextDiagnostics {
  fontResolution: PreviewTextFontResolution[];
  fontFallbackCount: number;
}

interface PreviewPlayerProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTimeChange: (time: number) => void;
  onPlayPause: () => void;
  onStop: () => void;
  previewVideoUrl?: string;
  activeClip?: ActiveClipInfo | null;
  activeAudioClips?: ActiveClipInfo[];
  outgoingClip?: ActiveClipInfo | null;
  activeTextClips?: ActiveTextClipInfo[];
  transitionName?: string;
  transitionProgress?: number;
  allowSeekingWhilePlaying?: boolean;
  skipSilencePreview?: boolean;
  skipRanges?: Array<{ start: number; end: number }>;
  skipCooldownMs?: number;
  skipBoundaryGuardSec?: number;
  selectedClipId?: string | null;
  onTransformChangeAtCurrentTime?: (clipId: string, updates: Partial<TransformKeyframe>, commit?: boolean) => void;
  onAddKeyframeAtCurrentTime?: (clipId: string) => void;
  onDeleteKeyframeAtCurrentTime?: (clipId: string) => void;
  onOpenKeyframePanel?: () => void;
  onTextDiagnostics?: (diagnostics: PreviewTextDiagnostics) => void;
  outputWidth?: number;
  outputHeight?: number;
}

const ZOOM_PRESETS = [10, 25, 50, 75, 100, 125, 150, 200, 250, 300, 350, 400];
const PREVIEW_TEXT_FONT_WHITELIST = new Set([
  'Noto Sans',
  'Noto Sans Thai',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Ubuntu',
]);

function resolvePreviewTextFont(fontFamily: string): { resolved: string; fallback: boolean } {
  if (PREVIEW_TEXT_FONT_WHITELIST.has(fontFamily)) {
    return { resolved: fontFamily, fallback: false };
  }
  return { resolved: 'Noto Sans', fallback: true };
}

function getTextEffectStyle(config: TextConfig): React.CSSProperties {
  if (config.effect === 'shadow') {
    return {
      textShadow: `2px 2px 4px ${config.effectColor || '#000000'}`,
    };
  }
  if (config.effect === 'outline') {
    const c = config.effectColor || '#000000';
    return {
      textShadow: `-1px -1px 0 ${c}, 1px -1px 0 ${c}, -1px 1px 0 ${c}, 1px 1px 0 ${c}`,
    };
  }
  return {};
}

/** Returns CSS styles for outgoing and incoming clips during a transition. */
function getTransitionStyles(
  name: string,
  progress: number,
): { outgoing: React.CSSProperties; incoming: React.CSSProperties } {
  switch (name) {
    case 'crossfade':
      return { outgoing: { opacity: 1 - progress }, incoming: { opacity: progress } };
    case 'wipeLeft':
      return { outgoing: { clipPath: `inset(0 0 0 ${progress * 100}%)` }, incoming: { clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` } };
    case 'wipeRight':
      return { outgoing: { clipPath: `inset(0 ${progress * 100}% 0 0)` }, incoming: { clipPath: `inset(0 0 0 ${(1 - progress) * 100}%)` } };
    case 'wipeUp':
      return { outgoing: { clipPath: `inset(${progress * 100}% 0 0 0)` }, incoming: { clipPath: `inset(0 0 ${(1 - progress) * 100}% 0)` } };
    case 'wipeDown':
      return { outgoing: { clipPath: `inset(0 0 ${progress * 100}% 0)` }, incoming: { clipPath: `inset(${(1 - progress) * 100}% 0 0 0)` } };
    case 'slideLeft':
      return { outgoing: { transform: `translateX(${-progress * 100}%)` }, incoming: { transform: `translateX(${(1 - progress) * 100}%)` } };
    case 'slideRight':
      return { outgoing: { transform: `translateX(${progress * 100}%)` }, incoming: { transform: `translateX(${-(1 - progress) * 100}%)` } };
    case 'slideUp':
      return { outgoing: { transform: `translateY(${-progress * 100}%)` }, incoming: { transform: `translateY(${(1 - progress) * 100}%)` } };
    case 'slideDown':
      return { outgoing: { transform: `translateY(${progress * 100}%)` }, incoming: { transform: `translateY(${-(1 - progress) * 100}%)` } };
    case 'zoomIn':
      return { outgoing: { transform: `scale(${1 + progress})`, opacity: 1 - progress }, incoming: { transform: `scale(${progress})`, opacity: progress } };
    case 'zoomOut':
      return { outgoing: { transform: `scale(${1 - progress * 0.5})`, opacity: 1 - progress }, incoming: { transform: `scale(${1 + (1 - progress) * 0.5})`, opacity: progress } };
    case 'circleOpen': {
      const r = progress * 75;
      return { outgoing: {}, incoming: { clipPath: `circle(${r}% at 50% 50%)` } };
    }
    case 'circleClose': {
      const r = (1 - progress) * 75;
      return { outgoing: { clipPath: `circle(${r}% at 50% 50%)` }, incoming: {} };
    }
    case 'diamondOpen': {
      const d = progress * 75;
      return { outgoing: {}, incoming: { clipPath: `polygon(50% ${50 - d}%, ${50 + d}% 50%, 50% ${50 + d}%, ${50 - d}% 50%)` } };
    }
    case 'blur':
      return { outgoing: { filter: `blur(${progress * 20}px)`, opacity: 1 - progress }, incoming: { filter: `blur(${(1 - progress) * 20}px)`, opacity: progress } };
    case 'pixelize':
      return { outgoing: { filter: `blur(${progress * 10}px) contrast(${1 + progress})`, opacity: 1 - progress }, incoming: { filter: `blur(${(1 - progress) * 10}px) contrast(${2 - progress})`, opacity: progress } };
    case 'radial':
      return { outgoing: { opacity: 1 - progress }, incoming: { clipPath: `circle(${progress * 75}% at 50% 50%)` } };
    case 'smoothLeft':
      return { outgoing: { transform: `translateX(${-progress * 100}%)`, opacity: 1 - progress * 0.3 }, incoming: { transform: `translateX(${(1 - progress) * 100}%)`, opacity: 0.7 + progress * 0.3 } };
    case 'smoothRight':
      return { outgoing: { transform: `translateX(${progress * 100}%)`, opacity: 1 - progress * 0.3 }, incoming: { transform: `translateX(${-(1 - progress) * 100}%)`, opacity: 0.7 + progress * 0.3 } };
    default:
      return { outgoing: { opacity: 1 - progress }, incoming: { opacity: progress } };
  }
}

export const PreviewPlayer: React.FC<PreviewPlayerProps> = ({
  currentTime,
  duration,
  isPlaying,
  onTimeChange,
  onPlayPause,
  onStop,
  previewVideoUrl,
  activeClip,
  activeAudioClips = [],
  outgoingClip,
  activeTextClips = [],
  transitionName,
  transitionProgress,
  allowSeekingWhilePlaying = false,
  skipSilencePreview = false,
  skipRanges = [],
  skipCooldownMs = 100,
  skipBoundaryGuardSec = 0.05,
  selectedClipId = null,
  onTransformChangeAtCurrentTime,
  onAddKeyframeAtCurrentTime,
  onDeleteKeyframeAtCurrentTime,
  onOpenKeyframePanel,
  onTextDiagnostics,
  outputWidth = 16,
  outputHeight = 9,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const outgoingVideoRef = useRef<HTMLVideoElement>(null);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [stalledLoading, setStalledLoading] = useState(false);
  const [textFontsReady, setTextFontsReady] = useState(true);
  const safeCurrentTime = Number.isFinite(currentTime) ? currentTime : 0;
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const lastSkipTimestampRef = useRef(0);

  // Pan state for zoomed preview
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; ox: number; oy: number }>({ x: 0, y: 0, ox: 0, oy: 0 });
  const lastTouchDistRef = useRef<number | null>(null);
  const [transformEditMode, setTransformEditMode] = useState(false);
  const [isTransformDragging, setIsTransformDragging] = useState(false);
  const transformDragStartRef = useRef<{ x: number; y: number; ox: number; oy: number }>({ x: 0, y: 0, ox: 0, oy: 0 });
  const transformDraftRef = useRef<Partial<TransformKeyframe> | null>(null);
  const [previewStageSize, setPreviewStageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [renderFramePreviewOnly, setRenderFramePreviewOnly] = useState(true);

  // Compute the effective video URL
  const effectiveUrl = activeClip?.videoUrl || previewVideoUrl;
  const normalizedSkipRanges = useMemo(
    () =>
      skipRanges
        .map((range) => {
          const start = Number.isFinite(range.start) ? range.start : NaN;
          const end = Number.isFinite(range.end) ? range.end : NaN;
          if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
          return { start, end };
        })
        .filter((r): r is { start: number; end: number } => r !== null)
        .sort((a, b) => a.start - b.start),
    [skipRanges],
  );
  const normalizedClipTime = useMemo(() => {
    if (!activeClip || activeClip.clipDuration <= 0) return 0;
    return clamp01((safeCurrentTime - activeClip.clipStartTime) / activeClip.clipDuration);
  }, [activeClip, safeCurrentTime]);
  const hasSelectedActiveClip = !!selectedClipId && !!activeClip?.id && activeClip.id === selectedClipId;
  const canEditActiveTransform =
    !!onTransformChangeAtCurrentTime &&
    !!activeClip?.id &&
    activeClip.clipDuration > 0;
  const resolvedActiveTransform = useMemo(() => {
    if (!activeClip || !canEditActiveTransform) return null;
    return resolveTransformAtTime(activeClip.transform || DEFAULT_CLIP_TRANSFORM, normalizedClipTime);
  }, [activeClip, canEditActiveTransform, normalizedClipTime]);
  const hasActiveKeyframeAtPlayhead = useMemo(() => {
    const keyframes = activeClip?.transform?.keyframes;
    if (!keyframes || keyframes.length === 0) return false;
    return keyframes.some((kf) => Math.abs(kf.time - normalizedClipTime) <= 0.01);
  }, [activeClip?.transform?.keyframes, normalizedClipTime]);
  const outputAspectRatio = useMemo(() => {
    const safeWidth = Number.isFinite(outputWidth) && outputWidth > 0 ? outputWidth : 16;
    const safeHeight = Number.isFinite(outputHeight) && outputHeight > 0 ? outputHeight : 9;
    return safeWidth / safeHeight;
  }, [outputWidth, outputHeight]);
  const textFontResolution = useMemo(
    () =>
      activeTextClips.map((clip) => {
        const outcome = resolvePreviewTextFont(clip.textConfig.fontFamily);
        return {
          clipId: clip.id,
          requested: clip.textConfig.fontFamily,
          resolved: outcome.resolved,
          fallback: outcome.fallback,
        };
      }),
    [activeTextClips],
  );
  const textFontFallbackCount = useMemo(
    () => textFontResolution.filter((item) => item.fallback).length,
    [textFontResolution],
  );
  const activeTextFontRequests = useMemo(
    () => {
      const unique = new Map<string, { family: string; style: 'normal' | 'italic'; weight: number }>();
      for (const clip of activeTextClips) {
        const font = resolvePreviewTextFont(clip.textConfig.fontFamily).resolved;
        const style = clip.textConfig.fontStyle === 'italic' ? 'italic' : 'normal';
        const weight = Number.isFinite(clip.textConfig.fontWeight)
          ? Math.max(100, Math.min(900, Math.round(clip.textConfig.fontWeight / 100) * 100))
          : 400;
        const key = `${style}:${weight}:${font}`;
        if (!unique.has(key)) {
          unique.set(key, { family: font, style, weight });
        }
      }
      return Array.from(unique.values());
    },
    [activeTextClips],
  );
  const activeTextFontKey = useMemo(
    () =>
      activeTextFontRequests
        .map((request) => `${request.style}:${request.weight}:${request.family}`)
        .join('|'),
    [activeTextFontRequests],
  );
  const resolvedTextOverlays = useMemo(
    () =>
      activeTextClips.map((clip, index) => {
        const normalizedTime =
          clip.clipDuration > 0
            ? clamp01((safeCurrentTime - clip.clipStartTime) / clip.clipDuration)
            : 0;
        const transform = resolveTransformAtTime(
          clip.transform || DEFAULT_CLIP_TRANSFORM,
          normalizedTime,
        );
        const transformParts: string[] = ['translate(-50%, -50%)'];
        if (transform.scaleX !== 1 || transform.scaleY !== 1) {
          transformParts.push(`scale(${transform.scaleX}, ${transform.scaleY})`);
        }
        if (transform.rotation !== 0) {
          transformParts.push(`rotate(${transform.rotation}deg)`);
        }
        const config = clip.textConfig;
        const fontFamily = resolvePreviewTextFont(config.fontFamily).resolved;
        return {
          id: clip.id,
          text: config.text,
          style: {
            position: 'absolute',
            left: `${Math.max(0, Math.min(1, transform.x)) * 100}%`,
            top: `${Math.max(0, Math.min(1, transform.y)) * 100}%`,
            transform: transformParts.join(' '),
            opacity: Math.max(0, Math.min(1, transform.opacity)),
            fontFamily: `'${fontFamily}', sans-serif`,
            fontSize: `${Math.max(8, Math.min(256, config.fontSize))}px`,
            fontWeight: config.fontWeight,
            fontStyle: config.fontStyle,
            color: config.color,
            backgroundColor:
              config.backgroundColor === 'transparent'
                ? 'transparent'
                : config.backgroundColor,
            textAlign: config.textAlign,
            whiteSpace: 'pre-wrap',
            maxWidth: '90%',
            padding: '4px 8px',
            borderRadius: '4px',
            lineHeight: 1.25,
            pointerEvents: 'none',
            zIndex: index + 1,
            ...getTextEffectStyle(config),
          } satisfies React.CSSProperties,
        };
      }),
    [activeTextClips, safeCurrentTime],
  );

  useEffect(() => {
    if (!onTextDiagnostics) return;
    onTextDiagnostics({
      fontResolution: textFontResolution,
      fontFallbackCount: textFontFallbackCount,
    });
  }, [onTextDiagnostics, textFontResolution, textFontFallbackCount]);

  useEffect(() => {
    if (activeTextClips.length === 0) {
      setTextFontsReady(true);
      return;
    }

    const fontSet = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fontSet || typeof fontSet.load !== 'function') {
      setTextFontsReady(true);
      return;
    }

    let cancelled = false;
    setTextFontsReady(false);
    Promise.all(
      activeTextFontRequests.map((request) =>
        fontSet
          .load(`${request.style} ${request.weight} 16px "${request.family}"`)
          .catch(() => undefined),
      ),
    ).finally(() => {
      if (!cancelled) {
        setTextFontsReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeTextClips.length, activeTextFontRequests, activeTextFontKey]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateStageSize = () => {
      const rect = viewport.getBoundingClientRect();
      const maxW = Math.max(0, rect.width);
      const maxH = Math.max(0, rect.height);
      if (maxW === 0 || maxH === 0) {
        setPreviewStageSize({ width: 0, height: 0 });
        return;
      }

      let stageWidth = maxW;
      let stageHeight = stageWidth / outputAspectRatio;
      if (stageHeight > maxH) {
        stageHeight = maxH;
        stageWidth = stageHeight * outputAspectRatio;
      }

      setPreviewStageSize({
        width: Math.max(1, Math.round(stageWidth)),
        height: Math.max(1, Math.round(stageHeight)),
      });
    };

    updateStageSize();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateStageSize);
      observer.observe(viewport);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateStageSize);
    return () => window.removeEventListener('resize', updateStageSize);
  }, [outputAspectRatio]);

  // Track the previous URL so we know when the source changes
  const prevUrlRef = useRef<string | undefined>(undefined);

  // Reset loaded state when URL changes and force browser reload
  useEffect(() => {
    if (effectiveUrl !== prevUrlRef.current) {
      setVideoLoaded(false);
      setVideoError(null);
      setStalledLoading(false);
      prevUrlRef.current = effectiveUrl;
      // Force the video element to load the new source
      if (videoRef.current && effectiveUrl) {
        videoRef.current.load();
      }
    }
  }, [effectiveUrl]);

  // When video metadata loads, mark as ready
  const handleLoadedData = useCallback(() => {
    setVideoLoaded(true);
    setVideoError(null);
    setStalledLoading(false);
  }, []);

  // If media loading stalls without error, surface status instead of a blank black pane.
  useEffect(() => {
    if (!effectiveUrl || activeClip?.isImage || videoLoaded || videoError) return;
    const timer = window.setTimeout(() => {
      if (!videoLoaded) {
        setStalledLoading(true);
      }
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [effectiveUrl, activeClip?.isImage, videoLoaded, videoError]);

  // Sync video element with current time.
  // By default we do not seek while playing to avoid churn, but some callers
  // (e.g., skip-silence preview) intentionally drive seeks during playback.
  useEffect(() => {
    if (!videoRef.current || !effectiveUrl || !videoLoaded) return;
    if (isPlaying && !allowSeekingWhilePlaying) return;

    let targetTime: number;
    if (activeClip) {
      targetTime = activeClip.trimIn + (safeCurrentTime - activeClip.clipStartTime);
    } else {
      targetTime = safeCurrentTime;
    }

    // Clamp to valid range
    targetTime = Math.max(0, targetTime);
    if (!Number.isFinite(targetTime)) return;

    if (Math.abs(videoRef.current.currentTime - targetTime) > 0.05) {
      try {
        videoRef.current.currentTime = targetTime;
      } catch (err) {
        console.error('Failed to set current time:', err);
      }
    }
  }, [safeCurrentTime, activeClip, effectiveUrl, isPlaying, videoLoaded, allowSeekingWhilePlaying]);

  // Sync outgoing video element during transition playback
  useEffect(() => {
    const video = outgoingVideoRef.current;
    if (!video || !outgoingClip) {
      // Pause outgoing video when transition ends
      if (video && !video.paused) video.pause();
      return;
    }
    // Wait for video to have enough data before seeking
    if (video.readyState < 2) return;

    const targetTime = outgoingClip.trimIn + (safeCurrentTime - outgoingClip.clipStartTime);
    const clamped = Math.max(0, targetTime);
    if (!Number.isFinite(clamped)) return;
    if (Math.abs(video.currentTime - clamped) > 0.05) {
      try { video.currentTime = clamped; } catch { /* seek error on unloaded video */ }
    }
    // Sync play/pause state
    if (isPlaying && video.paused) {
      video.play().catch((err) => {
        // AbortError is expected when play is interrupted by pause/seek — suppress it
        if (err && err.name !== 'AbortError') {
          console.warn('Outgoing video play failed:', err.name, err.message);
        }
      });
    } else if (!isPlaying && !video.paused) {
      video.pause();
    }
  }, [safeCurrentTime, outgoingClip, isPlaying]);

  // Handle play/pause — re-triggers when videoLoaded changes so play() is called
  // after the video element finishes loading (prevents black screen deadlock)
  useEffect(() => {
    if (!videoRef.current || !videoLoaded) return;

    if (isPlaying) {
      // Seek to correct position before playing
      if (activeClip) {
        const targetTime = activeClip.trimIn + (safeCurrentTime - activeClip.clipStartTime);
        if (!Number.isFinite(targetTime)) return;
        if (Math.abs(videoRef.current.currentTime - targetTime) > 0.1) {
          videoRef.current.currentTime = Math.max(0, targetTime);
        }
      }

      videoRef.current.play().catch(err => {
        console.error('Failed to play:', err);
        setVideoError(err instanceof Error ? err.message : 'Failed to play video');
        onPlayPause(); // Revert to paused state
      });
    } else {
      try {
        videoRef.current.pause();
      } catch (err) {
        console.error('Failed to pause:', err);
      }
    }
    // Intentionally excludes activeClip, currentTime, onPlayPause —
    // those change every frame and would cause play() thrashing
  }, [isPlaying, safeCurrentTime, videoLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Skip-silence engine: checks real playback time every frame and seeks immediately.
  useEffect(() => {
    if (!isPlaying || !skipSilencePreview) return;
    if (!videoLoaded || normalizedSkipRanges.length === 0) return;
    if (!videoRef.current) return;

    let rafId = 0;

    const findContainingRange = (time: number) => {
      let lo = 0;
      let hi = normalizedSkipRanges.length - 1;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const range = normalizedSkipRanges[mid];
        if (time < range.start) {
          hi = mid - 1;
        } else if (time > range.end) {
          lo = mid + 1;
        } else {
          return range;
        }
      }
      return null;
    };

    const tick = () => {
      const video = videoRef.current;
      if (!video) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const sourceNow = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const timelineNow = activeClip
        ? activeClip.clipStartTime + (sourceNow - activeClip.trimIn)
        : sourceNow;

      if (Number.isFinite(timelineNow)) {
        const nowMs = performance.now();
        if (nowMs - lastSkipTimestampRef.current >= skipCooldownMs) {
          const activeRange = findContainingRange(timelineNow);
          if (
            activeRange &&
            Math.abs(timelineNow - activeRange.end) > skipBoundaryGuardSec
          ) {
            const targetTimeline = activeRange.end;
            const targetSource = activeClip
              ? activeClip.trimIn + (targetTimeline - activeClip.clipStartTime)
              : targetTimeline;
            if (
              Number.isFinite(targetSource) &&
              targetSource > sourceNow + 0.01
            ) {
              try {
                video.currentTime = Math.max(0, targetSource);
              } catch (err) {
                console.warn("Skip-silence seek failed:", err);
              }
              onTimeChange(targetTimeline);
              lastSkipTimestampRef.current = nowMs;
            }
          }
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    isPlaying,
    skipSilencePreview,
    videoLoaded,
    normalizedSkipRanges,
    activeClip,
    onTimeChange,
    skipCooldownMs,
    skipBoundaryGuardSec,
  ]);

  // Sync audio elements with playback state
  useEffect(() => {
    audioRefs.current.forEach((audioEl, url) => {
      const clip = activeAudioClips.find(c => c.videoUrl === url);
      if (!clip) {
        audioEl.pause();
        return;
      }
      const targetTime = clip.trimIn + (safeCurrentTime - clip.clipStartTime);
      if (!Number.isFinite(targetTime)) return;
      if (isPlaying) {
        if (Math.abs(audioEl.currentTime - targetTime) > 0.3) {
          audioEl.currentTime = Math.max(0, targetTime);
        }
        audioEl.volume = isMuted ? 0 : volume;
        audioEl.play().catch((err) => {
          if (err && err.name !== 'AbortError') {
            console.warn('Audio play failed:', err.name, err.message);
          }
        });
      } else {
        audioEl.pause();
        audioEl.currentTime = Math.max(0, targetTime);
      }
    });
  }, [isPlaying, safeCurrentTime, activeAudioClips, volume, isMuted]);

  // Clean up stale audio elements when clips change
  useEffect(() => {
    const activeUrls = new Set(activeAudioClips.map(c => c.videoUrl));
    audioRefs.current.forEach((audioEl, url) => {
      if (!activeUrls.has(url)) {
        audioEl.pause();
        audioEl.remove();
        audioRefs.current.delete(url);
      }
    });
  }, [activeAudioClips]);

  // Handle video time update — convert source time back to timeline time
  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current || !isPlaying) return;

    if (activeClip) {
      const timelineTime = activeClip.clipStartTime + (videoRef.current.currentTime - activeClip.trimIn);
      if (!Number.isFinite(timelineTime)) return;
      // Only update if within clip bounds
      if (timelineTime >= activeClip.clipStartTime && timelineTime <= activeClip.clipStartTime + activeClip.clipDuration) {
        onTimeChange(timelineTime);
      } else if (timelineTime > activeClip.clipStartTime + activeClip.clipDuration) {
        // Reached end of clip — advance to next clip or stop at timeline end
        const nextTime = activeClip.clipStartTime + activeClip.clipDuration;
        if (!Number.isFinite(nextTime) || nextTime >= safeDuration) {
          onPlayPause(); // End of timeline
        } else {
          onTimeChange(nextTime); // Advance to next clip/gap
        }
      }
    } else if (effectiveUrl) {
      if (Number.isFinite(videoRef.current.currentTime)) {
        onTimeChange(videoRef.current.currentTime);
      }
    }
  }, [activeClip, effectiveUrl, isPlaying, onTimeChange, onPlayPause, safeDuration]);

  // Handle seek
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (!Number.isFinite(time)) return;
    onTimeChange(Math.max(0, Math.min(safeDuration || Infinity, time)));
  };

  // Handle volume change
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    if (isNaN(vol) || vol < 0 || vol > 1) return;
    setVolume(vol);
    if (videoRef.current) {
      videoRef.current.volume = vol;
    }
    audioRefs.current.forEach(el => { el.volume = vol; });
  };

  // Toggle mute
  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
    audioRefs.current.forEach(el => { el.volume = !isMuted ? 0 : volume; });
  };

  // Handle video error
  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const videoElement = e.currentTarget;
    const error = videoElement.error;

    let errorMessage = 'Unknown video error';
    if (error) {
      switch (error.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          errorMessage = 'Video playback aborted';
          break;
        case MediaError.MEDIA_ERR_NETWORK:
          errorMessage = 'Network error while loading video';
          break;
        case MediaError.MEDIA_ERR_DECODE:
          errorMessage = 'Video decoding failed';
          break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          errorMessage = 'Video format not supported';
          break;
        default:
          errorMessage = error.message || 'Unknown video error';
      }
    }

    console.error('Video error:', errorMessage, error);
    setVideoError(errorMessage);
  };

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.error('Failed to enter fullscreen:', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch(err => {
        console.error('Failed to exit fullscreen:', err);
      });
    }
  }, []);

  // Listen for fullscreen change (e.g. user presses Escape)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!canEditActiveTransform) {
      setTransformEditMode(false);
      setIsTransformDragging(false);
      transformDraftRef.current = null;
    }
  }, [canEditActiveTransform]);

  // Reset pan when zoom returns to <= 100%
  useEffect(() => {
    if (previewZoom <= 100) {
      setPanOffset({ x: 0, y: 0 });
    }
  }, [previewZoom]);

  useEffect(() => {
    if (renderFramePreviewOnly) {
      setPanOffset({ x: 0, y: 0 });
    }
  }, [renderFramePreviewOnly]);

  const handlePreviewMouseDown = useCallback((e: React.MouseEvent) => {
    if (transformEditMode && canEditActiveTransform && activeClip?.id && resolvedActiveTransform) {
      e.preventDefault();
      setIsTransformDragging(true);
      transformDragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        ox: resolvedActiveTransform.x,
        oy: resolvedActiveTransform.y,
      };
      return;
    }
    if (renderFramePreviewOnly || previewZoom <= 100) return;
    e.preventDefault();
    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY, ox: panOffset.x, oy: panOffset.y };
  }, [renderFramePreviewOnly, previewZoom, panOffset, transformEditMode, canEditActiveTransform, activeClip?.id, resolvedActiveTransform]);

  const handlePreviewMouseMove = useCallback((e: React.MouseEvent) => {
    if (isTransformDragging && transformEditMode && canEditActiveTransform && activeClip?.id && onTransformChangeAtCurrentTime && viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect();
      const dx = (e.clientX - transformDragStartRef.current.x) / Math.max(1, rect.width);
      const dy = (e.clientY - transformDragStartRef.current.y) / Math.max(1, rect.height);
      const updates: Partial<TransformKeyframe> = {
        x: clamp01(transformDragStartRef.current.ox + dx),
        y: clamp01(transformDragStartRef.current.oy + dy),
      };
      transformDraftRef.current = updates;
      onTransformChangeAtCurrentTime(activeClip.id, updates, false);
      return;
    }
    if (!isPanning) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setPanOffset({ x: panStartRef.current.ox + dx, y: panStartRef.current.oy + dy });
  }, [isTransformDragging, transformEditMode, canEditActiveTransform, activeClip?.id, onTransformChangeAtCurrentTime, isPanning]);

  const handlePreviewMouseUp = useCallback(() => {
    if (
      isTransformDragging &&
      transformEditMode &&
      canEditActiveTransform &&
      activeClip?.id &&
      onTransformChangeAtCurrentTime &&
      transformDraftRef.current
    ) {
      onTransformChangeAtCurrentTime(activeClip.id, transformDraftRef.current, true);
    }
    transformDraftRef.current = null;
    setIsTransformDragging(false);
    setIsPanning(false);
  }, [isTransformDragging, transformEditMode, canEditActiveTransform, activeClip?.id, onTransformChangeAtCurrentTime]);

  // Ctrl+Scroll zoom toward cursor.
  // In transform edit mode, normal wheel controls clip zoom.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (e: WheelEvent) => {
      if (
        transformEditMode &&
        canEditActiveTransform &&
        activeClip?.id &&
        onTransformChangeAtCurrentTime &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        const source = resolvedActiveTransform || resolveTransformAtTime(activeClip.transform || DEFAULT_CLIP_TRANSFORM, normalizedClipTime);
        const factor = e.deltaY < 0 ? 1.04 : 1 / 1.04;
        const nextScaleX = Math.max(0.1, Math.min(5, source.scaleX * factor));
        const nextScaleY = Math.max(0.1, Math.min(5, source.scaleY * factor));
        onTransformChangeAtCurrentTime(activeClip.id, { scaleX: nextScaleX, scaleY: nextScaleY }, true);
        return;
      }

      if (!e.ctrlKey && !e.metaKey) return;
      if (renderFramePreviewOnly) return;
      e.preventDefault();

      const rect = viewport.getBoundingClientRect();
      const cursorX = e.clientX - rect.left - rect.width / 2;
      const cursorY = e.clientY - rect.top - rect.height / 2;

      const oldZoom = previewZoom;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.round(Math.max(10, Math.min(400, oldZoom * factor)));

      const scaleFactor = newZoom / oldZoom;
      setPanOffset(prev => ({
        x: cursorX - scaleFactor * (cursorX - prev.x),
        y: cursorY - scaleFactor * (cursorY - prev.y),
      }));
      setPreviewZoom(newZoom);
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [previewZoom, transformEditMode, canEditActiveTransform, activeClip, onTransformChangeAtCurrentTime, resolvedActiveTransform, normalizedClipTime, renderFramePreviewOnly]);

  // Pinch-to-zoom for touch devices
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleTouchMove = (e: TouchEvent) => {
      if (renderFramePreviewOnly) return;
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY
        );
        if (lastTouchDistRef.current !== null) {
          const scale = dist / lastTouchDistRef.current;
          setPreviewZoom(prev => Math.round(Math.max(10, Math.min(400, prev * scale))));
        }
        lastTouchDistRef.current = dist;
      }
    };

    const handleTouchEnd = () => {
      lastTouchDistRef.current = null;
    };

    viewport.addEventListener('touchmove', handleTouchMove, { passive: false });
    viewport.addEventListener('touchend', handleTouchEnd);
    return () => {
      viewport.removeEventListener('touchmove', handleTouchMove);
      viewport.removeEventListener('touchend', handleTouchEnd);
    };
  }, [renderFramePreviewOnly]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Space = play/pause
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        onPlayPause();
      }
      // Left arrow = -1 frame (assuming 30fps)
      else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onTimeChange(Math.max(0, safeCurrentTime - 1 / 30));
      }
      // Right arrow = +1 frame
      else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onTimeChange(Math.min(safeDuration || Infinity, safeCurrentTime + 1 / 30));
      }
      // Home = beginning
      else if (e.key === 'Home') {
        e.preventDefault();
        onTimeChange(0);
      }
      // End = end
      else if (e.key === 'End') {
        e.preventDefault();
        onTimeChange(safeDuration);
      }
      // F = fullscreen
      else if (e.key === 'f' && !e.ctrlKey && !e.metaKey && e.target === document.body) {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [safeCurrentTime, safeDuration, onPlayPause, onTimeChange, toggleFullscreen]);

  const effectivePreviewZoom = renderFramePreviewOnly ? 100 : previewZoom;
  const effectivePanOffset = renderFramePreviewOnly ? { x: 0, y: 0 } : panOffset;
  const zoomStyle: React.CSSProperties = (effectivePreviewZoom !== 100 || effectivePanOffset.x !== 0 || effectivePanOffset.y !== 0) ? {
    transform: `translate(${effectivePanOffset.x}px, ${effectivePanOffset.y}px) scale(${effectivePreviewZoom / 100})`,
    transformOrigin: 'center center',
  } : {};
  const previewCursor =
    transformEditMode && canEditActiveTransform
      ? (isTransformDragging ? 'grabbing' : 'move')
      : effectivePreviewZoom > 100
        ? (isPanning ? 'grabbing' : 'grab')
        : 'default';
  const transformGuideStyle = useMemo<React.CSSProperties | null>(() => {
    if (!transformEditMode || !canEditActiveTransform || !resolvedActiveTransform) return null;
    return {
      // Keep guide fixed to the stage bounds so output frame is constant.
      left: '50%',
      top: '50%',
      width: '100%',
      height: '100%',
    };
  }, [transformEditMode, canEditActiveTransform, resolvedActiveTransform]);
  const previewStageStyle = useMemo<React.CSSProperties>(() => ({
    width: `${Math.max(1, previewStageSize.width)}px`,
    height: `${Math.max(1, previewStageSize.height)}px`,
  }), [previewStageSize]);

  // ========================================
  // Compute clip effect styles (transitions, transform, filter effects)
  // ========================================

  const clipEffectStyle = useMemo((): React.CSSProperties => {
    if (!activeClip) return {};

    const style: React.CSSProperties = {};
    const filters: string[] = [];
    const transforms: string[] = [];
    let opacity = 1;

    // Time elapsed within this clip
    const clipElapsed = safeCurrentTime - activeClip.clipStartTime;

    // --- Fade transitions ---
    const fadeIn = activeClip.transitions?.fadeIn || 0;
    const fadeOut = activeClip.transitions?.fadeOut || 0;

    if (fadeIn > 0 && clipElapsed < fadeIn) {
      opacity *= clipElapsed / fadeIn;
    }
    if (fadeOut > 0 && clipElapsed > activeClip.clipDuration - fadeOut) {
      opacity *= (activeClip.clipDuration - clipElapsed) / fadeOut;
    }

    // --- Transform (overlay: position, scale, rotation, opacity) ---
    if (activeClip.transform) {
      const t = activeClip.transform;

      // If keyframes exist, interpolate between them
      let kf = resolveTransformAtTime(t, clipElapsed / activeClip.clipDuration);

      // Apply transform opacity (multiplicative with fade)
      opacity *= kf.opacity;

      // Position: shift from center (0.5,0.5 = center → no shift)
      const dx = (kf.x - 0.5) * 100; // percentage offset
      const dy = (kf.y - 0.5) * 100;
      if (dx !== 0 || dy !== 0) {
        transforms.push(`translate(${dx}%, ${dy}%)`);
      }
      if (kf.scaleX !== 1 || kf.scaleY !== 1) {
        transforms.push(`scale(${kf.scaleX}, ${kf.scaleY})`);
      }
      if (kf.rotation !== 0) {
        transforms.push(`rotate(${kf.rotation}deg)`);
      }
    }

    // --- Filter effects (from clip.effects array) ---
    if (activeClip.effects) {
      for (const effect of activeClip.effects) {
        if (effect.type === 'filter' && effect.parameters) {
          const p = effect.parameters;
          if (p.brightness != null && p.brightness !== 100) filters.push(`brightness(${p.brightness}%)`);
          if (p.contrast != null && p.contrast !== 100) filters.push(`contrast(${p.contrast}%)`);
          if (p.saturate != null && p.saturate !== 100) filters.push(`saturate(${p.saturate}%)`);
          if (p.grayscale != null && p.grayscale > 0) filters.push(`grayscale(${p.grayscale}%)`);
          if (p.sepia != null && p.sepia > 0) filters.push(`sepia(${p.sepia}%)`);
          if (p.blur != null && p.blur > 0) filters.push(`blur(${p.blur}px)`);
          if (p.hueRotate != null && p.hueRotate !== 0) filters.push(`hue-rotate(${p.hueRotate}deg)`);
          if (p.invert != null && p.invert > 0) filters.push(`invert(${p.invert}%)`);
        }
      }
    }

    // Clamp opacity
    opacity = Math.max(0, Math.min(1, opacity));
    if (opacity !== 1) style.opacity = opacity;
    if (filters.length > 0) style.filter = filters.join(' ');
    if (transforms.length > 0) style.transform = transforms.join(' ');
    style.transition = 'opacity 0.05s linear, filter 0.05s linear';

    return style;
  }, [activeClip, safeCurrentTime]);

  return (
    <div className="preview-player" ref={containerRef}>
      <style>{`
        .preview-player {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
          background: #0a0a0a;
        }

        .preview-video-container {
          flex: 1;
          height: 0;
          min-height: 0;
          position: relative;
          background: #000;
          overflow: hidden;
        }

        .preview-video-wrapper {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .preview-video-stage {
          position: relative;
          background: #000;
          overflow: hidden;
          box-shadow: 0 0 0 1px #1f1f1f, 0 0 0 2px #0b0b0b;
          max-width: 100%;
          max-height: 100%;
        }

        .preview-video-stage.free-preview {
          overflow: visible;
        }

        .preview-video {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
        }

        .preview-placeholder {
          text-align: center;
          color: #666;
        }

        .placeholder-icon {
          font-size: 64px;
          margin-bottom: 16px;
        }

        .preview-controls {
          background: #1e1e1e;
          border-top: 1px solid #333;
          padding: 8px 12px;
          flex-shrink: 0;
        }

        .seek-bar-container {
          margin-bottom: 8px;
        }

        .seek-bar {
          width: 100%;
          height: 6px;
          background: #333;
          border-radius: 3px;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
        }

        .seek-bar::-webkit-slider-thumb {
          appearance: none;
          width: 14px;
          height: 14px;
          background: #0078d4;
          border-radius: 50%;
          cursor: pointer;
        }

        .seek-bar::-moz-range-thumb {
          width: 14px;
          height: 14px;
          background: #0078d4;
          border-radius: 50%;
          cursor: pointer;
          border: none;
        }

        .controls-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .playback-controls {
          display: flex;
          gap: 4px;
        }

        .control-button {
          width: 32px;
          height: 32px;
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 4px;
          color: #e0e0e0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          transition: all 0.2s;
          flex-shrink: 0;
        }

        .control-button.text-button {
          width: auto;
          min-width: 82px;
          padding: 0 10px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.1px;
        }

        .control-button.text-button.keyframe-button {
          min-width: 74px;
          padding: 0 8px;
        }

        .control-button:hover {
          background: #333;
          border-color: #0078d4;
        }

        .control-button.primary {
          background: #0078d4;
          border-color: #0078d4;
        }

        .control-button.primary:hover {
          background: #005a9e;
        }

        .control-button.danger {
          background: #5b2a2a;
          border-color: #7a3a3a;
          color: #ffd6d6;
        }

        .control-button.danger:hover:not(:disabled) {
          background: #6e3333;
          border-color: #9a4a4a;
        }

        .time-display {
          font-size: 11px;
          font-family: 'Courier New', monospace;
          color: #e0e0e0;
          white-space: nowrap;
          padding: 2px 8px;
          border-radius: 4px;
          background: #262626;
          border: 1px solid #353535;
        }

        .frame-display {
          font-size: 10px;
          color: #8a8a8a;
          white-space: nowrap;
          padding: 2px 7px;
          border-radius: 4px;
          background: #242424;
          border: 1px solid #333;
        }

        .preview-zoom-controls {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-left: auto;
          background: #222;
          border: 1px solid #343434;
          border-radius: 7px;
          padding: 4px;
        }

        .zoom-select {
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 4px;
          color: #e0e0e0;
          font-size: 11px;
          padding: 4px 6px;
          cursor: pointer;
          outline: none;
          min-width: 88px;
        }

        .zoom-select:focus {
          border-color: #0078d4;
        }

        .zoom-select:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .volume-control {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .volume-button {
          width: 28px;
          height: 28px;
          background: transparent;
          border: none;
          color: #e0e0e0;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .volume-slider {
          width: 60px;
          height: 4px;
          background: #333;
          border-radius: 2px;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
        }

        .volume-slider::-webkit-slider-thumb {
          appearance: none;
          width: 10px;
          height: 10px;
          background: #0078d4;
          border-radius: 50%;
          cursor: pointer;
        }

        .volume-slider::-moz-range-thumb {
          width: 10px;
          height: 10px;
          background: #0078d4;
          border-radius: 50%;
          cursor: pointer;
          border: none;
        }

        .keyboard-hint {
          font-size: 9px;
          color: #555;
          margin-top: 4px;
          text-align: center;
        }

        .preview-loading-overlay {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          background: rgba(0, 0, 0, 0.65);
          border: 1px solid #333;
          border-radius: 6px;
          padding: 8px 12px;
          color: #d0d0d0;
          font-size: 12px;
          z-index: 3;
          pointer-events: none;
        }

        .transform-edit-guide {
          position: absolute;
          transform: translate(-50%, -50%);
          border: 2px solid #00d4aa;
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
          background: rgba(0, 212, 170, 0.08);
          pointer-events: none;
          z-index: 4;
        }

        .transform-edit-guide::before,
        .transform-edit-guide::after {
          content: '';
          position: absolute;
          width: 8px;
          height: 8px;
          border: 2px solid #00d4aa;
          background: #0f1f1b;
        }

        .transform-edit-guide::before {
          top: -6px;
          left: -6px;
        }

        .transform-edit-guide::after {
          right: -6px;
          bottom: -6px;
        }

        .transform-edit-hint {
          position: absolute;
          top: 12px;
          left: 12px;
          padding: 4px 8px;
          border-radius: 4px;
          background: rgba(0, 0, 0, 0.55);
          color: #9cead8;
          font-size: 11px;
          z-index: 5;
          pointer-events: none;
        }

        .output-frame-badge {
          position: absolute;
          right: 12px;
          top: 12px;
          padding: 4px 8px;
          border-radius: 4px;
          background: rgba(0, 0, 0, 0.55);
          color: #f2d47a;
          font-size: 11px;
          z-index: 5;
          pointer-events: none;
          border: 1px solid rgba(242, 212, 122, 0.45);
        }

        .preview-text-layer {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }

        .preview-text-font-loading {
          position: absolute;
          left: 50%;
          top: 12px;
          transform: translateX(-50%);
          padding: 2px 8px;
          border-radius: 4px;
          background: rgba(0, 0, 0, 0.55);
          color: #cfcfcf;
          font-size: 10px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          letter-spacing: 0.01em;
        }
      `}</style>

      {/* Video Container */}
      <div
        className="preview-video-container"
        ref={viewportRef}
        role="region"
        aria-label="Media viewport"
        onMouseDown={handlePreviewMouseDown}
        onMouseMove={handlePreviewMouseMove}
        onMouseUp={handlePreviewMouseUp}
        onMouseLeave={handlePreviewMouseUp}
        style={{ cursor: previewCursor }}
      >
        {videoError ? (
          <div className="preview-placeholder">
            <div className="placeholder-icon">&#9888;</div>
            <div style={{ color: '#ff6b6b' }}>Video Error</div>
            <div style={{ fontSize: '12px', marginTop: '8px', color: '#888' }}>
              {videoError}
            </div>
            <button
              onClick={() => {
                setVideoError(null);
                setVideoLoaded(false);
                if (videoRef.current) {
                  videoRef.current.load();
                }
              }}
              style={{
                marginTop: '12px',
                padding: '8px 16px',
                background: '#0078d4',
                border: 'none',
                borderRadius: '4px',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              Retry
            </button>
          </div>
        ) : activeClip?.isImage && effectiveUrl ? (
          <div className="preview-video-wrapper">
            <div className={`preview-video-stage ${renderFramePreviewOnly ? '' : 'free-preview'}`} style={previewStageStyle}>
              {/* Outgoing clip during transition */}
              {outgoingClip && transitionName && transitionProgress !== undefined && (() => {
                const tStyles = getTransitionStyles(transitionName, transitionProgress);
                return outgoingClip.isImage ? (
                  <img
                    src={outgoingClip.videoUrl}
                    className="preview-video"
                    style={{ ...zoomStyle, objectFit: 'contain', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', ...tStyles.outgoing }}
                    alt="Outgoing clip"
                    draggable={false}
                  />
                ) : (
                  <video
                    ref={outgoingVideoRef}
                    className="preview-video"
                    src={outgoingClip.videoUrl}
                    preload="auto"
                    playsInline
                    muted
                    style={{ ...zoomStyle, position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', ...tStyles.outgoing }}
                  />
                );
              })()}
              <img
                src={effectiveUrl}
                className="preview-video"
                style={{ ...zoomStyle, objectFit: 'contain', ...clipEffectStyle,
                  // Merge zoom + clip transforms
                  transform: [zoomStyle.transform, clipEffectStyle.transform].filter(Boolean).join(' ') || undefined,
                  ...(outgoingClip && transitionName && transitionProgress !== undefined
                    ? getTransitionStyles(transitionName, transitionProgress).incoming
                    : {}),
                }}
                alt="Image preview"
                draggable={false}
              />
              {activeTextClips.length > 0 && (
                <div className="preview-text-layer" aria-hidden="true">
                  {!textFontsReady ? (
                    <div className="preview-text-font-loading">Loading preview fonts...</div>
                  ) : (
                    resolvedTextOverlays.map((overlay) => (
                      <div
                        key={overlay.id}
                        data-testid={`preview-text-clip-${overlay.id}`}
                        style={overlay.style}
                      >
                        {overlay.text}
                      </div>
                    ))
                  )}
                </div>
              )}
              {transformGuideStyle && (
                <>
                  <div className="transform-edit-guide" style={transformGuideStyle} />
                  <div className="transform-edit-hint">Drag clip to reposition crop · Scroll to zoom</div>
                  <div className="output-frame-badge">Output Frame (Render)</div>
                </>
              )}
            </div>
          </div>
        ) : effectiveUrl ? (
          <div className="preview-video-wrapper">
            <div className={`preview-video-stage ${renderFramePreviewOnly ? '' : 'free-preview'}`} style={previewStageStyle}>
              {/* Outgoing clip during transition */}
              {outgoingClip && transitionName && transitionProgress !== undefined && (() => {
                const tStyles = getTransitionStyles(transitionName, transitionProgress);
                return outgoingClip.isImage ? (
                  <img
                    src={outgoingClip.videoUrl}
                    className="preview-video"
                    style={{ ...zoomStyle, objectFit: 'contain', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', ...tStyles.outgoing }}
                    alt="Outgoing clip"
                    draggable={false}
                  />
                ) : (
                  <video
                    ref={outgoingVideoRef}
                    className="preview-video"
                    src={outgoingClip.videoUrl}
                    preload="auto"
                    playsInline
                    muted
                    style={{ ...zoomStyle, position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', ...tStyles.outgoing }}
                  />
                );
              })()}
              <video
                ref={videoRef}
                className="preview-video"
                src={effectiveUrl}
                preload="auto"
                playsInline
                onLoadedData={handleLoadedData}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => {
                  // Advance to next clip instead of stopping
                  if (activeClip) {
                    const nextTime = activeClip.clipStartTime + activeClip.clipDuration;
                    if (!Number.isFinite(nextTime) || nextTime >= safeDuration) {
                      onStop();
                    } else {
                      onTimeChange(nextTime);
                    }
                  } else {
                    onStop();
                  }
                }}
                onError={handleVideoError}
                muted={isMuted}
                style={{ ...zoomStyle, ...clipEffectStyle,
                  transform: [zoomStyle.transform, clipEffectStyle.transform].filter(Boolean).join(' ') || undefined,
                  ...(outgoingClip && transitionName && transitionProgress !== undefined
                    ? getTransitionStyles(transitionName, transitionProgress).incoming
                    : {}),
                }}
              />
              {activeTextClips.length > 0 && (
                <div className="preview-text-layer" aria-hidden="true">
                  {!textFontsReady ? (
                    <div className="preview-text-font-loading">Loading preview fonts...</div>
                  ) : (
                    resolvedTextOverlays.map((overlay) => (
                      <div
                        key={overlay.id}
                        data-testid={`preview-text-clip-${overlay.id}`}
                        style={overlay.style}
                      >
                        {overlay.text}
                      </div>
                    ))
                  )}
                </div>
              )}
              {transformGuideStyle && (
                <>
                  <div className="transform-edit-guide" style={transformGuideStyle} />
                  <div className="transform-edit-hint">Drag clip to reposition crop · Scroll to zoom</div>
                  <div className="output-frame-badge">Output Frame (Render)</div>
                </>
              )}
              {!videoLoaded && !videoError && (
                <div className="preview-loading-overlay">
                  {stalledLoading ? "Preview is taking longer to load..." : "Loading preview..."}
                </div>
              )}
            </div>
          </div>
        ) : activeTextClips.length > 0 ? (
          <div className="preview-video-wrapper">
            <div className={`preview-video-stage ${renderFramePreviewOnly ? '' : 'free-preview'}`} style={previewStageStyle}>
              <div className="preview-text-layer" aria-hidden="true">
                {!textFontsReady ? (
                  <div className="preview-text-font-loading">Loading preview fonts...</div>
                ) : (
                  resolvedTextOverlays.map((overlay) => (
                    <div
                      key={overlay.id}
                      data-testid={`preview-text-clip-${overlay.id}`}
                      style={overlay.style}
                    >
                      {overlay.text}
                    </div>
                  ))
                )}
              </div>
              <div className="output-frame-badge">Output Frame (Render)</div>
            </div>
          </div>
        ) : (
          <div className="preview-placeholder">
            <div className="placeholder-icon">&#9654;</div>
            <div>Preview Window</div>
            <div style={{ fontSize: '12px', marginTop: '8px', color: '#888' }}>
              Add clips to timeline to preview
            </div>
          </div>
        )}
      </div>

      {/* Hidden audio elements for timeline audio tracks */}
      {activeAudioClips.map(clip => (
        <audio
          key={clip.videoUrl}
          src={clip.videoUrl}
          preload="auto"
          ref={el => {
            if (el) {
              audioRefs.current.set(clip.videoUrl, el);
            }
          }}
          style={{ display: 'none' }}
        />
      ))}

      {/* Controls */}
      <div className="preview-controls" role="group" aria-label="Video playback controls">
        {/* Seek Bar */}
        <div className="seek-bar-container">
          <input
            type="range"
            className="seek-bar"
            min="0"
            max={safeDuration || 1}
            step="0.01"
            value={safeCurrentTime}
            onChange={handleSeek}
            aria-label="Seek video position"
          />
        </div>

        {/* Control Buttons */}
        <div className="controls-row">
          <div className="playback-controls">
            <button
              className="control-button"
              onClick={() => onTimeChange(Math.max(0, safeCurrentTime - 1 / 30))}
              title="Previous Frame"
              aria-label="Go to previous frame"
            >
              &#9198;
            </button>
            <button
              className="control-button primary"
              onClick={onPlayPause}
              title="Play/Pause (Space)"
              aria-label={isPlaying ? 'Pause video' : 'Play video'}
            >
              {isPlaying ? '\u23F8' : '\u25B6'}
            </button>
            <button
              className="control-button"
              onClick={onStop}
              title="Stop"
              aria-label="Stop playback"
            >
              &#9209;
            </button>
            <button
              className="control-button"
              onClick={() => onTimeChange(Math.min(safeDuration || Infinity, safeCurrentTime + 1 / 30))}
              title="Next Frame"
              aria-label="Go to next frame"
            >
              &#9197;
            </button>
          </div>

          {/* Time Display */}
          <div className="time-display">
            {formatTime(safeCurrentTime)} / {formatTime(safeDuration)}
          </div>
          <div className="frame-display">
            {Math.round(outputWidth)}x{Math.round(outputHeight)}
          </div>

          {/* Volume Control */}
          <div className="volume-control">
            <button
              className="volume-button"
              onClick={toggleMute}
              title="Mute/Unmute"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? '\uD83D\uDD07' : volume > 0.5 ? '\uD83D\uDD0A' : '\uD83D\uDD09'}
            </button>
            <input
              type="range"
              className="volume-slider"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              aria-label="Volume level"
            />
          </div>

          {/* Preview Zoom + Fullscreen */}
          <div className="preview-zoom-controls">
            {onOpenKeyframePanel && (
              <button
                className="control-button text-button keyframe-button"
                onClick={onOpenKeyframePanel}
                title="Open keyframes panel"
                aria-label="Open keyframes panel"
              >
                Keyframes
              </button>
            )}
            {canEditActiveTransform && onAddKeyframeAtCurrentTime && activeClip?.id && (
              <button
                className="control-button text-button keyframe-button"
                onClick={() => onAddKeyframeAtCurrentTime(activeClip.id!)}
                title="Set keyframe at current playhead (create if missing, replace if exists)"
                aria-label="Set keyframe at current playhead"
              >
                Set KF
              </button>
            )}
            {canEditActiveTransform && onDeleteKeyframeAtCurrentTime && activeClip?.id && hasActiveKeyframeAtPlayhead && (
              <button
                className="control-button text-button keyframe-button danger"
                onClick={() => onDeleteKeyframeAtCurrentTime(activeClip.id!)}
                title="Delete keyframe at current playhead"
                aria-label="Delete keyframe at current playhead"
              >
                Delete KF
              </button>
            )}
            <button
              className={`control-button text-button ${renderFramePreviewOnly ? 'primary' : ''}`}
              onClick={() => setRenderFramePreviewOnly(prev => !prev)}
              title={renderFramePreviewOnly
                ? 'Preview Lock: show only final output frame'
                : 'Free Preview: allow viewport pan/zoom'}
              aria-label="Toggle preview lock mode"
            >
              Preview Lock
            </button>
            <button
              className={`control-button text-button ${transformEditMode ? 'primary' : ''}`}
              onClick={() => setTransformEditMode(prev => !prev)}
              title={
                canEditActiveTransform
                  ? (hasSelectedActiveClip
                    ? 'Transform edit mode: drag in preview to move, scroll to zoom clip'
                    : 'Transform edit mode (active clip at playhead): drag to move, scroll to zoom clip')
                  : 'Move playhead onto a clip to edit transform'
              }
              aria-label="Toggle transform edit mode"
              disabled={!canEditActiveTransform}
            >
              Transform
            </button>
            <select
              className="zoom-select"
              value={previewZoom}
              onChange={e => setPreviewZoom(Number(e.target.value))}
              title={renderFramePreviewOnly ? 'Disabled while Preview Lock is enabled' : 'Preview zoom level'}
              disabled={renderFramePreviewOnly}
            >
              {ZOOM_PRESETS.map(z => (
                <option key={z} value={z}>{z}%</option>
              ))}
            </select>
            <button
              className="control-button"
              onClick={toggleFullscreen}
              title="Fullscreen (F)"
              aria-label="Toggle fullscreen"
              style={{ fontSize: '12px' }}
            >
              {isFullscreen ? '\u2716' : '\u26F6'}
            </button>
          </div>
        </div>

        <div className="keyboard-hint">
          {renderFramePreviewOnly
            ? 'Preview Lock ON: frame-accurate view (viewport pan/zoom disabled) | KF edits apply immediately'
            : 'Space: Play/Pause | F: Fullscreen | Left/Right: Frame Step | Ctrl+Scroll: Preview Zoom | Drag: Pan | KF edits apply immediately'}
        </div>
      </div>
    </div>
  );
};

export default PreviewPlayer;
