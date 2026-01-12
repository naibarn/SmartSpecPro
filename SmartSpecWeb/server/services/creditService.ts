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

  // Update user credits and create transaction in a transaction
  await db.transaction(async (tx) => {
    // Update user credits
    await tx
      .update(users)
      .set({ credits: newBalance })
      .where(eq(users.id, userId));

    // Create transaction record
    await tx.insert(creditTransactions).values({
      userId,
      amount: -amount, // Negative for deductions
      type: "usage",
      description,
      metadata,
      balanceAfter: newBalance,
    });
  });

  return {
    success: true,
    creditsUsed: amount,
    creditsRemaining: newBalance,
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

  // Update user credits and create transaction
  await db.transaction(async (tx) => {
    // Update user credits
    await tx
      .update(users)
      .set({ credits: newBalance })
      .where(eq(users.id, userId));

    // Create transaction record
    await tx.insert(creditTransactions).values({
      userId,
      amount, // Positive for additions
      type,
      description,
      metadata,
      balanceAfter: newBalance,
      referenceId,
    });
  });

  return {
    success: true,
    creditsAdded: amount,
    creditsBalance: newBalance,
  };
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
 * Calculate credits needed for LLM usage based on tokens
 * 
 * Pricing model (example):
 * - 1 credit = 1000 tokens (input)
 * - 1 credit = 500 tokens (output)
 * - Minimum 1 credit per request
 */
export function calculateCreditsForLLM(inputTokens: number, outputTokens: number): number {
  const inputCredits = Math.ceil(inputTokens / 1000);
  const outputCredits = Math.ceil(outputTokens / 500);
  return Math.max(1, inputCredits + outputCredits);
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
