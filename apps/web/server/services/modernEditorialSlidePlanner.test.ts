import { describe, expect, it } from "vitest";

import { normalizeRequest } from "../../skills/modern-editorial-slide/modern_editorial_slide_skill/src/normalize.mjs";
import { buildLayoutSpec } from "../../skills/modern-editorial-slide/modern_editorial_slide_skill/src/planner.mjs";

describe("modernEditorialSlidePlanner", () => {
  it("strips markdown decoration from numbered section slides and preserves body copy", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "คู่มือการนอนของทารก",
        language: "th",
        canvasRatio: "9:16",
        randomizeLayouts: false,
        pagination: {
          maxPages: 3,
        },
        content: {
          rawText: [
            "คู่มือการนอนของทารก",
            "",
            "1. **สร้างสภาพแวดล้อมที่เหมาะสม**",
            "ห้องนอนควรเงียบ แสงน้อย และอุณหภูมิสบายเพื่อให้ลูกนอนต่อเนื่องได้ดีขึ้น",
          ].join("\n"),
          pageIntentHint: "healthcare_steps",
          imagePool: {
            images: [
              {
                id: "hero-1",
                source: "https://cdn.example.com/hero-1.jpg",
                roleHint: "hero",
                priority: 5,
              },
            ],
          },
        },
      },
    });

    const layout = buildLayoutSpec(normalized);
    const contentSlide = layout.slides[0];
    const title = contentSlide.elements.find((element) => element.role === "title");
    const deck = contentSlide.elements.find((element) => element.role === "deck");
    const body = contentSlide.elements.find((element) => element.role === "body");

    expect(title?.text).toBe("คู่มือการนอนของทารก");
    expect(deck?.text).toBe("สร้างสภาพแวดล้อมที่เหมาะสม");
    expect(deck?.text).not.toContain("**");
    expect(deck?.text).not.toContain("•");
    expect(body?.text).toContain("ห้องนอนควรเงียบ");
  });

  it("uses visible image slots for workflow layouts so images are not repeated too early", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "Sleep Steps",
        language: "en",
        canvasRatio: "9:16",
        randomizeLayouts: false,
        pagination: {
          maxPages: 5,
        },
        content: {
          rawText: [
            "Sleep Steps",
            "",
            "1. **Observe cues**",
            "2. **Dim the room**",
            "3. **Reduce stimulation**",
            "",
            "1. **Start bath routine**",
            "2. **Read a short story**",
            "3. **Place baby down calm**",
            "",
            "1. **Feed earlier**",
            "2. **Burp gently**",
            "3. **Pause before refeeding**",
            "",
            "1. **Watch nap timing**",
            "2. **Keep wake windows steady**",
            "3. **End naps before bedtime**",
          ].join("\n"),
          pageIntentHint: "healthcare_steps",
          imagePool: {
            images: [
              { id: "img-1", source: "https://cdn.example.com/1.jpg", roleHint: "hero", priority: 5 },
              { id: "img-2", source: "https://cdn.example.com/2.jpg", roleHint: "hero", priority: 5 },
              { id: "img-3", source: "https://cdn.example.com/3.jpg", roleHint: "hero", priority: 5 },
              { id: "img-4", source: "https://cdn.example.com/4.jpg", roleHint: "hero", priority: 5 },
              { id: "img-5", source: "https://cdn.example.com/5.jpg", roleHint: "hero", priority: 5 },
            ],
            minImagesPerPage: 1,
            maxImagesPerPage: 3,
            reusePolicy: "avoid-repeat-until-used",
            selectionStrategy: "sequential",
            coverPageImagePolicy: "prefer-hero",
          },
        },
      },
    });

    const layout = buildLayoutSpec(normalized);
    const heroSources = layout.slides
      .map((slide) => slide.elements.find((element) => element.role === "hero")?.source)
      .filter((source): source is string => Boolean(source));

    expect(heroSources).toHaveLength(4);
    expect(new Set(heroSources).size).toBe(4);
  });

  it("keeps page-bound images and notes together when the request uses manual pages", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "คู่มือการนอนของทารก",
        language: "th",
        canvasRatio: "16:9",
        randomizeLayouts: false,
        pagination: {
          maxPages: 2,
        },
        content: {
          pages: [
            {
              titleHint: "สร้างสภาพแวดล้อมที่เหมาะสม",
              text: "สร้างสภาพแวดล้อมที่เหมาะสม\n\nห้องนอนควรเงียบ แสงน้อย และอุณหภูมิสบาย",
              imageSelectionMode: "manual-only",
              maxImagesOverride: 1,
              images: [
                {
                  id: "page-1-hero",
                  source: "https://cdn.example.com/page-1.jpg",
                  roleHint: "hero",
                  priority: 5,
                },
              ],
            },
            {
              titleHint: "จัดการการหลับกลางวัน",
              text: "จัดการการหลับกลางวัน\n\nควรหลีกเลี่ยงการให้เด็กนอนกลางวันมากเกินไป",
              imageSelectionMode: "manual-only",
              maxImagesOverride: 1,
              images: [
                {
                  id: "page-2-hero",
                  source: "https://cdn.example.com/page-2.jpg",
                  roleHint: "hero",
                  priority: 5,
                },
              ],
            },
          ],
        },
      },
    });

    const layout = buildLayoutSpec(normalized);
    const heroSources = layout.slides
      .map((slide) => slide.elements.find((element) => element.role === "hero")?.source);

    expect(heroSources).toEqual([
      "https://cdn.example.com/page-1.jpg",
      "https://cdn.example.com/page-2.jpg",
    ]);
    expect(layout.slides[0]?.notes).toContain("ห้องนอนควรเงียบ");
    expect(layout.slides[1]?.notes).toContain("ควรหลีกเลี่ยงการให้เด็กนอนกลางวันมากเกินไป");
  });

  it("does not duplicate the same narrative paragraph into both deck and body blocks", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "คู่มือการนอนของทารก",
        language: "th",
        canvasRatio: "4:5",
        randomizeLayouts: false,
        pagination: {
          maxPages: 1,
        },
        content: {
          pages: [
            {
              titleHint: "สร้างสภาพแวดล้อมที่เหมาะสม",
              text: "สร้างสภาพแวดล้อมที่เหมาะสม\n\nห้องนอนควรเงียบ แสงน้อย และอุณหภูมิสบายเพื่อให้ลูกนอนต่อเนื่องได้ดีขึ้น",
              forceArchetype: "title_hero_split",
              imageSelectionMode: "manual-only",
              images: [
                {
                  id: "page-1-hero",
                  source: "https://cdn.example.com/page-1.jpg",
                  roleHint: "hero",
                  priority: 5,
                },
              ],
            },
          ],
        },
      },
    });

    const layout = buildLayoutSpec(normalized);
    const textBlocks = layout.slides[0]?.elements
      .filter((element) => element.kind === "text")
      .map((element) => String(element.text ?? "").trim())
      .filter(Boolean) ?? [];
    const repeatedNarrative = textBlocks.filter((text) => text.includes("ห้องนอนควรเงียบ"));

    expect(repeatedNarrative).toHaveLength(1);
  });

  it("uses the lower half of portrait canvases for feature story layouts", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "Sleep Training",
        language: "en",
        canvasRatio: "4:5",
        randomizeLayouts: false,
        pagination: {
          maxPages: 1,
        },
        content: {
          pages: [
            {
              titleHint: "Understand the baby's needs",
              text: "Understand the baby's needs\n\nRead the cues, keep the room calm, and build a steady bedtime rhythm.",
              forceArchetype: "feature_story_panels",
              imageSelectionMode: "manual-only",
              images: [
                { id: "hero", source: "https://cdn.example.com/hero.jpg", roleHint: "hero", priority: 5 },
                { id: "support-1", source: "https://cdn.example.com/support-1.jpg", roleHint: "supporting", priority: 4 },
                { id: "support-2", source: "https://cdn.example.com/support-2.jpg", roleHint: "supporting", priority: 4 },
              ],
            },
          ],
        },
      },
    });

    const layout = buildLayoutSpec(normalized);
    const lowestElementEdge = layout.slides[0]?.elements.reduce((maxEdge, element) => {
      const y = Number(element.yPct ?? 0);
      const h = Number(element.hPct ?? 0);
      return Math.max(maxEdge, y + h);
    }, 0) ?? 0;

    expect(lowestElementEdge).toBeGreaterThanOrEqual(90);
  });
});
