import { describe, expect, it } from "vitest";
import {
  analyzeVerticalDramaClipDialogueQuality,
  analyzeVerticalDramaClipSilence,
  analyzeVerticalDramaEpisodeDialogueQuality,
  analyzeVerticalDramaLineSpeakability,
  estimateVerticalDramaSpeechSeconds,
  hasVerticalDramaStageDirectionDialogue,
  sanitizeSpeakableLineForDelivery,
  MAX_CONTINUOUS_SILENCE_SECONDS,
} from "./dialogueQuality";

describe("vertical drama dialogue quality", () => {
  it("estimates Thai speech duration from spoken text", () => {
    const short = estimateVerticalDramaSpeechSeconds("อย่าเพิ่งไป");
    const longer = estimateVerticalDramaSpeechSeconds(
      "ยายทวดจัน วันนี้อย่าหลงนะ เราต้องทำตามกติกาเหมือนเดิม",
    );

    expect(short).toBeGreaterThan(0);
    expect(longer).toBeGreaterThan(short);
  });

  it("flags stage directions and sound cues as unusable dialogue", () => {
    expect(hasVerticalDramaStageDirectionDialogue("เสียง…ชา…อืม")).toBe(true);
    expect(hasVerticalDramaStageDirectionDialogue("(เสียงแก้วกระทบพื้น)")).toBe(true);
    expect(hasVerticalDramaStageDirectionDialogue("ปล่อยฉันออกไปที")).toBe(false);
  });

  it("flags an 8-second clip with too little dialogue as underfilled", () => {
    const quality = analyzeVerticalDramaClipDialogueQuality({
      shotNumber: 2,
      clipNumber: 2,
      durationSeconds: 8,
      dialogue: [{ lineTh: "อย่าเพิ่งไป" }],
    });

    expect(quality.coverageRatio).toBeLessThan(0.45);
    expect(quality.issues.some((issue) => issue.code === "VD_DIALOGUE_UNDERFILLED")).toBe(true);
  });

  it("flags whole-episode underfill and duplicate dialogue across clips", () => {
    const quality = analyzeVerticalDramaEpisodeDialogueQuality([
      {
        shotNumber: 1,
        clipNumber: 1,
        durationSeconds: 8,
        dialogue: [{ lineTh: "เราต้องกลับไปที่ร้านเดี๋ยวนี้" }],
      },
      {
        shotNumber: 2,
        clipNumber: 2,
        durationSeconds: 8,
        dialogue: [{ lineTh: "เราต้องกลับไปที่ร้านเดี๋ยวนี้" }],
      },
      ...[8, 4, 8, 8, 4, 8, 4].map((durationSeconds, index) => ({
        shotNumber: index + 3,
        clipNumber: index + 3,
        durationSeconds,
        dialogue: [{ lineTh: "ไป" }],
      })),
    ]);

    expect(quality.totalDurationSeconds).toBe(60);
    expect(quality.issues.some((issue) => issue.code === "VD_DIALOGUE_DUPLICATE")).toBe(true);
    expect(quality.issues.some((issue) => issue.code === "VD_DIALOGUE_EPISODE_UNDERFILLED")).toBe(true);
  });
});

