/**
 * Coverage for `productionWizard.ts`'s pure Production Wizard state resolver
 * (spec §8.8, §16.1, §13.1, §7.7.3, §17; section-12-production-wizard-
 * guided-workflow.md "Test Plan / Unit" list). Every fixture is a plain
 * object — no DB/LLM/network is exercised anywhere in this file, matching
 * the resolver's own pure design.
 */
import { describe, expect, it } from "vitest";
import {
  deriveVerticalDramaProductionWizardState,
  VERTICAL_DRAMA_PRODUCTION_WIZARD_CREDIT_SPENDING_CLASSES,
  VERTICAL_DRAMA_PRODUCTION_WIZARD_PASS_STATES,
  VERTICAL_DRAMA_PRODUCTION_WIZARD_STEP_IDS,
  VERTICAL_DRAMA_WIZARD_BLOCKING_REASON_CODES,
  VERTICAL_DRAMA_WIZARD_CRITERION_IDS,
  VERTICAL_DRAMA_WIZARD_EVIDENCE_IDS,
  VERTICAL_DRAMA_WIZARD_OUT_OF_SCOPE_NOTE_IDS,
  type DeriveVerticalDramaProductionWizardStateInput,
  type VerticalDramaWizardPerShotDialogueCompleteness,
} from "../productionWizard";
import {
  VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
  type VerticalDramaQualityScorecardDimensions,
} from "../qualityPolicy";
import type {
  VerticalDramaDialogueQualityIssue,
  VerticalDramaEpisodeDialogueQuality,
} from "../dialogueQuality";

/* -------------------------------------------------------------------------- */
/* Fixture builders                                                           */
/* -------------------------------------------------------------------------- */

function passingScorecard(
  overrides: Partial<VerticalDramaQualityScorecardDimensions> = {},
): VerticalDramaQualityScorecardDimensions {
  return {
    overall: 4,
    reversal_sharpness: 4,
    emotion_variety: 4,
    dialogue_naturalness: 4,
    pacing: 4,
    ...overrides,
  };
}

function passingDialogueQuality(
  overrides: Partial<VerticalDramaEpisodeDialogueQuality> = {},
): VerticalDramaEpisodeDialogueQuality {
  return {
    totalDurationSeconds: 60,
    totalSpeechSeconds: 40,
    targetSpeechSeconds: 34.8,
    coverageRatio: 0.667,
    clips: [],
    issues: [],
    ...overrides,
  };
}

function dialogueIssue(
  overrides: Partial<VerticalDramaDialogueQualityIssue> = {},
): VerticalDramaDialogueQualityIssue {
  return {
    code: "VD_DIALOGUE_UNDERFILLED",
    severity: "error",
    message: "test issue",
    ...overrides,
  };
}

/** A fully-OK per-shot completeness array (2026-07-08/W9-A content-
 *  completeness wave) — every shot has a resolved line, fits its duration,
 *  has no long silence, and every line is speakable. Used by the golden
 *  path + "every criterion true" fixtures. */
function passingPerShotCompleteness(count = 9): VerticalDramaWizardPerShotDialogueCompleteness[] {
  return Array.from({ length: count }, (_, i) => ({
    shotNumber: i + 1,
    hasResolvedLine: true,
    overLength: false,
    silent: false,
    allLinesSpeakable: true,
  }));
}

/** Fully-passed "golden path" episode — every override in the tests below
 *  narrows exactly one slice of this so each test's intent stays obvious. */
function baseInput(
  overrides: Partial<DeriveVerticalDramaProductionWizardStateInput> = {},
): DeriveVerticalDramaProductionWizardStateInput {
  return {
    seriesSetup: { complete: true },
    script: {
      exists: true,
      coverageStatus: "in_range",
      // 2026-07-08/W9-A content-completeness wave — the golden path's
      // storyboard also has 9 shots, so a fully-passing per-shot summary
      // keeps every step "passed" (never "incomplete"/"failed") end to end.
      perShotCompleteness: passingPerShotCompleteness(9),
      // Acceptance-review fix #1 (2026-07-08) — the golden path's script has
      // a complete hook/beats/cliffhanger, so `story_structure_complete`
      // also reads true end to end.
      structureComplete: true,
    },
    storyboard: {
      exists: true,
      shotCount: 9,
      beatsMapped: true,
      imagePromptsAllShots: true,
      videoPromptsAllShots: true,
    },
    scriptQc: {
      latestScorecard: passingScorecard(),
      policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
      loopStatus: "passed",
      tieIn: { enabled: false },
      hasUnresolvedRecommendedRepairs: false,
    },
    startFrames: { requiredShots: 9, approvedShots: 9 },
    dialogueAudio: { exists: true },
    episodeDialogueQuality: passingDialogueQuality(),
    videoPrompts: { exists: true, stale: false },
    shotRepair: { failingTargetCount: 0 },
    clips: { required: 8, completed: 8 },
    assembly: { completed: true, durationsAligned: true, audioSubtitleResolved: true },
    arcReplanPending: false,
    flags: {
      speechBudget: true,
      qualityLoopV2: true,
      tieInQc: false,
      productionWizard: true,
      arcReplan: true,
    },
    gateExemptStepIds: [],
    ...overrides,
  };
}

function stepById(
  result: ReturnType<typeof deriveVerticalDramaProductionWizardState>,
  stepId: (typeof VERTICAL_DRAMA_PRODUCTION_WIZARD_STEP_IDS)[number],
) {
  const step = result.steps.find(s => s.stepId === stepId);
  if (!step) throw new Error(`step ${stepId} missing from resolver output`);
  return step;
}

/* -------------------------------------------------------------------------- */
/* Structural sanity                                                          */
/* -------------------------------------------------------------------------- */

describe("deriveVerticalDramaProductionWizardState — structure", () => {
  it("always returns all 11 steps in the canonical spec §8.8 order", () => {
    const result = deriveVerticalDramaProductionWizardState(baseInput());
    expect(result.steps.map(s => s.stepId)).toEqual([...VERTICAL_DRAMA_PRODUCTION_WIZARD_STEP_IDS]);
  });

  it("golden path: a fully-complete episode is 'passed' end to end, active step final_episode, primaryCta none", () => {
    const result = deriveVerticalDramaProductionWizardState(baseInput());
    for (const step of result.steps) {
      if (step.stepId === "shot_repair") {
        expect(step.status).toBe("optional");
        continue;
      }
      expect(step.status).toBe("passed");
      // 2026-07-08 criteria-transparency wave — a TRULY clean golden path
      // has no criterion reading false/null anywhere, so every step's
      // passState is the clean "passed", never "passed_with_warnings".
      expect(step.passState).toBe("passed");
    }
    expect(result.activeStepId).toBe("final_episode");
    expect(result.primaryCta).toBe("none");
  });
});

/* -------------------------------------------------------------------------- */
/* series_setup / episode_script / Gate 0                                     */
/* -------------------------------------------------------------------------- */

describe("series setup gating", () => {
  it("series setup incomplete: active step is series_setup, episode_script and beyond stay locked", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ seriesSetup: { complete: false } }),
    );
    expect(result.activeStepId).toBe("series_setup");
    expect(result.primaryCta).toBe("complete_series_setup");
    expect(stepById(result, "episode_script").status).toBe("locked");
    expect(stepById(result, "storyboard_shots").status).toBe("locked");
  });
});

describe("missing script (Test Plan: 'missing script')", () => {
  it("shows episode_script as the active/ready step offering generate_script, storyboard locked", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ script: { exists: false, coverageStatus: "in_range" } }),
    );
    expect(result.activeStepId).toBe("episode_script");
    expect(result.primaryCta).toBe("generate_script");
    expect(stepById(result, "episode_script").status).toBe("ready");

    const storyboard = stepById(result, "storyboard_shots");
    expect(storyboard.status).toBe("locked");
    expect(storyboard.blockingReasons).toEqual(["VD_WIZARD_SCRIPT_MISSING"]);
  });
});

describe("script underfilled (Test Plan: 'script underfilled → storyboard locked')", () => {
  it("underfilled_error locks storyboard_shots and puts episode_script into needs_repair", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ script: { exists: true, coverageStatus: "underfilled_error" } }),
    );
    const script = stepById(result, "episode_script");
    expect(script.status).toBe("needs_repair");
    expect(script.blockingReasons).toEqual(["VD_WIZARD_SCRIPT_UNDERFILLED"]);
    expect(script.primaryAction).toBe("generate_script");

    const storyboard = stepById(result, "storyboard_shots");
    expect(storyboard.status).toBe("locked");
    expect(storyboard.blockingReasons).toEqual(["VD_WIZARD_SCRIPT_UNDERFILLED"]);

    expect(result.activeStepId).toBe("episode_script");
    expect(result.primaryCta).toBe("generate_script");
  });

  it("underfilled_warning does NOT lock storyboard_shots (only ERROR level blocks, spec §7.7.2)", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ script: { exists: true, coverageStatus: "underfilled_warning" } }),
    );
    expect(stepById(result, "episode_script").status).toBe("passed");
    expect(stepById(result, "storyboard_shots").status).toBe("passed");
  });
});

