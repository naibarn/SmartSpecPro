import { describe, expect, it } from "vitest";
import {
  computeRetentionLoopRotation,
  computeRetentionStructureFacts,
  computeShotChangeCadenceFacts,
  computeSubtitleLineFacts,
} from "./retentionFacts";

/* -------------------------------------------------------------------------- */
/* computeSubtitleLineFacts                                                   */
/* -------------------------------------------------------------------------- */

describe("computeSubtitleLineFacts", () => {
  it("returns the zero fact for an empty input array", () => {
    expect(computeSubtitleLineFacts([])).toEqual({
      maxLineChars: 0,
      longestLineExcerpt: "",
    });
  });

  it("returns the zero fact when every line is blank/whitespace-only or missing", () => {
    expect(
      computeSubtitleLineFacts([
        { line: "" },
        { line: "   " },
        { line: null },
        {},
      ])
    ).toEqual({ maxLineChars: 0, longestLineExcerpt: "" });
  });

  it("picks the longest ASCII line and reports its exact grapheme count", () => {
    const result = computeSubtitleLineFacts([
      { line: "hi" },
      { line: "hello there" },
      { line: "ok" },
    ]);
    expect(result.maxLineChars).toBe("hello there".length);
    expect(result.longestLineExcerpt).toBe("hello there");
  });

  it("keeps the FIRST line found when two lines tie on grapheme count", () => {
    const result = computeSubtitleLineFacts([
      { line: "abcd" },
      { line: "wxyz" },
    ]);
    expect(result.maxLineChars).toBe(4);
    expect(result.longestLineExcerpt).toBe("abcd");
  });

  it("counts Thai combining marks as ONE grapheme with their base character, not by UTF-16 length", () => {
    // "น้ำ" — น + combining tone mark (U+0E49) + ำ (U+0E33) collapses to a
    // single grapheme cluster ["น้ำ"] under Intl.Segmenter, even though its
    // UTF-16 `.length` is 3. Real repro value verified empirically via
    // `new Intl.Segmenter(undefined, { granularity: "grapheme" })`.
    const result = computeSubtitleLineFacts([{ line: "น้ำ" }]);
    expect(result.maxLineChars).toBe(1);
    expect("น้ำ".length).toBe(3); // sanity: `.length` would have over-counted
    expect(result.longestLineExcerpt).toBe("น้ำ");
  });

  it("a shorter-by-.length Thai line can have MORE graphemes than a longer-by-.length one", () => {
    // "ก่อน" -> 3 graphemes (["ก่","อ","น"]), .length === 4.
    // "น้ำ"  -> 1 grapheme, .length === 3.
    // Neither wins by chars alone — the function must use grapheme counting
    // throughout, not fall back to .length for the comparison itself.
    const result = computeSubtitleLineFacts([
      { line: "น้ำ" },
      { line: "ก่อน" },
    ]);
    expect(result.maxLineChars).toBe(3);
    expect(result.longestLineExcerpt).toBe("ก่อน");
  });

  it("trims whitespace before measuring and excerpting", () => {
    const result = computeSubtitleLineFacts([{ line: "  padded line  " }]);
    expect(result.longestLineExcerpt).toBe("padded line");
    expect(result.maxLineChars).toBe("padded line".length);
  });

  it("falls back to code-point counting when Intl.Segmenter is unavailable, correctly handling a surrogate-pair emoji as one grapheme", () => {
    const original = Intl.Segmenter;
    try {
      // @ts-expect-error -- intentionally undefine to exercise the fallback path
      delete Intl.Segmenter;
      const result = computeSubtitleLineFacts([{ line: "hi😀" }]);
      // "😀" is a surrogate pair: `.length` === 2, but Array.from counts it
      // as 1 code point — the documented fallback behavior.
      expect("hi😀".length).toBe(4);
      expect(result.maxLineChars).toBe(3);
    } finally {
      Intl.Segmenter = original;
    }
  });
});

/* -------------------------------------------------------------------------- */
/* computeRetentionStructureFacts                                             */
/* -------------------------------------------------------------------------- */

