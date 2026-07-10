/**
 * Coverage for `storyScriptText.ts`'s parser-robustness fixes (2026-07-10,
 * "ปรับปรุงบทละครให้มีความสมบูรณ์" retry-until-pass + parser-fragility fix —
 * see `planning/`/plan doc `polished-toasting-gadget.md`). Confirmed via
 * direct raw-LLM-response inspection on a real 6-episode production run:
 * episode 2 wrapped every header/label in markdown bold, episode 4 wrote a
 * stray "จุดค้าง:" after every shot (not just the last), episode 5 put a
 * blank line between shots — all three are pure parser-fragility bugs, not
 * content-quality problems. This file only exercises the PARSE direction
 * (`splitStoryScriptTextIntoEpisodeBlocks`/`parseStoryScriptEpisodeBlock`) —
 * the FORMAT direction (`formatStoryScriptEpisode`/`buildStoryScriptText`,
 * used by the unrelated "คัดลอกเนื้อเรื่อง" copy feature) is untouched by
 * this fix and is only used here as a fixture builder.
 */
import { describe, expect, it } from "vitest";
import {
  formatStoryScriptEpisode,
  formatStoryScriptEpisodePlanContext,
  parseStoryScriptEpisodeBlock,
  splitStoryScriptTextIntoEpisodeBlocks,
  stripWrappingMarkdownEmphasis,
  type StoryScriptEpisodeInput,
} from "./storyScriptText";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function buildTwoShotEpisode(episodeNumber = 2): StoryScriptEpisodeInput {
  return {
    episodeNumber,
    workingTitle: "หัวใจเมือง",
    logline: "เรื่องราวการเริ่มต้นใหม่",
    keyBeats: ["จุดที่ 1", "จุดที่ 2"],
    shotDrafts: [
      {
        shot_number: 1,
        summary: "เปิดฉาก",
        dialogue_lines: [{ speaker: "แม่", line: "สวัสดีจ้ะ" }],
      },
      {
        shot_number: 2,
        summary: "ปิดฉาก",
        dialogue_lines: [{ speaker: "ลูก", line: "หนูรักแม่ค่ะ", delivery: "ยิ้ม" }],
      },
    ],
    cliffhangerLine: "จะเกิดอะไรขึ้นต่อไป",
  };
}

const baselineBlock = formatStoryScriptEpisode("th", buildTwoShotEpisode());

function expectWellFormedTwoShotParse(parsed: ReturnType<typeof parseStoryScriptEpisodeBlock>) {
  expect(parsed).not.toBeNull();
  expect(parsed!.workingTitle).toBe("หัวใจเมือง");
  expect(parsed!.logline).toBe("เรื่องราวการเริ่มต้นใหม่");
  expect(parsed!.keyBeats).toEqual(["จุดที่ 1", "จุดที่ 2"]);
  expect(parsed!.shots.map((s) => s.shot_number)).toEqual([1, 2]);
  expect(parsed!.shots[0].summary).toBe("เปิดฉาก");
  expect(parsed!.shots[0].dialogue_lines).toEqual([{ speaker: "แม่", line: "สวัสดีจ้ะ" }]);
  expect(parsed!.shots[1].summary).toBe("ปิดฉาก");
  expect(parsed!.shots[1].dialogue_lines).toEqual([{ speaker: "ลูก", line: "หนูรักแม่ค่ะ", delivery: "ยิ้ม" }]);
  expect(parsed!.cliffhangerLine).toBe("จะเกิดอะไรขึ้นต่อไป");
}

/* -------------------------------------------------------------------------- */
/* stripWrappingMarkdownEmphasis                                              */
/* -------------------------------------------------------------------------- */

describe("stripWrappingMarkdownEmphasis", () => {
  it("strips a full-line ** wrapper", () => {
    expect(stripWrappingMarkdownEmphasis("**ตอนที่ 2: ชื่อตอน**")).toBe("ตอนที่ 2: ชื่อตอน");
  });

  it("strips a full-line __ wrapper", () => {
    expect(stripWrappingMarkdownEmphasis("__ตอนที่ 2: ชื่อตอน__")).toBe("ตอนที่ 2: ชื่อตอน");
  });

  it("does NOT touch inline bold mid-sentence (wrapper must span the whole line)", () => {
    const line = "เรื่องย่อ: มี **คำสำคัญ** อยู่กลางประโยค";
    expect(stripWrappingMarkdownEmphasis(line)).toBe(line);
  });

  it("leaves a plain (non-wrapped) line untouched aside from trimming", () => {
    expect(stripWrappingMarkdownEmphasis("  เรื่องย่อ: ปกติ  ")).toBe("เรื่องย่อ: ปกติ");
  });

  it("falls back to the trimmed original when the wrapper has empty content", () => {
    expect(stripWrappingMarkdownEmphasis("****")).toBe("****");
  });
});

