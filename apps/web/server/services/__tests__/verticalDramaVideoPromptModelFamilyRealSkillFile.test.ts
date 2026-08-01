/**
 * Model-family-aware, vision-grounded video prompt quality upgrade
 * (`planning/vd-video-prompt-model-family-quality/plan.md`) — REAL-FILE gate
 * test (taught-not-wired failure class, see project memory
 * `project_vd_skill_taught_not_wired.md`): a field/section can be authored
 * in a skill.md and STILL be silently dead if the loader path, section
 * name, or output-field name drifts from what the code actually
 * requests/reads. This file reads the ACTUAL skill.md/SKILL.md files off
 * disk via `vi.importActual("fs")` — which bypasses this file's OWN
 * `vi.mock("fs", ...)` below (needed only so the service module itself can
 * be safely imported) and always returns the real, unmocked module — and
 * cross-checks the real content against the service's own fact-block
 * builder output, rather than trusting either side in isolation.
 */
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

// `skillFiles.ts`'s own `resolveSkillDirCandidates` candidate-path formula
// (mirrored, not imported — importing it for real would still resolve
// `fs` through THIS file's `vi.mock("fs", ...)` below, since
// `vi.importActual` only unmocks the directly-requested module, not its own
// transitive `import fs from "fs"`; calling the mocked function is useless
// here). Mirroring the formula lets this file verify the loader's actual
// resolution STRATEGY against the real filesystem without fighting that
// mock-nesting limitation.
function skillDirCandidates(folderPath: string): string[] {
  return [
    resolve(process.cwd(), folderPath),
    resolve(process.cwd(), "..", folderPath),
    resolve(process.cwd(), "..", "..", folderPath),
    resolve(process.cwd(), "apps", "web", folderPath),
  ];
}

// Same comprehensive mock set the sibling service test files use, so this
// file can safely import `verticalDramaVideoMotionPromptGeneration.ts`
// (pulling in its full static import graph) without touching a real DB,
// LLM provider, or rate limiter — this file never actually CALLS any of the
// mocked functions, it only imports 2 pure, synchronous helpers from the
// module, but the mocks still have to be in place for the module to load.
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
vi.mock("../enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(),
}));
vi.mock("../intelligentModelSelector", () => ({
  selectBestLlmModel: vi.fn(),
}));
vi.mock("../modelRegistry", () => ({
  resolveVerticalDramaCapabilities: vi.fn(),
}));
vi.mock("../verticalDramaProviderRouting", () => ({
  detectProviderFamily: vi.fn(),
}));
vi.mock("../verticalDramaStoryBible", async () => {
  const actual = await vi.importActual<typeof import("../verticalDramaStoryBible")>(
    "../verticalDramaStoryBible",
  );
  return {
    ...actual,
    resolveStoryBibleModel: vi.fn(),
  };
});
vi.mock("../verticalDramaImproveScript", () => ({
  resolveQualityLargeContextModelId: vi.fn(),
}));
vi.mock("../verticalDramaLlmModelPolicy", () => ({
  resolveVerticalDramaSeriesModel: vi.fn(
    (_seriesId: number, autoFallback: () => Promise<string | null>) => autoFallback(),
  ),
}));

import {
  buildTargetVideoModelFactBlock,
  resolveShotVideoPromptModelFamily,
} from "../verticalDramaVideoMotionPromptGeneration";

const REQUIRED_SECTION_HEADERS = [
  "MODEL-FAMILY SHAPING",
  "FRAME ANALYSIS FIRST",
  "CAMERA & EMOTION GRAMMAR",
];

