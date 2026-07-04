/**
 * Error Boundary Component
 * Catches React errors and provides recovery options
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { toast } from 'sonner';
import { projectManager } from '../../services/projectManager';

interface ErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  autoSaveAttempted: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      autoSaveAttempted: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error Boundary caught error:', error, errorInfo);

    this.setState({
      error,
      errorInfo
    });

    // Try to auto-save the project
    this.attemptAutoSave();
  }

  attemptAutoSave = async () => {
    if (this.state.autoSaveAttempted) return;

    this.setState({ autoSaveAttempted: true });

    try {
      // Try to get the current project from sessionStorage
      const projectJson = sessionStorage.getItem('currentProject');
      if (projectJson) {
        const project = JSON.parse(projectJson);
        await projectManager.autoSave(project);
        console.log('✅ Project auto-saved before crash');
      }
    } catch (err) {
      console.error('Failed to auto-save:', err);
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      autoSaveAttempted: false
    });

    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleLoadAutoSave = async () => {
    try {
      const autoSaved = await projectManager.loadAutoSave();
      if (autoSaved) {
        console.log('✅ Auto-saved project recovered');
        this.handleReset();
      } else {
        toast('No auto-saved project found');
      }
    } catch (err) {
      console.error('Failed to load auto-save:', err);
      toast.error('Failed to load auto-saved project');
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <style>{`
            .error-boundary {
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              background: #1a1a1a;
              padding: 20px;
            }

            .error-container {
              max-width: 600px;
              background: #2a2a2a;
              border: 1px solid #444;
              border-radius: 8px;
              padding: 32px;
              text-align: center;
            }

            .error-icon {
              font-size: 64px;
              margin-bottom: 16px;
            }

            .error-title {
              font-size: 24px;
              font-weight: 600;
              color: #e0e0e0;
              margin-bottom: 8px;
            }

            .error-subtitle {
              font-size: 14px;
              color: #888;
              margin-bottom: 24px;
              line-height: 1.5;
            }

            .error-message {
              background: #ff6b6b20;
              border: 1px solid #ff6b6b;
              border-radius: 6px;
              padding: 16px;
              margin-bottom: 24px;
              text-align: left;
            }

            .error-message-title {
              font-size: 12px;
              font-weight: 600;
              color: #ff6b6b;
              margin-bottom: 8px;
              text-transform: uppercase;
            }

            .error-message-text {
              font-size: 13px;
              color: #e0e0e0;
              font-family: monospace;
              word-break: break-word;
            }

            .error-actions {
              display: flex;
              flex-direction: column;
              gap: 12px;
            }

            .error-button {
              padding: 12px 24px;
              border: none;
              border-radius: 6px;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s;
            }

            .error-button.primary {
              background: #0078d4;
              color: white;
            }

            .error-button.primary:hover {
              background: #005a9e;
            }

            .error-button.secondary {
              background: #444;
              color: #e0e0e0;
            }

            .error-button.secondary:hover {
              background: #555;
            }

            .error-button.danger {
              background: transparent;
              color: #ff6b6b;
              border: 1px solid #ff6b6b;
            }

            .error-button.danger:hover {
              background: #ff6b6b20;
            }

            .auto-save-notice {
              background: #4caf5020;
              border: 1px solid #4caf50;
              border-radius: 6px;
              padding: 12px;
              margin-bottom: 16px;
              font-size: 12px;
              color: #4caf50;
              display: flex;
              align-items: center;
              gap: 8px;
            }

            .details-section {
              margin-top: 24px;
              padding-top: 24px;
              border-top: 1px solid #444;
            }

            .details-toggle {
              background: transparent;
              border: none;
              color: #888;
              font-size: 12px;
              cursor: pointer;
              text-decoration: underline;
            }

            .details-toggle:hover {
              color: #e0e0e0;
            }

            .details-content {
              margin-top: 12px;
              background: #1a1a1a;
              border: 1px solid #444;
              border-radius: 4px;
              padding: 12px;
              text-align: left;
              max-height: 200px;
              overflow-y: auto;
            }

            .details-content pre {
              font-size: 11px;
              color: #888;
              font-family: monospace;
              white-space: pre-wrap;
              word-break: break-word;
              margin: 0;
            }
          `}</style>

          <div className="error-container">
            <div className="error-icon">😔</div>
            <h1 className="error-title">Something went wrong</h1>
            <p className="error-subtitle">
              The video editor encountered an unexpected error. Don't worry, your work may have
              been automatically saved.
            </p>

            {this.state.autoSaveAttempted && (
              <div className="auto-save-notice">
                <span>✅</span>
                <span>Project was automatically saved before the crash</span>
              </div>
            )}

            {this.state.error && (
              <div className="error-message">
                <div className="error-message-title">Error Details</div>
                <div className="error-message-text">{this.state.error.message}</div>
              </div>
            )}

            <div className="error-actions">
              {this.state.autoSaveAttempted && (
                <button
                  className="error-button primary"
                  onClick={this.handleLoadAutoSave}
                >
                  🔄 Recover Auto-saved Project
                </button>
              )}

              <button
                className="error-button secondary"
                onClick={this.handleReset}
              >
                Try Again
              </button>

              <button
                className="error-button secondary"
                onClick={this.handleReload}
              >
                Reload Page
              </button>
            </div>

            <div className="details-section">
              <details>
                <summary className="details-toggle">
                  Show technical details
                </summary>
                <div className="details-content">
                  <pre>{this.state.errorInfo?.componentStack}</pre>
                </div>
              </details>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
