import { describe, expect, it } from "vitest";
import {
  buildNativeDialogueVerbatimBlock,
  NATIVE_DIALOGUE_BLOCK_MARKER,
} from "./nativeDialogue";

const MULTI_SPEAKER_RULES =
  "Native dialogue (verbatim) — LIP-SYNC RULES: every line is spoken naturally in Thai, verbatim — never transfer, reorder, paraphrase, or invent lines. Only the named speaker per line may move their lips; every other established character is a SILENT LISTENER with mouth fully closed — never two characters speaking or lip-moving at once, one visible speaking face per line. Lips move only during that speaker's own line, never during a camera transition. No narration, subtitles, captions, or background voices.";

const SINGLE_SPEAKER_RULES =
  "Native dialogue (verbatim) — LIP-SYNC RULES: every line is spoken naturally in Thai, verbatim — never transfer, reorder, paraphrase, or invent lines. Lips move only during that speaker's own line, never during a camera transition. No narration, subtitles, captions, or background voices.";

describe("buildNativeDialogueVerbatimBlock", () => {
  it("returns an empty string when there are no non-empty lines", () => {
    expect(buildNativeDialogueVerbatimBlock([])).toBe("");
    expect(buildNativeDialogueVerbatimBlock([{ lineTh: "   " }])).toBe("");
  });

  it("builds a single-speaker block with the always-on rules header (no listener clause) and no attribution when no speaker info is given", () => {
    const result = buildNativeDialogueVerbatimBlock([{ lineTh: "Hello there" }]);
    expect(result).toBe(`${SINGLE_SPEAKER_RULES}\n"Hello there"`);
  });

  it("attributes lines to characterKey when no speakerName is resolved", () => {
    const result = buildNativeDialogueVerbatimBlock([
      { characterKey: "alice", lineTh: "First line" },
      { characterKey: "alice", lineTh: "Second line" },
      { characterKey: "bob", lineTh: "Third line" },
    ]);
    expect(result).toBe(
      `${MULTI_SPEAKER_RULES}\nalice: "First line"\nalice: "Second line"\nbob: "Third line"`,
    );
  });

  it("names each speaker by DISPLAY NAME and includes listener-silence rules for 2+ distinct speakers", () => {
    const result = buildNativeDialogueVerbatimBlock([
      { characterKey: "character-1", speakerName: "กล้า", lineTh: "ถือขนมไปไหน" },
      { characterKey: "character-2", speakerName: "หนูนา", lineTh: "จะเอาไปให้ยาย" },
    ]);
    expect(result).toBe(
      `${MULTI_SPEAKER_RULES}\nกล้า: "ถือขนมไปไหน"\nหนูนา: "จะเอาไปให้ยาย"`,
    );
    // Every source line still appears verbatim, in quotes.
    expect(result).toContain('"ถือขนมไปไหน"');
    expect(result).toContain('"จะเอาไปให้ยาย"');
  });

  it("omits the listener-silence clauses for a single resolved speaker even across multiple lines", () => {
    const result = buildNativeDialogueVerbatimBlock([
      { characterKey: "character-1", speakerName: "กล้า", lineTh: "First" },
      { characterKey: "character-1", speakerName: "กล้า", lineTh: "Second" },
    ]);
    expect(result.startsWith(SINGLE_SPEAKER_RULES)).toBe(true);
    expect(result).not.toContain("SILENT LISTENER");
  });

  it("includes listener-silence clauses when establishedCharacterCount signals 2+ characters even with only one speaking line", () => {
    const result = buildNativeDialogueVerbatimBlock(
      [{ characterKey: "character-1", speakerName: "กล้า", lineTh: "Only line" }],
      { establishedCharacterCount: 2 },
    );
    expect(result).toContain("SILENT LISTENER");
  });

  it("respects a custom dialogueLanguageName in the header", () => {
    const result = buildNativeDialogueVerbatimBlock([{ lineTh: "Hello" }], {
      dialogueLanguageName: "English",
    });
    expect(result).toContain("spoken naturally in English");
  });

  it("preserves source order without deduplicating repeated lines", () => {
    const result = buildNativeDialogueVerbatimBlock([
      { lineTh: "พูดซ้ำ" },
      { lineTh: "พูดซ้ำ" },
      { lineTh: "ประโยคสุดท้าย" },
    ]);
    const lines = result.split("\n").slice(1);
    expect(lines).toEqual(['"พูดซ้ำ"', '"พูดซ้ำ"', '"ประโยคสุดท้าย"']);
  });

  it("always starts with the stable NATIVE_DIALOGUE_BLOCK_MARKER", () => {
    const result = buildNativeDialogueVerbatimBlock([{ lineTh: "Hi" }]);
    expect(result.startsWith(NATIVE_DIALOGUE_BLOCK_MARKER)).toBe(true);
  });
});
