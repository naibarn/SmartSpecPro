import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const skillRoot = path.resolve(
  process.cwd(),
  "skills/modern-editorial-slide/modern_editorial_slide_skill",
);

describe("modern-editorial-slide skill bundle", () => {
  it("references bundle files that actually exist", () => {
    const manifestPath = path.join(skillRoot, "skill.manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      entry?: string;
      skillFile?: string;
      schemas?: Record<string, string>;
    };

    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(typeof manifest.entry).toBe("string");
    expect(typeof manifest.skillFile).toBe("string");

    for (const relativePath of [
      manifest.entry,
      manifest.skillFile,
      ...Object.values(manifest.schemas ?? {}),
    ]) {
      expect(typeof relativePath).toBe("string");
      expect(fs.existsSync(path.join(skillRoot, relativePath!))).toBe(true);
    }
  });
});
