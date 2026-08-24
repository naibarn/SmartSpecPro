/**
 * Credit Service
 * Handles all credit-related operations: balance, deduction, purchase, history
 */

import { db } from "../db";
import { users, creditTransactions, creditPackages, modelProviderMap, systemSettings, conversations, llmProviders, skillRevenueSettlements } from "../../drizzle/schema";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { createHash, randomUUID } from "crypto";
import { getRedisClient, isRedisAvailable } from "./redis";
import { getTraceId } from "./traceContext";
import { buildModelProviderMapLookupCondition } from "./modelLookup";
import { resolveCatalogBackedPricing } from "./llmProviderCatalog";

export type TransactionType = "purchase" | "usage" | "bonus" | "refund" | "adjustment" | "subscription" | "creator_fee";

export type CreditSourceType =
  | "chat" | "skill" | "media_image" | "media_video" | "media_audio"
  | "indexing" | "rag" | "stt" | "translation" | "brainstorm"
  | "scheduler" | "admin" | "agency" | "creator_revenue" | "other"
  | "tts" | "browser_automation" | "widget_chat" | "webhook_chat" | "webhook_trigger"
  | "worker_runtime"
  | "api_chat" | "api_skill" | "api_agency" | "api_job"
  | "api_mcp" | "api_media" | "api_presentation" | "api_video_project"
  | "voice_agent"
  // Section 07/08 — multimodal memory pipeline
  | "vision_analysis" | "embedding_generation" | "reference_resolution";

type DbCreditSourceType = Exclude<
  CreditSourceType,
  "vision_analysis" | "embedding_generation" | "reference_resolution"
>;

/** `credit_transactions.traceId` is `varchar(32)`. */
const CREDIT_TRACE_ID_MAX_LENGTH = 32;

/**
 * Clamp a trace id to what `credit_transactions.traceId` can physically hold.
 *
 * Field incident 2026-07-30: the staged marketplace final render passed
 * `staged-final-render:<runId>:r<rev>` (58 chars) and Postgres rejected the
 * whole reservation INSERT with `22001 value too long for type character
 * varying(32)`. The caller caught it, logged it, and silently fell back to
 * the legacy renderer — so the Remotion final render simply never happened
 * and the run stalled with no user-visible error. Any trace id containing a
 * 36-char run id overflows this column, so this is a trap every caller walks
 * into, not a one-off.
 *
 * A plain prefix truncation would collapse every run of the same kind onto
 * one identical trace id, which defeats the point of a trace. Keep a
 * readable prefix and append a short digest of the FULL value so distinct
 * traces stay distinct and the row is still greppable by prefix.
 */
export function clampCreditTraceId(
  traceId: string | null | undefined
): string | null {
  const value = typeof traceId === "string" ? traceId.trim() : "";
  if (!value) return null;
  if (value.length <= CREDIT_TRACE_ID_MAX_LENGTH) return value;
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 8);
  return `${value.slice(0, CREDIT_TRACE_ID_MAX_LENGTH - digest.length - 1)}:${digest}`;
}

function normalizeCreditSourceType(
  sourceType?: CreditSourceType | null,
): DbCreditSourceType | undefined {
  if (!sourceType) return undefined;
  switch (sourceType) {
    case "vision_analysis":
    case "embedding_generation":
    case "reference_resolution":
      return "other";
    default:
      return sourceType;
  }
}

export class BudgetExceededError extends Error {
  public readonly monthlyLimit: number;
  public readonly creditsUsed: number;
  public readonly budgetMonthKey: string;

  constructor(monthlyLimit: number, creditsUsed: number, budgetMonthKey: string) {
    super(`Monthly credit budget exceeded: ${creditsUsed}/${monthlyLimit} used in ${budgetMonthKey}`);
    this.name = "BudgetExceededError";
    this.monthlyLimit = monthlyLimit;
    this.creditsUsed = creditsUsed;
    this.budgetMonthKey = budgetMonthKey;
  }
}

export interface DeductCreditsParams {
  userId: number;
  amount: number;
  description: string;
  tenantId?: string;
  idempotencyKey?: string;
  skipBudgetCheck?: boolean;
  /** Context fields for rich transaction tracking */
  conversationId?: number;
  skillSlug?: string;
  /** Stable fixed-credit settlement id for a skill run. */
  skillRunId?: string;
  sourceType?: CreditSourceType;
  metadata?: {
    model?: string;
    provider?: string;
    tokensUsed?: number;
    costUsd?: number;
    endpoint?: string;
    traceId?: string;
    service?: string;
    [key: string]: any;
  };
}

export interface AddCreditsParams {
  userId: number;
  amount: number;
  type: TransactionType;
  description: string;
  referenceId?: string;
  idempotencyKey?: string;
  tenantId?: string;
  metadata?: Record<string, any>;
  /** Context fields for rich transaction tracking */
  conversationId?: number;
  skillSlug?: string;
  sourceType?: CreditSourceType;
  /** Marks a positive signup/invite grant as eligible for inactivity policy. */
  freeCreditGrant?: boolean;
}

export interface CreditBalance {
  credits: number;
  plan: string;
}

/**
 * Transaction-scoped credit grant used by billing approval flows that must
 * commit the balance, ledger, and business-effect state atomically.
 */
