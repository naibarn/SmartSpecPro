import { describe, expect, it } from "vitest";
import {
  extractShotNumbersFromLocation,
  normalizeQualityReviewIssueToRevisionPlanEntry,
  normalizeSeasonCritiqueFindingToRevisionPlanEntry,
  resolveRevisionScope,
  spliceStoryboardShots,
} from "../verticalDramaRevisionPlan";

describe("verticalDramaRevisionPlan normalizers", () => {
  it("normalizes line issues to line scope with no regeneration", () => {
    const entry = normalizeQualityReviewIssueToRevisionPlanEntry(
      {
        location: "shot 2 line 3",
        problem: "บทพูดยาวเกินไป",
        suggested_fix: "แยกเป็นสองบรรทัด",
        severity: "minor",
      },
      { episode: 4, index: 1 },
    );

    expect(entry).toMatchObject({
      episode: 4,
      scope: "line",
      lineRef: "line:3",
      needsRegeneration: false,
      severity: "minor",
    });
  });

  it("normalizes shot dialogue issues to shot_dialogue and extracts the target shot", () => {
    const entry = normalizeQualityReviewIssueToRevisionPlanEntry(
      {
        location: "Shot 4",
        problem: "dialogue sounds too expositional",
        suggested_fix: "rewrite only the spoken line",
      },
      { episode: 2 },
    );

    expect(entry).toMatchObject({
      scope: "shot_dialogue",
      shot: 4,
      needsRegeneration: true,
    });
  });

  it("normalizes visual/camera shot issues to full_shot", () => {
    const entry = normalizeQualityReviewIssueToRevisionPlanEntry(
      {
        location: "ช็อตที่ 5",
        problem: "ภาพและกล้องไม่สื่อแรงกดดัน",
        suggested_fix: "เปลี่ยน camera composition",
      },
      { episode: 2 },
    );

    expect(entry).toMatchObject({ scope: "full_shot", shot: 5 });
  });

  it("maps single-episode season findings to episode_outline and ledger-derived kinds to affectedLedgers", () => {
    const entry = normalizeSeasonCritiqueFindingToRevisionPlanEntry(
      {
        kind: "evidence_orphaned",
        evidenceEpisodes: [3],
        problem: "เบาะแสหายไป",
        fixInstruction: "ให้เบาะแสกลับมามีผลกับการตัดสินใจ",
      },
      {},
    );

    expect(entry).toMatchObject({
      scope: "episode_outline",
      affectedLedgers: ["evidenceLedger"],
      needsRegeneration: true,
    });
  });

  it("maps multi-episode season findings to cross_episode", () => {
    const entry = normalizeSeasonCritiqueFindingToRevisionPlanEntry(
      {
        kind: "thread_stalled",
        evidenceEpisodes: [2, 5],
        problem: "ปมค้างนาน",
        fixInstruction: "ขยับปมในตอนกลาง",
      },
      {},
    );

    expect(entry).toMatchObject({
      scope: "cross_episode",
      affectedLedgers: ["threadLedger"],
    });
  });

  it("requires approval for structural entries without silently widening scope", () => {
    const entry = normalizeSeasonCritiqueFindingToRevisionPlanEntry(
      {
        kind: "episode_replaceable",
        evidenceEpisodes: [6],
        problem: "ยกออกได้",
        fixInstruction: "เปลี่ยน outline",
        severity: "structural",
      },
      {},
    );

    expect(resolveRevisionScope(entry)).toEqual({
      requiresApproval: true,
      proposedScope: "episode_outline",
      reason: expect.stringContaining("Structural"),
    });
  });

  it("extracts shot numbers in English and Thai text", () => {
    expect(extractShotNumbersFromLocation("Shot 4 and shot 2")).toEqual([2, 4]);
    expect(extractShotNumbersFromLocation("ช็อตที่ 7")).toEqual([7]);
  });
});

describe("spliceStoryboardShots", () => {
  it("replaces only target shots and leaves untouched shot objects reference-identical", () => {
    const shot1 = { shot_number: 1, text: "one" };
    const shot2 = { shot_number: 2, text: "two" };
    const shot3 = { shot_number: 3, text: "three" };
    const current = { shots: [shot1, shot2, shot3], meta: "keep" };
    const revised2 = { shot_number: 2, text: "TWO" };

    const next = spliceStoryboardShots(current, [revised2]);

    expect(next).not.toBe(current);
    expect(next.meta).toBe("keep");
    expect(next.shots).toHaveLength(3);
    expect(next.shots[0]).toBe(shot1);
    expect(next.shots[1]).toBe(revised2);
    expect(next.shots[2]).toBe(shot3);
  });

  it("rejects revised shots outside the current shot-number set", () => {
    expect(() =>
      spliceStoryboardShots(
        { shots: [{ shot_number: 1 }, { shot_number: 2 }] },
        [{ shot_number: 9 }],
      ),
    ).toThrow(/unknown shot_number 9/);
  });
});

