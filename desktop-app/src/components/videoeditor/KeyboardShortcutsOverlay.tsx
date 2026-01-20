/**
 * Keyboard Shortcuts Overlay Component
 * Shows keyboard shortcuts when user presses '?'
 */

import React, { useEffect, useState } from 'react';

interface ShortcutCategory {
  name: string;
  shortcuts: Shortcut[];
}

interface Shortcut {
  keys: string[];
  description: string;
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    name: 'Playback',
    shortcuts: [
      { keys: ['Space'], description: 'Play/Pause' },
      { keys: ['←'], description: 'Step backward (1 frame)' },
      { keys: ['→'], description: 'Step forward (1 frame)' },
      { keys: ['Home'], description: 'Go to start' },
      { keys: ['End'], description: 'Go to end' },
    ]
  },
  {
    name: 'Project',
    shortcuts: [
      { keys: ['Ctrl', 'S'], description: 'Save project' },
      { keys: ['Ctrl', 'O'], description: 'Open project' },
      { keys: ['Ctrl', 'E'], description: 'Export video' },
      { keys: ['Ctrl', 'N'], description: 'New project' },
    ]
  },
  {
    name: 'Editing',
    shortcuts: [
      { keys: ['Ctrl', 'Z'], description: 'Undo' },
      { keys: ['Ctrl', 'Shift', 'Z'], description: 'Redo' },
      { keys: ['Delete'], description: 'Delete selected clip(s)' },
      { keys: ['Ctrl', 'D'], description: 'Duplicate clip' },
      { keys: ['Ctrl', 'B'], description: 'Split clip at playhead' },
      { keys: ['Ctrl', 'C'], description: 'Copy clip' },
      { keys: ['Ctrl', 'V'], description: 'Paste clip' },
    ]
  },
  {
    name: 'Selection',
    shortcuts: [
      { keys: ['Ctrl', 'A'], description: 'Select all clips' },
      { keys: ['Esc'], description: 'Deselect all' },
      { keys: ['Shift', 'Click'], description: 'Add to selection' },
      { keys: ['Ctrl', 'Click'], description: 'Toggle selection' },
    ]
  },
  {
    name: 'View',
    shortcuts: [
      { keys: ['Ctrl', '+'], description: 'Zoom in timeline' },
      { keys: ['Ctrl', '-'], description: 'Zoom out timeline' },
      { keys: ['Ctrl', '0'], description: 'Reset zoom' },
      { keys: ['F'], description: 'Fit timeline to window' },
    ]
  },
  {
    name: 'Help',
    shortcuts: [
      { keys: ['?'], description: 'Toggle shortcuts help' },
      { keys: ['Esc'], description: 'Close dialogs/overlays' },
    ]
  }
];

export const KeyboardShortcutsOverlay: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle with '?' key (Shift + /)
      if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        setIsVisible(prev => !prev);
      }

      // Close with Escape
      if (e.key === 'Escape' && isVisible) {
        e.preventDefault();
        setIsVisible(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setIsVisible(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="shortcuts-overlay" onClick={handleOverlayClick}>
      <style>{`
        .shortcuts-overlay {
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

        .shortcuts-dialog {
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 8px;
          width: 900px;
          max-width: 90vw;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
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

        .shortcuts-header {
          padding: 20px 24px;
          border-bottom: 1px solid #444;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .shortcuts-title {
          font-size: 20px;
          font-weight: 600;
          color: #e0e0e0;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .shortcuts-icon {
          font-size: 24px;
        }

        .close-button {
          background: transparent;
          border: none;
          color: #888;
          font-size: 24px;
          cursor: pointer;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .close-button:hover {
          background: #444;
          color: #e0e0e0;
        }

        .shortcuts-content {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }

        .shortcuts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 24px;
        }

        .category-section {
          background: #1e1e1e;
          border: 1px solid #444;
          border-radius: 6px;
          padding: 16px;
        }

        .category-title {
          font-size: 14px;
          font-weight: 600;
          color: #0078d4;
          margin-bottom: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .shortcuts-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .shortcut-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
        }

        .shortcut-keys {
          display: flex;
          gap: 4px;
          flex-shrink: 0;
        }

        .key-badge {
          background: #444;
          color: #e0e0e0;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          font-family: monospace;
          border: 1px solid #555;
          box-shadow: 0 2px 0 #333;
          min-width: 32px;
          text-align: center;
        }

        .shortcut-description {
          font-size: 13px;
          color: #b0b0b0;
          flex: 1;
        }

        .shortcuts-footer {
          padding: 16px 24px;
          border-top: 1px solid #444;
          text-align: center;
          font-size: 12px;
          color: #888;
        }

        .footer-highlight {
          color: #0078d4;
          font-weight: 600;
        }

        @media (max-width: 768px) {
          .shortcuts-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="shortcuts-dialog">
        {/* Header */}
        <div className="shortcuts-header">
          <div className="shortcuts-title">
            <span className="shortcuts-icon">⌨️</span>
            <span>Keyboard Shortcuts</span>
          </div>
          <button className="close-button" onClick={() => setIsVisible(false)}>
            ×
          </button>
        </div>

        {/* Content */}
        <div className="shortcuts-content">
          <div className="shortcuts-grid">
            {SHORTCUT_CATEGORIES.map((category) => (
              <div key={category.name} className="category-section">
                <div className="category-title">{category.name}</div>
                <div className="shortcuts-list">
                  {category.shortcuts.map((shortcut, index) => (
                    <div key={index} className="shortcut-item">
                      <div className="shortcut-keys">
                        {shortcut.keys.map((key, keyIndex) => (
                          <React.Fragment key={keyIndex}>
                            <span className="key-badge">{key}</span>
                            {keyIndex < shortcut.keys.length - 1 && (
                              <span style={{ color: '#888', fontSize: '12px' }}>+</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                      <div className="shortcut-description">{shortcut.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="shortcuts-footer">
          Press <span className="footer-highlight">?</span> to toggle this help •
          Press <span className="footer-highlight">Esc</span> to close
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutsOverlay;
