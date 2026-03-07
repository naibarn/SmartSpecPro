/**
 * Usage Analytics tRPC Router
 *
 * User-facing endpoints for personal usage stats + admin override.
 * - getUserOverview: aggregate stats (requests, credits, cost, breakdowns)
 * - getUserTransactions: paginated history from providerUsageLog + apiAuditEvents
 * - getTransactionPayload: JSONL entries (ownership-verified)
 * - getAdminUserUsage: admin can view any user's overview
 */

import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  providerUsageLog,
  apiAuditEvents,
  llmProviders,
} from "../../drizzle/schema";
import { eq, and, gte, lte, desc, sql, isNotNull } from "drizzle-orm";
import { auditLogger } from "../services/auditLogger";

const dateRangeInput = z.object({
  days: z.number().min(1).max(90).default(7),
});

export const usageRouter = router({
  /**
   * Get user's own usage overview
   */
  getUserOverview: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      return fetchUserOverview(ctx.user.id, input.days);
    }),

  /**
   * Get paginated transaction history (LLM + Media merged).
   * Admin can pass userId to view another user's transactions.
   */
  getUserTransactions: protectedProcedure
    .input(
      z.object({
        days: z.number().min(1).max(90).default(7),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        userId: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      let targetUserId = ctx.user.id;
      if (input.userId && ctx.user.role === "admin") {
        targetUserId = input.userId;
      }
      return fetchUserTransactions(targetUserId, input.days, input.limit, input.offset);
    }),

  /**
   * Get full transaction detail (ownership-verified).
   * Supports lookup by traceId OR by id+type (for records without traceId).
   * Returns:
   *  - summary: structured data from DB (always available)
   *  - entries: JSONL audit log entries with request/response payloads (when available)
   */
  getTransactionPayload: protectedProcedure
    .input(
      z.object({
        traceId: z.string().min(1).max(128).optional(),
        txId: z.number().optional(),
        txType: z.enum(["llm", "media"]).optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().refine(
          (val) => {
            if (!val) return true;
            const d = new Date(val);
            if (isNaN(d.getTime())) return false;
            const now = new Date();
            now.setDate(now.getDate() + 1); // allow today
            const minDate = new Date();
            minDate.setDate(minDate.getDate() - 90); // max 90 days back
            return d <= now && d >= minDate;
          },
          { message: "Date must be a valid date within the last 90 days" },
        ),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { entries: [], summary: null, authorized: false };

      let llmRow: any = null;
      let mediaRow: any = null;

      const llmSelect = {
        id: providerUsageLog.id,
        userId: providerUsageLog.userId,
        modelUsed: providerUsageLog.modelUsed,
        providerName: sql<string>`coalesce(${llmProviders.providerName}, 'Unknown')`,
        inputTokens: providerUsageLog.inputTokens,
        outputTokens: providerUsageLog.outputTokens,
        costUsd: providerUsageLog.costUsd,
        creditsCharged: providerUsageLog.creditsCharged,
        responseTimeMs: providerUsageLog.responseTimeMs,
        statusCode: providerUsageLog.statusCode,
        errorType: providerUsageLog.errorType,
        errorMessage: providerUsageLog.errorMessage,
        wasFallback: providerUsageLog.wasFallback,
        fallbackFromProviderId: providerUsageLog.fallbackFromProviderId,
        requestType: providerUsageLog.requestType,
        traceId: providerUsageLog.traceId,
        createdAt: providerUsageLog.createdAt,
      };

      const mediaSelect = {
        id: apiAuditEvents.id,
        userId: apiAuditEvents.userId,
        eventType: apiAuditEvents.eventType,
        model: apiAuditEvents.model,
        provider: apiAuditEvents.provider,
        endpoint: apiAuditEvents.endpoint,
        statusCode: apiAuditEvents.statusCode,
        errorMessage: apiAuditEvents.errorMessage,
        responseTimeMs: apiAuditEvents.responseTimeMs,
        creditsCharged: apiAuditEvents.creditsCharged,
        costUsd: apiAuditEvents.costUsd,
        skillSlug: apiAuditEvents.skillSlug,
        mediaType: apiAuditEvents.mediaType,
        mediaTaskId: apiAuditEvents.mediaTaskId,
        metadata: apiAuditEvents.metadata,
        traceId: apiAuditEvents.traceId,
        createdAt: apiAuditEvents.createdAt,
      };

      // Lookup by traceId (preferred) or by id+type (fallback)
      if (input.traceId) {
        [llmRow] = await db.select(llmSelect)
          .from(providerUsageLog)
          .leftJoin(llmProviders, eq(providerUsageLog.providerId, llmProviders.id))
          .where(eq(providerUsageLog.traceId, input.traceId))
          .limit(1);

        [mediaRow] = await db.select(mediaSelect)
          .from(apiAuditEvents)
          .where(eq(apiAuditEvents.traceId, input.traceId))
          .limit(1);
      } else if (input.txId && input.txType) {
        if (input.txType === "llm") {
          [llmRow] = await db.select(llmSelect)
            .from(providerUsageLog)
            .leftJoin(llmProviders, eq(providerUsageLog.providerId, llmProviders.id))
            .where(eq(providerUsageLog.id, input.txId))
            .limit(1);
        } else {
          [mediaRow] = await db.select(mediaSelect)
            .from(apiAuditEvents)
            .where(eq(apiAuditEvents.id, input.txId))
            .limit(1);
        }
      } else {
        return { entries: [], summary: null, authorized: false };
      }

      // Ownership check
      const ownerId = llmRow?.userId ?? mediaRow?.userId;
      if (ownerId !== ctx.user.id && ctx.user.role !== "admin") {
        return { entries: [], summary: null, authorized: false };
      }

      // Look up original provider name for fallback chain
      let fallbackFromProviderName: string | null = null;
      if (llmRow?.wasFallback && llmRow?.fallbackFromProviderId) {
        const [origProvider] = await db.select({ name: llmProviders.providerName })
          .from(llmProviders)
          .where(eq(llmProviders.id, llmRow.fallbackFromProviderId))
          .limit(1);
        fallbackFromProviderName = origProvider?.name ?? null;
      }

      // Read JSONL entries for request/response payloads (only if traceId exists)
      const resolvedTraceId = input.traceId || llmRow?.traceId || mediaRow?.traceId;
      let entries: any[] = [];
      if (resolvedTraceId) {
        const preferredDate =
          input.date
            ? new Date(`${input.date}T00:00:00.000Z`)
            : llmRow?.createdAt
              ? new Date(llmRow.createdAt)
              : mediaRow?.createdAt
                ? new Date(mediaRow.createdAt)
                : new Date();
        entries = await readAuditEntriesWithFallback({
          traceId: resolvedTraceId,
          preferredDate,
          limit: 100,
        });
      }

      // Extract costCalculationMethod and timing from JSONL entries (if available)
      const llmResponseEntry = entries.find((e: any) => e.eventType === "llm_response" && !e.errorType);
      const costCalculationMethod = llmResponseEntry?.costCalculationMethod ?? null;
      const timingBreakdown = llmResponseEntry?.timing ?? null;

      // Build structured summary from DB data
      const summary = llmRow
        ? {
            source: "llm" as const,
            model: llmRow.modelUsed,
            provider: llmRow.providerName,
            inputTokens: llmRow.inputTokens,
            outputTokens: llmRow.outputTokens,
            costUsd: Number(llmRow.costUsd),
            creditsCharged: llmRow.creditsCharged,
            responseTimeMs: llmRow.responseTimeMs,
            statusCode: llmRow.statusCode,
            errorType: llmRow.errorType,
            errorMessage: llmRow.errorMessage,
            wasFallback: llmRow.wasFallback,
            fallbackFromProviderName,
            costCalculationMethod,
            timingBreakdown,
            requestType: llmRow.requestType,
            createdAt: llmRow.createdAt,
          }
        : mediaRow
          ? {
              source: "media" as const,
              model: mediaRow.model,
              provider: mediaRow.provider,
              eventType: mediaRow.eventType,
              mediaType: mediaRow.mediaType,
              skillSlug: mediaRow.skillSlug,
              mediaTaskId: mediaRow.mediaTaskId,
              endpoint: mediaRow.endpoint,
              costUsd: Number(mediaRow.costUsd || 0),
              creditsCharged: mediaRow.creditsCharged,
              responseTimeMs: mediaRow.responseTimeMs,
              statusCode: mediaRow.statusCode,
              errorMessage: mediaRow.errorMessage,
              metadata: mediaRow.metadata,
              createdAt: mediaRow.createdAt,
            }
          : null;

      // Strip internal fields from JSONL entries before returning to users
      const internalKeys = new Set(["fallbackFromProviderId", "providerId", "userId"]);
      const sanitizedEntries = entries.map((e: any) => {
        const cleaned = { ...e };
        for (const key of internalKeys) {
          delete cleaned[key];
        }
        return cleaned;
      });

      return { entries: sanitizedEntries, summary, authorized: true };
    }),

  /**
   * Admin: get any user's usage overview
   */
  getAdminUserUsage: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        days: z.number().min(1).max(90).default(7),
      })
    )
    .query(async ({ input }) => {
      return fetchUserOverview(input.userId, input.days);
    }),

  /**
   * Admin: get system-wide transactions (all users), filterable by type
   */
  getAdminTransactions: adminProcedure
    .input(
      z.object({
        days: z.number().min(1).max(90).default(7),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        type: z.enum(["llm", "media", "all"]).default("all"),
      })
    )
    .query(async ({ input }) => {
      return fetchAdminTransactions(input.days, input.limit, input.offset, input.type);
    }),

  /**
   * Admin: get all users list for the selector dropdown
   */
  getUsers: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { users: [] };

    const { users } = await import("../../drizzle/schema");
    const result = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .orderBy(users.name)
      .limit(500);

    return { users: result };
  }),
});