describe("analyzeVerticalDramaClipSilence", () => {
  const TWELVE_WORDS = "one two three four five six seven eight nine ten eleven twelve";
  const TWENTY_FIVE_WORDS =
    "one two three four five six seven eight nine ten eleven twelve thirteen fourteen " +
    "fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour twentyfive";

  it("is exempt (zero/null) for a clip with no dialogue at all — that is VD_DIALOGUE_EMPTY's job", () => {
    expect(analyzeVerticalDramaClipSilence(undefined, 8)).toEqual({
      estimatedSpeechSeconds: 0,
      maxContinuousSilenceSeconds: 0,
      gapPosition: null,
      exceedsLimit: false,
    });
    expect(analyzeVerticalDramaClipSilence([], 8)).toEqual({
      estimatedSpeechSeconds: 0,
      maxContinuousSilenceSeconds: 0,
      gapPosition: null,
      exceedsLimit: false,
    });
  });

  it("flags a single short line in an 8-second clip as a trailing (end) gap over the limit", () => {
    const result = analyzeVerticalDramaClipSilence([{ lineTh: "hi" }], 8);

    expect(result.estimatedSpeechSeconds).toBe(estimateVerticalDramaSpeechSeconds("hi"));
    expect(result.maxContinuousSilenceSeconds).toBeCloseTo(
      8 - estimateVerticalDramaSpeechSeconds("hi"),
      10,
    );
    expect(result.gapPosition).toBe("end");
    expect(result.exceedsLimit).toBe(true);
  });

  it("reports a start gap when the FIRST of two lines leaves the most unclaimed silence", () => {
    const result = analyzeVerticalDramaClipSilence(
      [{ lineTh: "hi" }, { lineTh: TWELVE_WORDS }],
      8,
    );

    expect(result.gapPosition).toBe("start");
    expect(result.exceedsLimit).toBe(true);
  });

  it("reports a middle gap when an interior line among three leaves the most unclaimed silence", () => {
    const result = analyzeVerticalDramaClipSilence(
      [{ lineTh: TWELVE_WORDS }, { lineTh: "hi" }, { lineTh: TWELVE_WORDS }],
      12,
    );

    expect(result.gapPosition).toBe("middle");
    expect(result.exceedsLimit).toBe(true);
  });

  it("reports no gap (null, not exceeding) when the only line fills or overflows its slot", () => {
    const result = analyzeVerticalDramaClipSilence([{ lineTh: TWENTY_FIVE_WORDS }], 8);

    expect(result.maxContinuousSilenceSeconds).toBe(0);
    expect(result.gapPosition).toBeNull();
    expect(result.exceedsLimit).toBe(false);
  });

  it("does not exceed the limit exactly AT the 2.5s boundary (only strictly greater than violates)", () => {
    // A single one-word line floors to MIN_DIALOGUE_SECONDS_PER_LINE (0.75s,
    // exactly representable in binary floating point), so an exact 3.25s
    // clip leaves exactly 3.25 - 0.75 = 2.5s of silence.
    const atLimit = analyzeVerticalDramaClipSilence([{ lineTh: "x" }], 3.25);
    expect(atLimit.maxContinuousSilenceSeconds).toBe(2.5);
    expect(atLimit.exceedsLimit).toBe(false);

    const overLimit = analyzeVerticalDramaClipSilence([{ lineTh: "x" }], 3.3);
    expect(overLimit.maxContinuousSilenceSeconds).toBeGreaterThan(2.5);
    expect(overLimit.exceedsLimit).toBe(true);
  });

  it("is deterministic — identical input yields identical output", () => {
    const build = () =>
      analyzeVerticalDramaClipSilence(
        [{ lineTh: TWELVE_WORDS }, { lineTh: "hi" }, { lineTh: TWELVE_WORDS }],
        12,
      );

    expect(build()).toEqual(build());
  });

  it("pins the 2.5s limit constant", () => {
    expect(MAX_CONTINUOUS_SILENCE_SECONDS).toBe(2.5);
  });
});

/**
 * Speakability analyzer + sanitizer (spec §14.1 rule 6b, added 2026-07-08,
 * owner feedback). Fixtures below are the REAL episode-11 bad-data lines
 * verbatim, split into {speaker, line} the same way the pipeline's own
 * `"Speaker: "line""` parsing already produces them elsewhere (e.g.
 * `resolveShotDialogueLines`'s script-fallback branch), i.e. wrapping quotes
 * and speaker parentheticals are still present on the LINE/SPEAKER exactly
 * as persisted — this is what the analyzer must clean.
 */
