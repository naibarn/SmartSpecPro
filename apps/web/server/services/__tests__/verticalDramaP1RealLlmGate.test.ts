import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  evaluateVerticalDramaP1RealLlmGate,
  isVerticalDramaP1RealLlmGateEnabled,
  VD_P1_REAL_LLM_GATE_FAILURE_CODES,
  type VdP1RealLlmGateExpectations,
  type VdP1RealLlmGateSample,
} from "../verticalDramaP1RealLlmGate";

const FIXTURE_ROOT = path.resolve(
  import.meta.dirname,
  "../__fixtures__/vdP1RealLlmGate"
);

function loadFixture(): VdP1RealLlmGateSample {
  return JSON.parse(
    fs.readFileSync(
      path.join(FIXTURE_ROOT, "recorded/clean-same-scene.json"),
      "utf8"
    )
  ) as VdP1RealLlmGateSample;
}

function loadExpectations(): VdP1RealLlmGateExpectations {
  return JSON.parse(
    fs.readFileSync(
      path.join(FIXTURE_ROOT, "expectations/clean-same-scene.json"),
      "utf8"
    )
  ) as VdP1RealLlmGateExpectations;
}

function cloneSample(): VdP1RealLlmGateSample {
  return structuredClone(loadFixture());
}

describe("evaluateVerticalDramaP1RealLlmGate (offline, deterministic)", () => {
  it("passes a clean same-scene sample", () => {
    const report = evaluateVerticalDramaP1RealLlmGate(
      loadFixture(),
      loadExpectations()
    );
    expect(report.passed).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.observed.sceneStateShotIds).toEqual([1, 2]);
    expect(report.observed.motionProfileShotIds).toEqual([1, 2]);
  });

  it("flags a missing motion profile", () => {
    const sample = cloneSample();
    delete sample.shots[0].motionProfile;
    const report = evaluateVerticalDramaP1RealLlmGate(
      sample,
      loadExpectations()
    );
    expect(report.failures).toContainEqual({
      code: "motion_profile_missing",
      shotIds: [1],
    });
  });

  it("flags an invalid enum and a risk floor that was not raised", () => {
    const sample = cloneSample();
    (sample.shots[0].motionProfile as Record<string, unknown>).characters = [
      {
        name: "Hero",
        start_facing: "diagonal_unknown",
        end_facing: "frontal",
        turn_magnitude: "large",
        reveals_hidden_side: true,
      },
    ];
    sample.shots[0].effectiveRisk = "medium";
    const report = evaluateVerticalDramaP1RealLlmGate(
      sample,
      loadExpectations()
    );
    expect(report.failures.map(failure => failure.code)).toContain(
      "motion_profile_enum_invalid"
    );

    const valid = cloneSample();
    (valid.shots[0].motionProfile as Record<string, unknown>).characters = [
      {
        name: "Hero",
        start_facing: "back_of_head",
        end_facing: "frontal",
        turn_magnitude: "large",
        reveals_hidden_side: true,
      },
    ];
    valid.shots[0].effectiveRisk = "medium";
    const riskReport = evaluateVerticalDramaP1RealLlmGate(
      valid,
      loadExpectations()
    );
    expect(riskReport.failures.map(failure => failure.code)).toContain(
      "effective_risk_not_raised"
    );
  });

  it("flags missing observability and a missing high-risk motion contract", () => {
    const sample = cloneSample();
    sample.shots[0].frameObservability = [];
    sample.shots[0].motionContractText = "";
    const report = evaluateVerticalDramaP1RealLlmGate(
      sample,
      loadExpectations()
    );
    expect(report.failures.map(failure => failure.code)).toEqual(
      expect.arrayContaining([
        "frame_observability_missing",
        "motion_contract_absent",
      ])
    );
  });

  it("flags incomplete/mismatched state and missing lock text", () => {
    const sample = cloneSample();
    sample.shots[0].sceneVisualState = {
      locationKey: "hall",
      memberShotNumbers: [1],
    };
    sample.shots[0].sceneLockText = "plain prompt";
    const report = evaluateVerticalDramaP1RealLlmGate(
      sample,
      loadExpectations()
    );
    expect(report.failures.map(failure => failure.code)).toEqual(
      expect.arrayContaining([
        "scene_state_incomplete",
        "scene_member_shots_mismatch",
        "scene_lock_absent_from_prompt",
      ])
    );
  });

  it("flags a missing state and names both shots when same-scene lock text diverges", () => {
    const sample = cloneSample();
    sample.shots[0].sceneVisualState = null;
    sample.shots[1].sceneLockText =
      "SCENE CONTINUITY LOCK\n- Lighting: blue night";
    const report = evaluateVerticalDramaP1RealLlmGate(
      sample,
      loadExpectations()
    );
    expect(report.failures).toContainEqual({
      code: "scene_state_missing",
      shotIds: [1],
    });
    expect(report.failures).toContainEqual({
      code: "scene_lock_text_diverged",
      shotIds: [1, 2],
    });
  });

  it("flags image/video budget overflow and batch lighting divergence", () => {
    const sample = cloneSample();
    sample.shots[0].imagePrompt = "x".repeat(3801);
    sample.shots[1].videoPrompt = "x".repeat(2001);
    sample.batchLightingByScene = { hall: ["warm evening", "blue night"] };
    const report = evaluateVerticalDramaP1RealLlmGate(
      sample,
      loadExpectations()
    );
    expect(report.failures).toEqual(
      expect.arrayContaining([
        { code: "prompt_over_budget", shotIds: [1], detail: "image_prompt" },
        { code: "prompt_over_budget", shotIds: [2], detail: "video_prompt" },
        { code: "batch_lighting_diverged", shotIds: [1, 2], detail: "hall" },
      ])
    );
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("warm evening");
    expect(serialized).not.toContain("blue night");
  });

  it("keeps the failure-code tuple frozen and the gate switch exact", () => {
    expect(VD_P1_REAL_LLM_GATE_FAILURE_CODES).toEqual([
      "motion_profile_missing",
      "motion_profile_enum_invalid",
      "effective_risk_not_raised",
      "frame_observability_missing",
      "motion_contract_absent",
      "scene_state_missing",
      "scene_state_incomplete",
      "scene_member_shots_mismatch",
      "scene_lock_absent_from_prompt",
      "scene_lock_text_diverged",
      "prompt_over_budget",
      "batch_lighting_diverged",
    ]);
    const original = process.env.VERTICAL_DRAMA_P1_REAL_LLM_GATE;
    try {
      delete process.env.VERTICAL_DRAMA_P1_REAL_LLM_GATE;
      expect(isVerticalDramaP1RealLlmGateEnabled()).toBe(false);
      process.env.VERTICAL_DRAMA_P1_REAL_LLM_GATE = "1";
      expect(isVerticalDramaP1RealLlmGateEnabled()).toBe(true);
      for (const value of ["true", "yes", "01", "0"]) {
        process.env.VERTICAL_DRAMA_P1_REAL_LLM_GATE = value;
        expect(isVerticalDramaP1RealLlmGateEnabled()).toBe(false);
      }
    } finally {
      if (original === undefined)
        delete process.env.VERTICAL_DRAMA_P1_REAL_LLM_GATE;
      else process.env.VERTICAL_DRAMA_P1_REAL_LLM_GATE = original;
    }
  });
});

afterEach(() => {
  delete process.env.VERTICAL_DRAMA_P1_REAL_LLM_GATE;
});