// --- Shared helpers ---

async function fetchUserOverview(userId: number, days: number) {
  const db = await getDb();
  if (!db) {
    return {
      totalRequests: 0,
      totalCredits: 0,
      totalCost: 0,
      activeModels: 0,
      providerBreakdown: [] as any[],
      modelBreakdown: [] as any[],
    };
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  const conditions = [
    eq(providerUsageLog.userId, userId),
    gte(providerUsageLog.createdAt, since),
  ];

  // Totals
  const [totals] = await db
    .select({
      totalRequests: sql<number>`count(*)::int`,
      totalCost: sql<number>`coalesce(sum(${providerUsageLog.costUsd}::numeric), 0)::float`,
      totalCredits: sql<number>`coalesce(sum(${providerUsageLog.creditsCharged}), 0)::int`,
      activeModels: sql<number>`count(distinct ${providerUsageLog.modelUsed})::int`,
    })
    .from(providerUsageLog)
    .where(and(...conditions));

  // By provider
  const providerBreakdown = await db
    .select({
      providerId: providerUsageLog.providerId,
      providerName: sql<string>`coalesce(${llmProviders.providerName}, 'Unknown')`,
      requests: sql<number>`count(*)::int`,
      totalCost: sql<number>`coalesce(sum(${providerUsageLog.costUsd}::numeric), 0)::float`,
      totalCredits: sql<number>`coalesce(sum(${providerUsageLog.creditsCharged}), 0)::int`,
    })
    .from(providerUsageLog)
    .leftJoin(llmProviders, eq(providerUsageLog.providerId, llmProviders.id))
    .where(and(...conditions))
    .groupBy(providerUsageLog.providerId, llmProviders.providerName)
    .orderBy(desc(sql`count(*)`));

  // By model
  const modelBreakdown = await db
    .select({
      model: providerUsageLog.modelUsed,
      requests: sql<number>`count(*)::int`,
      totalCredits: sql<number>`coalesce(sum(${providerUsageLog.creditsCharged}), 0)::int`,
      totalCost: sql<number>`coalesce(sum(${providerUsageLog.costUsd}::numeric), 0)::float`,
    })
    .from(providerUsageLog)
    .where(and(...conditions))
    .groupBy(providerUsageLog.modelUsed)
    .orderBy(desc(sql`count(*)`))
    .limit(20);

  return {
    totalRequests: totals?.totalRequests ?? 0,
    totalCredits: totals?.totalCredits ?? 0,
    totalCost: totals?.totalCost ?? 0,
    activeModels: totals?.activeModels ?? 0,
    providerBreakdown,
    modelBreakdown,
  };
}

async function fetchUserTransactions(
  userId: number,
  days: number,
  limit: number,
  offset: number,
) {
  const db = await getDb();
  if (!db) return { transactions: [], total: 0 };

  const since = new Date();
  since.setDate(since.getDate() - days);

  const fetchLimit = offset + limit;

  // LLM transactions from providerUsageLog
  const llmRows = await db
    .select({
      id: providerUsageLog.id,
      type: sql<string>`'llm'`,
      model: providerUsageLog.modelUsed,
      providerName: sql<string>`coalesce(${llmProviders.providerName}, 'Unknown')`,
      creditsCharged: providerUsageLog.creditsCharged,
      costUsd: providerUsageLog.costUsd,
      statusCode: providerUsageLog.statusCode,
      errorType: providerUsageLog.errorType,
      errorMessage: providerUsageLog.errorMessage,
      responseTimeMs: providerUsageLog.responseTimeMs,
      inputTokens: providerUsageLog.inputTokens,
      outputTokens: providerUsageLog.outputTokens,
      traceId: providerUsageLog.traceId,
      requestType: providerUsageLog.requestType,
      createdAt: providerUsageLog.createdAt,
    })
    .from(providerUsageLog)
    .leftJoin(llmProviders, eq(providerUsageLog.providerId, llmProviders.id))
    .where(
      and(
        eq(providerUsageLog.userId, userId),
        gte(providerUsageLog.createdAt, since),
      )
    )
    .orderBy(desc(providerUsageLog.createdAt))
    .limit(fetchLimit);

  // Media/skill transactions from apiAuditEvents
  const mediaRows = await db
    .select({
      id: apiAuditEvents.id,
      type: sql<string>`'media'`,
      model: sql<string>`coalesce(${apiAuditEvents.model}, '')`,
      providerName: sql<string>`coalesce(${apiAuditEvents.provider}, 'Unknown')`,
      creditsCharged: apiAuditEvents.creditsCharged,
      costUsd: apiAuditEvents.costUsd,
      statusCode: apiAuditEvents.statusCode,
      errorType: sql<string | null>`${apiAuditEvents.errorMessage}`,
      errorMessage: apiAuditEvents.errorMessage,
      responseTimeMs: apiAuditEvents.responseTimeMs,
      inputTokens: sql<number | null>`null::int`,
      outputTokens: sql<number | null>`null::int`,
      traceId: apiAuditEvents.traceId,
      requestType: sql<string>`coalesce(${apiAuditEvents.mediaType}, ${apiAuditEvents.eventType})`,
      createdAt: apiAuditEvents.createdAt,
    })
    .from(apiAuditEvents)
    .where(
      and(
        eq(apiAuditEvents.userId, userId),
        gte(apiAuditEvents.createdAt, since),
      )
    )
    .orderBy(desc(apiAuditEvents.createdAt))
    .limit(fetchLimit);

  // Total counts (parallel)
  const [[llmCount], [mediaCount]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(providerUsageLog)
      .where(
        and(
          eq(providerUsageLog.userId, userId),
          gte(providerUsageLog.createdAt, since),
        )
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(apiAuditEvents)
      .where(
        and(
          eq(apiAuditEvents.userId, userId),
          gte(apiAuditEvents.createdAt, since),
        )
      ),
  ]);

  // Merge both sources, sort by createdAt desc, paginate
  const merged = [
    ...llmRows.map((r) => ({ ...r, costUsd: Number(r.costUsd) })),
    ...mediaRows.map((r) => ({ ...r, costUsd: Number(r.costUsd) })),
  ]
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    })
    .slice(offset, offset + limit);

  return {
    transactions: merged,
    total: (llmCount?.count ?? 0) + (mediaCount?.count ?? 0),
  };
}

