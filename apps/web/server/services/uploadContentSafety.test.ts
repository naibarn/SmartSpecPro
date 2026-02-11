import { describe, expect, it } from "vitest";

import {
  getUploadStaticHeaders,
  isActiveContentUpload,
  isSvgUpload,
  sanitizeUploadedSvg,
} from "./uploadContentSafety";

describe("isActiveContentUpload", () => {
  it("detects active-content html uploads", () => {
    expect(isActiveContentUpload("text/html", "html")).toBe(true);
    expect(isActiveContentUpload("application/xhtml+xml", ".xhtml")).toBe(true);
  });

  it("does not classify safe media types as active-content", () => {
    expect(isActiveContentUpload("image/png", "png")).toBe(false);
    expect(isActiveContentUpload("video/mp4", "mp4")).toBe(false);
    expect(isActiveContentUpload("application/pdf", "pdf")).toBe(false);
  });
});

describe("isSvgUpload", () => {
  it("detects svg by extension or mime", () => {
    expect(isSvgUpload("application/octet-stream", ".svg")).toBe(true);
    expect(isSvgUpload("image/svg+xml", "bin")).toBe(true);
  });
});

describe("sanitizeUploadedSvg", () => {
  it("accepts and sanitizes safe svg payload", () => {
    const safeSvg = Buffer.from(`<?xml version="1.0"?><svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>`);
    const result = sanitizeUploadedSvg(safeSvg);
    expect(result.safe).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.sanitizedBuffer.toString("utf8")).toBe(`<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>`);
  });

  it("rejects unsafe svg payload containing script vectors", () => {
    const unsafeSvg = Buffer.from(`<svg><script>alert(1)</script></svg>`);
    const result = sanitizeUploadedSvg(unsafeSvg);
    expect(result.safe).toBe(false);
    expect(result.reason).toBe("script_tag");
  });
});

describe("getUploadStaticHeaders", () => {
  it("forces attachment headers for active-content files", () => {
    const headers = getUploadStaticHeaders("/tmp/sample.html");
    expect(headers).toEqual({
      "Content-Disposition": "attachment",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    });
  });

  it("leaves non-active upload files unchanged", () => {
    expect(getUploadStaticHeaders("/tmp/image.png")).toEqual({});
    expect(getUploadStaticHeaders("/tmp/doc.pdf")).toEqual({});
  });
});