describe("script no_dialogue_data — grandfathering (2026-07-08 fix, spec §17)", () => {
  it("does NOT lock storyboard_shots and does NOT put episode_script into needs_repair — a legacy script with no embedded dialogue data must never be treated as underfilled_error", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ script: { exists: true, coverageStatus: "no_dialogue_data" } }),
    );
    const script = stepById(result, "episode_script");
    expect(script.status).toBe("passed");
    expect(script.blockingReasons).toEqual([]);
    expect(script.primaryAction).toBe("none");

    const storyboard = stepById(result, "storyboard_shots");
    expect(storyboard.status).toBe("passed");
    expect(storyboard.blockingReasons).toEqual([]);
  });
});

describe("script coverage evidence — real numbers, never the raw enum (2026-07-08 fix)", () => {
  it("when coverageDetail is supplied, the evidence row carries a structured scriptCoverage payload and a numeric (non-enum) value fallback", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        script: {
          exists: true,
          coverageStatus: "underfilled_error",
          coverageDetail: {
            estimatedSpeechSeconds: 0,
            targetSpeechSecondsMin: 34.8,
            targetSpeechSecondsMax: 40.8,
          },
        },
      }),
    );
    const row = stepById(result, "episode_script").evidence[0];
    expect(row.value).not.toBe("underfilled_error");
    expect(row.scriptCoverage).toEqual({
      status: "underfilled_error",
      estimatedSpeechSeconds: 0,
      targetSpeechSecondsMin: 34.8,
      targetSpeechSecondsMax: 40.8,
    });
    expect(row.severity).toBe("error");
  });

  it("no_dialogue_data with coverageDetail still carries scriptCoverage and a warning severity", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        script: {
          exists: true,
          coverageStatus: "no_dialogue_data",
          coverageDetail: { estimatedSpeechSeconds: 0, targetSpeechSecondsMin: 34.8, targetSpeechSecondsMax: 40.8 },
        },
      }),
    );
    const row = stepById(result, "episode_script").evidence[0];
    expect(row.value).not.toBe("no_dialogue_data");
    expect(row.scriptCoverage?.status).toBe("no_dialogue_data");
    expect(row.severity).toBe("warning");
  });

  it("without coverageDetail (flags-off path): label/value stay byte-identical, but the row now also carries a real evidenceId instead of leaking the raw coverageStatus enum untranslated (2026-07-08 acceptance-review fix #4 — deliberate, documented contract update: `label`/`value` are the SAME pre-Wave-7E fallback text as before, but a locale-aware caller MUST now render via evidenceId, never the raw `value` string, for every coverageStatus)", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ script: { exists: true, coverageStatus: "in_range" } }),
    );
    const row = stepById(result, "episode_script").evidence[0];
    expect(row).toEqual({
      label: "Speech coverage",
      value: "in_range",
      severity: undefined,
      evidenceId: "script_speech_coverage_in_range",
    });
    expect(row.scriptCoverage).toBeUndefined();
  });

  it("2026-07-08 acceptance-review fix #4: every coverageStatus value gets its OWN distinct evidenceId in the flags-off fallback branch (never one shared id + the raw enum as `detail`)", () => {
    const cases: Array<{
      coverageStatus: "in_range" | "underfilled_warning" | "underfilled_error" | "no_dialogue_data";
      evidenceId: string;
    }> = [
      { coverageStatus: "in_range", evidenceId: "script_speech_coverage_in_range" },
      { coverageStatus: "underfilled_warning", evidenceId: "script_speech_coverage_underfilled_warning" },
      { coverageStatus: "underfilled_error", evidenceId: "script_speech_coverage_underfilled_error" },
      { coverageStatus: "no_dialogue_data", evidenceId: "script_speech_coverage_no_dialogue_data" },
    ];
    for (const { coverageStatus, evidenceId } of cases) {
      const result = deriveVerticalDramaProductionWizardState(
        baseInput({ script: { exists: true, coverageStatus } }),
      );
      const row = stepById(result, "episode_script").evidence[0];
      expect(row.evidenceId).toBe(evidenceId);
      expect(row.detail).toBeUndefined();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* storyboard -> script_qc (Gate 0b) / spec §16.1 / §13.1 / §7.7.3            */
/* -------------------------------------------------------------------------- */

describe("missing storyboard (Test Plan: 'missing storyboard → script_qc locked')", () => {
  it("locks script_qc when the storyboard does not exist yet, even with a passing script", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ storyboard: { exists: false } }),
    );
    expect(stepById(result, "storyboard_shots").status).toBe("ready");
    const scriptQc = stepById(result, "script_qc");
    expect(scriptQc.status).toBe("locked");
    expect(scriptQc.blockingReasons).toEqual(["VD_WIZARD_STORYBOARD_MISSING"]);
    expect(result.activeStepId).toBe("storyboard_shots");
    expect(result.primaryCta).toBe("generate_storyboard");
  });
});

describe("script quality below policy floors (Test Plan: 'script_qc active with loop CTA, paid start-frame steps locked')", () => {
  it("offers the bounded auto-improve loop and locks start_frames", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        scriptQc: {
          latestScorecard: passingScorecard({ overall: 2 }),
          policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
          loopStatus: "idle",
          tieIn: { enabled: false },
        },
      }),
    );

    const scriptQc = stepById(result, "script_qc");
    expect(scriptQc.status).toBe("needs_repair");
    expect(scriptQc.primaryAction).toBe("run_quality_improve_loop");
    expect(scriptQc.blockingReasons).toEqual(["VD_WIZARD_SCRIPT_QUALITY_BELOW_FLOOR"]);

    const startFrames = stepById(result, "start_frames");
    expect(startFrames.status).toBe("locked");
    expect(startFrames.blockingReasons).toEqual(["VD_WIZARD_SCRIPT_QUALITY_BELOW_FLOOR"]);

    expect(result.activeStepId).toBe("script_qc");
    expect(result.primaryCta).toBe("run_quality_improve_loop");
  });

  it("offers run_quality_review (first run) when no scorecard has ever been produced, and still locks start_frames", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        scriptQc: {
          latestScorecard: null,
          policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
          loopStatus: "not_run",
          tieIn: { enabled: false },
        },
      }),
    );

    const scriptQc = stepById(result, "script_qc");
    expect(scriptQc.status).toBe("ready");
    expect(scriptQc.primaryAction).toBe("run_quality_review");
    // Nothing has actually FAILED yet — script_qc's own reasons stay empty
    // (see module header, decision 4); the downstream gate still needs one.
    expect(scriptQc.blockingReasons).toEqual([]);

    const startFrames = stepById(result, "start_frames");
    expect(startFrames.status).toBe("locked");
    // 2026-07-08 acceptance-review fix #6 — distinct fallback code for
    // "never reviewed" (no scorecard at all), instead of reusing
    // VD_WIZARD_SCRIPT_QUALITY_BELOW_FLOOR (which misleadingly implied a
    // review actually ran and failed the floor).
    expect(startFrames.blockingReasons).toEqual(["VD_WIZARD_SCRIPT_QUALITY_NOT_REVIEWED"]);
  });

  it("maxAutoImproveRounds: 0 ('manual apply only') falls back to run_quality_review instead of the loop", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        scriptQc: {
          latestScorecard: passingScorecard({ overall: 2 }),
          policy: { ...VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS, maxAutoImproveRounds: 0 },
          loopStatus: "idle",
          tieIn: { enabled: false },
        },
      }),
    );
    expect(stepById(result, "script_qc").primaryAction).toBe("run_quality_review");
  });
});

describe("quality loop escalated (Test Plan: 'quality loop escalated (both variants)')", () => {
  it("escalated_max_rounds → needs_repair, escalation reason present, CTA falls back to run_quality_review", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        scriptQc: {
          latestScorecard: passingScorecard({ overall: 2 }),
          policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
          loopStatus: "escalated_max_rounds",
          tieIn: { enabled: false },
        },
      }),
    );
    const scriptQc = stepById(result, "script_qc");
    expect(scriptQc.status).toBe("needs_repair");
    expect(scriptQc.primaryAction).toBe("run_quality_review");
    expect(scriptQc.blockingReasons).toContain("VD_WIZARD_QUALITY_LOOP_ESCALATED");
    expect(stepById(result, "start_frames").status).toBe("locked");
  });

  it("escalated_regression → needs_repair, escalation reason present, CTA falls back to run_quality_review", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        scriptQc: {
          latestScorecard: passingScorecard({ overall: 2 }),
          policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
          loopStatus: "escalated_regression",
          tieIn: { enabled: false },
        },
      }),
    );
    const scriptQc = stepById(result, "script_qc");
    expect(scriptQc.status).toBe("needs_repair");
    expect(scriptQc.primaryAction).toBe("run_quality_review");
    expect(scriptQc.blockingReasons).toContain("VD_WIZARD_QUALITY_LOOP_ESCALATED");
  });
});

