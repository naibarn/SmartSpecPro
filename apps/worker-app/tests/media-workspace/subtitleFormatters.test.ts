import { expect, it } from "vitest";
import { escapeAssText, generateAss, generateSrt, generateVtt } from "../../src/screens/media-workspace/subtitleFormatters";

it("escapes ASS override syntax and converts line breaks", () => {
  expect(escapeAssText("a\\b {tag}\nc")).toBe("a\\\\b \\{tag\\}\\Nc");
  const output = generateAss([{ id: "cue-1", startMs: 0, endMs: 1200, text: "a\\b {tag}" }]);
  expect(output).toContain("a\\\\b \\{tag\\}");
});

it("keeps exact measured cue bounds in SRT and VTT", () => {
  const segments = [{ id: "cue-1", startMs: 125, endMs: 875, text: "สวัสดี" }];
  expect(generateSrt(segments)).toContain("00:00:00,125 --> 00:00:00,875");
  expect(generateVtt(segments)).toContain("00:00:00.125 --> 00:00:00.875");
});

it("escapes word highlight content instead of treating it as ASS markup", () => {
  const output = generateAss([{
    id: "cue-1", startMs: 0, endMs: 1200, text: "fallback",
    words: [{ word: "{คำ}", startMs: 10, endMs: 100 }],
  }]);
  expect(output).toContain("{\\1c&H00FFFF&}\\{คำ\\}{\\r}");
});
