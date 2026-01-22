/**
 * SafeMarkdown - XSS-safe markdown rendering component
 * Sanitizes content before rendering to prevent script injection
 */

import { useMemo } from "react";
import { Streamdown } from "streamdown";
import DOMPurify from "dompurify";

interface SafeMarkdownProps {
  children: string;
  className?: string;
}

// Configure DOMPurify to allow safe markdown elements
const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "strong", "em", "b", "i", "u", "s", "del",
  "a", "img",
  "table", "thead", "tbody", "tr", "th", "td",
  "div", "span",
];

const ALLOWED_ATTR = [
  "href", "src", "alt", "title",
  "class", "id",
  "target", "rel",
  "colspan", "rowspan",
];

// Sanitize content to prevent XSS
function sanitizeContent(content: string): string {
  // First pass: remove obvious script patterns
  let sanitized = content
    // Remove script tags
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    // Remove event handlers
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "")
    // Remove javascript: URLs
    .replace(/javascript:/gi, "")
    // Remove data: URLs (except images)
    .replace(/data:(?!image\/)/gi, "data-blocked:")
    // Remove vbscript: URLs
    .replace(/vbscript:/gi, "");

  // Second pass: use DOMPurify for comprehensive sanitization
  sanitized = DOMPurify.sanitize(sanitized, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "input"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
  });

  return sanitized;
}

// Validate URLs in markdown
function sanitizeUrls(content: string): string {
  // Replace potentially dangerous URLs in markdown links
  return content.replace(
    /\[([^\]]*)\]\(([^)]*)\)/g,
    (match, text, url) => {
      const trimmedUrl = url.trim().toLowerCase();

      // Block dangerous protocols
      if (
        trimmedUrl.startsWith("javascript:") ||
        trimmedUrl.startsWith("vbscript:") ||
        trimmedUrl.startsWith("data:text") ||
        trimmedUrl.startsWith("data:application")
      ) {
        return `[${text}](#blocked)`;
      }

      // Allow safe protocols
      if (
        trimmedUrl.startsWith("http://") ||
        trimmedUrl.startsWith("https://") ||
        trimmedUrl.startsWith("mailto:") ||
        trimmedUrl.startsWith("/") ||
        trimmedUrl.startsWith("#") ||
        trimmedUrl.startsWith("data:image/")
      ) {
        return match;
      }

      // Block unknown protocols
      if (trimmedUrl.includes(":")) {
        return `[${text}](#blocked)`;
      }

      return match;
    }
  );
}

export function SafeMarkdown({ children, className }: SafeMarkdownProps) {
  const sanitizedContent = useMemo(() => {
    if (!children || typeof children !== "string") {
      return "";
    }

    // Sanitize URLs first (before markdown parsing)
    const urlSanitized = sanitizeUrls(children);

    // Then sanitize HTML content
    return sanitizeContent(urlSanitized);
  }, [children]);

  return (
    <div className={className}>
      <Streamdown>{sanitizedContent}</Streamdown>
    </div>
  );
}

// Export a hook for manual sanitization
export function useSanitizedContent(content: string): string {
  return useMemo(() => {
    if (!content || typeof content !== "string") {
      return "";
    }
    return sanitizeContent(sanitizeUrls(content));
  }, [content]);
}
