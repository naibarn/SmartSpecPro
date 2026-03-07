import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const drizzleDir = path.resolve(import.meta.dirname, "../../drizzle");
const journalPath = path.join(drizzleDir, "meta/_journal.json");
const migrationPath = path.join(drizzleDir, "0058_prompt_media_generation_categories.sql");
describe("prompt media generation category migration", () => {
  it("has a matching journal entry", () => {
    expect(fs.existsSync(journalPath)).toBe(true);
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    const latest = journal.entries[journal.entries.length - 1];
    expect(latest).toBeDefined();
    expect(latest.idx).toBe(58);
    expect(latest.tag).toBe("0058_prompt_media_generation_categories");
  });

  it("adds image and video prompt generation categories to the enum", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const content = fs.readFileSync(migrationPath, "utf-8");

    expect(content).toContain("'image_prompt_generation'");
    expect(content).toContain("'video_prompt_generation'");
    expect(content).not.toMatch(/\bDROP\s+TYPE\b/i);
  });
});
