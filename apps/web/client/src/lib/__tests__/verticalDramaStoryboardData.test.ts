import { describe, expect, it } from "vitest";

import { buildVerticalDramaUnifiedStoryboardData } from "../verticalDramaStoryboardData";

describe("buildVerticalDramaUnifiedStoryboardData", () => {
  it("keeps normal episode Overview summaries and dialogue in the shared shape", () => {
    const result = buildVerticalDramaUnifiedStoryboardData({
      episodeTitle: "ตอนปกติ",
      storyboard: {
        storyboard_summary: { episode_title: "ตอนปกติ" },
        shots: [{ shot_number: 1, visual_description: "ฉากในบ้าน" }],
      },
      episodePlanShotDrafts: [
        {
          shotNumber: 1,
          summary: "พิมพ์ชนกเปิดประตูและเห็นกล่องบนโต๊ะ",
          dialogueLines: [{ speaker: "พิมพ์ชนก", line: "นี่คืออะไรคะ" }],
        },
      ],
      startFramePlan: { frames: [] },
      motionPromptPack: { clips: [] },
    });

    expect(result.storyboard?.shots).toHaveLength(1);
    expect(result.canonicalShotDrafts).toEqual([
      {
        shotNumber: 1,
        summary: "พิมพ์ชนกเปิดประตูและเห็นกล่องบนโต๊ะ",
        dialogueLines: [{ speaker: "พิมพ์ชนก", line: "นี่คืออะไรคะ" }],
      },
    ]);
  });

  it("materializes tie-in frames as the same nine-shot storyboard without using image prompts as story", () => {
    const result = buildVerticalDramaUnifiedStoryboardData({
      episodeTitle: "ตอนพิเศษ",
      storyboard: { distinct_locations: [{ location_key: "living-room" }] },
      startFramePlan: {
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "DO NOT USE THIS AS STORY",
            canonicalShotSummary: "เด็กเปิดกล่องของเล่นบนพื้นห้องนั่งเล่น",
            requiredCharacterRefs: ["child"],
          },
          {
            shotNumber: 2,
            canonicalShotSummary: "เด็กเรียงชิ้นส่วนและทดลองเล่นจริง",
            requiredCharacterRefs: ["child"],
          },
        ],
      },
      motionPromptPack: {
        clips: [
          {
            sourceShotNumbers: [1],
            dialogue: [
              { characterKey: "adult", lineTh: "ลองวางชิ้นนี้ตรงนี้ดูนะ" },
            ],
          },
        ],
      },
      characterPortraits: {
        adult: { name: "ผู้ใหญ่" },
        child: { name: "เด็ก" },
      },
    });

    expect(result.storyboard?.shots).toHaveLength(2);
    expect(result.storyboard?.shots?.[0]).toMatchObject({
      shot_number: 1,
      visual_description: "เด็กเปิดกล่องของเล่นบนพื้นห้องนั่งเล่น",
      required_character_refs: ["child"],
    });
    expect(result.canonicalShotDrafts).toEqual([
      {
        shotNumber: 1,
        summary: "เด็กเปิดกล่องของเล่นบนพื้นห้องนั่งเล่น",
        dialogueLines: [
          { speaker: "ผู้ใหญ่", line: "ลองวางชิ้นนี้ตรงนี้ดูนะ" },
        ],
      },
      {
        shotNumber: 2,
        summary: "เด็กเรียงชิ้นส่วนและทดลองเล่นจริง",
        dialogueLines: [],
      },
    ]);
  });

  it("merges missing frame shots into an existing storyboard without dropping locations", () => {
    const result = buildVerticalDramaUnifiedStoryboardData({
      storyboard: {
        distinct_locations: [
          {
            location_key: "shop",
            shot_numbers: [1, 2],
          },
        ],
        shots: [{ shot_number: 1, visual_description: "หน้าร้าน" }],
      },
      startFramePlan: {
        frames: [
          {
            shotNumber: 2,
            canonicalShotSummary: "ตัวละครหยิบสินค้าจากชั้นวาง",
          },
        ],
      },
    });

    expect(result.storyboard?.distinct_locations).toEqual([
      { location_key: "shop", shot_numbers: [1, 2] },
    ]);
    expect(result.storyboard?.shots?.map(shot => shot.shot_number)).toEqual([
      1, 2,
    ]);
  });
});
