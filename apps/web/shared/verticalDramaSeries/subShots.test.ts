import { describe, expect, it } from "vitest";
import {
  computeAutoSubShotCount,
  computeSpeakerSwitchSubShotPlan,
  splitDurationsByWeight,
  validateSubShotsForParent,
  VERTICAL_DRAMA_SPEAKER_SUB_SHOT_MAX,
  VERTICAL_DRAMA_SUB_SHOT_MAX_PER_SHOT,
} from "./subShots";

const POLICY = { minSubShotSeconds: 1.2 };

describe("VERTICAL_DRAMA_SPEAKER_SUB_SHOT_MAX", () => {
  it("stays distinct from the manual editor's maxPerShot cap", () => {
    expect(VERTICAL_DRAMA_SPEAKER_SUB_SHOT_MAX).toBe(3);
    expect(VERTICAL_DRAMA_SUB_SHOT_MAX_PER_SHOT).toBe(5);
    expect(VERTICAL_DRAMA_SPEAKER_SUB_SHOT_MAX).not.toBe(
      VERTICAL_DRAMA_SUB_SHOT_MAX_PER_SHOT
    );
  });
});

describe("computeSpeakerSwitchSubShotPlan", () => {
  it("(a) single speaker -> no split", () => {
    const decision = computeSpeakerSwitchSubShotPlan(
      [
        { characterKey: "อาม่า", lineTh: "กินข้าวหรือยัง" },
        { characterKey: "อาม่า", lineTh: "อย่าลืมกินยานะ" },
      ],
      8,
      POLICY
    );
    expect(decision.needsSplit).toBe(false);
    expect(decision.reason).toBe("single_speaker");
    expect(decision.windows).toEqual([]);
  });

  it("returns no_dialogue when no line is attributed", () => {
    const decision = computeSpeakerSwitchSubShotPlan(
      [{ lineTh: "(เสียงลมพัด)" }],
      8,
      POLICY
    );
    expect(decision.needsSplit).toBe(false);
    expect(decision.reason).toBe("no_dialogue");
    expect(decision.distinctSpeakers).toEqual([]);
  });

  it("(b) two speakers strictly alternating (4+ turns) -> windows built correctly", () => {
    const lines = [
      { characterKey: "หนูนา", lineTh: "พี่จะไปไหน" },
      { characterKey: "พี่ชาย", lineTh: "ไปทำงานนะ" },
      { characterKey: "หนูนา", lineTh: "กลับเร็วๆนะ" },
      { characterKey: "พี่ชาย", lineTh: "ได้เลย รอนะ" },
    ];
    const decision = computeSpeakerSwitchSubShotPlan(lines, 12, POLICY);
    expect(decision.needsSplit).toBe(true);
    expect(decision.turnCount).toBe(4);
    expect(decision.distinctSpeakers).toEqual(["หนูนา", "พี่ชาย"]);
    // Capped at VERTICAL_DRAMA_SPEAKER_SUB_SHOT_MAX = 3 windows.
    expect(decision.windows).toHaveLength(3);
    expect(decision.windows.map(w => w.subShotNumber)).toEqual([1, 2, 3]);
    // First window anchors the opening speaker, last window anchors closing speaker.
    expect(decision.windows[0]!.characterKey).toBe("หนูนา");
    expect(decision.windows[2]!.characterKey).toBe("พี่ชาย");
    // Every line index is covered exactly once across all windows.
    const allIndexes = decision.windows.flatMap(w => w.lineIndexes).sort();
    expect(allIndexes).toEqual([0, 1, 2, 3]);
    // Durations sum to the shot duration.
    const totalDuration = decision.windows.reduce(
      (sum, w) => sum + w.durationSeconds,
      0
    );
    expect(totalDuration).toBeCloseTo(12, 1);
  });

  it("(c) two speakers where one has a single throwaway line amid a longer exchange", () => {
    const lines = [
      { characterKey: "แม่", lineTh: "ลูกกินข้าวหรือยัง วันนี้ทำอะไรมาบ้าง" },
      { characterKey: "ลูก", lineTh: "อืม" },
      { characterKey: "แม่", lineTh: "อย่าตอบสั้นๆแบบนี้สิ เล่าให้ฟังหน่อย" },
    ];
    const decision = computeSpeakerSwitchSubShotPlan(lines, 9, POLICY);
    expect(decision.needsSplit).toBe(true);
    expect(decision.turnCount).toBe(3);
    expect(decision.windows).toHaveLength(3);
    // The throwaway line still gets its own anchored window (first/last-turn
    // preservation only merges INTERMEDIATE turns when turnCount > feasibleCount;
    // here turnCount === feasibleCount === 3, so every turn keeps its own window).
    expect(decision.windows[1]!.characterKey).toBe("ลูก");
    expect(decision.windows[1]!.lineIndexes).toEqual([1]);
  });

  it("(d) more than 3 turns needing merge-down-to-3, preserving first/last turn", () => {
    const lines = [
      { characterKey: "A", lineTh: "หนึ่ง" },
      { characterKey: "B", lineTh: "สอง" },
      { characterKey: "A", lineTh: "สาม" },
      { characterKey: "B", lineTh: "สี่" },
      { characterKey: "A", lineTh: "ห้า" },
    ];
    const decision = computeSpeakerSwitchSubShotPlan(lines, 15, POLICY);
    expect(decision.turnCount).toBe(5);
    expect(decision.needsSplit).toBe(true);
    expect(decision.windows).toHaveLength(3);
    // First turn (index 0, speaker A) keeps its own dedicated window.
    expect(decision.windows[0]!.lineIndexes).toEqual([0]);
    expect(decision.windows[0]!.characterKey).toBe("A");
    // Last turn (index 4, speaker A) keeps its own dedicated window.
    expect(decision.windows[2]!.lineIndexes).toEqual([4]);
    expect(decision.windows[2]!.characterKey).toBe("A");
    // Middle window absorbs the 3 intermediate turns (indexes 1,2,3).
    expect(decision.windows[1]!.lineIndexes).toEqual([1, 2, 3]);
    const allIndexes = decision.windows.flatMap(w => w.lineIndexes).sort();
    expect(allIndexes).toEqual([0, 1, 2, 3, 4]);
  });

  it("(e) shot duration too short for even 2 windows at the minSubShotSeconds floor -> no split", () => {
    const lines = [
      { characterKey: "A", lineTh: "หนึ่ง" },
      { characterKey: "B", lineTh: "สอง" },
    ];
    // duration/floor = 2/1.2 = 1 (floored) -> feasibleCount = min(3,2,1) = 1 < 2.
    const decision = computeSpeakerSwitchSubShotPlan(lines, 2, POLICY);
    expect(decision.needsSplit).toBe(false);
    expect(decision.reason).toBe("shot_too_short_for_split");
    expect(decision.windows).toEqual([]);
  });

  it("respects a custom maxSubShots override", () => {
    const lines = [
      { characterKey: "A", lineTh: "หนึ่ง" },
      { characterKey: "B", lineTh: "สอง" },
      { characterKey: "A", lineTh: "สาม" },
      { characterKey: "B", lineTh: "สี่" },
    ];
    const decision = computeSpeakerSwitchSubShotPlan(lines, 20, POLICY, 2);
    expect(decision.needsSplit).toBe(true);
    expect(decision.windows).toHaveLength(2);
  });
});

