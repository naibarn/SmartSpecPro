import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import "xterm/css/xterm.css";

type Props = {
  onData: (data: string) => void;
  onKey: (ev: KeyboardEvent) => void;
};

declare global {
  interface Window {
    __ptyWrite?: (data: string) => void;
  }
}

export default function PtyXterm({ onData, onKey }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 12,
      scrollback: 8000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);

    term.open(ref.current);

    // Wait for terminal to be ready before fitting
    setTimeout(() => {
      try {
        fit.fit();
        term.focus();
      } catch (e) {
        console.error("Error fitting terminal:", e);
      }
    }, 0);

    window.__ptyWrite = (data: string) => term.write(data);

    const dispos = term.onData(onData);

    const resize = () => {
      try {
        fit.fit();
      } catch (e) {
        console.error("Error resizing terminal:", e);
      }
    };
    window.addEventListener("resize", resize);

    const keyHandler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", keyHandler);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", keyHandler);
      dispos.dispose();
      term.dispose();
      delete window.__ptyWrite;
    };
  }, [onData, onKey]);

  return <div ref={ref} style={{ height: "60vh", borderRadius: 12, overflow: "hidden" }} />;
}
