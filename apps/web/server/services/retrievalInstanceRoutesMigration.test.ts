import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "../..");
const migration = readFileSync(
  resolve(webRoot, "drizzle/0405_spec229_retrieval_instance_routes.sql"),
  "utf8"
);
const journal = JSON.parse(
  readFileSync(resolve(webRoot, "drizzle/meta/_journal.json"), "utf8")
) as { entries: Array<{ tag: string; idx: number }> };

describe("SPEC-229 retrieval instance route migration", () => {
  it("persists the canonical route registry with tenant, fanout and JSON shape guards", () => {
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS "retrieval_instance_routes"'
    );
    expect(migration).toContain('REFERENCES "tenants"("id") ON DELETE CASCADE');
    expect(migration).toContain('UNIQUE ("tenant_id", "environment")');
    expect(migration).toContain(
      'jsonb_array_length("instance_ids") BETWEEN 1 AND 10'
    );
    expect(migration).toContain(
      "jsonb_typeof(\"source_class_routes\") = 'object'"
    );
    expect(journal.entries.at(-1)).toMatchObject({
      idx: 405,
      tag: "0405_spec229_retrieval_instance_routes",
    });
  });
});
