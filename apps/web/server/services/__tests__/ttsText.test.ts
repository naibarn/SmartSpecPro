import { describe, expect, it } from "vitest";

import { normalizeTextForTts, resolveTtsTextFromSlideNote } from "../ttsText";

describe("ttsText", () => {
  it("normalizes slide-note punctuation and symbols for TTS", () => {
    expect(
      normalizeTextForTts("หัวข้อหลัก • ข้อแรก + ข้อสอง / ข้อสาม | ข้อสี่"),
    ).toBe("หัวข้อหลัก, ข้อแรก, ข้อสอง, ข้อสาม, ข้อสี่");
  });

  it("removes markdown and decorative wrappers while keeping readable text", () => {
    expect(
      normalizeTextForTts("## **Sleep Tips**\n> [Open guide](https://example.com)\n- keep calm\n- stay close"),
    ).toBe("Sleep Tips Open guide - keep calm - stay close");
  });

  it("prefers slide note text over fallback narration text", () => {
    expect(
      resolveTtsTextFromSlideNote("หมายเหตุ • บรรทัดหนึ่ง", "Fallback title. Fallback body."),
    ).toBe("หมายเหตุ, บรรทัดหนึ่ง");
  });

  it("uses fallback narration when no note is available", () => {
    expect(
      resolveTtsTextFromSlideNote("", "Visible title / visible body"),
    ).toBe("Visible title, visible body");
  });
});
