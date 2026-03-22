// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  sanitizeMediaSrc,
  escapeAttr,
  parseDataAttr,
  buildDataAttrs,
  isAllowedLinkUri,
} from "../mediaSerializationRules";

describe("sanitizeMediaSrc", () => {
  // --- Allowed URLs ---
  it("allows https URLs", () => {
    expect(sanitizeMediaSrc("https://example.com/img.png")).toBe(
      "https://example.com/img.png",
    );
  });

  it("allows http URLs", () => {
    expect(sanitizeMediaSrc("http://example.com/img.png")).toBe(
      "http://example.com/img.png",
    );
  });

  it("allows relative paths starting with /", () => {
    expect(sanitizeMediaSrc("/uploads/img.png")).toBe("/uploads/img.png");
  });

  // --- Basic blocked protocols ---
  it("rejects javascript: URLs", () => {
    expect(sanitizeMediaSrc("javascript:alert(1)")).toBe("");
  });

  it("rejects JAVASCRIPT: (case-insensitive)", () => {
    expect(sanitizeMediaSrc("JAVASCRIPT:alert(1)")).toBe("");
  });

  it("rejects vbscript: URLs", () => {
    expect(sanitizeMediaSrc("vbscript:msgbox")).toBe("");
  });

  it("rejects data:text/html URLs", () => {
    expect(sanitizeMediaSrc("data:text/html,<script>alert(1)</script>")).toBe(
      "",
    );
  });

  it("rejects data:application URLs", () => {
    expect(sanitizeMediaSrc("data:application/pdf,base64...")).toBe("");
  });

  it("rejects data:image/svg+xml URLs", () => {
    expect(sanitizeMediaSrc("data:image/svg+xml,<svg></svg>")).toBe("");
  });

  it("rejects blob: URLs", () => {
    expect(sanitizeMediaSrc("blob:http://example.com/abc")).toBe("");
  });

  it("rejects file: URLs", () => {
    expect(sanitizeMediaSrc("file:///etc/passwd")).toBe("");
  });

  // --- Percent-encoded bypass attempts (SECURITY-CRITICAL) ---
  it("rejects percent-encoded javascript: (java%73cript:)", () => {
    expect(sanitizeMediaSrc("java%73cript:alert(1)")).toBe("");
  });

  it("rejects fully percent-encoded javascript:", () => {
    expect(sanitizeMediaSrc("%6A%61%76%61%73%63%72%69%70%74:alert(1)")).toBe(
      "",
    );
  });

  it("rejects percent-encoded vbscript:", () => {
    expect(sanitizeMediaSrc("vb%73cript:exec")).toBe("");
  });

  it("rejects percent-encoded data:text/html", () => {
    expect(sanitizeMediaSrc("da%74a:text/html,<script>")).toBe("");
  });

  it("rejects double-encoded javascript: (partial)", () => {
    // After one decode: "javascript:alert(1)"
    expect(sanitizeMediaSrc("java%73cript:alert(1)")).toBe("");
  });

  // --- Null byte / control character bypass ---
  it("rejects javascript: with embedded null bytes", () => {
    expect(sanitizeMediaSrc("java\x00script:alert(1)")).toBe("");
  });

  it("rejects javascript: with tab characters", () => {
    expect(sanitizeMediaSrc("java\tscript:alert(1)")).toBe("");
  });

  // --- Edge cases ---
  it("returns empty for empty string", () => {
    expect(sanitizeMediaSrc("")).toBe("");
  });

  it("returns empty for null-ish input", () => {
    expect(sanitizeMediaSrc(null as any)).toBe("");
    expect(sanitizeMediaSrc(undefined as any)).toBe("");
  });

  it("returns empty for whitespace-only string", () => {
    expect(sanitizeMediaSrc("   ")).toBe("");
  });

  it("rejects bare relative paths without leading /", () => {
    expect(sanitizeMediaSrc("img.png")).toBe("");
  });

  it("rejects unknown protocols", () => {
    expect(sanitizeMediaSrc("ftp://example.com/file")).toBe("");
  });

  it("rejects malformed percent-encoding", () => {
    expect(sanitizeMediaSrc("https://example.com/%ZZ")).toBe("");
  });

  it("trims whitespace before validation", () => {
    expect(sanitizeMediaSrc("  https://example.com/img.png  ")).toBe(
      "https://example.com/img.png",
    );
  });
});

