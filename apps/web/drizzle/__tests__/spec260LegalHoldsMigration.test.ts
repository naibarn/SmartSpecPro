import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(import.meta.dirname, "../0376_spec260_emergency_legal_holds.sql"), "utf8");
const schema = readFileSync(resolve(import.meta.dirname, "../schema.ts"), "utf8");
const journal = JSON.parse(readFileSync(resolve(import.meta.dirname, "../meta/_journal.json"), "utf8")) as {
  entries: Array<{ idx: number; tag: string }>;
};

describe("Spec260 legal hold persistence contract", () => {
  it("journals the additive migration after the current Spec260 baseline", () => {
    expect(journal.entries.at(-1)).toEqual({ idx: 362, version: "7", when: 1790530000012,
      tag: "0376_spec260_emergency_legal_holds", breakpoints: true });
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "emergency_legal_holds"');
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "emergency_evidence_tenant_case_id_unique"');
  });

  it("keeps tenant, case, and optional evidence scope referentially consistent", () => {
    expect(migration).toContain('FOREIGN KEY ("tenantId", "caseId") REFERENCES "emergency_cases"("tenantId", "id")');
    expect(migration).toContain('FOREIGN KEY ("tenantId", "caseId", "evidenceId") REFERENCES "emergency_evidence_assets"("tenantId", "caseId", "id")');
    expect(schema).toContain('export const emergencyLegalHolds = pgTable(');
    expect(schema).toContain('check("emergency_legal_hold_release_check"');
  });
});