const SKILLS = [
  {
    label: "vertical-drama-shot-video-prompt",
    dir: resolve(__dirname, "../../../skills/vertical-drama-shot-video-prompt"),
  },
  {
    label: "vertical-drama-shot-video-prompt-subshots",
    dir: resolve(__dirname, "../../../skills/vertical-drama-shot-video-prompt-subshots"),
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

describe("real-skill-file gate: vertical-drama-shot-video-prompt[-subshots] (taught-not-wired failure class)", () => {
  for (const skill of SKILLS) {
    describe(skill.label, () => {
      const lowercasePath = resolve(skill.dir, "skill.md");
      const uppercasePath = resolve(skill.dir, "SKILL.md");

      it("lowercase skill.md and SKILL.md are byte-identical twins (loader reads lowercase first)", async () => {
        const lowercase = await readRealFile(lowercasePath);
        const uppercase = await readRealFile(uppercasePath);
        expect(lowercase).toBe(uppercase);
      });

      it.each(REQUIRED_SECTION_HEADERS)(
        "contains the required '%s' section header",
        async (header) => {
          const content = await readRealFile(lowercasePath);
          expect(content).toContain(header);
        },
      );

      it('declares the "frame_analysis" output field in its JSON contract', async () => {
        const content = await readRealFile(lowercasePath);
        expect(content).toContain('"frame_analysis"');
      });

      // Recorded gap-4 fix (2026-07-22, taught-not-wired failure class) —
      // the skill must OWN writing the closing sound clause into `prompt`
      // itself (code never appends it anymore, see
      // `verticalDramaVideoMotionPromptGeneration.ts`'s and
      // `verticalDramaVideoPromptFormatter.ts`'s doc comments), and must
      // still return the SAME text in `audio_direction` for display/audit.
      it('declares the sound-direction-ownership mandate ("WRITE THE SOUND DIRECTION INTO `prompt` ITSELF") and that audio_direction carries the SAME text', async () => {
        const content = await readRealFile(lowercasePath);
        expect(content).toContain("WRITE THE SOUND DIRECTION INTO");
        expect(content).toContain("Also return the same direction in");
        expect(content).toContain("audio_direction");
      });
    });
  }

  it("the service's fact-block builder output mentions the EXACT section name the skill declares ('MODEL-FAMILY SHAPING')", async () => {
    // Cross-check: read the real file's own section header text, then
    // verify the service's fact block (the thing actually sent to the LLM
    // at generation time) references that same literal string — proving
    // the two sides haven't drifted apart (taught-not-wired class).
    const skillContent = await readRealFile(resolve(SKILLS[0].dir, "skill.md"));
    expect(skillContent).toContain("## MODEL-FAMILY SHAPING — MANDATORY");

    const factBlock = buildTargetVideoModelFactBlock({
      family: "veo",
      modelId: "veo3/generate-veo-3-video-lite",
      modelName: "Veo 3.1 Lite",
      maxReferenceImages: 3,
      frameAnalysisRequested: true,
    });
    expect(factBlock).toContain("MODEL-FAMILY SHAPING");
    expect(factBlock).toContain('the skill\'s "FRAME ANALYSIS FIRST" section');
  });

  it("resolveShotVideoPromptModelFamily + buildTargetVideoModelFactBlock together produce a family line that matches one of the skill's authored family sub-sections", async () => {
    const content = await readRealFile(resolve(SKILLS[0].dir, "skill.md"));
    // The skill authors exactly these 4 per-family sub-sections.
    expect(content).toContain("### family: grok");
    expect(content).toContain("### family: veo");
    expect(content).toContain("### family: seedance");
    expect(content).toContain("### family: other");

    const family = resolveShotVideoPromptModelFamily("veo3/generate-veo-3-video-lite", {
      name: "Veo 3.1 Lite",
      provider: "kie.ai",
    });
    expect(content).toContain(`### family: ${family}`);
  });
});

/**
 * Pack-parity follow-up (`planning/vd-video-prompt-model-family-quality/
 * plan.md`, "pack bulk generator — out of scope" item, closed 2026-07-22) —
 * same real-file gate discipline for the `vertical-drama-video-motion-
 * prompt-pack` skill, which received its OWN model-family-shaping upgrade
 * (v2.0.0) rather than reusing the per-shot skill's sections verbatim. This
 * skill has NO `frame_analysis` JSON contract and NO `### family: x`
 * sub-headers (position anchoring is a plain-prose instruction in its
 * "Single camera move + speaker anchoring per clip" section instead) — its
 * own assertions are intentionally NOT copy-pasted from the `SKILLS` loop
 * above.
 */
describe("real-skill-file gate: vertical-drama-video-motion-prompt-pack (taught-not-wired failure class, pack-parity follow-up)", () => {
  const packSkillDir = resolve(__dirname, "../../../skills/vertical-drama-video-motion-prompt-pack");
  const lowercasePath = resolve(packSkillDir, "skill.md");
  const uppercasePath = resolve(packSkillDir, "SKILL.md");

  it("lowercase skill.md and SKILL.md are byte-identical twins (loader reads lowercase first)", async () => {
    const lowercase = await readRealFile(lowercasePath);
    const uppercase = await readRealFile(uppercasePath);
    expect(lowercase).toBe(uppercase);
  });

  it.each([
    "## MODEL-FAMILY SHAPING — MANDATORY",
    "## CAMERA & EMOTION GRAMMAR — MANDATORY",
    "SOUND — SFX ONLY, WRITTEN INTO THE PROMPT",
  ])("contains the required '%s' section header", async (header) => {
    const content = await readRealFile(lowercasePath);
    expect(content).toContain(header);
  });

  it("the loader's resolution strategy finds a real skill.md for the pack skill folder (real fs, mirrors resolveSkillDirCandidates)", async () => {
    const fs = await realFs();
    const candidateDirs = skillDirCandidates("skills/vertical-drama-video-motion-prompt-pack");
    const found = candidateDirs.some(dir => fs.existsSync(resolve(dir, "skill.md")));
    expect(found).toBe(true);
  });
});

/**
 * Judged best-of-2 quality loop (`planning/vd-video-prompt-model-family-
 * quality/plan.md` Phase 2) — same real-file gate discipline for the NEW
 * `vertical-drama-video-prompt-judge` skill.
 */
describe("real-skill-file gate: vertical-drama-video-prompt-judge (taught-not-wired failure class)", () => {
  const judgeSkillDir = resolve(__dirname, "../../../skills/vertical-drama-video-prompt-judge");
  const lowercasePath = resolve(judgeSkillDir, "skill.md");
  const uppercasePath = resolve(judgeSkillDir, "SKILL.md");

  it("lowercase skill.md and SKILL.md are byte-identical twins (loader reads lowercase first)", async () => {
    const lowercase = await readRealFile(lowercasePath);
    const uppercase = await readRealFile(uppercasePath);
    expect(lowercase).toBe(uppercase);
  });

  it.each(["winner_index", "verdict", "repair_instruction", "Correctness gates"])(
    "contains '%s'",
    async (needle) => {
      const content = await readRealFile(lowercasePath);
      expect(content).toContain(needle);
    },
  );

  it("the loader's resolution strategy finds a real skill.md for the judge skill folder (real fs, mirrors resolveSkillDirCandidates)", async () => {
    const fs = await realFs();
    const candidateDirs = skillDirCandidates("skills/vertical-drama-video-prompt-judge");
    const found = candidateDirs.some(dir => fs.existsSync(resolve(dir, "skill.md")));
    expect(found).toBe(true);
  });
});
