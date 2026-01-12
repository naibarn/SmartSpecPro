/**
 * PtyXterm - Terminal Component using ghostty-web
 * 
 * Based on opencode's terminal implementation
 * Uses ghostty-web for better VT100 compatibility and performance
 * 
 * Features:
 * - WASM-based terminal emulator (Ghostty)
 * - xterm.js API compatible
 * - Better Unicode/grapheme handling
 * - Modern UI with light theme
 */

import { useEffect, useRef, useImperativeHandle, forwardRef, useMemo, useState } from "react";
import type { Terminal as GhosttyTerminal, FitAddon as GhosttyFitAddon } from "ghostty-web";

type Props = {
  onData: (data: string) => void;
  onKey: (ev: KeyboardEvent) => void;
  onResize?: (rows: number, cols: number) => void;
};

declare global {
  interface Window {
    __ptyWrite?: (data: string) => void;
    __ptyFocus?: () => void;
    __ghosttyReady?: boolean;
  }
}

type TermTheme = {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
};

function getTheme(): TermTheme {
  // Modern light theme - matches app UI
  return {
    background: "#ffffff",
    foreground: "#1e293b",  // slate-800
    cursor: "#3b82f6",      // blue-500
    selectionBackground: "rgba(59, 130, 246, 0.25)",
  };
}

// Global ghostty module reference
let ghosttyModule: typeof import("ghostty-web") | null = null;
let initPromise: Promise<void> | null = null;

// Initialize ghostty-web once
async function initGhostty(): Promise<typeof import("ghostty-web")> {
  if (ghosttyModule) return ghosttyModule;
  
  if (!initPromise) {
    initPromise = (async () => {
      const mod = await import("ghostty-web");
      await mod.init();
      ghosttyModule = mod;
      window.__ghosttyReady = true;
    })();
  }
  
  await initPromise;
  return ghosttyModule!;
}

