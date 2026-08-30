import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  buildSourceDescriptionSuggestion,
  validateSourceReferenceUrl,
} from "../verticalDramaSourceIngestionService";

describe("vertical drama source ingestion", () => {
  it("rejects private and credential-bearing URLs", () => {
    expect(() =>
      validateSourceReferenceUrl("http://127.0.0.1/image.jpg")
    ).toThrow(TRPCError);
    expect(() =>
      validateSourceReferenceUrl("https://user:pass@example.com/a")
    ).toThrow(TRPCError);
    expect(
      validateSourceReferenceUrl("https://example.com/place").hostname
    ).toBe("example.com");
  });

  it("labels generated text as a suggestion and preserves profile intent", () => {
    const value = buildSourceDescriptionSuggestion({
      profileId: "restaurant_review",
      title: "เมนูและจานอาหาร",
      metadata: { price: 220 },
    });
    expect(value).toContain("คำแนะนำจากระบบ");
    expect(value).toContain("ราคา");
  });
});
