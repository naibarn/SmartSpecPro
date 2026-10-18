import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "../..");
const migration = readFileSync(
  resolve(webRoot, "drizzle/0406_spec229_rag_projection_items.sql"),
  "utf8"
);
const journal = JSON.parse(
  readFileSync(resolve(webRoot, "drizzle/meta/_journal.json"), "utf8")
) as { entries: Array<{ tag: string; idx: number }> };

describe("SPEC-229 RAG projection migration", () => {
  it("persists tenant-owned projection state with canonical identity and safety constraints", () => {
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS "rag_projection_items"'
    );
    expect(migration).toContain('REFERENCES "tenants"("id") ON DELETE CASCADE');
    expect(migration).toContain('"source_version" varchar(160) NOT NULL');
    expect(migration).toContain('"projection_part" varchar(128) NOT NULL');
    expect(migration).toContain('CHECK (octet_length("acl_scope") <= 64)');
    expect(migration).toContain(
      'CHECK ("projection_bytes" BETWEEN 1 AND 4000000)'
    );
    expect(migration).toContain('UNIQUE ("tenant_id", "projection_key")');
    expect(journal.entries.at(-1)).toMatchObject({
      idx: 406,
      tag: "0406_spec229_rag_projection_items",
    });
  });
});
