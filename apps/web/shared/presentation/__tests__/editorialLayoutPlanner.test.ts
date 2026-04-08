import { describe, expect, it } from "vitest";

import {
  buildEditorialLayoutPlannerPayload,
  getEditorialPlannerPageSizeOrRatio,
  inferRecommendedEditorialPlannerPreset,
} from "../editorialLayoutPlanner";

describe("editorialLayoutPlanner shared helpers", () => {
  it("maps supported canvas ratios to explicit page sizes", () => {
    expect(getEditorialPlannerPageSizeOrRatio("9:16")).toBe("1080x1920");
    expect(getEditorialPlannerPageSizeOrRatio("4:5")).toBe("1080x1350");
    expect(getEditorialPlannerPageSizeOrRatio("5:4")).toBe("1350x1080");
    expect(getEditorialPlannerPageSizeOrRatio("16:9")).toBe("1920x1080");
  });

  it("recommends the mobile portrait preset for 9:16 topics", () => {
    const preset = inferRecommendedEditorialPlannerPreset({
      canvasRatio: "9:16",
      language: "th",
      topic: "แนวทางการนอนของทารก",
    });

    expect(preset.id).toBe("mobile_story_9x16");
  });

  it("builds payloads with fixed page count and mixed image assets", () => {
    const payload = buildEditorialLayoutPlannerPayload({
      articleTitle: "คู่มือการนอนของทารก",
      articleBody: "เนื้อหาบทความเต็ม",
      articleLanguage: "th",
      canvasRatio: "9:16",
      targetAudiencePreset: "parents",
      tonePreset: "premium_editorial",
      fitPreset: "image_forward",
      pageCountMode: "fixed",
      requestedPageCount: 7,
      globalStylePrompt: "Warm editorial photography, cozy nursery.",
      renderSafety: { safe_margin_px: 48, strict_no_overlap: true },
      pageFillRules: { target_occupancy_min: 0.8 },
      qualityOptimizer: { enable_layout_fitness_scoring: true },
      pageBriefs: [
        {
          page_number: 1,
          page_role: "cover",
          title_hint: "หน้าปก",
          text: "เนื้อหาหน้าปก",
        },
        {
          page_number: 2,
          page_role: "content",
          title_hint: "หน้าที่สอง",
          text: "เนื้อหาหน้าสอง",
        },
      ],
      imageAssets: [
        {
          asset_type: "image_prompt",
          label: "Cover hero",
          page_hint: 1,
          prompt: "A Thai mother holding her baby in a warm nursery with soft daylight.",
        },
        {
          asset_type: "uploaded_image",
          label: "Reference image",
          page_hint: 2,
          reference: "https://cdn.example.com/reference.png",
        },
      ],
    });

    expect(payload).toEqual(expect.objectContaining({
      article_title: "คู่มือการนอนของทารก",
      page_size_or_ratio: "1080x1920",
      page_count_mode: "fixed",
      requested_page_count: 7,
      global_style_prompt: "Warm editorial photography, cozy nursery.",
      page_briefs: [
        expect.objectContaining({
          page_number: 1,
          page_role: "cover",
          title_hint: "หน้าปก",
        }),
        expect.objectContaining({
          page_number: 2,
          page_role: "content",
          title_hint: "หน้าที่สอง",
        }),
      ],
      image_assets: [
        expect.objectContaining({
          asset_type: "image_prompt",
          label: "Cover hero",
          page_hint: 1,
        }),
        expect.objectContaining({
          asset_type: "uploaded_image",
          label: "Reference image",
          page_hint: 2,
          reference: "https://cdn.example.com/reference.png",
        }),
      ],
    }));
  });
});
