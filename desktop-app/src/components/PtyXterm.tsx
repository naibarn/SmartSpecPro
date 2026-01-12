/**
 * PtyXterm - High Performance Terminal Component
 * 
 * Features:
 * - Write batching with requestAnimationFrame (reduces jank)
 * - ResizeObserver for smooth resizing
 * - Modern UI with glassmorphism header
 * - Light theme matching app UI
 * - Full ANSI color palette
 * - Fixed dimensions error (xterm.js #4983)
 */

import { useEffect, useRef, useImperativeHandle, forwardRef, useMemo, useCallback } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import "xterm/css/xterm.css";

type Props = {
  onData: (data: string) => void;
  onKey: (ev: KeyboardEvent) => void;
  onResize?: (rows: number, cols: number) => void;
};

declare global {
  interface Window {
    __ptyWrite?: (data: string) => void;
    __ptyFocus?: () => void;
  }
}

type TermTheme = {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  selectionForeground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
};

function getTheme(): TermTheme {
  // Modern light theme - matches app UI
  return {
    background: "#ffffff",
    foreground: "#1e293b",  // slate-800
    cursor: "#3b82f6",      // blue-500
    cursorAccent: "#ffffff",
    selectionBackground: "rgba(59, 130, 246, 0.25)",
    selectionForeground: "#1e293b",
    // ANSI colors - optimized for light background
    black: "#334155",       // slate-700
    red: "#dc2626",         // red-600
    green: "#16a34a",       // green-600
    yellow: "#ca8a04",      // yellow-600
    blue: "#2563eb",        // blue-600
    magenta: "#9333ea",     // purple-600
    cyan: "#0891b2",        // cyan-600
    white: "#f8fafc",       // slate-50
    brightBlack: "#64748b", // slate-500
    brightRed: "#ef4444",   // red-500
    brightGreen: "#22c55e", // green-500
    brightYellow: "#eab308",// yellow-500
    brightBlue: "#3b82f6",  // blue-500
    brightMagenta: "#a855f7",// purple-500
    brightCyan: "#06b6d4",  // cyan-500
    brightWhite: "#ffffff",
  };
}