async function fetchAdminTransactions(
  days: number,
  limit: number,
  offset: number,
  type: "llm" | "media" | "all",
) {
  const db = await getDb();
  if (!db) return { transactions: [], total: 0 };

  const since = new Date();
  since.setDate(since.getDate() - days);
  const fetchLimit = offset + limit;

  const { users } = await import("../../drizzle/schema");

  let llmRows: any[] = [];
  let mediaRows: any[] = [];
  let llmTotal = 0;
  let mediaTotal = 0;

  if (type === "llm" || type === "all") {
    llmRows = await db
      .select({
        id: providerUsageLog.id,
        type: sql<string>`'llm'`,
        model: providerUsageLog.modelUsed,
        providerName: sql<string>`coalesce(${llmProviders.providerName}, 'Unknown')`,
        creditsCharged: providerUsageLog.creditsCharged,
        costUsd: providerUsageLog.costUsd,
        statusCode: providerUsageLog.statusCode,
        errorType: providerUsageLog.errorType,
        errorMessage: providerUsageLog.errorMessage,
        responseTimeMs: providerUsageLog.responseTimeMs,
        inputTokens: providerUsageLog.inputTokens,
        outputTokens: providerUsageLog.outputTokens,
        traceId: providerUsageLog.traceId,
        requestType: providerUsageLog.requestType,
        createdAt: providerUsageLog.createdAt,
        userId: providerUsageLog.userId,
        userName: sql<string>`coalesce(${users.name}, ${users.email}, 'User #' || ${providerUsageLog.userId})`,
      })
      .from(providerUsageLog)
      .leftJoin(llmProviders, eq(providerUsageLog.providerId, llmProviders.id))
      .leftJoin(users, eq(providerUsageLog.userId, users.id))
      .where(gte(providerUsageLog.createdAt, since))
      .orderBy(desc(providerUsageLog.createdAt))
      .limit(fetchLimit);

    const [c] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(providerUsageLog)
      .where(gte(providerUsageLog.createdAt, since));
    llmTotal = c?.count ?? 0;
  }

  if (type === "media" || type === "all") {
    mediaRows = await db
      .select({
        id: apiAuditEvents.id,
        type: sql<string>`'media'`,
        model: sql<string>`coalesce(${apiAuditEvents.model}, '')`,
        providerName: sql<string>`coalesce(${apiAuditEvents.provider}, 'Unknown')`,
        creditsCharged: apiAuditEvents.creditsCharged,
        costUsd: apiAuditEvents.costUsd,
        statusCode: apiAuditEvents.statusCode,
        errorType: sql<string | null>`${apiAuditEvents.errorMessage}`,
        errorMessage: apiAuditEvents.errorMessage,
        responseTimeMs: apiAuditEvents.responseTimeMs,
        inputTokens: sql<number | null>`null::int`,
        outputTokens: sql<number | null>`null::int`,
        traceId: apiAuditEvents.traceId,
        requestType: sql<string>`coalesce(${apiAuditEvents.mediaType}, ${apiAuditEvents.eventType})`,
        createdAt: apiAuditEvents.createdAt,
        userId: apiAuditEvents.userId,
        userName: sql<string>`coalesce(${users.name}, ${users.email}, 'User #' || ${apiAuditEvents.userId})`,
      })
      .from(apiAuditEvents)
      .leftJoin(users, eq(apiAuditEvents.userId, users.id))
      .where(gte(apiAuditEvents.createdAt, since))
      .orderBy(desc(apiAuditEvents.createdAt))
      .limit(fetchLimit);

    const [c] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(apiAuditEvents)
      .where(gte(apiAuditEvents.createdAt, since));
    mediaTotal = c?.count ?? 0;
  }

  const merged = [
    ...llmRows.map((r) => ({ ...r, costUsd: Number(r.costUsd) })),
    ...mediaRows.map((r) => ({ ...r, costUsd: Number(r.costUsd) })),
  ]
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    })
    .slice(offset, offset + limit);

  return {
    transactions: merged,
    total: llmTotal + mediaTotal,
  };
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

