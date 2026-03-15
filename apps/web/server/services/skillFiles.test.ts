import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { buildUpdatedSkillManifest, updateSkillManifestFiles } from "./skillFiles";

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
});