describe("analyzeVerticalDramaLineSpeakability", () => {
  it("real bad data 1: wrapping quotes only, single ellipsis untouched", () => {
    const result = analyzeVerticalDramaLineSpeakability({
      speaker: "หนูนา",
      line: "“ยายทวดจัน…วันนี้อย่าหลงนะ เราต้องทำตามกติกาเหมือนเดิม”",
    });

    expect(result.speakable).toBe(false);
    expect(result.violations).toEqual([{ kind: "wrapping_quotes", found: "“”" }]);
    expect(result.cleaned).toEqual({
      speaker: "หนูนา",
      line: "ยายทวดจัน…วันนี้อย่าหลงนะ เราต้องทำตามกติกาเหมือนเดิม",
      delivery: undefined,
    });
  });

  it("real bad data 2: parenthetical speaker + wrapping quotes + duplicate ellipsis capped to one", () => {
    const result = analyzeVerticalDramaLineSpeakability({
      speaker: "หนูนา(สะดุ้ง)",
      line: "“ไม่ใช่แค่แสงธรรมดา…ขวดนี้…เหมือนมีคำสั่งอยู่ข้างใน”",
    });

    expect(result.speakable).toBe(false);
    expect(result.violations).toEqual([
      { kind: "parenthetical_stage_direction", found: "(สะดุ้ง)" },
      { kind: "wrapping_quotes", found: "“”" },
      { kind: "ellipsis_run", found: "…" },
    ]);
    expect(result.cleaned).toEqual({
      speaker: "หนูนา",
      line: "ไม่ใช่แค่แสงธรรมดา…ขวดนี้เหมือนมีคำสั่งอยู่ข้างใน",
      delivery: "สะดุ้ง",
    });
  });

  it("real bad data 3: cat-sound speaker parenthetical + tilde + wrapping quotes + nonverbal-only cleaned line", () => {
    const result = analyzeVerticalDramaLineSpeakability({
      speaker: "เจ้าเกลือ(เหมียว)",
      line: "“เหมียว~”",
    });

    expect(result.speakable).toBe(false);
    expect(result.violations).toEqual([
      { kind: "parenthetical_stage_direction", found: "(เหมียว)" },
      { kind: "wrapping_quotes", found: "“”" },
      { kind: "unspeakable_symbol", found: "~" },
      { kind: "nonverbal_line", found: "เหมียว" },
    ]);
    expect(result.cleaned).toEqual({
      speaker: "เจ้าเกลือ",
      line: "เหมียว",
      delivery: "เหมียว",
    });
  });

  it("real bad data 4: wrapping quotes + em-dash replaced with a comma", () => {
    const result = analyzeVerticalDramaLineSpeakability({
      speaker: "ชายนต์",
      line: "“ใจเย็น ฟังให้ครบตามกติกา—ความจริงที่ปลอดภัยต้องพิสูจน์ได้ด้วย”",
    });

    expect(result.speakable).toBe(false);
    expect(result.violations).toEqual([
      { kind: "wrapping_quotes", found: "“”" },
      { kind: "em_dash", found: "—" },
    ]);
    expect(result.cleaned).toEqual({
      speaker: "ชายนต์",
      line: "ใจเย็น ฟังให้ครบตามกติกา, ความจริงที่ปลอดภัยต้องพิสูจน์ได้ด้วย",
      delivery: undefined,
    });
  });

  it("real bad data 5: ambient-voice speaker parenthetical + wrapping quotes, single ellipsis untouched, not flagged nonverbal (full sentence)", () => {
    const result = analyzeVerticalDramaLineSpeakability({
      speaker: "เสียงในขวด(เหมือนคำเตือน)",
      line: "“ไม่ใช่เอกสาร…คือคนที่หายไป”",
    });

    expect(result.speakable).toBe(false);
    expect(result.violations).toEqual([
      { kind: "parenthetical_stage_direction", found: "(เหมือนคำเตือน)" },
      { kind: "wrapping_quotes", found: "“”" },
    ]);
    expect(result.cleaned).toEqual({
      speaker: "เสียงในขวด",
      line: "ไม่ใช่เอกสาร…คือคนที่หายไป",
      delivery: "เหมือนคำเตือน",
    });
  });

  it("a clean, already-speakable line is byte-identical and reports zero violations", () => {
    const result = analyzeVerticalDramaLineSpeakability({
      speaker: "หนูนา",
      line: "ปล่อยฉันออกไปที",
    });

    expect(result.speakable).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.cleaned).toEqual({
      speaker: "หนูนา",
      line: "ปล่อยฉันออกไปที",
      delivery: undefined,
    });
  });

  it("flags and strips emoji (synthetic — no emoji in the real fixtures)", () => {
    const result = analyzeVerticalDramaLineSpeakability({ line: "ไปกันเถอะ 🎉" });

    expect(result.violations).toEqual([{ kind: "emoji", found: "🎉" }]);
    expect(result.cleaned.line).toBe("ไปกันเถอะ");
  });

  it("no speaker supplied: only the line is analyzed, cleaned.speaker stays undefined", () => {
    const result = analyzeVerticalDramaLineSpeakability({ line: "ปล่อยฉันออกไปที" });
    expect(result.cleaned.speaker).toBeUndefined();
  });
});