describe("tie-in naturalness (Test Plan: 'tie-in below naturalness floor (evaluated post-storyboard)')", () => {
  it("blocks script_qc + start_frames when tieInQc is on, tie-in is enabled, and the report fails", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        flags: {
          speechBudget: true,
          qualityLoopV2: true,
          tieInQc: true,
          productionWizard: true,
          arcReplan: true,
        },
        scriptQc: {
          latestScorecard: passingScorecard(),
          policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
          loopStatus: "passed",
          tieIn: { enabled: true, reportPassed: false },
        },
      }),
    );
    const scriptQc = stepById(result, "script_qc");
    expect(scriptQc.status).toBe("needs_repair");
    expect(scriptQc.blockingReasons).toEqual(["VD_WIZARD_TIE_IN_BELOW_FLOOR"]);
    expect(stepById(result, "start_frames").status).toBe("locked");
  });

  it("a MISSING tie-in report (never produced) also blocks, same as an explicit failure", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        flags: {
          speechBudget: true,
          qualityLoopV2: true,
          tieInQc: true,
          productionWizard: true,
          arcReplan: true,
        },
        scriptQc: {
          latestScorecard: passingScorecard(),
          policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
          loopStatus: "passed",
          tieIn: { enabled: true, reportPassed: undefined },
        },
      }),
    );
    expect(stepById(result, "script_qc").blockingReasons).toEqual(["VD_WIZARD_TIE_IN_BELOW_FLOOR"]);
  });

  it("is ignored entirely when the tieInQc flag is off, even with a failing report (Test Plan: 'ignored when tieInQc flag off')", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        scriptQc: {
          latestScorecard: passingScorecard(),
          policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
          loopStatus: "passed",
          tieIn: { enabled: true, reportPassed: false },
        },
      }),
    );
    const scriptQc = stepById(result, "script_qc");
    expect(scriptQc.status).toBe("passed");
    expect(scriptQc.blockingReasons).toEqual([]);
  });
});

describe("arc re-plan pending (Test Plan: 'arc re-plan proposal pending')", () => {
  it("surfaces as an advisory blocking reason + evidence on script_qc but never flips status away from passed", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ arcReplanPending: true }),
    );
    const scriptQc = stepById(result, "script_qc");
    expect(scriptQc.status).toBe("passed");
    expect(scriptQc.blockingReasons).toEqual(["VD_WIZARD_ARC_REPLAN_PENDING"]);
    expect(scriptQc.evidence.some(row => row.label === "Arc re-plan")).toBe(true);
    // Advisory only — does not lock the paid start-frame gate.
    expect(stepById(result, "start_frames").status).toBe("passed");
  });

  it("is ignored entirely when the arcReplan flag is off", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        arcReplanPending: true,
        flags: {
          speechBudget: true,
          qualityLoopV2: true,
          tieInQc: false,
          productionWizard: true,
          arcReplan: false,
        },
      }),
    );
    expect(stepById(result, "script_qc").blockingReasons).toEqual([]);
  });
});

describe("script_qc legacy v1 fallback (qualityLoopV2 off)", () => {
  it("is always passed regardless of scorecard/loop/tie-in state — spec §17 'behave exactly as today'", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        flags: {
          speechBudget: true,
          qualityLoopV2: false,
          tieInQc: false,
          productionWizard: true,
          arcReplan: true,
        },
        scriptQc: {
          latestScorecard: passingScorecard({ overall: 1 }),
          policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
          loopStatus: "escalated_max_rounds",
          tieIn: { enabled: true, reportPassed: false },
        },
        arcReplanPending: true,
      }),
    );
    expect(stepById(result, "script_qc").status).toBe("passed");
    expect(stepById(result, "start_frames").status).toBe("passed");
  });
});

describe("reason codes mapping onto script_qc (Test Plan: 'script quality / tie-in / arc-replan reason codes map to the script_qc step')", () => {
  it("all three reason families attach to script_qc simultaneously, with tie-in and arc-replan evidence rows included", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        flags: {
          speechBudget: true,
          qualityLoopV2: true,
          tieInQc: true,
          productionWizard: true,
          arcReplan: true,
        },
        scriptQc: {
          latestScorecard: passingScorecard({ overall: 2 }),
          policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
          loopStatus: "idle",
          tieIn: { enabled: true, reportPassed: false },
        },
        arcReplanPending: true,
      }),
    );
    const scriptQc = stepById(result, "script_qc");
    expect(scriptQc.blockingReasons).toEqual([
      "VD_WIZARD_SCRIPT_QUALITY_BELOW_FLOOR",
      "VD_WIZARD_TIE_IN_BELOW_FLOOR",
      "VD_WIZARD_ARC_REPLAN_PENDING",
    ]);
    expect(scriptQc.evidence.some(row => row.label === "Tie-in naturalness")).toBe(true);
    expect(scriptQc.evidence.some(row => row.label === "Arc re-plan")).toBe(true);

    // None of these three codes ever attach to any OTHER step.
    for (const step of result.steps) {
      if (step.stepId === "script_qc" || step.stepId === "start_frames") continue;
      expect(step.blockingReasons).not.toContain("VD_WIZARD_SCRIPT_QUALITY_BELOW_FLOOR");
      expect(step.blockingReasons).not.toContain("VD_WIZARD_TIE_IN_BELOW_FLOOR");
      expect(step.blockingReasons).not.toContain("VD_WIZARD_ARC_REPLAN_PENDING");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* start_frames / dialogue_audio / dialogue_qc                                */
/* -------------------------------------------------------------------------- */

describe("frames not approved (Test Plan: 'frames not approved')", () => {
  it("start_frames is ready with approve_start_frames, and everything downstream is locked", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ startFrames: { requiredShots: 9, approvedShots: 4 } }),
    );
    const startFrames = stepById(result, "start_frames");
    expect(startFrames.status).toBe("ready");
    expect(startFrames.primaryAction).toBe("approve_start_frames");
    expect(result.activeStepId).toBe("start_frames");
    expect(result.primaryCta).toBe("approve_start_frames");

    const dialogueAudio = stepById(result, "dialogue_audio");
    expect(dialogueAudio.status).toBe("locked");
    expect(dialogueAudio.blockingReasons).toEqual(["VD_WIZARD_START_FRAMES_NOT_APPROVED"]);

    const videoPrompts = stepById(result, "video_prompts");
    expect(videoPrompts.status).toBe("locked");
    expect(videoPrompts.blockingReasons).toContain("VD_WIZARD_START_FRAMES_NOT_APPROVED");
  });
});

describe("dialogue missing (Test Plan: 'dialogue missing')", () => {
  it("dialogue_audio is ready with generate_dialogue_plan; dialogue_qc and video_prompts lock", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ dialogueAudio: { exists: false }, episodeDialogueQuality: null }),
    );
    const dialogueAudio = stepById(result, "dialogue_audio");
    expect(dialogueAudio.status).toBe("ready");
    expect(dialogueAudio.primaryAction).toBe("generate_dialogue_plan");
    expect(result.activeStepId).toBe("dialogue_audio");

    const dialogueQc = stepById(result, "dialogue_qc");
    expect(dialogueQc.status).toBe("locked");
    expect(dialogueQc.blockingReasons).toEqual(["VD_WIZARD_DIALOGUE_PLAN_MISSING"]);

    const videoPrompts = stepById(result, "video_prompts");
    expect(videoPrompts.status).toBe("locked");
    expect(videoPrompts.blockingReasons).toContain("VD_WIZARD_DIALOGUE_PLAN_MISSING");
    // The plan is missing, not merely failing QC — the underfill code must
    // not ALSO appear (dialogue_qc itself is "locked", not "blocked").
    expect(videoPrompts.blockingReasons).not.toContain("VD_WIZARD_DIALOGUE_UNDERFILLED");
  });
});

