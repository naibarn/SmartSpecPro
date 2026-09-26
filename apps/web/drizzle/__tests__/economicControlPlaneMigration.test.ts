import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  __dirname,
  "../0340_feature_207_economic_control_plane.sql"
);
const schemaPath = path.resolve(__dirname, "../schema.ts");

describe("Feature 207 economic control plane persistence contract", () => {
  const migration = fs.readFileSync(migrationPath, "utf8");
  const schema = fs.readFileSync(schemaPath, "utf8");

  it("keeps the migration forward-only and creates the canonical tables", () => {
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE|INDEX)\b/i);
    for (const table of [
      "economic_intents",
      "economic_budgets",
      "economic_holds",
      "economic_ledger_accounts",
      "economic_journal_entries",
      "economic_journal_lines",
      "economic_events",
      "economic_reconciliations",
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS \"${table}\"`);
    }
  });

  it("enforces tenant-scoped idempotency and balanced-line invariants", () => {
    expect(migration).toContain("economic_intents_tenant_idempotency_unique");
    expect(migration).toContain(
      "economic_journal_entries_tenant_idempotency_unique"
    );
    expect(migration).toContain("economic_journal_lines_one_side_check");
    expect(migration).toContain("economic_journal_lines_nonnegative_check");
    expect(migration).toContain("economic_holds_amounts_check");
  });

  it("exports the same canonical tables from Drizzle schema", () => {
    for (const exportName of [
      "economicIntents",
      "economicBudgets",
      "economicHolds",
      "economicLedgerAccounts",
      "economicJournalEntries",
      "economicJournalLines",
      "economicEvents",
      "economicReconciliations",
    ]) {
      expect(schema).toContain(`export const ${exportName}`);
    }
  });
});
