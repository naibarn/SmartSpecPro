import { describe, expect, it } from "vitest";
import { guessLocationImageMimeTypeFromUrl } from "@/components/verticalDramaSeries/VerticalDramaLocationStockPanel";

/**
 * Unit coverage for `guessLocationImageMimeTypeFromUrl` — a location-panel-
 * local duplicate of `VerticalDramaCharacterStockPanel.tsx`'s
 * `guessImageMimeTypeFromUrl` / `VerticalDramaStoryboardPanel.tsx`'s
 * `guessLocationImageMimeTypeFromUrl` (this feature's established
 * "duplicate small helpers, keep surfaces decoupled" convention). Same test
 * cases as `VerticalDramaCharacterStockPanel.guessImageMimeTypeFromUrl.test.ts`,
 * ported for this panel's own copy.
 */
describe("guessLocationImageMimeTypeFromUrl", () => {
  it("detects .jpeg/.jpg as image/jpeg", () => {
    expect(
      guessLocationImageMimeTypeFromUrl(
        "https://tempfile.aiquickdraw.com/vnp/c6d6e2882663efd830af322518f0d7ea_1783304775.jpeg",
      ),
    ).toBe("image/jpeg");
    expect(guessLocationImageMimeTypeFromUrl("https://example.com/foo.jpg")).toBe("image/jpeg");
  });

  it("detects .png as image/png", () => {
    expect(guessLocationImageMimeTypeFromUrl("https://example.com/foo.png")).toBe("image/png");
  });

  it("detects .webp and .gif", () => {
    expect(guessLocationImageMimeTypeFromUrl("https://example.com/foo.webp")).toBe("image/webp");
    expect(guessLocationImageMimeTypeFromUrl("https://example.com/foo.gif")).toBe("image/gif");
  });

  it("handles query strings after the extension", () => {
    expect(guessLocationImageMimeTypeFromUrl("https://example.com/foo.png?token=abc&x=1")).toBe(
      "image/png",
    );
  });

  it("falls back to image/jpeg for an unrecognized/missing extension (most common provider output)", () => {
    expect(guessLocationImageMimeTypeFromUrl("https://example.com/foo")).toBe("image/jpeg");
    expect(guessLocationImageMimeTypeFromUrl("/uploads/some-file-no-ext")).toBe("image/jpeg");
  });

  it("handles relative MCP-transport-style paths (/uploads/, /api/storage/)", () => {
    expect(guessLocationImageMimeTypeFromUrl("/uploads/location-establishing-plate.png")).toBe(
      "image/png",
    );
    expect(guessLocationImageMimeTypeFromUrl("/api/storage/abc123.jpeg")).toBe("image/jpeg");
  });
});