describe("dialogue underfilled (Test Plan: 'dialogue underfilled')", () => {
  it("dialogue_qc is blocked with repair_dialogue and locks video_prompts (Test Plan: dialogue QC reason codes map to the dialogue wizard step)", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        episodeDialogueQuality: passingDialogueQuality({
          totalSpeechSeconds: 15,
          coverageRatio: 0.25,
          issues: [
            dialogueIssue({
              code: "VD_DIALOGUE_EPISODE_UNDERFILLED",
              severity: "error",
              message: "too little spoken content",
            }),
          ],
        }),
      }),
    );
    const dialogueQc = stepById(result, "dialogue_qc");
    expect(dialogueQc.status).toBe("blocked");
    expect(dialogueQc.primaryAction).toBe("repair_dialogue");
    expect(dialogueQc.blockingReasons).toEqual(["VD_WIZARD_DIALOGUE_UNDERFILLED"]);

    expect(result.activeStepId).toBe("dialogue_qc");
    expect(result.primaryCta).toBe("repair_dialogue");

    const videoPrompts = stepById(result, "video_prompts");
    expect(videoPrompts.status).toBe("locked");
    expect(videoPrompts.blockingReasons).toEqual(["VD_WIZARD_DIALOGUE_UNDERFILLED"]);

    // This reason never leaks onto script_qc / episode_script.
    expect(stepById(result, "script_qc").blockingReasons).toEqual([]);
    expect(stepById(result, "episode_script").blockingReasons).toEqual([]);
  });

  it("warning-only dialogue issues do not block dialogue_qc", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        episodeDialogueQuality: passingDialogueQuality({
          issues: [dialogueIssue({ code: "VD_DIALOGUE_SCRIPT_FALLBACK", severity: "warning" })],
        }),
      }),
    );
    const dialogueQc = stepById(result, "dialogue_qc");
    expect(dialogueQc.status).toBe("passed");
    expect(dialogueQc.evidence.some(row => row.severity === "warning")).toBe(true);
  });
});

describe("dialogue_qc passed_with_warnings (2026-07-08 acceptance-review fix #3, MEDIUM)", () => {
  it("warning-band coverage (only warning-severity issues, zero errors): step reads passed_with_warnings, never a plain 'passed'", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        episodeDialogueQuality: passingDialogueQuality({
          issues: [dialogueIssue({ code: "VD_DIALOGUE_SCRIPT_FALLBACK", severity: "warning" })],
        }),
      }),
    );
    const dialogueQc = stepById(result, "dialogue_qc");
    expect(dialogueQc.status).toBe("passed");
    expect(dialogueQc.passState).toBe("passed_with_warnings");
    expect(dialogueQc.criteria).toEqual([
      { id: "dialogue_no_blocking_issues", passed: true, detail: undefined },
      { id: "dialogue_no_warning_issues", passed: false, detail: "1" },
    ]);
  });

  it("zero issues at all: step reads the CLEAN 'passed' (matches golden path, no false warning)", () => {
    const result = deriveVerticalDramaProductionWizardState(baseInput());
    const dialogueQc = stepById(result, "dialogue_qc");
    expect(dialogueQc.status).toBe("passed");
    expect(dialogueQc.passState).toBe("passed");
    expect(dialogueQc.criteria).toEqual([
      { id: "dialogue_no_blocking_issues", passed: true, detail: undefined },
      { id: "dialogue_no_warning_issues", passed: true, detail: undefined },
    ]);
  });

  it("error-severity issues present (blocked): status/passState stay exactly as before this fix — 'blocked'/'failed', unaffected by any warnings mixed in", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        episodeDialogueQuality: passingDialogueQuality({
          issues: [
            dialogueIssue({ code: "VD_DIALOGUE_EPISODE_UNDERFILLED", severity: "error" }),
            dialogueIssue({ code: "VD_DIALOGUE_SCRIPT_FALLBACK", severity: "warning" }),
          ],
        }),
      }),
    );
    const dialogueQc = stepById(result, "dialogue_qc");
    expect(dialogueQc.status).toBe("blocked");
    expect(dialogueQc.passState).toBe("failed");
    expect(dialogueQc.primaryAction).toBe("repair_dialogue");
    expect(dialogueQc.criteria.find(c => c.id === "dialogue_no_warning_issues")).toEqual({
      id: "dialogue_no_warning_issues",
      passed: false,
      detail: "1",
    });
  });
});

/* -------------------------------------------------------------------------- */
/* video_prompts / shot_repair / video_clips / final_episode                  */
/* -------------------------------------------------------------------------- */

describe("video prompts stale (Test Plan: 'video prompts stale')", () => {
  it("video_prompts shows needs_repair; video_clips locks with VD_WIZARD_VIDEO_PROMPTS_STALE", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ videoPrompts: { exists: true, stale: true } }),
    );
    const videoPrompts = stepById(result, "video_prompts");
    expect(videoPrompts.status).toBe("needs_repair");
    expect(videoPrompts.primaryAction).toBe("generate_video_prompts");

    const videoClips = stepById(result, "video_clips");
    expect(videoClips.status).toBe("locked");
    expect(videoClips.blockingReasons).toEqual(["VD_WIZARD_VIDEO_PROMPTS_STALE"]);

    expect(result.activeStepId).toBe("video_prompts");
    expect(result.primaryCta).toBe("generate_video_prompts");
  });

  it("a never-generated prompt pack locks video_clips with the same code (Test Plan: stale propagation produces the expected downstream locks)", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ videoPrompts: { exists: false, stale: false } }),
    );
    expect(stepById(result, "video_prompts").status).toBe("ready");
    const videoClips = stepById(result, "video_clips");
    expect(videoClips.status).toBe("locked");
    expect(videoClips.blockingReasons).toEqual(["VD_WIZARD_VIDEO_PROMPTS_STALE"]);
  });
});

describe("clips incomplete (Test Plan: 'clips incomplete')", () => {
  it("video_clips is ready with generate_video_clips; final_episode locks with VD_WIZARD_VIDEO_CLIPS_INCOMPLETE", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ clips: { required: 8, completed: 3 } }),
    );
    const videoClips = stepById(result, "video_clips");
    expect(videoClips.status).toBe("ready");
    expect(videoClips.primaryAction).toBe("generate_video_clips");

    const finalEpisode = stepById(result, "final_episode");
    expect(finalEpisode.status).toBe("locked");
    expect(finalEpisode.blockingReasons).toEqual(["VD_WIZARD_VIDEO_CLIPS_INCOMPLETE"]);

    expect(result.activeStepId).toBe("video_clips");
    expect(result.primaryCta).toBe("generate_video_clips");
  });
});

describe("assembly ready (Test Plan: 'assembly ready')", () => {
  it("final_episode is ready with assemble_episode once clips are complete but assembly has not run yet", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ assembly: { completed: false, durationsAligned: true, audioSubtitleResolved: true } }),
    );
    const finalEpisode = stepById(result, "final_episode");
    expect(finalEpisode.status).toBe("ready");
    expect(finalEpisode.primaryAction).toBe("assemble_episode");
    expect(result.activeStepId).toBe("final_episode");
    expect(result.primaryCta).toBe("assemble_episode");
  });

  it("misaligned clip durations block assembly even though every clip is complete", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ assembly: { completed: false, durationsAligned: false, audioSubtitleResolved: true } }),
    );
    const finalEpisode = stepById(result, "final_episode");
    expect(finalEpisode.status).toBe("locked");
    expect(finalEpisode.blockingReasons).toEqual(["VD_WIZARD_ASSEMBLY_BLOCKED"]);
  });
});

describe("shot_repair — always secondary (spec §8.8/section-12)", () => {
  it("is optional (not needs_repair) when there are no failing targets", () => {
    const result = deriveVerticalDramaProductionWizardState(baseInput());
    expect(stepById(result, "shot_repair").status).toBe("optional");
  });

  it("shows needs_repair with repair_shots when failing targets exist, but NEVER becomes the primary CTA", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ shotRepair: { failingTargetCount: 2 } }),
    );
    const shotRepair = stepById(result, "shot_repair");
    expect(shotRepair.status).toBe("needs_repair");
    expect(shotRepair.primaryAction).toBe("repair_shots");
    expect(shotRepair.repairable).toBe(true);

    // The golden path is otherwise fully passed, so the active step must
    // skip straight past shot_repair to final_episode, not stop on it.
    expect(result.activeStepId).toBe("final_episode");
    expect(result.primaryCta).not.toBe("repair_shots");
  });
});

/* -------------------------------------------------------------------------- */
/* Criteria transparency (2026-07-08 wave) — structured pass/fail checklist, */
/* passState, outOfScopeNotes, and evidenceId leak fixes                      */
/* -------------------------------------------------------------------------- */

