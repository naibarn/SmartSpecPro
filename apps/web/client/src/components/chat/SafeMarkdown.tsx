/**
 * SafeMarkdown - XSS-safe markdown rendering component
 * Sanitizes content before rendering to prevent script injection
 * Supports clickable images with lightbox integration and download
 * Supports <video> and <audio> HTML tags rendered as native players
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
  "video", "audio", "source",
];

const ALLOWED_ATTR = [
  "href", "src", "alt", "title",
  "class", "id",
  "target", "rel",
  "colspan", "rowspan",
  "controls", "autoplay", "loop", "muted", "preload",
  "type", "width", "height",
  "poster",
];

// Sanitize content to prevent XSS
function sanitizeContent(content: string): string {
  // Protect fenced code blocks from DOMPurify's HTML entity encoding.
  // DOMPurify encodes '>' in text nodes (e.g. '-->' becomes '--&gt;'),
  // which breaks Mermaid diagrams and other code that uses these characters.
  const codeBlocks: string[] = [];
  const withPlaceholders = content.replace(/```[\s\S]*?```/g, (match) => {
    const idx = codeBlocks.length;
    codeBlocks.push(match);
    return `SAFEMDBLOCKSM${idx}SMEND`;
  });

  let sanitized = withPlaceholders
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/data:(?!image\/)/gi, "data-blocked:")
    .replace(/vbscript:/gi, "");

  sanitized = DOMPurify.sanitize(sanitized, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target", "data-poster", "data-caption", "data-asset-id", "data-alignment"],
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "input"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
  });

  // Restore code blocks after DOMPurify (preserves original characters like -->)
  codeBlocks.forEach((block, idx) => {
    sanitized = sanitized.replace(`SAFEMDBLOCKSM${idx}SMEND`, block);
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
        trimmedUrl.startsWith("data:application") ||
        trimmedUrl.startsWith("blob:") ||
        trimmedUrl.startsWith("file:")
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
    window.open(src, "_blank", "noopener,noreferrer");
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

// Split raw content by <video> and <audio> HTML tags so they can be rendered
// as native React elements (bypassing Streamdown's internal sanitizer).
type MediaPart =
  | { kind: "text"; value: string }
  | { kind: "video"; src: string; poster?: string; caption?: string; assetId?: string }
  | { kind: "audio"; src: string; caption?: string; assetId?: string };

const MEDIA_TAG_REGEX = /<(video|audio)\b([^>]*?)\/?>(?:<\/\1>)?/g;

function extractAttr(attrs: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\s)${escaped}=["']([^"']*)["']`);
  const m = re.exec(attrs);
  return m ? m[1] : undefined;
}

// Allowlist-based URL validation for poster attribute.
// Keep in sync with sanitizeMediaSrc in editor/extensions/mediaSerializationRules.ts
function isUrlSafe(url: string): boolean {
  const lower = url.trim().toLowerCase();
  return (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("/")
  );
}

function splitByMedia(content: string): MediaPart[] | null {
  // Fast path: no video/audio tags (keep in sync with MEDIA_TAG_REGEX)
  if (!/<(video|audio)\b/.test(content)) return null;

  const parts: MediaPart[] = [];
  const regex = new RegExp(MEDIA_TAG_REGEX.source, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ kind: "text", value: content.slice(lastIndex, match.index) });
    }
    const tag = match[1] as "video" | "audio";
    const attrString = match[2];
    const src = extractAttr(attrString, "src");
    if (!src) {
      lastIndex = match.index + match[0].length;
      continue;
    }

    const poster = extractAttr(attrString, "data-poster");
    const caption = extractAttr(attrString, "data-caption");
    const assetId = extractAttr(attrString, "data-asset-id");

    if (tag === "video") {
      parts.push({
        kind: "video",
        src,
        poster: poster && isUrlSafe(poster) ? poster : undefined,
        caption,
        assetId,
      });
    } else {
      parts.push({ kind: "audio", src, caption, assetId });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ kind: "text", value: content.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : null;
}

export function SafeMarkdown({ children, className, onImageClick }: SafeMarkdownProps) {
  // Split out <video> and <audio> tags BEFORE sanitization so Streamdown never
  // sees them (Streamdown's rehype-harden strips them regardless of DOMPurify).
  const mediaParts = useMemo(() => {
    if (!children || typeof children !== "string") return null;
    return splitByMedia(children);
  }, [children]);

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

  const hasImages = allImages.length > 0 && !!onImageClick;

  const contentParts = useMemo(() => {
    if (!hasImages) return null;
    return splitContentAndImages(sanitizedContent);
  }, [sanitizedContent, hasImages]);

  // ── Video/audio present: render media elements directly as React elements ──
  if (mediaParts) {
    return (
      <div className={className}>
        {mediaParts.map((part, i) => {
          if (part.kind === "video") {
            const vid = (
              <video
                src={part.src}
                controls
                poster={part.poster}
                data-asset-id={part.assetId}
                style={{ display: "block", width: "100%", maxWidth: "720px", borderRadius: "8px" }}
              />
            );
            return part.caption ? (
              <figure key={i} style={{ margin: "8px 0" }}>
                {vid}
                <p className="text-sm text-muted-foreground mt-1">{part.caption}</p>
              </figure>
            ) : (
              <video key={i} src={part.src} controls poster={part.poster} data-asset-id={part.assetId} style={{ display: "block", width: "100%", maxWidth: "720px", borderRadius: "8px", margin: "8px 0" }} />
            );
          }
          if (part.kind === "audio") {
            const aud = (
              <audio
                src={part.src}
                controls
                data-asset-id={part.assetId}
                style={{ display: "block", width: "100%" }}
              />
            );
            return part.caption ? (
              <figure key={i} style={{ margin: "4px 0" }}>
                {aud}
                <p className="text-sm text-muted-foreground mt-1">{part.caption}</p>
              </figure>
            ) : (
              <audio key={i} src={part.src} controls data-asset-id={part.assetId} style={{ display: "block", width: "100%", margin: "4px 0" }} />
            );
          }
          // Text part — sanitize and render through Streamdown
          if (!part.value.trim()) return null;
          const sanitized = sanitizeContent(sanitizeUrls(part.value));
          return sanitized.trim() ? <Streamdown key={i}>{sanitized}</Streamdown> : null;
        })}
      </div>
    );
  }

  // ── Images with lightbox callback: split and render ImageThumbnail ──
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

  // ── Default: render normally ──
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
