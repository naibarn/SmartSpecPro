import { describe, expect, it } from "vitest";
import { resolveLocationCardThumbnailUrl } from "@/components/verticalDramaSeries/VerticalDramaLocationStockPanel";

/**
 * Unit coverage for `resolveLocationCardThumbnailUrl` — the thumbnail-
 * fallback resolver shared by the roster grid card and the detail view:
 * the durable APPROVED reference always wins over an in-session candidate
 * awaiting approval, so a stale candidate can never visually override an
 * already-approved reference after the roster refetches.
 */
describe("resolveLocationCardThumbnailUrl", () => {
  it("prefers the approved primaryReferenceUrl when both are present", () => {
    expect(
      resolveLocationCardThumbnailUrl(
        { primaryReferenceUrl: "https://cdn.example.com/approved.jpg" },
        "https://cdn.example.com/candidate.jpg",
      ),
    ).toBe("https://cdn.example.com/approved.jpg");
  });

  it("falls back to the session candidate when there is no approved reference yet", () => {
    expect(resolveLocationCardThumbnailUrl({}, "https://cdn.example.com/candidate.jpg")).toBe(
      "https://cdn.example.com/candidate.jpg",
    );
  });

  it("returns null when neither an approved reference nor a candidate exists", () => {
    expect(resolveLocationCardThumbnailUrl({})).toBeNull();
    expect(resolveLocationCardThumbnailUrl({}, null)).toBeNull();
    expect(resolveLocationCardThumbnailUrl({}, undefined)).toBeNull();
  });

  it("treats an empty-string primaryReferenceUrl as absent and falls through to the candidate", () => {
    expect(
      resolveLocationCardThumbnailUrl({ primaryReferenceUrl: "" }, "https://cdn.example.com/candidate.jpg"),
    ).toBe("https://cdn.example.com/candidate.jpg");
  });
});
