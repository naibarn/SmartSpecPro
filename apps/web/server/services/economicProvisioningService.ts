import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  economicBudgets,
  economicEvents,
  economicLedgerAccounts,
  workerJobs,
} from "../../drizzle/schema";
import type { DrizzleDB } from "../db";

export class EconomicProvisioningError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "EconomicProvisioningError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type EconomicProvisioningAuthorization = {
  tenantId: string;
  actorId: number;
  role: string;
};

export type AuthorizedEconomicProvisioningContext = {
  tenantId: string;
  actorId: string;
  actorType: "admin" | "system_agent";
  policyVersion: "economic-provisioning-admin-v1";
};

export function authorizeEconomicProvisioning(
  input: EconomicProvisioningAuthorization,
): AuthorizedEconomicProvisioningContext {
  const tenantId = input.tenantId.trim();
  if (!tenantId || !Number.isSafeInteger(input.actorId) || input.actorId <= 0)
    throw new EconomicProvisioningError("ECONOMIC_PROVISIONING_SCOPE_REQUIRED");
  if (input.role !== "admin" && input.role !== "system_agent")
    throw new EconomicProvisioningError("ECONOMIC_PROVISIONING_FORBIDDEN");
  return {
    tenantId,
    actorId: String(input.actorId),
    actorType: input.role,
    policyVersion: "economic-provisioning-admin-v1",
  };
}

export function deriveEconomicOwnerRef(
  context: Pick<AuthorizedEconomicProvisioningContext, "tenantId" | "actorId">,
  ownerType: "tenant" | "user",
): string {
  if (ownerType === "tenant") return `tenant:${context.tenantId}`;
  if (ownerType === "user") return `user:${context.actorId}`;
  throw new EconomicProvisioningError("ECONOMIC_PROVISIONING_OWNER_INVALID");
}

export function normalizeEconomicProvisioningMoney(input: {
  currency: string;
  limitMinorUnits: number;
}): { currency: string; limitMinorUnits: number } {
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency) || !Number.isSafeInteger(input.limitMinorUnits)
    || input.limitMinorUnits < 0 || input.limitMinorUnits > Number.MAX_SAFE_INTEGER) {
    throw new EconomicProvisioningError("ECONOMIC_PROVISIONING_MONEY_INVALID");
  }
  return { currency, limitMinorUnits: input.limitMinorUnits };
}

function validateIdempotencyKey(value: string): string {
  const key = value.trim();
  if (key.length < 8 || key.length > 128) throw new EconomicProvisioningError("ECONOMIC_PROVISIONING_IDEMPOTENCY_INVALID");
  return key;
}

