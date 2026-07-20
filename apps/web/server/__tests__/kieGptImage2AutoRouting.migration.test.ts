import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const drizzleDir = path.resolve(import.meta.dirname, "../../drizzle");
const migrationPath = path.join(
  drizzleDir,
  "0212_kie_gpt_image_2_auto_routing.sql",
);
const journalPath = path.join(drizzleDir, "meta/_journal.json");
const seedPath = path.resolve(
  import.meta.dirname,
  "../../scripts/seed-media-models-kie-ai.ts",
);

describe("Kie GPT Image 2 automatic mode routing", () => {
  it("registers migration 0212 in the Drizzle journal", () => {
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const latest = journal.entries[journal.entries.length - 1];

    expect(latest).toMatchObject({
      idx: 198,
      tag: "0212_kie_gpt_image_2_auto_routing",
    });
  });

  it("keeps one enabled canonical row and disables the legacy image-to-image row", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).toContain("'gpt-image-2-text-to-image'");
    expect(sql).toContain("'gpt-image-2-image-to-image'");
    expect(sql).toContain('"kie_model_id_with_references"');
    expect(sql).toContain('"reference_image_input_key": "input_urls"');
    expect(sql).toMatch(
      /"isEnabled" = false[\s\S]*?WHERE "modelId" = 'gpt-image-2-image-to-image'/i,
    );
    expect(sql).not.toMatch(/\bDELETE\s+FROM\s+"media_models"/i);
  });

  it("keeps the seed catalog aligned with the unified row", () => {
    const seed = fs.readFileSync(seedPath, "utf8");
    const canonicalStart = seed.indexOf(
      'modelId: "gpt-image-2-text-to-image"',
    );
    const nextModelStart = seed.indexOf(
      'modelId: "google/imagen4"',
      canonicalStart,
    );
    const gptImage2Block = seed.slice(canonicalStart, nextModelStart);

    expect(canonicalStart).toBeGreaterThan(-1);
    expect(nextModelStart).toBeGreaterThan(canonicalStart);
    expect(gptImage2Block).toContain('name: "GPT Image 2"');
    expect(gptImage2Block).toContain(
      'kie_model_id_with_references: "gpt-image-2-image-to-image"',
    );
    expect(gptImage2Block).toContain(
      'key: "input_urls", label: "Reference Images"',
    );
    expect(gptImage2Block).not.toContain(
      'modelId: "gpt-image-2-image-to-image"',
    );
  });
});