/* -------------------------------------------------------------------------- */
/* splitStoryScriptTextIntoEpisodeBlocks                                      */
/* -------------------------------------------------------------------------- */

describe("splitStoryScriptTextIntoEpisodeBlocks", () => {
  it("matches a bold-wrapped episode header (episode 2 incident)", () => {
    const lines = baselineBlock.split("\n");
    const boldedHeaderLine = `**${lines[0]}**`;
    const boldedText = [boldedHeaderLine, ...lines.slice(1)].join("\n");

    const blocks = splitStoryScriptTextIntoEpisodeBlocks("th", boldedText);

    expect(blocks.has(2)).toBe(true);
    // The block body keeps the ORIGINAL un-stripped header line — the body
    // stays byte-faithful; `parseStoryScriptEpisodeBlock` normalizes independently.
    expect(blocks.get(2)!.split("\n")[0]).toBe(boldedHeaderLine);
  });

  it("still matches a plain (non-bold) header — zero behavior change", () => {
    const blocks = splitStoryScriptTextIntoEpisodeBlocks("th", baselineBlock);
    expect(blocks.has(2)).toBe(true);
    expect(blocks.get(2)).toBe(baselineBlock.trim());
  });
});

/* -------------------------------------------------------------------------- */
/* formatStoryScriptEpisodePlanContext                                        */
/* -------------------------------------------------------------------------- */

