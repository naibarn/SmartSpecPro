import DOMPurify from "dompurify";

interface HelpTopicRendererProps {
  html: string;
  className?: string;
}

export function HelpTopicRenderer({ html, className }: HelpTopicRendererProps) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "a", "ul", "ol", "li",
      "strong", "em", "code", "pre",
      "table", "thead", "tbody", "tr", "th", "td",
      "blockquote", "hr", "br", "img",
      "details", "summary",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "src", "alt"],
    ALLOWED_URI_REGEXP: /^(https?:|mailto:|#|\/(?!\/))/i,
  });

  return (
    <div
      className={`prose prose-sm dark:prose-invert max-w-none ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
