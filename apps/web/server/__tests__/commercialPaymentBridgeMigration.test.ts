import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  commercialPaymentRefunds,
  commercialPaymentAttempts,
  commercialPaymentRequests,
  commercialSettlements,
  commercialSpendingLimits,
  commercialUsageReceipts,
} from "../../drizzle/schema";

const root = resolve(import.meta.dirname, "../..");

describe("SPEC-207/280 commercial payment additive migration", () => {
  it("registers migration 0408 after canonical migration 0407", () => {
    const journal = JSON.parse(
      readFileSync(resolve(root, "drizzle/meta/_journal.json"), "utf8")
    );
    expect(journal.entries.at(-1)).toMatchObject({
      idx: 408,
      tag: "0408_spec207_280_commercial_payment_bridge",
    });
    expect(journal.entries.at(-2)).toMatchObject({
      idx: 407,
      tag: "0407_spec229_projection_shard_identity",
    });
  });

  it("creates only additive tables and preserves existing Credits/payment records", () => {
    const sql = readFileSync(
      resolve(root, "drizzle/0408_spec207_280_commercial_payment_bridge.sql"),
      "utf8"
    );
    for (const table of [
      "commercial_spending_limits",
      "commercial_payment_requests",
      "commercial_payment_attempts",
      "commercial_usage_receipts",
      "commercial_settlements",
      "commercial_ledger_postings",
      "commercial_payment_refunds",
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(sql).not.toMatch(
      /\b(ALTER\s+TABLE|UPDATE\s+(credit_transactions|payments|payment_attempts)|DELETE\s+FROM|DROP\s+TABLE)\b/i
    );
    expect(sql).toContain("UNIQUE (task_id, sequence)");
    expect(sql).toContain("fencing_token integer NOT NULL DEFAULT 1");
    expect(sql).toContain("authorization_unknown");
  });

  it("exposes matching typed schema without repurposing legacy tables", () => {
    expect(commercialPaymentRequests.taskId).toBeDefined();
    expect(commercialPaymentAttempts.providerRef).toBeDefined();
    expect(commercialUsageReceipts.idempotencyKey).toBeDefined();
    expect(commercialSettlements.allocationSnapshotJson).toBeDefined();
    expect(commercialSpendingLimits.globalCapMinor).toBeDefined();
    expect(commercialPaymentRefunds.settlementId).toBeDefined();
  });
});
