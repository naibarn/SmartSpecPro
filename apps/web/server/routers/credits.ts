/**
 * Credit Management tRPC Router
 * Handles credit balance, history, packages, and purchases
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import {
  getCreditBalance,
  getTransactionHistory,
  getTransactionHistorySummary,
  getCreditPackages,
  getCreditPackageById,
  addCredits,
  deductCredits,
  getUsageStats,
  getUserOcrUsageSummary,
  getAdminOcrUsageSummary,
  type TransactionType,
} from "../services/creditService";
import {
  getCreditContextReport,
  getCreditContextUsageDetail,
  getCreditContextUsageBySeries,
  getTransactionContextPresentations,
  formatCreditContextReportCsv,
  auditAdminCreditReport,
} from "../services/creditContextReports";
import { CREDIT_CONTEXT_SOURCE_TYPES, CREDIT_CONTEXT_TYPES, CreditContextError, type CreditContextReportFilters } from "../../shared/creditContextContracts";
import { creditSourceTypeEnum } from "../../drizzle/schema";
import {
  getUserBudget,
  setBudgetConfig,
  removeBudget,
} from "../services/budgetService";

// Zod schemas
const transactionTypeSchema = z.enum([
  "purchase",
  "usage",
  "bonus",
  "refund",
  "adjustment",
  "subscription",
]);

const creditSourceTypeSchema = z.enum(creditSourceTypeEnum.enumValues);
const creditContextTypeSchema = z.enum(CREDIT_CONTEXT_TYPES);
const creditContextSourceTypeSchema = z.enum(CREDIT_CONTEXT_SOURCE_TYPES);

const SAFE_METADATA_KEYS = [
  "model",
  "modelId",
  "modelDisplayName",
  "modelUsed",
  "llmModel",
  "apiModelId",
  "provider",
  "providerName",
  "modelProvider",
  "tokensUsed",
  "costUsd",
  "inputTokens",
  "outputTokens",
  "skill",
  "skillName",
  "skillRunId",
  "tenantCredits",
  "skillOwnerCredits",
  "totalSkillCredits",
  "skillRevenueRole",
  "executionMode",
  "runtimeKind",
  "reason",
  "operation",
  "phase",
  "stage",
  "deckId",
  "taskId",
  "slideIndex",
  "slideNumber",
  "totalSlides",
  "mediaType",
  "mediaTaskId",
  "providerTaskId",
  "taskStatus",
  "promptPreview",
  "billingBasis",
  "providerReportedCredits",
  "fallbackCredits",
  "requestType",
  "structured",
  "attempt",
  "endpoint",
  "originSurface",
  "creditCost",
  "duration",
  "textLength",
  "type",
  "actualCost",
  "reservedCost",
  "actualDuration",
  "actualResolution",
  "ocrProvider",
  "pageCount",
  "creditsPerPage",
  "service",
  "source",
  "fileName",
  "fileType",
] as const;

const historyFiltersSchema = z.object({
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
  type: transactionTypeSchema.optional(),
  sourceType: creditSourceTypeSchema.optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
});

const contextReportFiltersSchema = z.object({
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  contextType: creditContextTypeSchema.optional(),
  rootContextId: z.string().uuid().optional(),
  transactionSourceType: creditSourceTypeSchema.optional(),
  contextSourceType: creditContextSourceTypeSchema.optional(),
  skillSlug: z.string().trim().min(1).max(128).optional(),
  includeUnattributed: z.boolean().default(false),
  asOfTransactionId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

function currentTenantId(ctx: { tenantId: string | null; user: { currentTenantId?: string | null } }) {
  return ctx.tenantId ?? ctx.user.currentTenantId ?? null;
}

async function runCreditContextReport<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof CreditContextError) throw error;
    throw new CreditContextError("REPORT_UNAVAILABLE", "Credit usage report is temporarily unavailable");
  }
}

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
        tenantId: currentTenantId(ctx as any),
        limit: input.limit,
        offset: input.offset,
        type: input.type as TransactionType | undefined,
        sourceType: input.sourceType,
        startDate: input.startDate,
        endDate: input.endDate,
      });
      const tenantId = currentTenantId(ctx as any);
      const contextPresentations = tenantId
        ? await getTransactionContextPresentations(transactions.map((t: any) => t.id), { tenantId, userId: ctx.user.id })
        : new Map();

      return transactions.map((t: (typeof transactions)[number]) => {
        const safeMeta = t.metadata
          ? Object.fromEntries(
              Object.entries(t.metadata).filter(([k]) =>
                (SAFE_METADATA_KEYS as readonly string[]).includes(k),
              )
            )
          : null;

        // Truncate conversation title to prevent leaking sensitive content
        const title = t.conversationTitle
          ? t.conversationTitle.length > 50
            ? t.conversationTitle.slice(0, 50) + "…"
            : t.conversationTitle
          : null;

        return {
          id: t.id,
          amount: t.amount,
          type: t.type,
          description: t.description,
          balanceAfter: t.balanceAfter,
          createdAt: t.createdAt,
          metadata: safeMeta,
          traceId: t.traceId,
          conversationId: t.conversationId,
          skillSlug: t.skillSlug,
          skillName: t.skillName,
          sourceType: t.sourceType,
          conversationTitle: title,
          context: contextPresentations.get(t.id) ?? {
            status: "unattributed" as const,
            primaryLabel: null,
            rootLabel: null,
            workTypeLabel: null,
            stageLabel: null,
            technicalRefsAvailable: false,
          },
        };
      });
    }),

  /**
   * Get complete signed credit totals for the current user's filtered history
   */
  historySummary: protectedProcedure
    .input(historyFiltersSchema)
    .query(async ({ ctx, input }) => {
      return getTransactionHistorySummary({
        userId: ctx.user.id,
        tenantId: currentTenantId(ctx as any),
        type: input.type as TransactionType | undefined,
        sourceType: input.sourceType,
        startDate: input.startDate,
        endDate: input.endDate,
      });
    }),

  /**
   * Get available credit packages for purchase
   */
  packages: publicProcedure.query(async () => {
    const packages = await getCreditPackages();
    return packages.map((p: (typeof packages)[number]) => ({
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
   * User: OCR usage summary (daily/weekly/monthly + source breakdown)
   */
  ocrUsageSummary: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      return getUserOcrUsageSummary(ctx.user.id, input.days);
    }),

  /**
   * Admin: OCR usage summary across users
   */
  adminOcrUsageSummary: adminProcedure
    .input(z.object({
      days: z.number().min(1).max(365).default(30),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      tenantId: z.string().trim().min(1).optional(),
    }))
    .query(async ({ ctx, input }) => {
      return getAdminOcrUsageSummary({
        days: input.days,
        limit: input.limit,
        offset: input.offset,
        tenantId: input.tenantId ?? null,
      });
    }),

  /**
   * Admin: OCR usage summary for a specific user
   */
  adminOcrUsageUser: adminProcedure
    .input(z.object({
      userId: z.number(),
      days: z.number().min(1).max(365).default(30),
    }))
    .query(async ({ input }) => {
      return getUserOcrUsageSummary(input.userId, input.days);
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
    .query(async ({ ctx, input }) => {
      const { userId, ...filters } = input;
      const transactions = await getTransactionHistory({
        userId,
        tenantId: currentTenantId(ctx as any),
        ...filters,
        type: filters.type as TransactionType | undefined,
      });
      const tenantId = currentTenantId(ctx as any);
      const contextPresentations = tenantId
        ? await getTransactionContextPresentations(transactions.map((t: any) => t.id), { tenantId })
        : new Map();

      return transactions.map((t: (typeof transactions)[number]) => {
        const safeMeta = t.metadata
          ? Object.fromEntries(
              Object.entries(t.metadata).filter(([k]) =>
                (SAFE_METADATA_KEYS as readonly string[]).includes(k),
              )
            )
          : null;

        const title = t.conversationTitle
          ? t.conversationTitle.length > 50
            ? t.conversationTitle.slice(0, 50) + "…"
            : t.conversationTitle
          : null;

        return {
          id: t.id,
          amount: t.amount,
          type: t.type,
          description: t.description,
          balanceAfter: t.balanceAfter,
          createdAt: t.createdAt,
          metadata: safeMeta,
          traceId: t.traceId,
          conversationId: t.conversationId,
          skillSlug: t.skillSlug,
          skillName: t.skillName,
          sourceType: t.sourceType,
          conversationTitle: title,
          context: contextPresentations.get(t.id) ?? {
            status: "unattributed" as const,
            primaryLabel: null,
            rootLabel: null,
            workTypeLabel: null,
            stageLabel: null,
            technicalRefsAvailable: false,
          },
        };
      });
    }),

  /**
   * Get current user's budget status
   */
  getBudget: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.tenantId) return null;
    const budget = await getUserBudget(ctx.tenantId, ctx.user.id);
    if (!budget) return null;
    return {
      monthlyLimit: budget.monthlyLimit,
      creditsUsedThisMonth: budget.creditsUsedThisMonth,
      budgetMonthKey: budget.budgetMonthKey,
      alertThresholdPct: budget.alertThresholdPct,
      alertSent: budget.alertSent,
      hardCapReached: budget.hardCapReached,
    };
  }),

  usageByContext: protectedProcedure
    .input(contextReportFiltersSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = currentTenantId(ctx as any);
      if (!tenantId) throw new CreditContextError("TENANT_SCOPE_REQUIRED", "Tenant scope is required");
      return runCreditContextReport(() => getCreditContextReport(
        { tenantId, userId: ctx.user.id },
        input as CreditContextReportFilters,
      ));
    }),

  /**
   * Current user's all-time cost summary for one Drama Series. The service
   * keeps the technical context/legacy reconciliation details server-side so
   * the page can show a clear title, credits, and USD estimate only.
   */
  seriesUsageSummary: protectedProcedure
    .input(z.object({ seriesId: z.coerce.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const tenantId = currentTenantId(ctx as any);
      if (!tenantId) throw new CreditContextError("TENANT_SCOPE_REQUIRED", "Tenant scope is required");
      return runCreditContextReport(() => getCreditContextUsageBySeries(
        { tenantId, userId: ctx.user.id },
        input.seriesId,
      ));
    }),

  contextUsageDetail: protectedProcedure
    .input(contextReportFiltersSchema.extend({ contextId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tenantId = currentTenantId(ctx as any);
      if (!tenantId) throw new CreditContextError("TENANT_SCOPE_REQUIRED", "Tenant scope is required");
      return runCreditContextReport(() => getCreditContextUsageDetail(
        { tenantId, userId: ctx.user.id },
        input.contextId,
        { ...input, rootContextId: input.contextId } as CreditContextReportFilters,
      ));
    }),

  exportUsageByContext: protectedProcedure
    .input(contextReportFiltersSchema.extend({ startDate: z.date(), endDate: z.date() }))
    .query(async ({ ctx, input }) => {
      const tenantId = currentTenantId(ctx as any);
      if (!tenantId) throw new CreditContextError("TENANT_SCOPE_REQUIRED", "Tenant scope is required");
      const maxDays = Number(process.env.CREDIT_CONTEXT_MAX_EXPORT_DAYS ?? 366);
      if (input.endDate.getTime() - input.startDate.getTime() > maxDays * 86400000) {
        throw new CreditContextError("EXPORT_RANGE_EXCEEDED", "Credit report export range is too large");
      }
      const report = await runCreditContextReport(() => getCreditContextReport({ tenantId, userId: ctx.user.id }, input as CreditContextReportFilters));
      return { csv: formatCreditContextReportCsv(report), asOfTransactionId: report.pagination.asOfTransactionId };
    }),

  adminUsageByContext: adminProcedure
    .input(contextReportFiltersSchema.extend({ tenantId: z.string().trim().min(1), userId: z.number().int().positive().optional() }))
    .query(async ({ ctx, input }) => {
      const { tenantId, userId, ...filters } = input;
      const report = await runCreditContextReport(() => getCreditContextReport({ tenantId, userId, operatorId: ctx.user.id, isAdmin: true }, filters as CreditContextReportFilters));
      await auditAdminCreditReport({ tenantId, userId, operatorId: ctx.user.id, isAdmin: true }, filters as CreditContextReportFilters, "credit_admin_usage_report_viewed");
      return report;
    }),

  adminContextUsageDetail: adminProcedure
    .input(contextReportFiltersSchema.extend({ tenantId: z.string().trim().min(1), userId: z.number().int().positive().optional(), contextId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { tenantId, userId, contextId, ...filters } = input;
      const report = await runCreditContextReport(() => getCreditContextUsageDetail({ tenantId, userId, operatorId: ctx.user.id, isAdmin: true }, contextId, { ...filters, rootContextId: contextId } as CreditContextReportFilters));
      await auditAdminCreditReport({ tenantId, userId, operatorId: ctx.user.id, isAdmin: true }, { ...filters, rootContextId: contextId } as CreditContextReportFilters, "credit_admin_context_detail_viewed");
      return report;
    }),

  adminExportUsageByContext: adminProcedure
    .input(contextReportFiltersSchema.extend({ tenantId: z.string().trim().min(1), userId: z.number().int().positive().optional(), startDate: z.date(), endDate: z.date() }))
    .query(async ({ ctx, input }) => {
      const { tenantId, userId, ...filters } = input;
      const maxDays = Number(process.env.CREDIT_CONTEXT_MAX_EXPORT_DAYS ?? 366);
      if (input.endDate.getTime() - input.startDate.getTime() > maxDays * 86400000) throw new CreditContextError("EXPORT_RANGE_EXCEEDED", "Credit report export range is too large");
      const report = await runCreditContextReport(() => getCreditContextReport({ tenantId, userId, operatorId: ctx.user.id, isAdmin: true }, filters as CreditContextReportFilters));
      await auditAdminCreditReport({ tenantId, userId, operatorId: ctx.user.id, isAdmin: true }, filters as CreditContextReportFilters);
      return { csv: formatCreditContextReportCsv(report), asOfTransactionId: report.pagination.asOfTransactionId };
    }),

  /**
   * Set or update the user's monthly budget configuration
   */
  setBudget: protectedProcedure
    .input(
      z.object({
        monthlyLimit: z.number().int().min(1),
        alertThresholdPct: z.number().int().min(1).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.tenantId) throw new Error("Tenant context required");
      await setBudgetConfig(ctx.tenantId, ctx.user.id, {
        monthlyLimit: input.monthlyLimit,
        alertThresholdPct: input.alertThresholdPct,
      });
      return { success: true };
    }),

  /**
   * Remove the budget limit (set to unlimited)
   */
  resetBudget: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.tenantId) throw new Error("Tenant context required");
    await removeBudget(ctx.tenantId, ctx.user.id);
    return { success: true };
  }),
});
