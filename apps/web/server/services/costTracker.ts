import { eq, and, gte, lte, sql, isNotNull } from "drizzle-orm";
import { getDb } from "../db";
import { providerUsageLog, modelProviderMap, llmProviders } from "../../drizzle/schema";

// --- Constants ---

const DEFAULT_INPUT_PRICE_PER_1M = 1.0;
const DEFAULT_OUTPUT_PRICE_PER_1M = 4.0;

// --- Request Logging ---

export async function logRequest(params: {
  userId: number;
  providerId: number;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  creditsCharged: number;
  responseTimeMs: number;
  statusCode: number;
  errorType?: string;
  wasFallback: boolean;
  fallbackFromProviderId?: number;
  traceId?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(providerUsageLog).values({
    userId: params.userId,
    providerId: params.providerId,
    modelUsed: params.modelUsed,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    costUsd: String(params.costUsd),
    creditsCharged: params.creditsCharged,
    responseTimeMs: params.responseTimeMs,
    statusCode: params.statusCode,
    errorType: params.errorType ?? null,
    wasFallback: params.wasFallback,
    fallbackFromProviderId: params.fallbackFromProviderId ?? null,
    traceId: params.traceId ?? null,
  });
}

// --- Cost Calculation ---

export type CostMethod = "provider_reported" | "model_lookup" | "default_rate";

export async function calculateCost(params: {
  providerReportedCost?: number;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<{ cost: number; method: CostMethod }> {
  // Priority 1: Provider-reported cost
  if (params.providerReportedCost != null && params.providerReportedCost > 0) {
    return { cost: params.providerReportedCost, method: "provider_reported" };
  }

  // Priority 2: Model pricing from model_provider_map
  const db = await getDb();
  if (db) {
    const rows = await db
      .select({
        pricingInput: modelProviderMap.pricingInput,
        pricingOutput: modelProviderMap.pricingOutput,
        isFree: modelProviderMap.isFree,
      })
      .from(modelProviderMap)
      .where(
        and(
          eq(modelProviderMap.modelId, params.modelId),
          eq(modelProviderMap.isEnabled, true),
        )
      )
      .limit(1);

    if (rows.length > 0) {
      const row = rows[0];
      if (row.isFree) return { cost: 0, method: "model_lookup" };
      const inputCost = (params.inputTokens / 1_000_000) * Number(row.pricingInput);
      const outputCost = (params.outputTokens / 1_000_000) * Number(row.pricingOutput);
      return { cost: inputCost + outputCost, method: "model_lookup" };
    }
  }

  // Priority 3: Default pricing
  const inputCost = (params.inputTokens / 1_000_000) * DEFAULT_INPUT_PRICE_PER_1M;
  const outputCost = (params.outputTokens / 1_000_000) * DEFAULT_OUTPUT_PRICE_PER_1M;
  return { cost: inputCost + outputCost, method: "default_rate" };
}

// --- Dashboard Aggregation ---

export interface AdminUsageStats {
  totalRequests: number;
  totalCostUsd: number;
  costByProvider: Array<{ providerId: number; providerName: string; totalCost: number; requestCount: number }>;
  costByModel: Array<{ model: string; totalCost: number; requestCount: number }>;
  errorRate: number;
  topUsers: Array<{ userId: number; totalCost: number; requestCount: number }>;
}

export async function getAdminUsageStats(filters: {
  dateRange: { start: Date; end: Date };
  providerId?: number;
  userId?: number;
}): Promise<AdminUsageStats> {
  const db = await getDb();
  if (!db) {
    return { totalRequests: 0, totalCostUsd: 0, costByProvider: [], costByModel: [], errorRate: 0, topUsers: [] };
  }

  const conditions = [
    gte(providerUsageLog.createdAt, filters.dateRange.start),
    lte(providerUsageLog.createdAt, filters.dateRange.end),
  ];
  if (filters.providerId != null) {
    conditions.push(eq(providerUsageLog.providerId, filters.providerId));
  }
  if (filters.userId != null) {
    conditions.push(eq(providerUsageLog.userId, filters.userId));
  }

  // Total stats
  const [totals] = await db
    .select({
      count: sql<number>`count(*)::int`,
      totalCost: sql<number>`coalesce(sum(${providerUsageLog.costUsd}::numeric), 0)::float`,
      errorCount: sql<number>`count(*) filter (where ${providerUsageLog.errorType} is not null)::int`,
    })
    .from(providerUsageLog)
    .where(and(...conditions));

  // By provider (join with llmProviders for name)
  const byProvider = await db
    .select({
      providerId: providerUsageLog.providerId,
      providerName: sql<string>`coalesce(${llmProviders.providerName}, 'Unknown')`,
      totalCost: sql<number>`coalesce(sum(${providerUsageLog.costUsd}::numeric), 0)::float`,
      requestCount: sql<number>`count(*)::int`,
    })
    .from(providerUsageLog)
    .leftJoin(llmProviders, eq(providerUsageLog.providerId, llmProviders.id))
    .where(and(...conditions))
    .groupBy(providerUsageLog.providerId, llmProviders.providerName);

  // By model
  const byModel = await db
    .select({
      model: providerUsageLog.modelUsed,
      totalCost: sql<number>`coalesce(sum(${providerUsageLog.costUsd}::numeric), 0)::float`,
      requestCount: sql<number>`count(*)::int`,
    })
    .from(providerUsageLog)
    .where(and(...conditions))
    .groupBy(providerUsageLog.modelUsed);

  // Top users
  const topUsers = await db
    .select({
      userId: providerUsageLog.userId,
      totalCost: sql<number>`coalesce(sum(${providerUsageLog.costUsd}::numeric), 0)::float`,
      requestCount: sql<number>`count(*)::int`,
    })
    .from(providerUsageLog)
    .where(and(...conditions))
    .groupBy(providerUsageLog.userId);

  const totalRequests = totals?.count ?? 0;

  return {
    totalRequests,
    totalCostUsd: totals?.totalCost ?? 0,
    costByProvider: byProvider,
    costByModel: byModel,
    errorRate: totalRequests > 0 ? (totals?.errorCount ?? 0) / totalRequests : 0,
    topUsers,
  };
}

export interface UserUsageStats {
  totalRequests: number;
  totalCostUsd: number;
  totalCreditsUsed: number;
  modelBreakdown: Array<{ model: string; requestCount: number; creditsUsed: number }>;
}

export async function getUserUsageStats(
  userId: number,
  dateRange: { start: Date; end: Date },
): Promise<UserUsageStats> {
  const db = await getDb();
  if (!db) {
    return { totalRequests: 0, totalCostUsd: 0, totalCreditsUsed: 0, modelBreakdown: [] };
  }

  const conditions = [
    eq(providerUsageLog.userId, userId),
    gte(providerUsageLog.createdAt, dateRange.start),
    lte(providerUsageLog.createdAt, dateRange.end),
  ];

  const [totals] = await db
    .select({
      count: sql<number>`count(*)::int`,
      totalCost: sql<number>`coalesce(sum(${providerUsageLog.costUsd}::numeric), 0)::float`,
      totalCredits: sql<number>`coalesce(sum(${providerUsageLog.creditsCharged}), 0)::int`,
    })
    .from(providerUsageLog)
    .where(and(...conditions));

  const byModel = await db
    .select({
      model: providerUsageLog.modelUsed,
      requestCount: sql<number>`count(*)::int`,
      creditsUsed: sql<number>`coalesce(sum(${providerUsageLog.creditsCharged}), 0)::int`,
    })
    .from(providerUsageLog)
    .where(and(...conditions))
    .groupBy(providerUsageLog.modelUsed);

  return {
    totalRequests: totals?.count ?? 0,
    totalCostUsd: totals?.totalCost ?? 0,
    totalCreditsUsed: totals?.totalCredits ?? 0,
    modelBreakdown: byModel,
  };
}
