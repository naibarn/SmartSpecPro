/**
 * Content Quality Dashboard tRPC Router — Spec 038 Section 10
 *
 * Aggregation queries for content quality metrics.
 */

import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { db } from "../_core/db";
import { contentArtifacts } from "../../drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";

export const contentQualityRouter = router({
  getOverview: adminProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenantId;

    const rows = await db
      .select({
        status: contentArtifacts.status,
        count: sql<number>`count(*)::int`,
      })
      .from(contentArtifacts)
      .where(eq(contentArtifacts.tenantId, tenantId))
      .groupBy(contentArtifacts.status);

    const total = rows.reduce((sum, r) => sum + r.count, 0);
    const active = rows.find((r) => r.status === "active")?.count ?? 0;
    const stale = rows.find((r) => r.status === "stale")?.count ?? 0;

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
      archived: rows.find((r) => r.status === "archived")?.count ?? 0,
      avg_citation_coverage: Math.round((coverageRow?.avg_coverage ?? 0) * 100) / 100,
    };
  }),

  getBySkill: adminProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        skill_slug: contentArtifacts.skillSlug,
        count: sql<number>`count(*)::int`,
        avg_citation_coverage: sql<number>`COALESCE(AVG((${contentArtifacts.qualityScore}->>'citation_coverage')::float), 0)`,
        stale_count: sql<number>`COUNT(*) FILTER (WHERE ${contentArtifacts.status} = 'stale')::int`,
        last_generated: sql<string>`MAX(${contentArtifacts.createdAt})::text`,
      })
      .from(contentArtifacts)
      .where(eq(contentArtifacts.tenantId, ctx.tenantId))
      .groupBy(contentArtifacts.skillSlug)
      .orderBy(desc(sql`count(*)`));

    return rows.map((r) => ({
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
      return db
        .select()
        .from(contentArtifacts)
        .where(
          and(
            eq(contentArtifacts.tenantId, ctx.tenantId),
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
            eq(contentArtifacts.tenantId, ctx.tenantId),
            sql`${contentArtifacts.createdAt} >= NOW() - INTERVAL '${sql.raw(String(days))} days'`
          )
        )
        .groupBy(sql`DATE(${contentArtifacts.createdAt})`)
        .orderBy(sql`DATE(${contentArtifacts.createdAt})`);
    }),
});
