import { economicBudgets, economicLedgerAccounts } from "../../../../drizzle/schema";
import type { DrizzleDB } from "../../db";
import { recordJournalEntry } from "../../economicLedgerService";

/** Test-only economic fixture provisioner. It cannot target non-loopback DBs. */
export async function provisionSpec224EconomicTestBudget(
  database: DrizzleDB,
  input: { tenantId: string; scopeId: string; limitMinorUnits: number },
) {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("SPEC224_TEST_DB_REQUIRED");
  const url = new URL(rawUrl);
  const databaseName = url.pathname.replace(/^\/+/, "");
  if (!/^(localhost|127\.0\.0\.1)$/.test(url.hostname) || !/^spec224_[a-z0-9_-]*_test$/i.test(databaseName)) {
    throw new Error("SPEC224_TEST_DB_OUT_OF_SCOPE");
  }
  if (!input.tenantId || !input.scopeId || !Number.isSafeInteger(input.limitMinorUnits) || input.limitMinorUnits <= 0) {
    throw new Error("SPEC224_TEST_PROVISIONING_INPUT_INVALID");
  }

  return database.transaction(async tx => {
    const sourceRef = `${input.scopeId}-source`;
    const targetRef = `${input.scopeId}-target`;
    const [source] = await tx.insert(economicLedgerAccounts).values({
      tenantId: input.tenantId,
      accountType: "test_source",
      ownerRef: sourceRef,
      currency: "USD",
    }).returning({ id: economicLedgerAccounts.id });
    const [target] = await tx.insert(economicLedgerAccounts).values({
      tenantId: input.tenantId,
      accountType: "test_budget",
      ownerRef: targetRef,
      currency: "USD",
    }).returning({ id: economicLedgerAccounts.id });
    const [budget] = await tx.insert(economicBudgets).values({
      tenantId: input.tenantId,
      scopeType: "spec224_test",
      scopeRef: input.scopeId,
      currency: "USD",
      limitMinorUnits: input.limitMinorUnits,
    }).returning({ id: economicBudgets.id });

    // Test-only balanced journal evidence. This is not an account balance
    // update, funding operation, or production credit grant.
    await recordJournalEntry(tx, {
      tenantId: input.tenantId,
      idempotencyKey: `test-provision:${input.scopeId}`,
      description: "Disposable Spec 224 economic integration fixture",
      lines: [
        { accountId: source.id, tenantId: input.tenantId, currency: "USD", debitMinorUnits: input.limitMinorUnits, creditMinorUnits: 0 },
        { accountId: target.id, tenantId: input.tenantId, currency: "USD", debitMinorUnits: 0, creditMinorUnits: input.limitMinorUnits },
      ],
    });
    return { budgetId: budget.id, sourceAccountId: source.id, targetAccountId: target.id };
  });
}
