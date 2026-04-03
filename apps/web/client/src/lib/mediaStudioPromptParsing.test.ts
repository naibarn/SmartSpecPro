import { describe, expect, it } from "vitest";
import { applySharedContextToMultiVideoText, parseMultiVideoPrompts, splitMultiVideoPromptOutput } from "./mediaStudioPromptParsing";

describe("parseMultiVideoPrompts", () => {
  it("splits prompts and prepends shared context to each one", () => {
    const input = [
      "SHARED CONTINUITY PREAMBLE:",
      "CAST LOCK: yellow dog in a blue collar. Same park, same red ball.",
      "",
      "PROMPT 1 (8 seconds):",
      "A high-quality Realistic clip (8 seconds).",
      "Speaker: เด็กชาย",
      "",
      "PROMPT 2 (8 seconds):",
      "A high-quality Realistic clip (8 seconds).",
      "Speaker: เด็กหญิง",
    ].join("\n");

    expect(parseMultiVideoPrompts(input)).toEqual([
      "CAST LOCK: yellow dog in a blue collar. Same park, same red ball.\n\nA high-quality Realistic clip (8 seconds).\nSpeaker: เด็กชาย",
      "CAST LOCK: yellow dog in a blue collar. Same park, same red ball.\n\nA high-quality Realistic clip (8 seconds).\nSpeaker: เด็กหญิง",
    ]);
  });

  it("splits out shared continuity notes separately", () => {
    const input = [
      "REFERENCE NOTES:",
      "Yellow dog with a blue collar, red bandana, same grassy park.",
      "",
      "PROMPT 1 (8 seconds):",
      "Speaker: เด็กชาย",
      "",
      "PROMPT 2 (8 seconds):",
      "Speaker: เด็กหญิง",
    ].join("\n");

    expect(splitMultiVideoPromptOutput(input)).toEqual({
      sharedContext: "Yellow dog with a blue collar, red bandana, same grassy park.",
      prompts: [
        "Speaker: เด็กชาย",
        "Speaker: เด็กหญิง",
      ],
    });
  });

  it("returns an empty array when no prompt markers are present", () => {
    expect(parseMultiVideoPrompts("A single prompt without markers")).toEqual([]);
  });

  it("also splits other scene-like markers for future compatible skills", () => {
    const input = [
      "Shared world description that should repeat.",
      "",
      "SCENE 1 (4 seconds):",
      "Speaker: Cat",
      "",
      "SCENE 2 (4 seconds):",
      "Speaker: Dog",
    ].join("\n");

    expect(parseMultiVideoPrompts(input)).toEqual([
      "Shared world description that should repeat.\n\nSpeaker: Cat",
      "Shared world description that should repeat.\n\nSpeaker: Dog",
    ]);
  });

  it("replaces the shared continuity paragraph without disturbing prompt markers", () => {
    const input = [
      "REFERENCE NOTES:",
      "Yellow dog in a blue collar.",
      "",
      "PROMPT 1 (8 seconds):",
      "Speaker: เด็กชาย",
      "",
      "PROMPT 2 (8 seconds):",
      "Speaker: เด็กหญิง",
    ].join("\n");

    expect(applySharedContextToMultiVideoText(input, "Yellow dog with a red bandana.")).toBe(
      [
        "REFERENCE NOTES:",
        "Yellow dog with a red bandana.",
        "",
        "PROMPT 1 (8 seconds):",
        "Speaker: เด็กชาย",
        "",
        "PROMPT 2 (8 seconds):",
        "Speaker: เด็กหญิง",
      ].join("\n"),
    );
  });

  it("injects shared continuity notes when none exist yet", () => {
    const input = [
      "PROMPT 1 (8 seconds):",
      "Speaker: Cat",
      "",
      "PROMPT 2 (8 seconds):",
      "Speaker: Dog",
    ].join("\n");

    expect(applySharedContextToMultiVideoText(input, "Shared continuity note.")).toBe(
      [
        "REFERENCE NOTES:",
        "Shared continuity note.",
        "",
        "PROMPT 1 (8 seconds):",
        "Speaker: Cat",
        "",
        "PROMPT 2 (8 seconds):",
        "Speaker: Dog",
      ].join("\n"),
    );
  });
});
