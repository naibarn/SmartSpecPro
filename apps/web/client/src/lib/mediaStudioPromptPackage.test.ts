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
});
