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
  const isFittingRef = useRef<boolean>(false);
  const pendingWritesRef = useRef<string[]>([]);
  const lastSizeRef = useRef<{ rows: number; cols: number } | null>(null);
  const initDoneRef = useRef<boolean>(false);

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
        pendingWritesRef.current.push(data);
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

    // Safe fit function that prevents concurrent calls
    const safeFit = (): boolean => {
      if (isFittingRef.current) {
        return false;
      }
      
      if (!fitRef.current || !termRef.current) {
        return false;
      }
      
      try {
        isFittingRef.current = true;
        fitRef.current.fit();
        
        const newRows = termRef.current.rows;
        const newCols = termRef.current.cols;
        
        // Only notify if size actually changed
        const lastSize = lastSizeRef.current;
        if (!lastSize || lastSize.rows !== newRows || lastSize.cols !== newCols) {
          lastSizeRef.current = { rows: newRows, cols: newCols };
          
          if (onResize && isReadyRef.current) {
            onResize(newRows, newCols);
          }
        }
        
        return true;
      } catch (e) {
        console.error("Error fitting terminal:", e);
        return false;
      } finally {
        isFittingRef.current = false;
      }
    };

    // Initialize terminal with delay
    const initTerminal = () => {
      if (isReadyRef.current) return;
      
      const success = safeFit();
      if (success) {
        isReadyRef.current = true;
        
        // Focus terminal
        term.focus();
        
        // Flush any pending writes after a short delay
        setTimeout(flushPendingWrites, 50);
      } else {
        // Retry
        setTimeout(initTerminal, 100);
      }
    };
    
    // Start initialization after DOM is ready
    setTimeout(initTerminal, 100);

    // Global write function
    window.__ptyWrite = safeWrite;

    // Global focus function
    window.__ptyFocus = () => {
      term.focus();
    };

    // Handle terminal input
    const dataDispos = term.onData((data) => {
      console.log("Terminal onData:", JSON.stringify(data));
      onData(data);
    });

    // Debounced resize handler
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        if (isReadyRef.current) {
          safeFit();
        }
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
      isReadyRef.current = false;
      initDoneRef.current = false;
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
