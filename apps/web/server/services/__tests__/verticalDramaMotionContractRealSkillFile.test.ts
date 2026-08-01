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

const requiredSectionHeaders = [
  "## MODEL-FAMILY SHAPING",
  "## FRAME ANALYSIS FIRST",
  "## CAMERA & EMOTION GRAMMAR",
];

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
      for (const header of requiredSectionHeaders) expect(lower).toContain(header);

      const sectionStart = lower.indexOf(`## ${VD_MOTION_PROFILE_SKILL_SECTION_NAME}`);
      const contractStart = lower.indexOf(
        "### Writing the motion contract — scale it to what you declared",
        sectionStart,
      );
      const antiMorphStart = lower.indexOf(
        "### Anti-morph negatives — family-shaped",
        contractStart,
      );
      const nextSection = lower.indexOf("\n## ", antiMorphStart);
      expect(sectionStart).toBeGreaterThanOrEqual(0);
      expect(contractStart).toBeGreaterThan(sectionStart);
      expect(antiMorphStart).toBeGreaterThan(contractStart);
      expect(nextSection === -1 || antiMorphStart < nextSection).toBe(true);

      const antiMorph = lower.slice(antiMorphStart, nextSection === -1 ? undefined : nextSection);
      for (const token of [
        "orbit",
        "profile-to-frontal",
        "occlusion",
        "overlap",
        "re-interpretation",
        "sudden expression",
        "negative_prompt_supported",
      ]) {
        expect(antiMorph).toContain(token);
      }
      expect(lower).toContain("Low risk adds no contract language.");
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

  it("keeps bulk guidance prose-only and its case twins identical", () => {
    const dir = resolve(__dirname, "../../../skills/vertical-drama-video-motion-prompt-pack");
    const lower = readFileSync(resolve(dir, "skill.md"), "utf8");
    const upper = readFileSync(resolve(dir, "SKILL.md"), "utf8");
    expect(lower).toBe(upper);
    expect(lower).toContain(
      "## IDENTITY-PRESERVING MOTION — MANDATORY when start-frame images are attached",
    );
    expect(lower).toContain("motion_contracts: enabled");
    expect(lower).not.toContain('"motion_profile"');
    expect(lower).not.toContain('"frame_analysis"');
  });

  it("keeps the judge dimension in Craft and synced across case twins", () => {
    const dir = resolve(__dirname, "../../../skills/vertical-drama-video-prompt-judge");
    const lower = readFileSync(resolve(dir, "skill.md"), "utf8");
    const upper = readFileSync(resolve(dir, "SKILL.md"), "utf8");
    const correctness = lower.indexOf("### 2. Correctness gates");
    const craft = lower.indexOf("### 3. Craft");
    const dimension = lower.indexOf(
      "- **Honors the motion contract its own frame reading demands.**",
    );
    expect(lower).toBe(upper);
    expect(correctness).toBeGreaterThanOrEqual(0);
    expect(craft).toBeGreaterThan(correctness);
    expect(dimension).toBeGreaterThan(craft);
    expect(lower.slice(dimension)).toContain("effectiveRisk");
    expect(lower.slice(dimension)).toContain("faceObservability");
  });
});
