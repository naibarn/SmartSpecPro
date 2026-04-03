import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import AdmZip from "adm-zip";

import {
  buildUpdatedSkillManifest,
  extractZipToDirectory,
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

  it("keeps top-level markdown docs as the registry manifest when a nested command bundle also exists", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-files-nested-bundle-test-"));
    tempDirs.push(tempDir);

    const slugDir = path.join(tempDir, "editorial-layout-planner");
    const bundleDir = path.join(slugDir, "editorial_layout_planner_skill");
    fs.mkdirSync(bundleDir, { recursive: true });
    fs.writeFileSync(path.join(slugDir, "SKILL.md"), `---
name: editorial-layout-planner
category: slide_generation
execution_mode: llm-only
---
# Top-level docs
`, "utf-8");
    fs.writeFileSync(path.join(bundleDir, "SKILL.md"), `---
name: editorial-layout-planner
category: slide_generation
execution_mode: sandbox-command
---
# Bundle manifest
`, "utf-8");
    fs.writeFileSync(path.join(bundleDir, "skill.manifest.json"), JSON.stringify({ entry: "src/index.mjs" }), "utf-8");

    expect(resolveSkillBundleDir(slugDir)).toBe(bundleDir);
    expect(resolveSkillManifestPath(slugDir)).toBe(path.join(slugDir, "SKILL.md"));
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

  it("flattens a single wrapper folder when extracting a ZIP bundle", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-files-extract-test-"));
    tempDirs.push(tempDir);

    const destinationDir = path.join(tempDir, "skills", "demo-skill");
    const zip = new AdmZip();
    zip.addFile("demo-skill/SKILL.md", Buffer.from(`# Demo Skill\n`, "utf-8"));
    zip.addFile("demo-skill/schemas/input.schema.json", Buffer.from(`{}`, "utf-8"));

    const result = extractZipToDirectory(zip, destinationDir);

    expect(result.flattenedWrapperDir).toBe("demo-skill");
    expect(result.extractedEntries).toEqual(["SKILL.md", "schemas"]);
    expect(fs.existsSync(path.join(destinationDir, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(destinationDir, "schemas", "input.schema.json"))).toBe(true);
    expect(fs.existsSync(path.join(destinationDir, "demo-skill"))).toBe(false);
  });

  it("ignores ZIP metadata files when deciding whether to flatten the wrapper folder", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-files-extract-macos-test-"));
    tempDirs.push(tempDir);

    const destinationDir = path.join(tempDir, "skills", "demo-skill");
    const zip = new AdmZip();
    zip.addFile(".DS_Store", Buffer.from("", "utf-8"));
    zip.addFile("demo-skill/SKILL.md", Buffer.from(`# Demo Skill\n`, "utf-8"));

    const result = extractZipToDirectory(zip, destinationDir);

    expect(result.flattenedWrapperDir).toBe("demo-skill");
    expect(fs.existsSync(path.join(destinationDir, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(destinationDir, ".DS_Store"))).toBe(false);
  });
});
