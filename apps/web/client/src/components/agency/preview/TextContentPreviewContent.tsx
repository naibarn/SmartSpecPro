import { useMemo } from "react";
import DOMPurify from "dompurify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

interface TextContentPreviewContentProps {
  data: {
    title: string;
    content: string;
    format: "plain" | "markdown" | "html";
  };
}

/** Lightweight markdown → HTML renderer (XSS-safe: escapes HTML first). */
function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    '<pre class="bg-gray-100 border border-gray-200 rounded p-2 my-2 overflow-x-auto text-xs"><code>$2</code></pre>',
  );
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 rounded text-xs">$1</code>');
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h4 class="font-semibold text-sm mt-3 mb-1">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="font-semibold text-base mt-3 mb-1">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h3 class="font-bold text-lg mt-3 mb-1">$1</h3>');
  // Bold / italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Links (safe protocols only)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m: string, label: string, href: string) => {
      const h = href.trim().replace(/"/g, "&quot;");
      if (/^https?:\/\//i.test(h) || /^mailto:/i.test(h) || h.startsWith("#")) {
        return `<a href="${h}" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline">${label}</a>`;
      }
      return label;
    },
  );
  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>');
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="my-1">$&</ul>');
  // Line breaks
  html = html.replace(/\n\n/g, '<div class="my-2"></div>');
  html = html.replace(/\n/g, "<br />");

  return html;
}

export function TextContentPreviewContent({
  data,
}: TextContentPreviewContentProps) {
  const copyContent = () => {
    navigator.clipboard.writeText(data.content);
    toast.success("Content copied to clipboard");
  };

  const renderedHtml = useMemo(() => {
    if (data.format === "markdown") return renderMarkdown(data.content);
    if (data.format === "html") return DOMPurify.sanitize(data.content, {
      ALLOWED_TAGS: [
        "h1", "h2", "h3", "h4", "h5", "h6",
        "p", "a", "ul", "ol", "li",
        "strong", "em", "code", "pre",
        "table", "thead", "tbody", "tr", "th", "td",
        "blockquote", "hr", "br", "img",
        "div", "span",
      ],
      ALLOWED_ATTR: ["href", "target", "rel", "src", "alt", "class"],
      ALLOWED_URI_REGEXP: /^(https?:|mailto:|#)/i,
    });
    return null;
  }, [data.content, data.format]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="text-xs">
          {data.format}
        </Badge>
      </div>

      <div className="rounded-lg border bg-background p-4 max-h-[400px] overflow-y-auto">
        {renderedHtml ? (
          <div
            className="prose prose-sm max-w-none text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        ) : (
          <pre className="text-sm leading-relaxed whitespace-pre-wrap font-sans">
            {data.content}
          </pre>
        )}
      </div>

      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={copyContent}
      >
        <Copy className="h-3.5 w-3.5" />
        Copy Content
      </Button>
    </div>
  );
}
