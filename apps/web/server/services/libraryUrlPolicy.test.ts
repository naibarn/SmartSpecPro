import { describe, expect, it } from "vitest";

import {
  classifyHostSafety,
  validateLibraryUrl,
  type LibraryUrlPolicyContext,
} from "./libraryUrlPolicy";

function expectRejected(
  context: LibraryUrlPolicyContext,
  url: string,
  reason: string,
): void {
  const result = validateLibraryUrl(url, context);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.reason).toBe(reason);
  }
}

describe("classifyHostSafety", () => {
  it("flags local/private targets as blocked", () => {
    expect(classifyHostSafety("localhost")).toBe("blocked_local_private_host");
    expect(classifyHostSafety("127.0.0.1")).toBe("blocked_local_private_host");
    expect(classifyHostSafety("10.10.10.1")).toBe("blocked_local_private_host");
    expect(classifyHostSafety("172.16.0.1")).toBe("blocked_local_private_host");
    expect(classifyHostSafety("192.168.1.10")).toBe("blocked_local_private_host");
    expect(classifyHostSafety("::1")).toBe("blocked_local_private_host");
    expect(classifyHostSafety("fe80::1")).toBe("blocked_local_private_host");
  });

  it("allows public hostnames", () => {
    expect(classifyHostSafety("cdn.example.com")).toBe("ok");
    expect(classifyHostSafety("images.example.org")).toBe("ok");
  });
});

describe("validateLibraryUrl", () => {
  it("accepts relative /uploads paths", () => {
    const result = validateLibraryUrl("/uploads/library/a.png", "library_source_url");
    expect(result).toEqual({
      ok: true,
      normalizedUrl: "/uploads/library/a.png",
      classification: "relative_local_path",
    });
  });

  it("accepts public https URLs", () => {
    const result = validateLibraryUrl(
      "https://cdn.example.com/files/demo.png",
      "library_thumbnail_url",
    );
    expect(result).toEqual({
      ok: true,
      normalizedUrl: "https://cdn.example.com/files/demo.png",
      classification: "external_https_url",
    });
  });

  it("rejects unsafe schemes", () => {
    expectRejected("library_source_url", "javascript:alert(1)", "blocked_scheme");
    expectRejected("library_source_url", "vbscript:msgbox(1)", "blocked_scheme");
    expectRejected("library_source_url", "file:///etc/passwd", "blocked_scheme");
    expectRejected("library_source_url", "data:text/html;base64,abc", "blocked_scheme");
  });

  it("rejects malformed and unsupported URLs", () => {
    expectRejected("library_source_url", "https://", "malformed_url");
    expectRejected("library_source_url", "ftp://example.com/a.png", "unsupported_protocol");
  });

  it("rejects private/internal hosts in public-only contexts", () => {
    expectRejected(
      "office_preview_url",
      "https://localhost/private.docx",
      "blocked_local_private_host",
    );
    expectRejected(
      "image_proxy_target_url",
      "https://192.168.0.50/image.png",
      "blocked_local_private_host",
    );
  });

  it("returns deterministic payload for invalid relative paths", () => {
    const result = validateLibraryUrl("uploads/no-leading-slash.png", "library_source_url");
    expect(result).toEqual({
      ok: false,
      reason: "invalid_relative_path",
      message: "Relative URL must start with /",
    });
  });
});
