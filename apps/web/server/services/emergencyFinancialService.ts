import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

import {
  economicEvents,
  economicJournalEntries,
  economicLedgerAccounts,
  economicJournalLines,
  emergencyContributions,
  emergencyFundAllocations,
  emergencySupportPools,
  invoiceLineItems,
  invoices,
  payments,
} from "../../drizzle/schema";
import { getDb, type DrizzleDB } from "../db";
import { recordJournalEntry } from "./economicLedgerService";

const THB = "THB";
const SUPPORT_CLEARING_ACCOUNT = "payment_provider_clearing";
const SUPPORT_LIABILITY_ACCOUNT = "restricted_support_fund";

export class EmergencyFinancialError extends Error {
  constructor(
    readonly code:
      | "CONTRIBUTION_NOT_FOUND"
      | "POOL_NOT_FOUND"
      | "PAYMENT_NOT_FOUND"
      | "PAYMENT_TENANT_MISMATCH"
      | "PAYMENT_CONTRIBUTION_MISMATCH"
      | "PAYMENT_NOT_SETTLED"
      | "PAYMENT_SETTLEMENT_AMOUNT_MISSING"
      | "PAYMENT_AMOUNT_MISMATCH"
      | "CONTRIBUTION_AMOUNT_INVALID"
      | "CURRENCY_UNSUPPORTED"
      | "CONTRIBUTION_NOT_SETTLEABLE"
      | "CONTRIBUTION_NOT_REFUNDABLE"
      | "REFUND_REFERENCE_REQUIRED"
      | "ALLOCATION_AMOUNT_INVALID"
      | "ALLOCATION_FUNDS_INSUFFICIENT"
      | "ALLOCATION_IDEMPOTENCY_REUSED",
    message = code,
  ) {
    super(message);
    this.name = "EmergencyFinancialError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type SettleEmergencyContributionInput = {
  tenantId: string;
  contributionId: string;
  paymentId: number;
  policyVersion: string;
};

export type EmergencyContributionSettlementResult = {
  contributionId: string;
  paymentId: number;
  journalEntryId: string;
  eventId: string;
  replayed: boolean;
};

type FinancialQuery = any;

function settlementKey(contributionId: string) {
  return `emergency-contribution:settle:${contributionId}`;
}

/** Parses only exact two-decimal currency values; no floating-point settlement is allowed. */
export function thbMajorToMinorUnits(value: unknown): number | null {
  const raw = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return null;
  const whole = Number(match[1]);
  const fractional = Number((match[2] ?? "").padEnd(2, "0"));
  const minor = whole * 100 + fractional;
  return Number.isSafeInteger(minor) ? minor : null;
}

async function getOrCreateAccount(
  tx: FinancialQuery,
  input: { tenantId: string; accountType: string; ownerRef: string },
) {
  const find = () => tx.select().from(economicLedgerAccounts).where(and(
    eq(economicLedgerAccounts.tenantId, input.tenantId),
    eq(economicLedgerAccounts.accountType, input.accountType),
    eq(economicLedgerAccounts.ownerRef, input.ownerRef),
    eq(economicLedgerAccounts.currency, THB),
  )).limit(1);
  const [existing] = await find();
  if (existing) return existing;
  await tx.insert(economicLedgerAccounts).values({
    tenantId: input.tenantId,
    accountType: input.accountType,
    ownerRef: input.ownerRef,
    currency: THB,
    balanceMinorUnits: 0,
    status: "open",
  }).onConflictDoNothing();
  const [created] = await find();
  if (!created) throw new EmergencyFinancialError("POOL_NOT_FOUND", "Could not create canonical ledger account");
  return created;
}

async function loadContributionForPayment(tx: FinancialQuery, input: SettleEmergencyContributionInput) {
  const [contribution] = await tx.select().from(emergencyContributions).where(and(
    eq(emergencyContributions.id, input.contributionId),
    eq(emergencyContributions.tenantId, input.tenantId),
  )).for("update").limit(1);
  if (!contribution) throw new EmergencyFinancialError("CONTRIBUTION_NOT_FOUND");
  if (contribution.paymentRecordRef !== input.paymentId) {
    throw new EmergencyFinancialError("PAYMENT_CONTRIBUTION_MISMATCH");
  }
  const [pool] = await tx.select().from(emergencySupportPools).where(and(
    eq(emergencySupportPools.id, contribution.poolId),
    eq(emergencySupportPools.tenantId, input.tenantId),
  )).for("update").limit(1);
  if (!pool) throw new EmergencyFinancialError("POOL_NOT_FOUND");
  const [payment] = await tx.select().from(payments).where(eq(payments.id, input.paymentId)).for("update").limit(1);
  if (!payment) throw new EmergencyFinancialError("PAYMENT_NOT_FOUND");
  const [invoice] = await tx.select({ tenantId: invoices.tenantId }).from(invoices)
    .where(eq(invoices.id, payment.invoiceId)).for("update").limit(1);
  if (!invoice || invoice.tenantId !== input.tenantId) {
    throw new EmergencyFinancialError("PAYMENT_TENANT_MISMATCH");
  }
  if (payment.currency !== THB || contribution.currency !== THB || pool.currency !== THB) {
    throw new EmergencyFinancialError("CURRENCY_UNSUPPORTED");
  }
  return { contribution, pool, payment };
}

function assertPaidContribution(input: {
  contribution: { amountMinorUnits: bigint | number };
  payment: { status: string; settledAmount: unknown; settledCurrency: string | null };
}) {
  if (input.payment.status !== "paid") throw new EmergencyFinancialError("PAYMENT_NOT_SETTLED");
  if (input.payment.settledCurrency?.trim().toUpperCase() !== THB) throw new EmergencyFinancialError("CURRENCY_UNSUPPORTED", "Provider settlement currency must be explicitly THB");
  const contributionMinorUnits = Number(input.contribution.amountMinorUnits);
  if (!Number.isSafeInteger(contributionMinorUnits) || contributionMinorUnits <= 0) {
    throw new EmergencyFinancialError("CONTRIBUTION_AMOUNT_INVALID");
  }
  const settledMinor = thbMajorToMinorUnits(input.payment.settledAmount);
  if (settledMinor === null) throw new EmergencyFinancialError("PAYMENT_SETTLEMENT_AMOUNT_MISSING");
  if (settledMinor !== contributionMinorUnits) {
    throw new EmergencyFinancialError("PAYMENT_AMOUNT_MISMATCH");
  }
  return settledMinor;
}

async function findEvent(tx: FinancialQuery, tenantId: string, idempotencyKey: string) {
  const [event] = await tx.select().from(economicEvents).where(and(
    eq(economicEvents.tenantId, tenantId),
    eq(economicEvents.idempotencyKey, idempotencyKey),
  )).limit(1);
  return event ?? null;
}

async function findJournal(tx: FinancialQuery, tenantId: string, idempotencyKey: string) {
  const [journal] = await tx.select().from(economicJournalEntries).where(and(
    eq(economicJournalEntries.tenantId, tenantId),
    eq(economicJournalEntries.idempotencyKey, idempotencyKey),
  )).limit(1);
  return journal ?? null;
}

/**
 * Posts a verified THB contribution as debit provider clearing / credit the
 * pool's restricted-support liability. The contribution row remains a
 * reference/projection and never becomes a second money balance.
 */
export async function settleEmergencyContributionInTransaction(
  tx: FinancialQuery,
  input: SettleEmergencyContributionInput,
): Promise<EmergencyContributionSettlementResult> {
  if (!input.policyVersion.trim() || input.policyVersion.length > 64) {
    throw new EmergencyFinancialError("CONTRIBUTION_NOT_SETTLEABLE", "Financial policy version is required");
  }
  const { contribution, pool, payment } = await loadContributionForPayment(tx, input);
  const amountMinorUnits = assertPaidContribution({ contribution, payment });
  const journalIdempotencyKey = settlementKey(contribution.id);
  const eventIdempotencyKey = `${journalIdempotencyKey}:event`;
  const existingEvent = await findEvent(tx, input.tenantId, eventIdempotencyKey);
  if (existingEvent) {
    const journal = await findJournal(tx, input.tenantId, journalIdempotencyKey);
    if (!journal) throw new EmergencyFinancialError("CONTRIBUTION_NOT_SETTLEABLE", "Settlement event has no journal");
    return { contributionId: contribution.id, paymentId: payment.id, journalEntryId: journal.id, eventId: existingEvent.id, replayed: true };
  }
  if (!["pending", "authorized", "settled"].includes(contribution.status)) {
    throw new EmergencyFinancialError("CONTRIBUTION_NOT_SETTLEABLE");
  }

  const clearingAccount = await getOrCreateAccount(tx, {
    tenantId: input.tenantId, accountType: SUPPORT_CLEARING_ACCOUNT, ownerRef: `payment:${payment.provider}`,
  });
  const supportAccount = await getOrCreateAccount(tx, {
    tenantId: input.tenantId, accountType: SUPPORT_LIABILITY_ACCOUNT, ownerRef: `pool:${pool.id}`,
  });
  const journal = await recordJournalEntry(tx, {
    tenantId: input.tenantId,
    idempotencyKey: journalIdempotencyKey,
    description: `Emergency support contribution ${contribution.id}`,
    lines: [
      { tenantId: input.tenantId, accountId: clearingAccount.id, currency: THB, debitMinorUnits: amountMinorUnits, creditMinorUnits: 0 },
      { tenantId: input.tenantId, accountId: supportAccount.id, currency: THB, debitMinorUnits: 0, creditMinorUnits: amountMinorUnits },
    ],
  });
  const [event] = await tx.insert(economicEvents).values({
    tenantId: input.tenantId,
    eventType: "emergency_contribution_settled",
    idempotencyKey: eventIdempotencyKey,
    actorId: `payment:${payment.id}`,
    policyVersion: input.policyVersion,
    payloadJson: { contributionId: contribution.id, poolId: pool.id, paymentId: payment.id, journalEntryId: journal.id, amountMinorUnits, currency: THB },
  }).returning({ id: economicEvents.id });
  if (!event) throw new EmergencyFinancialError("CONTRIBUTION_NOT_SETTLEABLE", "Settlement event was not persisted");
  await tx.update(emergencyContributions).set({ status: "settled", updatedAt: new Date() }).where(and(
    eq(emergencyContributions.id, contribution.id),
    eq(emergencyContributions.tenantId, input.tenantId),
  ));
  return { contributionId: contribution.id, paymentId: payment.id, journalEntryId: journal.id, eventId: event.id, replayed: journal.replayed };
}

export async function settleEmergencyContribution(
  database: DrizzleDB,
  input: SettleEmergencyContributionInput,
) {
  return database.transaction(tx => settleEmergencyContributionInTransaction(tx, input));
}

/** Convenience entrypoint for callers that do not already own a transaction. */
export async function settleEmergencyContributionFromDatabase(input: SettleEmergencyContributionInput) {
  return settleEmergencyContribution(getDb(), input);
}

/** Replays every emergency contribution associated with a verified paid payment. */
export async function settleEmergencyContributionsForPayment(
  database: DrizzleDB,
  input: { paymentId: number; policyVersion: string },
) {
  let contributions = await database.select({ tenantId: emergencyContributions.tenantId, contributionId: emergencyContributions.id })
    .from(emergencyContributions).where(eq(emergencyContributions.paymentRecordRef, input.paymentId));
  if (contributions.length === 0) {
    const [payment] = await database.select().from(payments).where(eq(payments.id, input.paymentId)).limit(1);
    if (!payment || payment.status !== "paid") return [];
    const [invoice] = await database.select({ id: invoices.id, tenantId: invoices.tenantId }).from(invoices)
      .where(eq(invoices.id, payment.invoiceId)).limit(1);
    if (!invoice) return [];
    const lines = await database.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoice.id));
    for (const line of lines) {
      const metadata = line.metadataJson && typeof line.metadataJson === "object" ? line.metadataJson : {};
      if (line.itemType !== "emergency_contribution") continue;
      if (metadata.program !== "spec260_emergency_support" || typeof metadata.contributionRef !== "string" || typeof metadata.poolRef !== "string") {
        throw new EmergencyFinancialError("CONTRIBUTION_NOT_SETTLEABLE", "Emergency invoice line lacks canonical contribution references");
      }
      await database.transaction(async tx => {
        const [contribution] = await tx.select().from(emergencyContributions).where(and(
          eq(emergencyContributions.tenantId, invoice.tenantId), eq(emergencyContributions.id, metadata.contributionRef as string),
        )).for("update").limit(1);
        if (!contribution || !["pending", "authorized", "settled"].includes(contribution.status)) {
          throw new EmergencyFinancialError("CONTRIBUTION_NOT_FOUND");
        }
        const [pool] = await tx.select().from(emergencySupportPools).where(and(
          eq(emergencySupportPools.tenantId, invoice.tenantId), eq(emergencySupportPools.id, contribution.poolId),
          eq(emergencySupportPools.publicRef, metadata.poolRef as string),
        )).limit(1);
        if (!pool || contribution.currency !== THB || pool.currency !== THB ||
            thbMajorToMinorUnits(line.amount) !== Number(contribution.amountMinorUnits)) {
          throw new EmergencyFinancialError("PAYMENT_AMOUNT_MISMATCH", "Invoice line does not match its restricted support contribution");
        }
        if (contribution.paymentRecordRef !== null && contribution.paymentRecordRef !== payment.id) {
          throw new EmergencyFinancialError("PAYMENT_CONTRIBUTION_MISMATCH");
        }
        await tx.update(emergencyContributions).set({ paymentRecordRef: payment.id,
          paymentIntentRef: payment.providerPaymentId ?? payment.providerReferenceId, status: "authorized", updatedAt: new Date() })
          .where(and(eq(emergencyContributions.id, contribution.id), eq(emergencyContributions.tenantId, invoice.tenantId)));
      });
    }
    contributions = await database.select({ tenantId: emergencyContributions.tenantId, contributionId: emergencyContributions.id })
      .from(emergencyContributions).where(eq(emergencyContributions.paymentRecordRef, input.paymentId));
  }
  const results: EmergencyContributionSettlementResult[] = [];
  for (const contribution of contributions) {
    results.push(await settleEmergencyContribution(database, {
      tenantId: contribution.tenantId,
      contributionId: contribution.contributionId,
      paymentId: input.paymentId,
      policyVersion: input.policyVersion,
    }));
  }
  return results;
}

