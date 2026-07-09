/**
 * Wave-5A (2026-07-07 production-grade upgrade) integration coverage for
 * `VerticalDramaStoryboardPanel.tsx`: density meter, scorecard v2 extension,
 * and the tie-in naturalness report card. Every new block is gated on its
 * own `*Enabled` flag prop (mirroring `getEpisodeDetail.flags` verbatim) —
 * the first test proves flags-off renders byte-identical to the shipped v1
 * UI; the rest exercise each flag turned on independently.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VerticalDramaStoryboardPanel } from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";
import { VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK } from "@shared/verticalDramaSeries/assembly";
import {
  MIN_EPISODE_COVERAGE_RATIO,
  targetVerticalDramaSpeechSeconds,
} from "@shared/verticalDramaSeries/dialogueQuality";

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    locale: "th" as const,
    storyboard: {
      shots: [{ shot_number: 1, visual_description: "test", characters: [] }],
    },
    startFramePlan: { frames: [{ shotNumber: 1, imagePrompt: "a prompt" }] },
    loading: false,
    onRunQualityReview: vi.fn(),
    ...overrides,
  };
}

const V1_REVIEW = {
  scorecard: {
    reversal_count: 2,
    reversal_sharpness: 4,
    emotion_variety: 4,
    dialogue_naturalness: 4,
    pacing: 4,
    overall: 4,
  },
  summary: "Good pacing overall.",
  issues: [],
};

const V2_REVIEW = {
  contract_version: 2 as const,
  scorecard: {
    reversal_count: 2,
    reversal_sharpness: 4,
    emotion_variety: 4,
    dialogue_naturalness: 4,
    pacing: 4,
    overall: 4,
    hook_strength: 3,
    cliffhanger_strength: 2,
    continuity_consistency: 5,
    tie_in_naturalness: 4,
  },
  summary: "Good.",
  tie_in_assessment: "Feels natural.",
  density_metrics: {
    estimated_speech_seconds: 30,
    per_clip_coverage: {
      clips_evaluated: 9,
      clips_below_min_ratio: 2,
      clips_below_error_ratio: 0,
      average_coverage_ratio: 0.6,
    },
    silent_gap_count: 1,
    duplicate_line_count: 0,
    stage_direction_count: 0,
    reversal_count: 2,
    max_consecutive_same_emotion: 3,
  },
  issues: [],
};

const POLICY = {
  minOverall: 4,
  minPerDimension: 3,
  tieInMinNaturalnessScore: 70,
  maxAutoImproveRounds: 2,
  autoRunReviewAfterStoryboard: true,
  blockPaidGenerationBelowFloor: true,
};

describe("VerticalDramaStoryboardPanel — flags-off byte-identical (Wave-5A)", () => {
  it("renders the v1 scorecard exactly as shipped when every Wave-5A flag is off", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({ qualityReview: V1_REVIEW }) as any)}
      />
    );

    expect(screen.getByTestId("vd-quality-overall-score").textContent).toBe(
      "คะแนนรวม4/5"
    );
    expect(screen.queryByText(/เกณฑ์/)).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-quality-density-metrics")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-quality-loop-area")
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("vd-density-meter")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-tie-in-report-card")
    ).not.toBeInTheDocument();
  });

  it("renders the v1 scorecard byte-identically even when the review payload is v2-shaped but the flag is off", () => {
    // Server only ever sends v2 fields when the flag is on server-side too,
    // but this proves the CLIENT gate (not just data absence) is what
    // controls the extension — passthrough v2 data must not leak new UI.
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({ qualityReview: V2_REVIEW }) as any)}
      />
    );
    expect(screen.getByTestId("vd-quality-overall-score").textContent).toBe(
      "คะแนนรวม4/5"
    );
    expect(screen.queryByText(/เกณฑ์/)).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-quality-density-metrics")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("ความแข็งแรงของ hook")).not.toBeInTheDocument();
  });
});

describe("VerticalDramaStoryboardPanel — density meter (flags.speechBudget)", () => {
  it("stays hidden when the flag is off even with motionPromptPack clips present", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          motionPromptPack: {
            clips: [
              {
                clipNumber: 1,
                sourceShotNumbers: [1],
                prompt: "p",
                durationSeconds: 60,
                dialogue: [],
              },
            ],
          },
        }) as any)}
      />
    );
    expect(screen.queryByTestId("vd-density-meter")).not.toBeInTheDocument();
  });

  it("renders once speechBudgetEnabled is on and clips exist, and suppresses the legacy simple banner", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          speechBudgetEnabled: true,
          motionPromptPack: {
            clips: [
              {
                clipNumber: 1,
                sourceShotNumbers: [1],
                prompt: "p",
                durationSeconds: 60,
                dialogue: [],
              },
            ],
          },
        }) as any)}
      />
    );
    expect(screen.getByTestId("vd-density-meter")).toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-storyboard-dialogue-episode-quality-warning")
    ).not.toBeInTheDocument();
  });

  it("calls onRepairWholeEpisodeScript from the density meter's repair CTA", () => {
    const onRepairWholeEpisodeScript = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          speechBudgetEnabled: true,
          onRepairWholeEpisodeScript,
          motionPromptPack: {
            clips: [
              {
                clipNumber: 1,
                sourceShotNumbers: [1],
                prompt: "p",
                durationSeconds: 60,
                dialogue: [],
              },
            ],
          },
        }) as any)}
      />
    );
    fireEvent.click(screen.getByTestId("vd-density-repair-whole-episode"));
    expect(onRepairWholeEpisodeScript).toHaveBeenCalledTimes(1);
  });
});

describe("VerticalDramaStoryboardPanel — density meter episode band uses the FULL duration profile, not just generated clips (2026-07-08 fix)", () => {
  // Real 9-shot/60s fallback duration profile (spec §7.4) — matches the bug
  // report's "สตอรีบอร์ด — 9 ช็อต" header on a 60-second episode.
  const durations =
    VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK.shotDurationsSeconds;
  const shots = durations.map((duration_seconds, i) => ({
    shot_number: i + 1,
    visual_description: `shot ${i + 1}`,
    characters: [] as string[],
    duration_seconds,
  }));
  // Only shots 1, 2, 4 have a generated `video_motion_prompt_pack` clip so
  // far (`generateShotVideoPrompt` builds `motionPromptPack.clips`
  // incrementally, one shot at a time — see that procedure's doc comment in
  // `server/routers/verticalDramaEpisodes.ts`) — matches the bug report's
  // "per-shot chips show only shots 1/2/4".
  const partialMotionPromptPack = {
    clips: [
      {
        clipNumber: 1,
        sourceShotNumbers: [1],
        parentShotNumber: 1,
        prompt: "p1",
        durationSeconds: durations[0],
        dialogue: [{ lineTh: "หนึ่งสองสาม" }],
      },
      {
        clipNumber: 2,
        sourceShotNumbers: [2],
        parentShotNumber: 2,
        prompt: "p2",
        durationSeconds: durations[1],
        dialogue: [{ lineTh: "สี่ห้าหก" }],
      },
      {
        clipNumber: 4,
        sourceShotNumbers: [4],
        parentShotNumber: 4,
        prompt: "p4",
        durationSeconds: durations[3],
        dialogue: [{ lineTh: "เจ็ดแปดเก้า" }],
      },
    ],
  };

  it("computes the episode target band from ALL 9 shots' durations (60s total), not only the 3 generated clips (~20s)", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          storyboard: { shots },
          speechBudgetEnabled: true,
          motionPromptPack: partialMotionPromptPack,
        }) as any)}
      />
    );
    const totalSeconds = durations.reduce((a, b) => a + b, 0); // 60
    const expectedMin = (MIN_EPISODE_COVERAGE_RATIO * totalSeconds).toFixed(0); // "35"
    const expectedMax = durations
      .reduce((sum, d) => sum + targetVerticalDramaSpeechSeconds(d), 0)
      .toFixed(0); // "41"
    const meter = screen.getByTestId("vd-density-meter");
    // The bug summed only the 3 generated shots (8+8+4=20s), producing a
    // band of ~"12-14" — assert the CORRECT full-episode band instead.
    expect(meter.textContent).toContain(
      `จากเป้า ${expectedMin}-${expectedMax} วิ`
    );
    expect(meter.textContent).not.toContain("จากเป้า 12-14 วิ");
  });

  it("renders a chip for every shot in the full storyboard (9), not just the 3 with generated clips", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          storyboard: { shots },
          speechBudgetEnabled: true,
          motionPromptPack: partialMotionPromptPack,
        }) as any)}
      />
    );
    for (let shotNumber = 1; shotNumber <= 9; shotNumber += 1) {
      expect(
        screen.getByTestId(`vd-density-shot-chip-${shotNumber}`)
      ).toBeInTheDocument();
    }
  });

  it("shows a visible over-length warning on a shot whose estimated speech exceeds its clip duration", () => {
    // 111 Thai chars ≈ 13.06s of speech (canonical 8.5 chars/sec rate) inside
    // an 8s clip — dialogue that cannot physically fit, mirroring the bug
    // report's "15.6s speech in an 8s clip" example.
    const overLengthLine =
      "ประโยคภาษาไทยที่ยาวมากสำหรับทดสอบการพูดเกินเวลาของช็อตนี้จริงจังมากขึ้นไปอีกเพื่อให้แน่ใจว่าเกินแปดวินาทีแน่นอน";
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          storyboard: {
            shots: [
              {
                shot_number: 1,
                visual_description: "s1",
                characters: [],
                duration_seconds: 8,
              },
            ],
          },
          speechBudgetEnabled: true,
          motionPromptPack: {
            clips: [
              {
                clipNumber: 1,
                sourceShotNumbers: [1],
                parentShotNumber: 1,
                prompt: "p1",
                durationSeconds: 8,
                dialogue: [{ lineTh: overLengthLine }],
              },
            ],
          },
        }) as any)}
      />
    );
    expect(screen.getByTestId("vd-density-overlength-1")).toBeInTheDocument();
  });
});

describe("VerticalDramaStoryboardPanel — scorecard v2 (flags.qualityLoopV2)", () => {
  it("renders the new dimensions and the floors template once the flag is on", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          qualityReview: V2_REVIEW,
          qualityLoopV2Enabled: true,
          qualityPolicy: POLICY,
        }) as any)}
      />
    );
    expect(screen.getByTestId("vd-quality-overall-score").textContent).toBe(
      "คะแนนรวม 4/5 (เกณฑ์ 4)"
    );
    expect(screen.getByText("ความแข็งแรงของ hook")).toBeInTheDocument();
    expect(screen.getByText("ความค้างคาใจตอนจบ")).toBeInTheDocument();
    expect(screen.getByText("ความต่อเนื่องของเรื่อง")).toBeInTheDocument();
    expect(
      screen.getByText("ความเป็นธรรมชาติของการฝังสินค้า")
    ).toBeInTheDocument();
  });

  it("renders the density-facts row from review.density_metrics", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          qualityReview: V2_REVIEW,
          qualityLoopV2Enabled: true,
          qualityPolicy: POLICY,
        }) as any)}
      />
    );
    const row = screen.getByTestId("vd-quality-density-metrics");
    expect(row.textContent).toContain("30.0s");
    expect(row.textContent).toContain("60%");
  });

  it("shows the loop CTA with the full-loop credit estimate, confirms, and calls onRunQualityImproveLoop", () => {
    const onRunQualityImproveLoop = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          qualityReview: {
            ...V2_REVIEW,
            scorecard: { ...V2_REVIEW.scorecard, overall: 2 },
          },
          qualityLoopV2Enabled: true,
          qualityPolicy: POLICY,
          onRunQualityImproveLoop,
        }) as any)}
      />
    );
    const button = screen.getByTestId("vd-quality-run-loop");
    expect(button.textContent).toContain(
      "ปรับอัตโนมัติ (สูงสุด 2 รอบ, ~40 เครดิต)"
    );
    fireEvent.click(button);
    expect(onRunQualityImproveLoop).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("vd-quality-loop-confirm-submit"));
    expect(onRunQualityImproveLoop).toHaveBeenCalledTimes(1);
  });

  it("announces loop-running state via the aria-live region", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          qualityReview: V2_REVIEW,
          qualityLoopV2Enabled: true,
          qualityPolicy: POLICY,
          onRunQualityImproveLoop: vi.fn(),
          runningQualityImproveLoop: true,
        }) as any)}
      />
    );
    expect(screen.getByTestId("vd-quality-loop-live-region").textContent).toBe(
      "กำลังปรับอัตโนมัติ…"
    );
  });

  it("announces a non-escalated loop completion (before/after) once runningLoop flips back to false", () => {
    const loopState = {
      episodeId: "ep1",
      rounds: [
        {
          round: 1,
          reviewArtifactId: "r1",
          stagesRepaired: ["plan_episode_script"],
          reReviewArtifactId: "r2",
          overallBefore: 2,
          overallAfter: 4,
        },
      ],
      status: "running" as const,
      activeReviewArtifactId: "r2",
    };
    const props = {
      qualityReview: V2_REVIEW,
      qualityLoopV2Enabled: true,
      qualityPolicy: POLICY,
      qualityLoopState: loopState,
      onRunQualityImproveLoop: vi.fn(),
    };
    const { rerender } = render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({ ...props, runningQualityImproveLoop: true }) as any)}
      />
    );
    expect(screen.getByTestId("vd-quality-loop-live-region").textContent).toBe(
      "กำลังปรับอัตโนมัติ…"
    );

    rerender(
      <VerticalDramaStoryboardPanel
        {...(baseProps({ ...props, runningQualityImproveLoop: false }) as any)}
      />
    );
    expect(screen.getByTestId("vd-quality-loop-live-region").textContent).toBe(
      "2/5 → 4/5"
    );
  });

  it("renders the round-history list using the exact 'รอบ N: แก้บท → แก้สตอรีบอร์ด → ตรวจใหม่' Copy Contract prefix", () => {
    const loopState = {
      episodeId: "ep1",
      rounds: [
        {
          round: 1,
          reviewArtifactId: "r1",
          stagesRepaired: ["plan_episode_script", "storyboard_shotgrid"],
          reReviewArtifactId: "r2",
          overallBefore: 2,
          overallAfter: 3,
        },
      ],
      status: "running" as const,
      activeReviewArtifactId: "r2",
    };
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          qualityReview: V2_REVIEW,
          qualityLoopV2Enabled: true,
          qualityPolicy: POLICY,
          qualityLoopState: loopState,
        }) as any)}
      />
    );
    const history = screen.getByTestId("vd-quality-loop-round-history");
    expect(history.textContent).toContain(
      "รอบ 1: แก้บท → แก้สตอรีบอร์ด → ตรวจใหม่"
    );
    expect(history.textContent).toContain("2/5 → 3/5");
  });

  it("renders the escalated_max_rounds banner as a heading with role=alert and both-report context", () => {
    const loopState = {
      episodeId: "ep1",
      rounds: [
        {
          round: 1,
          reviewArtifactId: "r1",
          stagesRepaired: ["plan_episode_script"],
          reReviewArtifactId: "r2",
          overallBefore: 2,
          overallAfter: 2,
        },
        {
          round: 2,
          reviewArtifactId: "r2",
          stagesRepaired: ["plan_episode_script"],
          reReviewArtifactId: "r3",
          overallBefore: 2,
          overallAfter: 2,
        },
      ],
      status: "escalated_max_rounds" as const,
      activeReviewArtifactId: "r3",
    };
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          qualityReview: V2_REVIEW,
          qualityLoopV2Enabled: true,
          qualityPolicy: POLICY,
          qualityLoopState: loopState,
        }) as any)}
      />
    );
    const banner = screen.getByTestId(
      "vd-quality-loop-escalation-escalated_max_rounds"
    );
    expect(banner).toHaveAttribute("role", "alert");
    expect(banner.querySelector("h4")?.textContent).toBe(
      "ครบ 2 รอบแล้วยังไม่ถึงเกณฑ์ — ต้องตรวจเอง"
    );
    expect(banner.textContent).toContain("2/5 → 2/5");
  });

  it("renders the escalated_regression banner with the exact Copy Contract heading", () => {
    const loopState = {
      episodeId: "ep1",
      rounds: [
        {
          round: 1,
          reviewArtifactId: "r1",
          stagesRepaired: ["plan_episode_script"],
          reReviewArtifactId: "r2",
          overallBefore: 4,
          overallAfter: 3,
        },
      ],
      status: "escalated_regression" as const,
      activeReviewArtifactId: "r1",
    };
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          qualityReview: V2_REVIEW,
          qualityLoopV2Enabled: true,
          qualityPolicy: POLICY,
          qualityLoopState: loopState,
        }) as any)}
      />
    );
    const banner = screen.getByTestId(
      "vd-quality-loop-escalation-escalated_regression"
    );
    expect(banner.querySelector("h4")?.textContent).toBe(
      "คะแนนแย่ลง — คงเวอร์ชันที่ดีกว่าไว้ ต้องตรวจเอง"
    );
  });

  it("debt-item-3: highlights a dimension that fails the per-dimension floor, and does not highlight a passing one", () => {
    // V2_REVIEW.scorecard.cliffhanger_strength (2) is below
    // POLICY.minPerDimension (3) — every other v2 dimension meets the floor,
    // so this is a single, unambiguous failing dimension. Regression guard
    // for the label-vs-id comparison bug: `failingDimensionSet` is built
    // from canonical snake_case keys (`evaluateScorecardAgainstPolicy`), so
    // comparing against the translated display label meant this highlight
    // could never activate.
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          qualityReview: V2_REVIEW,
          qualityLoopV2Enabled: true,
          qualityPolicy: POLICY,
        }) as any)}
      />
    );
    expect(
      screen.getByTestId("vd-quality-dimension-score-cliffhanger_strength")
    ).toHaveClass("text-destructive");
    expect(
      screen.getByTestId("vd-quality-dimension-score-hook_strength")
    ).not.toHaveClass("text-destructive");
  });
});

describe("VerticalDramaStoryboardPanel — tie-in report card (flags.tieInQc)", () => {
  it("stays hidden when the flag is off", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({ tieInEnabled: true }) as any)}
      />
    );
    expect(
      screen.queryByTestId("vd-tie-in-report-card")
    ).not.toBeInTheDocument();
  });

  it("renders once the flag and series tie-in are both on, even with no report yet", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({ tieInQcEnabled: true, tieInEnabled: true }) as any)}
      />
    );
    expect(screen.getByTestId("vd-tie-in-report-card")).toBeInTheDocument();
    expect(screen.getByTestId("vd-tie-in-no-report")).toBeInTheDocument();
  });

  it("wires onDeferTieIn and onRunQualityImproveLoop into the tie-in card's CTAs", () => {
    const onDeferTieIn = vi.fn();
    const onRunQualityImproveLoop = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          tieInQcEnabled: true,
          tieInEnabled: true,
          tieInQualityReport: {
            storyIntegration: 3,
            characterMotivation: 3,
            toneMatch: 3,
            spokenMentionCount: 1,
            visualShotCount: 1,
            adSpeakViolations: [],
            claimViolations: [],
            disclosureSeparated: true,
            fatigueOk: true,
            naturalnessScore: 60,
            passed: false,
          },
          onDeferTieIn,
          onRunQualityImproveLoop,
        }) as any)}
      />
    );
    fireEvent.click(screen.getByTestId("vd-tie-in-apply-recommendations"));
    expect(onRunQualityImproveLoop).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("vd-tie-in-defer"));
    fireEvent.click(screen.getByTestId("vd-tie-in-defer-confirm-submit"));
    expect(onDeferTieIn).toHaveBeenCalledTimes(1);
  });
});

describe("VerticalDramaStoryboardPanel — error message mapper", () => {
  it("maps a VD_TIE_IN_BELOW_FLOOR-prefixed error to the friendly Thai hint", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          error:
            "VD_TIE_IN_BELOW_FLOOR: Tie-in naturalness report (score 55) is below the pass floor",
        }) as any)}
      />
    );
    expect(
      screen.getByText(/ตอนนี้ยังต่ำกว่าเกณฑ์ความเป็นธรรมชาติของการฝังสินค้า/)
    ).toBeInTheDocument();
  });

  it("passes through an unrelated error message unchanged", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({ error: "network timeout" }) as any)}
      />
    );
    expect(screen.getByText(/network timeout/)).toBeInTheDocument();
  });
});

describe("VerticalDramaStoryboardPanel — meta/shot-grid disclosure split (2026-07-08 fix)", () => {
  it("productionWizardEnabled=false (default): meta sections and the shot grid both render unwrapped — byte-identical to pre-split markup", () => {
    render(<VerticalDramaStoryboardPanel {...(baseProps() as any)} />);
    expect(
      screen.getByTestId("vd-storyboard-run-quality-review")
    ).toBeInTheDocument();
    expect(screen.getByTestId("vd-storyboard-shot-1")).toBeInTheDocument();
  });

  it("productionWizardEnabled=true, advancedMetaOpen=false: hides the meta sections but keeps the per-shot grid always visible", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          productionWizardEnabled: true,
          advancedMetaOpen: false,
        }) as any)}
      />
    );
    expect(
      screen.queryByTestId("vd-storyboard-run-quality-review")
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("vd-storyboard-shot-1")).toBeInTheDocument();
  });

  it("productionWizardEnabled=true, advancedMetaOpen=true: reveals the meta sections, grid still visible", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          productionWizardEnabled: true,
          advancedMetaOpen: true,
        }) as any)}
      />
    );
    expect(
      screen.getByTestId("vd-storyboard-run-quality-review")
    ).toBeInTheDocument();
    expect(screen.getByTestId("vd-storyboard-shot-1")).toBeInTheDocument();
  });

  it("hides the density meter, model row, and summarize-memory card together with the meta section when collapsed", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          productionWizardEnabled: true,
          advancedMetaOpen: false,
          speechBudgetEnabled: true,
          motionPromptPack: {
            clips: [
              {
                clipNumber: 1,
                sourceShotNumbers: [1],
                prompt: "p",
                durationSeconds: 60,
                dialogue: [],
              },
            ],
          },
          onSelectImageModel: vi.fn(),
          onSummarizeEpisodeToMemory: vi.fn(),
        }) as any)}
      />
    );
    expect(screen.queryByTestId("vd-density-meter")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-storyboard-select-image-model")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-storyboard-summarize-memory")
    ).not.toBeInTheDocument();
    // The per-shot grid stays visible regardless.
    expect(screen.getByTestId("vd-storyboard-shot-1")).toBeInTheDocument();
  });

  it("gives the per-shot production grid a stable scroll anchor id, always present regardless of the meta disclosure state", () => {
    const { container } = render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          productionWizardEnabled: true,
          advancedMetaOpen: false,
        }) as any)}
      />
    );
    expect(
      container.querySelector("#vd-storyboard-shot-grid")
    ).toBeInTheDocument();
  });
});

describe("VerticalDramaStoryboardPanel — W11.6 Story Lock (flags.storyLockEnabled)", () => {
  it("renders the scorecard byte-identically when storyLockEnabled is false, even with a v2 review + policy", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          qualityReview: V2_REVIEW,
          qualityLoopV2Enabled: true,
          qualityPolicy: POLICY,
          storyLockEnabled: false,
          seriesId: "10",
        }) as any)}
      />
    );

    expect(
      screen.queryByTestId("vd-quality-story-lock-block")
    ).not.toBeInTheDocument();
    // Story dims still render in the main (actionable) row, unchanged.
    expect(screen.getByText("ความแข็งแรงของ hook")).toBeInTheDocument();
    expect(screen.getByText("จำนวนจุดพลิก")).toBeInTheDocument();
  });

  it("splits story dims into a read-only block with an Overview link, keeps execution dims actionable", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          qualityReview: V2_REVIEW,
          qualityLoopV2Enabled: true,
          qualityPolicy: POLICY,
          storyLockEnabled: true,
          seriesId: "10",
        }) as any)}
      />
    );

    const storyBlock = screen.getByTestId("vd-quality-story-lock-block");
    expect(storyBlock).toBeInTheDocument();
    expect(storyBlock.textContent).toContain("คุณภาพเนื้อเรื่อง — ตัดสินที่หน้าภาพรวมแล้ว");
    // Story dims (reversal count/sharpness, hook, cliffhanger, continuity) live inside the story block.
    expect(storyBlock.textContent).toContain("ความแข็งแรงของ hook");
    expect(storyBlock.textContent).toContain("ความค้างคาใจตอนจบ");
    expect(storyBlock.textContent).toContain("ความต่อเนื่องของเรื่อง");
    expect(storyBlock.textContent).toContain("จำนวนจุดพลิก");

    // Execution dims (pacing/emotion/dialogue naturalness) stay OUTSIDE the story block, in the actionable row.
    expect(storyBlock.textContent).not.toContain("จังหวะเรื่อง");
    expect(screen.getByText("จังหวะเรื่อง")).toBeInTheDocument();
    // Tie-in naturalness is neither story nor execution — stays in the actionable row too.
    expect(storyBlock.textContent).not.toContain("ความเป็นธรรมชาติของการฝังสินค้า");
    expect(screen.getByText("ความเป็นธรรมชาติของการฝังสินค้า")).toBeInTheDocument();

    const overviewLink = screen.getByTestId("vd-quality-story-lock-overview-link");
    expect(overviewLink).toHaveAttribute("href", "/drama-series/10");
  });

  it("renames the apply CTA and adds the execution-only subtitle note when storyLockEnabled is true", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          qualityReview: { ...V1_REVIEW, issues: [{ location: "shot 1", problem: "p", suggested_fix: "f" }] },
          storyLockEnabled: true,
          onApplyQualityReviewSuggestions: vi.fn(),
        }) as any)}
      />
    );

    expect(screen.getByTestId("vd-quality-review-apply").textContent).toBe(
      "เกลี่ยบท/ปรับถ้อยคำ (ไม่เปลี่ยนเนื้อเรื่อง)"
    );
    expect(screen.getByText(/เนื้อเรื่องถูกล็อกไว้แล้ว/)).toBeInTheDocument();
  });

  it("keeps the v1 apply CTA label and subtitle when storyLockEnabled is false", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          qualityReview: { ...V1_REVIEW, issues: [{ location: "shot 1", problem: "p", suggested_fix: "f" }] },
          storyLockEnabled: false,
          onApplyQualityReviewSuggestions: vi.fn(),
        }) as any)}
      />
    );

    expect(screen.getByTestId("vd-quality-review-apply").textContent).toBe(
      "อนุมัติและปรับเรื่องตามคำแนะนำ (มีค่าใช้จ่าย)"
    );
    expect(screen.queryByText(/เนื้อเรื่องถูกล็อกไว้แล้ว/)).not.toBeInTheDocument();
  });
});
