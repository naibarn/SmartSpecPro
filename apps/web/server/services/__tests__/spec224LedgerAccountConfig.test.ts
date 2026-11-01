import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureSpec224LedgerAccountPair,
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
  it("automatically provisions and binds the internal reserve pair without asking for account selection", async () => {
    const readPair = vi.fn().mockResolvedValue(null);
    const provision = vi.fn()
      .mockResolvedValueOnce({ accountId: "reserve-debit" })
      .mockResolvedValueOnce({ accountId: "reserve-credit" });
    const configure = vi.fn().mockResolvedValue({
      debitAccountId: "reserve-debit",
      creditAccountId: "reserve-credit",
      configured: true,
    });

    const result = await ensureSpec224LedgerAccountPair({} as any, {
      tenantId: "tenant-a",
      actorId: 42,
    }, { readPair, provision: provision as any, configure: configure as any });

    expect(result).toMatchObject({ initialized: true, configured: { configured: true } });
    expect(provision).toHaveBeenCalledTimes(2);
    expect(provision).toHaveBeenCalledWith({}, expect.objectContaining({
      ownerType: "tenant",
      accountType: "spec224_reserve_debit",
      currency: "USD",
      idempotencyKey: "spec224-ledger-debit:tenant-a:USD",
    }));
    expect(configure).toHaveBeenCalledWith({}, expect.objectContaining({
      tenantId: "tenant-a",
      pair: { debitAccountId: "reserve-debit", creditAccountId: "reserve-credit" },
    }));
  });

  it("does not recreate an already configured internal pair", async () => {
    const readPair = vi.fn().mockResolvedValue({ debitAccountId: "d", creditAccountId: "c" });
    const provision = vi.fn();
    const configure = vi.fn();

    const result = await ensureSpec224LedgerAccountPair({} as any, {
      tenantId: "tenant-a",
      actorId: 42,
    }, { readPair, provision: provision as any, configure: configure as any });

    expect(result).toEqual({ configured: { debitAccountId: "d", creditAccountId: "c" }, initialized: false });
    expect(provision).not.toHaveBeenCalled();
    expect(configure).not.toHaveBeenCalled();
  });

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
