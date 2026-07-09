/**
 * Unit coverage for `describeQualityImproveLoopOutcome` (Wave-5C, 2026-07-07
 * page-level activation wiring for the Wave-5A quality-loop v2 UI) — the
 * pure decision logic behind `runQualityImproveLoopMutation`'s success toast
 * in `VerticalDramaEpisodePage.tsx`.
 *
 * Mirrors `VerticalDramaEpisodePage.angleGridResume.test.ts`'s convention:
 * import the exported pure function directly and exercise its branches in
 * isolation, with no React/tRPC rendering required.
 */
import { describe, expect, it } from "vitest";
import { describeQualityImproveLoopOutcome } from "../VerticalDramaEpisodePage";

const copy = {
  qualityLoopEscalatedMaxRoundsTemplate:
    "Reached {n} rounds and still below floor — needs manual review",
  qualityLoopEscalatedRegression:
    "Score got worse — kept the better version, needs manual review",
  qualityLoopRoundBeforeAfterTemplate: "{before}/5 → {after}/5",
};

const fallback = "Auto-improve loop finished.";

describe("describeQualityImproveLoopOutcome", () => {
  it("returns a warning with the server's warning message, taking priority over everything else", () => {
    expect(
      describeQualityImproveLoopOutcome(
        {
          warning: "แก้ไขสำเร็จ แต่ตรวจคุณภาพซ้ำไม่สำเร็จ",
          loopState: { status: "escalated_max_rounds", rounds: [] },
        },
        copy,
        fallback
      )
    ).toEqual({ tone: "warning", message: "แก้ไขสำเร็จ แต่ตรวจคุณภาพซ้ำไม่สำเร็จ" });
  });

  it("returns a warning with the escalated-max-rounds template, substituting the round count", () => {
    expect(
      describeQualityImproveLoopOutcome(
        {
          loopState: {
            status: "escalated_max_rounds",
            rounds: [
              { overallBefore: 2, overallAfter: 3 },
              { overallBefore: 3, overallAfter: 3 },
              { overallBefore: 3, overallAfter: 3 },
            ],
          },
        },
        copy,
        fallback
      )
    ).toEqual({
      tone: "warning",
      message: "Reached 3 rounds and still below floor — needs manual review",
    });
  });

  it("returns a warning with the escalated-regression message", () => {
    expect(
      describeQualityImproveLoopOutcome(
        {
          loopState: {
            status: "escalated_regression",
            rounds: [{ overallBefore: 4, overallAfter: 3 }],
          },
        },
        copy,
        fallback
      )
    ).toEqual({
      tone: "warning",
      message:
        "Score got worse — kept the better version, needs manual review",
    });
  });

  it("returns a success with the LAST round's before/after score when the loop completed normally", () => {
    expect(
      describeQualityImproveLoopOutcome(
        {
          loopState: {
            status: "passed",
            rounds: [
              { overallBefore: 2, overallAfter: 3 },
              { overallBefore: 3, overallAfter: 4 },
            ],
          },
        },
        copy,
        fallback
      )
    ).toEqual({ tone: "success", message: "3/5 → 4/5" });
  });

  it("returns the fallback success message when no round ever ran (loopState with an empty rounds array)", () => {
    expect(
      describeQualityImproveLoopOutcome(
        { loopState: { status: "idle", rounds: [] } },
        copy,
        fallback
      )
    ).toEqual({ tone: "success", message: fallback });
  });

  it("returns the fallback success message when loopState is entirely absent", () => {
    expect(
      describeQualityImproveLoopOutcome({ loopState: null }, copy, fallback)
    ).toEqual({ tone: "success", message: fallback });
    expect(describeQualityImproveLoopOutcome({}, copy, fallback)).toEqual({
      tone: "success",
      message: fallback,
    });
  });
});