async function readAuditEntriesWithFallback(opts: {
  traceId: string;
  preferredDate: Date;
  limit?: number;
}): Promise<any[]> {
  const limit = opts.limit ?? 100;
  const merged = new Map<string, any>();
  const seenDates = new Set<string>();

  const collect = async (date: Date) => {
    const day = toIsoDate(date);
    if (seenDates.has(day)) return;
    seenDates.add(day);

    const rows = await auditLogger.readEntries({
      date,
      traceId: opts.traceId,
      limit,
    });
    for (const row of rows) {
      const key = [
        row.timestamp ?? "",
        row.eventType ?? "",
        row.model ?? "",
        row.statusCode ?? "",
        row.requestType ?? "",
      ].join("|");
      if (!merged.has(key)) {
        merged.set(key, row);
      }
    }
  };

  for (const offset of [-1, 0, 1]) {
    await collect(addDays(opts.preferredDate, offset));
  }

  if (merged.size === 0) {
    const today = new Date();
    for (let offset = 0; offset > -7; offset -= 1) {
      await collect(addDays(today, offset));
      if (merged.size >= limit) break;
    }
  }

  return [...merged.values()]
    .sort((a, b) => {
      const ta = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b?.timestamp ? new Date(b.timestamp).getTime() : 0;
      return ta - tb;
    })
    .slice(0, limit);
}
