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

  // Sync video element with current time
  useEffect(() => {
    if (videoRef.current && Math.abs(videoRef.current.currentTime - currentTime) > 0.1) {
      videoRef.current.currentTime = currentTime;
    }
  }, [currentTime]);

  // Handle play/pause
  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(err => {
          console.error('Failed to play:', err);
        });
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying]);

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
    const vol = parseFloat(e.target.value);
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
      <div className="preview-video-container">
        {previewVideoUrl ? (
          <video
            ref={videoRef}
            className="preview-video"
            src={previewVideoUrl}
            onTimeUpdate={handleTimeUpdate}
            onEnded={onStop}
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
      <div className="preview-controls">
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
            >
              ⏮
            </button>

            {/* Play/Pause */}
            <button
              className="control-button primary"
              onClick={onPlayPause}
              title="Play/Pause (Space)"
            >
              {isPlaying ? '⏸' : '▶️'}
            </button>

            {/* Stop */}
            <button
              className="control-button"
              onClick={onStop}
              title="Stop"
            >
              ⏹
            </button>

            {/* Next Frame */}
            <button
              className="control-button"
              onClick={() => onTimeChange(Math.min(duration, currentTime + 1/30))}
              title="Next Frame (→)"
            >
              ⏭
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
