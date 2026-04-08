import { describe, expect, it } from "vitest";

import {
  applyPresentationSkillPayloadAdapter,
  mergePresentationSkillPayloadOverride,
} from "./presentationSkillPayloadAdapters";

describe("presentationSkillPayloadAdapters", () => {
  it("applies editorial-layout-planner defaults without forcing modern archetypes", () => {
    const adapted = applyPresentationSkillPayloadAdapter(
      {
        request: {
          projectTitle: "Baby sleep guide",
          language: "th",
          canvasRatio: "9:16",
          pagination: {
            maxPages: 6,
            allowFewerPages: false,
          },
          content: {
            pages: [
              {
                titleHint: "Cover",
                text: "บทนำสำหรับการฝึกลูกนอน",
              },
            ],
          },
        },
      } as any,
      {
        skillSlug: "editorial-layout-planner",
        topic: "Baby sleep guide",
        canvasRatio: "9:16",
        maxPages: 6,
      },
    ) as Record<string, any>;

    expect(adapted.request.designStyle).toBe("family-editorial");
    expect(adapted.request.randomizeLayouts).toBe(false);
    expect(adapted.request.pagination.allowFewerPages).toBe(false);
    expect(adapted.request.content.pages[0].pageIntentHint).toBe("editorial_cover");
    expect(adapted.request.content.pages[0].forceArchetype).toBeUndefined();
    expect(adapted.request.renderOptions.pptxFileName).toBe("baby-sleep-guide-editorial.pptx");
    expect(adapted.request.theme.roundedCorners).toBe(false);
  });

  it("allows safe top-level overrides for editorial-layout-planner payloads", () => {
    const merged = mergePresentationSkillPayloadOverride(
      {
        article_title: "Baby sleep guide",
        article_body: "Full article body",
        article_language: "en",
        page_size_or_ratio: "1080x1920",
        page_count_mode: "auto",
        image_assets: [],
        output_format: "render_manifest_json",
      } as any,
      JSON.stringify({
        page_count_mode: "fixed",
        requested_page_count: 7,
        global_style_prompt: "Custom style prompt",
      }),
    ) as Record<string, unknown>;

    expect(merged.page_count_mode).toBe("fixed");
    expect(merged.requested_page_count).toBe(7);
    expect(merged.global_style_prompt).toBe("Custom style prompt");
    expect(merged.output_format).toBe("render_manifest_json");
  });

  it("rejects unsupported override keys for editorial-layout-planner payloads", () => {
    expect(() => mergePresentationSkillPayloadOverride(
      {
        article_title: "Baby sleep guide",
        article_body: "Full article body",
        article_language: "en",
        page_size_or_ratio: "1080x1920",
        page_count_mode: "auto",
        image_assets: [],
        output_format: "render_manifest_json",
      } as any,
      JSON.stringify({
        unsupported_key: true,
      }),
    )).toThrow(/Unsupported override keys/);
  });

  it("rejects output_format changes for editorial-layout-planner payloads", () => {
    expect(() => mergePresentationSkillPayloadOverride(
      {
        article_title: "Baby sleep guide",
        article_body: "Full article body",
        article_language: "en",
        page_size_or_ratio: "1080x1920",
        page_count_mode: "auto",
        image_assets: [],
        output_format: "render_manifest_json",
      } as any,
      JSON.stringify({
        output_format: "pdf",
      }),
    )).toThrow(/output_format/);
  });
});
