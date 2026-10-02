import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(import.meta.dirname, "../0377_spec260_public_alert_geometry.sql"), "utf8");
const schema = readFileSync(resolve(import.meta.dirname, "../schema.ts"), "utf8");
const journal = JSON.parse(readFileSync(resolve(import.meta.dirname, "../meta/_journal.json"), "utf8")) as {
  entries: Array<{ idx: number; tag: string }>;
};

describe("Spec260 public alert area persistence", () => {
  it("adds the public geometry column in the next additive journal entry", () => {
    expect(journal.entries.at(-1)).toMatchObject({ idx: 363, tag: "0377_spec260_public_alert_geometry" });
    expect(migration).toContain('ALTER TABLE "emergency_public_alerts"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "publicGeometryJson" jsonb');
    expect(schema).toContain('publicGeometryJson: jsonb("publicGeometryJson")');
  });
});
