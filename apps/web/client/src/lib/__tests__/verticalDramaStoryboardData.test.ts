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

  it("keeps special tie-in dialogue after image approval removes the pending motion clip", () => {
    const result = buildVerticalDramaUnifiedStoryboardData({
      episodeTitle: "ตอนพิเศษ",
      storyboard: {
        shots: [{ shot_number: 1, visual_description: "ฉากในร้าน" }],
      },
      startFramePlan: {
        frames: [{ shotNumber: 1, canonicalShotSummary: "ตัวละครทดลองสินค้า" }],
      },
      motionPromptPack: { clips: [] },
      dialogueAudioPlan: {
        dialogue_lines: [
          {
            shot_number: 1,
            speaker_character_key: "fifa",
            speaker_name: "ฟีฟ่า",
            dialogue_line: "ลองใช้ตัวนี้ดูนะ",
          },
        ],
      },
      characterPortraits: { fifa: { name: "ฟีฟ่า" } },
    });

    expect(result.canonicalShotDrafts).toEqual([
      {
        shotNumber: 1,
        summary: "ตัวละครทดลองสินค้า",
        dialogueLines: [{ speaker: "ฟีฟ่า", line: "ลองใช้ตัวนี้ดูนะ" }],
      },
    ]);
  });

  it("preserves authored Overview dialogue over audio-plan and legacy clip fallbacks", () => {
    const result = buildVerticalDramaUnifiedStoryboardData({
      storyboard: { shots: [{ shot_number: 1, visual_description: "ฉาก" }] },
      episodePlanShotDrafts: [
        {
          shotNumber: 1,
          summary: "ตัวละครคุยกัน",
          dialogueLines: [{ speaker: "ฟีฟ่า", line: "บทพูดล่าสุด" }],
        },
      ],
      dialogueAudioPlan: {
        dialogue_lines: [
          {
            shot_number: 1,
            speaker_name: "ฟีฟ่า",
            dialogue_line: "บทพูดจากแผนเสียง",
          },
        ],
      },
      motionPromptPack: {
        clips: [
          {
            sourceShotNumbers: [1],
            dialogue: [{ characterKey: "fifa", lineTh: "บทพูดจากคลิปเก่า" }],
          },
        ],
      },
    });

    expect(result.canonicalShotDrafts[0]?.dialogueLines).toEqual([
      { speaker: "ฟีฟ่า", line: "บทพูดล่าสุด" },
    ]);
  });

  it("uses legacy clip dialogue when an Overview draft has no dialogue and no audio plan exists", () => {
    const result = buildVerticalDramaUnifiedStoryboardData({
      storyboard: { shots: [{ shot_number: 1, visual_description: "ฉาก" }] },
      episodePlanShotDrafts: [
        { shotNumber: 1, summary: "ตัวละครคุยกัน", dialogueLines: [] },
      ],
      motionPromptPack: {
        clips: [
          {
            sourceShotNumbers: [1],
            dialogue: [{ characterKey: "fifa", lineTh: "บทพูดจากคลิปเก่า" }],
          },
        ],
      },
    });

    expect(result.canonicalShotDrafts[0]?.dialogueLines).toEqual([
      { speaker: "fifa", line: "บทพูดจากคลิปเก่า" },
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
