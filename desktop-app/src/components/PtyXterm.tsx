import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
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
    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 12,
      scrollback: 8000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);

    if (ref.current) {
      term.open(ref.current);
      fit.fit();
      term.focus();
    }

    window.__ptyWrite = (data: string) => term.write(data);

    const dispos = term.onData(onData);

    const resize = () => {
      try { fit.fit(); } catch {}
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