export type AllocateEmergencySupportInput = {
  tenantId: string;
  poolRef: string;
  purposeCode: string;
  restriction: string;
  amountMinorUnits: number;
  actorUserId: number;
  idempotencyKey: string;
};

/** Reclassifies settled restricted pool liability into an earmarked allocation through the canonical journal. */
export async function allocateEmergencySupportInTransaction(tx: FinancialQuery, input: AllocateEmergencySupportInput) {
  if (!Number.isSafeInteger(input.amountMinorUnits) || input.amountMinorUnits <= 0 || input.amountMinorUnits > 100_000_000) {
    throw new EmergencyFinancialError("ALLOCATION_AMOUNT_INVALID");
  }
  if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 200) {
    throw new EmergencyFinancialError("ALLOCATION_IDEMPOTENCY_REUSED");
  }
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:emergency-fund-allocation:${input.idempotencyKey}`}, 0))`);
  const [pool] = await tx.select().from(emergencySupportPools).where(and(
    eq(emergencySupportPools.tenantId, input.tenantId), eq(emergencySupportPools.publicRef, input.poolRef),
  )).for("update").limit(1);
  if (!pool) throw new EmergencyFinancialError("POOL_NOT_FOUND");
  const [prior] = await tx.select().from(emergencyFundAllocations).where(and(
    eq(emergencyFundAllocations.tenantId, input.tenantId), eq(emergencyFundAllocations.idempotencyKey, input.idempotencyKey),
  )).limit(1);
  if (prior) {
    if (prior.poolId !== pool.id || prior.purposeCode !== input.purposeCode || Number(prior.amountMinorUnits) !== input.amountMinorUnits || prior.restriction !== input.restriction) {
      throw new EmergencyFinancialError("ALLOCATION_IDEMPOTENCY_REUSED");
    }
    return { allocationId: prior.id, journalEntryId: prior.journalEntryId, replayed: true };
  }
  if (pool.status !== "active" || pool.currency !== THB) throw new EmergencyFinancialError("POOL_NOT_FOUND");
  const restrictedAccount = await getOrCreateAccount(tx, { tenantId: input.tenantId,
    accountType: SUPPORT_LIABILITY_ACCOUNT, ownerRef: `pool:${pool.id}` });
  const [balance] = await tx.select({ available: sql<string>`COALESCE(sum(${economicJournalLines.creditMinorUnits} - ${economicJournalLines.debitMinorUnits}), 0)::text` })
    .from(economicJournalLines).innerJoin(economicJournalEntries, and(
      eq(economicJournalEntries.id, economicJournalLines.entryId), eq(economicJournalEntries.tenantId, economicJournalLines.tenantId),
    )).where(and(eq(economicJournalLines.tenantId, input.tenantId), eq(economicJournalLines.accountId, restrictedAccount.id), eq(economicJournalEntries.status, "posted")));
  const availableMinorUnits = Number(balance?.available ?? 0);
  if (!Number.isSafeInteger(availableMinorUnits) || input.amountMinorUnits > availableMinorUnits) {
    throw new EmergencyFinancialError("ALLOCATION_FUNDS_INSUFFICIENT");
  }
  const id = randomUUID();
  const allocationAccount = await getOrCreateAccount(tx, { tenantId: input.tenantId,
    accountType: "restricted_support_allocation", ownerRef: `allocation:${id}` });
  const journal = await recordJournalEntry(tx, { tenantId: input.tenantId,
    idempotencyKey: `emergency-fund-allocation:${input.idempotencyKey}`,
    description: `Restricted emergency support allocation ${id}`,
    lines: [
      { tenantId: input.tenantId, accountId: restrictedAccount.id, currency: THB, debitMinorUnits: input.amountMinorUnits, creditMinorUnits: 0 },
      { tenantId: input.tenantId, accountId: allocationAccount.id, currency: THB, debitMinorUnits: 0, creditMinorUnits: input.amountMinorUnits },
    ],
  });
  await tx.insert(emergencyFundAllocations).values({ id, tenantId: input.tenantId, poolId: pool.id,
    purposeCode: input.purposeCode, restriction: input.restriction, amountMinorUnits: BigInt(input.amountMinorUnits),
    currency: THB, status: "active", journalEntryId: journal.id, idempotencyKey: input.idempotencyKey,
    createdByUserId: input.actorUserId });
  await tx.insert(economicEvents).values({ tenantId: input.tenantId, eventType: "emergency_fund_allocated",
    idempotencyKey: `emergency-fund-allocation:${input.idempotencyKey}:event`, actorId: `user:${input.actorUserId}`,
    policyVersion: "spec260-restricted-funds-v1", payloadJson: { allocationId: id, poolId: pool.id,
      purposeCode: input.purposeCode, amountMinorUnits: input.amountMinorUnits, currency: THB, journalEntryId: journal.id } });
  return { allocationId: id, journalEntryId: journal.id, replayed: false };
}

export async function allocateEmergencySupport(database: DrizzleDB, input: AllocateEmergencySupportInput) {
  return database.transaction(tx => allocateEmergencySupportInTransaction(tx, input));
}
