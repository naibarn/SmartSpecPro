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
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      scrollback: 8000,
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
        cursorAccent: "#1e1e1e",
        selectionBackground: "#264f78",
        black: "#000000",
        red: "#cd3131",
        green: "#0dbc79",
        yellow: "#e5e510",
        blue: "#2472c8",
        magenta: "#bc3fbc",
        cyan: "#11a8cd",
        white: "#e5e5e5",
        brightBlack: "#666666",
        brightRed: "#f14c4c",
        brightGreen: "#23d18b",
        brightYellow: "#f5f543",
        brightBlue: "#3b8eea",
        brightMagenta: "#d670d6",
        brightCyan: "#29b8db",
        brightWhite: "#e5e5e5",
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
        minHeight: 300,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "#1e1e1e"
      }}
    />
  );
}