/**
 * `checkOneIdeaPerLine` opt-in flag (spec §7.1 "read-aloud: one main idea
 * per line", F132D, added 2026-07-09) — strictly additive; must NEVER change
 * behavior for a caller that omits/sets it `false`.
 */
describe("analyzeVerticalDramaLineSpeakability — checkOneIdeaPerLine (opt-in)", () => {
  it("a short single-idea Thai line produces no multiple_main_ideas violation when checked", () => {
    const result = analyzeVerticalDramaLineSpeakability({
      line: "อย่าเพิ่งไปนะ",
      checkOneIdeaPerLine: true,
    });
    expect(result.violations.some((v) => v.kind === "multiple_main_ideas")).toBe(false);
  });

  it("a long line joining 3+ clauses with conjunctions is flagged with a suggested split point", () => {
    const line = "เธอไปที่ร้านแล้วก็ซื้อของ แต่ลืมกระเป๋าไว้ที่บ้าน เพราะรีบเกินไป";
    const result = analyzeVerticalDramaLineSpeakability({ line, checkOneIdeaPerLine: true });

    const violation = result.violations.find((v) => v.kind === "multiple_main_ideas");
    expect(violation).toBeDefined();
    expect(typeof violation?.suggestedSplitIndex).toBe("number");
    expect(violation!.suggestedSplitIndex!).toBeGreaterThanOrEqual(0);
  });

  it("omitting checkOneIdeaPerLine (or setting it false) never flags multiple_main_ideas, regardless of clause count", () => {
    const line = "เธอไปที่ร้านแล้วก็ซื้อของ แต่ลืมกระเป๋าไว้ที่บ้าน เพราะรีบเกินไป";
    const omitted = analyzeVerticalDramaLineSpeakability({ line });
    const explicitFalse = analyzeVerticalDramaLineSpeakability({
      line,
      checkOneIdeaPerLine: false,
    });

    expect(omitted.violations.some((v) => v.kind === "multiple_main_ideas")).toBe(false);
    expect(explicitFalse.violations.some((v) => v.kind === "multiple_main_ideas")).toBe(false);
  });

  it("byte-identical regression guard: checkOneIdeaPerLine omitted produces the EXACT same result as before this flag existed, for every real bad-data fixture", () => {
    const fixtures: Array<{ speaker?: string; line: string }> = [
      { speaker: "หนูนา", line: "“ยายทวดจัน…วันนี้อย่าหลงนะ เราต้องทำตามกติกาเหมือนเดิม”" },
      { speaker: "หนูนา(สะดุ้ง)", line: "“ไม่ใช่แค่แสงธรรมดา…ขวดนี้…เหมือนมีคำสั่งอยู่ข้างใน”" },
      { line: "ปล่อยฉันออกไปที" },
    ];
    for (const fixture of fixtures) {
      const withoutFlag = analyzeVerticalDramaLineSpeakability(fixture);
      const withFlagFalse = analyzeVerticalDramaLineSpeakability({
        ...fixture,
        checkOneIdeaPerLine: false,
      });
      expect(withFlagFalse).toEqual(withoutFlag);
    }
  });

  it("a natural short line with one conjunction (2 clauses) is NOT flagged — conservative high bar", () => {
    const result = analyzeVerticalDramaLineSpeakability({
      line: "ไปกันเถอะ แต่อย่าลืมกุญแจ",
      checkOneIdeaPerLine: true,
    });
    expect(result.violations.some((v) => v.kind === "multiple_main_ideas")).toBe(false);
  });
});

