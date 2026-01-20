/**
 * Preview Player Component
 * Phase 1: Video preview with playback controls
 */

import React, { useRef, useEffect, useState } from 'react';
import { formatTime } from '../../types/videoEditor';

interface PreviewPlayerProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTimeChange: (time: number) => void;
  onPlayPause: () => void;
  onStop: () => void;
  previewVideoUrl?: string;  // For Phase 1, we'll show placeholder
}

export const PreviewPlayer: React.FC<PreviewPlayerProps> = ({
  currentTime,
  duration,
  isPlaying,
  onTimeChange,
  onPlayPause,
  onStop,
  previewVideoUrl
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Sync video element with current time
  useEffect(() => {
    if (videoRef.current && Math.abs(videoRef.current.currentTime - currentTime) > 0.1) {
      try {
        videoRef.current.currentTime = currentTime;
        setVideoError(null);
      } catch (err) {
        console.error('Failed to set current time:', err);
        setVideoError(err instanceof Error ? err.message : 'Failed to seek video');
      }
    }
  }, [currentTime]);

  // Handle play/pause
  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(err => {
          console.error('Failed to play:', err);
          setVideoError(err instanceof Error ? err.message : 'Failed to play video');
          onPlayPause(); // Revert to paused state
        });
      } else {
        try {
          videoRef.current.pause();
          setVideoError(null);
        } catch (err) {
          console.error('Failed to pause:', err);
          setVideoError(err instanceof Error ? err.message : 'Failed to pause video');
        }
      }
    }
  }, [isPlaying, onPlayPause]);

  // Handle video time update
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      onTimeChange(videoRef.current.currentTime);
    }
  };

  // Handle seek
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    onTimeChange(time);
  };

  // Handle volume change
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const vol = parseFloat(e.target.value);
      if (isNaN(vol) || vol < 0 || vol > 1) {
        throw new Error('Invalid volume value');
      }
      setVolume(vol);
      if (videoRef.current) {
        videoRef.current.volume = vol;
      }
      setVideoError(null);
    } catch (err) {
      console.error('Failed to change volume:', err);
      setVideoError(err instanceof Error ? err.message : 'Failed to change volume');
    }
  };

  // Toggle mute
  const toggleMute = () => {
    try {
      setIsMuted(!isMuted);
      if (videoRef.current) {
        videoRef.current.muted = !isMuted;
      }
      setVideoError(null);
    } catch (err) {
      console.error('Failed to toggle mute:', err);
      setVideoError(err instanceof Error ? err.message : 'Failed to toggle mute');
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
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentTime, duration, onPlayPause, onTimeChange]);

  return (
    <div className="preview-player">
      <style>{`
        .preview-player {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #0a0a0a;
        }

        .preview-video-container {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #000;
          position: relative;
        }

        .preview-video {
          max-width: 100%;
          max-height: 100%;
          width: auto;
          height: auto;
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
          padding: 12px;
        }

        .seek-bar-container {
          margin-bottom: 12px;
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
          gap: 12px;
        }

        .playback-controls {
          display: flex;
          gap: 8px;
        }

        .control-button {
          width: 36px;
          height: 36px;
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 4px;
          color: #e0e0e0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          transition: all 0.2s;
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
          font-size: 12px;
          font-family: 'Courier New', monospace;
          color: #e0e0e0;
          min-width: 140px;
        }

        .volume-control {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-left: auto;
        }

        .volume-button {
          width: 32px;
          height: 32px;
          background: transparent;
          border: none;
          color: #e0e0e0;
          cursor: pointer;
          font-size: 18px;
        }

        .volume-slider {
          width: 80px;
          height: 4px;
          background: #333;
          border-radius: 2px;
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
        }

        .volume-slider::-webkit-slider-thumb {
          appearance: none;
          width: 12px;
          height: 12px;
          background: #0078d4;
          border-radius: 50%;
          cursor: pointer;
        }

        .volume-slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          background: #0078d4;
          border-radius: 50%;
          cursor: pointer;
          border: none;
        }

        .keyboard-hint {
          font-size: 10px;
          color: #666;
          margin-top: 4px;
          text-align: center;
        }
      `}</style>

      {/* Video Container */}
      <div className="preview-video-container" role="region" aria-label="Video preview">
        {videoError ? (
          <div className="preview-placeholder">
            <div className="placeholder-icon">⚠️</div>
            <div style={{ color: '#ff6b6b' }}>Video Error</div>
            <div style={{ fontSize: '12px', marginTop: '8px', color: '#888' }}>
              {videoError}
            </div>
            <button
              onClick={() => {
                setVideoError(null);
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
        ) : previewVideoUrl ? (
          <video
            ref={videoRef}
            className="preview-video"
            src={previewVideoUrl}
            onTimeUpdate={handleTimeUpdate}
            onEnded={onStop}
            onError={handleVideoError}
          />
        ) : (
          <div className="preview-placeholder">
            <div className="placeholder-icon">▶️</div>
            <div>Preview Window</div>
            <div style={{ fontSize: '12px', marginTop: '8px', color: '#888' }}>
              Add clips to timeline to preview
            </div>
            <div style={{ fontSize: '11px', marginTop: '12px', color: '#555' }}>
              Phase 1: Preview will be implemented in next update
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
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={currentTime}
            aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
          />
        </div>

        {/* Control Buttons */}
        <div className="controls-row">
          <div className="playback-controls">
            {/* Previous Frame */}
            <button
              className="control-button"
              onClick={() => onTimeChange(Math.max(0, currentTime - 1/30))}
              title="Previous Frame (←)"
              aria-label="Go to previous frame"
            >
              ⏮
            </button>

            {/* Play/Pause */}
            <button
              className="control-button primary"
              onClick={onPlayPause}
              title="Play/Pause (Space)"
              aria-label={isPlaying ? 'Pause video' : 'Play video'}
              aria-pressed={isPlaying}
            >
              {isPlaying ? '⏸' : '▶️'}
            </button>

            {/* Stop */}
            <button
              className="control-button"
              onClick={onStop}
              title="Stop"
              aria-label="Stop playback"
            >
              ⏹
            </button>

            {/* Next Frame */}
            <button
              className="control-button"
              onClick={() => onTimeChange(Math.min(duration, currentTime + 1/30))}
              title="Next Frame (→)"
              aria-label="Go to next frame"
            >
              ⏭
            </button>
          </div>

          {/* Time Display */}
          <div className="time-display">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>

          {/* Volume Control */}
          <div className="volume-control" role="group" aria-label="Volume controls">
            <button
              className="volume-button"
              onClick={toggleMute}
              title="Mute/Unmute"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              aria-pressed={isMuted}
            >
              {isMuted ? '🔇' : volume > 0.5 ? '🔊' : volume > 0 ? '🔉' : '🔈'}
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
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={isMuted ? 0 : volume}
              aria-valuetext={`${Math.round((isMuted ? 0 : volume) * 100)}%`}
            />
          </div>
        </div>

        {/* Keyboard Hints */}
        <div className="keyboard-hint">
          Space: Play/Pause • ←/→: Frame Step • Home/End: Start/End
        </div>
      </div>
    </div>
  );
};

export default PreviewPlayer;