describe("episode_script criteria — passed_with_warnings (owner screenshot numbers)", () => {
  it("underfilled_warning with real coverage numbers (36.8/35-44): passes overall, but the recommended-band criterion reads false and passState is passed_with_warnings", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        script: {
          exists: true,
          coverageStatus: "underfilled_warning",
          coverageDetail: {
            estimatedSpeechSeconds: 36.8,
            targetSpeechSecondsMin: 35,
            targetSpeechSecondsMax: 44,
          },
        },
      }),
    );
    const step = stepById(result, "episode_script");
    expect(step.status).toBe("passed");
    expect(step.passState).toBe("passed_with_warnings");
    expect(step.criteria).toEqual([
      { id: "script_exists", passed: true },
      { id: "coverage_at_least_minimum", passed: true, detail: "36.8" },
      { id: "coverage_in_recommended_band", passed: false, detail: "36.8/35-44" },
      // 2026-07-08 acceptance-review fix #1 — `null` (not evaluable) because
      // this fixture never supplies `structureComplete`.
      { id: "story_structure_complete", passed: null },
      // 2026-07-08/W9-A content-completeness criteria — `null` (not
      // evaluable) because this fixture never supplies `perShotCompleteness`.
      { id: "dialogue_every_shot", passed: null, detail: undefined },
      { id: "no_shot_over_length", passed: null, detail: undefined },
      { id: "no_long_silence", passed: null, detail: undefined },
      { id: "all_lines_speakable", passed: null, detail: undefined },
    ]);
    expect(step.outOfScopeNotes).toEqual([
      { id: "dialogue_later_step", laterStepId: "dialogue_audio" },
    ]);
  });

  it("in_range with real numbers: every criterion true, passState is the CLEAN 'passed' (no warnings)", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        script: {
          exists: true,
          coverageStatus: "in_range",
          coverageDetail: { estimatedSpeechSeconds: 40, targetSpeechSecondsMin: 35, targetSpeechSecondsMax: 44 },
          // 2026-07-08/W9-A — a fully-passing per-shot summary so the 4
          // completeness criteria also read true, matching this test's own
          // "every criterion true" intent.
          perShotCompleteness: passingPerShotCompleteness(9),
          // 2026-07-08 acceptance-review fix #1 — likewise true, so
          // story_structure_complete doesn't spoil the "every criterion
          // true" intent either.
          structureComplete: true,
        },
      }),
    );
    const step = stepById(result, "episode_script");
    expect(step.passState).toBe("passed");
    expect(step.criteria.every(c => c.passed === true)).toBe(true);
  });

  it("underfilled_error: both coverage criteria read false and passState is failed (status needs_repair)", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ script: { exists: true, coverageStatus: "underfilled_error" } }),
    );
    const step = stepById(result, "episode_script");
    expect(step.status).toBe("needs_repair");
    expect(step.passState).toBe("failed");
    expect(step.criteria).toEqual([
      { id: "script_exists", passed: true },
      { id: "coverage_at_least_minimum", passed: false, detail: undefined },
      { id: "coverage_in_recommended_band", passed: false, detail: undefined },
      { id: "story_structure_complete", passed: null },
      { id: "dialogue_every_shot", passed: null, detail: undefined },
      { id: "no_shot_over_length", passed: null, detail: undefined },
      { id: "no_long_silence", passed: null, detail: undefined },
      { id: "all_lines_speakable", passed: null, detail: undefined },
    ]);
  });

  it("no_dialogue_data: both coverage criteria read null (not evaluable, not a false claim) and passState is passed_with_warnings", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ script: { exists: true, coverageStatus: "no_dialogue_data" } }),
    );
    const step = stepById(result, "episode_script");
    expect(step.status).toBe("passed");
    expect(step.passState).toBe("passed_with_warnings");
    expect(step.criteria[1].passed).toBeNull();
    expect(step.criteria[2].passed).toBeNull();
  });

  it("script missing: single script_exists criterion reads false, passState not_applicable (nothing has run yet)", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ script: { exists: false, coverageStatus: "in_range" } }),
    );
    const step = stepById(result, "episode_script");
    expect(step.criteria).toEqual([{ id: "script_exists", passed: false }]);
    expect(step.passState).toBe("not_applicable");
    expect(step.outOfScopeNotes).toEqual([]);
  });

  it("locked (series setup incomplete): no criteria evaluated yet", () => {
    const result = deriveVerticalDramaProductionWizardState(baseInput({ seriesSetup: { complete: false } }));
    const step = stepById(result, "episode_script");
    expect(step.criteria).toEqual([]);
    expect(step.passState).toBe("not_applicable");
  });
});

describe("storyboard_shots criteria — shots_9 / beats_mapped + out-of-scope notes (owner confusion #3)", () => {
  it("9 shots + beats mapped + image/video prompts all present: every criterion true, passState passed, notes point to video_prompts and dialogue_audio", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        storyboard: {
          exists: true,
          shotCount: 9,
          beatsMapped: true,
          imagePromptsAllShots: true,
          videoPromptsAllShots: true,
        },
      }),
    );
    const step = stepById(result, "storyboard_shots");
    expect(step.passState).toBe("passed");
    expect(step.criteria).toEqual([
      { id: "shots_9", passed: true, detail: "9" },
      { id: "beats_mapped", passed: true },
      { id: "image_prompts_all_shots", passed: true },
      { id: "video_prompts_all_shots", passed: true },
    ]);
    expect(step.outOfScopeNotes).toEqual([
      { id: "prompts_later_step", laterStepId: "video_prompts" },
      { id: "dialogue_later_step", laterStepId: "dialogue_audio" },
    ]);
  });

  it("a legacy/malformed storyboard with a different shot count fails shots_9 without changing status (passed_with_warnings)", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ storyboard: { exists: true, shotCount: 7, beatsMapped: true } }),
    );
    const step = stepById(result, "storyboard_shots");
    expect(step.status).toBe("passed");
    expect(step.passState).toBe("passed_with_warnings");
    expect(step.criteria[0]).toEqual({ id: "shots_9", passed: false, detail: "7" });
  });

  it("caller has not supplied shotCount/beatsMapped/prompt-completeness yet: all read null (unknown), never a false claim", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ storyboard: { exists: true } }),
    );
    const step = stepById(result, "storyboard_shots");
    expect(step.criteria).toEqual([
      { id: "shots_9", passed: null, detail: undefined },
      { id: "beats_mapped", passed: null },
      { id: "image_prompts_all_shots", passed: null },
      { id: "video_prompts_all_shots", passed: null },
    ]);
  });

  it("storyboard does not exist yet: all 4 criteria read false (a definite '0 shots' fact), no out-of-scope notes yet", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ storyboard: { exists: false } }),
    );
    const step = stepById(result, "storyboard_shots");
    expect(step.criteria).toEqual([
      { id: "shots_9", passed: false, detail: undefined },
      { id: "beats_mapped", passed: false },
      { id: "image_prompts_all_shots", passed: false },
      { id: "video_prompts_all_shots", passed: false },
    ]);
    expect(step.outOfScopeNotes).toEqual([]);
  });

  describe("2026-07-08/W9-A content-completeness — image/video prompts", () => {
    it("storyboard exists but video prompts are not generated yet: passState is 'incomplete' (never a clean pass, never 'failed'), status/locks unaffected", () => {
      const result = deriveVerticalDramaProductionWizardState(
        baseInput({
          storyboard: {
            exists: true,
            shotCount: 9,
            beatsMapped: true,
            imagePromptsAllShots: true,
            videoPromptsAllShots: false,
          },
        }),
      );
      const step = stepById(result, "storyboard_shots");
      expect(step.status).toBe("passed");
      expect(step.passState).toBe("incomplete");
      expect(step.criteria.find(c => c.id === "video_prompts_all_shots")).toEqual({
        id: "video_prompts_all_shots",
        passed: false,
      });
      // Downstream gates key ONLY on `status`, never `passState` — confirms
      // the "CTA ordering/locks unchanged" constraint (section-12).
      expect(stepById(result, "script_qc").status).toBe("passed");
    });

    it("image prompts missing (but video prompts present): also 'incomplete', not 'failed'", () => {
      const result = deriveVerticalDramaProductionWizardState(
        baseInput({
          storyboard: {
            exists: true,
            shotCount: 9,
            beatsMapped: true,
            imagePromptsAllShots: false,
            videoPromptsAllShots: true,
          },
        }),
      );
      expect(stepById(result, "storyboard_shots").passState).toBe("incomplete");
    });

    it("a freshly-generated storyboard (video prompts not run yet) never re-locks the already-passed downstream pipeline", () => {
      const result = deriveVerticalDramaProductionWizardState(
        baseInput({
          storyboard: {
            exists: true,
            shotCount: 9,
            beatsMapped: true,
            imagePromptsAllShots: true,
            videoPromptsAllShots: false,
          },
        }),
      );
      // Every step downstream of storyboard_shots is untouched by the
      // "incomplete" passState — status/locks stay exactly what they'd be
      // without this wave.
      for (const stepId of ["script_qc", "start_frames", "dialogue_audio", "dialogue_qc"] as const) {
        expect(stepById(result, stepId).status).toBe("passed");
      }
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Content completeness — episode_script per-shot criteria (2026-07-08/W9-A, */
/* spec §14.1 rule 6b, section-12 "Pass Semantics")                          */
/* -------------------------------------------------------------------------- */

describe("episode_script content-completeness criteria (2026-07-08/W9-A)", () => {
  it("one shot with no resolved line: dialogue_every_shot reads false, passState 'failed' — but status/downstream locks are UNCHANGED (section-12 'CTA ordering/locks unchanged')", () => {
    const perShot = passingPerShotCompleteness(9);
    perShot[4] = { ...perShot[4], hasResolvedLine: false };
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ script: { exists: true, coverageStatus: "in_range", perShotCompleteness: perShot } }),
    );
    const step = stepById(result, "episode_script");
    expect(step.status).toBe("passed");
    expect(step.passState).toBe("failed");
    expect(step.criteria.find(c => c.id === "dialogue_every_shot")).toEqual({
      id: "dialogue_every_shot",
      passed: false,
      detail: "8/9",
    });
    // The gate this step feeds (Gate 0) keys ONLY on `status`, so
    // storyboard_shots stays exactly as it would without this wave.
    expect(stepById(result, "storyboard_shots").status).toBe("passed");
  });

  it("one shot over length: no_shot_over_length reads false, passState 'failed'", () => {
    const perShot = passingPerShotCompleteness(9);
    perShot[0] = { ...perShot[0], overLength: true };
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ script: { exists: true, coverageStatus: "in_range", perShotCompleteness: perShot } }),
    );
    const step = stepById(result, "episode_script");
    expect(step.passState).toBe("failed");
    expect(step.criteria.find(c => c.id === "no_shot_over_length")).toEqual({
      id: "no_shot_over_length",
      passed: false,
      detail: "8/9",
    });
  });

  it("one shot with a long silent gap: no_long_silence reads false, passState 'failed'", () => {
    const perShot = passingPerShotCompleteness(9);
    perShot[8] = { ...perShot[8], silent: true };
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ script: { exists: true, coverageStatus: "in_range", perShotCompleteness: perShot } }),
    );
    const step = stepById(result, "episode_script");
    expect(step.passState).toBe("failed");
    expect(step.criteria.find(c => c.id === "no_long_silence")).toEqual({
      id: "no_long_silence",
      passed: false,
      detail: "8/9",
    });
  });

  it("one shot with an unspeakable line: all_lines_speakable reads false, passState 'failed'", () => {
    const perShot = passingPerShotCompleteness(9);
    perShot[2] = { ...perShot[2], allLinesSpeakable: false };
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ script: { exists: true, coverageStatus: "in_range", perShotCompleteness: perShot } }),
    );
    const step = stepById(result, "episode_script");
    expect(step.passState).toBe("failed");
    expect(step.criteria.find(c => c.id === "all_lines_speakable")).toEqual({
      id: "all_lines_speakable",
      passed: false,
      detail: "8/9",
    });
  });

  it("a completeness failure takes precedence over a mere coverage-band warning ('failed' beats 'passed_with_warnings')", () => {
    const perShot = passingPerShotCompleteness(9);
    perShot[0] = { ...perShot[0], allLinesSpeakable: false };
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        script: {
          exists: true,
          coverageStatus: "underfilled_warning",
          perShotCompleteness: perShot,
        },
      }),
    );
    expect(stepById(result, "episode_script").passState).toBe("failed");
  });

  it("all criteria false but zero shots resolved anything: dialogue_every_shot detail is '0/9'", () => {
    const perShot = passingPerShotCompleteness(9).map(s => ({ ...s, hasResolvedLine: false }));
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ script: { exists: true, coverageStatus: "in_range", perShotCompleteness: perShot } }),
    );
    const step = stepById(result, "episode_script");
    expect(step.criteria.find(c => c.id === "dialogue_every_shot")?.detail).toBe("0/9");
  });
});

