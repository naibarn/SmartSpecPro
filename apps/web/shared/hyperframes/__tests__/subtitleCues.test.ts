import { describe, expect, it } from "vitest";

import {
  buildHyperframesReadableSubtitleTextFromTranscriptCues,
  buildHyperframesSubtitleCuesFromEditableText,
  getHyperframesSubtitlePreviewText,
} from "../subtitleCues";

describe("hyperframes subtitle cue helpers", () => {
  it("formats long transcribed Thai text into readable timed cues", () => {
    const text = buildHyperframesReadableSubtitleTextFromTranscriptCues(
      [
        {
          start: 0,
          end: 8,
          text: "คุณแม่ทราบกันไหมเรื่องพัฒนาการเด็ก ทำไมเด็กที่โตในแต่ละบ้านแตกต่างกัน เพราะว่าแต่ละบ้านเลี้ยงดูไม่เหมือนกัน",
        },
      ],
      30,
      { maxCharsPerCue: 42 },
    );

    const lines = text.split("\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every(line => /^\d+\.\d-\d+\.\d: .+/.test(line))).toBe(true);
    expect(lines.every(line => line.split(": ")[1]!.length <= 42)).toBe(true);
  });

  it("builds HyperFrames subtitle cues that stay inside the shot duration", () => {
    const cues = buildHyperframesSubtitleCuesFromEditableText(
      [
        "0.0-12.0: ประโยคนี้ยาวมากและควรถูกแบ่งเป็น subtitle ที่อ่านง่ายมากขึ้นเพื่อไม่ให้ล้นหน้าจอ",
        "12.0-45.0: ข้อความช่วงท้ายต้องถูก clamp ให้อยู่ใน shot นี้เท่านั้น",
      ].join("\n"),
      60,
      30,
      { maxCharsPerCue: 36 },
    );

    expect(cues.length).toBeGreaterThan(2);
    expect(cues.every(cue => cue.startSec >= 60)).toBe(true);
    expect(cues.every(cue => cue.endSec <= 90)).toBe(true);
    expect(cues.every(cue => cue.text.length <= 180)).toBe(true);
    expect(cues.every(cue => cue.endSec > cue.startSec)).toBe(true);
  });

  it("turns plain editable transcript text into timed cues instead of one dense cue", () => {
    const cues = buildHyperframesSubtitleCuesFromEditableText(
      "คุณแม่ทราบกันไหมเรื่องพัฒนาการเด็ก ทำไมเด็กแต่ละบ้านแตกต่างกัน เพราะการเลี้ยงดูส่งผลกับเด็กมาก",
      0,
      8,
      { maxCharsPerCue: 30 },
    );

    expect(cues.length).toBeGreaterThan(1);
    expect(cues[0]?.startSec).toBe(0);
    expect(cues.at(-1)?.endSec).toBeLessThanOrEqual(8);
  });

  it("returns clean active preview text without timestamp prefixes", () => {
    const text = [
      "0.0-3.1: คุณแม่ทราบกันไหมเรื่องพัฒนาการเด็ก",
      "3.1-6.9: ทำไมเด็กแต่ละบ้านแตกต่างกัน",
    ].join("\n");

    expect(getHyperframesSubtitlePreviewText(text, 8, 0.5)).toBe("คุณแม่ทราบกันไหมเรื่องพัฒนาการเด็ก");
    expect(getHyperframesSubtitlePreviewText(text, 8, 3.5)).toBe("ทำไมเด็กแต่ละบ้านแตกต่างกัน");
    expect(getHyperframesSubtitlePreviewText(text, 8, 3.5)).not.toContain("3.1-6.9");
  });
});
