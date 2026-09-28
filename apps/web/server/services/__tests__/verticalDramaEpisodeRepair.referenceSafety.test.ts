import { describe, expect, it } from "vitest";
import { sanitizeEpisodeRepairReferenceForSkill } from "../verticalDramaEpisodeRepair";
import { analyzeVerticalDramaStorySafety } from "../verticalDramaStorySafety";

describe("sanitizeEpisodeRepairReferenceForSkill", () => {
  it("removes risky details from a blocked story unit while keeping its shot identity", () => {
    const result = sanitizeEpisodeRepairReferenceForSkill({
      shot_number: 7,
      location: "บ้านพัก",
      summary: "เด็กเล็กหลับอยู่ในบ้านและถูกแอบถ่ายพร้อมข้อความข่มขู่",
      dialogue: "รูปนี้ใครเป็นคนถ่าย",
    }) as Record<string, unknown>;

    expect(result.shot_number).toBe(7);
    expect(result.location).toBe("บ้านพัก");
    expect(String(result.summary)).toContain("Neutral continuity reference");
    expect(analyzeVerticalDramaStorySafety(result).level).not.toBe("high");
  });

  it("preserves safe continuity facts and ordering", () => {
    const result = sanitizeEpisodeRepairReferenceForSkill({
      episode_number: 7,
      title: "แม่ที่ไม่ยอมแพ้",
      shots: [
        { shot_number: 1, summary: "แม่จัดตารางงานใหม่" },
        { shot_number: 2, summary: "เธอวางแผนเรียนต่อ" },
      ],
    }) as Record<string, unknown>;

    expect(result).toMatchObject({
      episode_number: 7,
      title: "แม่ที่ไม่ยอมแพ้",
      shots: [
        { shot_number: 1, summary: "แม่จัดตารางงานใหม่" },
        { shot_number: 2, summary: "เธอวางแผนเรียนต่อ" },
      ],
    });
  });
});
