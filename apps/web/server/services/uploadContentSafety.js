"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isActiveContentUpload = isActiveContentUpload;
exports.isSvgUpload = isSvgUpload;
exports.sanitizeUploadedSvg = sanitizeUploadedSvg;
exports.getUploadStaticHeaders = getUploadStaticHeaders;
var path_1 = require("path");
var ACTIVE_CONTENT_EXTENSIONS = new Set([
    ".html",
    ".htm",
    ".xhtml",
    ".shtml",
    ".mhtml",
]);
function isActiveContentUpload(fileType, extension) {
    var ext = extension.startsWith(".") ? extension.toLowerCase() : ".".concat(extension.toLowerCase());
    var mime = fileType.toLowerCase();
    if (ACTIVE_CONTENT_EXTENSIONS.has(ext)) {
        return true;
    }
    return mime === "text/html" || mime === "application/xhtml+xml";
}
function isSvgUpload(fileType, extension) {
    var ext = extension.startsWith(".") ? extension.toLowerCase() : ".".concat(extension.toLowerCase());
    var mime = fileType.toLowerCase();
    return ext === ".svg" || mime === "image/svg+xml";
}
function containsUnsafeSvgPatterns(source) {
    if (!/<svg[\s>]/i.test(source))
        return "missing_svg_root";
    if (/<script[\s>]/i.test(source))
        return "script_tag";
    if (/<foreignobject[\s>]/i.test(source))
        return "foreign_object";
    if (/\bon[a-z]+\s*=/i.test(source))
        return "event_handler";
    if (/\b(?:href|xlink:href)\s*=\s*["']\s*javascript:/i.test(source))
        return "javascript_href";
    return null;
}
function sanitizeUploadedSvg(buffer) {
    var source = buffer.toString("utf8");
    var unsafeReason = containsUnsafeSvgPatterns(source);
    if (unsafeReason) {
        return {
            safe: false,
            sanitizedBuffer: buffer,
            reason: unsafeReason,
        };
    }
    // Keep sanitizer intentionally minimal and deterministic for trusted SVG subset.
    var sanitized = source
        .replace(/<\?xml[\s\S]*?\?>/gi, "")
        .replace(/<!doctype[\s\S]*?>/gi, "")
        .trim();
    return {
        safe: true,
        sanitizedBuffer: Buffer.from(sanitized, "utf8"),
    };
}
function getUploadStaticHeaders(filePath) {
    var ext = path_1.default.extname(filePath).toLowerCase();
    if (!ACTIVE_CONTENT_EXTENSIONS.has(ext)) {
        return {};
    }
    return {
        "Content-Disposition": "attachment",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
    };
}