export async function addCreditsWithinTransaction(
  tx: any,
  params: AddCreditsParams,
) {
  const { userId, amount, type, description, referenceId, metadata, idempotencyKey } = params;
  if (amount <= 0) {
    throw new Error("Amount must be positive");
  }

  // Lock the balance row before checking idempotency. This prevents two
  // concurrent grants from both incrementing the balance before one of their
  // ledger inserts discovers the unique idempotency key.
  const [lockedUser] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .for("update");
  if (!lockedUser) {
    throw new Error("User not found");
  }

  if (idempotencyKey) {
    const [existing] = await tx
      .select({ id: creditTransactions.id, amount: creditTransactions.amount, balanceAfter: creditTransactions.balanceAfter })
      .from(creditTransactions)
      .where(eq(creditTransactions.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing) {
      return {
        success: true,
        creditsAdded: Math.abs(existing.amount),
        newBalance: existing.balanceAfter,
        transactionId: existing.id,
        duplicate: true,
      };
    }
  }

  // Keep the timestamp as an ISO string when interpolating it into a Drizzle
  // SQL expression. Passing a Date object through this nested sql fragment
  // reaches postgres-js as a raw bind value and fails with ERR_INVALID_ARG_TYPE
  // in the update path used by manual PromptPay approval.
  const grantTimestamp = new Date().toISOString();

  const [result] = await tx
    .update(users)
    .set({
      credits: sql`${users.credits} + ${amount}`,
      ...(params.freeCreditGrant
        ? { freeCreditGrantedAt: sql`COALESCE(${users.freeCreditGrantedAt}, ${grantTimestamp})` }
        : {}),
      ...(type === "purchase"
        ? { freeCreditPolicyCancelledAt: sql`COALESCE(${users.freeCreditPolicyCancelledAt}, ${grantTimestamp})` }
        : {}),
    })
    .where(eq(users.id, userId))
    .returning({ newBalance: users.credits });

  if (!result) {
    throw new Error("User not found");
  }

  const [txRecord] = await tx.insert(creditTransactions).values({
    userId,
    amount,
    type,
    description,
    metadata,
    balanceAfter: result.newBalance,
    referenceId,
    idempotencyKey: idempotencyKey ?? null,
    traceId: clampCreditTraceId(getTraceId() ?? null),
    conversationId: params.conversationId ?? null,
    skillSlug: params.skillSlug ?? null,
    sourceType: normalizeCreditSourceType(params.sourceType ?? null) ?? null,
  }).returning({ id: creditTransactions.id });

  return {
    success: true,
    creditsAdded: amount,
    newBalance: result.newBalance,
    transactionId: txRecord?.id ?? 0,
    duplicate: false,
  };
}

const OCR_SERVICE_KEYS = ["library.ocr", "finance.ocr", "chat.ocr"] as const;
const OCR_DESCRIPTION_PREFIX = "OCR (";

type OcrTimeSeriesPoint = {
  periodStart: string;
  count: number;
  credits: number;
};

type OcrSourceBreakdown = {
  source: string;
  count: number;
  credits: number;
};

type OcrAggregationRow = {
  periodStart: Date | string;
  count: number | string | bigint | null;
  credits: number | string | bigint | null;
};

type OcrBreakdownRow = {
  source: string | null;
  count: number | string | bigint | null;
  credits: number | string | bigint | null;
};

type OcrUserRow = {
  userId: number;
  name: string | null;
  email: string | null;
  credits: number | string | bigint | null;
  count: number | string | bigint | null;
  lastUsedAt: Date | string | null;
};

function buildOcrWhereClause() {
  const keys = OCR_SERVICE_KEYS.map((key) => sql`${key}`);
  return sql`(
    ${creditTransactions.type} = 'usage'
    AND (
      (${creditTransactions.metadata} ->> 'service') IN (${sql.join(keys, sql`, `)})
      OR ${creditTransactions.description} ILIKE ${`${OCR_DESCRIPTION_PREFIX}%`}
    )
  )`;
}

function buildOcrSourceExpr() {
  return sql<string>`COALESCE(
    ${creditTransactions.metadata} ->> 'source',
    ${creditTransactions.metadata} ->> 'service',
    'unknown'
  )`;
}

function buildOcrProviderExpr() {
  return sql<string>`COALESCE(
    ${creditTransactions.metadata} ->> 'ocrProvider',
    ${creditTransactions.metadata} ->> 'provider',
    ${creditTransactions.metadata} ->> 'service',
    'unknown'
  )`;
}

async function getOcrTimeSeries(params: {
  userId?: number;
  days: number;
  period: "day" | "week" | "month";
  tenantId?: string | null;
}): Promise<OcrTimeSeriesPoint[]> {
  const periodSql = sql.raw(`'${params.period}'`);
  const periodExpr = sql`date_trunc(${periodSql}, ${creditTransactions.createdAt})`;
  const startDate = new Date(Date.now() - params.days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      periodStart: periodExpr,
      count: sql<number>`COUNT(*)`,
      credits: sql<number>`SUM(ABS(${creditTransactions.amount}))`,
    })
    .from(creditTransactions)
    .leftJoin(users, eq(users.id, creditTransactions.userId))
    .where(and(
      buildOcrWhereClause(),
      gte(creditTransactions.createdAt, startDate),
      ...(params.userId ? [eq(creditTransactions.userId, params.userId)] : []),
      ...(params.tenantId ? [sql`${users.currentTenantId}::text = ${params.tenantId}`] : []),
    ))
    .groupBy(periodExpr)
    .orderBy(periodExpr);

  return rows.map((row: OcrAggregationRow) => ({
    periodStart: new Date(row.periodStart as unknown as Date).toISOString(),
    count: Number(row.count || 0),
    credits: Number(row.credits || 0),
  }));
}

async function getOcrSourceBreakdown(params: { userId?: number; days: number; tenantId?: string | null }): Promise<OcrSourceBreakdown[]> {
  const sourceExpr = buildOcrSourceExpr();
  const startDate = new Date(Date.now() - params.days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      source: sourceExpr,
      count: sql<number>`COUNT(*)`,
      credits: sql<number>`SUM(ABS(${creditTransactions.amount}))`,
    })
    .from(creditTransactions)
    .leftJoin(users, eq(users.id, creditTransactions.userId))
    .where(and(
      buildOcrWhereClause(),
      gte(creditTransactions.createdAt, startDate),
      ...(params.userId ? [eq(creditTransactions.userId, params.userId)] : []),
      ...(params.tenantId ? [sql`${users.currentTenantId}::text = ${params.tenantId}`] : []),
    ))
    .groupBy(sourceExpr)
    .orderBy(sql`SUM(ABS(${creditTransactions.amount})) DESC`);

  return rows.map((row: OcrBreakdownRow) => ({
    source: String(row.source || "unknown"),
    count: Number(row.count || 0),
    credits: Number(row.credits || 0),
  }));
}

async function getOcrProviderBreakdown(params: { userId?: number; days: number; tenantId?: string | null }): Promise<OcrSourceBreakdown[]> {
  const providerExpr = buildOcrProviderExpr();
  const startDate = new Date(Date.now() - params.days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      source: providerExpr,
      count: sql<number>`COUNT(*)`,
      credits: sql<number>`SUM(ABS(${creditTransactions.amount}))`,
    })
    .from(creditTransactions)
    .leftJoin(users, eq(users.id, creditTransactions.userId))
    .where(and(
      buildOcrWhereClause(),
      gte(creditTransactions.createdAt, startDate),
      ...(params.userId ? [eq(creditTransactions.userId, params.userId)] : []),
      ...(params.tenantId ? [sql`${users.currentTenantId}::text = ${params.tenantId}`] : []),
    ))
    .groupBy(providerExpr)
    .orderBy(sql`SUM(ABS(${creditTransactions.amount})) DESC`);

  return rows.map((row: OcrBreakdownRow) => ({
    source: String(row.source || "unknown"),
    count: Number(row.count || 0),
    credits: Number(row.credits || 0),
  }));
}

