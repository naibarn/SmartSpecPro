import path from "path";

const ACTIVE_CONTENT_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".xhtml",
  ".shtml",
  ".mhtml",
]);

export interface SvgSanitizeResult {
  safe: boolean;
  sanitizedBuffer: Buffer;
  reason?: string;
}

export function isActiveContentUpload(fileType: string, extension: string): boolean {
  const ext = extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  const mime = fileType.toLowerCase();
  if (ACTIVE_CONTENT_EXTENSIONS.has(ext)) {
    return true;
  }
  return mime === "text/html" || mime === "application/xhtml+xml";
}

export function isSvgUpload(fileType: string, extension: string): boolean {
  const ext = extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  const mime = fileType.toLowerCase();
  return ext === ".svg" || mime === "image/svg+xml";
}

function containsUnsafeSvgPatterns(source: string): string | null {
  if (!/<svg[\s>]/i.test(source)) return "missing_svg_root";
  if (/<script[\s>]/i.test(source)) return "script_tag";
  if (/<foreignobject[\s>]/i.test(source)) return "foreign_object";
  if (/\bon[a-z]+\s*=/i.test(source)) return "event_handler";
  if (/\b(?:href|xlink:href)\s*=\s*["']\s*javascript:/i.test(source)) return "javascript_href";
  return null;
}

export function sanitizeUploadedSvg(buffer: Buffer): SvgSanitizeResult {
  const source = buffer.toString("utf8");
  const unsafeReason = containsUnsafeSvgPatterns(source);
  if (unsafeReason) {
    return {
      safe: false,
      sanitizedBuffer: buffer,
      reason: unsafeReason,
    };
  }

  // Keep sanitizer intentionally minimal and deterministic for trusted SVG subset.
  const sanitized = source
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!doctype[\s\S]*?>/gi, "")
    .trim();

  return {
    safe: true,
    sanitizedBuffer: Buffer.from(sanitized, "utf8"),
  };
}

export function getUploadStaticHeaders(filePath: string): Record<string, string> {
  const ext = path.extname(filePath).toLowerCase();
  if (!ACTIVE_CONTENT_EXTENSIONS.has(ext)) {
    return {};
  }

  return {
    "Content-Disposition": "attachment",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
}