describe("episode_script story_structure_complete (2026-07-08 acceptance-review fix #1, HIGH false-positive)", () => {
  it("structureComplete: false (script missing its hook/cliffhanger/beats) flips passState to 'failed' WITHOUT changing status — still 'passed' and repairable via the existing script repair CTA", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        script: {
          exists: true,
          coverageStatus: "in_range",
          perShotCompleteness: passingPerShotCompleteness(9),
          structureComplete: false,
        },
      }),
    );
    const step = stepById(result, "episode_script");
    expect(step.status).toBe("passed");
    expect(step.passState).toBe("failed");
    expect(step.repairable).toBe(true);
    expect(step.primaryAction).toBe("none");
    expect(step.blockingReasons).toEqual([]);
    expect(step.criteria.find(c => c.id === "story_structure_complete")).toEqual({
      id: "story_structure_complete",
      passed: false,
    });
    // Section-12 "CTA ordering/locks unchanged" — never re-locks the
    // downstream pipeline (same rule every other completeness criterion in
    // this step already follows).
    expect(stepById(result, "storyboard_shots").status).toBe("passed");
  });

  it("structureComplete: true is evaluable EVEN when the storyboard-dependent per-shot criteria are still null (not flag/storyboard-dependent)", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        script: { exists: true, coverageStatus: "in_range", structureComplete: true },
      }),
    );
    const step = stepById(result, "episode_script");
    expect(step.criteria.find(c => c.id === "story_structure_complete")).toEqual({
      id: "story_structure_complete",
      passed: true,
    });
    // perShotCompleteness was never supplied by this fixture — those 4
    // criteria stay null, but that alone still yields passed_with_warnings,
    // never "failed" (only a DEFINITE false flips to failed).
    expect(step.passState).toBe("passed_with_warnings");
  });

  it("undefined (caller not yet updated, e.g. an older hand-built fixture) reads null — never a false claim of failure", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ script: { exists: true, coverageStatus: "in_range" } }),
    );
    const step = stepById(result, "episode_script");
    expect(step.criteria.find(c => c.id === "story_structure_complete")).toEqual({
      id: "story_structure_complete",
      passed: null,
    });
  });
});

describe("script_qc content-completeness criterion — no_unresolved_recommended_repairs (2026-07-08/W9-A)", () => {
  it("unresolved repairs present on the latest review: criterion false, passState 'failed', status/start_frames unaffected", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        scriptQc: {
          latestScorecard: passingScorecard(),
          policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
          loopStatus: "passed",
          tieIn: { enabled: false },
          hasUnresolvedRecommendedRepairs: true,
        },
      }),
    );
    const step = stepById(result, "script_qc");
    expect(step.status).toBe("passed");
    expect(step.passState).toBe("failed");
    expect(step.criteria.find(c => c.id === "no_unresolved_recommended_repairs")).toEqual({
      id: "no_unresolved_recommended_repairs",
      passed: false,
    });
    // Section-12 "CTA ordering/locks unchanged" — Gate 0b keys only on
    // `status`, so start_frames stays passed even though the checklist is
    // no longer a clean pass.
    expect(stepById(result, "start_frames").status).toBe("passed");
  });

  it("no unresolved repairs: criterion true, no change to the clean passed state", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        scriptQc: {
          latestScorecard: passingScorecard(),
          policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
          loopStatus: "passed",
          tieIn: { enabled: false },
          hasUnresolvedRecommendedRepairs: false,
        },
      }),
    );
    const step = stepById(result, "script_qc");
    expect(step.passState).toBe("passed");
  });

  it("qualityLoopV2 off (v1 fallback): no_unresolved_recommended_repairs never appears — v1 stays criteria-free", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        flags: { speechBudget: true, qualityLoopV2: false, tieInQc: false, productionWizard: true, arcReplan: true },
        scriptQc: {
          latestScorecard: passingScorecard(),
          policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
          loopStatus: "passed",
          tieIn: { enabled: false },
          hasUnresolvedRecommendedRepairs: true,
        },
      }),
    );
    expect(stepById(result, "script_qc").criteria).toEqual([]);
  });
});