const PtyXterm = forwardRef<{ focus: () => void }, Props>(({ onData, onKey, onResize }, ref) => {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const lastSizeRef = useRef<{ rows: number; cols: number } | null>(null);
  const disposedRef = useRef(false);
  const isReadyRef = useRef(false);

  // Write batching for performance
  const writeQueueRef = useRef<string[]>([]);
  const rafRef = useRef<number | null>(null);
  const fitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const theme = useMemo(() => getTheme(), []);

  // Safe fit function that checks terminal state
  const safeFit = useCallback(() => {
    if (disposedRef.current || !isReadyRef.current) return;
    const t = termRef.current;
    const f = fitRef.current;
    if (!t || !f) return;

    try {
      // Double-check terminal has valid internal state
      if (t.element && t.cols > 0 && t.rows > 0) {
        f.fit();
      }
    } catch (e) {
      // Ignore fit errors - terminal may be in transition
      console.debug('fit() skipped:', e);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    focus: () => {
      termRef.current?.focus();
    },
  }));

  useEffect(() => {
    if (!containerRef.current || termRef.current) return;

    disposedRef.current = false;
    isReadyRef.current = false;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
      fontSize: 14,
      lineHeight: 1.25,
      scrollback: 10_000,
      allowProposedApi: true,
      allowTransparency: true,
      theme: {
        background: "transparent",
        foreground: theme.foreground,
        cursor: theme.cursor,
        cursorAccent: theme.cursorAccent,
        selectionBackground: theme.selectionBackground,
        selectionForeground: theme.selectionForeground,
        black: theme.black,
        red: theme.red,
        green: theme.green,
        yellow: theme.yellow,
        blue: theme.blue,
        magenta: theme.magenta,
        cyan: theme.cyan,
        white: theme.white,
        brightBlack: theme.brightBlack,
        brightRed: theme.brightRed,
        brightGreen: theme.brightGreen,
        brightYellow: theme.brightYellow,
        brightBlue: theme.brightBlue,
        brightMagenta: theme.brightMagenta,
        brightCyan: theme.brightCyan,
        brightWhite: theme.brightWhite,
      },
    });

    const fit = new FitAddon();
    
    termRef.current = term;
    fitRef.current = fit;

    // Load addon BEFORE open (important for proper initialization)
    term.loadAddon(fit);
    term.open(containerRef.current);

    // Mark as ready AFTER open completes and DOM settles
    // This prevents dimensions error from race condition
    fitTimeoutRef.current = setTimeout(() => {
      if (disposedRef.current) return;
      
      // Verify container has valid dimensions before marking ready
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        // Retry after another frame if container not ready
        fitTimeoutRef.current = setTimeout(() => {
          if (disposedRef.current) return;
          isReadyRef.current = true;
          try {
            fit.fit();
            term.focus();
          } catch (e) {
            console.debug('Initial fit skipped:', e);
          }
        }, 100);
        return;
      }
      
      isReadyRef.current = true;
      
      // Now safe to fit
      try {
        fit.fit();
        term.focus();
      } catch (e) {
        console.debug('Initial fit skipped:', e);
      }
    }, 50);

    // Focus on click
    const handlePointerDown = () => {
      if (!disposedRef.current) term.focus();
    };
    outerRef.current?.addEventListener("pointerdown", handlePointerDown);

    // Handle terminal input
    const dataDisposer = term.onData((data) => {
      if (!disposedRef.current) onData(data);
    });

    // Keyboard shortcuts
    const keyHandler = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "t") || 
          (e.ctrlKey && e.key.toLowerCase() === "w")) {
        onKey(e);
      }
    };
    window.addEventListener("keydown", keyHandler);

    // Batched write function using RAF for smooth output
    const flush = () => {
      rafRef.current = null;
      if (disposedRef.current) return;
      const t = termRef.current;
      if (!t) return;

      let chunk = "";
      let bytes = 0;
      const MAX_CHUNK = 64 * 1024;

      while (writeQueueRef.current.length) {
        const part = writeQueueRef.current.shift()!;
        chunk += part;
        bytes += part.length;
        if (bytes >= MAX_CHUNK) break;
      }

      if (chunk) {
        try {
          t.write(chunk);
        } catch (e) {
          console.debug('write() error:', e);
        }
      }

      if (writeQueueRef.current.length && rafRef.current == null) {
        rafRef.current = requestAnimationFrame(flush);
      }
    };

    const writeToTerminal = (data: string) => {
      if (disposedRef.current) return;

      if (writeQueueRef.current.length > 5000) {
        writeQueueRef.current.splice(0, 2500);
      }

      writeQueueRef.current.push(data);
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(flush);
      }
    };

    window.__ptyWrite = writeToTerminal;
    window.__ptyFocus = () => {
      if (!disposedRef.current) termRef.current?.focus();
    };

    // ResizeObserver with debouncing
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (disposedRef.current || !isReadyRef.current) return;
      
      // Debounce resize to prevent rapid fit() calls
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (disposedRef.current || !isReadyRef.current) return;
        
        const t = termRef.current;
        const f = fitRef.current;
        if (!t || !f) return;
        
        // Check terminal has valid internal state before fit
        // This prevents "Cannot read properties of undefined (reading 'dimensions')" error
        if (!t.element || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        try {
          f.fit();
        } catch {
          // Ignore fit errors - terminal may be in transition
        }

        const rows = t.rows;
        const cols = t.cols;
        if (rows > 0 && cols > 0) {
          const last = lastSizeRef.current;
          if (!last || last.rows !== rows || last.cols !== cols) {
            lastSizeRef.current = { rows, cols };
            onResize?.(rows, cols);
          }
        }
      }, 32); // Increased debounce to 32ms for stability
    });

    if (outerRef.current) ro.observe(outerRef.current);

    // Cleanup function
    return () => {
      // CRITICAL: Set disposed FIRST to prevent any async operations
      disposedRef.current = true;
      isReadyRef.current = false;

      // Clear all pending timers BEFORE dispose
      if (fitTimeoutRef.current) {
        clearTimeout(fitTimeoutRef.current);
        fitTimeoutRef.current = null;
      }
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
        resizeTimeout = null;
      }
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      
      writeQueueRef.current = [];

      ro.disconnect();
      dataDisposer.dispose();
      window.removeEventListener("keydown", keyHandler);
      outerRef.current?.removeEventListener("pointerdown", handlePointerDown);

      delete window.__ptyWrite;
      delete window.__ptyFocus;

      // Dispose terminal last, after all timers are cleared
      // Use setTimeout to ensure any pending internal timers complete
      setTimeout(() => {
        try {
          term.dispose();
        } catch (e) {
          console.debug('dispose() error:', e);
        }
      }, 0);
      
      termRef.current = null;
      fitRef.current = null;
    };
  }, [onData, onKey, onResize, theme, safeFit]);

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
      termRef.current?.clear();
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
            letterSpacing: "-0.01em"
          }}>
            Terminal
          </div>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={doCopy}
            style={{
              fontSize: 12,
              fontWeight: 500,
              padding: "5px 10px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              color: "#374151",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#f3f4f6";
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
            style={{
              fontSize: 12,
              fontWeight: 500,
              padding: "5px 10px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              color: "#374151",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#f3f4f6";
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