describe("splitDurationsByWeight", () => {
  it("splits evenly when weights are equal", () => {
    const result = splitDurationsByWeight(9, [1, 1, 1], 1.2);
    expect(result).toHaveLength(3);
    const total = result.reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(9, 1);
    expect(result[0]).toBeCloseTo(3, 1);
    expect(result[1]).toBeCloseTo(3, 1);
  });

  it("splits proportionally to skewed weights", () => {
    const result = splitDurationsByWeight(10, [1, 9], 1.2);
    expect(result).toHaveLength(2);
    // First window (weight 1/10) floored below its raw 1s proportional share.
    expect(result[0]).toBeGreaterThanOrEqual(1.2);
    // Remainder lands on the last window.
    expect(result[0] + result[1]).toBeCloseTo(10, 1);
    expect(result[1]).toBeGreaterThan(result[0]);
  });

  it("enforces the floor on every window except the last", () => {
    const result = splitDurationsByWeight(6, [1, 1, 1], 1.2);
    // Equal proportional share (2s each) is already above the 1.2s floor, so
    // the floor should not visibly bind here; use a case where it does.
    const flooredCase = splitDurationsByWeight(6, [1, 1, 100], 1.2);
    expect(flooredCase[0]).toBeGreaterThanOrEqual(1.2);
    expect(flooredCase[1]).toBeGreaterThanOrEqual(1.2);
    expect(result.every(v => v >= 1.2)).toBe(true);
  });

  it("puts the leftover remainder on the last window", () => {
    const result = splitDurationsByWeight(7, [1, 1], 1.2);
    // 7/2 = 3.5 each proportionally; last window absorbs any rounding drift.
    expect(result[0] + result[1]).toBeCloseTo(7, 1);
  });

  it("returns a single window unchanged for one weight", () => {
    expect(splitDurationsByWeight(5, [1], 1.2)).toEqual([5]);
  });

  it("returns an empty array for zero weights", () => {
    expect(splitDurationsByWeight(5, [], 1.2)).toEqual([]);
  });
});

describe("pre-existing sub-shot helpers stay unchanged (regression guard)", () => {
  it("computeAutoSubShotCount / validateSubShotsForParent still work as before", () => {
    const count = computeAutoSubShotCount(9, {
      targetPerShot: 3,
      maxPerShot: 5,
      minSubShotSeconds: 1.2,
    });
    expect(count).toBe(3);
    const validation = validateSubShotsForParent(
      9,
      [
        { durationSeconds: 3, parentShotNumber: 1 },
        { durationSeconds: 3, parentShotNumber: 1 },
        { durationSeconds: 3, parentShotNumber: 1 },
      ],
      { maxPerShot: 5, minSubShotSeconds: 1.2 }
    );
    expect(validation.valid).toBe(true);
  });
});
