import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const drizzleDir = path.resolve(import.meta.dirname, "../../drizzle");
const migrationPath = path.join(
  drizzleDir,
  "0215_seedream_5_pro_auto_routing.sql"
);
const repricingMigrationPath = path.join(
  drizzleDir,
  "0216_seedream_5_pro_real_pricing.sql"
);
const journalPath = path.join(drizzleDir, "meta/_journal.json");
const seedPath = path.resolve(
  import.meta.dirname,
  "../../scripts/seed-media-models-kie-ai.ts"
);

describe("Kie Seedream 5.0 Pro automatic mode routing", () => {
  it("registers the auto-routing migration in the journal", () => {
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const entry = journal.entries.find(
      e => e.tag === "0215_seedream_5_pro_auto_routing"
    );

    expect(entry).toMatchObject({
      idx: 201,
      tag: "0215_seedream_5_pro_auto_routing",
    });
  });

  it("inserts a single unified Seedream 5.0 Pro row without deleting any data", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).toContain("'seedream/5-pro-text-to-image'");
    expect(sql).toContain("seedream/5-pro-image-to-image");
    expect(sql).toContain('"kie_model_id_with_references"');
    expect(sql).toContain('"image_urls"');
    expect(sql).not.toMatch(/\bDELETE\s+FROM\s+"media_models"/i);
  });

  it("keeps the seed catalog aligned with the unified row", () => {
    const seed = fs.readFileSync(seedPath, "utf8");
    const canonicalStart = seed.indexOf(
      'modelId: "seedream/5-pro-text-to-image"'
    );
    const nextModelStart = seed.indexOf(
      'modelId: "ideogram/character"',
      canonicalStart
    );
    const seedreamProBlock = seed.slice(canonicalStart, nextModelStart);

    expect(canonicalStart).toBeGreaterThan(-1);
    expect(nextModelStart).toBeGreaterThan(canonicalStart);
    expect(seedreamProBlock).toContain('name: "Seedream 5.0 Pro"');
    expect(seedreamProBlock).toContain(
      'kie_model_id_with_references: "seedream/5-pro-image-to-image"'
    );
    expect(seedreamProBlock).toContain("maxPromptLength: 5000");
    expect(seedreamProBlock).toContain("maxReferenceImages: 10");
    expect(seedreamProBlock).toContain("maxItems: 10");
    expect(seedreamProBlock).not.toContain(
      'modelId: "seedream/5-pro-image-to-image"'
    );
  });

  it("seeds the real Kie AI provider pricing (not the 0215 estimate)", () => {
    const seed = fs.readFileSync(seedPath, "utf8");
    const canonicalStart = seed.indexOf(
      'modelId: "seedream/5-pro-text-to-image"'
    );
    const nextModelStart = seed.indexOf(
      'modelId: "ideogram/character"',
      canonicalStart
    );
    const seedreamProBlock = seed.slice(canonicalStart, nextModelStart);

    expect(seedreamProBlock).toContain("creditCost: 70");
    expect(seedreamProBlock).toContain(
      'pricingTiers: { "basic": 35, "high": 70 }'
    );
    expect(seedreamProBlock).not.toContain("creditCost: 75");
    expect(seedreamProBlock).not.toMatch(/pricingTiers:[^}]*\b55\b/);
    expect(seedreamProBlock).not.toMatch(/pricingTiers:[^}]*\b75\b/);
  });

  it("registers the 0216 real-pricing correction migration in the journal", () => {
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const entry = journal.entries.find(
      e => e.tag === "0216_seedream_5_pro_real_pricing"
    );

    expect(entry).toMatchObject({
      idx: 202,
      tag: "0216_seedream_5_pro_real_pricing",
    });
  });

  it("0216 targets only the unified Seedream 5.0 Pro row with corrected pricing", () => {
    const sql = fs.readFileSync(repricingMigrationPath, "utf8");

    expect(sql).toContain("'seedream/5-pro-text-to-image'");
    expect(sql).toMatch(/WHERE\s+"modelId"\s*=\s*'seedream\/5-pro-text-to-image'/);
    expect(sql).toContain('"creditCost" = 70');
    expect(sql).toContain("{pricingTiers,basic}");
    expect(sql).toContain("{pricingTiers,high}");
    expect(sql).toContain("'35'::jsonb");
    expect(sql).toContain("'70'::jsonb");
    expect(sql).not.toMatch(/\bDELETE\s+FROM\s+"media_models"/i);
  });
});
