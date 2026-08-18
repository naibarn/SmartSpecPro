import { describe, expect, it } from "vitest";
import {
  CREATE_SERIES_FIELD_LIMITS,
  clampToCreateSeriesLimit,
} from "./createSeriesFieldLimits";

describe("clampToCreateSeriesLimit", () => {
  it("returns undefined for empty/whitespace-only input", () => {
    expect(clampToCreateSeriesLimit(undefined, "tone")).toBeUndefined();
    expect(clampToCreateSeriesLimit("", "tone")).toBeUndefined();
    expect(clampToCreateSeriesLimit("   ", "tone")).toBeUndefined();
  });

  it("returns the trimmed value unchanged when within the limit", () => {
    expect(clampToCreateSeriesLimit("  Warm comedy  ", "tone")).toBe("Warm comedy");
  });

  it("clamps a too-long tone string to at most the field limit, with a clean word-boundary cut", () => {
    const longTone =
      "A warm, chaotic, fast-paced Thai neighborhood service comedy with recurring customer " +
      "misunderstandings, heartfelt staff loyalty, and a dash of romantic tension that builds " +
      "gently across the whole season arc";
    expect(longTone.length).toBeGreaterThan(CREATE_SERIES_FIELD_LIMITS.tone);

    const result = clampToCreateSeriesLimit(longTone, "tone");
    expect(result).toBeDefined();
    expect(result!.length).toBeLessThanOrEqual(CREATE_SERIES_FIELD_LIMITS.tone);
    // Clean cut: must not end mid-word (no trailing partial word merged with next).
    expect(longTone.startsWith(result!)).toBe(true);
    expect(result!.endsWith(" ")).toBe(false);
  });

  it("clamps a too-long title/genre string to at most the field limit", () => {
    const longTitle = "ร้านก๋วยเตี๋ยว".repeat(20);
    expect(longTitle.length).toBeGreaterThan(CREATE_SERIES_FIELD_LIMITS.genre);

    const result = clampToCreateSeriesLimit(longTitle, "genre");
    expect(result).toBeDefined();
    expect(result!.length).toBeLessThanOrEqual(CREATE_SERIES_FIELD_LIMITS.genre);
  });

  it("hard-cuts when there is no reasonable word boundary (e.g. one long unbroken token)", () => {
    const longToken = "x".repeat(CREATE_SERIES_FIELD_LIMITS.tone + 50);
    const result = clampToCreateSeriesLimit(longToken, "tone");
    expect(result!.length).toBe(CREATE_SERIES_FIELD_LIMITS.tone);
  });

  it("preserves a complete long-form premise such as Proof of Us", () => {
    const proofOfUsPremise = [
      "## ชื่อชั่วคราว: Proof of Us",
      "แนว: Young Adult / Campus Romance / Academic Rivalry / Coming-of-Age / Underdog / Science & Engineering Drama",
      "เด็กสาวอัจฉริยะทางคณิตศาสตร์จากชนบทในเอเชียเติบโตมาโดยเรียนรู้ด้วยตัวเอง ก่อนจะได้รับทุนเข้าเรียนมหาวิทยาลัยชั้นนำในสหรัฐฯ และกลายเป็นคนนอกทั้งเรื่องภาษา วัฒนธรรม ฐานะ และพื้นฐานการศึกษา",
      "คู่แข่งชายดาวเด่นของภาควิชามีทุกอย่างที่เธอไม่เคยมี แต่เมื่อทั้งคู่ต้องทำงานร่วมกัน ความเป็นคู่แข่งค่อย ๆ เปลี่ยนเป็นความเคารพ ความเข้าใจ และความรัก",
      "เธอเริ่มศึกษาการประยุกต์คณิตศาสตร์กับวิศวกรรมโครงสร้าง การคำนวณเชิงตัวเลข และการออกแบบโครงสร้างด้วยคอมพิวเตอร์ เพื่อสร้างกรอบคณิตศาสตร์ใหม่ที่ทำให้โครงสร้างแข็งแรง ใช้วัสดุอย่างมีประสิทธิภาพ และก่อสร้างได้จริง",
      "แบบจำลองรุ่นแรกมีข้อผิดพลาด และเธอต้องเรียนรู้ว่าคำตอบที่สวยงามทางคณิตศาสตร์ไม่ได้แปลว่าจะเป็นคำตอบที่ดีที่สุดในโลกจริง หลังผ่านการจำลอง การทดลอง ชิ้นส่วนต้นแบบ และโครงการขนาดเล็ก แนวคิดของเธอจึงได้รับโอกาสนำไปใช้กับโครงการโครงสร้างขนาดใหญ่จริง",
      "แกนเรื่อง: คนนอก → คู่แข่ง → นักศึกษาที่ค้นพบคุณค่าของความรู้ → นักวิจัยที่กล้าตั้งคำถาม → ผู้สร้างองค์ความรู้ที่เปลี่ยนโลกจริง",
      "แก่นสำคัญ: คุณค่าที่แท้จริงของการเรียนรู้คือวันที่เราสามารถใช้สิ่งที่รู้แก้ปัญหาที่ยังไม่มีใครมีคำตอบ",
      "จุดขาย: Romance + Underdog + Academic Rivalry + Fish-out-of-Water + Genius Journey + Engineering Innovation",
      "Tagline: She understands every equation—until she finds one the world hasn't solved yet.",
      "รายละเอียดเส้นทางตัวละคร: เธอต้องรับมือกับความโดดเดี่ยว การถูกดูแคลนจากสำเนียงและฐานะ ความกลัวว่าจะทำให้ผู้สนับสนุนผิดหวัง และความขัดแย้งระหว่างการพิสูจน์ตัวเองกับการยอมรับความช่วยเหลือจากทีม เธอค่อย ๆ เรียนรู้ว่าความร่วมมือไม่ได้ลดทอนความเป็นอัจฉริยะ แต่ทำให้ความคิดของเธอเดินทางไปถึงโลกจริงได้",
      "รายละเอียดกลไกซีรีย์: แต่ละช่วงจะมีโจทย์คณิตศาสตร์หรือวิศวกรรมที่สะท้อนความสัมพันธ์ของตัวละคร ตั้งแต่การแก้โจทย์ในห้องเรียน การแข่งขันกับคู่แข่ง การสร้างแบบจำลองที่ล้มเหลว การทดสอบต้นแบบ ไปจนถึงการตัดสินใจครั้งสุดท้ายที่ต้องเลือกความปลอดภัยและความเป็นไปได้เหนือคำตอบที่ดูสมบูรณ์แบบบนกระดาษ",
      "ภาพจบของเรื่องไม่ใช่การรับรางวัลการแข่งขัน แต่เป็นวันที่เธอยืนอยู่หน้าโครงสร้างขนาดมหึมาที่กำลังก่อสร้าง และเห็นสมการในสมุดเก่ากลายเป็นเหล็ก คอนกรีต และพื้นที่ที่ผู้คนใช้งานได้จริง ความสำเร็จของเธอจึงหมายถึงการตั้งคำถามใหม่ที่คนรุ่นต่อไปอาจต้องเรียนจากตำรา",
    ].join("\n\n");

    expect(proofOfUsPremise.length).toBeGreaterThan(2000);
    expect(proofOfUsPremise.length).toBeLessThanOrEqual(
      CREATE_SERIES_FIELD_LIMITS.userPremise
    );
    expect(clampToCreateSeriesLimit(proofOfUsPremise, "userPremise")).toBe(
      proofOfUsPremise
    );
  });
});
