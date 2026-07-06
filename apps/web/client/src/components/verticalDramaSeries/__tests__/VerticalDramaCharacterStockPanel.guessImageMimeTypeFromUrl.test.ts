import { describe, expect, it } from "vitest";
import { guessImageMimeTypeFromUrl } from "@/components/verticalDramaSeries/VerticalDramaCharacterStockPanel";

/**
 * Regression coverage for the character-tab "URL error" investigation (BUG 2):
 * `pollCharacterImageTask` used to hardcode `mimeType: "image/png"` regardless
 * of the completed task's actual returned format — confirmed via the audit
 * log (`apps/web/logs/audit/audit-2026-07-06.jsonl`), where kie_ai's
 * `result_url` for a completed character-sheet task was a `.jpeg`, not a
 * `.png`. `guessImageMimeTypeFromUrl` derives the mimeType from the resolved
 * URL's extension instead, so `resolveMediaAssetForImport` stores the correct
 * mimeType for every provider's actual output format.
 */
describe("guessImageMimeTypeFromUrl", () => {
  it("detects .jpeg/.jpg as image/jpeg (the kie_ai completion shape from the audit log)", () => {
    expect(
      guessImageMimeTypeFromUrl(
        "https://tempfile.aiquickdraw.com/vnp/c6d6e2882663efd830af322518f0d7ea_1783304775.jpeg",
      ),
    ).toBe("image/jpeg");
    expect(guessImageMimeTypeFromUrl("https://example.com/foo.jpg")).toBe("image/jpeg");
  });

  it("detects .png as image/png", () => {
    expect(guessImageMimeTypeFromUrl("https://example.com/foo.png")).toBe("image/png");
  });

  it("detects .webp and .gif", () => {
    expect(guessImageMimeTypeFromUrl("https://example.com/foo.webp")).toBe("image/webp");
    expect(guessImageMimeTypeFromUrl("https://example.com/foo.gif")).toBe("image/gif");
  });

  it("handles query strings after the extension", () => {
    expect(guessImageMimeTypeFromUrl("https://example.com/foo.png?token=abc&x=1")).toBe(
      "image/png",
    );
  });

  it("falls back to image/jpeg for an unrecognized/missing extension (most common provider output)", () => {
    expect(guessImageMimeTypeFromUrl("https://example.com/foo")).toBe("image/jpeg");
    expect(guessImageMimeTypeFromUrl("/uploads/some-file-no-ext")).toBe("image/jpeg");
  });

  it("handles relative MCP-transport-style paths (/uploads/, /api/storage/)", () => {
    expect(guessImageMimeTypeFromUrl("/uploads/character-portrait.png")).toBe("image/png");
    expect(guessImageMimeTypeFromUrl("/api/storage/abc123.jpeg")).toBe("image/jpeg");
  });
});
