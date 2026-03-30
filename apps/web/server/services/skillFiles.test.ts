import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildUpdatedSkillManifest,
  resolveRelativeSkillManifestPath,
  resolveSkillBundleDir,
  resolveSkillManifestPath,
  updateSkillManifestFiles,
} from "./skillFiles";

describe("skillFiles", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("updates manifest frontmatter without changing the markdown body", () => {
    const original = `---
name: Demo Skill
description: Original description
category: article_generation
tags:
  - demo
---
# Demo

Body text
`;

    const updated = buildUpdatedSkillManifest(original, {
      category: "product_review",
      description: "Updated description",
    });

    expect(updated).toContain("category: product_review");
    expect(updated).toContain("description: Updated description");
    expect(updated).toContain("# Demo\n\nBody text");
  });

  it("writes both skill.md aliases when updating a manifest on disk", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-files-test-"));
    tempDirs.push(tempDir);

    fs.writeFileSync(path.join(tempDir, "skill.md"), `---
name: Demo Skill
category: article_generation
---
# Demo
`, "utf-8");

    const result = updateSkillManifestFiles(tempDir, { category: "product_review" });

    expect(result.content).toContain("category: product_review");
    expect(fs.readFileSync(path.join(tempDir, "skill.md"), "utf-8")).toContain("category: product_review");
    expect(fs.readFileSync(path.join(tempDir, "SKILL.md"), "utf-8")).toContain("category: product_review");
  });

  it("resolves nested shared-bundle skill manifests one level below the slug folder", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-files-nested-test-"));
    tempDirs.push(tempDir);

    const slugDir = path.join(tempDir, "modern-editorial-slide");
    const bundleDir = path.join(slugDir, "modern_editorial_slide_skill");
    fs.mkdirSync(bundleDir, { recursive: true });
    fs.writeFileSync(path.join(bundleDir, "SKILL.md"), `---
name: modern-editorial-slide
category: slide_generation
execution_mode: sandbox-command
---
# Demo
`, "utf-8");
    fs.writeFileSync(path.join(bundleDir, "skill.manifest.json"), JSON.stringify({ entry: "src/index.mjs" }), "utf-8");

    expect(resolveSkillBundleDir(slugDir)).toBe(bundleDir);
    expect(resolveSkillManifestPath(slugDir)).toBe(path.join(bundleDir, "SKILL.md"));
  });

  it("returns the nested relative manifest path for shared-bundle skill folders", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-files-relative-test-"));
    tempDirs.push(tempDir);

    const originalCwd = process.cwd();
    const slugDir = path.join(tempDir, "skills", "modern-editorial-slide");
    const bundleDir = path.join(slugDir, "modern_editorial_slide_skill");
    fs.mkdirSync(bundleDir, { recursive: true });
    fs.writeFileSync(path.join(bundleDir, "SKILL.md"), `---
name: modern-editorial-slide
category: slide_generation
---
# Demo
`, "utf-8");

    process.chdir(tempDir);
    try {
      expect(resolveRelativeSkillManifestPath("skills/modern-editorial-slide"))
        .toBe("skills/modern-editorial-slide/modern_editorial_slide_skill/SKILL.md");
    } finally {
      process.chdir(originalCwd);
    }
  });
});