describe("formatStoryScriptEpisodePlanContext", () => {
  it("emits title/logline/keyBeats/cliffhanger but NOT shot dialogue", () => {
    const episode = buildTwoShotEpisode(3);
    const text = formatStoryScriptEpisodePlanContext("th", episode);

    expect(text).toBe(
      ["ตอนที่ 3: หัวใจเมือง", "เรื่องย่อ: เรื่องราวการเริ่มต้นใหม่", "จุดดำเนินเรื่อง:", "- จุดที่ 1", "- จุดที่ 2", "จุดค้าง: จะเกิดอะไรขึ้นต่อไป"].join(
        "\n",
      ),
    );
    expect(text).not.toContain("บทพูดรายช็อต");
    expect(text).not.toContain("เปิดฉาก");
    expect(text).not.toContain("สวัสดีจ้ะ");
  });

  it("(parseStoryScriptEpisodeBlock) tolerates dialogue lines WITHOUT the leading '- ' bullet (episode 5 straggler incident)", () => {
    // Real straggler output dropped the "- " prefix on every dialogue line
    // ("ครูแพร: ..." instead of "- ครูแพร: ..."), which previously made the
    // shots loop hit its "unrecognized line" break after shot 1 → "พบ 1 ช็อต".
    const block = [
      "ตอนที่ 5: ทดสอบ",
      "เรื่องย่อ: เรื่องย่อ",
      "บทพูดรายช็อต:",
      "ช็อต 1: เปิดฉาก",
      "ครูแพร: บรรทัดแรกไม่มีขีดนำหน้า", // no "- " prefix
      "ช็อต 2: ปิดฉาก",
      "- ฝ้าย: บรรทัดนี้มีขีดนำหน้า (ยิ้ม)", // mixed: with "- " prefix
      "ใบข้าว: บรรทัดนี้ไม่มีขีด",
      "จุดค้าง: ค้างไว้",
    ].join("\n");
    const parsed = parseStoryScriptEpisodeBlock("th", block, { expectedShotCount: 2 });
    expect(parsed).not.toBeNull();
    expect(parsed!.shots.map((s) => s.shot_number)).toEqual([1, 2]);
    expect(parsed!.shots[0].dialogue_lines).toEqual([{ speaker: "ครูแพร", line: "บรรทัดแรกไม่มีขีดนำหน้า" }]);
    expect(parsed!.shots[1].dialogue_lines).toEqual([
      { speaker: "ฝ้าย", line: "บรรทัดนี้มีขีดนำหน้า", delivery: "ยิ้ม" },
      { speaker: "ใบข้าว", line: "บรรทัดนี้ไม่มีขีด" },
    ]);
    expect(parsed!.cliffhangerLine).toBe("ค้างไว้");
  });

  it("omits the จุดดำเนินเรื่อง section when keyBeats is empty", () => {
    const text = formatStoryScriptEpisodePlanContext("th", {
      episodeNumber: 1,
      workingTitle: "ตอนแรก",
      logline: "เรื่องย่อของตอนแรก",
      keyBeats: [],
      cliffhangerLine: "ค้างไว้",
    });

    expect(text).not.toContain("จุดดำเนินเรื่อง");
    expect(text).toBe(["ตอนที่ 1: ตอนแรก", "เรื่องย่อ: เรื่องย่อของตอนแรก", "จุดค้าง: ค้างไว้"].join("\n"));
  });

  it("omits the จุดค้าง line when cliffhangerLine is missing or blank", () => {
    const withoutCliffhanger = formatStoryScriptEpisodePlanContext("th", {
      episodeNumber: 1,
      workingTitle: "ตอนแรก",
      logline: "เรื่องย่อของตอนแรก",
      keyBeats: ["จุด A"],
      cliffhangerLine: undefined,
    });
    const withBlankCliffhanger = formatStoryScriptEpisodePlanContext("th", {
      episodeNumber: 1,
      workingTitle: "ตอนแรก",
      logline: "เรื่องย่อของตอนแรก",
      keyBeats: ["จุด A"],
      cliffhangerLine: "   ",
    });

    expect(withoutCliffhanger).not.toContain("จุดค้าง");
    expect(withBlankCliffhanger).not.toContain("จุดค้าง");
  });

  it("supports the English label set", () => {
    const text = formatStoryScriptEpisodePlanContext("en", {
      episodeNumber: 2,
      workingTitle: "Heart of the City",
      logline: "A fresh start",
      keyBeats: ["Beat one"],
      cliffhangerLine: "What happens next",
    });

    expect(text).toBe(
      ["Episode 2: Heart of the City", "Summary: A fresh start", "Key beats:", "- Beat one", "Cliffhanger: What happens next"].join(
        "\n",
      ),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* parseStoryScriptEpisodeBlock                                               */
/* -------------------------------------------------------------------------- */

describe("parseStoryScriptEpisodeBlock", () => {
  it("regression: byte-identical non-bold, no-blank-line, single-cliffhanger content parses exactly as before (episodes 1/3/6's shape)", () => {
    const parsedWithoutOptions = parseStoryScriptEpisodeBlock("th", baselineBlock);
    const parsedWithOptions = parseStoryScriptEpisodeBlock("th", baselineBlock, { expectedShotCount: 2 });
    expectWellFormedTwoShotParse(parsedWithoutOptions);
    expectWellFormedTwoShotParse(parsedWithOptions);
    expect(parsedWithoutOptions).toEqual(parsedWithOptions);
  });

  it("tolerates a blank line between top-level sections AND a missing จุดดำเนินเรื่อง section (whole-block incident, 2026-07-10)", () => {
    // Real whole-block LLM output put a blank line right after เรื่องย่อ and
    // jumped straight to บทพูดรายช็อต (no key-beats section). Previously that
    // blank line was neither the key-beats header nor the shots header, so
    // hasShotSection stayed false → null → all 6 episodes failed to parse.
    const block = [
      "ตอนที่ 2: หัวใจเมือง",
      "เรื่องย่อ: เรื่องราวการเริ่มต้นใหม่",
      "", // blank line between sections, and NO จุดดำเนินเรื่อง section
      "บทพูดรายช็อต:",
      "ช็อต 1: เปิดฉาก",
      "- แม่: สวัสดีจ้ะ",
      "ช็อต 2: ปิดฉาก",
      "- ลูก: หนูรักแม่ค่ะ (ยิ้ม)",
      "จุดค้าง: จะเกิดอะไรขึ้นต่อไป",
    ].join("\n");
    const parsed = parseStoryScriptEpisodeBlock("th", block, { expectedShotCount: 2 });
    expect(parsed).not.toBeNull();
    expect(parsed!.logline).toBe("เรื่องราวการเริ่มต้นใหม่");
    expect(parsed!.keyBeats).toEqual([]);
    expect(parsed!.shots.map((s) => s.shot_number)).toEqual([1, 2]);
    expect(parsed!.cliffhangerLine).toBe("จะเกิดอะไรขึ้นต่อไป");
  });

  it("bold-wrapped header/labels/shot-headers/dialogue-bullets/cliffhanger all still parse correctly (episode 2 incident)", () => {
    const bolded = baselineBlock
      .split("\n")
      .map((line) => (line.trim().length > 0 ? `**${line}**` : line))
      .join("\n");

    const parsed = parseStoryScriptEpisodeBlock("th", bolded, { expectedShotCount: 2 });
    expectWellFormedTwoShotParse(parsed);
  });

  it("a stray mid-shot 'จุดค้าง:' before the expected shot count is skipped as noise, and the real one at the end still terminates correctly (episode 4 incident)", () => {
    const lines = baselineBlock.split("\n");
    // Insert a stray cliffhanger line right after shot 1's dialogue line
    // (before "ช็อต 2: ปิดฉาก"), same value the incident showed ("จุดค้าง: -").
    const shot2HeaderIndex = lines.findIndex((line) => line.startsWith("ช็อต 2:"));
    expect(shot2HeaderIndex).toBeGreaterThan(-1);
    lines.splice(shot2HeaderIndex, 0, "จุดค้าง: -");
    const withStrayCliffhanger = lines.join("\n");

    const parsed = parseStoryScriptEpisodeBlock("th", withStrayCliffhanger, { expectedShotCount: 2 });
    expectWellFormedTwoShotParse(parsed);
  });

  it("without expectedShotCount, a stray mid-shot cliffhanger still terminates immediately (today's exact behavior preserved for callers that omit the option)", () => {
    const lines = baselineBlock.split("\n");
    const shot2HeaderIndex = lines.findIndex((line) => line.startsWith("ช็อต 2:"));
    lines.splice(shot2HeaderIndex, 0, "จุดค้าง: -");
    const withStrayCliffhanger = lines.join("\n");

    const parsed = parseStoryScriptEpisodeBlock("th", withStrayCliffhanger);

    expect(parsed).not.toBeNull();
    expect(parsed!.shots.map((s) => s.shot_number)).toEqual([1]);
    // The stray cliffhanger is what stopped the loop, so it's read back as
    // THIS block's cliffhanger — matching today's exact (buggy) behavior.
    expect(parsed!.cliffhangerLine).toBe("-");
  });

  it("blank lines between shots don't break parsing (episode 5 incident)", () => {
    const lines = baselineBlock.split("\n");
    const shot2HeaderIndex = lines.findIndex((line) => line.startsWith("ช็อต 2:"));
    lines.splice(shot2HeaderIndex, 0, "");
    const withBlankLine = lines.join("\n");

    const parsed = parseStoryScriptEpisodeBlock("th", withBlankLine, { expectedShotCount: 2 });
    expectWellFormedTwoShotParse(parsed);
  });

  it("blank lines + bold-wrapping + stray mid-shot cliffhanger together (all 3 incidents combined) still parse correctly", () => {
    const lines = baselineBlock.split("\n").map((line) => (line.trim().length > 0 ? `**${line}**` : line));
    const shot2HeaderIndex = lines.findIndex((line) => line.includes("ช็อต 2:"));
    lines.splice(shot2HeaderIndex, 0, "**จุดค้าง: -**", "");
    const combined = lines.join("\n");

    const parsed = parseStoryScriptEpisodeBlock("th", combined, { expectedShotCount: 2 });
    expectWellFormedTwoShotParse(parsed);
  });

  it("a 'ผู้พูด: <real speaker>: <line>' nested case resolves to the real speaker (placeholder-literal defense-in-depth)", () => {
    const block = [
      "ตอนที่ 2: หัวใจเมือง",
      "เรื่องย่อ: เรื่องราวการเริ่มต้นใหม่",
      "บทพูดรายช็อต:",
      "ช็อต 1: เปิดฉาก",
      "- ผู้พูด: แม่: สวัสดีจ้ะลูก",
    ].join("\n");

    const parsed = parseStoryScriptEpisodeBlock("th", block, { expectedShotCount: 1 });

    expect(parsed).not.toBeNull();
    expect(parsed!.shots[0].dialogue_lines).toEqual([{ speaker: "แม่", line: "สวัสดีจ้ะลูก" }]);
  });

  it("a 'Speaker: <real speaker>: <line>' nested case (English placeholder, case-insensitive) resolves to the real speaker", () => {
    const block = [
      "Episode 2: Heart of the City",
      "Summary: A fresh start",
      "Shot-by-shot dialogue:",
      "Shot 1: Opening",
      "- Speaker: John: Hello there",
    ].join("\n");

    const parsed = parseStoryScriptEpisodeBlock("en", block, { expectedShotCount: 1 });

    expect(parsed).not.toBeNull();
    expect(parsed!.shots[0].dialogue_lines).toEqual([{ speaker: "John", line: "Hello there" }]);
  });

  it("a literal 'ผู้พูด:' line with no nested pair still parses (falls back to the plain speaker, defensive — never throws)", () => {
    const block = [
      "ตอนที่ 2: หัวใจเมือง",
      "เรื่องย่อ: เรื่องราวการเริ่มต้นใหม่",
      "บทพูดรายช็อต:",
      "ช็อต 1: เปิดฉาก",
      "- ผู้พูด: ไม่มีชื่อจริงตามหลัง",
    ].join("\n");

    const parsed = parseStoryScriptEpisodeBlock("th", block, { expectedShotCount: 1 });

    expect(parsed).not.toBeNull();
    expect(parsed!.shots[0].dialogue_lines).toEqual([{ speaker: "ผู้พูด", line: "ไม่มีชื่อจริงตามหลัง" }]);
  });

  it("still returns null on a genuinely structural miss (no header line at all)", () => {
    const parsed = parseStoryScriptEpisodeBlock("th", "เนื้อหาที่ไม่มีหัวข้อตอนเลย\nบรรทัดสอง");
    expect(parsed).toBeNull();
  });
});
