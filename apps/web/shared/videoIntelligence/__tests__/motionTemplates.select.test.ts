import { describe, expect, it } from "vitest";

import { MOTION_TEMPLATE_META, selectTemplatesFor } from "../motionTemplates";

describe("selectTemplatesFor", () => {
  it("filters by category", () => {
    const result = selectTemplatesFor({ categories: ["hero"] });
    expect(result).toEqual([MOTION_TEMPLATE_META.product_hero]);
  });

  it("filters by aspect ratio", () => {
    const result = selectTemplatesFor({ aspectRatio: "9:16" });
    const ids = result.map(meta => meta.id);
    expect(ids).toContain("product_hero");
    expect(ids).not.toContain("comparison_stage");
    expect(ids).not.toContain("data_flow");
    expect(ids).not.toContain("animated_chart_basic");
  });

  it("filters by duration window (min/maxDurationMs)", () => {
    const result = selectTemplatesFor({ durationMs: 1500 });
    expect(result).toEqual([MOTION_TEMPLATE_META.kinetic_typography]);
  });

  it("returns [] on no match", () => {
    expect(selectTemplatesFor({ categories: ["nonexistent_category"] })).toEqual([]);
    expect(selectTemplatesFor({ durationMs: -1 })).toEqual([]);
  });

  it("returns metadata objects (not builders)", () => {
    const result = selectTemplatesFor({ categories: ["hero"] });
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty("build");
    expect(result[0]).not.toHaveProperty("paramsSchema");
    expect(Object.keys(result[0]).sort()).toEqual(
      Object.keys(MOTION_TEMPLATE_META.product_hero).sort()
    );
  });
});