describe("script_qc criteria — scorecard floor fail + loop_state (Test Plan: exact 3-vs-4 floor example)", () => {
  it("scorecard 3/4 below the default floor: scorecard_meets_floor reads false with detail '3/4', passState failed", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        scriptQc: {
          latestScorecard: passingScorecard({ overall: 3 }),
          policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS, // minOverall: 4
          loopStatus: "idle",
          tieIn: { enabled: false },
        },
      }),
    );
    const step = stepById(result, "script_qc");
    expect(step.status).toBe("needs_repair");
    expect(step.passState).toBe("failed");
    expect(step.criteria).toEqual([
      { id: "scorecard_meets_floor", passed: false, detail: "3/4" },
      { id: "loop_state", passed: true },
      // 2026-07-08/W9-A — `null` (not evaluable) because this fixture omits
      // `hasUnresolvedRecommendedRepairs`.
      { id: "no_unresolved_recommended_repairs", passed: null },
    ]);
  });

  it("loop escalated: loop_state reads false even when the scorecard itself would pass", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        scriptQc: {
          latestScorecard: passingScorecard({ overall: 4 }),
          policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
          loopStatus: "escalated_max_rounds",
          tieIn: { enabled: false },
        },
      }),
    );
    const step = stepById(result, "script_qc");
    const loopCriterion = step.criteria.find(c => c.id === "loop_state");
    expect(loopCriterion?.passed).toBe(false);
  });

  it("never reviewed: scorecard_meets_floor reads null (not yet evaluable), passState not_applicable", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        scriptQc: {
          latestScorecard: null,
          policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
          loopStatus: "not_run",
          tieIn: { enabled: false },
        },
      }),
    );
    const step = stepById(result, "script_qc");
    expect(step.status).toBe("ready");
    expect(step.passState).toBe("not_applicable");
    const scorecardCriterion = step.criteria.find(c => c.id === "scorecard_meets_floor");
    expect(scorecardCriterion?.passed).toBeNull();
    // "not_run" is not itself a failure — loop_state still reads true.
    const loopCriterion = step.criteria.find(c => c.id === "loop_state");
    expect(loopCriterion?.passed).toBe(true);
  });

  it("tie-in enabled: adds a tie_in_naturalness_floor criterion (true/false/null for passed/failed/missing report)", () => {
    const flags = {
      speechBudget: true,
      qualityLoopV2: true,
      tieInQc: true,
      productionWizard: true,
      arcReplan: true,
    } as const;
    const passedReport = deriveVerticalDramaProductionWizardState(
      baseInput({ flags, scriptQc: { latestScorecard: passingScorecard(), policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS, loopStatus: "passed", tieIn: { enabled: true, reportPassed: true } } }),
    );
    expect(stepById(passedReport, "script_qc").criteria.find(c => c.id === "tie_in_naturalness_floor")?.passed).toBe(true);

    const failedReport = deriveVerticalDramaProductionWizardState(
      baseInput({ flags, scriptQc: { latestScorecard: passingScorecard(), policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS, loopStatus: "passed", tieIn: { enabled: true, reportPassed: false } } }),
    );
    expect(stepById(failedReport, "script_qc").criteria.find(c => c.id === "tie_in_naturalness_floor")?.passed).toBe(false);

    const missingReport = deriveVerticalDramaProductionWizardState(
      baseInput({ flags, scriptQc: { latestScorecard: passingScorecard(), policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS, loopStatus: "passed", tieIn: { enabled: true, reportPassed: undefined } } }),
    );
    expect(stepById(missingReport, "script_qc").criteria.find(c => c.id === "tie_in_naturalness_floor")?.passed).toBeNull();
  });

  it("qualityLoopV2 off (v1 fallback): no criteria at all — purely advisory, nothing to check off", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        flags: { speechBudget: true, qualityLoopV2: false, tieInQc: false, productionWizard: true, arcReplan: true },
      }),
    );
    expect(stepById(result, "script_qc").criteria).toEqual([]);
  });
});

describe("evidenceId leak-fix coverage — structured payloads replace raw enum passthroughs", () => {
  it("script_qc scorecard row carries scorecardOverall with overall:null when never reviewed", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        scriptQc: {
          latestScorecard: null,
          policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
          loopStatus: "not_run",
          tieIn: { enabled: false },
        },
      }),
    );
    const row = stepById(result, "script_qc").evidence.find(r => r.label === "Scorecard overall");
    expect(row?.scorecardOverall).toEqual({ overall: null, minOverall: 4 });
  });

  it("script_qc scorecard row carries scorecardOverall with the real numbers when reviewed", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        scriptQc: {
          latestScorecard: passingScorecard({ overall: 3 }),
          policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
          loopStatus: "idle",
          tieIn: { enabled: false },
        },
      }),
    );
    const row = stepById(result, "script_qc").evidence.find(r => r.label === "Scorecard overall");
    expect(row?.scorecardOverall).toEqual({ overall: 3, minOverall: 4 });
  });

  it("script_qc loop row carries the bare loopState enum verbatim, including 'not_run'", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({
        scriptQc: {
          latestScorecard: passingScorecard(),
          policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
          loopStatus: "not_run",
          tieIn: { enabled: false },
        },
      }),
    );
    const row = stepById(result, "script_qc").evidence.find(r => r.label === "Auto-improve loop");
    expect(row?.loopState).toBe("not_run");
  });

  it("dialogue_qc episode-coverage row carries a numeric-only detail string", () => {
    const result = deriveVerticalDramaProductionWizardState(baseInput());
    const row = stepById(result, "dialogue_qc").evidence.find(r => r.label === "Episode speech coverage");
    expect(row?.evidenceId).toBe("dialogue_qc_episode_coverage");
    expect(row?.detail).toMatch(/^\d+(\.\d+)?\/\d+(\.\d+)?$/);
  });

  it("start_frames approved-count row carries a numeric-only detail string", () => {
    const result = deriveVerticalDramaProductionWizardState(
      baseInput({ startFrames: { requiredShots: 9, approvedShots: 4 } }),
    );
    const row = stepById(result, "start_frames").evidence[0];
    expect(row.evidenceId).toBe("start_frames_approved_count");
    expect(row.detail).toBe("4/9");
  });
});

