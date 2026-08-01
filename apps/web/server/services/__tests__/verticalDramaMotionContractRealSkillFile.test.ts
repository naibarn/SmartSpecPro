import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../llmRouter", () => ({ executeWithFallback: vi.fn() }));
vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(), deductCredits: vi.fn(), calculateCreditsForLLM: vi.fn(),
}));
vi.mock("../rateLimiter", () => ({
  mediaGenerationLimiter: { isAllowed: vi.fn(), getResetTime: vi.fn() },
}));
vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(), resolveSkillManifestPath: vi.fn(),
}));
vi.mock("@smartspec/skills", () => ({ parseSkillFile: vi.fn() }));
vi.mock("../enabledLlmModels", () => ({ loadEnabledLlmModelRows: vi.fn() }));
vi.mock("../intelligentModelSelector", () => ({ selectBestLlmModel: vi.fn() }));
vi.mock("../modelRegistry", () => ({ resolveVerticalDramaCapabilities: vi.fn() }));
vi.mock("../verticalDramaProviderRouting", () => ({ detectProviderFamily: vi.fn() }));
vi.mock("../verticalDramaImproveScript", () => ({ resolveQualityLargeContextModelId: vi.fn() }));
vi.mock("../verticalDramaLlmModelPolicy", () => ({ resolveVerticalDramaSeriesModel: vi.fn() }));

import {
  buildTargetVideoModelFactBlock,
  VD_MOTION_PROFILE_SKILL_SECTION_NAME,
} from "../verticalDramaVideoMotionPromptGeneration";

const skillDirs = [
  "vertical-drama-shot-video-prompt",
  "vertical-drama-shot-video-prompt-subshots",
].map(name => resolve(__dirname, "../../../skills", name));

describe("real motion-contract skill files", () => {
  for (const dir of skillDirs) {
    it(`${dir} keeps case twins identical and declares the wire contract`, () => {
      const lower = readFileSync(resolve(dir, "skill.md"), "utf8");
      const upper = readFileSync(resolve(dir, "SKILL.md"), "utf8");
      expect(lower).toBe(upper);
      expect(lower).toContain(`## ${VD_MOTION_PROFILE_SKILL_SECTION_NAME}`);
      for (const field of [
        "motion_profile", "start_facing", "end_facing", "turn_magnitude",
        "reveals_hidden_side", "camera_motion", "new_character_enters",
        "identity_risk", "risk_reasons",
      ]) {
        expect(lower).toContain(`\"${field}\"`);
      }
      expect(lower).toContain("solo");
      expect(lower).toContain("never lower it");
    });
  }

  it("the activation fact references the frozen real section name", () => {
    const block = buildTargetVideoModelFactBlock({
      family: "veo",
      modelId: "veo-test",
      frameAnalysisRequested: true,
      frameObservabilityRequested: true,
      motionContractsEnabled: true,
    });
    expect(block).toContain(`the skill's \"${VD_MOTION_PROFILE_SKILL_SECTION_NAME}\" section`);
  });
});
