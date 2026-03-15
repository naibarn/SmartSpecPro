/**
 * Credit Service
 * Handles all credit-related operations: balance, deduction, purchase, history
 */

import { db } from "../db";
import { users, creditTransactions, creditPackages, modelProviderMap, systemSettings, conversations } from "../../drizzle/schema";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getRedisClient, isRedisAvailable } from "./redis";
import { getTraceId } from "./traceContext";
import { buildModelProviderMapLookupCondition } from "./modelLookup";

export type TransactionType = "purchase" | "usage" | "bonus" | "refund" | "adjustment" | "subscription" | "creator_fee";

export type CreditSourceType =
  | "chat" | "skill" | "media_image" | "media_video" | "media_audio"
  | "indexing" | "rag" | "stt" | "translation" | "brainstorm"
  | "scheduler" | "admin" | "agency" | "creator_revenue" | "other"
  | "tts" | "browser_automation" | "widget_chat" | "webhook_chat" | "webhook_trigger"
  | "api_chat" | "api_skill" | "api_agency" | "api_job"
  | "api_mcp" | "api_media" | "api_presentation" | "api_video_project"
  // Section 07/08 — multimodal memory pipeline
  | "vision_analysis" | "embedding_generation" | "reference_resolution";

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
  metadata?: Record<string, any>;
  /** Context fields for rich transaction tracking */
  conversationId?: number;
  skillSlug?: string;
  sourceType?: CreditSourceType;
}

export interface CreditBalance {
  credits: number;
  plan: string;
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
        .set({ credits: sql`${users.credits} - ${amount}` })
        .where(and(eq(users.id, userId), gte(users.credits, amount)))
        .returning({ newBalance: users.credits });