export async function getUserOcrUsageSummary(userId: number, days: number) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [totals] = await db
    .select({
      count: sql<number>`COUNT(*)`,
      credits: sql<number>`SUM(ABS(${creditTransactions.amount}))`,
    })
    .from(creditTransactions)
    .leftJoin(users, eq(users.id, creditTransactions.userId))
    .where(and(
      buildOcrWhereClause(),
      eq(creditTransactions.userId, userId),
      gte(creditTransactions.createdAt, startDate),
    ));

  return {
    totals: {
      credits: Number(totals?.credits || 0),
      count: Number(totals?.count || 0),
    },
    bySource: await getOcrSourceBreakdown({ userId, days }),
    byProvider: await getOcrProviderBreakdown({ userId, days }),
    daily: await getOcrTimeSeries({ userId, days, period: "day" }),
    weekly: await getOcrTimeSeries({ userId, days: Math.max(days, 90), period: "week" }),
    monthly: await getOcrTimeSeries({ userId, days: Math.max(days, 365), period: "month" }),
  };
}

export async function getAdminOcrUsageSummary(params: { days: number; limit: number; offset: number; tenantId?: string | null }) {
  const startDate = new Date(Date.now() - params.days * 24 * 60 * 60 * 1000);
  const [totals] = await db
    .select({
      count: sql<number>`COUNT(*)`,
      credits: sql<number>`SUM(ABS(${creditTransactions.amount}))`,
    })
    .from(creditTransactions)
    .leftJoin(users, eq(users.id, creditTransactions.userId))
    .where(and(
      buildOcrWhereClause(),
      gte(creditTransactions.createdAt, startDate),
      ...(params.tenantId ? [sql`${users.currentTenantId}::text = ${params.tenantId}`] : []),
    ));

  const userRows = await db
    .select({
      userId: creditTransactions.userId,
      name: users.name,
      email: users.email,
      credits: sql<number>`SUM(ABS(${creditTransactions.amount}))`,
      count: sql<number>`COUNT(*)`,
      lastUsedAt: sql<Date | null>`MAX(${creditTransactions.createdAt})`,
    })
    .from(creditTransactions)
    .leftJoin(users, eq(users.id, creditTransactions.userId))
    .where(and(
      buildOcrWhereClause(),
      gte(creditTransactions.createdAt, startDate),
      ...(params.tenantId ? [sql`${users.currentTenantId}::text = ${params.tenantId}`] : []),
    ))
    .groupBy(creditTransactions.userId, users.name, users.email)
    .orderBy(sql`SUM(ABS(${creditTransactions.amount})) DESC`)
    .limit(params.limit)
    .offset(params.offset);

  return {
    totals: {
      credits: Number(totals?.credits || 0),
      count: Number(totals?.count || 0),
    },
    bySource: await getOcrSourceBreakdown({ days: params.days, tenantId: params.tenantId }),
    byProvider: await getOcrProviderBreakdown({ days: params.days, tenantId: params.tenantId }),
    daily: await getOcrTimeSeries({ days: params.days, period: "day", tenantId: params.tenantId }),
    weekly: await getOcrTimeSeries({ days: Math.max(params.days, 90), period: "week", tenantId: params.tenantId }),
    monthly: await getOcrTimeSeries({ days: Math.max(params.days, 365), period: "month", tenantId: params.tenantId }),
    users: userRows.map((row: OcrUserRow) => ({
      userId: row.userId,
      name: row.name ?? null,
      email: row.email ?? null,
      credits: Number(row.credits || 0),
      count: Number(row.count || 0),
      lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : null,
    })),
  };
}

