import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const drizzleDir = path.resolve(import.meta.dirname, "../../drizzle");
const journalPath = path.join(drizzleDir, "meta/_journal.json");
const migrationPath = path.join(drizzleDir, "0300_character_prompt_generation_category.sql");

describe("character prompt generation category migration", () => {
  it("has a matching journal entry", () => {
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as {
      entries: Array<{ idx: number; tag: string; version?: string; when?: number; breakpoints?: boolean }>;
    };

    const entry = journal.entries.find((item) => item.tag === "0300_character_prompt_generation_category");
    expect(entry?.idx).toBe(286);
    expect(entry).toBeDefined();
  });

  it("adds the category without recreating or dropping the enum", () => {
    const content = fs.readFileSync(migrationPath, "utf-8");
    expect(content).toContain("ADD VALUE IF NOT EXISTS 'character_prompt_generation'");
    expect(content).not.toMatch(/\b(DROP|CREATE)\s+TYPE\b/i);
  });
});
