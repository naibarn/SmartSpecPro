/**
 * Content Quality Dashboard tRPC Router — Spec 038 Section 10
 *
 * Aggregation queries for content quality metrics.
 */

import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { db } from "../db";
import { contentArtifacts, providerUsageLog, users } from "../../drizzle/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";

function getTenantId(ctx: { tenantId: string | null }): string {
  return ctx.tenantId ?? "default";
}

export const contentQualityRouter = router({
  getOverview: adminProcedure.query(async ({ ctx }) => {
    const tenantId = getTenantId(ctx);

    const rows: { status: string; count: number }[] = await db
      .select({
        status: contentArtifacts.status,
        count: sql<number>`count(*)::int`,
      })
      .from(contentArtifacts)
      .where(eq(contentArtifacts.tenantId, tenantId))
      .groupBy(contentArtifacts.status);

    const total = rows.reduce((sum: number, r: { count: number }) => sum + r.count, 0);
    const active = rows.find((r: { status: string }) => r.status === "active")?.count ?? 0;
    const stale = rows.find((r: { status: string }) => r.status === "stale")?.count ?? 0;

    // Avg citation coverage from qualityScore JSONB
    const [coverageRow] = await db
      .select({
        avg_coverage: sql<number>`COALESCE(AVG((${contentArtifacts.qualityScore}->>'citation_coverage')::float), 0)`,
      })
      .from(contentArtifacts)
      .where(eq(contentArtifacts.tenantId, tenantId));

    return {
      total_artifacts: total,
      active,
      stale,
      archived: rows.find((r: { status: string }) => r.status === "archived")?.count ?? 0,
      avg_citation_coverage: Math.round((coverageRow?.avg_coverage ?? 0) * 100) / 100,
    };
  }),

  getBySkill: adminProcedure.query(async ({ ctx }) => {
    const tenantId = getTenantId(ctx);
    const rows = await db
      .select({
        skill_slug: contentArtifacts.skillSlug,
        count: sql<number>`count(*)::int`,
        avg_citation_coverage: sql<number>`COALESCE(AVG((${contentArtifacts.qualityScore}->>'citation_coverage')::float), 0)`,
        stale_count: sql<number>`COUNT(*) FILTER (WHERE ${contentArtifacts.status} = 'stale')::int`,
        last_generated: sql<string>`MAX(${contentArtifacts.createdAt})::text`,
      })
      .from(contentArtifacts)
      .where(eq(contentArtifacts.tenantId, tenantId))
      .groupBy(contentArtifacts.skillSlug)
      .orderBy(desc(sql`count(*)`));

    return rows.map((r: { avg_citation_coverage: number; skill_slug: string; count: number; stale_count: number; last_generated: string | null }) => ({
      ...r,
      avg_citation_coverage: Math.round(r.avg_citation_coverage * 100) / 100,
    }));
  }),

  getStaleList: adminProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).optional(),
          offset: z.number().min(0).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const tenantId = getTenantId(ctx);
      return db
        .select()
        .from(contentArtifacts)
        .where(
          and(
            eq(contentArtifacts.tenantId, tenantId),
            eq(contentArtifacts.status, "stale")
          )
        )
        .limit(input?.limit ?? 50)
        .offset(input?.offset ?? 0)
        .orderBy(contentArtifacts.nextRefreshAt);
    }),

  getTimeline: adminProcedure
    .input(
      z
        .object({
          days: z.number().min(1).max(365).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const tenantId = getTenantId(ctx);
      const days = input?.days ?? 30;
      return db
        .select({
          date: sql<string>`DATE(${contentArtifacts.createdAt})::text`,
          count: sql<number>`count(*)::int`,
          avg_coverage: sql<number>`COALESCE(AVG((${contentArtifacts.qualityScore}->>'citation_coverage')::float), 0)`,
        })
        .from(contentArtifacts)
        .where(
          and(
            eq(contentArtifacts.tenantId, tenantId),
            sql`${contentArtifacts.createdAt} >= NOW() - INTERVAL '${sql.raw(String(days))} days'`
          )
        )
        .groupBy(sql`DATE(${contentArtifacts.createdAt})`)
        .orderBy(sql`DATE(${contentArtifacts.createdAt})`);
    }),

  getCostBreakdown: adminProcedure
    .input(
      z
        .object({
          days: z.number().min(1).max(365).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const tenantId = getTenantId(ctx);
      const days = input?.days ?? 30;

      // providerUsageLog has no tenantId column; filter via userId belonging to tenant
      const tenantUserIds = db
        .select({ id: users.id })
        .from(users)
        .where(sql`${users.currentTenantId}::text = ${tenantId}`);

      const rows: { requestType: string | null; total_cost_usd: string; total_tokens: number; request_count: number }[] = await db
        .select({
          requestType: providerUsageLog.requestType,
          total_cost_usd: sql<string>`COALESCE(SUM(${providerUsageLog.costUsd}), 0)::text`,
          total_tokens: sql<number>`COALESCE(SUM(${providerUsageLog.inputTokens} + ${providerUsageLog.outputTokens}), 0)::int`,
          request_count: sql<number>`count(*)::int`,
        })
        .from(providerUsageLog)
        .where(
          and(
            eq(providerUsageLog.requestType, "skill"),
            sql`${providerUsageLog.createdAt} >= NOW() - INTERVAL '${sql.raw(String(days))} days'`,
            inArray(providerUsageLog.userId, tenantUserIds)
          )
        )
        .groupBy(providerUsageLog.requestType)
        .orderBy(desc(sql`SUM(${providerUsageLog.costUsd})`));

      return rows.map((r) => ({
        request_type: r.requestType ?? "unknown",
        total_cost_usd: parseFloat(r.total_cost_usd),
        total_tokens: r.total_tokens,
        request_count: r.request_count,
        avg_cost_per_request: r.request_count > 0
          ? Math.round((parseFloat(r.total_cost_usd) / r.request_count) * 10000) / 10000
          : 0,
      }));
    }),
});
