/**
 * SafeMarkdown - XSS-safe markdown rendering component
 * Sanitizes content before rendering to prevent script injection
 * Supports clickable images with lightbox integration
 */

import { useMemo, useCallback } from "react";
import { Streamdown } from "streamdown";
import DOMPurify from "dompurify";

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

// Extract image URLs from markdown content
function extractImages(content: string): ImageInfo[] {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const images: ImageInfo[] = [];
  let match;

  while ((match = imageRegex.exec(content)) !== null) {
    images.push({
      alt: match[1] || undefined,
      src: match[2],
    });
  }

  return images;
}

export function SafeMarkdown({ children, className, onImageClick }: SafeMarkdownProps) {
  const sanitizedContent = useMemo(() => {
    if (!children || typeof children !== "string") {
      return "";
    }

    // Sanitize URLs first (before markdown parsing)
    const urlSanitized = sanitizeUrls(children);

    // Then sanitize HTML content
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

  // If we have onImageClick, we need to intercept image rendering
  // Replace markdown images with custom clickable thumbnails
  const processedContent = useMemo(() => {
    if (!onImageClick || !sanitizedContent) return sanitizedContent;

    // Replace image markdown with a placeholder that we'll render as clickable
    // We add a data attribute to identify the image
    return sanitizedContent.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (match, alt, src) => {
        // Create a custom HTML that will be rendered as a clickable thumbnail
        return `<img src="${src}" alt="${alt || 'Generated image'}" class="markdown-image cursor-pointer max-w-[300px] max-h-[200px] rounded-lg border hover:opacity-90 transition-opacity object-contain" data-clickable="true" />`;
      }
    );
  }, [sanitizedContent, onImageClick]);

  // Add click handler for images after render
  const handleContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG" && target.getAttribute("data-clickable") === "true") {
      const src = target.getAttribute("src");
      if (src) {
        handleImageClick(src);
      }
    }
  }, [handleImageClick]);

  return (
    <div className={className} onClick={onImageClick ? handleContainerClick : undefined}>
      <Streamdown>{processedContent}</Streamdown>
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
