/**
 * Credit Management tRPC Router
 * Handles credit balance, history, packages, and purchases
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import {
  getCreditBalance,
  getTransactionHistory,
  getCreditPackages,
  getCreditPackageById,
  addCredits,
  deductCredits,
  getUsageStats,
  type TransactionType,
} from "../services/creditService";

// Zod schemas
const transactionTypeSchema = z.enum([
  "purchase",
  "usage",
  "bonus",
  "refund",
  "adjustment",
  "subscription",
]);

const historyFiltersSchema = z.object({
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
  type: transactionTypeSchema.optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
});

export const creditsRouter = router({
  /**
   * Get current user's credit balance
   */
  balance: protectedProcedure.query(async ({ ctx }) => {
    const balance = await getCreditBalance(ctx.user.id);
    return {
      credits: balance?.credits ?? 0,
      plan: balance?.plan ?? "free",
    };
  }),

  /**
   * Get current user's transaction history
   */
  history: protectedProcedure
    .input(historyFiltersSchema)
    .query(async ({ ctx, input }) => {
      const transactions = await getTransactionHistory({
        userId: ctx.user.id,
        limit: input.limit,
        offset: input.offset,
        type: input.type as TransactionType | undefined,
        startDate: input.startDate,
        endDate: input.endDate,
      });

      return transactions.map((t) => ({
        id: t.id,
        amount: t.amount,
        type: t.type,
        description: t.description,
        balanceAfter: t.balanceAfter,
        createdAt: t.createdAt,
        metadata: t.metadata,
      }));
    }),

  /**
   * Get available credit packages for purchase
   */
  packages: publicProcedure.query(async () => {
    const packages = await getCreditPackages();
    return packages.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      credits: p.credits,
      priceUsd: parseFloat(p.priceUsd),
      isFeatured: p.isFeatured,
    }));
  }),

  /**
   * Get usage statistics for current user
   */
  stats: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      return getUsageStats(ctx.user.id, input.days);
    }),

  /**
   * Admin: Add credits to a user
   */
  adminAddCredits: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        amount: z.number().min(1),
        type: transactionTypeSchema,
        description: z.string().min(1).max(512),
        referenceId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return addCredits({
        userId: input.userId,
        amount: input.amount,
        type: input.type as TransactionType,
        description: input.description,
        referenceId: input.referenceId,
      });
    }),

  /**
   * Admin: Deduct credits from a user (for adjustments)
   */
  adminDeductCredits: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        amount: z.number().min(1),
        description: z.string().min(1).max(512),
      })
    )
    .mutation(async ({ input }) => {
      return deductCredits({
        userId: input.userId,
        amount: input.amount,
        description: input.description,
        metadata: { reason: "admin_adjustment" },
      });
    }),

  /**
   * Admin: Get any user's credit balance
   */
  adminGetBalance: adminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      return getCreditBalance(input.userId);
    }),

  /**
   * Admin: Get any user's transaction history
   */
  adminGetHistory: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        ...historyFiltersSchema.shape,
      })
    )
    .query(async ({ input }) => {
      const { userId, ...filters } = input;
      return getTransactionHistory({
        userId,
        ...filters,
        type: filters.type as TransactionType | undefined,
      });
    }),
});
