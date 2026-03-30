import { memo, useMemo } from "react";
import DOMPurify from "dompurify";

export interface SafeHtmlProps {
  html: string;
  profile?: "article" | "social";
  className?: string;
}

const ARTICLE_ALLOWED_TAGS = ["h1", "h2", "h3", "h4", "p", "ul", "ol", "li", "blockquote", "pre", "code", "a", "b", "i", "em", "strong", "br", "img"];
const SOCIAL_ALLOWED_TAGS = ["b", "i", "em", "strong", "a", "p", "br"];

function createSanitizedHtml(html: string, profile: "article" | "social"): string {
  const allowedTags = profile === "article" ? ARTICLE_ALLOWED_TAGS : SOCIAL_ALLOWED_TAGS;

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: ["href", "src", "title", "alt"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    FORBID_TAGS: ["script", "style", "iframe", "form", "input", "object", "embed"],
    FORBID_ATTR: ["onclick", "onerror", "onload", "onmouseover", "onfocus", "onmouseenter", "onmouseleave"],
    RETURN_TRUSTED_TYPE: false,
  });
}

export const SafeHtml = memo(function SafeHtml({ html, profile = "article", className }: SafeHtmlProps) {
  const sanitized = useMemo(() => createSanitizedHtml(html, profile), [html, profile]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: sanitized }} />;
});
