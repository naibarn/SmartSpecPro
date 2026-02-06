/**
 * Preview Player Component
 * Video preview with playback controls, zoom levels, and fullscreen
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { formatTime } from '../../types/videoEditor';

export interface ActiveClipInfo {
  videoUrl: string;
  clipStartTime: number;  // where the clip starts on the timeline
  trimIn: number;         // trim offset within the source file
  clipDuration: number;   // visible duration on timeline
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
}

const ZOOM_PRESETS = [10, 25, 50, 75, 100, 125, 150, 200];

export const PreviewPlayer: React.FC<PreviewPlayerProps> = ({
  currentTime,
  duration,
  isPlaying,
  onTimeChange,
  onPlayPause,
  onStop,
  previewVideoUrl,
  activeClip
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);

  // Compute the effective video URL
  const effectiveUrl = activeClip?.videoUrl || previewVideoUrl;

  // Track the previous URL so we know when the source changes
  const prevUrlRef = useRef<string | undefined>(undefined);

  // Reset loaded state when URL changes
  useEffect(() => {
    if (effectiveUrl !== prevUrlRef.current) {
      setVideoLoaded(false);
      setVideoError(null);
      prevUrlRef.current = effectiveUrl;
    }
  }, [effectiveUrl]);

  // When video metadata loads, mark as ready
  const handleLoadedData = useCallback(() => {
    setVideoLoaded(true);
    setVideoError(null);
  }, []);

  // Sync video element with current time — only when NOT playing
  // During playback, the video element drives the time via onTimeUpdate
  useEffect(() => {
    if (!videoRef.current || !effectiveUrl || !videoLoaded) return;
    if (isPlaying) return; // Don't seek while playing — video drives time

    let targetTime: number;
    if (activeClip) {
      targetTime = activeClip.trimIn + (currentTime - activeClip.clipStartTime);
    } else {
      targetTime = currentTime;
    }

    // Clamp to valid range
    targetTime = Math.max(0, targetTime);

    if (Math.abs(videoRef.current.currentTime - targetTime) > 0.05) {
      try {
        videoRef.current.currentTime = targetTime;
      } catch (err) {
        console.error('Failed to set current time:', err);
      }
    }
  }, [currentTime, activeClip, effectiveUrl, isPlaying, videoLoaded]);

  // Handle play/pause — re-triggers when videoLoaded changes so play() is called
  // after the video element finishes loading (prevents black screen deadlock)
  useEffect(() => {
    if (!videoRef.current || !videoLoaded) return;

    if (isPlaying) {
      // Seek to correct position before playing
      if (activeClip) {
        const targetTime = activeClip.trimIn + (currentTime - activeClip.clipStartTime);
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
  }, [isPlaying, videoLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle video time update — convert source time back to timeline time
  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current || !isPlaying) return;

    if (activeClip) {
      const timelineTime = activeClip.clipStartTime + (videoRef.current.currentTime - activeClip.trimIn);
      // Only update if within clip bounds
      if (timelineTime >= activeClip.clipStartTime && timelineTime <= activeClip.clipStartTime + activeClip.clipDuration) {
        onTimeChange(timelineTime);
      } else if (timelineTime > activeClip.clipStartTime + activeClip.clipDuration) {
        // Reached end of clip — pause
        onPlayPause();
      }
    } else if (effectiveUrl) {
      onTimeChange(videoRef.current.currentTime);
    }
  }, [activeClip, effectiveUrl, isPlaying, onTimeChange, onPlayPause]);

  // Handle seek
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    onTimeChange(time);
  };

  // Handle volume change
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    if (isNaN(vol) || vol < 0 || vol > 1) return;
    setVolume(vol);
    if (videoRef.current) {
      videoRef.current.volume = vol;
    }
  };

  // Toggle mute
  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
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
        onTimeChange(Math.max(0, currentTime - 1/30));
      }
      // Right arrow = +1 frame
      else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onTimeChange(Math.min(duration, currentTime + 1/30));
      }
      // Home = beginning
      else if (e.key === 'Home') {
        e.preventDefault();
        onTimeChange(0);
      }
      // End = end
      else if (e.key === 'End') {
        e.preventDefault();
        onTimeChange(duration);
      }
      // F = fullscreen
      else if (e.key === 'f' && !e.ctrlKey && !e.metaKey && e.target === document.body) {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentTime, duration, onPlayPause, onTimeChange, toggleFullscreen]);

  const zoomStyle: React.CSSProperties = previewZoom !== 100 ? {
    transform: `scale(${previewZoom / 100})`,
    transformOrigin: 'center center',
  } : {};

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
      `}</style>

      {/* Video Container */}
      <div className="preview-video-container" role="region" aria-label="Media viewport">
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
        ) : effectiveUrl ? (
          <div className="preview-video-wrapper">
            <video
              ref={videoRef}
              className="preview-video"
              src={effectiveUrl}
              preload="auto"
              playsInline
              onLoadedData={handleLoadedData}
              onTimeUpdate={handleTimeUpdate}
              onEnded={onStop}
              onError={handleVideoError}
              muted={isMuted}
              style={zoomStyle}
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
      </div>

      {/* Controls */}
      <div className="preview-controls" role="group" aria-label="Video playback controls">
        {/* Seek Bar */}
        <div className="seek-bar-container">
          <input
            type="range"
            className="seek-bar"
            min="0"
            max={duration || 1}
            step="0.01"
            value={currentTime}
            onChange={handleSeek}
            aria-label="Seek video position"
          />
        </div>

        {/* Control Buttons */}
        <div className="controls-row">
          <div className="playback-controls">
            <button
              className="control-button"
              onClick={() => onTimeChange(Math.max(0, currentTime - 1/30))}
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
              onClick={() => onTimeChange(Math.min(duration, currentTime + 1/30))}
              title="Next Frame"
              aria-label="Go to next frame"
            >
              &#9197;
            </button>
          </div>

          {/* Time Display */}
          <div className="time-display">
            {formatTime(currentTime)} / {formatTime(duration)}
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
          Space: Play/Pause &bull; F: Fullscreen &bull; &larr;/&rarr;: Frame Step
        </div>
      </div>
    </div>
  );
};

export default PreviewPlayer;
