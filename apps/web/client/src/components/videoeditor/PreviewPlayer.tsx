/**
 * Preview Player Component
 * Video preview with playback controls, zoom levels, and fullscreen
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { formatTime } from '../../types/videoEditor';
import type { ClipTransform, TransformKeyframe, Effect, TransitionName } from '../../types/videoEditor';

export interface ActiveClipInfo {
  videoUrl: string;
  clipStartTime: number;  // where the clip starts on the timeline
  trimIn: number;         // trim offset within the source file
  clipDuration: number;   // visible duration on timeline
  isImage?: boolean;      // true for image clips (renders <img> instead of <video>)
  transitions?: { fadeIn?: number; fadeOut?: number };
  transform?: ClipTransform;
  effects?: Effect[];
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
  transitionName?: string;
  transitionProgress?: number;
  allowSeekingWhilePlaying?: boolean;
  skipSilencePreview?: boolean;
  skipRanges?: Array<{ start: number; end: number }>;
  skipCooldownMs?: number;
  skipBoundaryGuardSec?: number;
}

const ZOOM_PRESETS = [10, 25, 50, 75, 100, 125, 150, 200, 250, 300, 350, 400];

/** Resolve transform values at a normalized time (0-1) within the clip, interpolating keyframes. */
function resolveTransformAtTime(
  t: ClipTransform,
  normalizedTime: number,
): { x: number; y: number; scaleX: number; scaleY: number; rotation: number; opacity: number } {
  const base = { x: t.x, y: t.y, scaleX: t.scaleX, scaleY: t.scaleY, rotation: t.rotation, opacity: t.opacity };
  if (!t.keyframes || t.keyframes.length === 0) return base;

  const kfs = [...t.keyframes].sort((a, b) => a.time - b.time);
  const time = Math.max(0, Math.min(1, normalizedTime));

  // Before first keyframe — use first keyframe values
  if (time <= kfs[0].time) return kfs[0];
  // After last keyframe — use last keyframe values
  if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1];

  // Find the two keyframes to interpolate between
  for (let i = 0; i < kfs.length - 1; i++) {
    if (time >= kfs[i].time && time <= kfs[i + 1].time) {
      const a = kfs[i];
      const b = kfs[i + 1];
      const segmentProgress = (time - a.time) / (b.time - a.time);
      const eased = applyEasing(segmentProgress, b.easing || 'linear');
      return {
        x: a.x + (b.x - a.x) * eased,
        y: a.y + (b.y - a.y) * eased,
        scaleX: a.scaleX + (b.scaleX - a.scaleX) * eased,
        scaleY: a.scaleY + (b.scaleY - a.scaleY) * eased,
        rotation: a.rotation + (b.rotation - a.rotation) * eased,
        opacity: a.opacity + (b.opacity - a.opacity) * eased,
      };
    }
  }
  return base;
}

function applyEasing(t: number, easing: string): number {
  switch (easing) {
    case 'ease-in': return t * t;
    case 'ease-out': return t * (2 - t);
    case 'ease-in-out': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    default: return t; // linear
  }
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
  transitionName,
  transitionProgress,
  allowSeekingWhilePlaying = false,
  skipSilencePreview = false,
  skipRanges = [],
  skipCooldownMs = 100,
  skipBoundaryGuardSec = 0.05,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const outgoingVideoRef = useRef<HTMLVideoElement>(null);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [stalledLoading, setStalledLoading] = useState(false);
  const safeCurrentTime = Number.isFinite(currentTime) ? currentTime : 0;
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const lastSkipTimestampRef = useRef(0);

  // Pan state for zoomed preview
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; ox: number; oy: number }>({ x: 0, y: 0, ox: 0, oy: 0 });
  const lastTouchDistRef = useRef<number | null>(null);

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

  // Reset pan when zoom returns to <= 100%
  useEffect(() => {
    if (previewZoom <= 100) {
      setPanOffset({ x: 0, y: 0 });
    }
  }, [previewZoom]);

  // Mouse drag panning (when zoomed > 100%)
  const handlePreviewMouseDown = useCallback((e: React.MouseEvent) => {
    if (previewZoom <= 100) return;
    e.preventDefault();
    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY, ox: panOffset.x, oy: panOffset.y };
  }, [previewZoom, panOffset]);

  const handlePreviewMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setPanOffset({ x: panStartRef.current.ox + dx, y: panStartRef.current.oy + dy });
  }, [isPanning]);

  const handlePreviewMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Ctrl+Scroll zoom toward cursor
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();

      const rect = container.getBoundingClientRect();
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

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [previewZoom]);

  // Pinch-to-zoom for touch devices
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchMove = (e: TouchEvent) => {
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

    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    return () => {
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

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

  const zoomStyle: React.CSSProperties = (previewZoom !== 100 || panOffset.x !== 0 || panOffset.y !== 0) ? {
    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${previewZoom / 100})`,
    transformOrigin: 'center center',
  } : {};

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
          gap: 8px;
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

        .time-display {
          font-size: 11px;
          font-family: 'Courier New', monospace;
          color: #e0e0e0;
          white-space: nowrap;
        }

        .preview-zoom-controls {
          display: flex;
          align-items: center;
          gap: 4px;
          margin-left: auto;
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
        }

        .zoom-select:focus {
          border-color: #0078d4;
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
      `}</style>

      {/* Video Container */}
      <div
        className="preview-video-container"
        role="region"
        aria-label="Media viewport"
        onMouseDown={handlePreviewMouseDown}
        onMouseMove={handlePreviewMouseMove}
        onMouseUp={handlePreviewMouseUp}
        onMouseLeave={handlePreviewMouseUp}
        style={{ cursor: previewZoom > 100 ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
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
          </div>
        ) : effectiveUrl ? (
          <div className="preview-video-wrapper">
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
        {effectiveUrl && !activeClip?.isImage && !videoLoaded && !videoError && (
          <div className="preview-loading-overlay">
            {stalledLoading ? "Preview is taking longer to load..." : "Loading preview..."}
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
            <select
              className="zoom-select"
              value={previewZoom}
              onChange={e => setPreviewZoom(Number(e.target.value))}
              title="Preview zoom level"
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
          Space: Play/Pause &bull; F: Fullscreen &bull; &larr;/&rarr;: Frame Step &bull; Ctrl+Scroll: Zoom &bull; Drag: Pan
        </div>
      </div>
    </div>
  );
};

export default PreviewPlayer;