describe("escapeAttr", () => {
  it("escapes ampersand", () => {
    expect(escapeAttr("a&b")).toBe("a&amp;b");
  });

  it("escapes double quotes", () => {
    expect(escapeAttr('a"b')).toBe("a&quot;b");
  });

  it("escapes angle brackets", () => {
    expect(escapeAttr("a<b>c")).toBe("a&lt;b&gt;c");
  });

  it("escapes XSS payload in caption", () => {
    expect(escapeAttr('"><script>alert(1)</script>')).toBe(
      "&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("preserves safe strings unchanged", () => {
    expect(escapeAttr("Hello World 123")).toBe("Hello World 123");
  });

  it("handles empty string", () => {
    expect(escapeAttr("")).toBe("");
  });
});

describe("buildDataAttrs", () => {
  it("filters out null and undefined values", () => {
    expect(
      buildDataAttrs({ a: "1", b: null, c: undefined, d: "2" }),
    ).toEqual({ a: "1", d: "2" });
  });

  it("filters out empty strings", () => {
    expect(buildDataAttrs({ a: "", b: "value" })).toEqual({ b: "value" });
  });

  it("returns empty object for all-null input", () => {
    expect(buildDataAttrs({ a: null, b: undefined })).toEqual({});
  });
});

describe("parseDataAttr", () => {
  it("reads a data-* attribute from element dataset", () => {
    const el = document.createElement("div");
    el.dataset.caption = "test caption";
    expect(parseDataAttr(el, "data-caption")).toBe("test caption");
  });

  it("converts kebab-case to camelCase for dataset access", () => {
    const el = document.createElement("div");
    el.dataset.assetId = "abc-123";
    expect(parseDataAttr(el, "data-asset-id")).toBe("abc-123");
  });

  it("returns null for missing attribute", () => {
    const el = document.createElement("div");
    expect(parseDataAttr(el, "data-missing")).toBeNull();
  });
});

describe("isAllowedLinkUri", () => {
  // --- Allowed ---
  it("allows https URLs", () => {
    expect(isAllowedLinkUri("https://example.com")).toBe(true);
  });

  it("allows http URLs", () => {
    expect(isAllowedLinkUri("http://example.com")).toBe(true);
  });

  it("allows mailto: links", () => {
    expect(isAllowedLinkUri("mailto:user@example.com")).toBe(true);
  });

  it("allows tel: links", () => {
    expect(isAllowedLinkUri("tel:+1234567890")).toBe(true);
  });

  it("allows relative paths starting with /", () => {
    expect(isAllowedLinkUri("/about")).toBe(true);
  });

  it("allows anchor links starting with #", () => {
    expect(isAllowedLinkUri("#section-1")).toBe(true);
  });

  it("allows relative paths starting with ./", () => {
    expect(isAllowedLinkUri("./page")).toBe(true);
  });

  it("allows relative paths starting with ../", () => {
    expect(isAllowedLinkUri("../page")).toBe(true);
  });

  // --- Blocked ---
  it("rejects javascript: URLs", () => {
    expect(isAllowedLinkUri("javascript:alert(1)")).toBe(false);
  });

  it("rejects percent-encoded javascript:", () => {
    expect(isAllowedLinkUri("java%73cript:alert(1)")).toBe(false);
  });

  it("rejects fully percent-encoded javascript:", () => {
    expect(isAllowedLinkUri("%6A%61%76%61%73%63%72%69%70%74:alert(1)")).toBe(
      false,
    );
  });

  it("rejects vbscript:", () => {
    expect(isAllowedLinkUri("vbscript:exec")).toBe(false);
  });

  it("rejects data:text/html", () => {
    expect(isAllowedLinkUri("data:text/html,<script>")).toBe(false);
  });

  it("rejects javascript: with null bytes", () => {
    expect(isAllowedLinkUri("java\x00script:alert(1)")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isAllowedLinkUri("")).toBe(false);
  });

  it("rejects null/undefined", () => {
    expect(isAllowedLinkUri(null as any)).toBe(false);
    expect(isAllowedLinkUri(undefined as any)).toBe(false);
  });

  it("rejects unknown protocols", () => {
    expect(isAllowedLinkUri("ftp://example.com")).toBe(false);
  });

  it("rejects bare domain without protocol", () => {
    expect(isAllowedLinkUri("example.com")).toBe(false);
  });

  it("rejects malformed percent-encoding", () => {
    expect(isAllowedLinkUri("https://example.com/%ZZ")).toBe(false);
  });
});
