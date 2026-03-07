import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const skillPath = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "skills",
  "parenting-article-writer",
  "SKILL.md",
);

describe("parenting-article-writer skill prompt", () => {
  it("includes TTS-safe instructions that forbid special-symbol shorthand", () => {
    const content = fs.readFileSync(skillPath, "utf-8");
    expect(content).toContain("text-to-speech");
    expect(content).toContain("Do **not** use special symbols");
    expect(content).toContain("`/` → use `or` in English, `หรือ` in Thai");
  });

  it("requires plain_text output to return plain text instead of JSON", () => {
    const content = fs.readFileSync(skillPath, "utf-8");
    expect(content).toContain("If `response_mode: standard_article` and `output_format: plain_text`, return **plain text only**.");
    expect(content).toContain("Do **not** return JSON.");
  });
});
