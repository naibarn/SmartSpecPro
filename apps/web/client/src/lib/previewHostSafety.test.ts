import { describe, expect, it } from "vitest";

import { getOfficePreviewDecision, isPublicPreviewHost } from "./previewHostSafety";

describe("previewHostSafety", () => {
  it("blocks localhost/private/internal hosts for office viewer", () => {
    const blockedUrls = [
      "https://localhost/doc.docx",
      "https://127.0.0.1/doc.docx",
      "https://10.1.2.3/doc.docx",
      "https://172.20.10.5/doc.docx",
      "https://192.168.1.8/doc.docx",
      "https://[::1]/doc.docx",
      "https://host.docker.internal/doc.docx",
      "https://files.internal/doc.docx",
      "https://example.local/doc.docx",
    ];

    for (const sourceUrl of blockedUrls) {
      const decision = getOfficePreviewDecision(sourceUrl);
      expect(decision.canEmbed, sourceUrl).toBe(false);
      expect(decision.reason, sourceUrl).toBe("blocked_local_private_host");
      expect(decision.viewerUrl, sourceUrl).toBeNull();
    }
  });

  it("allows public https hosts for office viewer", () => {
    const decision = getOfficePreviewDecision("https://cdn.example.com/docs/guide.docx");

    expect(decision.canEmbed).toBe(true);
    expect(decision.reason).toBeNull();
    expect(decision.viewerUrl).toContain("view.officeapps.live.com/op/embed.aspx");
    expect(decision.viewerUrl).toContain(encodeURIComponent("https://cdn.example.com/docs/guide.docx"));
  });

  it("fails closed for malformed URL", () => {
    const decision = getOfficePreviewDecision("not a valid url");

    expect(decision.canEmbed).toBe(false);
    expect(decision.reason).toBe("malformed_url");
  });

  it("supports relative URL normalization with public origin", () => {
    const decision = getOfficePreviewDecision("/uploads/doc.docx", {
      origin: "https://files.example.com",
    });

    expect(decision.canEmbed).toBe(true);
    expect(decision.normalizedSourceUrl).toBe("https://files.example.com/uploads/doc.docx");
  });

  it("blocks relative URL when resolved origin is private host", () => {
    const decision = getOfficePreviewDecision("/uploads/doc.docx", {
      origin: "http://localhost:3000",
    });

    expect(decision.canEmbed).toBe(false);
    expect(decision.reason).toBe("unsupported_protocol");
  });

  it("classifies public host helper deterministically", () => {
    expect(isPublicPreviewHost("cdn.example.com")).toBe(true);
    expect(isPublicPreviewHost("localhost")).toBe(false);
    expect(isPublicPreviewHost("10.0.0.3")).toBe(false);
  });
});
