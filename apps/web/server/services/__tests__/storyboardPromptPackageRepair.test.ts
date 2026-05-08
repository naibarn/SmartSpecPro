import { describe, expect, it } from "vitest";

import {
  buildAudioFirstStoryboardRepairPrompt,
  buildAudioFirstStoryboardSharedSectionsFallback,
  countStoryboardPromptBlocks,
  extractStoryboardSharedSections,
  mergeSharedSectionsWithPromptBlocks,
  resolveAudioFirstStoryboardPromptRepair,
  sanitizeAudioFirstStoryboardPromptBlocks,
  shouldUseAudioFirstStoryboardSharedSectionsFallback,
  stripSharedSectionsFromPromptBlocks,
  stripTrailingSharedSectionsAfterPromptBlocks,
} from "../storyboardPromptPackageRepair";

describe("storyboardPromptPackageRepair", () => {
  it("counts prompt headers with or without a space after PROMPT", () => {
    expect(countStoryboardPromptBlocks([
      "PROMPT1(8 seconds):",
      "Visual action: one",
      "PROMPT 2 (8 seconds):",
      "Visual action: two",
    ].join("\n"))).toBe(2);
  });

  it("requests repair when audio-first output has fewer prompts than required", () => {
    const repair = resolveAudioFirstStoryboardPromptRepair({
      skillId: "video-storyboard-to-prompts",
      userInputs: {
        contentMode: "storyboard",
        videoAudioWorkflow: "separate_voice",
        storyboardAudioDurationSeconds: 117,
        storyboardClipDurationSeconds: 8,
        storyboardAudioPromptCount: 15,
      },
      content: "PROMPT 1 (8 seconds):\nVisual action: one\n\nPROMPT 2 (8 seconds):\nVisual action: two",
    });

    expect(repair).toEqual({
      expectedPromptCount: 15,
      actualPromptCount: 2,
      clipDurationSeconds: 8,
      reason: "missing_prompt_blocks",
    });
  });

  it("requests repair when prompt count is complete but reference continuity is split", () => {
    const content = Array.from({ length: 15 }, (_, index) => [
      `PROMPT ${index + 1} (8 seconds):`,
      `Continuity Lock: same ${index % 2 === 0 ? "@Image1 mother" : "@Image2 baby"}, soft warm lighting.`,
      "A high-quality Realistic clip (8 seconds).",
      "Visual action: beat.",
    ].join("\n")).join("\n\n");

    const repair = resolveAudioFirstStoryboardPromptRepair({
      skillId: "video-storyboard-to-prompts",
      referenceImageCount: 2,
      userInputs: {
        contentMode: "storyboard",
        videoAudioWorkflow: "separate_voice",
        storyboardAudioDurationSeconds: 117,
        storyboardClipDurationSeconds: 8,
        storyboardAudioPromptCount: 15,
      },
      content,
    });

    expect(repair?.reason).toBe("weak_reference_continuity");
    expect(repair?.actualPromptCount).toBe(15);
  });

  it("does not request continuity repair when every prompt lock mentions both references", () => {
    const content = Array.from({ length: 15 }, (_, index) => [
      `PROMPT ${index + 1} (8 seconds):`,
      "Continuity Lock: same @Image1 Thai mother and @Image2 baby in the nursery.",
      "A high-quality Realistic clip (8 seconds).",
      "Visual action: beat.",
    ].join("\n")).join("\n\n");

    expect(resolveAudioFirstStoryboardPromptRepair({
      skillId: "video-storyboard-to-prompts",
      referenceImageCount: 2,
      userInputs: {
        contentMode: "storyboard",
        videoAudioWorkflow: "separate_voice",
        storyboardAudioDurationSeconds: 117,
        storyboardClipDurationSeconds: 8,
        storyboardAudioPromptCount: 15,
      },
      content,
    })).toBeNull();
  });

  it("strips shared notes appended after prompt blocks", () => {
    const content = [
      "PROMPT 1 (8 seconds):",
      "Visual action: one",
      "",
      "PROMPT 2 (8 seconds):",
      "Visual action: two",
      "",
      "REFERENCE NOTES",
      "@Image1 mother",
      "",
      "CONTINUITY NOTES",
      "same room",
    ].join("\n");

    expect(stripTrailingSharedSectionsAfterPromptBlocks(content)).toBe([
      "PROMPT 1 (8 seconds):",
      "Visual action: one",
      "",
      "PROMPT 2 (8 seconds):",
      "Visual action: two",
    ].join("\n"));
  });

  it("strips any shared sections from prompt blocks before merging fallback notes", () => {
    const content = [
      "REFERENCE NOTES",
      "fallback notes",
      "",
      "PROMPT 1 (8 seconds):",
      "Visual action: one",
      "",
      "PROMPT 2 (8 seconds):",
      "Visual action: two",
      "",
      "REFERENCE NOTES",
      "model notes",
      "",
      "CONTINUITY NOTES",
      "model continuity",
    ].join("\n");

    expect(stripSharedSectionsFromPromptBlocks(content)).toBe([
      "PROMPT 1 (8 seconds):",
      "Visual action: one",
      "",
      "PROMPT 2 (8 seconds):",
      "Visual action: two",
    ].join("\n"));
  });

  it("sanitizes audio and awkward visual phrasing from separate-voice prompt blocks", () => {
    const content = [
      "PROMPT 6 (8 seconds):",
      "Visual action: The mother hums a lullaby while gently rocking the baby.",
      "Continuity Transition: The baby continues to fuss, prompting the mother to presents visually to him.",
      "",
      "PROMPT 10 (8 seconds):",
      "Visual action: The mother whispers soft words of comfort as she rocks the baby.",
      "Camera: Close-up shot of the mother’s face as she presents visually softly.",
      "",
      "PROMPT 11 (8 seconds):",
      "Visual action: The mother softly sings a lullaby to the baby.",
      "Continuity Transition: The camera captures the mother’s gentle expression while singing.",
    ].join("\n");

    expect(sanitizeAudioFirstStoryboardPromptBlocks(content)).toBe([
      "PROMPT 6 (8 seconds):",
      "Visual action: The mother gently rocks the baby with a calm, soothing expression.",
      "Continuity Transition: The baby continues to fuss, prompting the mother to lean closer with a gentle expression.",
      "",
      "PROMPT 10 (8 seconds):",
      "Visual action: The mother comforts the baby with silent, gentle rocking and a tender expression.",
      "Camera: Close-up shot of the mother’s face as she gazes gently.",
      "",
      "PROMPT 11 (8 seconds):",
      "Visual action: The mother comforts the baby with silent, gentle rocking and a calm, loving expression.",
      "Continuity Transition: The camera captures the mother’s gentle expression with a calm, loving expression.",
    ].join("\n"));
  });

  it("extracts shared reference and continuity notes so repair can preserve UI support cards", () => {
    const content = [
      "PROMPT 1 (8 seconds):",
      "Visual action: one",
      "",
      "REFERENCE NOTES:",
      "@Image1 mother",
      "@Image2 baby",
      "",
      "CONTINUITY NOTES",
      "Same nursery.",
      "Same warm lighting.",
      "",
      "PROMPT 2 (8 seconds):",
      "Visual action: two",
    ].join("\n");

    expect(extractStoryboardSharedSections(content)).toBe([
      "REFERENCE NOTES",
      "@Image1 mother",
      "@Image2 baby",
      "",
      "CONTINUITY NOTES",
      "Same nursery.",
      "Same warm lighting.",
    ].join("\n"));
  });

  it("merges preserved shared notes before repaired prompt blocks", () => {
    expect(mergeSharedSectionsWithPromptBlocks(
      "REFERENCE NOTES:\n@Image1 mother\n\nCONTINUITY NOTES:\nSame room",
      "PROMPT 1 (8 seconds):\nVisual action: one\n\nREFERENCE NOTES:\nold",
    )).toBe([
      "REFERENCE NOTES",
      "@Image1 mother",
      "",
      "CONTINUITY NOTES",
      "Same room",
      "",
      "PROMPT 1 (8 seconds):",
      "Visual action: one",
    ].join("\n"));
  });

  it("builds fallback shared notes for audio-first storyboard packages when the model omits them", () => {
    const notes = buildAudioFirstStoryboardSharedSectionsFallback({
      skillId: "video-storyboard-to-prompts",
      referenceImageCount: 2,
      userInputs: {
        contentMode: "storyboard",
        videoAudioWorkflow: "separate_voice",
        storyboardAudioDurationSeconds: 117,
        storyboardClipDurationSeconds: 8,
        storyboardAudioPromptCount: 15,
        storyBible: "คุณแม่ตามภาพที่หนึ่ง อยู่ในห้องนอนเด็กหรูหรา",
        visualBible: "เด็กตามภาพที่สอง",
      },
    });

    expect(notes).toContain("REFERENCE NOTES");
    expect(notes).toContain("@Image1 is the recurring mother character reference");
    expect(notes).toContain("@Image2 is the recurring baby character reference");
    expect(notes).toContain("CONTINUITY NOTES");
    expect(notes).toContain("Story Arc: Restless baby wakes and cries at night");
  });

  it("prefers fallback shared notes for two-image audio-first storyboard packages", () => {
    expect(shouldUseAudioFirstStoryboardSharedSectionsFallback({
      skillId: "video-storyboard-to-prompts",
      referenceImageCount: 2,
      userInputs: {
        contentMode: "storyboard",
        videoAudioWorkflow: "separate_voice",
        storyboardAudioDurationSeconds: 117,
        storyboardClipDurationSeconds: 8,
        storyboardAudioPromptCount: 15,
      },
    })).toBe(true);
  });

  it("builds a concise repair prompt that asks for prompt blocks only", () => {
    const prompt = buildAudioFirstStoryboardRepairPrompt({
      userInputs: {
        userIdea: "เด็กตื่นร้องตอนกลางคืน",
        videoAudioWorkflow: "separate_voice",
      },
      previousContent: "REFERENCE NOTES:\nlong notes\n\nPROMPT 1 (8 seconds):\nVisual action: one",
      expectedPromptCount: 15,
      actualPromptCount: 1,
      clipDurationSeconds: 8,
    });

    expect(prompt).toContain("exactly PROMPT 1 through PROMPT 15");
    expect(prompt).toContain("PROMPT N (8 seconds):");
    expect(prompt).toContain("Return only the prompt blocks");
    expect(prompt).toContain("Do not output REFERENCE NOTES");
    expect(prompt).toContain("A high-quality Realistic clip (8 seconds).");
    expect(prompt).toContain("Do not write 'High-Quality Clip Line:'");
    expect(prompt).toContain("@Image1 Thai mother");
    expect(prompt).toContain("@Image2 Thai 6-month-old baby boy");
    expect(prompt).toContain("humming");
    expect(prompt).toContain("Do not stop early");
  });
});
