import { describe, expect, it } from "vitest";

import { composePromptWithNotes, parseMediaStudioPromptPackage } from "./mediaStudioPromptPackage";

describe("parseMediaStudioPromptPackage", () => {
  it("parses structured JSON output and extracts prompt plus notes separately", () => {
    const input = JSON.stringify({
      continuity_package: {
        continuity_notes: "Keep the same dog and cat identities in every clip.",
        reference_notes: "Use @Image1 and @Image2 for the characters.",
      },
      prompt_sequence: [
        {
          prompt_id: "Prompt 1",
          prompt: "A dog and a cat chat in a bright garden.",
          continuity_notes: "Keep the same dog and cat identities in every clip.",
          reference_notes: "Use @Image1 and @Image2 for the characters.",
        },
      ],
      final_prompt: "Prompt 1:\nA dog and a cat chat in a bright garden.\nContinuity Notes:\nKeep the same dog and cat identities in every clip.\nReference Notes:\nUse @Image1 and @Image2 for the characters.",
    });

    expect(parseMediaStudioPromptPackage(input)).toEqual({
      promptText: "A dog and a cat chat in a bright garden.",
      continuityNotes: "Keep the same dog and cat identities in every clip.",
      referenceNotes: "Use @Image1 and @Image2 for the characters.",
      promptSequence: ["A dog and a cat chat in a bright garden."],
      source: "structured_json",
    });
  });

  it("parses multi-video plain text packs and strips note sections from the prompt display text", () => {
    const input = [
      "Prompt 1:",
      "A dog walks toward a cat in a colorful garden.",
      "Continuity Notes:",
      "Keep the same garden and same two animals.",
      "Reference Notes:",
      "Use @Image1 and @Image2 for the characters.",
      "",
      "Prompt 2:",
      "The cat answers while sunlight moves through the trees.",
      "Continuity Notes:",
      "Keep the same garden and same two animals.",
      "Reference Notes:",
      "Use @Image1 and @Image2 for the characters.",
    ].join("\n");

    expect(parseMediaStudioPromptPackage(input)).toEqual({
      promptText: [
        "Prompt 1:\nA dog walks toward a cat in a colorful garden.",
        "Prompt 2:\nThe cat answers while sunlight moves through the trees.",
      ].join("\n\n"),
      continuityNotes: "Keep the same garden and same two animals.",
      referenceNotes: "Use @Image1 and @Image2 for the characters.",
      promptSequence: [
        "Prompt 1:\nA dog walks toward a cat in a colorful garden.",
        "Prompt 2:\nThe cat answers while sunlight moves through the trees.",
      ],
      source: "plain_text",
    });
  });

  it("extracts generated continuity and reference notes from a top-level skill preamble", () => {
    const input = [
      "REFERENCE NOTES:",
      "Generated reference bible: same Thai news anchor, same glass desk, same MiMo product wall behind every clip.",
      "",
      "CONTINUITY NOTES:",
      "Story arc: headline, core fact, workflow impact, cost caveat, balanced summary. Keep the same anchor identity and newsroom visual language across all prompts.",
      "",
      "VEO 3.1 SETTINGS:",
      "Model: veo3_lite",
      "Generation Type: TEXT_2_VIDEO",
      "",
      "NEWS BEAT PLAN:",
      "Beat 1: hook",
      "Beat 2: why it matters",
      "",
      "PROMPT 1 (8 seconds):",
      "Continuity Lock: same Thai news anchor and same MiMo product wall.",
      "ผู้ประกาศพูดเป็นภาษาไทยว่า \"Xiaomi เปิดตัว MiMo รุ่นใหม่\"",
      "",
      "PROMPT 2 (8 seconds):",
      "Continuity Lock: same Thai news anchor and same MiMo product wall.",
      "ผู้ประกาศพูดเป็นภาษาไทยว่า \"จุดเด่นคือทำงานยาวขึ้น\"",
    ].join("\n");

    expect(parseMediaStudioPromptPackage(input)).toEqual({
      promptText: [
        "PROMPT 1 (8 seconds):",
        "Continuity Lock: same Thai news anchor and same MiMo product wall.",
        "ผู้ประกาศพูดเป็นภาษาไทยว่า \"Xiaomi เปิดตัว MiMo รุ่นใหม่\"",
        "",
        "PROMPT 2 (8 seconds):",
        "Continuity Lock: same Thai news anchor and same MiMo product wall.",
        "ผู้ประกาศพูดเป็นภาษาไทยว่า \"จุดเด่นคือทำงานยาวขึ้น\"",
      ].join("\n"),
      continuityNotes: "Story arc: headline, core fact, workflow impact, cost caveat, balanced summary. Keep the same anchor identity and newsroom visual language across all prompts.",
      referenceNotes: "Generated reference bible: same Thai news anchor, same glass desk, same MiMo product wall behind every clip.",
      promptSequence: [
        [
          "PROMPT 1 (8 seconds):",
          "Continuity Lock: same Thai news anchor and same MiMo product wall.",
          "ผู้ประกาศพูดเป็นภาษาไทยว่า \"Xiaomi เปิดตัว MiMo รุ่นใหม่\"",
        ].join("\n"),
        [
          "PROMPT 2 (8 seconds):",
          "Continuity Lock: same Thai news anchor and same MiMo product wall.",
          "ผู้ประกาศพูดเป็นภาษาไทยว่า \"จุดเด่นคือทำงานยาวขึ้น\"",
        ].join("\n"),
      ],
      source: "plain_text",
    });
  });

  it("extracts trailing generated notes after the final prompt block", () => {
    const input = [
      "PROMPT 1 (8 seconds):",
      "Continuity Lock: same Thai anchor in the same studio.",
      "ผู้ประกาศพูดเป็นภาษาไทยว่า \"Xiaomi เปิดตัว MiMo รุ่นใหม่\"",
      "",
      "PROMPT 2 (8 seconds):",
      "Continuity Lock: same Thai anchor in the same studio.",
      "ผู้ประกาศพูดเป็นภาษาไทยว่า \"จุดเด่นคือรองรับบริบทยาวขึ้น\"",
      "",
      "REFERENCE NOTES",
      "Same Thai presenter, glass desk, vertical newsroom visual wall, AI workflow visuals.",
      "",
      "CONTINUITY NOTES",
      "Fixed identity and same 9:16 medium newsroom framing across the complete news segment.",
    ].join("\n");

    expect(parseMediaStudioPromptPackage(input)).toEqual({
      promptText: [
        "PROMPT 1 (8 seconds):",
        "Continuity Lock: same Thai anchor in the same studio.",
        "ผู้ประกาศพูดเป็นภาษาไทยว่า \"Xiaomi เปิดตัว MiMo รุ่นใหม่\"",
        "",
        "PROMPT 2 (8 seconds):",
        "Continuity Lock: same Thai anchor in the same studio.",
        "ผู้ประกาศพูดเป็นภาษาไทยว่า \"จุดเด่นคือรองรับบริบทยาวขึ้น\"",
      ].join("\n"),
      continuityNotes: "Fixed identity and same 9:16 medium newsroom framing across the complete news segment.",
      referenceNotes: "Same Thai presenter, glass desk, vertical newsroom visual wall, AI workflow visuals.",
      promptSequence: [
        [
          "PROMPT 1 (8 seconds):",
          "Continuity Lock: same Thai anchor in the same studio.",
          "ผู้ประกาศพูดเป็นภาษาไทยว่า \"Xiaomi เปิดตัว MiMo รุ่นใหม่\"",
        ].join("\n"),
        [
          "PROMPT 2 (8 seconds):",
          "Continuity Lock: same Thai anchor in the same studio.",
          "ผู้ประกาศพูดเป็นภาษาไทยว่า \"จุดเด่นคือรองรับบริบทยาวขึ้น\"",
        ].join("\n"),
      ],
      source: "plain_text",
    });
  });

  it("extracts generated continuity and reference notes from Thai heading aliases", () => {
    const input = [
      "บันทึกภาพอ้างอิง:",
      "ใช้ @Image1 เป็นผู้นำเสนอหลัก และคงฉาก newsroom เดิมทุกคลิป",
      "",
      "บันทึกความต่อเนื่อง:",
      "เล่าเรื่องต่อเนื่องจากประเด็นเปิดตัว ไปสู่ผลกระทบด้านต้นทุน แล้วจบด้วยข้อควรระวัง",
      "",
      "PROMPT 1 (8 seconds):",
      "ผู้ประกาศพูดเป็นภาษาไทยว่า \"Xiaomi เปิดตัว MiMo รุ่นใหม่\"",
    ].join("\n");

    expect(parseMediaStudioPromptPackage(input)).toEqual({
      promptText: [
        "PROMPT 1 (8 seconds):",
        "ผู้ประกาศพูดเป็นภาษาไทยว่า \"Xiaomi เปิดตัว MiMo รุ่นใหม่\"",
      ].join("\n"),
      continuityNotes: "เล่าเรื่องต่อเนื่องจากประเด็นเปิดตัว ไปสู่ผลกระทบด้านต้นทุน แล้วจบด้วยข้อควรระวัง",
      referenceNotes: "ใช้ @Image1 เป็นผู้นำเสนอหลัก และคงฉาก newsroom เดิมทุกคลิป",
      promptSequence: [
        [
          "PROMPT 1 (8 seconds):",
          "ผู้ประกาศพูดเป็นภาษาไทยว่า \"Xiaomi เปิดตัว MiMo รุ่นใหม่\"",
        ].join("\n"),
      ],
      source: "plain_text",
    });
  });

  it("parses structured JSON wrapped in a markdown code fence", () => {
    const input = [
      "```json",
      JSON.stringify({
        continuity_package: {
          continuity_notes: "Keep the same rainy alley and courier silhouette.",
          reference_notes: "Use @Image1 for the courier and @Image2 for the alley.",
        },
        prompt: "A courier pauses beneath neon rain in Bangkok.",
      }, null, 2),
      "```",
    ].join("\n");

    expect(parseMediaStudioPromptPackage(input)).toEqual({
      promptText: "A courier pauses beneath neon rain in Bangkok.",
      continuityNotes: "Keep the same rainy alley and courier silhouette.",
      referenceNotes: "Use @Image1 for the courier and @Image2 for the alley.",
      promptSequence: ["A courier pauses beneath neon rain in Bangkok."],
      source: "structured_json",
    });
  });

  it("parses camelCase continuityPackage structured output", () => {
    const input = JSON.stringify({
      continuityPackage: {
        continuityNotes: "Keep the same presenter, studio wall, and Xiaomi AI explainer arc.",
        referenceNotes: "Generated visual bible: MiMo logo wall, code workflow UI, token meter graphics.",
        continuityLock: "Same Thai presenter in the same AI newsroom.",
      },
      prompt_sequence: [
        {
          prompt_id: "PROMPT 1 (8 seconds):",
          prompt: "Continuity Lock: Same Thai presenter in the same AI newsroom.",
        },
      ],
    });

    expect(parseMediaStudioPromptPackage(input)).toMatchObject({
      continuityNotes: "Keep the same presenter, studio wall, and Xiaomi AI explainer arc.",
      referenceNotes: "Generated visual bible: MiMo logo wall, code workflow UI, token meter graphics.",
      promptSequence: ["Continuity Lock: Same Thai presenter in the same AI newsroom."],
      source: "structured_json",
    });
  });

  it("parses video-storyboard structured videoPrompts output", () => {
    const input = JSON.stringify({
      continuityPackage: {
        continuityNotes: "Same presenter, same studio, same visual wall through the complete segment.",
        referenceNotes: "Use the attached presenter photo as identity reference.",
      },
      audioWorkflow: {
        voiceoverScript: "OpenAI ออกอัปเดต Codex CLI รุ่นใหม่",
      },
      videoPrompts: [
        {
          sceneNumber: 1,
          durationSeconds: 8,
          prompt: "Continuity Lock: same presenter in a modern studio.\nA visual-only opening shot.",
        },
        {
          sceneNumber: 2,
          durationSeconds: 8,
          prompt: "Continuity Lock: same presenter in a modern studio.\nA visual-only follow-up shot.",
        },
      ],
    });

    expect(parseMediaStudioPromptPackage(input)).toMatchObject({
      promptText: [
        "PROMPT 1 (8 seconds):",
        "Continuity Lock: same presenter in a modern studio.",
        "A visual-only opening shot.",
        "",
        "PROMPT 2 (8 seconds):",
        "Continuity Lock: same presenter in a modern studio.",
        "A visual-only follow-up shot.",
      ].join("\n"),
      continuityNotes: "Same presenter, same studio, same visual wall through the complete segment.",
      referenceNotes: "Use the attached presenter photo as identity reference.",
      promptSequence: [
        [
          "PROMPT 1 (8 seconds):",
          "Continuity Lock: same presenter in a modern studio.",
          "A visual-only opening shot.",
        ].join("\n"),
        [
          "PROMPT 2 (8 seconds):",
          "Continuity Lock: same presenter in a modern studio.",
          "A visual-only follow-up shot.",
        ].join("\n"),
      ],
      source: "structured_json",
    });
  });

  it("extracts the detailed prompt from image prompt engineer bundle JSON", () => {
    const input = JSON.stringify({
      status: "completed",
      prompts: {
        short: "Create a sunset portrait.",
        detailed: "Create a high-quality cinematic portrait at sunset with warm light and clean composition.",
        structured: "Topic: sunset portrait\nLighting: golden hour",
        negative_constraints: "watermark, blurry details",
        variants: [
          "Create a high-quality cinematic portrait at sunset with warm light and clean composition.",
          "Create a premium cinematic sunset portrait with refined warm color grading.",
        ],
      },
      quality_review: {
        pass_count: 1,
      },
      safety_review: {
        level: "standard",
      },
    });

    expect(parseMediaStudioPromptPackage(input)).toEqual({
      promptText: "Create a high-quality cinematic portrait at sunset with warm light and clean composition.",
      continuityNotes: "",
      referenceNotes: "",
      promptSequence: [
        "Create a high-quality cinematic portrait at sunset with warm light and clean composition.",
        "Create a premium cinematic sunset portrait with refined warm color grading.",
      ],
      source: "structured_json",
    });
  });

  it("extracts prompts from prompt_variants bundle JSON", () => {
    const input = JSON.stringify({
      prompt_variants: [
        {
          prompt: "A young child walking along the beach with soft warm lighting and gentle ocean waves.",
          edit_prompt: "Enhance the colors to make the scene more vibrant.",
        },
        {
          prompt: "A playful child running on the sandy beach at sunset, laughing as ocean waves splash nearby.",
          edit_prompt: "Add a slight vignette and enhance the sunset colors.",
        },
      ],
      quality_review: {
        pass_count: 1,
      },
    });

    expect(parseMediaStudioPromptPackage(input)).toEqual({
      promptText: [
        "A young child walking along the beach with soft warm lighting and gentle ocean waves.",
        "A playful child running on the sandy beach at sunset, laughing as ocean waves splash nearby.",
      ].join("\n\n"),
      continuityNotes: "",
      referenceNotes: "",
      promptSequence: [
        "A young child walking along the beach with soft warm lighting and gentle ocean waves.",
        "A playful child running on the sandy beach at sunset, laughing as ocean waves splash nearby.",
      ],
      source: "structured_json",
    });
  });

  it("drops absence-only reference note boilerplate from structured outputs", () => {
    const input = JSON.stringify({
      continuity_package: {
        continuity_notes: "Keep the same sunny park mood.",
        reference_notes: "ไม่มีภาพอ้างอิงที่แนบมา",
      },
      prompt: "A dog and a cat talk in a sunny park.",
    });

    expect(parseMediaStudioPromptPackage(input)).toEqual({
      promptText: "A dog and a cat talk in a sunny park.",
      continuityNotes: "Keep the same sunny park mood.",
      referenceNotes: "",
      promptSequence: ["A dog and a cat talk in a sunny park."],
      source: "structured_json",
    });
  });

  it("keeps useful reference guidance while stripping leading no-image boilerplate", () => {
    const input = JSON.stringify({
      continuity_package: {
        continuity_notes: "Keep the same dog and cat identities.",
        reference_notes: "No uploaded reference images were used. Keep the same large brown dog with floppy ears and the same small black-and-white cat with alert eyes in every beat.",
      },
      prompt: "A dog and a cat share a joke in a garden.",
    });

    expect(parseMediaStudioPromptPackage(input)).toEqual({
      promptText: "A dog and a cat share a joke in a garden.",
      continuityNotes: "Keep the same dog and cat identities.",
      referenceNotes: "Keep the same large brown dog with floppy ears and the same small black-and-white cat with alert eyes in every beat.",
      promptSequence: ["A dog and a cat share a joke in a garden."],
      source: "structured_json",
    });
  });
});

