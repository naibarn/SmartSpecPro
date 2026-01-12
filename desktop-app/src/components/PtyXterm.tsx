/**
 * PtyXterm - High Performance Terminal Component
 * 
 * Features:
 * - Write batching with requestAnimationFrame (reduces jank)
 * - WebGL addon support for hardware acceleration
 * - ResizeObserver for smooth resizing
 * - Modern UI with glassmorphism header
 * - Light/Dark theme support
 * - Full ANSI color palette
 */

import { useEffect, useRef, useImperativeHandle, forwardRef, useMemo } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import "xterm/css/xterm.css";

// Optional WebGL addon for better performance
let WebglAddon: any = null;
try {
  WebglAddon = require("@xterm/addon-webgl").WebglAddon;
} catch {
  WebglAddon = null;
}

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
  // ANSI colors
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
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? true;

  // Modern light theme
  const light: TermTheme = {
    background: "#fafafa",
    foreground: "#1f2937",
    cursor: "#10b981",
    cursorAccent: "#fafafa",
    selectionBackground: "rgba(59, 130, 246, 0.3)",
    selectionForeground: "#1f2937",
    // ANSI colors (slightly muted for light bg)
    black: "#374151",
    red: "#dc2626",
    green: "#059669",
    yellow: "#d97706",
    blue: "#2563eb",
    magenta: "#7c3aed",
    cyan: "#0891b2",
    white: "#f3f4f6",
    brightBlack: "#6b7280",
    brightRed: "#ef4444",
    brightGreen: "#10b981",
    brightYellow: "#f59e0b",
    brightBlue: "#3b82f6",
    brightMagenta: "#8b5cf6",
    brightCyan: "#06b6d4",
    brightWhite: "#ffffff",
  };

  // Modern dark theme (default)
  const dark: TermTheme = {
    background: "#0f172a",
    foreground: "#e2e8f0",
    cursor: "#10b981",
    cursorAccent: "#0f172a",
    selectionBackground: "rgba(59, 130, 246, 0.4)",
    selectionForeground: "#ffffff",
    // ANSI colors (vibrant for dark bg)
    black: "#1e293b",
    red: "#ef4444",
    green: "#10b981",
    yellow: "#f59e0b",
    blue: "#3b82f6",
    magenta: "#8b5cf6",
    cyan: "#06b6d4",
    white: "#f1f5f9",
    brightBlack: "#475569",
    brightRed: "#f87171",
    brightGreen: "#34d399",
    brightYellow: "#fbbf24",
    brightBlue: "#60a5fa",
    brightMagenta: "#a78bfa",
    brightCyan: "#22d3ee",
    brightWhite: "#ffffff",
  };

  return prefersDark ? dark : light;
}

