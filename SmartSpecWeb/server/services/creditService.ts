/**
 * Credit Service
 * Handles all credit-related operations: balance, deduction, purchase, history
 */

import { db } from "../db";
import { users, creditTransactions, creditPackages } from "../../drizzle/schema";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

export type TransactionType = "purchase" | "usage" | "bonus" | "refund" | "adjustment" | "subscription";

export interface DeductCreditsParams {
  userId: number;
  amount: number;
  description: string;
  metadata?: {
    model?: string;
    provider?: string;
    tokensUsed?: number;
    costUsd?: number;
    endpoint?: string;
    traceId?: string;
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
 */
export async function deductCredits(params: DeductCreditsParams) {
  const { userId, amount, description, metadata } = params;

  if (amount <= 0) {
    throw new Error("Deduction amount must be positive");
  }

  // Get current balance
  const balance = await getCreditBalance(userId);
  if (!balance) {
    throw new Error("User not found");
  }

  if (balance.credits < amount) {
    throw new Error("Insufficient credits");
  }

  const newBalance = balance.credits - amount;

  let transactionId: number = 0;

  // Update user credits and create transaction in a transaction
  await db.transaction(async (tx) => {
    // Update user credits
    await tx
      .update(users)
      .set({ credits: newBalance })
      .where(eq(users.id, userId));

    // Create transaction record - PostgreSQL returns the inserted rows
    const result = await tx.insert(creditTransactions).values({
      userId,
      amount: -amount, // Negative for deductions
      type: "usage",
      description,
      metadata,
      balanceAfter: newBalance,
    }).returning({ id: creditTransactions.id });

    transactionId = result[0]?.id || 0;
  });

  return {
    success: true,
    creditsUsed: amount,
    newBalance,
    transactionId,
  };
}

/**
 * Add credits to user account
 */
export async function addCredits(params: AddCreditsParams) {
  const { userId, amount, type, description, referenceId, metadata } = params;

  if (amount <= 0) {
    throw new Error("Amount must be positive");
  }

  // Get current balance
  const balance = await getCreditBalance(userId);
  if (!balance) {
    throw new Error("User not found");
  }

  const newBalance = balance.credits + amount;

  let transactionId: number = 0;

  // Update user credits and create transaction
  await db.transaction(async (tx) => {
    // Update user credits
    await tx
      .update(users)
      .set({ credits: newBalance })
      .where(eq(users.id, userId));

    // Create transaction record - PostgreSQL returns the inserted rows
    const result = await tx.insert(creditTransactions).values({
      userId,
      amount, // Positive for additions
      type,
      description,
      metadata,
      balanceAfter: newBalance,
      referenceId,
    }).returning({ id: creditTransactions.id });

    transactionId = result[0]?.id || 0;
  });

  return {
    success: true,
    creditsAdded: amount,
    newBalance,
    transactionId,
  };
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
  });
}

/**
 * Get transaction history for a user
 */
export async function getTransactionHistory(params: TransactionHistoryParams) {
  const { userId, limit = 50, offset = 0, type, startDate, endDate } = params;

  const conditions = [eq(creditTransactions.userId, userId)];

  if (type) {
    conditions.push(eq(creditTransactions.type, type));
  }

  if (startDate) {
    conditions.push(gte(creditTransactions.createdAt, startDate));
  }

  if (endDate) {
    conditions.push(lte(creditTransactions.createdAt, endDate));
  }

  const transactions = await db
    .select()
    .from(creditTransactions)
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
 * LLM Model Pricing (per 1M tokens in USD)
 * Based on actual provider costs - update as needed
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  "gpt-4o": { input: 2.50, output: 10.00 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4-turbo": { input: 10.00, output: 30.00 },
  "gpt-4": { input: 30.00, output: 60.00 },
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
  // Try exact match first
  if (MODEL_PRICING[model]) {
    return MODEL_PRICING[model];
  }
  // Try partial match (e.g., "gpt-4o-mini-2024-07-18" -> "gpt-4o-mini")
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(key) || model.includes(key)) {
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
