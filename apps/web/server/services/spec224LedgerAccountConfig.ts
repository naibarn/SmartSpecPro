import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { economicEvents, economicHolds, economicLedgerAccounts, systemSettings } from "../../drizzle/schema";
import type { DrizzleDB } from "../db";
import { provisionEconomicLedgerAccount } from "./economicProvisioningService";

const CATEGORY = "spec224_ledger_accounts";

export type Spec224LedgerAccountPair = {
  debitAccountId: string;
  creditAccountId: string;
};

type EnsureLedgerPairDependencies = {
  readPair: typeof readSpec224LedgerAccountPair;
  provision: typeof provisionEconomicLedgerAccount;
  configure: typeof configureSpec224LedgerAccountPair;
};

export class Spec224LedgerConfigurationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "Spec224LedgerConfigurationError";
  }
}

function settingKey(tenantId: string, currency: string) {
  return `${tenantId}:${currency.trim().toUpperCase()}`;
}

async function validatePair(
  database: DrizzleDB,
  tenantId: string,
  currency: string,
  pair: Spec224LedgerAccountPair,
) {
  const debitId = pair.debitAccountId.trim();
  const creditId = pair.creditAccountId.trim();
  if (!debitId || !creditId || debitId === creditId) {
    throw new Spec224LedgerConfigurationError("SPEC224_LEDGER_ACCOUNT_PAIR_INVALID");
  }
  const rows = await database.select({
    id: economicLedgerAccounts.id,
    tenantId: economicLedgerAccounts.tenantId,
    currency: economicLedgerAccounts.currency,
    status: economicLedgerAccounts.status,
  }).from(economicLedgerAccounts).where(inArray(economicLedgerAccounts.id, [debitId, creditId]));
  if (rows.length !== 2 || rows.some(row => row.tenantId !== tenantId
    || row.currency.toUpperCase() !== currency.toUpperCase() || row.status !== "open")) {
    throw new Spec224LedgerConfigurationError("SPEC224_LEDGER_ACCOUNT_SCOPE_INVALID");
  }
  return { debitAccountId: debitId, creditAccountId: creditId };
}

export async function listSpec224LedgerAccounts(database: DrizzleDB, tenantId: string, currency = "USD") {
  return database.select({
    id: economicLedgerAccounts.id,
    accountType: economicLedgerAccounts.accountType,
    ownerRef: economicLedgerAccounts.ownerRef,
    currency: economicLedgerAccounts.currency,
    status: economicLedgerAccounts.status,
  }).from(economicLedgerAccounts).where(and(
    eq(economicLedgerAccounts.tenantId, tenantId),
    eq(economicLedgerAccounts.currency, currency.trim().toUpperCase()),
    eq(economicLedgerAccounts.status, "open"),
  ));
}

export async function readSpec224LedgerAccountPair(database: DrizzleDB, tenantId: string, currency = "USD") {
  const key = settingKey(tenantId, currency);
  const [setting] = await database.select({ valueJson: systemSettings.valueJson })
    .from(systemSettings).where(and(eq(systemSettings.category, CATEGORY), eq(systemSettings.key, key))).limit(1);
  const configured = setting?.valueJson as Partial<Spec224LedgerAccountPair> | null | undefined;
  let pair = configured?.debitAccountId && configured?.creditAccountId
    ? { debitAccountId: configured.debitAccountId, creditAccountId: configured.creditAccountId }
    : null;
  // Keep legacy single-tenant deployments working while migrating them to an
  // explicit tenant mapping. The pair is still checked against this tenant.
  if (!pair) {
    const debitAccountId = process.env.SMARTSPEC_ECONOMIC_RESERVE_DEBIT_ACCOUNT_ID?.trim();
    const creditAccountId = process.env.SMARTSPEC_ECONOMIC_RESERVE_CREDIT_ACCOUNT_ID?.trim();
    if (debitAccountId && creditAccountId) pair = { debitAccountId, creditAccountId };
  }
  if (!pair) return null;
  return validatePair(database, tenantId, currency, pair);
}

