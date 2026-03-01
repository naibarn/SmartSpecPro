import { useEffect, useId, useRef, useState } from "react";
import DOMPurify from "dompurify";

interface MermaidRendererProps {
  content: string;
}

export function MermaidRenderer({ content }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string>("");
  const stableId = useId().replace(/:/g, "-");

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "default" });
        const { svg: rendered } = await mermaid.render(
          `mermaid${stableId}`,
          content,
        );
        if (!cancelled) {
          const sanitized = DOMPurify.sanitize(rendered, {
            USE_PROFILES: { svg: true, svgFilters: true },
          });
          setSvg(sanitized);
          setError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to render Mermaid diagram",
          );
        }
      }
    }

    render();
    return () => { cancelled = true; };
  }, [content, stableId]);

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 p-4">
        <p className="text-sm text-destructive">Mermaid rendering error: {error}</p>
        <pre className="mt-2 overflow-x-auto text-xs text-muted-foreground">{content}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex items-center justify-center overflow-auto rounded-md border p-4"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
