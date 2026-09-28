/**
 * Two-mode start-frame image prompt switch
 * (`planning/vd-start-frame-prompt-modes/plan.md`) — REAL-FILE gate test
 * (taught-not-wired failure class, see project memory
 * `project_vd_skill_taught_not_wired.md`): a field/section can be authored
 * in a skill.md and STILL be silently dead if the loader path, folder name,
 * or fact-line label drifts from what the code actually requests/reads.
 * This file reads the ACTUAL skill.md/SKILL.md files off disk via
 * `vi.importActual("fs")` (bypassing this file's OWN `vi.mock("fs", ...)`
 * below, needed only so the service module itself can be safely imported)
 * and cross-checks `VD_IMAGE_PROMPT_MODE_SKILL_FOLDERS` against the real
 * filesystem. Mirrors
 * `verticalDramaVideoPromptModelFamilyRealSkillFile.test.ts`'s structure and
 * mocking discipline exactly.
 */
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Same comprehensive mock set the sibling real-file gate test uses, so this
// file can safely import `verticalDramaStartFrameGeneration.ts` (pulling in
// its full static import graph) without touching a real DB, LLM provider,
// or rate limiter — this file never actually CALLS the mocked functions, it
// only imports `VD_IMAGE_PROMPT_MODE_SKILL_FOLDERS` (a pure constant).
vi.mock("../llmRouter", () => ({
  executeWithFallback: vi.fn(),
}));
vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  calculateCreditsForLLM: vi.fn(),
}));
vi.mock("../rateLimiter", () => ({
  mediaGenerationLimiter: {
    isAllowed: vi.fn(),
    getResetTime: vi.fn(),
  },
}));
vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(),
  resolveSkillManifestPath: vi.fn(),
}));
vi.mock("@smartspec/skills", () => ({
  parseSkillFile: vi.fn(),
}));
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
    },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});
vi.mock("../verticalDramaImproveScript", () => ({
  resolveStartFramePlanModel: vi.fn(),
}));
vi.mock("../db", () => ({ db: {}, getDb: vi.fn() }));
vi.mock("../enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(),
}));
vi.mock("../intelligentModelSelector", () => ({
  selectBestLlmModel: vi.fn(),
}));

import { VD_IMAGE_PROMPT_MODE_SKILL_FOLDERS } from "@shared/verticalDramaSeries/imagePromptModelFamily";

const SKILLS = [
  {
    mode: "policy_safe_rewrite" as const,
    label: VD_IMAGE_PROMPT_MODE_SKILL_FOLDERS.policy_safe_rewrite,
    dir: resolve(__dirname, "../../../skills", VD_IMAGE_PROMPT_MODE_SKILL_FOLDERS.policy_safe_rewrite),
    signatureHeader: "POLICY-SAFE REWRITE",
  },
  {
    mode: "cinematic_narrative" as const,
    label: VD_IMAGE_PROMPT_MODE_SKILL_FOLDERS.cinematic_narrative,
    dir: resolve(
      __dirname,
      "../../../skills",
      VD_IMAGE_PROMPT_MODE_SKILL_FOLDERS.cinematic_narrative,
    ),
    signatureHeader: "MODEL DESIGN THE BLOCKING",
  },
];

/** Always the REAL, unmocked `fs` — bypasses this file's own `vi.mock("fs", ...)` above. */
async function realFs(): Promise<typeof import("fs")> {
  return vi.importActual<typeof import("fs")>("fs");
}

async function readRealFile(path: string): Promise<string> {
  const fs = await realFs();
  expect(fs.existsSync(path)).toBe(true);
  return fs.readFileSync(path, "utf-8");
}

describe("real-skill-file gate: vd-start-frame-prompt-modes (taught-not-wired failure class)", () => {
  for (const skill of SKILLS) {
    describe(skill.label, () => {
      const lowercasePath = resolve(skill.dir, "skill.md");
      const uppercasePath = resolve(skill.dir, "SKILL.md");

      it("lowercase skill.md and SKILL.md are byte-identical twins (loader reads lowercase first)", async () => {
        const lowercase = await readRealFile(lowercasePath);
        const uppercase = await readRealFile(uppercasePath);
        expect(lowercase).toBe(uppercase);
      });

      it("assigns reference mapping to the skill only when that mode owns it", async () => {
        const content = await readRealFile(lowercasePath);
        if (skill.mode === "policy_safe_rewrite") {
          expect(content).toContain("Application code owns reference mapping");
          expect(content).toContain("Never add");
        } else {
          expect(content).toContain("REFERENCE MAPPING");
        }
      });

      it("assigns final prompt length to code for policy mode and to the skill for cinematic mode", async () => {
        const content = await readRealFile(lowercasePath);
        if (skill.mode === "policy_safe_rewrite") {
          expect(content).toContain("prompt assembly.");
        } else {
          expect(content).toContain("prompt_max_chars");
          expect(content).toContain("20,000 characters");
        }
      });

      it(`declares its own signature section ("${skill.signatureHeader}")`, async () => {
        const content = await readRealFile(lowercasePath);
        expect(content).toContain(skill.signatureHeader);
      });

      it("keeps policy mode look-neutral while cinematic mode consumes only the compact register", async () => {
        const content = await readRealFile(lowercasePath);
        if (skill.mode === "policy_safe_rewrite") {
          expect(content).toContain("visual style");
          expect(content).toContain("downstream-only context");
        } else {
          expect(content).toContain("SERIES LOOK REGISTER");
          expect(content).toContain("Raw positive/negative provider");
        }
      });

      it("does not let policy mode add products while cinematic mode still supports tie-ins", async () => {
        const content = await readRealFile(lowercasePath);
        if (skill.mode === "policy_safe_rewrite") {
          expect(content).toContain("products");
        } else {
          expect(content).toContain("PRODUCT TIE-IN");
        }
      });
    });
  }

  it("VD_IMAGE_PROMPT_MODE_SKILL_FOLDERS points at folders that actually exist on disk, for both modes", async () => {
    const fs = await realFs();
    for (const skill of SKILLS) {
      expect(fs.existsSync(resolve(skill.dir, "skill.md"))).toBe(true);
      expect(fs.existsSync(resolve(skill.dir, "SKILL.md"))).toBe(true);
    }
  });

  it("the cinematic_narrative skill's JSON contract declares the director's-notes extras the service parses leniently", async () => {
    const content = await readRealFile(
      resolve(SKILLS[1].dir, "skill.md"),
    );
    for (const field of [
      '"analysis_summary"',
      '"continuity_notes"',
      '"video_readiness_notes"',
      '"quality_score"',
      '"quality_flags"',
    ]) {
      expect(content).toContain(field);
    }
  });

  it("the policy_safe_rewrite skill's JSON contract declares safety_adjustments", async () => {
    const content = await readRealFile(resolve(SKILLS[0].dir, "skill.md"));
    expect(content).toContain('"rewritten_synopsis"');
    expect(content).toContain('"safety_adjustments"');
    expect(content).toContain("Do not return `prompt`, `negative_prompt`");
  });
});
