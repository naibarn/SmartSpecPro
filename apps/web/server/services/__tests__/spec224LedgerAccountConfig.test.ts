import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readSpec224LedgerAccountPair,
} from "../spec224LedgerAccountConfig";

const oldDebit = process.env.SMARTSPEC_ECONOMIC_RESERVE_DEBIT_ACCOUNT_ID;
const oldCredit = process.env.SMARTSPEC_ECONOMIC_RESERVE_CREDIT_ACCOUNT_ID;

function fakeDatabase(setting: unknown, accounts: unknown[]) {
  return {
    select: vi.fn((projection: Record<string, unknown>) => {
      const isSettingRead = Object.keys(projection).includes("valueJson");
      return {
        from: () => ({
          where: () => isSettingRead
            ? { limit: async () => setting ? [setting] : [] }
            : Promise.resolve(accounts),
        }),
      };
    }),
  } as any;
}

afterEach(() => {
  if (oldDebit === undefined) delete process.env.SMARTSPEC_ECONOMIC_RESERVE_DEBIT_ACCOUNT_ID;
  else process.env.SMARTSPEC_ECONOMIC_RESERVE_DEBIT_ACCOUNT_ID = oldDebit;
  if (oldCredit === undefined) delete process.env.SMARTSPEC_ECONOMIC_RESERVE_CREDIT_ACCOUNT_ID;
  else process.env.SMARTSPEC_ECONOMIC_RESERVE_CREDIT_ACCOUNT_ID = oldCredit;
});

describe("SPEC-224 tenant ledger account mapping", () => {
  it("resolves a configured pair only when both accounts belong to the tenant and currency", async () => {
    delete process.env.SMARTSPEC_ECONOMIC_RESERVE_DEBIT_ACCOUNT_ID;
    delete process.env.SMARTSPEC_ECONOMIC_RESERVE_CREDIT_ACCOUNT_ID;
    const database = fakeDatabase({ valueJson: { debitAccountId: "debit", creditAccountId: "credit" } }, [
      { id: "debit", tenantId: "tenant-a", currency: "USD", status: "open" },
      { id: "credit", tenantId: "tenant-a", currency: "USD", status: "open" },
    ]);
    await expect(readSpec224LedgerAccountPair(database, "tenant-a", "USD"))
      .resolves.toEqual({ debitAccountId: "debit", creditAccountId: "credit" });
  });

  it("rejects a global legacy environment pair that crosses tenant scope", async () => {
    process.env.SMARTSPEC_ECONOMIC_RESERVE_DEBIT_ACCOUNT_ID = "debit";
    process.env.SMARTSPEC_ECONOMIC_RESERVE_CREDIT_ACCOUNT_ID = "credit";
    const database = fakeDatabase(null, [
      { id: "debit", tenantId: "tenant-a", currency: "USD", status: "open" },
      { id: "credit", tenantId: "tenant-b", currency: "USD", status: "open" },
    ]);
    await expect(readSpec224LedgerAccountPair(database, "tenant-a", "USD"))
      .rejects.toMatchObject({ code: "SPEC224_LEDGER_ACCOUNT_SCOPE_INVALID" });
  });

  it("returns no pair until an admin configures one", async () => {
    delete process.env.SMARTSPEC_ECONOMIC_RESERVE_DEBIT_ACCOUNT_ID;
    delete process.env.SMARTSPEC_ECONOMIC_RESERVE_CREDIT_ACCOUNT_ID;
    await expect(readSpec224LedgerAccountPair(fakeDatabase(null, []), "tenant-a", "USD"))
      .resolves.toBeNull();
  });
});
