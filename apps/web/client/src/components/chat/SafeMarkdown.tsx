/**
 * SafeMarkdown - XSS-safe markdown rendering component
 * Sanitizes content before rendering to prevent script injection
 * Supports clickable images with lightbox integration and download
 */

import { useMemo, useCallback } from "react";
import { Streamdown } from "streamdown";
import DOMPurify from "dompurify";
import { Download } from "lucide-react";

interface ImageInfo {
  src: string;
  alt?: string;
}

interface SafeMarkdownProps {
  children: string;
  className?: string;
  /** Callback when an image is clicked. Receives all images in the content and the clicked index. */
  onImageClick?: (images: ImageInfo[], index: number) => void;
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
  let sanitized = content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/data:(?!image\/)/gi, "data-blocked:")
    .replace(/vbscript:/gi, "");

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
  return content.replace(
    /\[([^\]]*)\]\(([^)]*)\)/g,
    (match, text, url) => {
      const trimmedUrl = url.trim().toLowerCase();
      if (
        trimmedUrl.startsWith("javascript:") ||
        trimmedUrl.startsWith("vbscript:") ||
        trimmedUrl.startsWith("data:text") ||
        trimmedUrl.startsWith("data:application")
      ) {
        return `[${text}](#blocked)`;
      }
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
      if (trimmedUrl.includes(":")) {
        return `[${text}](#blocked)`;
      }
      return match;
    }
  );
}

// Extract image URLs from markdown content
function extractImages(content: string): ImageInfo[] {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const images: ImageInfo[] = [];
  let match;
  while ((match = imageRegex.exec(content)) !== null) {
    images.push({ alt: match[1] || undefined, src: match[2] });
  }
  return images;
}

// Download helper
async function downloadImage(src: string, name?: string) {
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name || "image.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    window.open(src, "_blank");
  }
}

// Image thumbnail component with download button
function ImageThumbnail({
  src,
  alt,
  onClick,
}: {
  src: string;
  alt: string;
  onClick: () => void;
}) {
  return (
    <div className="safe-md-img-wrapper" style={{ position: "relative", display: "inline-block" }}>
      <img
        src={src}
        alt={alt}
        className="cursor-pointer max-w-[300px] max-h-[200px] rounded-lg border hover:opacity-90 transition-opacity object-contain"
        onClick={onClick}
      />
      <button
        className="safe-md-dl-btn"
        title="Download"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          downloadImage(src, alt || "image.png");
        }}
      >
        <Download className="h-4 w-4" />
      </button>
    </div>
  );
}

// Split content into text segments and image segments
function splitContentAndImages(content: string): Array<{ type: "text"; value: string } | { type: "image"; src: string; alt: string }> {
  const parts: Array<{ type: "text"; value: string } | { type: "image"; src: string; alt: string }> = [];
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;

  while ((match = imageRegex.exec(content)) !== null) {
    // Text before this image
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: "image", src: match[2], alt: match[1] || "Generated image" });
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last image
  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }

  return parts;
}

export function SafeMarkdown({ children, className, onImageClick }: SafeMarkdownProps) {
  const sanitizedContent = useMemo(() => {
    if (!children || typeof children !== "string") return "";
    const urlSanitized = sanitizeUrls(children);
    return sanitizeContent(urlSanitized);
  }, [children]);

  // Extract all images from content for lightbox navigation
  const allImages = useMemo(() => extractImages(children || ""), [children]);

  // Handle image click - find index and call callback
  const handleImageClick = useCallback((src: string) => {
    if (!onImageClick) return;
    const index = allImages.findIndex((img) => img.src === src);
    onImageClick(allImages, index >= 0 ? index : 0);
  }, [allImages, onImageClick]);

  // If images exist and onImageClick is set, split content and render images as React components
  const hasImages = allImages.length > 0 && onImageClick;

  const contentParts = useMemo(() => {
    if (!hasImages) return null;
    return splitContentAndImages(sanitizedContent);
  }, [sanitizedContent, hasImages]);

  if (hasImages && contentParts) {
    return (
      <div className={className}>
        {contentParts.map((part, i) => {
          if (part.type === "text") {
            return part.value.trim() ? (
              <Streamdown key={i}>{part.value}</Streamdown>
            ) : null;
          }
          return (
            <ImageThumbnail
              key={`img-${i}`}
              src={part.src}
              alt={part.alt}
              onClick={() => handleImageClick(part.src)}
            />
          );
        })}
      </div>
    );
  }

  // No images or no onImageClick — render normally
  return (
    <div className={className}>
      <Streamdown>{sanitizedContent}</Streamdown>
    </div>
  );
}

// Export a hook for manual sanitization
export function useSanitizedContent(content: string): string {
  return useMemo(() => {
    if (!content || typeof content !== "string") return "";
    return sanitizeContent(sanitizeUrls(content));
  }, [content]);
}
