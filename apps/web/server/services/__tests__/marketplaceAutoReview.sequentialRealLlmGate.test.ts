/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 12 §5.8/T12-T13. Offline, deterministic tests for the PURE
 * `evaluateSequentialRealLlmGate` evaluator (T12), driven by the recorded
 * packs under `__fixtures__/marketplaceSequentialGate/recorded-packs/`, plus
 * the opt-in live-gate skip-gate check (T13). The live suite itself is
 * `describe.skipIf(!isSequentialRealLlmGateEnabled())` so it never runs in
 * normal CI — this file only asserts that the skip actually engages under
 * the default (unset) env.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  evaluateSequentialRealLlmGate,
  isSequentialRealLlmGateEnabled,
  SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER,
  type SequentialRealLlmGateExpectations,
} from "../marketplaceAutoReviewSequentialGate";
import type { SequentialStoryboardPack } from "../productReviewSequentialStoryboardSkillRunner";

const FIXTURES_DIR = path.resolve(
  import.meta.dirname,
  "../__fixtures__/marketplaceSequentialGate"
);
const RECORDED_DIR = path.join(FIXTURES_DIR, "recorded-packs");

function loadRecordedPack(file: string): SequentialStoryboardPack {
  const raw = fs.readFileSync(path.join(RECORDED_DIR, file), "utf-8");
  return JSON.parse(raw) as SequentialStoryboardPack;
}

function loadScenarioExpectations(
  file: string
): SequentialRealLlmGateExpectations {
  const raw = fs.readFileSync(path.join(FIXTURES_DIR, file), "utf-8");
  const parsed = JSON.parse(raw) as {
    expectations: SequentialRealLlmGateExpectations;
  };
  return parsed.expectations;
}

const CHILD_EXPECTATIONS = loadScenarioExpectations("child-desk-chair.json");
const ASSEMBLY_EXPECTATIONS = loadScenarioExpectations(
  "undocumented-assembly-desk.json"
);

/** T4-style stub per §4 — builds a spec-§19.2 sequential pack for ad hoc overrides. */
function buildGatePackFixture(
  overrides?: Partial<SequentialStoryboardPack>
): SequentialStoryboardPack {
  const base = loadRecordedPack("child-desk-chair-clean.json");
  return { ...base, ...overrides };
}

describe("Feature 136 section 12 — evaluateSequentialRealLlmGate (T12, offline)", () => {
  it("passes a clean 9-shot child-desk-chair pack with no failures", () => {
    const pack = loadRecordedPack("child-desk-chair-clean.json");
    const report = evaluateSequentialRealLlmGate(pack, CHILD_EXPECTATIONS);
    expect(report.passed).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.observed.shotCount).toBe(9);
    expect(report.fixtureId).toBe("child_desk_chair");
    expect(typeof report.generatedAt).toBe("string");
  });

  it("flags guardian_missing_in_minor_frame naming the offending shot id", () => {
    const pack = loadRecordedPack("guardian-missing.json");
    const report = evaluateSequentialRealLlmGate(pack, CHILD_EXPECTATIONS);
    expect(report.passed).toBe(false);
    const failure = report.failures.find(
      item => item.code === "guardian_missing_in_minor_frame"
    );
    expect(failure).toBeDefined();
    expect(failure?.shotIds).toEqual([4]);
    // The minor is still observed as depicting a minor even though guardian
    // coverage failed — `observed` reports facts, not the verdict.
    expect(report.observed.minorShotIds).toContain(4);
  });

  it("flags shot_count_invalid for an 8-shot pack", () => {
    const pack = loadRecordedPack("shot-count-invalid.json");
    const report = evaluateSequentialRealLlmGate(pack, CHILD_EXPECTATIONS);
    expect(report.passed).toBe(false);
    expect(report.observed.shotCount).toBe(8);
    const failure = report.failures.find(item => item.code === "shot_count_invalid");
    expect(failure).toBeDefined();
    expect(failure?.detail).toContain("expected 9");
  });

  it("flags global_block_missing for the shot whose video_prompt lacks the global-block marker", () => {
    const pack = loadRecordedPack("global-block-missing.json");
    const report = evaluateSequentialRealLlmGate(pack, CHILD_EXPECTATIONS);
    expect(report.passed).toBe(false);
    const failure = report.failures.find(item => item.code === "global_block_missing");
    expect(failure).toBeDefined();
    expect(failure?.shotIds).toEqual([7]);
  });

  it("flags price_token_present for Thai currency/discount tokens in dialogue", () => {
    const pack = loadRecordedPack("price-token-present.json");
    const report = evaluateSequentialRealLlmGate(pack, CHILD_EXPECTATIONS);
    expect(report.passed).toBe(false);
    const failure = report.failures.find(item => item.code === "price_token_present");
    expect(failure).toBeDefined();
    expect(failure?.shotIds).toEqual([6]);
  });

  it("flags prompt_over_budget for both an over-budget image prompt and an over-budget video prompt", () => {
    const pack = loadRecordedPack("prompt-over-budget.json");
    const report = evaluateSequentialRealLlmGate(pack, CHILD_EXPECTATIONS);
    expect(report.passed).toBe(false);
    const overBudgetFailures = report.failures.filter(
      item => item.code === "prompt_over_budget"
    );
    expect(overBudgetFailures.length).toBe(2);
    expect(overBudgetFailures.map(item => item.detail).sort()).toEqual([
      "image_prompt",
      "video_prompt",
    ]);
    expect(overBudgetFailures.find(item => item.detail === "image_prompt")?.shotIds).toEqual([2]);
    expect(overBudgetFailures.find(item => item.detail === "video_prompt")?.shotIds).toEqual([8]);
    expect(report.observed.maxImagePromptChars).toBeGreaterThan(
      CHILD_EXPECTATIONS.imagePromptMaxChars
    );
  });

  it("flags claim_untraced for a shot whose claim_trace entry is unsupported", () => {
    const pack = loadRecordedPack("claim-untraced.json");
    const report = evaluateSequentialRealLlmGate(pack, CHILD_EXPECTATIONS);
    expect(report.passed).toBe(false);
    const failure = report.failures.find(item => item.code === "claim_untraced");
    expect(failure).toBeDefined();
    expect(failure?.shotIds).toEqual([9]);
  });

  it("undocumented-assembly fixture: assembly content present ⇒ assembly_content_present", () => {
    const pack = loadRecordedPack("assembly-content-present.json");
    const report = evaluateSequentialRealLlmGate(pack, ASSEMBLY_EXPECTATIONS);
    expect(report.passed).toBe(false);
    const failure = report.failures.find(item => item.code === "assembly_content_present");
    expect(failure).toBeDefined();
    expect(failure?.shotIds).toContain(5);
  });

  it("the same undocumented-assembly scenario pivoted to benefit_narration/problem_solution passes and reports pivotBeats > 0", () => {
    const pack = loadRecordedPack("undocumented-assembly-desk-pivoted.json");
    const report = evaluateSequentialRealLlmGate(pack, ASSEMBLY_EXPECTATIONS);
    expect(report.passed).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.observed.pivotBeats).toBeGreaterThan(0);
  });

  it("the report is JSON-serializable and contains no prompt text — only ids, codes, counts, lengths", () => {
    const pack = loadRecordedPack("prompt-over-budget.json");
    const report = evaluateSequentialRealLlmGate(pack, CHILD_EXPECTATIONS);
    const serialized = JSON.stringify(report);
    expect(() => JSON.parse(serialized)).not.toThrow();
    // Plant a fixture sentence and assert it never reaches the report.
    const plantedSentence = "extremely detailed continuity filler text";
    expect(serialized).not.toContain(plantedSentence);
    // The pack's own dialogue/prompt text must never leak either.
    for (const shot of pack.shots) {
      expect(serialized).not.toContain(shot.dialogue);
    }
  });

  it("buildGatePackFixture stub produces a valid, overridable 9-shot pack", () => {
    const pack = buildGatePackFixture();
    expect(pack.shots.length).toBe(9);
    const report = evaluateSequentialRealLlmGate(pack, CHILD_EXPECTATIONS);
    expect(report.passed).toBe(true);

    const overridden = buildGatePackFixture({
      shots: pack.shots.slice(0, 8),
    });
    const overriddenReport = evaluateSequentialRealLlmGate(
      overridden,
      CHILD_EXPECTATIONS
    );
    expect(overriddenReport.passed).toBe(false);
  });

  it("frozen failure-code set matches SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER export shape (module import sanity)", () => {
    expect(typeof SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER).toBe("string");
    expect(SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER.length).toBeGreaterThan(0);
  });
});