      if (!result) {
        // Either user not found or insufficient credits
        const [user] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        if (!user) throw new Error("User not found");
        throw new Error("Insufficient credits");
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
        traceId: getTraceId() ?? metadata?.traceId ?? null,
        conversationId: params.conversationId ?? null,
        skillSlug: params.skillSlug ?? null,
        sourceType: params.sourceType ?? null,
      }).returning({ id: creditTransactions.id });

      transactionId = txRecord?.id || 0;
    });
  } catch (err: any) {
    // Handle unique constraint violation on idempotencyKey (DB safety net)
    if (idempotencyKey && err?.code === "23505" && err?.constraint?.includes("idempotency")) {
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
  const { userId, amount, type, description, referenceId, metadata } = params;

  if (amount <= 0) {
    throw new Error("Amount must be positive");
  }

  let transactionId: number = 0;
  let newBalance: number = 0;

  await db.transaction(async (tx) => {
    // Atomic addition
    const [result] = await tx
      .update(users)
      .set({ credits: sql`${users.credits} + ${amount}` })
      .where(eq(users.id, userId))
      .returning({ newBalance: users.credits });

    if (!result) {
      throw new Error("User not found");
    }

    newBalance = result.newBalance;

    const [txRecord] = await tx.insert(creditTransactions).values({
      userId,
      amount, // Positive for additions
      type,
      description,
      metadata,
      balanceAfter: newBalance,
      referenceId,
      traceId: getTraceId() ?? null,
      conversationId: params.conversationId ?? null,
      skillSlug: params.skillSlug ?? null,
      sourceType: params.sourceType ?? null,
    }).returning({ id: creditTransactions.id });

    transactionId = txRecord?.id || 0;
  });

  return {
    success: true,
    creditsAdded: amount,
    newBalance,
    transactionId,
  };
}

// ── Credit Reservation Pattern ───────────────────────────────────────────

export interface CreditReservation {
  reservationId: string;
  userId: number;
  reservedAmount: number;
  drawnAmount: number;
  transactionId: number;
  sourceType: CreditSourceType;
  createdAt: string;
  expiresAt: string;
}

const RESERVATION_TTL_SECONDS = 600; // 10 minutes

export async function createCreditReservation(
  userId: number,
  amount: number,
  sourceType: CreditSourceType,
  metadata?: Record<string, any>,
): Promise<CreditReservation> {
  if (!isRedisAvailable()) {
    throw new Error("Redis unavailable — cannot create credit reservation");
  }

  const reservationId = randomUUID();

  // Deduct the full amount upfront
  const deductResult = await deductCredits({
    userId,
    amount,
    description: `Credit reservation ${reservationId}`,
    sourceType,
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
local newDrawn = r.drawnAmount + tonumber(ARGV[1])
if newDrawn > r.reservedAmount then return {err='budget_exceeded'} end
r.drawnAmount = newDrawn
local ttl = redis.call('TTL', KEYS[1])
if ttl < 1 then ttl = tonumber(ARGV[2]) end
redis.call('SET', KEYS[1], cjson.encode(r), 'EX', ttl)
return {r.reservedAmount - newDrawn}
`;

export async function drawFromReservation(
  reservationId: string,
  amount: number,
  _description?: string,
): Promise<{ drawn: number; remaining: number }> {
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
  ) as any;

  if (result?.err === "not_found" || result === null) {
    throw new Error(`Reservation ${reservationId} not found or expired`);
  }
  if (result?.err === "budget_exceeded") {
    throw new Error(`Reservation budget exceeded`);
  }

  const remaining = Number(Array.isArray(result) ? result[0] : result);
  return { drawn: amount, remaining };
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
  metadata?: Record<string, any>;
  sourceType?: CreditSourceType;
  conversationId?: number;
  skillSlug?: string;
}) {
  const { userId, amount, description, originalTransactionId, metadata } = params;

  return addCredits({
    userId,
    amount,
    type: "refund",
    description,
    referenceId: originalTransactionId ? `refund-${originalTransactionId}` : undefined,
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
    conditions.push(eq(creditTransactions.sourceType, sourceType));
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
    .select({ isFree: modelProviderMap.isFree })
    .from(modelProviderMap)
    .where(and(buildModelProviderMapLookupCondition(modelId), eq(modelProviderMap.isEnabled, true)))
    .limit(1);
  return rows.length > 0 && rows[0].isFree;
}

/**
 * Get dynamic pricing from model_provider_map, returns null if not found
 */
async function getModelPricingFromDb(modelId: string): Promise<{ input: number; output: number } | null> {
  const rows = await db
    .select({
      pricingInput: modelProviderMap.pricingInput,
      pricingOutput: modelProviderMap.pricingOutput,
      isFree: modelProviderMap.isFree,
    })
    .from(modelProviderMap)
    .where(and(buildModelProviderMapLookupCondition(modelId), eq(modelProviderMap.isEnabled, true)))
    .limit(1);

  if (rows.length === 0) return null;
  if (rows[0].isFree) return { input: 0, output: 0 };
  return { input: Number(rows[0].pricingInput), output: Number(rows[0].pricingOutput) };
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
  // Provider-reported cost is the source of truth when available.
  const free = hasProviderReportedCost ? false : await isModelFree(params.model);

  if (free) {
    // Log a 0-credit transaction for audit trail
    await db.insert(creditTransactions).values({
      userId: params.userId,
      amount: 0,
      type: "usage",
      description: params.description ?? `Free model usage: ${params.model}`,
      metadata: {
        freeModel: true,
        model: params.model,
        modelId: params.model,
        provider: params.provider,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        ...(params.metadata ?? {}),
      },
      balanceAfter: (await getCreditBalance(params.userId))?.credits ?? 0,
      traceId: getTraceId() ?? null,
      conversationId: params.conversationId ?? null,
      skillSlug: params.skillSlug ?? null,
      sourceType: params.sourceType ?? null,
    });
    return { creditsUsed: 0, wasFree: true };
  }

  // Paid model: use dynamic pricing if available
  const credits = hasProviderReportedCost
    ? calculateCreditsFromCost(normalizedCostUsd)
    : await calculateCreditsForLLMDynamic(params.inputTokens, params.outputTokens, params.model);

  const result = await deductCredits({
    userId: params.userId,
    amount: credits,
    description: params.description ?? `LLM usage: ${params.model}`,
    tenantId: params.tenantId,
    idempotencyKey: params.idempotencyKey,
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
    if (dbPricing.input === 0 && dbPricing.output === 0) return 0;
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
  return addCredits({
    userId,
    amount: bonusAmount,
    type: "bonus",
    description: "Welcome bonus credits",
    metadata: { reason: "signup" },
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
