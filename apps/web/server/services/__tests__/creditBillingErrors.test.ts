import { describe, expect, it } from "vitest";
import {
  CreditLedgerPersistenceError,
  extractCreditDatabaseErrorDetails,
  isCreditDatabaseError,
  isInsufficientCreditError,
  normalizeCreditTransactionDescription,
  isRetryableCreditDatabaseError,
} from "../creditBillingErrors";
import { normalizeSkillSettlementRunId } from "../skillRevenueBilling";

describe("creditBillingErrors", () => {
  it("extracts PostgreSQL details through nested causes", () => {
    const cause = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "credit_transactions_idempotency_key_unique",
      detail: "Key (idempotencyKey) already exists.",
    });
    const error = new Error("Failed query", { cause });

    expect(extractCreditDatabaseErrorDetails(error)).toEqual({
      code: "23505",
      constraint: "credit_transactions_idempotency_key_unique",
      detail: "Key (idempotencyKey) already exists.",
      table: null,
      column: null,
      schema: null,
    });
  });

  it("marks transient database failures as retryable", () => {
    expect(
      isRetryableCreditDatabaseError({
        code: "40001",
        message: "serialization failure",
      })
    ).toBe(true);
    expect(
      isRetryableCreditDatabaseError({
        code: "23505",
        message: "unique violation",
      })
    ).toBe(false);
    expect(isCreditDatabaseError("Skill run id is already bound to a different execution")).toBe(false);
    expect(isCreditDatabaseError("Failed query: insert into credit_transactions")).toBe(true);
  });

  it("keeps ledger failures separate from real insufficient-credit errors", () => {
    expect(isInsufficientCreditError("Insufficient credits. Required: 2")).toBe(
      true
    );
    expect(
      isInsufficientCreditError(
        "CREDIT_LEDGER_WRITE_FAILED: credit_transactions"
      )
    ).toBe(false);
    expect(
      new CreditLedgerPersistenceError(
        "user charge",
        new Error("database unavailable")
      ).code
    ).toBe("CREDIT_LEDGER_WRITE_FAILED");
  });

  it("hashes oversized deterministic skill run IDs consistently", () => {
    const longRunId = "บริบทฉากและพรอมป์|".repeat(40);
    const normalized = normalizeSkillSettlementRunId(longRunId);
    expect(normalized).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(normalizeSkillSettlementRunId(longRunId)).toBe(normalized);
    expect(normalizeSkillSettlementRunId("short-run")).toBe("short-run");
  });

  it("bounds ledger descriptions without losing a readable truncation marker", () => {
    const normalized = normalizeCreditTransactionDescription("x".repeat(700));
    expect(normalized).toHaveLength(512);
    expect(normalized).toMatch(/… \[truncated\]$/);
    expect(normalizeCreditTransactionDescription("สั้น ๆ")).toBe("สั้น ๆ");
  });
});