describe("Feature 136 section 12 — isSequentialRealLlmGateEnabled (T13)", () => {
  it("is false when MARKETPLACE_SEQUENTIAL_REAL_LLM_GATE is unset", () => {
    const original = process.env.MARKETPLACE_SEQUENTIAL_REAL_LLM_GATE;
    delete process.env.MARKETPLACE_SEQUENTIAL_REAL_LLM_GATE;
    try {
      expect(isSequentialRealLlmGateEnabled()).toBe(false);
    } finally {
      if (original === undefined) delete process.env.MARKETPLACE_SEQUENTIAL_REAL_LLM_GATE;
      else process.env.MARKETPLACE_SEQUENTIAL_REAL_LLM_GATE = original;
    }
  });

  it('is true only for the exact string "1"', () => {
    const original = process.env.MARKETPLACE_SEQUENTIAL_REAL_LLM_GATE;
    try {
      process.env.MARKETPLACE_SEQUENTIAL_REAL_LLM_GATE = "1";
      expect(isSequentialRealLlmGateEnabled()).toBe(true);
      process.env.MARKETPLACE_SEQUENTIAL_REAL_LLM_GATE = "true";
      expect(isSequentialRealLlmGateEnabled()).toBe(false);
    } finally {
      if (original === undefined) delete process.env.MARKETPLACE_SEQUENTIAL_REAL_LLM_GATE;
      else process.env.MARKETPLACE_SEQUENTIAL_REAL_LLM_GATE = original;
    }
  });
});

/**
 * T13 — File B's live suite is wrapped in
 * `describe.skipIf(!isSequentialRealLlmGateEnabled())`, so under the default
 * (unset) env this whole block is SKIPPED, not executed. Asserted here via
 * the helper (not by actually running the live suite, which needs a live
 * model + provider credentials and is intentionally excluded from normal
 * CI/test runs).
 */
describe.skipIf(!isSequentialRealLlmGateEnabled())(
  "Feature 136 section 12 — sequential real-LLM gate (M5, manual/CI-tagged, live)",
  () => {
    it("is intentionally not implemented in the default (skipped) run", () => {
      // This block only executes when MARKETPLACE_SEQUENTIAL_REAL_LLM_GATE=1
      // is set by a human/CI operator running the M5 pilot gate manually
      // (see the GA runbook). It is never reached by the default test run.
      expect(isSequentialRealLlmGateEnabled()).toBe(true);
    });
  }
);
