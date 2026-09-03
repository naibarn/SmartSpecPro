import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const drizzleDir = path.resolve(import.meta.dirname, "../../drizzle");
const migrationPath = path.join(
  drizzleDir,
  "0274_nano_banana_2_reference_limits.sql"
);
const journalPath = path.join(drizzleDir, "meta/_journal.json");
const seedPath = path.resolve(
  import.meta.dirname,
  "../../scripts/seed-media-models-kie-ai.ts"
);

describe("Nano Banana reference-image limits", () => {
  it("registers the targeted migration after the special tie-in debug events migration", () => {
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    expect(journal.entries.at(-1)).toMatchObject({
      idx: 260,
      tag: "0274_nano_banana_2_reference_limits",
    });
  });

  it("updates only the two Nano Banana catalog rows to 14 references", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).toContain(
      `WHERE "modelId" IN ('google-banana-2', 'google-banana-2-lite')`
    );
    expect(sql).toContain(`'{maxReferenceImages}'`);
    expect(sql).toContain(`'14'::jsonb`);
    expect(sql).toContain(`'{inputFields,0,maxItems}'`);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\s+"media_models"/i);
    expect(sql).not.toContain("gpt-image-2-text-to-image");
  });

  it("keeps the seed metadata at 14 without changing GPT Image 2's 16-image contract", () => {
    const seed = fs.readFileSync(seedPath, "utf8");
    const nanoStart = seed.indexOf('modelId: "google-banana-2"');
    const liteStart = seed.indexOf('modelId: "google-banana-2-lite"');
    const nextModelStart = seed.indexOf(
      'modelId: "google/pro-image-to-image"',
      liteStart
    );
    const nanoBlock = seed.slice(nanoStart, liteStart);
    const liteBlock = seed.slice(liteStart, nextModelStart);
    const gptStart = seed.indexOf('modelId: "gpt-image-2-text-to-image"');
    const gptNextModelStart = seed.indexOf(
      'modelId: "google/imagen4"',
      gptStart
    );
    const gptBlock = seed.slice(gptStart, gptNextModelStart);

    expect(nanoBlock).toContain("maxReferenceImages: 14");
    expect(nanoBlock).toContain("maxItems: 14");
    expect(liteBlock).toContain("maxReferenceImages: 14");
    expect(liteBlock).toContain("maxItems: 14");
    expect(gptBlock).toContain("maxReferenceImages: 16");
  });
});
