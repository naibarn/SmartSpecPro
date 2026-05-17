import { describe, expect, it } from "vitest";

import {
  ELEVENLABS_BEAUTY_DIALOGUE_SKILL_ID,
  evaluateElevenLabsBeautyDialogueQuality,
} from "./elevenLabsBeautyDialogueQuality";

describe("evaluateElevenLabsBeautyDialogueQuality", () => {
  it("flags cleanser treatment and weak audio quality issues by rule category", () => {
    const output = [
      "Speaker 1: [energetic] ล้างหน้าแล้วรู้สึกตึงหรือเปล่า?",
      "Speaker 2: แล้วทำไมถึงบอกว่าไม่ทำลายชั้นผิว?",
      "Speaker 1: ใช่! Tea Tree Oil ช่วยฆ่าเชื้อแบคทีเรีย ลดการอักเสบให้สิวแห้งเร็วขึ้น",
      "Speaker 2: ฟังดูดี แบบนี้ใช้ได้ทุกวันเลยไหม?",
      "Speaker 1: ล้างหน้าแบบไม่เอี๊ยด เริ่มรูทีนให้ผิวสุขภาพดีขึ้นได้เลย!",
    ].join("\n");

    const report = evaluateElevenLabsBeautyDialogueQuality(output, ELEVENLABS_BEAUTY_DIALOGUE_SKILL_ID);

    expect(report.passed).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "cleanser_claim_risk",
      "weak_audio_energy",
      "overbroad_result_claim",
    ]));
  });

  it("passes a short safe energetic cleanser dialogue", () => {
    const output = [
      "Speaker 1: [energetic] ล้างหน้าแล้วสะอาด แต่ผิวตึงจนไม่สบายหน้า?",
      "Speaker 2: ใช่ เหมือนล้างเสร็จแล้วหน้าแห้งทันที",
      "Speaker 1: Dr.PONG เป็นเจลล้างหน้า pH กรดอ่อน ๆ มี Ceramides และ Tea Tree Oil ตามสูตร",
      "Speaker 2: แล้วต่างจากเจลล้างหน้าทั่วไปยังไง?",
      "Speaker 1: [confident] ฟีลคือคลีนแบบไม่ต้องเอี๊ยด เหมาะกับรูทีนที่อยากให้ผิวรู้สึกสบายหลังล้าง",
      "Speaker 2: แล้วเรื่อง free-from ล่ะ?",
      "Speaker 1: มีรายการ 5-free ตามที่แบรนด์ระบุ เริ่มล้างหน้าให้พอดี แล้วค่อยไปต่อสเต็ปบำรุง",
    ].join("\n");

    const report = evaluateElevenLabsBeautyDialogueQuality(output, ELEVENLABS_BEAUTY_DIALOGUE_SKILL_ID);

    expect(report.passed).toBe(true);
    expect(report.issues.filter((issue) => issue.severity === "repair")).toHaveLength(0);
  });

  it("does not evaluate other skills", () => {
    const report = evaluateElevenLabsBeautyDialogueQuality(
      "Speaker 1: Tea Tree Oil ช่วยฆ่าเชื้อแบคทีเรีย",
      "other-skill",
    );

    expect(report.passed).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it("flags exaggerated, guarantee-style, and unnatural listener lines", () => {
    const output = [
      "Speaker 1: Dr.PONG เจลล้างหน้าอ่อนโยนสุด ๆ ที่ช่วยให้ผิวรู้สึกสดชื่น",
      "Speaker 1: [confident] pH กรดอ่อน ๆ ไม่เอี๊ยดหลังล้าง ผิวจะรู้สึกสบายขึ้นทันที",
      "Speaker 1: มีรายการ 5-free ตามที่แบรนด์ระบุ วางใจได้เลย",
      "Speaker 2: ตื่นเต้น! จะเริ่มรูทีนนี้เลยไหม?",
      "Speaker 1: สูตรนี้ดูแลความรู้สึกผิวหลังล้าง ไม่ทำให้ผิวแห้งตึงแน่นอน",
      "Speaker 1: มีรายการ 5-free ตามที่แบรนด์ระบุ เริ่มรูทีนให้ผิวรู้สึกสบายขึ้นทุกวัน!",
    ].join("\n");

    const report = evaluateElevenLabsBeautyDialogueQuality(output, ELEVENLABS_BEAUTY_DIALOGUE_SKILL_ID);

    expect(report.passed).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "overclaim_intensity",
      "trust_guarantee",
      "unnatural_listener_reaction",
      "daily_result_promise",
    ]));
  });
});