export async function configureSpec224LedgerAccountPair(
  database: DrizzleDB,
  input: { tenantId: string; currency?: string; actorId: number; pair: Spec224LedgerAccountPair },
) {
  const currency = (input.currency ?? "USD").trim().toUpperCase();
  const pair = await validatePair(database, input.tenantId, currency, input.pair);
  return database.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`spec224-ledger:${input.tenantId}:${currency}`}))`);
    const active = await tx.select({ id: economicHolds.id }).from(economicHolds).where(and(
      eq(economicHolds.tenantId, input.tenantId), eq(economicHolds.status, "held"),
    )).limit(1);
    if (active.length) throw new Spec224LedgerConfigurationError("SPEC224_LEDGER_CONFIG_ACTIVE_HOLD");
    const key = settingKey(input.tenantId, currency);
    const [existing] = await tx.select({ id: systemSettings.id, valueJson: systemSettings.valueJson }).from(systemSettings).where(and(
      eq(systemSettings.category, CATEGORY), eq(systemSettings.key, key),
    )).limit(1);
    const values = {
      valueJson: { ...pair, tenantId: input.tenantId, currency, configuredAt: new Date().toISOString() },
      isSensitive: false,
      description: "Tenant-scoped SPEC-224 development-run reserve ledger accounts",
      updatedBy: input.actorId,
      updatedAt: new Date(),
    };
    if (existing) {
      await tx.update(systemSettings).set(values).where(eq(systemSettings.id, existing.id));
    } else {
      await tx.insert(systemSettings).values({ category: CATEGORY, key, ...values });
    }
    await tx.insert(economicEvents).values({
      tenantId: input.tenantId,
      eventType: "spec224.ledger_accounts.configured",
      idempotencyKey: `spec224-ledger-config:${currency}:${randomUUID()}`,
      actorId: String(input.actorId),
      policyVersion: "spec224-ledger-config-v1",
      payloadJson: {
        currency,
        previous: existing?.valueJson ?? null,
        configured: pair,
      },
    });
    return { ...pair, tenantId: input.tenantId, currency, configured: true };
  });
}

/**
 * Provision the internal, zero-balance journal accounts used only to record
 * SPEC-224 run-budget holds. These accounts are not user wallets and must not
 * be presented as a source of user funds.
 */
export async function ensureSpec224LedgerAccountPair(
  database: DrizzleDB,
  input: { tenantId: string; actorId: number; currency?: string },
  dependencies: EnsureLedgerPairDependencies = {
    readPair: readSpec224LedgerAccountPair,
    provision: provisionEconomicLedgerAccount,
    configure: configureSpec224LedgerAccountPair,
  },
) {
  const currency = (input.currency ?? "USD").trim().toUpperCase();
  const authorization = { tenantId: input.tenantId, actorId: input.actorId, role: "admin" };
  try {
    const configured = await dependencies.readPair(database, input.tenantId, currency);
    if (configured) return { configured, initialized: false };
  } catch (error) {
    if (!(error instanceof Spec224LedgerConfigurationError)) throw error;
    // A stale/invalid mapping can be repaired to the stable SPEC-224 accounts.
    // configureSpec224LedgerAccountPair still prevents changing it under a hold.
  }

  const [debit, credit] = await Promise.all([
    dependencies.provision(database, {
      authorization,
      ownerType: "tenant",
      accountType: "spec224_reserve_debit",
      currency,
      idempotencyKey: `spec224-ledger-debit:${input.tenantId}:${currency}`,
    }),
    dependencies.provision(database, {
      authorization,
      ownerType: "tenant",
      accountType: "spec224_reserve_credit",
      currency,
      idempotencyKey: `spec224-ledger-credit:${input.tenantId}:${currency}`,
    }),
  ]);
  const configured = await dependencies.configure(database, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    currency,
    pair: { debitAccountId: debit.accountId, creditAccountId: credit.accountId },
  });
  return { configured, initialized: true };
}
