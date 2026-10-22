import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  CONTENT_COMPOSER_MIGRATION,
  selectContentComposerSchemaSql,
} from "./content-composer-schema-repair";

describe("content composer targeted schema repair", () => {
  it("accepts only the exact additive statements from the orphaned migration", async () => {
    const source = await readFile(
      new URL("../drizzle/0121_content_composer_drafts.sql", import.meta.url),
      "utf8"
    );
    const statements = selectContentComposerSchemaSql([source]);
    expect(statements).toHaveLength(CONTENT_COMPOSER_MIGRATION.statements);
    expect(statements.at(-1)).toContain(
      'ADD COLUMN IF NOT EXISTS "mediaAttachments" json'
    );
    expect(statements).toEqual(
      expect.not.arrayContaining([
        expect.stringMatching(/^\s*(DROP|TRUNCATE|DELETE|UPDATE)\b/i),
      ])
    );
  });

  it("refuses altered or unexpected migration sources", () => {
    expect(() =>
      selectContentComposerSchemaSql([
        "ALTER TABLE public.users DROP COLUMN id",
      ])
    ).toThrow("SCHEMA_SOURCE_HASH_MISMATCH");
    expect(() => selectContentComposerSchemaSql([])).toThrow(
      "SCHEMA_SOURCE_HASH_MISMATCH"
    );
  });
});
