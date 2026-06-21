import { describe, expect, it } from "vitest";

import { normalizeVideoSegmentCreativeBrief } from "../creativeBrief";

describe("normalizeVideoSegmentCreativeBrief", () => {
  it("returns undefined for blank input", () => {
    expect(normalizeVideoSegmentCreativeBrief("   ")).toBeUndefined();
  });

  it("keeps safe creative guidance", () => {
    expect(
      normalizeVideoSegmentCreativeBrief("Make the pacing warmer and more premium.")
    ).toMatchObject({
      normalizedText: "Make the pacing warmer and more premium.",
      warnings: [],
    });
  });

  it("warns when guidance conflicts with locked product or Thai audio policy", () => {
    const brief = normalizeVideoSegmentCreativeBrief(
      "Change the product and force native Thai speech."
    );

    expect(brief?.normalizedText).toContain("[locked instruction removed]");
    expect(brief?.warnings[0]?.source).toBe("creative_brief");
  });

  it("truncates long creative guidance instead of throwing a schema error", () => {
    const brief = normalizeVideoSegmentCreativeBrief("a".repeat(2_500));

    expect(brief?.text?.length).toBeLessThanOrEqual(2_000);
    expect(brief?.normalizedText?.length).toBeLessThanOrEqual(2_000);
    expect(brief?.warnings).toContainEqual(
      expect.objectContaining({
        code: "creative_brief_truncated_to_2000",
        source: "creative_brief",
      })
    );
  });
});