describe("sanitizeSpeakableLineForDelivery", () => {
  it("sanitizes every real bad-data line to exactly the analyzer's cleaned.line", () => {
    const fixtures = [
      "“ยายทวดจัน…วันนี้อย่าหลงนะ เราต้องทำตามกติกาเหมือนเดิม”",
      "“ไม่ใช่แค่แสงธรรมดา…ขวดนี้…เหมือนมีคำสั่งอยู่ข้างใน”",
      "“เหมียว~”",
      "“ใจเย็น ฟังให้ครบตามกติกา—ความจริงที่ปลอดภัยต้องพิสูจน์ได้ด้วย”",
      "“ไม่ใช่เอกสาร…คือคนที่หายไป”",
    ];
    for (const line of fixtures) {
      expect(sanitizeSpeakableLineForDelivery(line)).toBe(
        analyzeVerticalDramaLineSpeakability({ line }).cleaned.line,
      );
    }
  });

  it("is byte-identical for a non-violating line", () => {
    expect(sanitizeSpeakableLineForDelivery("ปล่อยฉันออกไปที")).toBe("ปล่อยฉันออกไปที");
  });

  it("is idempotent — sanitizing an already-sanitized line changes nothing further", () => {
    for (const line of [
      "“ยายทวดจัน…วันนี้อย่าหลงนะ เราต้องทำตามกติกาเหมือนเดิม”",
      "“ไม่ใช่แค่แสงธรรมดา…ขวดนี้…เหมือนมีคำสั่งอยู่ข้างใน”",
      "“ใจเย็น ฟังให้ครบตามกติกา—ความจริงที่ปลอดภัยต้องพิสูจน์ได้ด้วย”",
    ]) {
      const once = sanitizeSpeakableLineForDelivery(line);
      const twice = sanitizeSpeakableLineForDelivery(once);
      expect(twice).toBe(once);
    }
  });
});

describe("VD_DIALOGUE_UNSPEAKABLE_SYMBOLS wiring into analyzeVerticalDramaClipDialogueQuality", () => {
  it("flags a clip whose only line is unspeakable (real bad-data line 3), regardless of duration", () => {
    const quality = analyzeVerticalDramaClipDialogueQuality({
      shotNumber: 3,
      clipNumber: 3,
      durationSeconds: 4,
      dialogue: [{ speaker: "เจ้าเกลือ(เหมียว)", lineTh: "“เหมียว~”" }],
    });

    const issue = quality.issues.find((i) => i.code === "VD_DIALOGUE_UNSPEAKABLE_SYMBOLS");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("error");
  });

  it("does not flag a clip whose lines are all already speakable", () => {
    const quality = analyzeVerticalDramaClipDialogueQuality({
      shotNumber: 1,
      clipNumber: 1,
      durationSeconds: 8,
      dialogue: [{ speaker: "หนูนา", lineTh: "ปล่อยฉันออกไปที" }],
    });

    expect(quality.issues.some((i) => i.code === "VD_DIALOGUE_UNSPEAKABLE_SYMBOLS")).toBe(false);
  });

  it("fires even on a short clip that would otherwise be exempt from VD_DIALOGUE_UNDERFILLED (duration < 6s)", () => {
    const quality = analyzeVerticalDramaClipDialogueQuality({
      shotNumber: 4,
      clipNumber: 4,
      durationSeconds: 3,
      dialogue: [{ speaker: "ชายนต์", lineTh: "“ใจเย็น ฟังให้ครบตามกติกา—ความจริงที่ปลอดภัยต้องพิสูจน์ได้ด้วย”" }],
    });

    expect(quality.issues.some((i) => i.code === "VD_DIALOGUE_UNSPEAKABLE_SYMBOLS")).toBe(true);
    // VD_DIALOGUE_UNDERFILLED never even runs below 6s — confirms these are independent checks.
    expect(quality.issues.some((i) => i.code === "VD_DIALOGUE_UNDERFILLED")).toBe(false);
  });
});
