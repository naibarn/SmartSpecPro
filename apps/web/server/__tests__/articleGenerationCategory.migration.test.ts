import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const drizzleDir = path.resolve(import.meta.dirname, "../../drizzle");
const journalPath = path.join(drizzleDir, "meta/_journal.json");
const migrationPath = path.join(drizzleDir, "0057_article_generation_category.sql");

describe("article_generation category migration", () => {
  it("has a matching journal entry", () => {
    expect(fs.existsSync(journalPath)).toBe(true);
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    const latest = journal.entries[journal.entries.length - 1];
    expect(latest).toBeDefined();
    expect(latest.idx).toBe(57);
    expect(latest.tag).toBe("0057_article_generation_category");
  });

  it("adds article_generation to the skill_category enum", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const content = fs.readFileSync(migrationPath, "utf-8");

    expect(content).toContain("ALTER TYPE \"public\".\"skill_category\" ADD VALUE IF NOT EXISTS 'article_generation'");
    expect(content).not.toMatch(/\bDROP\s+TYPE\b/i);
  });
});
