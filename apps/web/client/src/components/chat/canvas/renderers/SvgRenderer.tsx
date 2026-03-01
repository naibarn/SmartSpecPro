import { useMemo } from "react";
import DOMPurify from "dompurify";

interface SvgRendererProps {
  content: string;
}

export function SvgRenderer({ content }: SvgRendererProps) {
  const sanitized = useMemo(() => {
    return DOMPurify.sanitize(content, {
      USE_PROFILES: { svg: true, svgFilters: true },
    });
  }, [content]);

  return (
    <div
      className="flex items-center justify-center overflow-auto rounded-md border p-4"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