export interface TransactionHistoryParams {
  userId: number;
  limit?: number;
  offset?: number;
  type?: TransactionType;
  sourceType?: CreditSourceType;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Get user's current credit balance
 */
export async function getCreditBalance(userId: number): Promise<CreditBalance | null> {
  const result = await db
    .select({
      credits: users.credits,
      plan: users.plan,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return result[0] || null;
}

/**
 * Get user's credit balance by openId
 */
export async function getCreditBalanceByOpenId(openId: string): Promise<CreditBalance | null> {
  const result = await db
    .select({
      credits: users.credits,
      plan: users.plan,
    })
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result[0] || null;
}

/**
 * Check if user has enough credits
 */
export async function hasEnoughCredits(userId: number, amount: number): Promise<boolean> {
  const balance = await getCreditBalance(userId);
  return balance !== null && balance.credits >= amount;
}

/** True only for an actual Postgres unique-violation (SQLSTATE 23505) on an
 *  idempotency-key index. drizzle-orm wraps the real postgres error (the one
 *  carrying `.code`/`.constraint`) inside `.cause` — a caught error's own
 *  top-level `.code`/`.constraint` are `undefined` for a Drizzle query error,
 *  so checking only those (as this used to) never matches, and a legitimate
 *  idempotent retry throws instead of returning the already-recorded
 *  transaction. Mirrors `presentationPlaybackExport.ts`'s
 *  `isIdempotencyUniqueConstraintError`. */
function isIdempotencyKeyUniqueViolation(err: unknown): boolean {
  const candidate = err as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  };
  const code = candidate?.code ?? candidate?.cause?.code;
  const constraint = candidate?.constraint ?? candidate?.cause?.constraint;
  return (
    code === "23505" &&
    typeof constraint === "string" &&
    constraint.includes("idempotency")
  );
}

/**
 * Deduct credits from user account
 * Returns the transaction record or throws if insufficient credits
 *
 * Uses atomic SQL: UPDATE ... SET credits = credits - amount WHERE credits >= amount
 * This prevents TOCTOU race conditions and negative balances.
 */
export async function deductCredits(params: DeductCreditsParams) {
  const { userId, amount, description, metadata, idempotencyKey, tenantId, skipBudgetCheck } = params;

  if (amount <= 0) {
    throw new Error("Deduction amount must be positive");
  }

  // All registered skill charges use the fixed skill price and revenue split.
  // Keep this compatibility boundary so legacy/domain skill callers cannot
  // bypass tenant-owner and skill-owner settlement while migrating callers.
  if (params.sourceType === "skill") {
    if (!params.skillSlug) {
      throw new Error("Skill billing requires skillSlug");
    }
    const { settleSkillRun } = await import("./skillRevenueBilling");
    const settlement = await settleSkillRun({
      runId: params.skillRunId ?? idempotencyKey ?? randomUUID(),
      userId,
      tenantId,
      skillSlug: params.skillSlug,
      actualWorkCredits: amount,
      description,
      metadata,
    });
    const userTransaction = settlement.userTransactionId
      ? await db
        .select({
          id: creditTransactions.id,
          amount: creditTransactions.amount,
          balanceAfter: creditTransactions.balanceAfter,
        })
        .from(creditTransactions)
        .where(eq(creditTransactions.id, settlement.userTransactionId))
        .limit(1)
      : [];
    return {
      success: true,
      creditsUsed: settlement.totalCredits,
      newBalance: userTransaction[0]?.balanceAfter ?? 0,
      transactionId: userTransaction[0]?.id ?? 0,
      ...(settlement.duplicate ? { duplicate: true } : {}),
    };
  }

  // Budget pre-check (only when tenantId is provided and not skipped)
  let budgetAlert = false;
  let budgetUsagePctValue: number | undefined;
  if (tenantId && !skipBudgetCheck) {
    const { checkBudget, getCurrentMonthKey } = await import("./budgetService");
    const budgetResult = await checkBudget(tenantId, userId, amount);
    if (!budgetResult.allowed) {
      throw new BudgetExceededError(
        budgetResult.monthlyLimit,
        budgetResult.creditsUsed,
        getCurrentMonthKey(),
      );
    }
    if (budgetResult.alert) {
      budgetAlert = true;
    }
    budgetUsagePctValue = budgetResult.usagePct;
  }

  // Redis fast-path check for idempotency
  if (idempotencyKey && isRedisAvailable()) {
    try {
      const redis = getRedisClient();
      const cached = await redis.get(`credit:idemp:${idempotencyKey}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Redis unavailable -- fall through to DB check
    }
  }

  let transactionId: number = 0;
  let newBalance: number = 0;

  try {
    await db.transaction(async (tx) => {
      // Atomic deduction: balance check + decrement in one statement
      const [result] = await tx
        .update(users)
        .set({
          credits: sql`${users.credits} - ${amount}`,
          lastCreditUsedAt: new Date(),
        })
        .where(and(
          eq(users.id, userId),
          eq(users.isDisabled, false),
          gte(users.credits, amount),
        ))
        .returning({ newBalance: users.credits });

      if (!result) {
        // Either user not found or insufficient credits
        const [user] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        if (!user) throw new Error("User not found");
        // Preserve the authoritative requested amount so the central
        // feedback policy can distinguish an ordinary user shortfall from an
        // anomalously large deduction after router wrappers normalize errors.
        throw new Error(`Insufficient credits. Required: ${amount}`);
      }

      newBalance = result.newBalance;

      const [txRecord] = await tx.insert(creditTransactions).values({
        userId,
        amount: -amount, // Negative for deductions
        type: "usage",
        description,
        metadata,
        balanceAfter: newBalance,
        idempotencyKey: idempotencyKey ?? null,
        traceId: clampCreditTraceId(getTraceId() ?? metadata?.traceId ?? null),
        conversationId: params.conversationId ?? null,
        skillSlug: params.skillSlug ?? null,
        sourceType: normalizeCreditSourceType(params.sourceType ?? null) ?? null,
      }).returning({ id: creditTransactions.id });

      transactionId = txRecord?.id || 0;
    });
  } catch (err: any) {
    // Handle unique constraint violation on idempotencyKey (DB safety net)
    if (idempotencyKey && isIdempotencyKeyUniqueViolation(err)) {
      const existing = await db
        .select({ id: creditTransactions.id, amount: creditTransactions.amount, balanceAfter: creditTransactions.balanceAfter })
        .from(creditTransactions)
        .where(eq(creditTransactions.idempotencyKey, idempotencyKey))
        .limit(1);
      if (existing[0]) {
        return {
          success: true,
          creditsUsed: Math.abs(existing[0].amount),
          newBalance: existing[0].balanceAfter ?? 0,
          transactionId: existing[0].id,
        };
      }
    }
    throw err;
  }

  const result: {
    success: boolean;
    creditsUsed: number;
    newBalance: number;
    transactionId: number;
    budgetAlert?: boolean;
    budgetUsagePct?: number;
  } = {
    success: true,
    creditsUsed: amount,
    newBalance,
    transactionId,
  };

  // Budget post-update
  if (tenantId) {
    try {
      const { incrementBudgetUsage } = await import("./budgetService");
      const budgetResult = await incrementBudgetUsage(tenantId, userId, amount);
      if (budgetAlert || budgetResult.alertTriggered) {
        result.budgetAlert = true;
      }
      if (budgetUsagePctValue !== undefined) {
        result.budgetUsagePct = budgetUsagePctValue;
      }
    } catch (budgetErr) {
      console.error("[Budget] Failed to update budget usage", budgetErr);
    }
  }

  // Cache result in Redis for fast dedup (24h TTL)
  if (idempotencyKey && isRedisAvailable()) {
    try {
      const redis = getRedisClient();
      await redis.set(`credit:idemp:${idempotencyKey}`, JSON.stringify(result), "EX", 86400);
    } catch {
      // Non-critical -- DB constraint is the safety net
    }
  }

  return result;
}

/**
 * Add credits to user account
 *
 * Uses atomic SQL: UPDATE ... SET credits = credits + amount
 * to prevent race conditions on concurrent additions.
 */
export async function addCredits(params: AddCreditsParams) {
  const { userId, amount, type, description, referenceId, metadata, idempotencyKey } = params;

  if (amount <= 0) {
    throw new Error("Amount must be positive");
  }

  if (idempotencyKey && isRedisAvailable()) {
    try {
      const redis = getRedisClient();
      const cached = await redis.get(`credit:idemp:${idempotencyKey}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Redis unavailable -- fall through to DB check
    }
  }

  let transactionId: number = 0;
  let newBalance: number = 0;

  try {
    await db.transaction(async (tx) => {
      const granted = await addCreditsWithinTransaction(tx, params);
      newBalance = granted.newBalance;
      transactionId = granted.transactionId;
    });
  } catch (err: any) {
    if (idempotencyKey && isIdempotencyKeyUniqueViolation(err)) {
      const existing = await db
        .select({ id: creditTransactions.id, amount: creditTransactions.amount, balanceAfter: creditTransactions.balanceAfter })
        .from(creditTransactions)
        .where(eq(creditTransactions.idempotencyKey, idempotencyKey))
        .limit(1);
      if (existing[0]) {
        return {
          success: true,
          creditsAdded: Math.abs(existing[0].amount),
          newBalance: existing[0].balanceAfter ?? 0,
          transactionId: existing[0].id,
        };
      }
    }
    throw err;
  }

  const result = {
    success: true,
    creditsAdded: amount,
    newBalance,
    transactionId,
  };

  if (idempotencyKey && isRedisAvailable()) {
    try {
      const redis = getRedisClient();
      await redis.set(`credit:idemp:${idempotencyKey}`, JSON.stringify(result), "EX", 86400);
    } catch {
      // Non-critical -- DB constraint is the safety net
    }
  }

  return result;
}

// ── Credit Reservation Pattern ───────────────────────────────────────────

export interface CreditReservation {
  reservationId: string;
  userId: number;
  reservedAmount: number;
  drawnAmount: number;
  transactionId: number;
  sourceType: CreditSourceType;
  idempotencyKey?: string;
  createdAt: string;
  expiresAt: string;
  /** Durable-in-Redis settlement keys prevent a provider call from being drawn twice. */
  settledCallAmounts?: Record<string, number>;
}

const RESERVATION_TTL_SECONDS = 600; // 10 minutes

export async function createCreditReservation(
  userId: number,
  amount: number,
  sourceType: CreditSourceType,
  metadata?: Record<string, any>,
  idempotencyKey?: string,
): Promise<CreditReservation> {
  if (!isRedisAvailable()) {
    throw new Error("Redis unavailable — cannot create credit reservation");
  }

  const reservationId = idempotencyKey
    ? `reservation-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32)}`
    : randomUUID();

  // Deduct the full amount upfront
  const deductResult = await deductCredits({
    userId,
    amount,
    description: `Credit reservation ${reservationId}`,
    sourceType,
    idempotencyKey,
    metadata: { ...metadata, reservationId },
  });

  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESERVATION_TTL_SECONDS * 1000);

  const reservation: CreditReservation = {
    reservationId,
    userId,
    reservedAmount: amount,
    drawnAmount: 0,
    transactionId: deductResult.transactionId,
    sourceType,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  // Store in Redis with TTL
  const redis = getRedisClient();
  await redis.set(
    `credit:reservation:${reservationId}`,
    JSON.stringify(reservation),
    "EX",
    RESERVATION_TTL_SECONDS,
  );

  return reservation;
}

// Lua script for atomic draw: check budget + increment drawnAmount in one call
const DRAW_LUA = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {err='not_found'} end
local r = cjson.decode(raw)
local settlementKey = ARGV[3]
if settlementKey and settlementKey ~= '' then
  r.settledCallAmounts = r.settledCallAmounts or {}
  if r.settledCallAmounts[settlementKey] ~= nil then
    local ttl = redis.call('TTL', KEYS[1])
    return {0, r.reservedAmount - r.drawnAmount, 1}
  end
end
local newDrawn = r.drawnAmount + tonumber(ARGV[1])
if newDrawn > r.reservedAmount then return {err='budget_exceeded'} end
r.drawnAmount = newDrawn
if settlementKey and settlementKey ~= '' then
  r.settledCallAmounts = r.settledCallAmounts or {}
  r.settledCallAmounts[settlementKey] = tonumber(ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 1 then ttl = tonumber(ARGV[2]) end
redis.call('SET', KEYS[1], cjson.encode(r), 'EX', ttl)
return {tonumber(ARGV[1]), r.reservedAmount - newDrawn, 0}
`;

export async function drawFromReservation(
  reservationId: string,
  amount: number,
  _description?: string,
  settlementKey?: string,
): Promise<{ drawn: number; remaining: number; duplicate?: boolean }> {
  if (!isRedisAvailable()) {
    throw new Error("Redis unavailable for reservation tracking");
  }

  const redis = getRedisClient();
  const key = `credit:reservation:${reservationId}`;
  const result = await redis.eval(
    DRAW_LUA,
    1,
    key,
    String(amount),
    String(RESERVATION_TTL_SECONDS),
    settlementKey ?? "",
  ) as any;

  if (result?.err === "not_found" || result === null) {
    throw new Error(`Reservation ${reservationId} not found or expired`);
  }
  if (result?.err === "budget_exceeded") {
    throw new Error(`Reservation budget exceeded`);
  }

  if (Array.isArray(result)) {
    if (result.length === 1) {
      return { drawn: amount, remaining: Number(result[0]) };
    }
    return { drawn: Number(result[0]), remaining: Number(result[1]), duplicate: Number(result[2]) === 1 };
  }
  // Compatibility with older Redis/Lua deployments while they roll forward.
  return { drawn: amount, remaining: Number(result) };
}

export async function refundReservation(
  reservationId: string,
): Promise<{ refundedAmount: number }> {
  if (!isRedisAvailable()) {
    return { refundedAmount: 0 };
  }

  const redis = getRedisClient();
  const raw = await redis.get(`credit:reservation:${reservationId}`);
  if (!raw) {
    return { refundedAmount: 0 };
  }

  const reservation: CreditReservation = JSON.parse(raw);
  const unused = reservation.reservedAmount - reservation.drawnAmount;

  if (unused > 0) {
    await refundCredits({
      userId: reservation.userId,
      amount: unused,
      description: `Reservation refund (${reservation.drawnAmount} of ${reservation.reservedAmount} used)`,
      originalTransactionId: reservation.transactionId,
      sourceType: reservation.sourceType,
      metadata: { reservationId },
    });
  }

  await redis.del(`credit:reservation:${reservationId}`);
  return { refundedAmount: unused };
}

export async function commitCreditReservation(
  reservationId: string,
): Promise<{ committedAmount: number }> {
  if (!isRedisAvailable()) {
    return { committedAmount: 0 };
  }

  const redis = getRedisClient();
  const key = `credit:reservation:${reservationId}`;
  const raw = await redis.get(key);
  if (!raw) {
    return { committedAmount: 0 };
  }

  const reservation: CreditReservation = JSON.parse(raw);
  const remaining = Math.max(0, reservation.reservedAmount - reservation.drawnAmount);
  await redis.del(key);
  return { committedAmount: remaining };
}

/**
 * Refund credits to user account (for failed operations)
 */
export async function refundCredits(params: {
  userId: number;
  amount: number;
  description: string;
  originalTransactionId?: number;
  idempotencyKey?: string;
  tenantId?: string;
  metadata?: Record<string, any>;
  sourceType?: CreditSourceType;
  conversationId?: number;
  skillSlug?: string;
  /** Fixed-credit skill settlement to reverse atomically with owner revenue. */
  skillRunId?: string;
}) {
  const { userId, amount, description, originalTransactionId, metadata } = params;

  // Reverse a fixed skill settlement before touching the user's balance. The
  // settlement transaction checks for an existing auto-refund under the row
  // lock, then reverses both owner allocations exactly once.
  if (params.sourceType === "skill" || params.skillRunId || params.skillSlug) {
    let runId = params.skillRunId;
    if (!runId && originalTransactionId) {
      const [settlement] = await db
        .select({ runId: skillRevenueSettlements.runId })
        .from(skillRevenueSettlements)
        .where(eq(skillRevenueSettlements.userTransactionId, originalTransactionId))
        .limit(1);
      runId = settlement?.runId;
    }
    if (runId) {
      const { refundSkillRun } = await import("./skillRevenueBilling");
      const reversed = await refundSkillRun({ runId, reason: description });
      return {
        success: true,
        creditsUsed: 0,
        newBalance: 0,
        transactionId: 0,
        revenueCreditsReversed: reversed.revenueCredits,
        revenueDebtCredits: reversed.revenueDebtCredits,
        duplicate: !reversed.refunded,
      };
    }
    if (params.sourceType === "skill") {
      throw new Error("Skill refund requires a settled skillRunId");
    }
  }

  return addCredits({
    userId,
    amount,
    type: "refund",
    description,
    referenceId: originalTransactionId ? `refund-${originalTransactionId}` : undefined,
    idempotencyKey: params.idempotencyKey,
    tenantId: params.tenantId,
    metadata: {
      ...metadata,
      originalTransactionId,
      reason: "operation_failed",
    },
    sourceType: params.sourceType,
    conversationId: params.conversationId,
    skillSlug: params.skillSlug,
  });
}

/**
 * Get transaction history for a user
 */
export async function getTransactionHistory(params: TransactionHistoryParams) {
  const { userId, limit = 50, offset = 0, type, sourceType, startDate, endDate } = params;

  const conditions = [eq(creditTransactions.userId, userId)];

  if (type) {
    conditions.push(eq(creditTransactions.type, type));
  }

  if (sourceType) {
    const dbSourceType = normalizeCreditSourceType(sourceType);
    if (dbSourceType) {
      conditions.push(eq(creditTransactions.sourceType, dbSourceType));
    }
  }

  if (startDate) {
    conditions.push(gte(creditTransactions.createdAt, startDate));
  }

  if (endDate) {
    conditions.push(lte(creditTransactions.createdAt, endDate));
  }

  const transactions = await db
    .select({
      id: creditTransactions.id,
      amount: creditTransactions.amount,
      type: creditTransactions.type,
      description: creditTransactions.description,
      metadata: creditTransactions.metadata,
      balanceAfter: creditTransactions.balanceAfter,
      createdAt: creditTransactions.createdAt,
      traceId: creditTransactions.traceId,
      conversationId: creditTransactions.conversationId,
      skillSlug: creditTransactions.skillSlug,
      sourceType: creditTransactions.sourceType,
      conversationTitle: conversations.title,
    })
    .from(creditTransactions)
    .leftJoin(conversations, and(
      eq(creditTransactions.conversationId, conversations.id),
      eq(conversations.userId, userId),
    ))
    .where(and(...conditions))
    .orderBy(desc(creditTransactions.createdAt))
    .limit(limit)
    .offset(offset);

  return transactions;
}

/**
 * Get available credit packages
 */
export async function getCreditPackages() {
  const packages = await db
    .select()
    .from(creditPackages)
    .where(eq(creditPackages.isActive, true))
    .orderBy(creditPackages.sortOrder);

  return packages;
}

/**
 * Get credit package by ID
 */
export async function getCreditPackageById(id: number) {
  const result = await db
    .select()
    .from(creditPackages)
    .where(eq(creditPackages.id, id))
    .limit(1);

  return result[0] || null;
}

/**
 * Check if a model is free via model_provider_map
 */
export async function isModelFree(modelId: string): Promise<boolean> {
  const rows = await db
    .select({
      providerName: llmProviders.providerName,
      availableModels: llmProviders.availableModels,
      providerModelId: modelProviderMap.providerModelId,
      pricingInput: modelProviderMap.pricingInput,
      pricingOutput: modelProviderMap.pricingOutput,
      isFree: modelProviderMap.isFree,
    })
    .from(modelProviderMap)
    .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
    .where(and(buildModelProviderMapLookupCondition(modelId), eq(modelProviderMap.isEnabled, true)))
    .limit(1);
  if (rows.length === 0) return false;
  const effectivePricing = resolveCatalogBackedPricing(rows[0]);
  return effectivePricing.isFree;
}

/**
 * Get dynamic pricing from model_provider_map, returns null if not found
 */
async function getModelPricingFromDb(modelId: string): Promise<{ input: number; output: number } | null> {
  const rows = await db
    .select({
      providerName: llmProviders.providerName,
      availableModels: llmProviders.availableModels,
      providerModelId: modelProviderMap.providerModelId,
      pricingInput: modelProviderMap.pricingInput,
      pricingOutput: modelProviderMap.pricingOutput,
      isFree: modelProviderMap.isFree,
    })
    .from(modelProviderMap)
    .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
    .where(and(buildModelProviderMapLookupCondition(modelId), eq(modelProviderMap.isEnabled, true)))
    .limit(1);

  if (rows.length === 0) return null;
  const effectivePricing = resolveCatalogBackedPricing(rows[0]);
  if (effectivePricing.isFree) return { input: 0, output: 0 };
  return { input: effectivePricing.pricingInput, output: effectivePricing.pricingOutput };
}

/**
 * Deduct credits for a model, handling free models (0-credit with audit trail)
 */
export async function deductCreditsForModel(params: {
  userId: number;
  model: string;
  provider?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
  description?: string;
  tenantId?: string;
  idempotencyKey?: string;
  /** Stable fixed-credit settlement id for a skill-run model usage charge. */
  skillRunId?: string;
  conversationId?: number;
  skillSlug?: string;
  sourceType?: CreditSourceType;
  metadata?: Record<string, unknown>;
}): Promise<{ creditsUsed: number; wasFree: boolean }> {
  // Skip for static tokens (server-to-server calls)
  if (params.userId === 0) {
    return { creditsUsed: 0, wasFree: true };
  }

  const normalizedCostUsd = Number(params.costUsd ?? 0);
  const hasProviderReportedCost = Number.isFinite(normalizedCostUsd) && normalizedCostUsd > 0;

  // Every user-visible LLM request has a minimum 1-credit charge. Free/zero-price
  // provider mappings still help ranking and admin labeling, but they do not bypass
  // per-call platform usage accounting.
  const credits = hasProviderReportedCost
    ? calculateCreditsFromCost(normalizedCostUsd)
    : Math.max(1, await calculateCreditsForLLMDynamic(params.inputTokens, params.outputTokens, params.model));

  const result = await deductCredits({
    userId: params.userId,
    amount: credits,
    description: params.description ?? `LLM usage: ${params.model}`,
    tenantId: params.tenantId,
    idempotencyKey: params.idempotencyKey,
    skillRunId: params.skillRunId,
    conversationId: params.conversationId,
    skillSlug: params.skillSlug,
    sourceType: params.sourceType ?? "chat",
    metadata: {
      model: params.model,
      provider: params.provider,
      tokensUsed: params.inputTokens + params.outputTokens,
      costUsd: hasProviderReportedCost ? normalizedCostUsd : params.costUsd,
      ...(params.metadata ?? {}),
    },
  });

  return { creditsUsed: result.creditsUsed, wasFree: false };
}

/**
 * Calculate credits using dynamic DB pricing first, then hardcoded fallback
 */
export async function calculateCreditsForLLMDynamic(inputTokens: number, outputTokens: number, model: string): Promise<number> {
  const dbPricing = await getModelPricingFromDb(model);
  if (dbPricing) {
    if (dbPricing.input === 0 && dbPricing.output === 0) return 1;
    const costUsd = (inputTokens / 1_000_000) * dbPricing.input + (outputTokens / 1_000_000) * dbPricing.output;
    return Math.max(1, Math.ceil(costUsd * 1000));
  }
  // Fallback to hardcoded pricing
  return calculateCreditsForLLM(inputTokens, outputTokens, model);
}

/**
 * LLM Model Pricing (per 1M tokens in USD)
 * Based on actual provider costs - update as needed
 * @deprecated Use dynamic pricing from model_provider_map when available
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  "gpt-4o": { input: 2.50, output: 10.00 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4-turbo": { input: 10.00, output: 30.00 },
  "gpt-4": { input: 30.00, output: 60.00 },
  "gpt-5.2-chat": { input: 2.00, output: 8.00 },
  "gpt-5": { input: 2.00, output: 8.00 },
  "gpt-3.5-turbo": { input: 0.50, output: 1.50 },
  // Anthropic
  "claude-3-5-sonnet-20241022": { input: 3.00, output: 15.00 },
  "claude-3-opus-20240229": { input: 15.00, output: 75.00 },
  "claude-3-sonnet-20240229": { input: 3.00, output: 15.00 },
  "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
  // Google
  "gemini-1.5-pro": { input: 1.25, output: 5.00 },
  "gemini-1.5-flash": { input: 0.075, output: 0.30 },
  // Default fallback (conservative estimate)
  "default": { input: 1.00, output: 4.00 },
};

/**
 * Get pricing for a model (with fallback to default)
 */
function getModelPricing(model: string): { input: number; output: number } {
  // Strip provider prefix (e.g., "openai/gpt-4o" -> "gpt-4o")
  const stripped = model.includes("/") ? model.split("/").pop()! : model;

  // Try exact match first
  if (MODEL_PRICING[stripped]) {
    return MODEL_PRICING[stripped];
  }
  if (MODEL_PRICING[model]) {
    return MODEL_PRICING[model];
  }
  // Try partial match (e.g., "gpt-4o-mini-2024-07-18" -> "gpt-4o-mini")
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (key === "default") continue;
    if (stripped.startsWith(key) || stripped.includes(key)) {
      return pricing;
    }
  }
  return MODEL_PRICING["default"];
}

/**
 * Calculate USD cost for LLM usage
 */
export function calculateLLMCostUsd(inputTokens: number, outputTokens: number, model: string = "gpt-4o-mini"): number {
  const pricing = getModelPricing(model);
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

/**
 * Calculate credits needed for LLM usage based on actual cost
 *
 * Credit pricing: 1 credit = $0.001 USD (so $1 = 1000 credits)
 * This means credits deducted = actual LLM cost in USD * 1000
 *
 * Example with gpt-4o-mini (1000 input + 500 output tokens):
 * - Input cost: 1000/1M * $0.15 = $0.00015
 * - Output cost: 500/1M * $0.60 = $0.0003
 * - Total cost: $0.00045
 * - Credits: 0.00045 * 1000 = 0.45 → ceil = 1 credit
 */
export function calculateCreditsForLLM(inputTokens: number, outputTokens: number, model: string = "gpt-4o-mini"): number {
  const costUsd = calculateLLMCostUsd(inputTokens, outputTokens, model);
  // Convert USD to credits: 1 credit = $0.001
  const credits = costUsd * 1000;
  return Math.max(1, Math.ceil(credits));
}

/**
 * Calculate credits based on USD cost
 *
 * Pricing: 1 credit = $0.001 USD
 * So $1 = 1000 credits
 */
export function calculateCreditsFromCost(costUsd: number): number {
  return Math.max(1, Math.ceil(costUsd * 1000));
}

/**
 * Get user's usage statistics
 */
export async function getUsageStats(userId: number, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const stats = await db
    .select({
      totalUsage: sql<number>`SUM(CASE WHEN ${creditTransactions.type} = 'usage' THEN ABS(${creditTransactions.amount}) ELSE 0 END)`,
      totalPurchased: sql<number>`SUM(CASE WHEN ${creditTransactions.type} = 'purchase' THEN ${creditTransactions.amount} ELSE 0 END)`,
      transactionCount: sql<number>`COUNT(*)`,
    })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.userId, userId),
        gte(creditTransactions.createdAt, startDate)
      )
    );

  return {
    totalUsage: stats[0]?.totalUsage || 0,
    totalPurchased: stats[0]?.totalPurchased || 0,
    transactionCount: stats[0]?.transactionCount || 0,
    periodDays: days,
  };
}

/**
 * Give signup bonus credits to new user
 */
export async function giveSignupBonus(userId: number, bonusAmount: number = 100) {
  if (bonusAmount <= 0) {
    return { success: true, creditsAdded: 0, newBalance: 0, transactionId: 0 };
  }
  return addCredits({
    userId,
    amount: bonusAmount,
    type: "bonus",
    description: "Welcome bonus credits",
    metadata: { reason: "signup" },
    freeCreditGrant: true,
  });
}

// ─── Credit Pricing Config ─────────────────────────────────────────

interface CreditPricingConfig {
  costPerChunk: number;
  ragQueryCost: number;
  mcpReadMaxCost: number;
  mcpSheetMaxCost: number;
  libraryUploadSizeStepMb: number;
  libraryUploadImageBase: number;
  libraryUploadImagePerStep: number;
  libraryUploadVideoBase: number;
  libraryUploadVideoPerStep: number;
  libraryUploadAudioBase: number;
  libraryUploadAudioPerStep: number;
  libraryUploadDocumentBase: number;
  libraryUploadDocumentPerStep: number;
  libraryUploadOtherBase: number;
  libraryUploadOtherPerStep: number;
}

const PRICING_DEFAULTS: CreditPricingConfig = {
  costPerChunk: 2,
  ragQueryCost: 1,
  mcpReadMaxCost: 5,
  mcpSheetMaxCost: 3,
  libraryUploadSizeStepMb: 10,
  libraryUploadImageBase: 4,
  libraryUploadImagePerStep: 2,
  libraryUploadVideoBase: 20,
  libraryUploadVideoPerStep: 15,
  libraryUploadAudioBase: 6,
  libraryUploadAudioPerStep: 4,
  libraryUploadDocumentBase: 5,
  libraryUploadDocumentPerStep: 3,
  libraryUploadOtherBase: 8,
  libraryUploadOtherPerStep: 5,
};

let _pricingCache: { config: CreditPricingConfig; expiresAt: number } | null = null;

export function clearCreditPricingCache(): void {
  _pricingCache = null;
}

/**
 * Load credit pricing from system_settings with 5-minute cache.
 */
export async function getCreditPricingConfig(): Promise<CreditPricingConfig> {
  if (_pricingCache && Date.now() < _pricingCache.expiresAt) {
    return _pricingCache.config;
  }

  const rows = await db
    .select({ key: systemSettings.key, value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.category, "credit_pricing"));

  const config: CreditPricingConfig = { ...PRICING_DEFAULTS };
  for (const row of rows) {
    const num = Number(row.value);
    if (!isNaN(num) && num >= 0) {
      if (row.key === "costPerChunk") config.costPerChunk = num;
      else if (row.key === "ragQueryCost") config.ragQueryCost = num;
      else if (row.key === "mcpReadMaxCost") config.mcpReadMaxCost = num;
      else if (row.key === "mcpSheetMaxCost") config.mcpSheetMaxCost = num;
      else if (row.key === "libraryUploadSizeStepMb") config.libraryUploadSizeStepMb = num;
      else if (row.key === "libraryUploadImageBase") config.libraryUploadImageBase = num;
      else if (row.key === "libraryUploadImagePerStep") config.libraryUploadImagePerStep = num;
      else if (row.key === "libraryUploadVideoBase") config.libraryUploadVideoBase = num;
      else if (row.key === "libraryUploadVideoPerStep") config.libraryUploadVideoPerStep = num;
      else if (row.key === "libraryUploadAudioBase") config.libraryUploadAudioBase = num;
      else if (row.key === "libraryUploadAudioPerStep") config.libraryUploadAudioPerStep = num;
      else if (row.key === "libraryUploadDocumentBase") config.libraryUploadDocumentBase = num;
      else if (row.key === "libraryUploadDocumentPerStep") config.libraryUploadDocumentPerStep = num;
      else if (row.key === "libraryUploadOtherBase") config.libraryUploadOtherBase = num;
      else if (row.key === "libraryUploadOtherPerStep") config.libraryUploadOtherPerStep = num;
    }
  }

  _pricingCache = { config, expiresAt: Date.now() + 5 * 60_000 };
  return config;
}

// ─── Service-Tagged Billing Functions ───────────────────────────────

export type IndexingService = "library.upload_index" | "library.save_reindex" | "gdrive.index" | "gdrive.reindex";

/**
 * Charge credits for indexing operations.
 * Formula: ceil(chunkCount) * costPerChunk (default 2).
 */
export async function chargeForIndexing(params: {
  userId: number;
  chunkCount: number;
  service: IndexingService;
  tenantId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}): Promise<{ creditsUsed: number; transactionId: number }> {
  const pricing = await getCreditPricingConfig();
  const amount = Math.ceil(params.chunkCount) * pricing.costPerChunk;

  if (amount <= 0) {
    return { creditsUsed: 0, transactionId: 0 };
  }

  const result = await deductCredits({
    userId: params.userId,
    amount,
    tenantId: params.tenantId,
    description: `Indexing (${params.service}): ${params.chunkCount} chunks`,
    idempotencyKey: params.idempotencyKey,
    sourceType: "indexing",
    metadata: { ...params.metadata, service: params.service, chunkCount: params.chunkCount },
  });

  return { creditsUsed: result.creditsUsed, transactionId: result.transactionId };
}

export type RagService = "rag.semantic_search" | "rag.chat_context";

/**
 * Charge credits for a RAG query (semantic/hybrid search).
 * Fixed cost per query (default 1 credit). BM25-only is free.
 */
export async function chargeForRagQuery(params: {
  userId: number;
  service: RagService;
  tenantId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}): Promise<{ creditsUsed: number; transactionId: number }> {
  const pricing = await getCreditPricingConfig();
  const amount = pricing.ragQueryCost;

  if (amount <= 0) {
    return { creditsUsed: 0, transactionId: 0 };
  }

  const result = await deductCredits({
    userId: params.userId,
    amount,
    tenantId: params.tenantId,
    description: `RAG query (${params.service})`,
    idempotencyKey: params.idempotencyKey,
    sourceType: "rag",
    metadata: { ...params.metadata, service: params.service },
  });

  return { creditsUsed: result.creditsUsed, transactionId: result.transactionId };
}

/**
 * Pre-flight estimation: estimate indexing cost without charging.
 */
export async function estimateIndexingCost(totalSizeBytes: number): Promise<{
  estimatedChunks: number;
  estimatedCredits: number;
  costPerChunk: number;
}> {
  const pricing = await getCreditPricingConfig();
  const estimatedChunks = Math.ceil(totalSizeBytes / 500);
  return {
    estimatedChunks,
    estimatedCredits: estimatedChunks * pricing.costPerChunk,
    costPerChunk: pricing.costPerChunk,
  };
}

export type LibraryUploadCreditCategory = "image" | "video" | "audio" | "document" | "other";

export interface LibraryUploadCreditBreakdown {
  category: LibraryUploadCreditCategory;
  fileSizeBytes: number;
  fileSizeMb: number;
  sizeStepMb: number;
  baseCredits: number;
  stepCredits: number;
  extraSteps: number;
  totalCredits: number;
}

export function classifyLibraryUploadCategory(fileType: string): LibraryUploadCreditCategory {
  const normalized = String(fileType || "").trim().toLowerCase();
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("video/")) return "video";
  if (normalized.startsWith("audio/")) return "audio";
  if (
    normalized === "application/pdf"
    || normalized.includes("word")
    || normalized.includes("presentation")
    || normalized.includes("powerpoint")
    || normalized.includes("excel")
    || normalized.includes("spreadsheet")
    || normalized.startsWith("text/")
    || normalized === "application/json"
    || normalized === "application/xml"
  ) {
    return "document";
  }
  return "other";
}

export async function calculateLibraryUploadCreditCost(
  fileType: string,
  fileSizeBytes: number,
): Promise<LibraryUploadCreditBreakdown> {
  const pricing = await getCreditPricingConfig();
  const category = classifyLibraryUploadCategory(fileType);
  const fileSizeMb = Math.max(0, fileSizeBytes) / (1024 * 1024);
  const sizeStepMb = Math.max(1, Math.ceil(pricing.libraryUploadSizeStepMb));

  let baseCredits = pricing.libraryUploadOtherBase;
  let stepCredits = pricing.libraryUploadOtherPerStep;
  if (category === "image") {
    baseCredits = pricing.libraryUploadImageBase;
    stepCredits = pricing.libraryUploadImagePerStep;
  } else if (category === "video") {
    baseCredits = pricing.libraryUploadVideoBase;
    stepCredits = pricing.libraryUploadVideoPerStep;
  } else if (category === "audio") {
    baseCredits = pricing.libraryUploadAudioBase;
    stepCredits = pricing.libraryUploadAudioPerStep;
  } else if (category === "document") {
    baseCredits = pricing.libraryUploadDocumentBase;
    stepCredits = pricing.libraryUploadDocumentPerStep;
  }

  const overBaseMb = Math.max(0, fileSizeMb - sizeStepMb);
  const extraSteps = Math.ceil(overBaseMb / sizeStepMb);
  const totalCredits = Math.max(0, Math.ceil(baseCredits + (extraSteps * stepCredits)));

  return {
    category,
    fileSizeBytes: Math.max(0, Math.floor(fileSizeBytes)),
    fileSizeMb,
    sizeStepMb,
    baseCredits,
    stepCredits,
    extraSteps,
    totalCredits,
  };
}
