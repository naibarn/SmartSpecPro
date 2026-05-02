import { describe, expect, it } from "vitest";

import {
  buildCustomSkillPromptInputPayload,
  buildCustomSkillUserPrompt,
} from "../skillExecutionPromptBuilder";

describe("buildCustomSkillPromptInputPayload", () => {
  it("adds canonical @ImageN handles when reference images are present", () => {
    expect(buildCustomSkillPromptInputPayload(
      { topic: "cinematic dog and cat comedy" },
      { referenceImageCount: 2 },
    )).toEqual({
      topic: "cinematic dog and cat comedy",
      reference_images: ["@Image1", "@Image2"],
    });
  });

  it("redacts source video URLs while keeping the field visible", () => {
    expect(buildCustomSkillPromptInputPayload({
      source_video_url: "https://cdn.example.com/video.mp4",
      topic: "transform this clip into a moody teaser",
    })).toEqual({
      source_video_url: "[provided]",
      topic: "transform this clip into a moody teaser",
    });
  });

  it("drops multi-video-only fields when delivery_mode is single-video", () => {
    expect(buildCustomSkillPromptInputPayload({
      topic: "dog and cat comedy",
      delivery_mode: "multi_shot_single_video",
      multi_video_strategy: "continuous_story",
      video_count: 3,
      video_segments: [
        { duration_seconds: 5 },
        { duration_seconds: 5 },
        { duration_seconds: 5 },
      ],
    })).toEqual({
      topic: "dog and cat comedy",
      delivery_mode: "multi_shot_single_video",
    });
  });

  it("drops reference-image role defaults when no reference images are present", () => {
    expect(buildCustomSkillPromptInputPayload({
      topic: "dog and cat comedy",
      reference_image_1_role: "character_reference",
      reference_image_2_role: "character_reference",
      reference_image_notes: "@Image1 keeps the dog face and @Image2 keeps the cat face.",
    })).toEqual({
      topic: "dog and cat comedy",
    });
  });

  it("keeps only the role fields that match the actual uploaded reference image count", () => {
    expect(buildCustomSkillPromptInputPayload(
      {
        topic: "dog and cat comedy",
        reference_image_1_role: "character_reference",
        reference_image_2_role: "character_reference",
        reference_image_3_role: "scene_composition_reference",
      },
      { referenceImageCount: 1 },
    )).toEqual({
      topic: "dog and cat comedy",
      reference_image_1_role: "character_reference",
      reference_images: ["@Image1"],
    });
  });
});

describe("buildCustomSkillUserPrompt", () => {
  it("serializes structured user inputs so topic is always visible to the LLM", () => {
    const prompt = buildCustomSkillUserPrompt({
      topic: "หมากับแมวเดินคุยกัน ด้วยเรื่องตลก ๆ",
      delivery_mode: "multi_video",
      multi_video_strategy: "continuous_story",
    });

    expect(prompt).toContain("\"topic\": \"หมากับแมวเดินคุยกัน ด้วยเรื่องตลก ๆ\"");
    expect(prompt).toContain("\"delivery_mode\": \"multi_video\"");
    expect(prompt).toContain("do not ask the user to provide the topic");
  });

  it("explicitly tells the LLM not to invent image handles or multi-video packaging", () => {
    const prompt = buildCustomSkillUserPrompt({
      topic: "หมากับแมวเดินคุยกัน ด้วยเรื่องตลก ๆ",
      delivery_mode: "multi_shot_single_video",
    });

    expect(prompt).toContain("produce exactly one prompt package");
    expect(prompt).toContain("do not invent `@ImageN` handles");
  });

  it("instructs vision-capable skill runs to analyze and role-tag attached reference images", () => {
    const prompt = buildCustomSkillUserPrompt(
      {
        userIdea: "เล่าข่าวเทคโนโลยีพร้อมภาพประกอบ",
        contentMode: "news_narration",
      },
      { referenceImageCount: 3 },
    );

    expect(prompt).toContain("\"reference_images\": [");
    expect(prompt).toContain("@Image1");
    expect(prompt).toContain("Analyze every attached image with vision");
    expect(prompt).toContain("character/person identity");
    expect(prompt).toContain("product/brand/object");
    expect(prompt).toContain("scene/location/background");
  });

  it("tells text prompt skills to rewrite the source idea instead of returning it unchanged", () => {
    const prompt = buildCustomSkillUserPrompt({
      topic: "ภาพผู้หญิงสูงวัยวัย 18 ปี เดินเล่นริมทะเล",
      response_mode: "text_prompt",
      text_prompt_field: "detailed",
    });

    expect(prompt).toContain("rewrite and expand the user's source idea");
    expect(prompt).toContain("Do not return the source idea unchanged");
    expect(prompt).toContain("SOURCE_PROMPT_TO_REWRITE");
    expect(prompt).toContain("ภาพผู้หญิงสูงวัยวัย 18 ปี เดินเล่นริมทะเล");
    expect(prompt).toContain("Return plain prompt text only");
    expect(prompt).toContain("Write the final prompt in Thai");
    expect(prompt).toContain("input schema defaults");
    expect(prompt).toContain("Do not hard-code one fixed style");
  });

  it("falls back to a compact instruction when no user inputs are present", () => {
    expect(buildCustomSkillUserPrompt({})).toBe(
      "Please execute the skill and return only the final output requested by the system prompt.",
    );
  });
});
