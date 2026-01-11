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

  useImperativeHandle(ref, () => ({
    focus: () => {
      termRef.current?.focus();
    }
  }));

  useEffect(() => {
    if (!containerRef.current || initDoneRef.current) return;
    initDoneRef.current = true;

    console.log("PtyXterm: Initializing terminal...");
    console.log("PtyXterm: Container dimensions:", containerRef.current.clientWidth, containerRef.current.clientHeight);

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
      cols: 80,  // Initial columns
      rows: 24,  // Initial rows
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

    // Write function - write directly to terminal (no refresh needed, xterm handles it)
    const writeToTerminal = (data: string) => {
      console.log("PtyXterm: writeToTerminal called with", data.length, "chars");
      try {
        term.write(data);
        // xterm.js automatically renders after write(), no need to call refresh()
      } catch (e) {
        console.error("PtyXterm: Error writing to terminal:", e);
      }
    };

    // Global write function - set immediately after open
    window.__ptyWrite = writeToTerminal;
    console.log("PtyXterm: __ptyWrite registered");

    // Global focus function
    window.__ptyFocus = () => {
      term.focus();
    };

    // Handle terminal input - send to backend
    const dataDispos = term.onData((data) => {
      console.log("PtyXterm: User input:", JSON.stringify(data));
      onData(data);
    });

    // Safe fit function with proper error handling
    const safeFit = () => {
      const el = containerRef.current;
      if (!el) return false;
      
      // Wait for container to have dimensions
      if (el.clientWidth === 0 || el.clientHeight === 0) {
        console.log("PtyXterm: Container has no dimensions yet");
        return false;
      }
      
      try {
        // Check if terminal core is ready by checking element
        if (!term.element) {
          console.log("PtyXterm: Terminal element not ready");
          return false;
        }
        
        // Check if terminal has a viewport (required for fit)
        const viewport = term.element.querySelector('.xterm-viewport');
        if (!viewport) {
          console.log("PtyXterm: Terminal viewport not ready");
          return false;
        }
        
        // Check viewport dimensions
        const viewportRect = viewport.getBoundingClientRect();
        if (viewportRect.width === 0 || viewportRect.height === 0) {
          console.log("PtyXterm: Viewport has no dimensions");
          return false;
        }
        
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          try {
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
          } catch (e) {
            console.log("PtyXterm: Fit error in RAF:", e);
          }
        });
        
        return true;
      } catch (e) {
        console.log("PtyXterm: Fit error (will retry):", e);
        return false;
      }
    };

    // Delayed fit with retries - start after longer delay
    let fitAttempts = 0;
    const maxFitAttempts = 20;
    let fitSuccess = false;
    
    const tryFit = () => {
      if (fitSuccess || fitAttempts >= maxFitAttempts) return;
      fitAttempts++;
      
      if (safeFit()) {
        fitSuccess = true;
        console.log("PtyXterm: Fit completed after", fitAttempts, "attempts");
      } else {
        // Retry with increasing delay
        setTimeout(tryFit, 100 + fitAttempts * 50);
      }
    };
    
    // Start fit attempts after a longer delay (300ms)
    setTimeout(tryFit, 300);
    
    // Focus terminal after delay
    setTimeout(() => {
      term.focus();
      console.log("PtyXterm: Terminal focused");
    }, 350);

    // Debounced resize handler
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        fitSuccess = false;
        fitAttempts = 0;
        tryFit();
      }, 200);
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
      console.log("PtyXterm: Cleanup");
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
