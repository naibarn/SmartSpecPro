/**
 * Render Progress Dialog Component
 * Phase 2: Real-time render progress tracking
 */

import React, { useEffect, useState } from 'react';
import { videoEditorRenderService } from '../../services/videoEditorService';
import type { RenderJob } from '../../services/videoEditorService';

interface RenderProgressDialogProps {
  jobId: string;
  onComplete: (outputPath: string) => void;
  onCancel: () => void;
}

export const RenderProgressDialog: React.FC<RenderProgressDialogProps> = ({
  jobId,
  onComplete,
  onCancel
}) => {
  const [job, setJob] = useState<RenderJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    pollRenderStatus();
  }, [jobId]);

  useEffect(() => {
    if (job?.status === 'rendering') {
      const timer = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [job?.status]);

  const pollRenderStatus = async () => {
    try {
      await videoEditorRenderService.pollRenderJob(
        jobId,
        (updatedJob) => {
          setJob(updatedJob);

          if (updatedJob.status === 'completed') {
            // Don't auto-close — let user click Download or Close
          } else if (updatedJob.status === 'failed') {
            setError(updatedJob.error || 'Render failed');
          }
        },
        500 // poll every 500ms
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleCancel = async () => {
    if (job && (job.status === 'pending' || job.status === 'rendering')) {
      try {
        await videoEditorRenderService.cancelRender(jobId);
      } catch (err) {
        console.error('Failed to cancel:', err);
      }
    }
    onCancel();
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusIcon = () => {
    switch (job?.status) {
      case 'pending':
        return '⏳';
      case 'rendering':
        return '🎬';
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
      case 'cancelled':
        return '⛔';
      default:
        return '⏳';
    }
  };

  const getStatusText = () => {
    switch (job?.status) {
      case 'pending':
        return 'Starting render...';
      case 'rendering':
        return 'Rendering video...';
      case 'completed':
        return 'Render complete!';
      case 'failed':
        return 'Render failed';
      case 'cancelled':
        return 'Render cancelled';
      default:
        return 'Initializing...';
    }
  };

  const getProgressPercentage = (): number => {
    return job ? Math.round(job.progress * 100) : 0;
  };

  const estimateRemainingTime = (): string => {
    if (!job || job.progress === 0) return 'Calculating...';

    const remaining = (elapsedTime / job.progress) * (1 - job.progress);
    return formatTime(Math.round(remaining));
  };

  return (
    <div className="render-progress-overlay">
      <style>{`
        .render-progress-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
        }

        .render-progress-dialog {
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 8px;
          width: 500px;
          max-width: 90vw;
          padding: 32px;
          text-align: center;
        }

        .status-icon {
          font-size: 64px;
          margin-bottom: 16px;
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }

        .status-text {
          font-size: 18px;
          font-weight: 600;
          color: #e0e0e0;
          margin-bottom: 8px;
        }

        .status-subtext {
          font-size: 13px;
          color: #888;
          margin-bottom: 24px;
        }

        .progress-container {
          margin-bottom: 20px;
        }

        .progress-bar-wrapper {
          width: 100%;
          height: 8px;
          background: #1a1a1a;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 12px;
        }

        .progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #0078d4, #00b294);
          border-radius: 4px;
          transition: width 0.3s ease;
        }

        .progress-text {
          font-size: 24px;
          font-weight: 700;
          color: #0078d4;
          margin-bottom: 8px;
        }

        .progress-details {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #888;
        }

        .error-message {
          background: #ff6b6b20;
          border: 1px solid #ff6b6b;
          border-radius: 4px;
          padding: 12px;
          color: #ff6b6b;
          font-size: 13px;
          margin-bottom: 20px;
          text-align: left;
        }

        .success-message {
          background: #4caf5020;
          border: 1px solid #4caf50;
          border-radius: 4px;
          padding: 12px;
          color: #4caf50;
          font-size: 13px;
          margin-bottom: 20px;
        }

        .dialog-buttons {
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        .dialog-button {
          padding: 10px 24px;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .dialog-button.cancel {
          background: #ff6b6b;
          color: white;
        }

        .dialog-button.cancel:hover {
          background: #ff5252;
        }

        .dialog-button.close {
          background: #0078d4;
          color: white;
        }

        .dialog-button.close:hover {
          background: #005a9e;
        }

        .dialog-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid #444;
          border-top-color: #0078d4;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-right: 8px;
          vertical-align: middle;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div className="render-progress-dialog">
        {/* Status Icon */}
        <div className="status-icon">{getStatusIcon()}</div>

        {/* Status Text */}
        <div className="status-text">{getStatusText()}</div>
        <div className="status-subtext">
          {job?.status === 'rendering' && `Elapsed: ${formatTime(elapsedTime)}`}
          {job?.status === 'completed' && 'Your video is ready!'}
        </div>

        {/* Progress Bar */}
        {job && job.status === 'rendering' && (
          <div className="progress-container">
            <div className="progress-bar-wrapper">
              <div
                className="progress-bar"
                style={{ width: `${getProgressPercentage()}%` }}
              />
            </div>
            <div className="progress-text">{getProgressPercentage()}%</div>
            <div className="progress-details">
              <span>Elapsed: {formatTime(elapsedTime)}</span>
              <span>Remaining: ~{estimateRemainingTime()}</span>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Success Message */}
        {job?.status === 'completed' && (
          <div className="success-message">
            Video exported successfully to:<br />
            <strong>{job.outputPath}</strong>
          </div>
        )}

        {/* Buttons */}
        <div className="dialog-buttons">
          {job?.status === 'rendering' && (
            <>
              <button
                className="dialog-button cancel"
                onClick={handleCancel}
              >
                Cancel Render
              </button>
              <button
                className="dialog-button close"
                onClick={onCancel}
                title="Close dialog — render continues in background"
              >
                Close (Background)
              </button>
            </>
          )}

          {job?.status === 'completed' && (
            <>
              {job.outputPath && (
                <a
                  href={job.outputPath}
                  download
                  className="dialog-button close"
                  style={{ textDecoration: 'none' }}
                >
                  &#11015; Download
                </a>
              )}
              <button
                className="dialog-button close"
                onClick={() => onComplete(job.outputPath)}
              >
                Close
              </button>
            </>
          )}

          {(job?.status === 'failed' || job?.status === 'cancelled') && (
            <button
              className="dialog-button close"
              onClick={onCancel}
            >
              Close
            </button>
          )}

          {job?.status === 'pending' && (
            <>
              <div>
                <span className="spinner" />
                Initializing...
              </div>
              <button
                className="dialog-button close"
                onClick={handleCancel}
              >
                Close
              </button>
            </>
          )}

          {/* Fallback close when job hasn't loaded yet */}
          {!job && !error && (
            <>
              <div>
                <span className="spinner" />
                Connecting...
              </div>
              <button
                className="dialog-button close"
                onClick={onCancel}
              >
                Close
              </button>
            </>
          )}
        </div>

        {/* Task Queue link */}
        <div style={{ marginTop: '12px' }}>
          <a
            href="/tasks"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#0078d4', fontSize: '12px', textDecoration: 'underline' }}
          >
            View Task Queue
          </a>
        </div>
      </div>
    </div>
  );
};

export default RenderProgressDialog;
