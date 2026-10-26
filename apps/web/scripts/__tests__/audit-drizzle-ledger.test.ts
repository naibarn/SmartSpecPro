import { describe, expect, it } from "vitest";
import { classifyDrizzleLedger, selectDrizzleLedgerProfile } from "../audit-drizzle-ledger";

describe("classifyDrizzleLedger", () => {
  const journal = [
    { idx: 0, when: 100, tag: "0000_initial" },
    { idx: 1, when: 200, tag: "0001_changed" },
    { idx: 2, when: 300, tag: "0002_manual" },
  ];
  const sqlFiles = [
    { name: "0000_initial.sql", hash: "hash-a" },
    { name: "0001_changed.sql", hash: "hash-b-current" },
    { name: "0002_manual.sql", hash: "hash-c" },
    { name: "manual_legacy.sql", hash: "hash-d" },
  ];

  it("separates timestamp/hash drift, moved hashes, missing migrations, and unjournaled SQL", () => {
    const report = classifyDrizzleLedger(journal, sqlFiles, [
      { id: 1, hash: "hash-a", created_at: 100 },
      { id: 2, hash: "hash-b-old", created_at: 200 },
      { id: 3, hash: "hash-c", created_at: 999 },
      { id: 4, hash: "hash-d", created_at: 400 },
      { id: 5, hash: "hash-orphan", created_at: 500 },
    ]);

    expect(report.journalStatusCounts).toEqual({
      hash_matched_different_timestamp: 1,
      matched_timestamp_and_hash: 1,
      matched_timestamp_hash_mismatch: 1,
    });
    expect(report.journal.map(item => item.status)).toEqual([
      "matched_timestamp_and_hash",
      "matched_timestamp_hash_mismatch",
      "hash_matched_different_timestamp",
    ]);
    expect(report.ledgerStatusCounts).toEqual({
      journal_hash_other_timestamp: 1,
      journal_timestamp: 2,
      unknown_history: 1,
      unjournaled_sql_hash: 1,
    });
  });

  it("does not infer database application when the ledger is empty", () => {
    const report = classifyDrizzleLedger(journal, sqlFiles, []);
    expect(report.journalStatusCounts).toEqual({ neither_timestamp_nor_hash_matched: 3 });
    expect(report.ledgerStatusCounts).toEqual({});
  });
});

describe("selectDrizzleLedgerProfile", () => {
  it("uses the guarded active-schema journal for a marked loopback dev database", () => {
    expect(selectDrizzleLedgerProfile({
      environment: {
        NODE_ENV: "development",
        SMARTSPEC_ENVIRONMENT: "development",
        SMARTSPEC_DEV_DATABASE_MODE: "development",
      },
      databaseUrl: "postgresql://smartspec_dev:dev@localhost:5432/smartspec_dev",
    })).toBe("dev-active-baseline");
  });

  it("rejects partial dev markers and keeps production on the canonical journal", () => {
    expect(() => selectDrizzleLedgerProfile({
      environment: { NODE_ENV: "development" },
      databaseUrl: "postgresql://smartspec_dev:dev@localhost:5432/smartspec_dev",
    })).toThrow("DEV_ACTIVE_SCHEMA_TARGET_REQUIRED");
    expect(selectDrizzleLedgerProfile({
      environment: { NODE_ENV: "production", SMARTSPEC_ENVIRONMENT: "production" },
      databaseUrl: "postgresql://smartspec:secret@db.example/smartspec",
    })).toBe("canonical");
  });
});