describe("computeRetentionStructureFacts", () => {
  it("returns the zero/absent fact when script is undefined", () => {
    expect(computeRetentionStructureFacts(undefined)).toEqual({
      openLoopCount: 0,
      retentionLoopType: null,
      retentionLoopPresent: false,
    });
  });

  it("returns the zero/absent fact when script is null", () => {
    expect(computeRetentionStructureFacts(null)).toEqual({
      openLoopCount: 0,
      retentionLoopType: null,
      retentionLoopPresent: false,
    });
  });

  it("returns the zero/absent fact for an empty (pre-R1) script object", () => {
    expect(computeRetentionStructureFacts({})).toEqual({
      openLoopCount: 0,
      retentionLoopType: null,
      retentionLoopPresent: false,
    });
  });

  it("counts open_loops entries", () => {
    const result = computeRetentionStructureFacts({
      open_loops: [{ question: "who is X?" }, { question: "why now?" }],
    });
    expect(result.openLoopCount).toBe(2);
  });

  it("treats an empty open_loops array as zero, not absent", () => {
    expect(
      computeRetentionStructureFacts({ open_loops: [] }).openLoopCount
    ).toBe(0);
  });

  it("reports retention_loop presence + type when both are declared", () => {
    const result = computeRetentionStructureFacts({
      retention_loop: { type: "clue" },
    });
    expect(result.retentionLoopPresent).toBe(true);
    expect(result.retentionLoopType).toBe("clue");
  });

  it("reports present=true but type=null when retention_loop omits type", () => {
    const result = computeRetentionStructureFacts({ retention_loop: {} });
    expect(result.retentionLoopPresent).toBe(true);
    expect(result.retentionLoopType).toBeNull();
  });

  it("reports present=false when retention_loop is explicitly null", () => {
    const result = computeRetentionStructureFacts({ retention_loop: null });
    expect(result.retentionLoopPresent).toBe(false);
    expect(result.retentionLoopType).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* computeShotChangeCadenceFacts                                              */
/* -------------------------------------------------------------------------- */

describe("computeShotChangeCadenceFacts", () => {
  it("returns the zero fact for an empty shots array", () => {
    expect(computeShotChangeCadenceFacts([])).toEqual({
      maxStaticStreak: 0,
      windowsWithoutChange: 0,
      declaredChangeMismatchCount: 0,
    });
  });

  it("returns the zero fact when no shot declares change_type at all (pre-R2 artifact) — never inferred as all-static", () => {
    const shots = [
      { emotion: "sad" },
      { emotion: "sad" },
      { emotion: "sad" },
      { emotion: "sad" },
    ];
    expect(computeShotChangeCadenceFacts(shots)).toEqual({
      maxStaticStreak: 0,
      windowsWithoutChange: 0,
      declaredChangeMismatchCount: 0,
    });
  });

  it("treats an explicit change_type: ['none'] the same as static for streak purposes", () => {
    const shots = [
      { change_type: ["none"] },
      { change_type: ["none"] },
      { change_type: ["none"] },
      { change_type: ["none"] },
    ];
    const result = computeShotChangeCadenceFacts(shots);
    expect(result.maxStaticStreak).toBe(4);
    expect(result.windowsWithoutChange).toBe(2); // windows [0,1,2] and [1,2,3]
  });

  it("treats an empty change_type array the same as static", () => {
    const shots = [
      { change_type: ["visual"] }, // gives at least one declared shot so the "no signal" guard doesn't fire
      { change_type: [] },
      { change_type: [] },
    ];
    const result = computeShotChangeCadenceFacts(shots);
    expect(result.maxStaticStreak).toBe(2);
  });

  it("reports zero static streak / zero windows-without-change when every shot declares a real change", () => {
    const shots = [
      { change_type: ["visual"] },
      { change_type: ["emotional"] },
      { change_type: ["informational"] },
      { change_type: ["visual", "emotional"] },
    ];
    const result = computeShotChangeCadenceFacts(shots);
    expect(result.maxStaticStreak).toBe(0);
    expect(result.windowsWithoutChange).toBe(0);
  });

  it("handles a single shot without a full 3-shot window", () => {
    expect(computeShotChangeCadenceFacts([{ change_type: ["none"] }])).toEqual({
      maxStaticStreak: 1,
      windowsWithoutChange: 0,
      declaredChangeMismatchCount: 0,
    });
  });

  it("finds the longest static run across a mixed sequence, not just the first run", () => {
    // real, static, static, real, static, static, static, real
    const shots = [
      { change_type: ["visual"] },
      { change_type: ["none"] },
      { change_type: ["none"] },
      { change_type: ["emotional"] },
      { change_type: ["none"] },
      { change_type: ["none"] },
      { change_type: ["none"] },
      { change_type: ["visual"] },
    ];
    const result = computeShotChangeCadenceFacts(shots);
    expect(result.maxStaticStreak).toBe(3);
    // Windows without a real change (index-based, size 3): [4,5,6] only.
    expect(result.windowsWithoutChange).toBe(1);
  });

  it("counts a declared-change/no-observable-difference mismatch when emotion/camera/location are unchanged from the previous shot", () => {
    const shots = [
      {
        change_type: ["none"],
        emotion: "calm",
        camera: "wide",
        location: "shop",
      },
      {
        change_type: ["emotional"],
        emotion: "calm",
        camera: "wide",
        location: "shop",
      },
    ];
    const result = computeShotChangeCadenceFacts(shots);
    expect(result.declaredChangeMismatchCount).toBe(1);
  });

  it("does NOT count a mismatch when at least one comparable field actually differs", () => {
    const shots = [
      {
        change_type: ["none"],
        emotion: "calm",
        camera: "wide",
        location: "shop",
      },
      {
        change_type: ["emotional"],
        emotion: "angry",
        camera: "wide",
        location: "shop",
      },
    ];
    const result = computeShotChangeCadenceFacts(shots);
    expect(result.declaredChangeMismatchCount).toBe(0);
  });

  it("does NOT count a mismatch when there is no comparable field present on both shots", () => {
    const shots = [
      { change_type: ["none"] },
      { change_type: ["visual"] }, // no emotion/camera/location on either shot
    ];
    const result = computeShotChangeCadenceFacts(shots);
    expect(result.declaredChangeMismatchCount).toBe(0);
  });

  it("never counts a mismatch for the first shot (no previous shot to compare against)", () => {
    const shots = [{ change_type: ["visual"], emotion: "calm" }];
    expect(
      computeShotChangeCadenceFacts(shots).declaredChangeMismatchCount
    ).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* computeRetentionLoopRotation                                               */
/* -------------------------------------------------------------------------- */

describe("computeRetentionLoopRotation", () => {
  it("returns 0 when currentType is null/undefined", () => {
    expect(computeRetentionLoopRotation(null, ["clue", "clue"])).toEqual({
      repeatedStreak: 0,
    });
    expect(computeRetentionLoopRotation(undefined, ["clue"])).toEqual({
      repeatedStreak: 0,
    });
  });

  it("returns 0 when recentTypes is empty", () => {
    expect(computeRetentionLoopRotation("clue", [])).toEqual({
      repeatedStreak: 0,
    });
  });

  it("returns 0 when the nearest prior episode's type already differs", () => {
    expect(
      computeRetentionLoopRotation("clue", ["threat", "clue", "clue"])
    ).toEqual({
      repeatedStreak: 0,
    });
  });

  it("counts the full leading run when every recent type matches", () => {
    expect(
      computeRetentionLoopRotation("clue", ["clue", "clue", "clue"])
    ).toEqual({
      repeatedStreak: 3,
    });
  });

  it("stops counting at the first prior episode with a different type", () => {
    expect(
      computeRetentionLoopRotation("clue", ["clue", "clue", "threat", "clue"])
    ).toEqual({ repeatedStreak: 2 });
  });

  it("treats a null/undefined entry in recentTypes as breaking the streak", () => {
    expect(
      computeRetentionLoopRotation("clue", ["clue", null, "clue"])
    ).toEqual({
      repeatedStreak: 1,
    });
  });
});