describe("invariant: every criteria id and evidenceId across every fixture is a member of the fixed vocabulary", () => {
  it("holds for a broad sweep of fixtures, and every detail string carries only digits/punctuation (no leaked English words)", () => {
    const fixtures: DeriveVerticalDramaProductionWizardStateInput[] = [
      baseInput(),
      baseInput({ seriesSetup: { complete: false } }),
      baseInput({ script: { exists: false, coverageStatus: "in_range" } }),
      baseInput({ script: { exists: true, coverageStatus: "underfilled_error" } }),
      baseInput({
        script: {
          exists: true,
          coverageStatus: "underfilled_warning",
          coverageDetail: { estimatedSpeechSeconds: 36.8, targetSpeechSecondsMin: 35, targetSpeechSecondsMax: 44 },
        },
      }),
      baseInput({ script: { exists: true, coverageStatus: "no_dialogue_data" } }),
      baseInput({ storyboard: { exists: false } }),
      baseInput({ storyboard: { exists: true, shotCount: 7, beatsMapped: false } }),
      baseInput({
        scriptQc: {
          latestScorecard: passingScorecard({ overall: 2 }),
          policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
          loopStatus: "escalated_regression",
          tieIn: { enabled: true, reportPassed: false },
        },
        flags: { speechBudget: true, qualityLoopV2: true, tieInQc: true, productionWizard: true, arcReplan: true },
      }),
      baseInput({ startFrames: { requiredShots: 9, approvedShots: 0 } }),
      baseInput({ dialogueAudio: { exists: false }, episodeDialogueQuality: null }),
      baseInput({
        episodeDialogueQuality: passingDialogueQuality({
          issues: [dialogueIssue({ code: "VD_DIALOGUE_EPISODE_UNDERFILLED", severity: "error" })],
        }),
      }),
      baseInput({ videoPrompts: { exists: true, stale: true } }),
      baseInput({ videoPrompts: { exists: false, stale: false } }),
      baseInput({ clips: { required: 8, completed: 0 } }),
      baseInput({ assembly: { completed: false, durationsAligned: true, audioSubtitleResolved: true } }),
      baseInput({ assembly: { completed: false, durationsAligned: false, audioSubtitleResolved: false } }),
      baseInput({ shotRepair: { failingTargetCount: 3 } }),
      // 2026-07-08/W9-A content-completeness fixtures.
      baseInput({
        script: {
          exists: true,
          coverageStatus: "in_range",
          perShotCompleteness: (() => {
            const shots = passingPerShotCompleteness(9);
            shots[3] = { ...shots[3], hasResolvedLine: false, allLinesSpeakable: false };
            return shots;
          })(),
        },
      }),
      baseInput({
        storyboard: {
          exists: true,
          shotCount: 9,
          beatsMapped: true,
          imagePromptsAllShots: true,
          videoPromptsAllShots: false,
        },
      }),
      baseInput({
        scriptQc: {
          latestScorecard: passingScorecard(),
          policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
          loopStatus: "passed",
          tieIn: { enabled: false },
          hasUnresolvedRecommendedRepairs: true,
        },
      }),
    ];

    // Pre-formatted "numbers only" — digits, optional decimal point, and
    // the "/"/"-" separators this file's own templates use. No letters.
    const NUMERIC_DETAIL_PATTERN = /^[\d.\-/]+$/;

    for (const fixture of fixtures) {
      const result = deriveVerticalDramaProductionWizardState(fixture);
      for (const step of result.steps) {
        for (const criterion of step.criteria ?? []) {
          expect(VERTICAL_DRAMA_WIZARD_CRITERION_IDS).toContain(criterion.id);
          if (criterion.detail !== undefined) {
            expect(criterion.detail).toMatch(NUMERIC_DETAIL_PATTERN);
          }
        }
        for (const note of step.outOfScopeNotes ?? []) {
          expect(VERTICAL_DRAMA_WIZARD_OUT_OF_SCOPE_NOTE_IDS).toContain(note.id);
          expect(VERTICAL_DRAMA_PRODUCTION_WIZARD_STEP_IDS).toContain(note.laterStepId);
        }
        for (const row of step.evidence) {
          if (row.evidenceId !== undefined) {
            expect(VERTICAL_DRAMA_WIZARD_EVIDENCE_IDS).toContain(row.evidenceId);
          }
          if (row.detail !== undefined) {
            expect(row.detail).toMatch(NUMERIC_DETAIL_PATTERN);
          }
        }
        expect(VERTICAL_DRAMA_PRODUCTION_WIZARD_PASS_STATES).toContain(step.passState);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Grandfathering (spec §17)                                                  */
/* -------------------------------------------------------------------------- */

describe("grandfathering (Test Plan: 'flags enabled mid-episode → previously completed stages stay valid')", () => {
  it("an exempt script_qc is forced to passed and never receives a new blocking reason, unlocking start_frames", () => {
    const failing = baseInput({
      scriptQc: {
        latestScorecard: passingScorecard({ overall: 1 }),
        policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
        loopStatus: "escalated_max_rounds",
        tieIn: { enabled: true, reportPassed: false },
      },
      flags: {
        speechBudget: true,
        qualityLoopV2: true,
        tieInQc: true,
        productionWizard: true,
        arcReplan: true,
      },
    });

    // Sanity: without the exemption, this fixture DOES lock start_frames.
    const withoutExemption = deriveVerticalDramaProductionWizardState(failing);
    expect(stepById(withoutExemption, "script_qc").status).toBe("needs_repair");
    expect(stepById(withoutExemption, "start_frames").status).toBe("locked");

    const withExemption = deriveVerticalDramaProductionWizardState({
      ...failing,
      gateExemptStepIds: ["script_qc"],
    });
    const scriptQc = stepById(withExemption, "script_qc");
    expect(scriptQc.status).toBe("passed");
    expect(scriptQc.blockingReasons).toEqual([]);
    expect(stepById(withExemption, "start_frames").status).toBe("passed");
  });
});

/* -------------------------------------------------------------------------- */
/* Feature flag productionWizard off — resolver stays pure-computable         */
/* -------------------------------------------------------------------------- */

describe("flag productionWizard off (Test Plan: 'with verticalDramaSeriesProductionWizard off, no wizard state is derived')", () => {
  it("still computes a full, deterministic state — gating whether to RENDER it is caller-side, not resolver-side", () => {
    const input = baseInput({
      flags: {
        speechBudget: true,
        qualityLoopV2: true,
        tieInQc: false,
        productionWizard: false,
        arcReplan: true,
      },
    });
    const result = deriveVerticalDramaProductionWizardState(input);
    expect(result.steps).toHaveLength(11);
    expect(result.activeStepId).toBe("final_episode");
    // Identical input (flag included) always yields identical output.
    expect(deriveVerticalDramaProductionWizardState(input)).toEqual(result);
  });
});

/* -------------------------------------------------------------------------- */
/* Invariants                                                                 */
/* -------------------------------------------------------------------------- */

describe("invariant: exactly one primary CTA, across every fixture in this file", () => {
  const fixtures: DeriveVerticalDramaProductionWizardStateInput[] = [
    baseInput(),
    baseInput({ seriesSetup: { complete: false } }),
    baseInput({ script: { exists: false, coverageStatus: "in_range" } }),
    baseInput({ script: { exists: true, coverageStatus: "underfilled_error" } }),
    baseInput({ script: { exists: true, coverageStatus: "underfilled_warning" } }),
    baseInput({ storyboard: { exists: false } }),
    baseInput({
      scriptQc: {
        latestScorecard: passingScorecard({ overall: 2 }),
        policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
        loopStatus: "idle",
        tieIn: { enabled: false },
      },
    }),
    baseInput({
      scriptQc: {
        latestScorecard: null,
        policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
        loopStatus: "not_run",
        tieIn: { enabled: false },
      },
    }),
    baseInput({
      scriptQc: {
        latestScorecard: passingScorecard({ overall: 2 }),
        policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
        loopStatus: "escalated_max_rounds",
        tieIn: { enabled: false },
      },
    }),
    baseInput({
      scriptQc: {
        latestScorecard: passingScorecard({ overall: 2 }),
        policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
        loopStatus: "escalated_regression",
        tieIn: { enabled: false },
      },
    }),
    baseInput({ arcReplanPending: true }),
    baseInput({ startFrames: { requiredShots: 9, approvedShots: 0 } }),
    baseInput({ dialogueAudio: { exists: false }, episodeDialogueQuality: null }),
    baseInput({
      episodeDialogueQuality: passingDialogueQuality({
        issues: [dialogueIssue({ code: "VD_DIALOGUE_EPISODE_UNDERFILLED", severity: "error" })],
      }),
    }),
    baseInput({ videoPrompts: { exists: true, stale: true } }),
    baseInput({ videoPrompts: { exists: false, stale: false } }),
    baseInput({ clips: { required: 8, completed: 0 } }),
    baseInput({ assembly: { completed: false, durationsAligned: true, audioSubtitleResolved: true } }),
    baseInput({ assembly: { completed: false, durationsAligned: false, audioSubtitleResolved: true } }),
    baseInput({ shotRepair: { failingTargetCount: 3 } }),
    baseInput({
      flags: {
        speechBudget: true,
        qualityLoopV2: true,
        tieInQc: false,
        productionWizard: false,
        arcReplan: true,
      },
    }),
    baseInput({
      gateExemptStepIds: ["script_qc"],
      scriptQc: {
        latestScorecard: passingScorecard({ overall: 1 }),
        policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
        loopStatus: "escalated_max_rounds",
        tieIn: { enabled: false },
      },
    }),
  ];

  it("primaryCta always equals the active step's own primaryAction", () => {
    for (const fixture of fixtures) {
      const result = deriveVerticalDramaProductionWizardState(fixture);
      const active = result.steps.find(s => s.stepId === result.activeStepId);
      expect(active).toBeDefined();
      expect(result.primaryCta).toBe(active!.primaryAction);
    }
  });

  it("the active step is never shot_repair (always secondary — see spec §8.8)", () => {
    for (const fixture of fixtures) {
      const result = deriveVerticalDramaProductionWizardState(fixture);
      expect(result.activeStepId).not.toBe("shot_repair");
    }
  });

  it("is deterministic — identical input yields identical output for every fixture", () => {
    for (const fixture of fixtures) {
      const a = deriveVerticalDramaProductionWizardState(fixture);
      const b = deriveVerticalDramaProductionWizardState(fixture);
      expect(a).toEqual(b);
    }
  });
});

describe("invariant: every emitted blocking reason is a member of the fixed section-12 code list", () => {
  it("holds across every fixture in this file's invariant suite", () => {
    const fixtures: DeriveVerticalDramaProductionWizardStateInput[] = [
      baseInput(),
      baseInput({ script: { exists: true, coverageStatus: "underfilled_error" } }),
      baseInput({ storyboard: { exists: false } }),
      baseInput({
        scriptQc: {
          latestScorecard: passingScorecard({ overall: 2 }),
          policy: VERTICAL_DRAMA_QUALITY_POLICY_DEFAULTS,
          loopStatus: "escalated_regression",
          tieIn: { enabled: true, reportPassed: false },
        },
        flags: {
          speechBudget: true,
          qualityLoopV2: true,
          tieInQc: true,
          productionWizard: true,
          arcReplan: true,
        },
        arcReplanPending: true,
      }),
      baseInput({ dialogueAudio: { exists: false }, episodeDialogueQuality: null }),
      baseInput({ videoPrompts: { exists: true, stale: true } }),
      baseInput({ clips: { required: 8, completed: 0 } }),
      baseInput({ assembly: { completed: false, durationsAligned: false, audioSubtitleResolved: false } }),
    ];

    for (const fixture of fixtures) {
      const result = deriveVerticalDramaProductionWizardState(fixture);
      for (const step of result.steps) {
        for (const reason of step.blockingReasons) {
          expect(VERTICAL_DRAMA_WIZARD_BLOCKING_REASON_CODES).toContain(reason);
        }
      }
    }
  });
});

describe("creditSpending coverage sanity", () => {
  it("uses every one of the 5 creditSpending classes across the 11 steps", () => {
    const result = deriveVerticalDramaProductionWizardState(baseInput());
    const used = new Set(result.steps.map(s => s.creditSpending));
    for (const cls of VERTICAL_DRAMA_PRODUCTION_WIZARD_CREDIT_SPENDING_CLASSES) {
      expect(used.has(cls)).toBe(true);
    }
  });
});
