import { describe, expect, it } from "vitest";

import { compileModernEditorialDeck } from "./modernEditorialSlideCompiler";

describe("modernEditorialSlideCompiler", () => {
  it("condenses low-density portrait decks into fewer pages when the content is too sparse", () => {
    const compilation = compileModernEditorialDeck({
      topic: "คู่มือการนอนทารก",
      canvasRatio: "9:16",
      maxPages: 5,
      pages: [
        { pageNumber: 1, titleHint: "บทนำ", text: "บทนำ\n\nเริ่มต้นทำความเข้าใจการนอนของทารก" },
        { pageNumber: 2, titleHint: "ความต้องการพื้นฐาน", text: "ความต้องการพื้นฐาน\n\nลูกต้องการความสม่ำเสมอ" },
        { pageNumber: 3, titleHint: "สภาพแวดล้อม", text: "สภาพแวดล้อม\n\nห้องควรสงบและมืดพอเหมาะ" },
        { pageNumber: 4, titleHint: "กิจวัตร", text: "กิจวัตร\n\nทำซ้ำอย่างอ่อนโยนทุกคืน" },
        { pageNumber: 5, titleHint: "สรุป", text: "สรุป\n\nสังเกตลูกและค่อย ๆ ปรับตามจริง" },
      ],
    });

    expect(compilation.pages.length).toBeLessThan(5);
    expect(compilation.warnings.join(" ")).toContain("Condensed");
  });

  it("upgrades sparse baby-sleep prose into a portrait strategy layout when bullets can be synthesized", () => {
    const compilation = compileModernEditorialDeck({
      topic: "คู่มือการนอนทารก",
      canvasRatio: "9:16",
      maxPages: 4,
      pages: [
        {
          pageNumber: 1,
          titleHint: "บทนำ",
          text: "บทนำ\n\nภาพรวมของคู่มือการนอนสำหรับทารกหกเดือน พร้อมหลักการเริ่มต้นที่สำคัญสำหรับผู้ปกครองมือใหม่ที่ต้องการจัดจังหวะการพักผ่อนให้ลูกอย่างค่อยเป็นค่อยไปและสม่ำเสมอ",
        },
        {
          pageNumber: 2,
          titleHint: "พื้นฐานการดูแล",
          text: "พื้นฐานการดูแล\n\nพ่อแม่ควรเริ่มจากการสังเกตสัญญาณง่วงและทำบรรยากาศให้สงบอย่างสม่ำเสมอ ควบคู่กับการจัดช่วงเวลากลางวันให้เหมาะสมและลดสิ่งกระตุ้นก่อนเข้านอน เพื่อให้ลูกรู้สึกปลอดภัยและคาดเดากิจวัตรได้",
        },
        {
          pageNumber: 3,
          titleHint: "จัดการกับการหลับกลางวัน",
          text: "จัดการกับการหลับกลางวัน\n\nการนอนหลับในช่วงเวลากลางวันมีผลต่อการนอนในเวลากลางคืน ควรหลีกเลี่ยงการให้นอนหลับมากเกินไปในระหว่างวัน โดยเฉพาะในช่วงใกล้เวลานอนกลางคืน เพราะอาจทำให้ทารกตื่นในตอนกลางคืนได้",
        },
        {
          pageNumber: 4,
          titleHint: "สรุปการเริ่มต้น",
          text: "สรุปการเริ่มต้น\n\nการฝึกทารกให้นอนยาวขึ้นควรทำอย่างนุ่มนวลและสม่ำเสมอ ใช้การสังเกตลูกเป็นหลัก และปรับตามบริบทของครอบครัวเพื่อให้ได้ผลที่ยั่งยืน",
        },
      ],
    });

    const targetPage = compilation.pages.find((page) => page.titleHint.includes("จัดการกับการหลับกลางวัน"));

    expect(["strategy_overview", "executive_summary"]).toContain(targetPage?.pageIntentHint);
    expect(["portrait_large_type", "title_hero_split", "two_column_editorial", "executive_summary_dashboard", "feature_story_panels"]).toContain(
      targetPage?.preferredArchetype,
    );
  });

  it("defaults sparse portrait prose pages to one recommended image instead of archetype-based multi-image counts", () => {
    const compilation = compileModernEditorialDeck({
      topic: "คู่มือการนอนทารก",
      canvasRatio: "9:16",
      maxPages: 4,
      pages: [
        {
          pageNumber: 1,
          titleHint: "บทนำ",
          text: "บทนำ\n\nภาพรวมสั้น ๆ ของแนวทางการจัดกิจวัตรการนอนสำหรับทารกวัยหกเดือน",
        },
        {
          pageNumber: 2,
          titleHint: "เข้าใจความต้องการของทารก",
          text: "เข้าใจความต้องการของทารก\n\nทารกวัยหกเดือนยังต้องการการดูแลอย่างใกล้ชิด แต่ก็เริ่มตอบสนองต่อกิจวัตรที่สม่ำเสมอมากขึ้น พ่อแม่ควรสังเกตสัญญาณง่วงและความต้องการพื้นฐานให้ชัดเจน",
        },
      ],
    });

    const strategyPage = compilation.pages.find((page) => page.titleHint.includes("เข้าใจความต้องการของทารก"));

    expect(strategyPage?.recommendedImageCount).toBe(1);
  });

  it("synthesizes the first page into a true editorial cover summary for multi-page decks", () => {
    const compilation = compileModernEditorialDeck({
      topic: "ทำความเข้าใจเรื่องการร้องไห้และการปรับจูนอารมณ์",
      canvasRatio: "9:16",
      maxPages: 5,
      pages: [
        {
          pageNumber: 1,
          titleHint: "ทำความเข้าใจเรื่องการร้องไห้และการปรับจูนอารมณ์",
          text: "ทำความเข้าใจเรื่องการร้องไห้และการปรับจูนอารมณ์\n\nแนวทางการปล่อยให้ทารกร้องไห้เพื่อฝึกกล่อมตัวเองให้นอน เป็นเรื่องที่ท้าทายความรู้สึกของพ่อแม่มาก",
        },
        {
          pageNumber: 2,
          titleHint: "ประเด็นสำคัญ",
          text: "ประเด็นสำคัญ\n\n• การร้องไห้ในช่วงนี้ ไม่ใช่การที่ลูกถูกทอดทิ้ง\n• ลูกกำลังเรียนรู้การจัดการอารมณ์\n• พ่อแม่ควรประเมินความพร้อมของตัวเองควบคู่ไปด้วย\n• การเข้าปลอบเป็นระยะเป็นทางเลือกที่ยอมรับได้",
        },
        {
          pageNumber: 3,
          titleHint: "สรุป",
          text: "สรุป\n\nเลือกแนวทางที่เหมาะกับใจของพ่อแม่และบริบทของลูก เพื่อให้การนอนค่อย ๆ ดีขึ้นอย่างยั่งยืน",
        },
      ],
    });

    const cover = compilation.pages[0];

    expect(cover?.pageIntentHint).toBe("editorial_cover");
    expect(cover?.preferredArchetype).toBe("editorial_cover_split");
    expect(cover?.compiledText).toContain("Key Points:");
    expect(cover?.compiledText).toContain("การร้องไห้ในช่วงนี้");
  });

  it("does not merge substantive portrait sections into slash-titled pages just to reduce page count", () => {
    const compilation = compileModernEditorialDeck({
      topic: "แนวทางการฝึกทารกหกเดือนให้นอนยาวและงดมื้อดึกอย่างเข้าใจ",
      canvasRatio: "9:16",
      maxPages: 9,
      pages: [
        {
          pageNumber: 1,
          titleHint: "แนวทางการฝึกทารกหกเดือนให้นอนยาวและงดมื้อดึกอย่างเข้าใจ",
          text: "แนวทางการฝึกทารกหกเดือนให้นอนยาวและงดมื้อดึกอย่างเข้าใจ\n\nการฝึกทารกให้นอนยาวขึ้นและหยุดมื้อดึกเป็นหนึ่งในขั้นตอนสำคัญที่ช่วยให้พ่อแม่สร้างนิสัยการนอนที่ดีได้อย่างค่อยเป็นค่อยไป",
        },
        {
          pageNumber: 2,
          titleHint: "เข้าใจความต้องการของทารก",
          text: "เข้าใจความต้องการของทารก\n\nทารกวัยหกเดือนยังต้องการการดูแลอย่างใกล้ชิด แต่ก็เริ่มมีความสามารถในการสร้างนิสัยการนอนเองได้ พ่อแม่จึงควรเข้าใจสัญญาณง่วง ความหิว และความต้องการพื้นฐานให้ชัดเจน",
        },
        {
          pageNumber: 3,
          titleHint: "สร้างสภาพแวดล้อมที่เหมาะสม",
          text: "สร้างสภาพแวดล้อมที่เหมาะสม\n\nสภาพแวดล้อมการนอนมีผลอย่างมากต่อคุณภาพการพักผ่อนของทารก ห้องควรสงบ มืดพอเหมาะ อุณหภูมิสบาย และลดสิ่งรบกวนที่อาจทำให้ลูกตื่นขึ้นระหว่างคืน",
        },
        {
          pageNumber: 4,
          titleHint: "กำหนดเวลานอนที่สม่ำเสมอ",
          text: "กำหนดเวลานอนที่สม่ำเสมอ\n\nการมีช่วงเวลาก่อนนอนที่ชัดเจนช่วยให้ลูกรู้ว่าใกล้เวลาพักผ่อนแล้ว ควรใช้กิจกรรมที่สงบ เช่น อาบน้ำ อ่านนิทาน หรือเปิดเพลงเบา ๆ เพื่อให้ร่างกายค่อย ๆ ผ่อนลง",
        },
        {
          pageNumber: 5,
          titleHint: "จัดการกับการหลับกลางวัน",
          text: "จัดการกับการหลับกลางวัน\n\nการงีบหลับช่วงกลางวันมีผลโดยตรงต่อการนอนกลางคืน หากงีบยาวหรือใกล้เวลานอนเกินไป อาจทำให้กลางคืนตื่นง่าย จึงควรรักษาสมดุลระหว่างการพักผ่อนและกิจกรรม",
        },
      ],
    });

    expect(compilation.pages.some((page) => page.titleHint.includes(" / "))).toBe(false);
    expect(compilation.pages.some((page) => page.titleHint.includes("สร้างสภาพแวดล้อมที่เหมาะสม"))).toBe(true);
    expect(compilation.pages.some((page) => page.titleHint.includes("กำหนดเวลานอนที่สม่ำเสมอ"))).toBe(true);
  });

  it("keeps portrait strategy pages on text-light archetypes when the overview copy is long", () => {
    const compilation = compileModernEditorialDeck({
      topic: "แนวทางการนอนของทารก",
      canvasRatio: "9:16",
      maxPages: 3,
      pages: [
        {
          pageNumber: 1,
          titleHint: "บทนำ",
          text: "บทนำ\n\nคู่มือเริ่มต้นสำหรับการฝึกทารกให้นอนอย่างอ่อนโยนและสม่ำเสมอ",
        },
        {
          pageNumber: 2,
          titleHint: "สร้างสภาพแวดล้อมที่เหมาะสม",
          text: "สร้างสภาพแวดล้อมที่เหมาะสม\n\nOverview: สภาพแวดล้อมการนอนมีความสำคัญมาก พ่อแม่ควรจัดเตรียมห้องนอนให้เป็นที่ร่ม เงียบสงบ และมีอุณหภูมิที่เหมาะสม พร้อมลดสิ่งกระตุ้นก่อนเข้านอนเพื่อช่วยให้ลูกพักผ่อนได้ต่อเนื่องมากขึ้น\n\nKey Points:\n• สภาพแวดล้อมการนอนมีความสำคัญมาก\n• พ่อแม่ควรจัดเตรียมห้องนอนให้เป็นที่ร่ม เงียบสงบ\n• ลดสิ่งกระตุ้นก่อนเข้านอน",
        },
      ],
    });

    const targetPage = compilation.pages.find((page) => page.titleHint.includes("สร้างสภาพแวดล้อมที่เหมาะสม"));

    expect(["portrait_large_type", "feature_story_panels", "title_hero_split", "executive_summary_dashboard"]).toContain(targetPage?.preferredArchetype);
    expect(targetPage?.compiledText).not.toContain("Overview:");
    expect(targetPage?.compiledText).not.toContain("Key Points:");
    expect((targetPage?.compiledText.match(/^•\s/mg) ?? []).length).toBeLessThanOrEqual(3);
  });

  it("compacts portrait case-study copy so detail pages do not carry oversized text blocks", () => {
    const compilation = compileModernEditorialDeck({
      topic: "แนวทางการนอนของทารก",
      canvasRatio: "9:16",
      maxPages: 2,
      pages: [
        {
          pageNumber: 1,
          titleHint: "บทนำ",
          text: "บทนำ\n\nคู่มือเริ่มต้นสำหรับการฝึกทารกให้นอนอย่างอ่อนโยนและสม่ำเสมอ",
        },
        {
          pageNumber: 2,
          titleHint: "สถานการณ์ที่น่าพิจารณา",
          text: "สถานการณ์ที่น่าพิจารณา\n\nContext: หากลูกน้อยยังคงตื่นบ่อย หรือมีปัญหาในการนอนหลับ ควรปรึกษากับแพทย์หรือผู้เชี่ยวชาญด้านการนอนเพื่อหาสาเหตุและแนวทางการจัดการที่เหมาะสม\n\nConsiderations:\n• หากลูกน้อยยังคงตื่นบ่อย หรือมีปัญหาในการนอนหลับ ควรปรึกษาผู้เชี่ยวชาญ\n• การฝึกการนอนต้องใช้ความเข้าใจและความสม่ำเสมอจากพ่อแม่\n\nRecommended Action: เริ่มจากประเมินสาเหตุหลักก่อน แล้วค่อยปรับแผนการนอนให้เหมาะสม",
        },
      ],
    });

    const targetPage = compilation.pages.find((page) => page.titleHint.includes("สถานการณ์ที่น่าพิจารณา"));
    const bulletLines = (targetPage?.compiledText.match(/^•\s/mg) ?? []).length;

    expect(targetPage?.pageIntentHint).toBe("case_study");
    expect(["portrait_large_type", "feature_story_panels", "title_hero_split"]).toContain(targetPage?.preferredArchetype);
    expect(bulletLines).toBeLessThanOrEqual(2);
    expect(targetPage?.compiledText.length ?? 0).toBeLessThan(420);
    expect(targetPage?.compiledText).not.toContain("Considerations:");
    expect(targetPage?.compiledText).not.toContain("Recommended Action:");
  });
});
