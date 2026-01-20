/**
 * Confirmation Dialog Component
 * Shows confirmation for destructive actions
 */

import React from 'react';

export interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
  showUndoHint?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  type = 'warning',
  showUndoHint = false
}) => {
  const handleConfirm = () => {
    onConfirm();
  };

  const handleCancel = () => {
    onCancel();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  };

  const getTypeStyles = () => {
    switch (type) {
      case 'danger':
        return {
          borderColor: '#ff6b6b',
          buttonColor: '#ff6b6b',
          buttonHover: '#ff5252',
          icon: '⚠️'
        };
      case 'warning':
        return {
          borderColor: '#ffa500',
          buttonColor: '#ffa500',
          buttonHover: '#ff8c00',
          icon: '⚠️'
        };
      case 'info':
        return {
          borderColor: '#0078d4',
          buttonColor: '#0078d4',
          buttonHover: '#005a9e',
          icon: 'ℹ️'
        };
    }
  };

  const typeStyles = getTypeStyles();

  return (
    <div className="confirm-dialog-overlay" onClick={handleOverlayClick}>
      <style>{`
        .confirm-dialog-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .confirm-dialog {
          background: #2a2a2a;
          border: 2px solid ${typeStyles.borderColor};
          border-radius: 8px;
          width: 450px;
          max-width: 90vw;
          padding: 24px;
          animation: slideUp 0.2s ease;
        }

        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .dialog-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }

        .dialog-icon {
          font-size: 32px;
        }

        .dialog-title {
          font-size: 18px;
          font-weight: 600;
          color: #e0e0e0;
          flex: 1;
        }

        .dialog-message {
          font-size: 14px;
          color: #b0b0b0;
          line-height: 1.5;
          margin-bottom: 20px;
        }

        .dialog-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }

        .dialog-button {
          padding: 10px 20px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .dialog-button.cancel {
          background: #444;
          color: #e0e0e0;
        }

        .dialog-button.cancel:hover {
          background: #555;
        }

        .dialog-button.confirm {
          background: ${typeStyles.buttonColor};
          color: white;
        }

        .dialog-button.confirm:hover {
          background: ${typeStyles.buttonHover};
        }

        .undo-hint {
          background: #0078d420;
          border: 1px solid #0078d4;
          border-radius: 4px;
          padding: 8px 12px;
          margin-bottom: 16px;
          font-size: 12px;
          color: #0078d4;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .undo-hint-icon {
          font-size: 14px;
        }
      `}</style>

      <div className="confirm-dialog">
        <div className="dialog-header">
          <div className="dialog-icon">{typeStyles.icon}</div>
          <div className="dialog-title">{title}</div>
        </div>

        <div className="dialog-message">{message}</div>

        {showUndoHint && (
          <div className="undo-hint">
            <span className="undo-hint-icon">💡</span>
            <span>You can undo this action with Ctrl+Z</span>
          </div>
        )}

        <div className="dialog-actions">
          <button className="dialog-button cancel" onClick={handleCancel}>
            {cancelText}
          </button>
          <button className="dialog-button confirm" onClick={handleConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