const PtyXterm = forwardRef<{ focus: () => void }, Props>(({ onData, onKey, onResize }, ref) => {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<GhosttyTerminal | null>(null);
  const fitRef = useRef<GhosttyFitAddon | null>(null);
  const lastSizeRef = useRef<{ rows: number; cols: number } | null>(null);
  const disposedRef = useRef(false);
  const [isReady, setIsReady] = useState(false);

  const theme = useMemo(() => getTheme(), []);

  useImperativeHandle(ref, () => ({
    focus: () => {
      termRef.current?.focus();
    },
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    disposedRef.current = false;
    let term: GhosttyTerminal | null = null;
    let fitAddon: GhosttyFitAddon | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let handlePointerDown: (() => void) | null = null;
    let keyHandler: ((e: KeyboardEvent) => void) | null = null;

    const setup = async () => {
      if (disposedRef.current || !containerRef.current) return;

      try {
        const mod = await initGhostty();
        
        if (disposedRef.current || !containerRef.current) return;

        // Create terminal with ghostty-web
        term = new mod.Terminal({
          cursorBlink: true,
          cursorStyle: "bar",
          fontSize: 14,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
          allowTransparency: true,
          scrollback: 10_000,
          theme: {
            background: "transparent",
            foreground: theme.foreground,
            cursor: theme.cursor,
            selectionBackground: theme.selectionBackground,
          },
        });

        fitAddon = new mod.FitAddon();
        term.loadAddon(fitAddon);
        
        termRef.current = term;
        fitRef.current = fitAddon;

        // Open terminal
        term.open(containerRef.current);

        // Focus handling
        const focusTerminal = () => {
          if (!disposedRef.current && term) {
            term.focus();
          }
        };

        handlePointerDown = () => {
          const activeElement = document.activeElement;
          if (activeElement instanceof HTMLElement && activeElement !== containerRef.current) {
            activeElement.blur();
          }
          focusTerminal();
        };

        outerRef.current?.addEventListener("pointerdown", handlePointerDown);

        // Handle terminal input
        term.onData((data: string) => {
          if (!disposedRef.current) onData(data);
        });

        // Handle resize
        term.onResize((size: { cols: number; rows: number }) => {
          if (!disposedRef.current) {
            const last = lastSizeRef.current;
            if (!last || last.rows !== size.rows || last.cols !== size.cols) {
              lastSizeRef.current = { rows: size.rows, cols: size.cols };
              onResize?.(size.rows, size.cols);
            }
          }
        });

        // Keyboard shortcuts
        keyHandler = (e: KeyboardEvent) => {
          if ((e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "t") || 
              (e.ctrlKey && e.key.toLowerCase() === "w")) {
            onKey(e);
          }
        };
        window.addEventListener("keydown", keyHandler);

        // Copy handling
        term.attachCustomKeyEventHandler?.((event: KeyboardEvent) => {
          const key = event.key.toLowerCase();

          // Ctrl+Shift+C for copy
          if (event.ctrlKey && event.shiftKey && !event.metaKey && key === "c") {
            const selection = term?.getSelection?.();
            if (selection) {
              navigator.clipboard.writeText(selection).catch(() => {});
            }
            return true;
          }

          // Cmd+C (Mac) for copy
          if (event.metaKey && !event.ctrlKey && !event.altKey && key === "c") {
            if (!term?.hasSelection?.()) return true;
            const selection = term?.getSelection?.();
            if (selection) {
              navigator.clipboard.writeText(selection).catch(() => {});
            }
            return true;
          }

          return false;
        });

        // Global write function
        window.__ptyWrite = (data: string) => {
          if (!disposedRef.current && term) {
            term.write(data);
          }
        };

        window.__ptyFocus = () => {
          if (!disposedRef.current && term) {
            term.focus();
          }
        };

        // ResizeObserver for auto-fit
        resizeObserver = new ResizeObserver(() => {
          if (disposedRef.current || !fitAddon) return;
          try {
            fitAddon.fit();
          } catch {
            // Ignore fit errors
          }
        });

        if (outerRef.current) {
          resizeObserver.observe(outerRef.current);
        }

        // Initial fit
        setTimeout(() => {
          if (!disposedRef.current && fitAddon) {
            try {
              fitAddon.fit();
              term?.focus();
            } catch {
              // Ignore
            }
          }
        }, 50);

        setIsReady(true);

      } catch (error) {
        console.error("Failed to initialize ghostty-web terminal:", error);
      }
    };

    setup();

    // Cleanup
    return () => {
      disposedRef.current = true;
      setIsReady(false);

      if (resizeObserver) {
        resizeObserver.disconnect();
      }

      if (keyHandler) {
        window.removeEventListener("keydown", keyHandler);
      }

      if (handlePointerDown && outerRef.current) {
        outerRef.current.removeEventListener("pointerdown", handlePointerDown);
      }

      delete window.__ptyWrite;
      delete window.__ptyFocus;

      // Dispose terminal
      if (term) {
        try {
          term.dispose();
        } catch {
          // Ignore dispose errors
        }
      }

      termRef.current = null;
      fitRef.current = null;
    };
  }, [onData, onKey, onResize, theme]);

  const doCopy = async () => {
    const t = termRef.current;
    if (!t || disposedRef.current) return;
    const selection = t.getSelection?.() ?? "";
    if (!selection) return;
    try {
      await navigator.clipboard.writeText(selection);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = selection;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  };

  const doClear = () => {
    if (!disposedRef.current) {
      termRef.current?.clear?.();
    }
  };

  return (
    <div
      ref={outerRef}
      style={{
        height: "60vh",
        minHeight: 420,
        borderRadius: 12,
        overflow: "hidden",
        background: theme.background,
        border: "1px solid #e5e7eb",
        boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Modern header bar */}
      <div
        style={{
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          borderBottom: "1px solid #e5e7eb",
          background: "#f9fafb",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Traffic light buttons */}
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ 
              width: 10, 
              height: 10, 
              borderRadius: 999, 
              background: "#ff5f57",
            }} />
            <span style={{ 
              width: 10, 
              height: 10, 
              borderRadius: 999, 
              background: "#febc2e",
            }} />
            <span style={{ 
              width: 10, 
              height: 10, 
              borderRadius: 999, 
              background: "#28c840",
            }} />
          </div>
          <div style={{ 
            fontSize: 13, 
            fontWeight: 600, 
            color: "#374151",
            letterSpacing: "-0.01em",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}>
            Terminal
            {!isReady && (
              <span style={{ 
                fontSize: 11, 
                color: "#9ca3af",
                fontWeight: 400,
              }}>
                (loading...)
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={doCopy}
            disabled={!isReady}
            style={{
              fontSize: 12,
              fontWeight: 500,
              padding: "5px 10px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              color: isReady ? "#374151" : "#9ca3af",
              cursor: isReady ? "pointer" : "not-allowed",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (isReady) e.currentTarget.style.background = "#f3f4f6";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#ffffff";
            }}
            title="Copy selection (Ctrl+Shift+C)"
          >
            Copy
          </button>
          <button
            onClick={doClear}
            disabled={!isReady}
            style={{
              fontSize: 12,
              fontWeight: 500,
              padding: "5px 10px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              color: isReady ? "#374151" : "#9ca3af",
              cursor: isReady ? "pointer" : "not-allowed",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (isReady) e.currentTarget.style.background = "#f3f4f6";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#ffffff";
            }}
            title="Clear screen"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Terminal body */}
      <div style={{ flex: 1, padding: 8 }}>
        <div
          ref={containerRef}
          style={{
            width: "100%",
            height: "100%",
            overflow: "hidden",
            background: "transparent",
          }}
        />
      </div>
    </div>
  );
});

PtyXterm.displayName = "PtyXterm";

export default PtyXterm;
