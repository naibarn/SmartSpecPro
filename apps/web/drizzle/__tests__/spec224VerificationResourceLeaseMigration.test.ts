import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(import.meta.dirname, "../0382_spec224_verification_resource_leases.sql"),
  "utf8"
);
const journal = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../meta/_journal.json"), "utf8")
) as { entries: Array<{ idx: number; tag: string }> };
const snapshot = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../meta/0149_snapshot.json"), "utf8")
) as { tables: Record<string, { columns: Record<string, unknown>; indexes: Record<string, unknown> }> };

describe("Spec 224 verification resource lease migration", () => {
  it("adds the expiring repository lease table without destructive DDL", () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "spec224_verification_leases"');
    expect(migration).toContain('"ownerTokenHash" varchar(64) NOT NULL');
    expect(migration).toContain('"fencingVersion" integer NOT NULL DEFAULT 1');
    expect(migration).toContain('"leaseExpiresAt" timestamptz NOT NULL');
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX)\b/i);
  });

  it("registers migration 0382 directly after the existing journal head", () => {
    expect(journal.entries.at(-1)).toEqual({
      idx: 368,
      version: "7",
      when: 1790530000018,
      tag: "0382_spec224_verification_resource_leases",
      breakpoints: true,
    });
  });

  it("includes the same lease table in the Drizzle snapshot", () => {
    const table = snapshot.tables["public.spec224_verification_leases"];
    expect(table).toBeDefined();
    expect(Object.keys(table.columns)).toEqual(
      expect.arrayContaining([
        "repositoryKey",
        "ownerTokenHash",
        "fencingVersion",
        "heartbeatAt",
        "leaseExpiresAt",
      ])
    );
    expect(table.indexes).toHaveProperty("spec224_verification_leases_expiry_idx");
  });
});
