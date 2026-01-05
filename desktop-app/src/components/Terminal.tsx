import { useEffect, useRef } from "react";

export function Terminal({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div
      ref={ref}
      style={{
        height: "60vh",
        overflow: "auto",
        background: "#0b0f14",
        color: "#d1d5db",
        padding: 12,
        borderRadius: 12,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 12,
        whiteSpace: "pre-wrap",
        lineHeight: 1.4,
      }}
    >
      {lines.join("")}
    </div>
  );
}
