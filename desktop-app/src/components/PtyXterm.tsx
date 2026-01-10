import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
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

const PtyXterm = forwardRef<{ focus: () => void }, Props>(({ onData, onKey, onResize }, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const lastSizeRef = useRef<{ rows: number; cols: number } | null>(null);
  const initDoneRef = useRef<boolean>(false);
  const fitDoneRef = useRef<boolean>(false);

  useImperativeHandle(ref, () => ({
    focus: () => {
      termRef.current?.focus();
    }
  }));

  useEffect(() => {
    if (!containerRef.current || initDoneRef.current) return;
    initDoneRef.current = true;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
      fontSize: 14,
      lineHeight: 1.2,
      scrollback: 10000,
      allowProposedApi: true,
      disableStdin: false,
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

    // Open terminal immediately
    term.open(containerRef.current);
    
    // Terminal is ready to write immediately after open()
    // fit() is only needed for proper sizing, not for writing

    // Safe fit function - only for sizing
    const safeFit = () => {
      if (fitDoneRef.current) return;
      
      const el = containerRef.current;
      if (!el || el.clientWidth === 0 || el.clientHeight === 0) {
        return;
      }
      
      try {
        fit.fit();
        fitDoneRef.current = true;
        
        const newRows = term.rows;
        const newCols = term.cols;
        
        if (newRows > 0 && newCols > 0) {
          const lastSize = lastSizeRef.current;
          if (!lastSize || lastSize.rows !== newRows || lastSize.cols !== newCols) {
            lastSizeRef.current = { rows: newRows, cols: newCols };
            if (onResize) {
              onResize(newRows, newCols);
            }
          }
        }
      } catch (e) {
        // Ignore fit errors - terminal still works without proper sizing
      }
    };

    // Write function - write directly to terminal
    const writeToTerminal = (data: string) => {
      try {
        term.write(data);
      } catch (e) {
        console.error("Error writing to terminal:", e);
      }
    };

    // Global write function
    window.__ptyWrite = writeToTerminal;

    // Global focus function
    window.__ptyFocus = () => {
      term.focus();
    };

    // Handle terminal input
    const dataDispos = term.onData((data) => {
      onData(data);
    });

    // Delayed fit - try multiple times
    let fitAttempts = 0;
    const tryFit = () => {
      if (fitDoneRef.current || fitAttempts >= 10) return;
      fitAttempts++;
      safeFit();
      if (!fitDoneRef.current) {
        setTimeout(tryFit, 100);
      }
    };
    
    // Start fit attempts after a delay
    setTimeout(() => {
      tryFit();
      term.focus();
    }, 200);

    // Debounced resize handler
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        fitDoneRef.current = false; // Allow re-fit
        safeFit();
      }, 150);
    };
    
    window.addEventListener("resize", handleResize);

    // Only handle specific keyboard shortcuts
    const keyHandler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "t") {
        onKey(e);
      } else if (e.ctrlKey && e.key.toLowerCase() === "w") {
        onKey(e);
      }
    };
    window.addEventListener("keydown", keyHandler);

    return () => {
      initDoneRef.current = false;
      fitDoneRef.current = false;
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", keyHandler);
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      dataDispos.dispose();
      term.dispose();
      delete window.__ptyWrite;
      delete window.__ptyFocus;
    };
  }, [onData, onKey, onResize]);

  const handleClick = () => {
    termRef.current?.focus();
  };

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      style={{
        height: "60vh",
        minHeight: 400,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "#0b0f14",
        border: "2px solid #374151",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
        cursor: "text"
      }}
    />
  );
});

PtyXterm.displayName = "PtyXterm";

export default PtyXterm;