describe("composePromptWithNotes", () => {
  it("recombines prompt, reference notes, and continuity notes for generation", () => {
    expect(composePromptWithNotes({
      prompt: "A dog and a cat share a funny conversation in a vibrant garden.",
      referenceNotes: "Use @Image1 and @Image2 for character consistency.",
      continuityNotes: "Keep the same garden lighting and playful energy.",
    })).toBe([
      "A dog and a cat share a funny conversation in a vibrant garden.",
      "",
      "Reference Notes:",
      "Use @Image1 and @Image2 for character consistency.",
      "",
      "Continuity Notes:",
      "Keep the same garden lighting and playful energy.",
    ].join("\n"));
  });

  it("does not re-add absence-only reference note boilerplate during composition", () => {
    expect(composePromptWithNotes({
      prompt: "A dog and a cat share a funny conversation in a vibrant garden.",
      referenceNotes: "ไม่มีภาพอ้างอิงที่แนบมา",
      continuityNotes: "Keep the same garden lighting and playful energy.",
    })).toBe([
      "A dog and a cat share a funny conversation in a vibrant garden.",
      "",
      "Continuity Notes:",
      "Keep the same garden lighting and playful energy.",
    ].join("\n"));
  });

  it("can prepend notes before the prompt for video generation", () => {
    expect(composePromptWithNotes({
      prompt: "A news anchor introduces Xiaomi MiMo in a bright AI newsroom.",
      referenceNotes: "Generated visual bible: same anchor, desk, and MiMo wall.",
      continuityNotes: "Story arc: headline, context, cost claim, caveat, summary.",
      placement: "before",
    })).toBe([
      "Reference Notes:",
      "Generated visual bible: same anchor, desk, and MiMo wall.",
      "",
      "Continuity Notes:",
      "Story arc: headline, context, cost claim, caveat, summary.",
      "",
      "A news anchor introduces Xiaomi MiMo in a bright AI newsroom.",
    ].join("\n"));
  });
});
