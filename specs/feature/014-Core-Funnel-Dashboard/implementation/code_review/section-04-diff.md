diff --git a/apps/web/server/routers.ts b/apps/web/server/routers.ts
index b0e1614..f97101a 100644
--- a/apps/web/server/routers.ts
+++ b/apps/web/server/routers.ts
@@ -59,6 +59,7 @@ import { groupsRouter } from "./routers/groups";
 import { googleDriveRouter } from "./routers/googleDrive";
 import { searchRouter } from "./routers/search";
 import { adminOpsRouter } from "./routers/adminOps";
+import { funnelAnalyticsRouter } from "./routers/funnelAnalytics";
 import { infrastructureRouter } from "./routers/infrastructure";
 
 // Zod schemas for validation
@@ -1595,6 +1596,7 @@ export const appRouter = router({
 
   search: searchRouter,
   adminOps: adminOpsRouter,
+  funnelAnalytics: funnelAnalyticsRouter,
 });
 
 export type AppRouter = typeof appRouter;
diff --git a/apps/web/server/routers/funnelAnalytics.test.ts b/apps/web/server/routers/funnelAnalytics.test.ts
new file mode 100644
index 0000000..ef9b44c
--- /dev/null
+++ b/apps/web/server/routers/funnelAnalytics.test.ts
@@ -0,0 +1,102 @@
+import { beforeEach, describe, expect, it, vi } from "vitest";
+
+import {
+  buildScopeFilter,
+  clampDateRange,
+  bucketToSql,
+  MAX_RANGE_DAYS,
+  type FunnelScope,
+} from "./funnelAnalytics";
+
+describe("funnelAnalytics helpers", () => {
+  describe("buildScopeFilter", () => {
+    it("returns tenantId scope for admin role", () => {
+      const scope = buildScopeFilter({
+        role: "admin",
+        registeredDomain: "example.com",
+        ctxTenantId: "tenant-01",
+      });
+      expect(scope).toEqual<FunnelScope>({
+        tenantId: "tenant-01",
+        domain: null,
+      });
+    });
+
+    it("returns domain-scoped filter for domain_admin role", () => {
+      const scope = buildScopeFilter({
+        role: "domain_admin",
+        registeredDomain: "corp.io",
+        ctxTenantId: "tenant-02",
+      });
+      expect(scope).toEqual<FunnelScope>({
+        tenantId: "tenant-02",
+        domain: "corp.io",
+      });
+    });
+
+    it("falls back to registeredDomain as tenantId when ctxTenantId is missing", () => {
+      const scope = buildScopeFilter({
+        role: "admin",
+        registeredDomain: "example.com",
+        ctxTenantId: null,
+      });
+      expect(scope).toEqual<FunnelScope>({
+        tenantId: "example.com",
+        domain: null,
+      });
+    });
+  });
+
+  describe("clampDateRange", () => {
+    it("returns input range when within bounds", () => {
+      const from = new Date("2026-01-01");
+      const to = new Date("2026-01-15");
+      const result = clampDateRange(from, to);
+      expect(result.from).toEqual(from);
+      expect(result.to).toEqual(to);
+      expect(result.clamped).toBe(false);
+    });
+
+    it("clamps range that exceeds MAX_RANGE_DAYS", () => {
+      const from = new Date("2025-01-01");
+      const to = new Date("2026-02-16");
+      const result = clampDateRange(from, to);
+      expect(result.clamped).toBe(true);
+      const diffMs =
+        result.to.getTime() - result.from.getTime();
+      const diffDays = diffMs / (1000 * 60 * 60 * 24);
+      expect(diffDays).toBeLessThanOrEqual(MAX_RANGE_DAYS);
+    });
+
+    it("swaps from/to when from > to", () => {
+      const from = new Date("2026-02-15");
+      const to = new Date("2026-01-01");
+      const result = clampDateRange(from, to);
+      expect(result.from.getTime()).toBeLessThan(
+        result.to.getTime(),
+      );
+    });
+  });
+
+  describe("bucketToSql", () => {
+    it("returns day truncation for 'day' bucket", () => {
+      const sql = bucketToSql("day");
+      expect(sql).toContain("day");
+    });
+
+    it("returns week truncation for 'week' bucket", () => {
+      const sql = bucketToSql("week");
+      expect(sql).toContain("week");
+    });
+
+    it("returns month truncation for 'month' bucket", () => {
+      const sql = bucketToSql("month");
+      expect(sql).toContain("month");
+    });
+
+    it("defaults to day for unknown input", () => {
+      const sql = bucketToSql("invalid" as any);
+      expect(sql).toContain("day");
+    });
+  });
+});
diff --git a/apps/web/server/routers/funnelAnalytics.ts b/apps/web/server/routers/funnelAnalytics.ts
new file mode 100644
index 0000000..96e2bea
--- /dev/null
+++ b/apps/web/server/routers/funnelAnalytics.ts
@@ -0,0 +1,360 @@
+import { and, count, eq, gte, lte, sql, desc } from "drizzle-orm";
+import { z } from "zod";
+import { router, domainAdminProcedure } from "../_core/trpc";
+import { funnelEvents } from "../../drizzle/schema";
+import { getDb } from "../db";
+
+// ── Constants ──
+
+export const MAX_RANGE_DAYS = 90;
+const CACHE_TTL = 300; // 5 minutes
+const CACHE_PREFIX = "funnel:analytics:";
+
+// ── Types ──
+
+export interface FunnelScope {
+  tenantId: string;
+  domain: string | null;
+}
+
+type Bucket = "day" | "week" | "month";
+
+// ── Shared helpers ──
+
+export function buildScopeFilter(input: {
+  role: string;
+  registeredDomain: string | null;
+  ctxTenantId: string | null;
+}): FunnelScope {
+  const tenantId = input.ctxTenantId ?? input.registeredDomain ?? "default";
+  if (input.role === "domain_admin") {
+    return { tenantId, domain: input.registeredDomain };
+  }
+  return { tenantId, domain: null };
+}
+
+export function clampDateRange(
+  from: Date,
+  to: Date,
+): { from: Date; to: Date; clamped: boolean } {
+  let f = from;
+  let t = to;
+  if (f.getTime() > t.getTime()) {
+    [f, t] = [t, f];
+  }
+  const diffDays = (t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24);
+  if (diffDays > MAX_RANGE_DAYS) {
+    const clampedFrom = new Date(
+      t.getTime() - MAX_RANGE_DAYS * 24 * 60 * 60 * 1000,
+    );
+    return { from: clampedFrom, to: t, clamped: true };
+  }
+  return { from: f, to: t, clamped: false };
+}
+
+export function bucketToSql(bucket: Bucket): string {
+  switch (bucket) {
+    case "week":
+      return "date_trunc('week', \"eventTime\" AT TIME ZONE 'UTC')::date::text";
+    case "month":
+      return "date_trunc('month', \"eventTime\" AT TIME ZONE 'UTC')::date::text";
+    case "day":
+    default:
+      return "date_trunc('day', \"eventTime\" AT TIME ZONE 'UTC')::date::text";
+  }
+}
+
+function scopeConditions(scope: FunnelScope) {
+  const conditions = [eq(funnelEvents.tenantId, scope.tenantId)];
+  if (scope.domain) {
+    conditions.push(eq(funnelEvents.domain, scope.domain));
+  }
+  return conditions;
+}
+
+async function getRedis() {
+  try {
+    const { getRedisClient } = await import("../services/redis");
+    return getRedisClient();
+  } catch {
+    return null;
+  }
+}
+
+async function cachedQuery<T>(
+  cacheKey: string,
+  queryFn: () => Promise<T>,
+  opts?: { bypass?: boolean },
+): Promise<{ data: T; cached: boolean }> {
+  if (opts?.bypass) {
+    return { data: await queryFn(), cached: false };
+  }
+  const redis = await getRedis();
+  if (redis) {
+    try {
+      const cached = await redis.get(cacheKey);
+      if (cached) return { data: JSON.parse(cached), cached: true };
+    } catch {
+      // cache miss
+    }
+  }
+  const data = await queryFn();
+  if (redis) {
+    try {
+      await redis.set(cacheKey, JSON.stringify(data), "EX", CACHE_TTL);
+    } catch {
+      // cache write fail
+    }
+  }
+  return { data, cached: false };
+}
+
+// ── Input schemas ──
+
+const dateRangeInput = z.object({
+  from: z.coerce.date(),
+  to: z.coerce.date(),
+  bucket: z.enum(["day", "week", "month"]).default("day"),
+  bypassCache: z.boolean().default(false),
+});
+
+const exportInput = z.object({
+  from: z.coerce.date(),
+  to: z.coerce.date(),
+  bucket: z.enum(["day", "week", "month"]).default("day"),
+  format: z.enum(["csv", "json"]).default("csv"),
+});
+
+const rawEventsInput = z.object({
+  from: z.coerce.date(),
+  to: z.coerce.date(),
+  eventName: z.string().max(128).optional(),
+  limit: z.number().min(1).max(500).default(100),
+  offset: z.number().min(0).default(0),
+});
+
+// ── Router ──
+
+export const funnelAnalyticsRouter = router({
+  summary: domainAdminProcedure
+    .input(dateRangeInput)
+    .query(async ({ ctx, input }) => {
+      const db = await getDb();
+      if (!db) return { stages: [], rangeClamped: false, cached: false };
+
+      const scope = buildScopeFilter({
+        role: ctx.user.role ?? "admin",
+        registeredDomain: ctx.user.registeredDomain ?? null,
+        ctxTenantId: ctx.tenantId ?? null,
+      });
+      const range = clampDateRange(input.from, input.to);
+      const cacheKey = `${CACHE_PREFIX}summary:${scope.tenantId}:${scope.domain ?? "all"}:${range.from.toISOString()}:${range.to.toISOString()}`;
+
+      const { data, cached } = await cachedQuery(
+        cacheKey,
+        async () => {
+          const rows = await db
+            .select({
+              eventName: funnelEvents.eventName,
+              total: count(funnelEvents.id).as("total"),
+              uniqueUsers:
+                sql<number>`COUNT(DISTINCT "userId")`.as("unique_users"),
+            })
+            .from(funnelEvents)
+            .where(
+              and(
+                ...scopeConditions(scope),
+                gte(funnelEvents.eventTime, range.from),
+                lte(funnelEvents.eventTime, range.to),
+              ),
+            )
+            .groupBy(funnelEvents.eventName)
+            .orderBy(desc(sql`COUNT(${funnelEvents.id})`));
+
+          return rows.map((r) => ({
+            eventName: r.eventName,
+            total: Number(r.total),
+            uniqueUsers: Number(r.uniqueUsers),
+          }));
+        },
+        { bypass: input.bypassCache },
+      );
+
+      return { stages: data, rangeClamped: range.clamped, cached };
+    }),
+
+  timeSeries: domainAdminProcedure
+    .input(dateRangeInput)
+    .query(async ({ ctx, input }) => {
+      const db = await getDb();
+      if (!db) return { series: [], rangeClamped: false };
+
+      const scope = buildScopeFilter({
+        role: ctx.user.role ?? "admin",
+        registeredDomain: ctx.user.registeredDomain ?? null,
+        ctxTenantId: ctx.tenantId ?? null,
+      });
+      const range = clampDateRange(input.from, input.to);
+      const bucketSql = bucketToSql(input.bucket);
+
+      const rows = await db
+        .select({
+          bucket: sql<string>`${sql.raw(bucketSql)}`.as("bucket"),
+          eventName: funnelEvents.eventName,
+          total: count(funnelEvents.id).as("total"),
+        })
+        .from(funnelEvents)
+        .where(
+          and(
+            ...scopeConditions(scope),
+            gte(funnelEvents.eventTime, range.from),
+            lte(funnelEvents.eventTime, range.to),
+          ),
+        )
+        .groupBy(sql`${sql.raw(bucketSql)}`, funnelEvents.eventName)
+        .orderBy(sql`${sql.raw(bucketSql)}`);
+
+      return {
+        series: rows.map((r) => ({
+          bucket: r.bucket,
+          eventName: r.eventName,
+          total: Number(r.total),
+        })),
+        rangeClamped: range.clamped,
+      };
+    }),
+
+  rawEvents: domainAdminProcedure
+    .input(rawEventsInput)
+    .query(async ({ ctx, input }) => {
+      const db = await getDb();
+      if (!db) return { events: [], total: 0 };
+
+      const scope = buildScopeFilter({
+        role: ctx.user.role ?? "admin",
+        registeredDomain: ctx.user.registeredDomain ?? null,
+        ctxTenantId: ctx.tenantId ?? null,
+      });
+      const range = clampDateRange(input.from, input.to);
+
+      const conditions = [
+        ...scopeConditions(scope),
+        gte(funnelEvents.eventTime, range.from),
+        lte(funnelEvents.eventTime, range.to),
+      ];
+      if (input.eventName) {
+        conditions.push(eq(funnelEvents.eventName, input.eventName));
+      }
+
+      const [events, totalResult] = await Promise.all([
+        db
+          .select({
+            id: funnelEvents.id,
+            eventName: funnelEvents.eventName,
+            eventTime: funnelEvents.eventTime,
+            userId: funnelEvents.userId,
+            domain: funnelEvents.domain,
+            properties: funnelEvents.properties,
+          })
+          .from(funnelEvents)
+          .where(and(...conditions))
+          .orderBy(desc(funnelEvents.eventTime))
+          .limit(input.limit)
+          .offset(input.offset),
+        db
+          .select({ total: count(funnelEvents.id).as("total") })
+          .from(funnelEvents)
+          .where(and(...conditions)),
+      ]);
+
+      return {
+        events: events.map((e) => ({
+          ...e,
+          eventTime: e.eventTime.toISOString(),
+        })),
+        total: Number(totalResult[0]?.total ?? 0),
+      };
+    }),
+
+  export: domainAdminProcedure
+    .input(exportInput)
+    .query(async ({ ctx, input }) => {
+      const db = await getDb();
+      if (!db) return { data: "", mimeType: "text/csv", filename: "empty.csv" };
+
+      const scope = buildScopeFilter({
+        role: ctx.user.role ?? "admin",
+        registeredDomain: ctx.user.registeredDomain ?? null,
+        ctxTenantId: ctx.tenantId ?? null,
+      });
+      const range = clampDateRange(input.from, input.to);
+      const bucketSql = bucketToSql(input.bucket);
+
+      const rows = await db
+        .select({
+          bucket: sql<string>`${sql.raw(bucketSql)}`.as("bucket"),
+          eventName: funnelEvents.eventName,
+          total: count(funnelEvents.id).as("total"),
+          uniqueUsers:
+            sql<number>`COUNT(DISTINCT "userId")`.as("unique_users"),
+        })
+        .from(funnelEvents)
+        .where(
+          and(
+            ...scopeConditions(scope),
+            gte(funnelEvents.eventTime, range.from),
+            lte(funnelEvents.eventTime, range.to),
+          ),
+        )
+        .groupBy(sql`${sql.raw(bucketSql)}`, funnelEvents.eventName)
+        .orderBy(sql`${sql.raw(bucketSql)}`);
+
+      const mapped = rows.map((r) => ({
+        bucket: r.bucket,
+        eventName: r.eventName,
+        total: Number(r.total),
+        uniqueUsers: Number(r.uniqueUsers),
+      }));
+
+      if (input.format === "json") {
+        return {
+          data: JSON.stringify(mapped, null, 2),
+          mimeType: "application/json",
+          filename: `funnel-analytics-${range.from.toISOString().slice(0, 10)}.json`,
+        };
+      }
+
+      const csvHeader = "bucket,eventName,total,uniqueUsers";
+      const csvRows = mapped.map(
+        (r) => `${r.bucket},${r.eventName},${r.total},${r.uniqueUsers}`,
+      );
+      return {
+        data: [csvHeader, ...csvRows].join("\n"),
+        mimeType: "text/csv",
+        filename: `funnel-analytics-${range.from.toISOString().slice(0, 10)}.csv`,
+      };
+    }),
+
+  invalidateCache: domainAdminProcedure.mutation(async ({ ctx }) => {
+    const redis = await getRedis();
+    if (!redis) return { cleared: 0 };
+
+    const scope = buildScopeFilter({
+      role: ctx.user.role ?? "admin",
+      registeredDomain: ctx.user.registeredDomain ?? null,
+      ctxTenantId: ctx.tenantId ?? null,
+    });
+    const pattern = `${CACHE_PREFIX}*:${scope.tenantId}:*`;
+
+    let cleared = 0;
+    try {
+      const keys = await redis.keys(pattern);
+      if (keys.length > 0) {
+        cleared = await redis.del(...keys);
+      }
+    } catch {
+      // cache clear failed
+    }
+    return { cleared };
+  }),
+});
