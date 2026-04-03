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
    expect((deck?.text ?? body?.text)).toBe("สร้างสภาพแวดล้อมที่เหมาะสม");
    expect(String(deck?.text ?? body?.text ?? "")).not.toContain("**");
    expect(String(deck?.text ?? body?.text ?? "")).not.toContain("•");
    expect(contentSlide.notes).toContain("ห้องนอนควรเงียบ");
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

  it("shrinks 9:16 title sizes when the title copy gets longer", () => {
    const shortLayout = buildLayoutSpec(normalizeRequest({
      request: {
        projectTitle: "Sleep Guide",
        language: "th",
        canvasRatio: "9:16",
        randomizeLayouts: false,
        content: {
          pages: [
            {
              titleHint: "เข้าใจทารก",
              text: "เข้าใจทารก\n\nOverview: ลูกน้อยต้องการการดูแลอย่างใกล้ชิด\n\nKey Points:\n• สังเกตสัญญาณง่วง\n• รักษาความสม่ำเสมอ",
              forceArchetype: "title_hero_split",
              imageSelectionMode: "manual-only",
              images: [{ id: "hero-short", source: "https://cdn.example.com/short.jpg", roleHint: "hero", priority: 5 }],
            },
          ],
        },
      },
    }));

    const longLayout = buildLayoutSpec(normalizeRequest({
      request: {
        projectTitle: "Sleep Guide",
        language: "th",
        canvasRatio: "9:16",
        randomizeLayouts: false,
        content: {
          pages: [
            {
              titleHint: "แนวทางการฝึกทารกหกเดือนให้นอนยาวและงดมื้อดึกอย่างเข้าใจสำหรับคุณพ่อคุณแม่ที่ต้องการสร้างกิจวัตรการนอนแบบค่อยเป็นค่อยไปและยั่งยืน",
              text: "แนวทางการฝึกทารกหกเดือนให้นอนยาวและงดมื้อดึกอย่างเข้าใจสำหรับคุณพ่อคุณแม่ที่ต้องการสร้างกิจวัตรการนอนแบบค่อยเป็นค่อยไปและยั่งยืน\n\nOverview: ลูกน้อยต้องการการดูแลอย่างใกล้ชิดและกิจวัตรที่คงที่มากขึ้นในช่วงวัยนี้เพื่อค่อย ๆ ฝึกการนอนยาวและลดการตื่นกลางคืน\n\nKey Points:\n• สังเกตสัญญาณง่วง\n• รักษาความสม่ำเสมอ\n• ลดสิ่งกระตุ้น",
              forceArchetype: "title_hero_split",
              imageSelectionMode: "manual-only",
              images: [{ id: "hero-long", source: "https://cdn.example.com/long.jpg", roleHint: "hero", priority: 5 }],
            },
          ],
        },
      },
    }));

    const shortTitle = shortLayout.slides[0]?.elements.find((element) => element.role === "title");
    const longTitle = longLayout.slides[0]?.elements.find((element) => element.role === "title");

    expect(Number(shortTitle?.fontSize ?? 0)).toBeGreaterThan(Number(longTitle?.fontSize ?? 0));
  });

  it("emits per-page planner debug metadata for artifact inspection", () => {
    const layout = buildLayoutSpec(normalizeRequest({
      request: {
        projectTitle: "Debug deck",
        language: "th",
        canvasRatio: "9:16",
        randomizeLayouts: false,
        content: {
          pages: [
            {
              titleHint: "หน้าแรก",
              text: "หน้าแรก\n\nOverview: ตัวอย่างสไลด์สำหรับตรวจ debug\n\nKey Points:\n• ข้อแรก\n• ข้อสอง",
              imageSelectionMode: "manual-only",
              images: [{ id: "hero-debug", source: "https://cdn.example.com/debug.jpg", roleHint: "hero", priority: 5 }],
            },
          ],
        },
      },
    }));

    expect(layout.meta?.debug?.pages).toHaveLength(1);
    expect(layout.meta?.debug?.pages?.[0]).toMatchObject({
      pageNumber: 1,
      intent: expect.any(String),
      selectedArchetype: expect.any(String),
      rejectedCandidates: expect.any(Array),
      initialLayout: {
        fontSizesByRole: expect.any(Object),
      },
      finalLayout: {
        fontSizesByRole: expect.any(Object),
      },
    });
  });

  it("respects intent priority over family ordering when selecting portrait editorial archetypes", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "คู่มือการปลอบทารก",
        language: "th",
        canvasRatio: "4:5",
        randomizeLayouts: false,
        pagination: {
          maxPages: 1,
        },
        content: {
          pages: [
            {
              titleHint: "ใช้เทคนิคการปลอบประโลม",
              pageIntentHint: "healthcare_steps",
              text: [
                "ใช้เทคนิคการปลอบประโลม",
                "",
                "Overview: เมื่อทารกตื่นกลางดึก เทคนิคการปลอบประโลมอย่างง่ายสามารถช่วยให้กลับไปนอนได้",
                "",
                "1. ลูบหลังเบา ๆ",
                "2. พูดคุยด้วยเสียงที่สงบ",
                "3. ลดการกระตุ้นก่อนกลับไปนอน",
              ].join("\n"),
              imageSelectionMode: "manual-only",
              images: [
                {
                  id: "hero",
                  source: "https://cdn.example.com/hero.jpg",
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

    expect(layout.slides[0]?.archetype).toBe("vertical_workflow_steps");
  });

  it("uses a distinct portrait-tall layout instead of reusing portrait-editorial coordinates", () => {
    const request = {
      request: {
        projectTitle: "Sleep Guide",
        language: "en",
        randomizeLayouts: false,
        pagination: {
          maxPages: 1,
        },
        content: {
          pages: [
            {
              titleHint: "Manage daytime naps",
              text: "Manage daytime naps\n\nWatch nap timing so daytime sleep supports nighttime rest instead of disrupting it.",
              forceArchetype: "feature_story_panels",
              imageSelectionMode: "manual-only",
              images: [
                {
                  id: "hero",
                  source: "https://cdn.example.com/hero.jpg",
                  roleHint: "hero",
                  priority: 5,
                },
              ],
            },
          ],
        },
      },
    };

    const portraitTall = buildLayoutSpec(
      normalizeRequest({
        ...request,
        request: {
          ...request.request,
          canvasRatio: "9:16",
        },
      }),
    );
    const portraitEditorial = buildLayoutSpec(
      normalizeRequest({
        ...request,
        request: {
          ...request.request,
          canvasRatio: "4:5",
        },
      }),
    );

    const tallHero = portraitTall.slides[0]?.elements.find((element) => element.role === "hero");
    const editorialHero = portraitEditorial.slides[0]?.elements.find((element) => element.role === "hero");
    const tallTitle = portraitTall.slides[0]?.elements.find((element) => element.role === "title");
    const editorialTitle = portraitEditorial.slides[0]?.elements.find((element) => element.role === "title");

    expect(tallHero?.hPct).not.toBe(editorialHero?.hPct);
    expect(tallHero?.yPct).not.toBe(editorialHero?.yPct);
    expect(tallTitle?.yPct).not.toBe(editorialTitle?.yPct);
    expect(tallTitle?.fontSize).not.toBe(editorialTitle?.fontSize);
  });

  it("falls back to a text-led portrait layout when summary content lacks explicit key points", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "คู่มือการนอนของทารก",
        language: "th",
        canvasRatio: "9:16",
        randomizeLayouts: false,
        pagination: {
          maxPages: 1,
        },
        content: {
          pages: [
            {
              titleHint: "สถานการณ์ที่น่าพิจารณา",
              pageIntentHint: "strategy_overview",
              text: [
                "สถานการณ์ที่น่าพิจารณา",
                "",
                "หากลูกยังคงตื่นบ่อย ควรปรึกษาผู้เชี่ยวชาญเพื่อประเมินสาเหตุและปรับแนวทางที่เหมาะสม",
              ].join("\n"),
              imageSelectionMode: "manual-only",
              images: [
                {
                  id: "hero",
                  source: "https://cdn.example.com/hero.jpg",
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

    expect(layout.slides[0]?.archetype).toBe("portrait_large_type");
  });

  it("does not choose stat_card_with_image for portrait strategy pages that are mostly prose", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "คู่มือการนอนของทารก",
        language: "th",
        canvasRatio: "9:16",
        randomizeLayouts: false,
        pagination: {
          maxPages: 1,
        },
        content: {
          pages: [
            {
              titleHint: "เข้าใจความต้องการของทารก",
              pageIntentHint: "strategy_overview",
              text: [
                "เข้าใจความต้องการของทารก",
                "",
                "Overview: ทารกในวัยหกเดือนยังต้องการการดูแลอย่างใกล้ชิด ขณะเดียวกันก็เริ่มมีความสามารถในการสร้างนิสัยการนอนเองได้ พ่อแม่จำเป็นต้องเข้าใจลักษณะการนอนและความต้องการพื้นฐานของทารก",
                "",
                "Key Points:",
                "• ทารกในวัยหกเดือนยังต้องการการดูแลอย่างใกล้ชิด",
              ].join("\n"),
              imageSelectionMode: "manual-only",
              images: [
                {
                  id: "hero",
                  source: "https://cdn.example.com/hero.jpg",
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
    const slide = layout.slides[0];

    expect(slide?.archetype).not.toBe("stat_card_with_image");
  });

  it("synthesizes supporting bullets from prose so portrait strategy pages can use richer summary layouts", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "คู่มือการนอนของทารก",
        language: "th",
        canvasRatio: "9:16",
        randomizeLayouts: false,
        pagination: {
          maxPages: 1,
        },
        content: {
          pages: [
            {
              titleHint: "เข้าใจความต้องการของทารก",
              pageIntentHint: "strategy_overview",
              text: [
                "เข้าใจความต้องการของทารก",
                "",
                "Overview: ทารกในวัยหกเดือนยังต้องการการดูแลอย่างใกล้ชิด ขณะเดียวกันก็เริ่มมีความสามารถในการสร้างนิสัยการนอนเองได้ พ่อแม่จำเป็นต้องเข้าใจลักษณะการนอนและความต้องการพื้นฐานของทารก",
                "",
                "Key Points:",
                "• ทารกในวัยหกเดือนยังต้องการการดูแลอย่างใกล้ชิด",
              ].join("\n"),
              imageSelectionMode: "manual-only",
              images: [
                {
                  id: "hero",
                  source: "https://cdn.example.com/hero.jpg",
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
    const debugPage = layout.meta.debug.pages[0];
    const slide = layout.slides[0];
    const bulletCount = slide?.elements.filter((element) => element.role === "bullet").length ?? 0;

    expect(debugPage?.structure.bulletCount).toBeGreaterThanOrEqual(3);
    expect(slide?.archetype).toBe("portrait_large_type");
    expect(bulletCount).toBeLessThanOrEqual(2);
  });

  it("gives long Thai 9:16 cover headlines more vertical room to avoid deck collisions", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "คู่มือการนอนของทารก",
        language: "th",
        canvasRatio: "9:16",
        randomizeLayouts: false,
        pagination: {
          maxPages: 1,
        },
        content: {
          pages: [
            {
              titleHint: "แนวทางการฝึกทารกหกเดือนให้นอนยาวและงดมื้อดึกอย่างเข้าใจ",
              pageIntentHint: "editorial_cover",
              forceArchetype: "editorial_cover_split",
              text: [
                "แนวทางการฝึกทารกหกเดือนให้นอนยาวและงดมื้อดึกอย่างเข้าใจ",
                "",
                "การฝึกทารกให้นอนยาวและหยุดมื้อดึกเป็นหนึ่งในขั้นตอนสำคัญที่ช่วยให้พ่อแม่สามารถสร้างนิสัยการนอนที่ดีให้กับลูกน้อยได้ เมื่อลูกน้อยมีอายุหกเดือน",
                "",
                "Key Points:",
                "• การฝึกทารกให้นอนยาวและหยุดมื้อดึกเป็นหนึ่งในขั้นตอนสำคัญ",
                "• ทารกในวัยหกเดือนยังต้องการการดูแลอย่างใกล้ชิด",
                "• สภาพแวดล้อมการนอนมีความสำคัญมาก",
                "• การกำหนดเวลานอนที่ชัดเจนและสม่ำเสมอช่วยให้ทารกรู้สึกปลอดภัย",
              ].join("\n"),
              imageSelectionMode: "manual-only",
              images: [
                {
                  id: "hero",
                  source: "https://cdn.example.com/hero.jpg",
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
    const title = layout.slides[0]?.elements.find((element) => element.role === "title");
    const deck = layout.slides[0]?.elements.find((element) => element.role === "deck");
    const hero = layout.slides[0]?.elements.find((element) => element.role === "hero");

    expect(Number(title?.fontSize ?? 0)).toBeLessThanOrEqual(36);
    expect(Number(title?.hPct ?? 0)).toBeGreaterThanOrEqual(18);
    expect(Number(deck?.yPct ?? 0)).toBeGreaterThanOrEqual(18);
    expect(Number(hero?.yPct ?? 0)).toBeLessThanOrEqual(34);
  });

  it("prefers the portrait summary dashboard over two-column editorial for synthetic-only strategy structure", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "คู่มือการนอนของทารก",
        language: "th",
        canvasRatio: "9:16",
        randomizeLayouts: false,
        pagination: {
          maxPages: 1,
        },
        content: {
          pages: [
            {
              titleHint: "เข้าใจความต้องการของทารก",
              pageIntentHint: "strategy_overview",
              text: [
                "เข้าใจความต้องการของทารก",
                "",
                "Overview: ทารกในวัยหกเดือนยังต้องการการดูแลอย่างใกล้ชิด ขณะเดียวกันก็เริ่มมีความสามารถในการสร้างนิสัยการนอนเองได้ พ่อแม่จำเป็นต้องเข้าใจลักษณะการนอนและความต้องการพื้นฐานของทารก",
                "",
                "Key Points:",
                "• ทารกในวัยหกเดือนยังต้องการการดูแลอย่างใกล้ชิด",
              ].join("\n"),
              imageSelectionMode: "manual-only",
              images: [{ id: "hero", source: "https://cdn.example.com/hero.jpg", roleHint: "hero", priority: 5 }],
            },
          ],
        },
      },
    });

    const layout = buildLayoutSpec(normalized);
    const debugPage = layout.meta.debug.pages[0];

    expect(layout.slides[0]?.archetype).toBe("portrait_large_type");
    expect(debugPage?.candidateScores?.[0]?.archetype).toBe("portrait_large_type");
  });

  it("uses the dedicated portrait large-type layout for long 9:16 narrative pages", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "คู่มือการนอนของทารก",
        language: "th",
        canvasRatio: "9:16",
        randomizeLayouts: false,
        pagination: {
          maxPages: 1,
        },
        content: {
          pages: [
            {
              titleHint: "เข้าใจความต้องการของทารก",
              pageIntentHint: "strategy_overview",
              text: [
                "เข้าใจความต้องการของทารก",
                "",
                "ทารกในวัยหกเดือนยังต้องการการดูแลอย่างใกล้ชิด ขณะเดียวกันก็เริ่มมีความสามารถในการสร้างนิสัยการนอนเองได้ พ่อแม่จึงควรสังเกตสัญญาณง่วงและค่อย ๆ วางกิจวัตรที่ทำซ้ำได้ทุกคืน",
                "",
                "• สังเกตสัญญาณง่วง",
                "• ทำบรรยากาศให้สงบ",
              ].join("\n"),
              imageSelectionMode: "manual-only",
              images: [{ id: "hero", source: "https://cdn.example.com/hero.jpg", roleHint: "hero", priority: 5 }],
            },
          ],
        },
      },
    });

    const layout = buildLayoutSpec(normalized);
    const slide = layout.slides[0];
    const hero = slide?.elements.find((element) => element.role === "hero");
    const body = slide?.elements.find((element) => element.role === "body");
    const sectionHeading = slide?.elements.find((element) => element.role === "sectionHeading");

    expect(slide?.archetype).toBe("portrait_large_type");
    expect(slide?.elements.some((element) => element.role === "summaryPanel")).toBe(false);
    expect(sectionHeading).toBeUndefined();
    expect(Number(hero?.yPct ?? 0)).toBeGreaterThanOrEqual(31);
    expect(Number(body?.fontSize ?? 0)).toBeGreaterThanOrEqual(16);
    expect(Number(body?.wPct ?? 0)).toBeGreaterThanOrEqual(80);
  });

  it("renders wider readable stat cards when stat_card_with_image is explicitly used on 9:16", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "คู่มือการนอนของทารก",
        language: "th",
        canvasRatio: "9:16",
        randomizeLayouts: false,
        pagination: {
          maxPages: 1,
        },
        content: {
          pages: [
            {
              titleHint: "กำหนดเวลานอนที่สม่ำเสมอ",
              forceArchetype: "stat_card_with_image",
              text: [
                "กำหนดเวลานอนที่สม่ำเสมอ",
                "",
                "Overview: การกำหนดเวลานอนที่ชัดเจนช่วยให้ทารกรู้สึกปลอดภัยและรู้ว่าเมื่อไหร่ควรเริ่มพักผ่อน",
                "",
                "Key Points:",
                "• ทำกิจวัตรก่อนนอนให้คล้ายกันทุกคืน",
                "• ลดสิ่งกระตุ้นก่อนเข้านอน",
                "• ทำต่อเนื่องเพื่อให้ลูกคุ้นเคย",
              ].join("\n"),
              imageSelectionMode: "manual-only",
              images: [
                {
                  id: "hero",
                  source: "https://cdn.example.com/hero.jpg",
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
    const slide = layout.slides[0];
    const statCards = slide?.elements.filter((element) => element.role === "statCard") ?? [];
    const statBodies = slide?.elements.filter((element) => element.role === "statBody") ?? [];

    expect(slide?.archetype).toBe("stat_card_with_image");
    expect(statCards.length).toBeGreaterThanOrEqual(2);
    expect(Number(statCards[0]?.wPct ?? 0)).toBeGreaterThanOrEqual(38);
    expect(Number(statBodies[0]?.fontSize ?? 0)).toBeGreaterThanOrEqual(12);
  });

  it("uses a dedicated portrait summary card layout for 9:16 executive summaries", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "คู่มือการนอนของทารก",
        language: "th",
        canvasRatio: "9:16",
        randomizeLayouts: false,
        pagination: {
          maxPages: 1,
        },
        content: {
          pages: [
            {
              titleHint: "กำหนดเวลานอนที่สม่ำเสมอ",
              forceArchetype: "executive_summary_dashboard",
              text: [
                "กำหนดเวลานอนที่สม่ำเสมอ",
                "",
                "Overview: การกำหนดเวลานอนที่ชัดเจนช่วยให้ลูกรู้ว่าควรเริ่มพักผ่อนเมื่อใด",
                "",
                "Key Points:",
                "• ทำกิจวัตรก่อนนอนให้คล้ายกันทุกคืน",
                "• ลดสิ่งกระตุ้นก่อนเข้านอน",
                "• ทำต่อเนื่องเพื่อให้ลูกคุ้นเคย",
              ].join("\n"),
              imageSelectionMode: "manual-only",
              images: [
                {
                  id: "hero",
                  source: "https://cdn.example.com/hero.jpg",
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
    const slide = layout.slides[0];
    const bulletCount = slide?.elements.filter((element) => element.role === "bullet").length ?? 0;
    const lowestElementEdge = slide?.elements.reduce((maxEdge, element) => {
      const y = Number(element.yPct ?? 0);
      const h = Number(element.hPct ?? 0);
      return Math.max(maxEdge, y + h);
    }, 0) ?? 0;

    expect(slide?.archetype).toBe("executive_summary_dashboard");
    expect(slide?.elements.some((element) => element.role === "summaryPanel")).toBe(true);
    expect(bulletCount).toBeGreaterThanOrEqual(3);
    expect(lowestElementEdge).toBeGreaterThanOrEqual(86);
  });

  it("allows 9:16 strategy overview pages to select the portrait summary dashboard without forcing the archetype", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "คู่มือการนอนของทารก",
        language: "th",
        canvasRatio: "9:16",
        randomizeLayouts: false,
        pagination: {
          maxPages: 1,
        },
        content: {
          pages: [
            {
              titleHint: "สร้างสภาพแวดล้อมที่เหมาะสม",
              pageIntentHint: "strategy_overview",
              text: [
                "สร้างสภาพแวดล้อมที่เหมาะสม",
                "",
                "Overview: สภาพแวดล้อมการนอนมีผลต่อการพักผ่อนของทารกอย่างมาก",
                "",
                "Key Points:",
                "• ห้องควรสงบและแสงไม่แรง",
                "• อุณหภูมิควรสบาย",
                "• ลดสิ่งรบกวนก่อนเข้านอน",
              ].join("\n"),
              imageSelectionMode: "manual-only",
              maxImagesOverride: 1,
              images: [
                {
                  id: "hero",
                  source: "https://cdn.example.com/hero.jpg",
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
    const slide = layout.slides[0];

    expect(slide?.archetype).toBe("executive_summary_dashboard");
    expect(slide?.elements.some((element) => element.role === "summaryPanel")).toBe(true);
    expect(slide?.elements.some((element) => element.role === "hero")).toBe(true);
  });

  it("uses a taller hero and larger body text for sparse 9:16 title hero pages", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "คู่มือการนอนของทารก",
        language: "th",
        canvasRatio: "9:16",
        randomizeLayouts: false,
        pagination: {
          maxPages: 1,
        },
        content: {
          pages: [
            {
              titleHint: "จัดการกับการหลับกลางวัน",
              forceArchetype: "title_hero_split",
              text: [
                "จัดการกับการหลับกลางวัน",
                "",
                "การนอนหลับในช่วงเวลากลางวันมีผลต่อการนอนกลางคืน ควรหลีกเลี่ยงการให้นอนใกล้เวลานอนมากเกินไป",
              ].join("\n"),
              imageSelectionMode: "manual-only",
              images: [
                {
                  id: "hero",
                  source: "https://cdn.example.com/hero.jpg",
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
    const slide = layout.slides[0];
    const hero = slide?.elements.find((element) => element.role === "hero");
    const body = slide?.elements.find((element) => element.role === "body");

    expect(slide?.archetype).toBe("title_hero_split");
    expect(hero?.hPct).toBeGreaterThanOrEqual(42);
    expect(hero?.yPct).toBeGreaterThanOrEqual(38);
    expect(body?.fontSize).toBeGreaterThanOrEqual(17);
  });

  it("expands portrait large-type heroes when the page copy is sparse", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "คู่มือการนอนของทารก",
        language: "th",
        canvasRatio: "9:16",
        randomizeLayouts: false,
        pagination: {
          maxPages: 2,
        },
        content: {
          pages: [
            {
              titleHint: "หน้าเกริ่น",
              pageIntentHint: "strategy_overview",
              text: [
                "หน้าเกริ่น",
                "",
                "ภาพรวมสั้น ๆ ของการดูแลการนอน",
                "",
                "• ทำให้ห้องสงบ",
                "• รักษาความสม่ำเสมอ",
              ].join("\n"),
              imageSelectionMode: "manual-only",
              images: [{ id: "hero-a", source: "https://cdn.example.com/hero-a.jpg", roleHint: "hero", priority: 5 }],
            },
            {
              titleHint: "จัดการกับการหลับกลางวัน",
              pageIntentHint: "strategy_overview",
              text: [
                "จัดการกับการหลับกลางวัน",
                "",
                "การนอนกลางวันมีผลต่อการนอนกลางคืน...",
              ].join("\n"),
              imageSelectionMode: "manual-only",
              images: [{ id: "hero-b", source: "https://cdn.example.com/hero-b.jpg", roleHint: "hero", priority: 5 }],
            },
          ],
        },
      },
    });

    const layout = buildLayoutSpec(normalized);
    const sparseSlide = layout.slides[1];
    const hero = sparseSlide?.elements.find((element) => element.role === "hero");

    expect(sparseSlide?.archetype).toBe("portrait_large_type");
    expect(Number(hero?.hPct ?? 0)).toBeGreaterThanOrEqual(22);
  });

  it("renders a key points card for 9:16 title hero pages when summary bullets are available", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "คู่มือการนอนของทารก",
        language: "th",
        canvasRatio: "9:16",
        randomizeLayouts: false,
        pagination: {
          maxPages: 1,
        },
        content: {
          pages: [
            {
              titleHint: "เข้าใจความต้องการของทารก",
              forceArchetype: "title_hero_split",
              text: [
                "เข้าใจความต้องการของทารก",
                "",
                "Overview: ทารกวัยหกเดือนยังต้องการการดูแลอย่างใกล้ชิด แต่ก็เริ่มมีความสามารถในการสร้างนิสัยการนอนเองได้",
                "",
                "Key Points:",
                "• สังเกตสัญญาณง่วงให้เร็วขึ้น",
                "• รักษาความสม่ำเสมอของกิจวัตร",
                "• ลดสิ่งกระตุ้นก่อนเข้านอน",
              ].join("\n"),
              imageSelectionMode: "manual-only",
              images: [
                {
                  id: "hero",
                  source: "https://cdn.example.com/hero.jpg",
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
    const slide = layout.slides[0];
    const bulletCount = slide?.elements.filter((element) => element.role === "bullet").length ?? 0;

    expect(slide?.archetype).toBe("title_hero_split");
    expect(slide?.elements.some((element) => element.role === "summaryPanel")).toBe(true);
    expect(bulletCount).toBeGreaterThanOrEqual(3);
  });

  it("uses deterministic portrait variation so consecutive 9:16 strategy slides do not keep the hero in the same centered slot", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "คู่มือการนอนของทารก",
        language: "th",
        canvasRatio: "9:16",
        randomizeLayouts: false,
        pagination: {
          maxPages: 2,
        },
        content: {
          pages: [
            {
              titleHint: "เข้าใจความต้องการของทารก",
              pageIntentHint: "strategy_overview",
              text: [
                "เข้าใจความต้องการของทารก",
                "",
                "Overview: ทารกวัยหกเดือนยังต้องการการดูแลอย่างใกล้ชิด แต่ก็เริ่มมีความสามารถในการสร้างนิสัยการนอนเองได้",
                "",
                "Key Points:",
                "• สังเกตสัญญาณง่วงให้เร็วขึ้น",
                "• รักษาความสม่ำเสมอของกิจวัตร",
                "• ลดสิ่งกระตุ้นก่อนเข้านอน",
              ].join("\n"),
              imageSelectionMode: "manual-only",
              images: [{ id: "hero-1", source: "https://cdn.example.com/hero-1.jpg", roleHint: "hero", priority: 5 }],
            },
            {
              titleHint: "สร้างสภาพแวดล้อมที่เหมาะสม",
              pageIntentHint: "strategy_overview",
              text: [
                "สร้างสภาพแวดล้อมที่เหมาะสม",
                "",
                "Overview: ห้องนอนที่สงบ แสงน้อย และอุณหภูมิพอดีจะช่วยให้ลูกหลับลึกขึ้น",
                "",
                "Key Points:",
                "• ลดสิ่งรบกวน",
                "• ใช้ม่านทึบแสง",
                "• คุมอุณหภูมิให้สบาย",
              ].join("\n"),
              imageSelectionMode: "manual-only",
              images: [{ id: "hero-2", source: "https://cdn.example.com/hero-2.jpg", roleHint: "hero", priority: 5 }],
            },
          ],
        },
      },
    });

    const layout = buildLayoutSpec(normalized);
    const firstHero = layout.slides[0]?.elements.find((element) => element.role === "hero");
    const secondHero = layout.slides[1]?.elements.find((element) => element.role === "hero");

    expect(firstHero).toBeTruthy();
    expect(secondHero).toBeTruthy();
    expect(Number(firstHero?.yPct ?? 0)).not.toBe(Number(secondHero?.yPct ?? 0));
  });

  it("promotes synthesized summary structure into planner debug counts for portrait strategy pages", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "คู่มือการนอนของทารก",
        language: "th",
        canvasRatio: "9:16",
        randomizeLayouts: false,
        pagination: {
          maxPages: 1,
        },
        content: {
          pages: [
            {
              titleHint: "เข้าใจความต้องการของทารก",
              pageIntentHint: "strategy_overview",
              text: [
                "เข้าใจความต้องการของทารก",
                "",
                "Overview: ทารกในวัยหกเดือนยังต้องการการดูแลอย่างใกล้ชิด ขณะเดียวกันก็เริ่มมีความสามารถในการสร้างนิสัยการนอนเองได้ พ่อแม่จำเป็นต้องเข้าใจลักษณะการนอนและความต้องการพื้นฐานของทารก",
                "",
                "Key Points:",
                "• ทารกในวัยหกเดือนยังต้องการการดูแลอย่างใกล้ชิด",
              ].join("\n"),
              imageSelectionMode: "manual-only",
              images: [{ id: "hero", source: "https://cdn.example.com/hero.jpg", roleHint: "hero", priority: 5 }],
            },
          ],
        },
      },
    });

    const layout = buildLayoutSpec(normalized);
    const debugPage = layout.meta.debug.pages[0];

    expect(debugPage?.structure.bulletCount).toBeGreaterThanOrEqual(3);
    expect(debugPage?.rejectedCandidates.some((item) => item.archetype === "stat_card_with_image")).toBe(true);
  });

  it("synthesizes portrait summary structure from prose-only strategy pages without falling back to dense dashboards", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "คู่มือการนอนของทารก",
        language: "th",
        canvasRatio: "9:16",
        randomizeLayouts: false,
        pagination: {
          maxPages: 2,
        },
        content: {
          pages: [
            {
              titleHint: "เข้าใจความต้องการของทารก",
              pageIntentHint: "strategy_overview",
              text: [
                "เข้าใจความต้องการของทารก",
                "",
                "Overview: ทารกในวัยหกเดือนยังต้องการการดูแลอย่างใกล้ชิด ขณะเดียวกันก็เริ่มมีความสามารถในการสร้างนิสัยการนอนเองได้ พ่อแม่จำเป็นต้องเข้าใจลักษณะการนอนและความต้องการพื้นฐานของทารก",
              ].join("\n"),
              imageSelectionMode: "manual-only",
              images: [{ id: "hero-1", source: "https://cdn.example.com/hero-1.jpg", roleHint: "hero", priority: 5 }],
            },
            {
              titleHint: "สร้างสภาพแวดล้อมที่เหมาะสม",
              pageIntentHint: "strategy_overview",
              text: [
                "สร้างสภาพแวดล้อมที่เหมาะสม",
                "",
                "Overview: ห้องนอนที่สงบ แสงน้อย และอุณหภูมิพอดีจะช่วยให้ลูกหลับลึกขึ้น พ่อแม่ควรลดสิ่งรบกวน ใช้ม่านทึบแสง และดูแลบรรยากาศให้สม่ำเสมอ",
              ].join("\n"),
              imageSelectionMode: "manual-only",
              images: [{ id: "hero-2", source: "https://cdn.example.com/hero-2.jpg", roleHint: "hero", priority: 5 }],
            },
          ],
        },
      },
    });

    const layout = buildLayoutSpec(normalized);
    const firstDebugPage = layout.meta.debug.pages[0];
    const secondDebugPage = layout.meta.debug.pages[1];
    const firstHero = layout.slides[0]?.elements.find((element) => element.role === "hero");
    const secondHero = layout.slides[1]?.elements.find((element) => element.role === "hero");

    expect(firstDebugPage?.structure.bulletCount).toBeGreaterThanOrEqual(3);
    expect(secondDebugPage?.structure.bulletCount).toBeGreaterThanOrEqual(3);
    expect(firstDebugPage?.selectedArchetype).not.toBe("stat_card_with_image");
    expect(secondDebugPage?.selectedArchetype).not.toBe("stat_card_with_image");
    expect(firstDebugPage?.selectedArchetype).toBe("portrait_large_type");
    expect(secondDebugPage?.selectedArchetype).toBe("portrait_large_type");
    expect(firstHero?.source).not.toBe(secondHero?.source);
    expect(Number(firstHero?.hPct ?? 0)).toBeGreaterThanOrEqual(14);
    expect(Number(secondHero?.hPct ?? 0)).toBeGreaterThanOrEqual(14);
  });

  it("keeps the first auto-split page as an editorial cover instead of applying a global page intent to every page", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "Thai Sleep Training Guide",
        language: "th",
        canvasRatio: "9:16",
        randomizeLayouts: false,
        pagination: {
          maxPages: 5,
        },
        content: {
          titleHint: "ทำความเข้าใจเรื่องการร้องไห้และการปรับจูนอารมณ์",
          rawText: [
            "ทำความเข้าใจเรื่องการร้องไห้และการปรับจูนอารมณ์",
            "",
            "แนวทางการปล่อยให้ทารกร้องไห้เพื่อฝึกกล่อมตัวเองให้นอน เป็นเรื่องที่ท้าทายความรู้สึกของคุณพ่อคุณแม่มากที่สุด",
            "• การร้องไห้ในช่วงนี้ ไม่ใช่การที่ลูกถูกทอดทิ้ง",
            "• ลูกกำลังเรียนรู้การจัดการอารมณ์",
            "• พ่อแม่ควรประเมินความพร้อมของตัวเองควบคู่ไปด้วย",
            "• การเข้าปลอบเป็นระยะเป็นทางเลือกที่ยอมรับได้",
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
    const firstSlide = layout.slides[0];

    expect(firstSlide?.intent).toBe("editorial_cover");
    expect(firstSlide?.archetype).toBe("editorial_cover_split");
    expect(firstSlide?.editorialStructure?.deck).toContain("แนวทางการปล่อยให้ทารกร้องไห้");
  });

  it("uses a dedicated 9:16 editorial cover layout with a centered headline and key points card", () => {
    const normalized = normalizeRequest({
      request: {
        projectTitle: "Thai Sleep Training Guide",
        language: "th",
        canvasRatio: "9:16",
        randomizeLayouts: false,
        pagination: {
          maxPages: 1,
        },
        content: {
          pages: [
            {
              titleHint: "ทำความเข้าใจเรื่องการร้องไห้และการปรับจูนอารมณ์",
              forceArchetype: "editorial_cover_split",
              text: [
                "ทำความเข้าใจเรื่องการร้องไห้และการปรับจูนอารมณ์",
                "",
                "แนวทางการปล่อยให้ทารกร้องไห้เพื่อฝึกกล่อมตัวเองให้นอน เป็นเรื่องที่ท้าทายความรู้สึกของคุณพ่อคุณแม่มากที่สุด",
                "",
                "Key Points:",
                "• การร้องไห้ในช่วงนี้ ไม่ใช่การที่ลูกถูกทอดทิ้ง",
                "• ลูกกำลังเรียนรู้การจัดการอารมณ์",
                "• พ่อแม่ควรประเมินความพร้อมของตัวเองควบคู่ไปด้วย",
                "• การเข้าปลอบเป็นระยะเป็นทางเลือกที่ยอมรับได้",
              ].join("\n"),
              imageSelectionMode: "manual-only",
              images: [
                {
                  id: "hero",
                  source: "https://cdn.example.com/hero.jpg",
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
    const slide = layout.slides[0];
    const title = slide?.elements.find((element) => element.role === "title");
    const sectionHeading = slide?.elements.find((element) => element.role === "sectionHeading");
    const bullets = slide?.elements.filter((element) => element.role === "bullet") ?? [];

    expect(slide?.archetype).toBe("editorial_cover_split");
    expect(title?.align).toBe("center");
    expect(Number(title?.fontSize ?? 0)).toBeGreaterThanOrEqual(30);
    expect(sectionHeading?.text).toBe("Key Points");
    expect(bullets).toHaveLength(4);
  });

});
