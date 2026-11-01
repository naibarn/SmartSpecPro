import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { economicEvents, economicHolds, economicLedgerAccounts, systemSettings } from "../../drizzle/schema";
import type { DrizzleDB } from "../db";

const CATEGORY = "spec224_ledger_accounts";

export type Spec224LedgerAccountPair = {
  debitAccountId: string;
  creditAccountId: string;
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
