import { useEffect, useRef } from "react";
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
  }
}

export default function PtyXterm({ onData, onKey, onResize }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
      fontSize: 14,
      lineHeight: 1.2,
      scrollback: 10000,
      allowProposedApi: true,
      theme: {
        background: "#0b0f14",
        foreground: "#d1d5db",
        cursor: "#10b981",
        cursorAccent: "#0b0f14",
        selectionBackground: "#3b82f680",
        selectionForeground: "#ffffff",
        black: "#1f2937",
        red: "#ef4444",
        green: "#10b981",
        yellow: "#f59e0b",
        blue: "#3b82f6",
        magenta: "#8b5cf6",
        cyan: "#06b6d4",
        white: "#f3f4f6",
        brightBlack: "#4b5563",
        brightRed: "#f87171",
        brightGreen: "#34d399",
        brightYellow: "#fbbf24",
        brightBlue: "#60a5fa",
        brightMagenta: "#a78bfa",
        brightCyan: "#22d3ee",
        brightWhite: "#ffffff",
      },
    });
    
    const fit = new FitAddon();
    term.loadAddon(fit);
    termRef.current = term;
    fitRef.current = fit;

    term.open(ref.current);

    // Wait for terminal to be ready before fitting
    const initFit = () => {
      try {
        fit.fit();
        term.focus();
        
        // Notify about initial size
        if (onResize) {
          onResize(term.rows, term.cols);
        }
      } catch (e) {
        console.error("Error fitting terminal:", e);
      }
    };
    
    // Use requestAnimationFrame for better timing
    requestAnimationFrame(initFit);

    window.__ptyWrite = (data: string) => term.write(data);

    const dispos = term.onData(onData);

    const resize = () => {
      try {
        fit.fit();
        if (onResize) {
          onResize(term.rows, term.cols);
        }
      } catch (e) {
        console.error("Error resizing terminal:", e);
      }
    };
    
    // Debounce resize events
    let resizeTimeout: NodeJS.Timeout | null = null;
    const debouncedResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(resize, 100);
    };
    
    window.addEventListener("resize", debouncedResize);

    const keyHandler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", keyHandler);

    // Handle terminal resize events
    const termResizeDispos = term.onResize(({ rows, cols }) => {
      if (onResize) {
        onResize(rows, cols);
      }
    });

    return () => {
      window.removeEventListener("resize", debouncedResize);
      window.removeEventListener("keydown", keyHandler);
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      dispos.dispose();
      termResizeDispos.dispose();
      term.dispose();
      delete window.__ptyWrite;
    };
  }, [onData, onKey, onResize]);

  return (
    <div
      ref={ref}
      style={{
        height: "60vh",
        minHeight: 400,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "#0b0f14",
        border: "1px solid #374151",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)"
      }}
    />
  );
}