function sameJson(left: unknown, right: unknown): boolean {
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, child]) => [key, canonicalize(child)]));
    }
    return value;
  };
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function stableResourceId(kind: string, identity: Record<string, string>): string {
  const hex = createHash("sha256").update(JSON.stringify(["smartaihub:economic-provisioning:v1", kind, identity])).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function insertProvisioningEvent(
  tx: any,
  context: AuthorizedEconomicProvisioningContext,
  eventType: "ledger_account.provisioned" | "budget.provisioned",
  idempotencyKey: string,
  resourceId: string,
  request: Record<string, unknown>,
  workerJobId?: string,
) {
  const eventIdempotencyKey = `provision:${eventType}:${idempotencyKey}`;
  const payloadJson = { resourceId, request };
  const [inserted] = await tx.insert(economicEvents).values({
    tenantId: context.tenantId,
    eventType,
    idempotencyKey: eventIdempotencyKey,
    workerJobId,
    actorId: context.actorId,
    policyVersion: context.policyVersion,
    payloadJson,
  }).onConflictDoNothing().returning({ id: economicEvents.id });
  if (inserted) return { replayed: false };

  const [prior] = await tx.select().from(economicEvents).where(and(
    eq(economicEvents.tenantId, context.tenantId),
    eq(economicEvents.idempotencyKey, eventIdempotencyKey),
  )).limit(1);
  if (!prior || prior.eventType !== eventType || !sameJson(prior.payloadJson, payloadJson))
    throw new EconomicProvisioningError("ECONOMIC_PROVISIONING_IDEMPOTENCY_CONFLICT");
  return { replayed: true };
}

export async function provisionEconomicLedgerAccount(
  database: DrizzleDB,
  input: {
    authorization: EconomicProvisioningAuthorization;
    ownerType: "tenant" | "user";
    accountType: string;
    currency: string;
    idempotencyKey: string;
  },
) {
  const context = authorizeEconomicProvisioning(input.authorization);
  const ownerRef = deriveEconomicOwnerRef(context, input.ownerType);
  const accountType = input.accountType.trim().toLowerCase();
  const currency = input.currency.trim().toUpperCase();
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
  if (!/^[a-z][a-z0-9_]{1,31}$/.test(accountType) || accountType.startsWith("test_") || !/^[A-Z]{3}$/.test(currency))
    throw new EconomicProvisioningError("ECONOMIC_PROVISIONING_ACCOUNT_INVALID");

  return database.transaction(async tx => {
    const [existing] = await tx.select().from(economicLedgerAccounts).where(and(
      eq(economicLedgerAccounts.tenantId, context.tenantId),
      eq(economicLedgerAccounts.accountType, accountType),
      eq(economicLedgerAccounts.ownerRef, ownerRef),
      eq(economicLedgerAccounts.currency, currency),
    )).for("update").limit(1);
    if (existing && existing.status !== "open")
      throw new EconomicProvisioningError("ECONOMIC_PROVISIONING_ACCOUNT_NOT_OPEN");
    const accountId = existing?.id ?? stableResourceId("ledger_account", {
      tenantId: context.tenantId, accountType, ownerRef, currency,
    });
    const request = { ownerType: input.ownerType, ownerRef, accountType, currency };
    const audit = await insertProvisioningEvent(
      tx, context, "ledger_account.provisioned", idempotencyKey, accountId, request,
    );
    let account = existing;
    if (!account) {
      const [created] = await tx.insert(economicLedgerAccounts).values({
        id: accountId,
        tenantId: context.tenantId,
        accountType,
        ownerRef,
        currency,
        balanceMinorUnits: 0,
        status: "open",
      }).onConflictDoNothing().returning();
      account = created;
      if (!account) {
        const [concurrent] = await tx.select().from(economicLedgerAccounts).where(and(
          eq(economicLedgerAccounts.tenantId, context.tenantId),
          eq(economicLedgerAccounts.accountType, accountType),
          eq(economicLedgerAccounts.ownerRef, ownerRef),
          eq(economicLedgerAccounts.currency, currency),
        )).for("update").limit(1);
        if (!concurrent || concurrent.status !== "open")
          throw new EconomicProvisioningError("ECONOMIC_PROVISIONING_ACCOUNT_IDENTITY_CONFLICT");
        account = concurrent;
      }
    }
    return { accountId: account.id, tenantId: account.tenantId, ownerRef: account.ownerRef,
      accountType: account.accountType, currency: account.currency, status: account.status,
      balanceMinorUnits: account.balanceMinorUnits, replayed: audit.replayed || Boolean(existing) };
  });
}

export async function provisionEconomicBudget(
  database: DrizzleDB,
  input: {
    authorization: EconomicProvisioningAuthorization;
    scopeType: "tenant" | "user" | "worker_job";
    scopeRef?: string;
    currency: string;
    limitMinorUnits: number;
    idempotencyKey: string;
  },
) {
  const context = authorizeEconomicProvisioning(input.authorization);
  const { currency, limitMinorUnits } = normalizeEconomicProvisioningMoney(input);
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
  let scopeRef: string;
  let workerJobId: string | undefined;
  if (input.scopeType === "tenant") scopeRef = context.tenantId;
  else if (input.scopeType === "user") scopeRef = context.actorId;
  else {
    workerJobId = input.scopeRef?.trim();
    if (!workerJobId) throw new EconomicProvisioningError("ECONOMIC_PROVISIONING_SCOPE_REQUIRED");
    const [job] = await database.select({ id: workerJobs.id }).from(workerJobs).where(and(
      eq(workerJobs.id, workerJobId), eq(workerJobs.tenantId, context.tenantId),
    )).limit(1);
    if (!job) throw new EconomicProvisioningError("ECONOMIC_PROVISIONING_SCOPE_MISMATCH");
    scopeRef = workerJobId;
  }

  return database.transaction(async tx => {
    const [existing] = await tx.select().from(economicBudgets).where(and(
      eq(economicBudgets.tenantId, context.tenantId),
      eq(economicBudgets.scopeType, input.scopeType),
      eq(economicBudgets.scopeRef, scopeRef),
      eq(economicBudgets.currency, currency),
    )).for("update").limit(1);
    if (existing && (existing.status !== "active" || existing.limitMinorUnits !== limitMinorUnits))
      throw new EconomicProvisioningError("ECONOMIC_PROVISIONING_BUDGET_SCOPE_CONFLICT");
    const budgetId = existing?.id ?? stableResourceId("budget", {
      tenantId: context.tenantId, scopeType: input.scopeType, scopeRef, currency,
    });
    const request = { scopeType: input.scopeType, scopeRef, currency, limitMinorUnits };
    const audit = await insertProvisioningEvent(
      tx, context, "budget.provisioned", idempotencyKey, budgetId, request, workerJobId,
    );
    let budget = existing;
    if (!budget) {
      const [created] = await tx.insert(economicBudgets).values({
        id: budgetId,
        tenantId: context.tenantId,
        scopeType: input.scopeType,
        scopeRef,
        currency,
        limitMinorUnits,
        heldMinorUnits: 0,
        capturedMinorUnits: 0,
        status: "active",
      }).onConflictDoNothing().returning();
      budget = created;
      if (!budget) {
        const [concurrent] = await tx.select().from(economicBudgets).where(and(
          eq(economicBudgets.tenantId, context.tenantId),
          eq(economicBudgets.scopeType, input.scopeType),
          eq(economicBudgets.scopeRef, scopeRef),
          eq(economicBudgets.currency, currency),
        )).for("update").limit(1);
        if (!concurrent || concurrent.status !== "active" || concurrent.limitMinorUnits !== limitMinorUnits)
          throw new EconomicProvisioningError("ECONOMIC_PROVISIONING_BUDGET_SCOPE_CONFLICT");
        budget = concurrent;
      }
    }
    return { budgetId: budget.id, tenantId: budget.tenantId, scopeType: budget.scopeType,
      scopeRef: budget.scopeRef, currency: budget.currency, limitMinorUnits: budget.limitMinorUnits,
      heldMinorUnits: budget.heldMinorUnits, capturedMinorUnits: budget.capturedMinorUnits,
      status: budget.status, replayed: audit.replayed || Boolean(existing) };
  });
}
