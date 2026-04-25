import fs from "fs";
import os from "os";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { analyzeSkillForMaintenance } from "../skillMaintenanceAnalyzer";

describe("skillMaintenanceAnalyzer", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function createSkillDir(structure: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-analyzer-test-"));
    tempDirs.push(dir);

    for (const [relativePath, content] of Object.entries(structure)) {
      const absolutePath = path.join(dir, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, content, "utf-8");
    }

    return dir;
  }

  it("detects missing tests and recommends adding them", () => {
    const skillDir = createSkillDir({
      "SKILL.md": "---\nname: Writer\ncategory: article_generation\n---\n# Writer\n",
      "schemas/input.schema.json": JSON.stringify({
        type: "object",
        required: ["topic"],
        properties: { topic: { type: "string" } },
      }),
      "schemas/output.schema.json": JSON.stringify({
        type: "object",
        required: ["article"],
        properties: { article: { type: "string" } },
      }),
    });

    const result = analyzeSkillForMaintenance({
      slug: "writer-skill",
      name: "Writer Skill",
      folderPath: skillDir,
      executionMode: "llm-only",
    });

    expect(result.recommendations.some((item) => item.recommendationType === "tests-missing")).toBe(true);
    expect(result.recommendations.some((item) => item.recommendationType === "native-bundle-upgrade")).toBe(true);
    expect(result.facts.hasTests).toBe(false);
    expect(result.qualityScore).toBeLessThan(100);
    expect(result.upgradePriorityScore).toBeGreaterThanOrEqual(35);
    expect(result.parallelUpgradeEligible).toBe(true);
    expect(result.upgradePriorityTier).not.toBe("low");
  });

  it("flags a strong classic-JS skill as a GenJS migration candidate", () => {
    const skillDir = createSkillDir({
      "SKILL.md": "---\nname: Slide Planner\ncategory: slide_generation\nexecution_mode: sandbox-command\n---\nBuild slide plans and render PowerPoint artifacts with PptxGenJS.\n",
      "js/skill.js": "module.exports.respond = async () => ({ ok: true });\n",
      "schemas/input.schema.json": JSON.stringify({
        type: "object",
        required: ["layoutSpec", "normalizedContent", "slidePlan", "renderOptions"],
        properties: {
          layoutSpec: { type: "object" },
          normalizedContent: { type: "object" },
          slidePlan: { type: "array" },
          renderOptions: { type: "object" },
          themeTokens: { type: "object" },
          apiPayload: { type: "object" },
        },
      }),
      "schemas/output.schema.json": JSON.stringify({
        type: "object",
        required: ["files", "warnings", "storyboard"],
        properties: {
          files: { type: "array" },
          warnings: { type: "array" },
          storyboard: { type: "array" },
          layoutSpec: { type: "object" },
        },
      }),
      "schemas/ui.schema.json": JSON.stringify({ type: "VerticalLayout", elements: [] }),
      "tests/tests.json": JSON.stringify({ smoke: true }),
      "package.json": JSON.stringify({
        name: "slide-planner",
        dependencies: {
          pptxgenjs: "^3.12.0",
        },
      }),
    });

    const result = analyzeSkillForMaintenance({
      slug: "slide-planner",
      name: "Slide Planner",
      description: "JSON-heavy parse normalize plan render workflow for slides, layouts, artifacts, APIs, and PptxGenJS",
      folderPath: skillDir,
      executionMode: "sandbox-command",
      sandboxProfileSlug: "browser-default",
    });

    expect(result.isGenjsCandidate).toBe(true);
    expect(result.genjsCandidateScore).toBeGreaterThanOrEqual(8);
    expect(result.recommendations.some((item) => item.recommendationType === "migrate-to-genjs")).toBe(true);
  });

  it("creates a legacy upgrade recommendation even for sparse legacy skills", () => {
    const skillDir = createSkillDir({
      "SKILL.md": "---\nname: Old Skill\ncategory: automation\n---\n# Old Skill\n",
    });

    const result = analyzeSkillForMaintenance({
      slug: "old-skill",
      name: "Old Skill",
      folderPath: skillDir,
      executionMode: "llm-only",
    });

    expect(result.recommendations.some((item) => item.recommendationType === "native-bundle-upgrade")).toBe(true);
    expect(result.parallelUpgradeEligible).toBe(true);
  });

  it("flags sandbox-command skills without a sandbox profile", () => {
    const skillDir = createSkillDir({
      "SKILL.md": "---\nname: Command Skill\ncategory: automation\nexecution_mode: sandbox-command\n---\n# Command\n",
      "skill.manifest.json": JSON.stringify({ entry: "src/index.mjs" }),
      "src/index.mjs": "export async function run() { return { ok: true }; }\n",
      "schemas/input.schema.json": JSON.stringify({
        type: "object",
        properties: { payload: { type: "object" } },
      }),
      "schemas/output.schema.json": JSON.stringify({
        type: "object",
        properties: { result: { type: "object" } },
      }),
    });

    const result = analyzeSkillForMaintenance({
      slug: "command-skill",
      folderPath: skillDir,
      executionMode: "sandbox-command",
    });

    expect(result.recommendations.some((item) => item.recommendationType === "sandbox-profile-fix")).toBe(true);
  });

  it("flags native bundles that are missing subagent topology files", () => {
    const skillDir = createSkillDir({
      "SKILL.md": "---\nname: Native Skill\ndescription: Native\nversion: 1.0.0\ntarget_platform: agents_python\n---\n# Native\n",
      "skill.lock.json": JSON.stringify({
        name: "Native Skill",
        version: "1.0.0",
        target_platform: "agents_python",
        entrypoints: { run: "scripts/run.sh", verify: "scripts/verify.sh" },
        outputs: ["SKILL.md", "skill.md"],
        supported_modes: ["create", "improve", "maintenance"],
        compatibility_mirror_policy: "mirror-skill-md",
      }),
      "scripts/run.sh": "#!/usr/bin/env bash\nset -euo pipefail\n",
      "scripts/verify.sh": "#!/usr/bin/env bash\nset -euo pipefail\n",
      "references/input_contract.md": "# Input\n",
      "references/output_contract.md": "# Output\n",
      "references/maintenance.md": "# Maintenance\n",
      "MODEL_COMPATIBILITY.md": "# Model Compatibility\n",
    });

    const result = analyzeSkillForMaintenance({
      slug: "native-skill",
      name: "Native Skill",
      folderPath: skillDir,
      executionMode: "sandbox-command",
    });

    expect(result.recommendations.some((item) => item.recommendationType === "subagent-topology-missing")).toBe(true);
    expect(result.facts.hasSubagentManifest).toBe(false);
  });
});
