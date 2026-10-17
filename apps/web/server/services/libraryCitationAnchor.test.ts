import { describe, expect, it } from "vitest";
import {
  buildLibraryCitationAnchorUri,
  createLibraryCitationAnchor,
  encodeLibraryCitationAnchor,
  normalizeCanonicalMarkdown,
  sha256,
  verifyLibraryCitationAnchor,
} from "./libraryCitationAnchor";

describe("canonical Library Markdown citation anchors", () => {
  it("uses LF plus NFC normalization and 1-based inclusive lines before context truncation", () => {
    const anchor = createLibraryCitationAnchor({
      documentId: 17,
      query: "approved payment terms",
      markdown: "# Policy\r\n\r\nApproved payment terms apply.\r\nInternal footer",
    });

    expect(normalizeCanonicalMarkdown("a\r\nb\rc")).toBe("a\nb\nc");
    expect(anchor).toMatchObject({ documentId: 17, lineStart: 3, lineEnd: 3 });
    expect(anchor?.digest).toBe(sha256("# Policy\n\nApproved payment terms apply.\nInternal footer"));
    expect(anchor && verifyLibraryCitationAnchor(anchor, "# Policy\n\nApproved payment terms apply.\nInternal footer")).toBe(true);
  });

  it("does not invent a source location when the canonical text has no query support", () => {
    expect(createLibraryCitationAnchor({
      documentId: 17,
      query: "unrelated fabricated fact",
      markdown: "# Policy\nThe current process is documented here.",
    })).toBeNull();
  });

  it("rejects changed content and produces an internal authenticated Document Management route", () => {
    const anchor = createLibraryCitationAnchor({
      documentId: 17,
      query: "payment terms",
      markdown: "Payment terms are net thirty days.",
    });
    expect(anchor).not.toBeNull();
    expect(verifyLibraryCitationAnchor(anchor!, "Payment terms are net fifteen days.")).toBe(false);
    const uri = buildLibraryCitationAnchorUri(anchor!);
    expect(uri).toMatch(/^\/document-management\?/);
    expect(uri).not.toContain("sourceUrl");
    expect(new URLSearchParams(uri.slice(uri.indexOf("?") + 1)).get("cite")).toBe(encodeLibraryCitationAnchor(anchor!));
  });

  it("rejects mismatching quote hashes and out-of-range line locations", () => {
    const anchor = createLibraryCitationAnchor({
      documentId: 17,
      query: "payment terms",
      markdown: "Payment terms are net thirty days.",
    })!;
    expect(verifyLibraryCitationAnchor({ ...anchor, quoteHash: "a".repeat(64) }, "Payment terms are net thirty days.")).toBe(false);
    expect(verifyLibraryCitationAnchor({ ...anchor, lineEnd: 2 }, "Payment terms are net thirty days.")).toBe(false);
  });
});
