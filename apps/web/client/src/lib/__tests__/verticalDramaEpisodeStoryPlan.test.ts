import { describe, expect, it } from "vitest";

import {
  buildVerticalDramaEpisodeStorySummary,
  normalizeVerticalDramaEpisodeStoryInputSummary,
  normalizeVerticalDramaEpisodeStoryPlanShots,
  normalizeVerticalDramaEpisodeStorySummary,
  resolveVerticalDramaEpisodeStorySummary,
} from "@/lib/verticalDramaEpisodeStoryPlan";

describe("verticalDramaEpisodeStoryPlan", () => {
  it("normalizes and orders normal and special shot summary rows", () => {
    expect(
      normalizeVerticalDramaEpisodeStoryPlanShots([
        { shot_number: 2, story_summary: "second" },
        { shotNumber: 1, summary: "first" },
        { shotNumber: 2, summary: "duplicate is ignored" },
        { shotNumber: 3, summary: "" },
        { shotNumber: "bad", summary: "invalid" },
      ])
    ).toEqual([
      { shotNumber: 1, summary: "first" },
      { shotNumber: 2, summary: "second" },
    ]);
  });

  it("builds a bounded fallback summary from all valid shots", () => {
    const shots = [
      { shotNumber: 1, summary: "เปิดเรื่อง" },
      { shotNumber: 2, summary: "เกิดเหตุการณ์สำคัญ" },
    ];
    expect(buildVerticalDramaEpisodeStorySummary(shots, "ช็อต")).toBe(
      "ช็อต 1: เปิดเรื่อง ช็อต 2: เกิดเหตุการณ์สำคัญ"
    );
    expect(buildVerticalDramaEpisodeStorySummary([])).toBeNull();
  });

  it("trims malformed or empty episode-level summaries", () => {
    expect(normalizeVerticalDramaEpisodeStorySummary("  สรุป  ")).toBe("สรุป");
    expect(normalizeVerticalDramaEpisodeStorySummary(" ")).toBeNull();
    expect(normalizeVerticalDramaEpisodeStorySummary(null)).toBeNull();
  });

  it("keeps the selected idea as the complete authored summary", () => {
    expect(
      normalizeVerticalDramaEpisodeStoryInputSummary(
        "  ไอเดียที่ผู้ใช้เลือก: เปิดเรื่องและเหตุการณ์หลัก  "
      )
    ).toBe("ไอเดียที่ผู้ใช้เลือก: เปิดเรื่องและเหตุการณ์หลัก");
    expect(normalizeVerticalDramaEpisodeStoryInputSummary(" ")).toBeNull();
  });

  it("prefers the selected idea over generated and legacy fallbacks", () => {
    const shots = [{ shotNumber: 1, summary: "shot fallback" }];
    expect(
      resolveVerticalDramaEpisodeStorySummary({
        selectedIdea: "ผู้ใช้เลือกไอเดียนี้",
        legacyEpisodeSummary: "สรุปจากผลลัพธ์เก่า",
        shots,
      })
    ).toBe("ผู้ใช้เลือกไอเดียนี้");
    expect(
      resolveVerticalDramaEpisodeStorySummary({
        legacyEpisodeSummary: "สรุปจากผลลัพธ์เก่า",
        shots,
      })
    ).toBe("สรุปจากผลลัพธ์เก่า");
  });
});
