import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.resolve(__dirname, "../0243_vertical_drama_visual_sources.sql"),
  "utf8"
);
const expansionMigration = fs.readFileSync(
  path.resolve(__dirname, "../0244_vertical_drama_prompt_expansion.sql"),
  "utf8"
);
const schema = fs.readFileSync(path.resolve(__dirname, "../schema.ts"), "utf8");

describe("Feature 160 visual source persistence", () => {
  it("creates all additive visual source tables", () => {
    for (const table of [
      "vertical_drama_source_media_segments",
      "vertical_drama_visual_source_snapshots",
      "vertical_drama_news_claims",
      "vertical_drama_news_evidence_revisions",
      "vertical_drama_shot_broll_bindings",
    ]) {
      expect(migration).toContain(
        'CREATE TABLE IF NOT EXISTS "' + table + '"'
      );
    }
  });

  it("keeps tenant ownership, revisions, and lookup indexes", () => {
    expect(migration).toContain('"tenantId" varchar(36) NOT NULL');
    expect(migration).toContain('"userId" integer NOT NULL');
    for (const indexName of [
      "vds_source_segments_revision_unique",
      "vds_visual_snapshot_fingerprint_idx",
      "vds_news_claim_revision_unique",
      "vds_news_evidence_revision_unique",
      "vds_shot_broll_lookup_idx",
    ]) {
      expect(migration).toContain(indexName);
    }
  });

  it("does not delete or cascade into canonical media assets", () => {
    expect(migration).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE/i);
    expect(migration).toContain(
      '"mediaAssetId" bigint REFERENCES "media_assets"("id") ON DELETE SET NULL'
    );
  });

  it("keeps ORM exports aligned with migration tables", () => {
    for (const exportName of [
      "verticalDramaSourceMediaSegments",
      "verticalDramaVisualSourceSnapshots",
      "verticalDramaNewsClaims",
      "verticalDramaNewsEvidenceRevisions",
      "verticalDramaShotBrollBindings",
    ]) {
      expect(schema).toContain("export const " + exportName);
    }
  });

  it("adds a CAS-safe prompt expansion run ledger without destructive SQL", () => {
    expect(expansionMigration).toContain('CREATE TABLE IF NOT EXISTS "vertical_drama_prompt_expansion_runs"');
    expect(expansionMigration).toContain("originalPromptHash");
    expect(expansionMigration).toContain("vds_prompt_expansion_idempotency_unique");
    expect(expansionMigration).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE/i);
    expect(schema).toContain("export const verticalDramaPromptExpansionRuns");
  });
});
