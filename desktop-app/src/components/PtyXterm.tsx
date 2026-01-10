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
  const isReadyRef = useRef<boolean>(false);
  const pendingWritesRef = useRef<string[]>([]);

  useImperativeHandle(ref, () => ({
    focus: () => {
      termRef.current?.focus();
    }
  }));

  useEffect(() => {
    if (!containerRef.current) return;

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

    term.open(containerRef.current);

    // Function to safely write to terminal
    const safeWrite = (data: string) => {
      if (!termRef.current) {
        console.warn("Terminal not available, buffering data");
        pendingWritesRef.current.push(data);
        return;
      }
      
      if (!isReadyRef.current) {
        console.log("Terminal not ready, buffering data:", data.length, "chars");
        pendingWritesRef.current.push(data);
        return;
      }
      
      try {
        termRef.current.write(data);
      } catch (e) {
        console.error("Error writing to terminal:", e);
        // Try again after a short delay
        setTimeout(() => {
          try {
            termRef.current?.write(data);
          } catch (e2) {
            console.error("Retry write failed:", e2);
          }
        }, 100);
      }
    };

    // Function to flush pending writes
    const flushPendingWrites = () => {
      if (!isReadyRef.current || !termRef.current) return;
      
      const pending = pendingWritesRef.current;
      if (pending.length > 0) {
        console.log("Flushing", pending.length, "pending writes");
        pendingWritesRef.current = [];
        for (const data of pending) {
          try {
            termRef.current.write(data);
          } catch (e) {
            console.error("Error flushing write:", e);
          }
        }
      }
    };

    // Wait for terminal to be ready before fitting
    const initFit = () => {
      try {
        fit.fit();
        
        // Mark as ready after fit completes
        isReadyRef.current = true;
        console.log("Terminal is ready, rows:", term.rows, "cols:", term.cols);
        
        term.focus();
        
        // Flush any pending writes
        flushPendingWrites();
        
        // Notify about initial size
        if (onResize) {
          onResize(term.rows, term.cols);
        }
      } catch (e) {
        console.error("Error fitting terminal:", e);
        // Retry after a short delay
        setTimeout(initFit, 100);
      }
    };
    
    // Use requestAnimationFrame and setTimeout for better timing
    requestAnimationFrame(() => {
      setTimeout(initFit, 50);
    });

    // Global write function with safety checks
    window.__ptyWrite = safeWrite;

    // Global focus function
    window.__ptyFocus = () => {
      term.focus();
    };

    // Handle terminal input - this is the key part!
    const dataDispos = term.onData((data) => {
      console.log("Terminal onData:", JSON.stringify(data));
      onData(data);
    });

    const resize = () => {
      if (!isReadyRef.current) return;
      
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

    // Only handle specific keyboard shortcuts, let terminal handle the rest
    const keyHandler = (e: KeyboardEvent) => {
      // Only intercept our custom shortcuts
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "t") {
        onKey(e);
      } else if (e.ctrlKey && e.key.toLowerCase() === "w") {
        onKey(e);
      }
    };
    window.addEventListener("keydown", keyHandler);

    // Handle terminal resize events
    const termResizeDispos = term.onResize(({ rows, cols }) => {
      if (onResize) {
        onResize(rows, cols);
      }
    });

    return () => {
      isReadyRef.current = false;
      window.removeEventListener("resize", debouncedResize);
      window.removeEventListener("keydown", keyHandler);
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      dataDispos.dispose();
      termResizeDispos.dispose();
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
