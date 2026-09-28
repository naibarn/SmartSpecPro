import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateVerticalDramaP1RealLlmGate,
  isVerticalDramaP1RealLlmGateEnabled,
  type VdP1RealLlmGateExpectations,
  type VdP1RealLlmGateSample,
} from "../verticalDramaP1RealLlmGate";

/**
 * Opt-in replay gate for a sample produced by an authorized real-LLM run.
 *
 * This suite never spends credits or calls a provider itself. A live adapter
 * must write JSON matching the evaluator contract to
 * `VERTICAL_DRAMA_P1_REAL_LLM_GATE_SAMPLE`; the normal offline suite then
 * applies the exact same checks. The exact `VERTICAL_DRAMA_P1_REAL_LLM_GATE=1`
 * switch keeps this out of default CI and local test runs.
 */
describe.skipIf(!isVerticalDramaP1RealLlmGateEnabled())(
  "VD P1 real-LLM gate (opt-in replay)",
  () => {
    it("passes the authorized recorded live sample", () => {
      const samplePath =
        process.env.VERTICAL_DRAMA_P1_REAL_LLM_GATE_SAMPLE?.trim();
      if (!samplePath) {
        throw new Error(
          "Set VERTICAL_DRAMA_P1_REAL_LLM_GATE_SAMPLE to an authorized JSON sample before enabling the live gate"
        );
      }
      const expectationsPath =
        process.env.VERTICAL_DRAMA_P1_REAL_LLM_GATE_EXPECTATIONS?.trim() ??
        path.resolve(
          import.meta.dirname,
          "../__fixtures__/vdP1RealLlmGate/expectations/clean-same-scene.json"
        );
      const sample = JSON.parse(
        fs.readFileSync(samplePath, "utf8")
      ) as VdP1RealLlmGateSample;
      const expectations = JSON.parse(
        fs.readFileSync(expectationsPath, "utf8")
      ) as VdP1RealLlmGateExpectations;
      const report = evaluateVerticalDramaP1RealLlmGate(sample, expectations);
      expect(report.passed, JSON.stringify(report.failures)).toBe(true);
    });
  }
);
