import { describe, expect, it, vi } from "vitest";
import {
  EconomicLedgerError,
  assertBalancedJournalLines,
  recordJournalEntry,
  type EconomicJournalLineInput,
} from "../economicLedgerService";

const balancedLines: EconomicJournalLineInput[] = [
  {
    accountId: "account-debit",
    tenantId: "tenant-1",
    currency: "USD",
    debitMinorUnits: 100,
    creditMinorUnits: 0,
  },
  {
    accountId: "account-credit",
    tenantId: "tenant-1",
    currency: "USD",
    debitMinorUnits: 0,
    creditMinorUnits: 100,
  },
];

describe("economicLedgerService", () => {
  it("accepts a balanced same-currency journal", () => {
    expect(assertBalancedJournalLines(balancedLines)).toEqual({
      currency: "USD",
      totalMinorUnits: 100,
    });
  });

  it("rejects unbalanced, mixed-currency, and cross-tenant lines", () => {
    expect(() =>
      assertBalancedJournalLines([
        ...balancedLines,
        { ...balancedLines[0], accountId: "extra", debitMinorUnits: 1 },
      ])
    ).toThrowError(new EconomicLedgerError("LEDGER_UNBALANCED"));

    expect(() =>
      assertBalancedJournalLines([
        balancedLines[0],
        { ...balancedLines[1], currency: "THB" },
      ])
    ).toThrowError(new EconomicLedgerError("LEDGER_CURRENCY_MISMATCH"));

    expect(() =>
      assertBalancedJournalLines([
        balancedLines[0],
        { ...balancedLines[1], tenantId: "tenant-2" },
      ])
    ).toThrowError(new EconomicLedgerError("LEDGER_TENANT_MISMATCH"));
  });

  it("rejects a line that carries both debit and credit", () => {
    expect(() =>
      assertBalancedJournalLines([
        { ...balancedLines[0], creditMinorUnits: 1 },
        balancedLines[1],
      ])
    ).toThrowError(new EconomicLedgerError("LEDGER_LINE_INVALID"));
  });

  it("writes an append-only entry and replays an existing idempotency key", async () => {
    const where = vi.fn(() => "where");
    const limit = vi.fn(async () => []);
    const insertValues = vi.fn(() => ({
      returning: vi.fn(async () => [{ id: "entry-1" }]),
    }));
    const lineInsertValues = vi.fn(async () => []);
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ limit })) })),
      })),
      insert: vi
        .fn()
        .mockImplementationOnce(() => ({ values: insertValues }))
        .mockImplementationOnce(() => ({ values: lineInsertValues })),
    };

    const result = await recordJournalEntry(tx as never, {
      tenantId: "tenant-1",
      idempotencyKey: "journal-1",
      correlation: { jobId: "job-1", attemptId: "attempt-1" },
      description: "test",
      lines: balancedLines,
    });

    expect(result).toMatchObject({ id: "entry-1", replayed: false });
    expect(insertValues).toHaveBeenCalledTimes(1);
    expect(lineInsertValues).toHaveBeenCalledTimes(1);
    expect(where).not.toHaveBeenCalled();
  });
});