const PtyXterm = forwardRef<{ focus: () => void }, Props>(({ onData, onKey, onResize }, ref) => {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const lastSizeRef = useRef<{ rows: number; cols: number } | null>(null);
  const disposedRef = useRef(false);

  // Write batching for performance
  const writeQueueRef = useRef<string[]>([]);
  const rafRef = useRef<number | null>(null);

  const theme = useMemo(() => getTheme(), []);

  useImperativeHandle(ref, () => ({
    focus: () => {
      termRef.current?.focus();
    },
  }));

  useEffect(() => {
    if (!containerRef.current || termRef.current) return;

    disposedRef.current = false;

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
    term.loadAddon(fit);

    // Load WebGL addon for better performance (if available)
    if (WebglAddon) {
      try {
        term.loadAddon(new WebglAddon());
      } catch {
        // WebGL not supported, fall back to canvas
      }
    }

    termRef.current = term;
    fitRef.current = fit;

    term.open(containerRef.current);

    // Focus on click
    const handlePointerDown = () => term.focus();
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

      // Batch writes to reduce repaints
      let chunk = "";
      let bytes = 0;
      const MAX_CHUNK = 64 * 1024;

      while (writeQueueRef.current.length) {
        const part = writeQueueRef.current.shift()!;
        chunk += part;
        bytes += part.length;
        if (bytes >= MAX_CHUNK) break;
      }

      if (chunk) t.write(chunk);

      // Continue if more data pending
      if (writeQueueRef.current.length && rafRef.current == null) {
        rafRef.current = requestAnimationFrame(flush);
      }
    };

    const writeToTerminal = (data: string) => {
      if (disposedRef.current) return;

      // Prevent queue from growing too large
      if (writeQueueRef.current.length > 5000) {
        writeQueueRef.current.splice(0, 2500);
      }

      writeQueueRef.current.push(data);
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(flush);
      }
    };

    window.__ptyWrite = writeToTerminal;
    window.__ptyFocus = () => termRef.current?.focus();

    // ResizeObserver for smooth resizing
    const ro = new ResizeObserver(() => {
      if (disposedRef.current) return;
      const t = termRef.current;
      const f = fitRef.current;
      if (!t || !f) return;

      try {
        f.fit();
      } catch {
        // Ignore fit errors
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
    });

    if (outerRef.current) ro.observe(outerRef.current);

    // Initial fit
    requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {}
      term.focus();
    });

    return () => {
      disposedRef.current = true;

      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      writeQueueRef.current = [];

      ro.disconnect();
      dataDisposer.dispose();
      window.removeEventListener("keydown", keyHandler);
      outerRef.current?.removeEventListener("pointerdown", handlePointerDown);

      delete window.__ptyWrite;
      delete window.__ptyFocus;

      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [onData, onKey, onResize, theme]);

  const doCopy = async () => {
    const t = termRef.current;
    if (!t) return;
    const selection = t.getSelection?.() ?? "";
    if (!selection) return;
    try {
      await navigator.clipboard.writeText(selection);
    } catch {
      // Fallback for older browsers
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
    termRef.current?.clear();
  };

  const isDark = theme.background === "#0f172a";

  return (
    <div
      ref={outerRef}
      style={{
        height: "60vh",
        minHeight: 420,
        borderRadius: 16,
        overflow: "hidden",
        background: theme.background,
        border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.1)",
        boxShadow: isDark 
          ? "0 8px 32px rgba(0,0,0,0.4)" 
          : "0 8px 32px rgba(0,0,0,0.08)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Modern header bar */}
      <div
        style={{
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 14px",
          borderBottom: isDark 
            ? "1px solid rgba(255,255,255,0.08)" 
            : "1px solid rgba(0,0,0,0.08)",
          background: isDark 
            ? "rgba(15,23,42,0.8)" 
            : "rgba(255,255,255,0.7)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Traffic light buttons */}
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ 
              width: 12, 
              height: 12, 
              borderRadius: 999, 
              background: "#ff5f57",
              boxShadow: "0 1px 2px rgba(0,0,0,0.2)"
            }} />
            <span style={{ 
              width: 12, 
              height: 12, 
              borderRadius: 999, 
              background: "#febc2e",
              boxShadow: "0 1px 2px rgba(0,0,0,0.2)"
            }} />
            <span style={{ 
              width: 12, 
              height: 12, 
              borderRadius: 999, 
              background: "#28c840",
              boxShadow: "0 1px 2px rgba(0,0,0,0.2)"
            }} />
          </div>
          <div style={{ 
            fontSize: 13, 
            fontWeight: 600, 
            color: isDark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.7)",
            letterSpacing: "-0.01em"
          }}>
            Terminal
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={doCopy}
            style={{
              fontSize: 12,
              fontWeight: 500,
              padding: "6px 12px",
              borderRadius: 8,
              border: isDark 
                ? "1px solid rgba(255,255,255,0.15)" 
                : "1px solid rgba(0,0,0,0.12)",
              background: isDark 
                ? "rgba(255,255,255,0.08)" 
                : "rgba(255,255,255,0.8)",
              color: isDark ? "#e2e8f0" : "#374151",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isDark 
                ? "rgba(255,255,255,0.15)" 
                : "rgba(255,255,255,1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isDark 
                ? "rgba(255,255,255,0.08)" 
                : "rgba(255,255,255,0.8)";
            }}
            title="Copy selection (Ctrl+Shift+C)"
          >
            📋 Copy
          </button>
          <button
            onClick={doClear}
            style={{
              fontSize: 12,
              fontWeight: 500,
              padding: "6px 12px",
              borderRadius: 8,
              border: isDark 
                ? "1px solid rgba(255,255,255,0.15)" 
                : "1px solid rgba(0,0,0,0.12)",
              background: isDark 
                ? "rgba(255,255,255,0.08)" 
                : "rgba(255,255,255,0.8)",
              color: isDark ? "#e2e8f0" : "#374151",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isDark 
                ? "rgba(255,255,255,0.15)" 
                : "rgba(255,255,255,1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isDark 
                ? "rgba(255,255,255,0.08)" 
                : "rgba(255,255,255,0.8)";
            }}
            title="Clear screen"
          >
            🗑️ Clear
          </button>
        </div>
      </div>

      {/* Terminal body */}
      <div style={{ flex: 1, padding: 12 }}>
        <div
          ref={containerRef}
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 8,
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
