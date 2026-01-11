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
  const disposedRef = useRef<boolean>(false);

  useImperativeHandle(ref, () => ({
    focus: () => {
      termRef.current?.focus();
    }
  }));

  useEffect(() => {
    if (!containerRef.current || initDoneRef.current) return;
    initDoneRef.current = true;
    disposedRef.current = false;

    console.log("PtyXterm: Initializing terminal...");

    // Create terminal with explicit initial dimensions
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
      cols: 80,
      rows: 24,
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

    // Open terminal
    term.open(containerRef.current);
    console.log("PtyXterm: Terminal opened");

    // Write function
    const writeToTerminal = (data: string) => {
      if (disposedRef.current) return;
      console.log("PtyXterm: writeToTerminal called with", data.length, "chars");
      try {
        term.write(data);
      } catch (e) {
        console.error("PtyXterm: Error writing to terminal:", e);
      }
    };

    window.__ptyWrite = writeToTerminal;
    console.log("PtyXterm: __ptyWrite registered");

    window.__ptyFocus = () => {
      if (!disposedRef.current) term.focus();
    };

    // Handle terminal input
    const dataDispos = term.onData((data) => {
      if (disposedRef.current) return;
      console.log("PtyXterm: User input:", JSON.stringify(data));
      onData(data);
    });

    // Safe fit function - completely wrapped in try-catch
    const safeFit = () => {
      if (disposedRef.current) return;
      
      try {
        const el = containerRef.current;
        if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
        if (!term.element) return;
        
        // Direct fit call with error suppression
        fit.fit();
        console.log("PtyXterm: Fit successful, rows:", term.rows, "cols:", term.cols);
        
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
      } catch {
        // Silently ignore fit errors - they don't affect functionality
      }
    };

    // Delayed fit with retries
    let fitAttempts = 0;
    const maxFitAttempts = 10;
    
    const tryFit = () => {
      if (disposedRef.current || fitAttempts >= maxFitAttempts) return;
      fitAttempts++;
      safeFit();
      if (fitAttempts < maxFitAttempts) {
        setTimeout(tryFit, 200);
      }
    };
    
    // Start fit attempts after delay
    const fitTimer = setTimeout(tryFit, 500);
    
    // Focus terminal
    const focusTimer = setTimeout(() => {
      if (!disposedRef.current) {
        term.focus();
        console.log("PtyXterm: Terminal focused");
      }
    }, 600);

    // Resize handler
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        fitAttempts = 0;
        tryFit();
      }, 250);
    };
    
    window.addEventListener("resize", handleResize);

    // Keyboard shortcuts
    const keyHandler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "t") {
        onKey(e);
      } else if (e.ctrlKey && e.key.toLowerCase() === "w") {
        onKey(e);
      }
    };
    window.addEventListener("keydown", keyHandler);

    return () => {
      console.log("PtyXterm: Cleanup");
      disposedRef.current = true;
      initDoneRef.current = false;
      clearTimeout(fitTimer);
      clearTimeout(focusTimer);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", keyHandler);
      if (resizeTimeout) clearTimeout(resizeTimeout);
      dataDispos.dispose();
      term.dispose();
      delete window.__ptyWrite;
      delete window.__ptyFocus;
    };
  }, [onData, onKey, onResize]);

  return (
    <div
      ref={containerRef}
      onClick={() => termRef.current?.focus()}
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
