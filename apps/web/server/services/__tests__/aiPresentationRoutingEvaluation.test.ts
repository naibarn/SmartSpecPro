import { describe, expect, it } from "vitest";

import type { AIPresentationSlide } from "@shared/presentation/aiTypes";
import { PRESENTATION_COMPONENT_LAYOUT_FAMILIES } from "@shared/presentation/componentRecipes";
import { buildPresentationComponentRecipeSlotBindings } from "@shared/presentation/componentRecipeSlotBindings";
import { evaluatePresentationRecipeSlotFit } from "@shared/presentation/recipeCompaction";

import { evaluateDraftSlideRouting } from "../aiPresentationService";

function toNarrativeInput(slide: AIPresentationSlide) {
  return {
    title: slide.title,
    body: slide.body,
    ...(slide.notes ? { notes: slide.notes } : {}),
    ...(slide.sections?.length ? { sections: slide.sections } : {}),
    ...(slide.graphicCategory ? { graphicCategory: slide.graphicCategory } : {}),
  };
}

describe("aiPresentationRoutingEvaluation", () => {
  it("routes dense single-thread Thai article copy into article-focus with better fit than compact candidates", () => {
    const slide: AIPresentationSlide = {
      templateId: "split_right_image",
      title: "ทำไมกิจวัตรก่อนนอนจึงช่วยให้เด็กนอนง่ายขึ้น",
      body: [
        "กิจวัตรก่อนนอนที่ทำซ้ำในลำดับเดิมทุกคืนช่วยให้เด็กเล็กค่อย ๆ รับรู้ว่าสัญญาณของการพักผ่อนกำลังเริ่มขึ้น และลดการต่อต้านก่อนนอนได้ดีกว่าการเปลี่ยนกิจกรรมแบบไม่สม่ำเสมอ",
        "ผู้ดูแลควรเลือกกิจกรรมเพียงไม่กี่อย่าง เช่น อาบน้ำ อ่านนิทาน และหรี่ไฟ แล้วทำในช่วงเวลาใกล้เคียงกันทุกวันเพื่อให้ร่างกายและอารมณ์ของเด็กคาดเดาได้",
        "หากเด็กยังตื่นบ่อยในเวลากลางคืน การปรับกิจวัตรตอนเย็นให้สงบลงและสม่ำเสมอมากขึ้นมักช่วยลดสิ่งกระตุ้นที่รบกวนการนอนได้",
      ],
      notes: "บทความนี้ต้องการพื้นที่เล่าเรื่องแบบต่อเนื่อง ไม่ใช่บล็อกสั้นหรือโปสเตอร์โปรโมชัน",
      graphicCategory: "Education",
    };

    const evaluation = evaluateDraftSlideRouting({ slide, slideIndex: 2 });
    expect(evaluation.selection.componentRecipeId).toBe("article-focus");

    const selectedBindings = buildPresentationComponentRecipeSlotBindings(
      "article-focus",
      toNarrativeInput(slide),
    );
    const selectedFit = evaluatePresentationRecipeSlotFit("article-focus", selectedBindings);
    const compactCandidate = evaluation.selection.candidateRecipes.find(
      (candidate) => PRESENTATION_COMPONENT_LAYOUT_FAMILIES[candidate.recipeId] === "compact",
    );

    expect(compactCandidate).toBeTruthy();
    const compactBindings = buildPresentationComponentRecipeSlotBindings(
      compactCandidate!.recipeId,
      toNarrativeInput(slide),
    );
    const compactFit = evaluatePresentationRecipeSlotFit(compactCandidate!.recipeId, compactBindings);

    expect(selectedFit.fitScore.overall).toBeGreaterThan(compactFit.fitScore.overall);
  });

  it("routes profile-heavy resume copy into profile-board with better fit than profile-summary baseline", () => {
    const slide: AIPresentationSlide = {
      templateId: "split_right_image",
      title: "อดรา มอนต์มินี",
      body: [
        "นักวางแผนการเงินที่มีประสบการณ์ดูแลพอร์ตลูกค้าบุคคลและองค์กร พร้อมถ่ายทอดแนวคิดการเงินที่ซับซ้อนให้เข้าใจง่าย",
        "เชี่ยวชาญการวางแผนภาษี การจัดพอร์ตเพื่อเป้าหมายระยะยาว และการออกแบบแผนการเงินที่เชื่อมโยงกับช่วงชีวิตของลูกค้า",
      ],
      notes: "ต้องมีข้อมูลประวัติการศึกษา ประสบการณ์ ทักษะ และช่องทางการติดต่อครบในหน้าเดียวแบบยังแก้ไขข้อความได้",
      sections: [
        { heading: "ประวัติการศึกษา", details: ["2558-2560 ปริญญาโท การเงิน", "2554-2558 ปริญญาตรี บริหารธุรกิจ"] },
        { heading: "ประวัติการทำงาน", details: ["2561-2563 Larana, Inc.", "2564-ปัจจุบัน Really Great Co."] },
        { heading: "ทักษะ", details: ["วางแผนภาษี", "ที่ปรึกษาการลงทุน", "สื่อสารกับลูกค้า"] },
        { heading: "ติดต่อ", details: ["hello@example.com", "+66 81 234 5678", "Bangkok, Thailand"] },
      ],
      graphicCategory: "Business",
    };

    const evaluation = evaluateDraftSlideRouting({ slide, slideIndex: 3 });
    expect(evaluation.selection.componentRecipeId).toBe("profile-board");

    const selectedBindings = buildPresentationComponentRecipeSlotBindings("profile-board", toNarrativeInput(slide));
    const baselineBindings = buildPresentationComponentRecipeSlotBindings("profile-summary", toNarrativeInput(slide));
    const selectedFit = evaluatePresentationRecipeSlotFit("profile-board", selectedBindings);
    const baselineFit = evaluatePresentationRecipeSlotFit("profile-summary", baselineBindings);

    expect(selectedFit.fitScore.status).toBe("fits");
    expect(baselineFit.fitScore.status).toBe("fits");
    const selectedListItems = selectedBindings
      .filter((binding) => binding.type === "list")
      .reduce((sum, binding) => sum + binding.items.length, 0);
    const baselineListItems = baselineBindings
      .filter((binding) => binding.type === "list")
      .reduce((sum, binding) => sum + binding.items.length, 0);
    expect(selectedListItems).toBeGreaterThan(baselineListItems);
  });

  it("keeps dense multi-section educational copy in sectioned-explainer instead of compact cards", () => {
    const slide: AIPresentationSlide = {
      templateId: "split_right_image",
      title: "ขั้นตอนปฏิบัติ / เคล็ดลับ",
      body: [
        "สร้างกิจวัตรก่อนนอนให้สม่ำเสมอโดยใช้ลำดับกิจกรรมเดิมทุกคืน",
        "กำหนดเวลาเข้านอนและตื่นนอนให้ใกล้เคียงกันแม้เป็นวันหยุด",
        "จัดสภาพแวดล้อมในห้องให้เงียบ สบาย และลดสิ่งกระตุ้นก่อนนอน",
        "ค่อย ๆ ลดการตอบสนองทันทีในทุกครั้งที่เด็กตื่นกลางคืนเพื่อให้เด็กฝึกกลับไปนอนเอง",
      ],
      notes: "สไลด์นี้เป็นคำอธิบายแบบค่อยเป็นค่อยไป มีหลายประเด็นและข้อผิดพลาดที่พบบ่อย จึงต้องใช้เลย์เอาต์ข้อความยาว",
      sections: [
        { heading: "ความผิดพลาดที่พบบ่อย", details: ["นอนดึกและตื่นไม่เป็นเวลา", "ตอบสนองทันทีทุกครั้งโดยไม่มีแผน"] },
        { heading: "ใครควรอ่านสไลด์นี้", details: ["พ่อแม่หรือผู้ดูแลเด็กเล็กที่กำลังฝึกนิสัยการนอนของลูก"] },
        { heading: "สิ่งที่ควรทำต่อ", details: ["เลือกเพียงหนึ่งถึงสองแนวทางแล้วทำซ้ำอย่างสม่ำเสมอ"] },
      ],
      graphicCategory: "Education",
    };

    const evaluation = evaluateDraftSlideRouting({ slide, slideIndex: 4 });
    expect(evaluation.selection.componentRecipeId).toBe("sectioned-explainer");
    expect(evaluation.selection.mode).toBe("long_form_block");
  });

  it("routes balanced three-part narratives into feature-highlights before collapsing into sectioned-explainer", () => {
    const slide: AIPresentationSlide = {
      templateId: "split_right_image",
      title: "แนวทางป้องกันที่ควรทำทุกวัน",
      body: [
        "เริ่มจากจัดบรรยากาศระหว่างให้นมให้สงบและคาดเดาได้",
        "สังเกตอาการซ้ำและสิ่งกระตุ้นร่วมเพื่อหา trigger สำคัญ",
        "ทบทวนสัญญาณเตือนกับผู้ดูแลทุกคนให้ใช้เกณฑ์เดียวกัน",
      ],
      notes: "สไลด์นี้เป็นสามประเด็นสมดุลที่ควรอ่านง่ายและสแกนได้เร็ว ไม่ควรถูกบีบกลับไปเป็นบทความยาวทั้งหน้า",
      sections: [
        { heading: "ปรับบรรยากาศ", details: ["ลดสิ่งรบกวนและจัดท่าให้นุ่มนวลขึ้นก่อนมื้อที่มักเกิดอาการ"] },
        { heading: "สังเกตอาการซ้ำ", details: ["จดปริมาณนมและพฤติกรรมร่วมเพื่อดูว่า trigger ใดเกิดซ้ำบ่อย"] },
        { heading: "ใช้เกณฑ์เดียวกัน", details: ["ให้ผู้ดูแลทุกคนเข้าใจสัญญาณเตือนและขั้นตอนรับมือชุดเดียวกัน"] },
      ],
      graphicCategory: "Education",
    };

    const evaluation = evaluateDraftSlideRouting({ slide, slideIndex: 5 });
    expect(evaluation.selection.componentRecipeId).toBe("feature-highlights");
    expect(evaluation.selection.mode).toBe("structured_block");
  });

  it("biases balanced three-part narratives toward sectioned-explainer on portrait 9:16 canvases", () => {
    const slide: AIPresentationSlide = {
      templateId: "split_right_image",
      title: "แนวทางป้องกันที่ควรทำทุกวัน",
      body: [
        "เริ่มจากจัดบรรยากาศระหว่างให้นมให้สงบและคาดเดาได้",
        "สังเกตอาการซ้ำและสิ่งกระตุ้นร่วมเพื่อหา trigger สำคัญ",
        "ทบทวนสัญญาณเตือนกับผู้ดูแลทุกคนให้ใช้เกณฑ์เดียวกัน",
      ],
      notes: "สไลด์นี้เป็นสามประเด็นสมดุลที่ควรอ่านง่ายและสแกนได้เร็ว แต่บน canvas แนวตั้งควรใช้พื้นที่แบบบทความเต็มหน้าได้ดีกว่า card overlay",
      sections: [
        { heading: "ปรับบรรยากาศ", details: ["ลดสิ่งรบกวนและจัดท่าให้นุ่มนวลขึ้นก่อนมื้อที่มักเกิดอาการ"] },
        { heading: "สังเกตอาการซ้ำ", details: ["จดปริมาณนมและพฤติกรรมร่วมเพื่อดูว่า trigger ใดเกิดซ้ำบ่อย"] },
        { heading: "ใช้เกณฑ์เดียวกัน", details: ["ให้ผู้ดูแลทุกคนเข้าใจสัญญาณเตือนและขั้นตอนรับมือชุดเดียวกัน"] },
      ],
      graphicCategory: "Education",
    };

    const portraitEvaluation = evaluateDraftSlideRouting({
      slide,
      slideIndex: 5,
      canvasWidth: 720,
      canvasHeight: 1280,
    });
    const landscapeEvaluation = evaluateDraftSlideRouting({
      slide,
      slideIndex: 5,
      canvasWidth: 1280,
      canvasHeight: 720,
    });

    expect([
      "sectioned-explainer",
      "timeline-report",
      "article-focus",
      "two-column-article",
      "profile-board",
    ]).toContain(portraitEvaluation.selection.componentRecipeId);
    expect(portraitEvaluation.selection.mode).toBe("long_form_block");
    expect(landscapeEvaluation.selection.componentRecipeId).toBe("feature-highlights");
  });

  it("routes question-heavy Thai support copy into faq-stack", () => {
    const slide: AIPresentationSlide = {
      templateId: "split_right_image",
      title: "คำถามที่พบบ่อยเรื่องการนอนของเด็กเล็ก",
      body: [
        "เด็กตื่นกลางคืนบ่อยเป็นเรื่องปกติไหม",
        "ควรปลอบทันทีทุกครั้งหรือไม่",
        "เมื่อไรควรปรึกษาแพทย์",
      ],
      notes: "สไลด์นี้สรุปคำถามที่ผู้ปกครองถามบ่อยพร้อมคำตอบแบบอ่านง่ายในหน้าเดียว",
      sections: [
        { heading: "เด็กตื่นกลางคืนบ่อยเป็นเรื่องปกติไหม", details: ["ในวัยทารกยังพบได้ แต่ควรติดตามรูปแบบการกินและการนอนร่วมกัน"] },
        { heading: "ควรปลอบทันทีทุกครั้งหรือไม่", details: ["เริ่มจากประเมินก่อนว่าเด็กต้องการความช่วยเหลือจริงหรือสามารถกลับไปหลับต่อเองได้"] },
        { heading: "เมื่อไรควรปรึกษาแพทย์", details: ["หากมีอาการร่วม เช่น หายใจผิดปกติ น้ำหนักไม่ขึ้น หรือร้องกวนรุนแรง ควรปรึกษาแพทย์"] },
      ],
      graphicCategory: "Education",
      imagePromptKeywords: "faq sleep training parents",
    };

    const evaluation = evaluateDraftSlideRouting({ slide, slideIndex: 2 });
    expect(evaluation.selection.componentRecipeId).toBe("faq-stack");
    expect(evaluation.selection.mode).toBe("long_form_block");
  });

  it("uses visual density and canvas shape to distinguish two-photo boards from five-photo A4 boards", () => {
    const visualSlide: AIPresentationSlide = {
      templateId: "split_right_image",
      title: "Interior showcase",
      body: [
        "Hero room overview for the property listing.",
        "Kitchen detail and lighting mood.",
      ],
      notes: "Use this slide like a lookbook spread with one hero and several supporting frames.",
      sections: [
        { heading: "Living room", details: ["Wide establishing shot of the main space"] },
        { heading: "Kitchen", details: ["Detail frame with materials and cabinetry"] },
      ],
      graphicCategory: "Property",
    };

    const portraitEvaluation = evaluateDraftSlideRouting({
      slide: visualSlide,
      slideIndex: 2,
      canvasWidth: 720,
      canvasHeight: 1280,
    });
    const landscapeEvaluation = evaluateDraftSlideRouting({
      slide: visualSlide,
      slideIndex: 2,
      canvasWidth: 1280,
      canvasHeight: 720,
    });

    expect(portraitEvaluation.selection.componentRecipeId).toBe("a4-photo-grid");
    expect(landscapeEvaluation.selection.componentRecipeId).toBe("landscape-photo-story");
  });

  it("routes dense roadmap copy into timeline-report instead of compact timeline-flow", () => {
    const slide: AIPresentationSlide = {
      templateId: "split_right_image",
      title: "แผนพัฒนาแพลตฟอร์มตลอดปี 2026",
      body: [
        "Q1 2026 รวบรวม pain points จากทีมงานและนิยามปัญหาที่ต้องแก้ก่อนเริ่มออกแบบ workflow ใหม่",
        "Q2 2026 ทดลองใช้ workflow ใหม่กับทีมหลักและปรับรายละเอียดจาก feedback ที่ได้จากการใช้งานจริง",
        "Q3 2026 ขยาย rollout พร้อมคู่มือและ dashboard เพื่อติดตามการใช้งานหลังเปิดตัว",
      ],
      notes: "สไลด์นี้เป็น roadmap ที่ยังต้องมีคำอธิบายราย phase และ next steps จึงไม่ควรถูกบีบลง compact timeline cards",
      sections: [
        { heading: "Q1 2026 Discover the bottlenecks", details: ["สัมภาษณ์ผู้ใช้งาน สรุปข้อจำกัด และจัดลำดับปัญหาที่กระทบการทำงานจริงมากที่สุด"] },
        { heading: "Q2 2026 Pilot the workflow", details: ["ทดสอบกับทีมหลัก วัดเวลาที่ประหยัดได้ และแก้ friction ก่อน rollout จริง"] },
        { heading: "Q3 2026 Scale and govern", details: ["ขยายสู่หลายทีมพร้อม owner, governance และ dashboard ติดตามผลลัพธ์หลังเปิดใช้"] },
      ],
      graphicCategory: "Roadmap",
    };

    const evaluation = evaluateDraftSlideRouting({ slide, slideIndex: 2 });
    expect(evaluation.selection.componentRecipeId).toBe("timeline-report");
    expect(evaluation.selection.mode).toBe("long_form_block");

    const selectedBindings = buildPresentationComponentRecipeSlotBindings("timeline-report", toNarrativeInput(slide));
    const compactBindings = buildPresentationComponentRecipeSlotBindings("timeline-flow", toNarrativeInput(slide));
    const selectedFit = evaluatePresentationRecipeSlotFit("timeline-report", selectedBindings);
    const compactFit = evaluatePresentationRecipeSlotFit("timeline-flow", compactBindings);
    const selectedChars = selectedBindings.reduce((sum, binding) => sum + (
      binding.type === "list"
        ? binding.items.join(" ").length
        : binding.type === "text"
        ? binding.text.length
        : 0
    ), 0);
    const compactChars = compactBindings.reduce((sum, binding) => sum + (
      binding.type === "list"
        ? binding.items.join(" ").length
        : binding.type === "text"
        ? binding.text.length
        : 0
    ), 0);

    expect(selectedFit.fitScore.status).toBe("fits");
    expect(compactFit.fitScore.status).toBe("fits");
    expect(selectedChars).toBeGreaterThan(compactChars);
  });

  it("routes dense two-section article copy into two-column-article instead of single-thread article-focus", () => {
    const slide: AIPresentationSlide = {
      templateId: "split_right_image",
      title: "แนวทางปรับการทำงานร่วมกันของทีมข้ามสายงาน",
      body: [
        "ทีมข้ามสายงานมักสะดุดตั้งแต่ช่วงที่แต่ละฝ่ายยังตีความเป้าหมายไม่ตรงกันและใช้คำอธิบายปัญหาคนละแบบ",
        "เมื่อเข้าสู่การทำงานจริง การขาดจังหวะอัปเดตที่ชัดเจนทำให้ประเด็นสำคัญถูกส่งต่อช้าและเกิดการประชุมซ้ำซ้อน",
        "หากต้องการให้การเปลี่ยนแปลงยั่งยืน ทีมจึงต้องออกแบบทั้งภาษากลางและจังหวะการสื่อสารให้สัมพันธ์กัน",
      ],
      notes: "เป็นบทความสองช่วงที่ต้องแยกซ้ายขวาอย่างสมดุลและยังมี takeaways ที่สแกนง่ายตอนท้าย",
      sections: [
        { heading: "ตั้งภาษาและบริบทให้ตรงกัน", details: ["นิยามเป้าหมาย คำหลัก และขอบเขตร่วมกันก่อนเริ่ม execution เพื่อให้แต่ละฝ่ายเห็นภาพเดียวกัน"] },
        { heading: "ออกแบบจังหวะการสื่อสาร", details: ["กำหนดว่าเรื่องใดต้อง sync สด เรื่องใดส่งต่อแบบ async และใช้ cadence เดียวกันทั้งทีมเพื่อลดการประชุมซ้ำ"] },
      ],
      graphicCategory: "Business",
    };

    const evaluation = evaluateDraftSlideRouting({ slide, slideIndex: 3 });
    expect(evaluation.selection.componentRecipeId).toBe("two-column-article");
    expect(evaluation.selection.mode).toBe("long_form_block");

    const selectedBindings = buildPresentationComponentRecipeSlotBindings("two-column-article", toNarrativeInput(slide));
    const baselineBindings = buildPresentationComponentRecipeSlotBindings("article-focus", toNarrativeInput(slide));
    const selectedFit = evaluatePresentationRecipeSlotFit("two-column-article", selectedBindings);
    const baselineFit = evaluatePresentationRecipeSlotFit("article-focus", baselineBindings);
    const selectedChars = selectedBindings.reduce((sum, binding) => sum + (
      binding.type === "list"
        ? binding.items.join(" ").length
        : binding.type === "text"
        ? binding.text.length
        : 0
    ), 0);
    const baselineChars = baselineBindings.reduce((sum, binding) => sum + (
      binding.type === "list"
        ? binding.items.join(" ").length
        : binding.type === "text"
        ? binding.text.length
        : 0
    ), 0);

    expect(selectedFit.fitScore.status).toBe("fits");
    expect(baselineFit.fitScore.status).toBe("fits");
    expect(selectedChars).toBeGreaterThanOrEqual(baselineChars);
  });

  it("biases dense single-thread article copy toward article-focus on portrait 9:16 canvases", () => {
    const slide: AIPresentationSlide = {
      templateId: "split_right_image",
      title: "วิธีจัดข้อมูลก่อนประชุมให้ทีมตัดสินใจได้เร็วขึ้น",
      body: [
        "ก่อนประชุมทุกครั้ง ทีมควรสรุปปัญหา เหตุผลที่ต้องตัดสินใจ และข้อจำกัดสำคัญให้เหลือภาษาชุดเดียวกันเพื่อไม่ให้เสียเวลาเริ่มต้นใหม่ทุกครั้ง",
        "เมื่อข้อมูลอ้างอิงมีหลายแหล่ง ควรเลือกเพียงตัวเลขหรือหลักฐานที่จำเป็นต่อการตัดสินใจจริง แล้วจัดลำดับจากสิ่งที่ต้องรู้ทันทีไปหาข้อมูลประกอบภายหลัง",
        "หากสไลด์ต้องรองรับทั้งผู้บริหารและผู้ปฏิบัติ ควรใช้พื้นที่เล่าเรื่องต่อเนื่องพร้อมสรุปสารสำคัญท้ายหน้าแทนการแตกเป็น card สั้นหลายใบที่ทำให้บริบทขาดตอน",
      ],
      notes: "บน canvas แนวตั้งควรใช้รูปแบบ editorial/A4 ที่อ่านต่อเนื่องและแก้ไขข้อความยาวได้ง่าย",
      graphicCategory: "Business",
    };

    const portraitEvaluation = evaluateDraftSlideRouting({
      slide,
      slideIndex: 2,
      canvasWidth: 720,
      canvasHeight: 1280,
    });

    expect(portraitEvaluation.selection.componentRecipeId).toBe("article-focus");
    expect(portraitEvaluation.selection.mode).toBe("long_form_block");
  });

  it("routes portrait photo-led narratives into a4-photo-grid on 9:16 canvases", () => {
    const slide: AIPresentationSlide = {
      templateId: "split_right_image",
      title: "คู่มือจัดห้องตัวอย่างให้ลูกค้าตัดสินใจง่ายขึ้น",
      body: [
        "ภาพหลักควรแสดงพื้นที่รวมของห้อง ส่วนภาพย่อยช่วยเน้นมุมใช้งานจริง รายละเอียดวัสดุ และบรรยากาศการอยู่อาศัย",
        "เมื่อเป็น canvas แนวตั้ง ควรใช้ block แบบเต็มหน้าและหลายรูปแทนการวางภาพเดียวแล้วซ้อนข้อความทับกลางภาพ",
      ],
      notes: "สไลด์นี้ควรออกแนว poster/lookbook ที่มีหลายรูปและข้อความสั้นพออ่านต่อเนื่องได้",
      graphicCategory: "Property",
      imagePromptKeywords: "property lookbook gallery interior",
    };

    const evaluation = evaluateDraftSlideRouting({
      slide,
      slideIndex: 2,
      canvasWidth: 720,
      canvasHeight: 1280,
    });

    expect(evaluation.selection.componentRecipeId).toBe("a4-photo-grid");
    expect(evaluation.selection.mode).toBe("long_form_block");
  });

  it("routes landscape visual storytelling into landscape-photo-story on 16:9 canvases", () => {
    const slide: AIPresentationSlide = {
      templateId: "split_right_image",
      title: "Modern Dream Home",
      body: [
        "ภาพหลักควรโชว์ exterior เต็มหลังบ้าน ส่วนภาพรองใช้สำหรับห้องครัว ห้องนั่งเล่น และห้องนอนเพื่อให้ผู้ชมเห็นคุณภาพแบบครบมุม",
        "ข้อความควรสั้น ชัด และไม่ซ้อนทับภาพหลักจนทำให้ความรู้สึกของ layout เสียสัดส่วน",
      ],
      notes: "ต้องการเลย์เอาต์แนวนอนที่ใช้หลายรูปแบบโปสเตอร์ขายบ้าน ไม่ใช่ card overlay แบบเดิม",
      graphicCategory: "Property",
      imagePromptKeywords: "modern home property showcase interior listing",
    };

    const evaluation = evaluateDraftSlideRouting({
      slide,
      slideIndex: 2,
      canvasWidth: 1280,
      canvasHeight: 720,
    });

    expect(evaluation.selection.componentRecipeId).toBe("landscape-photo-story");
    expect(evaluation.selection.mode).toBe("long_form_block");
  });
});
