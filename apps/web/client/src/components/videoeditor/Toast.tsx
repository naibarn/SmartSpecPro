/**
 * Toast Notification Component
 * Shows temporary notifications for async operations
 */

import React, { useState, useEffect, useCallback } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastProps {
  message: ToastMessage;
  onClose: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ message, onClose }) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onClose(message.id), 300);
    }, message.duration || 3000);

    return () => clearTimeout(timer);
  }, [message.id, message.duration, onClose]);

  const getTypeStyles = () => {
    switch (message.type) {
      case 'success':
        return {
          bg: '#4caf50',
          border: '#45a049',
          icon: '✓'
        };
      case 'error':
        return {
          bg: '#ff6b6b',
          border: '#ff5252',
          icon: '✕'
        };
      case 'warning':
        return {
          bg: '#ffa500',
          border: '#ff8c00',
          icon: '⚠'
        };
      case 'info':
        return {
          bg: '#0078d4',
          border: '#005a9e',
          icon: 'ℹ'
        };
    }
  };

  const styles = getTypeStyles();

  return (
    <div
      className={`toast ${isExiting ? 'exiting' : ''}`}
      style={{
        background: styles.bg,
        borderLeft: `4px solid ${styles.border}`
      }}
    >
      <style>{`
        .toast {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 6px;
          color: white;
          font-size: 14px;
          font-weight: 500;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          animation: slideIn 0.3s ease-out;
          min-width: 300px;
          max-width: 500px;
        }

        .toast.exiting {
          animation: slideOut 0.3s ease-out forwards;
        }

        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes slideOut {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }

        .toast-icon {
          font-size: 20px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 50%;
        }

        .toast-message {
          flex: 1;
          line-height: 1.4;
        }

        .toast-close {
          background: none;
          border: none;
          color: white;
          font-size: 18px;
          cursor: pointer;
          padding: 0;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.7;
          transition: opacity 0.2s;
        }

        .toast-close:hover {
          opacity: 1;
        }
      `}</style>

      <div className="toast-icon">{styles.icon}</div>
      <div className="toast-message">{message.message}</div>
      <button
        className="toast-close"
        onClick={() => {
          setIsExiting(true);
          setTimeout(() => onClose(message.id), 300);
        }}
        aria-label="Close"
      >
        ×
      </button>
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // Expose global toast function
  useEffect(() => {
    (window as any).showToast = (
      message: string,
      type: ToastType = 'info',
      duration?: number
    ) => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, message, type, duration }]);
    };

    return () => {
      delete (window as any).showToast;
    };
  }, []);

  return (
    <div className="toast-container">
      <style>{`
        .toast-container {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 10000;
          display: flex;
          flex-direction: column;
          gap: 12px;
          pointer-events: none;
        }

        .toast-container > * {
          pointer-events: auto;
        }
      `}</style>

      {toasts.map((toast) => (
        <Toast key={toast.id} message={toast} onClose={removeToast} />
      ))}
    </div>
  );
};

// Helper function to show toasts
export const showToast = (
  message: string,
  type: ToastType = 'info',
  duration?: number
) => {
  if ((window as any).showToast) {
    (window as any).showToast(message, type, duration);
  } else {
    console.warn('Toast system not initialized');
  }
};

export default ToastContainer;
