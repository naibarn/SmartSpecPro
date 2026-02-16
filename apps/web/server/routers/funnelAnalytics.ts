import { and, count, eq, gte, lte, sql, desc, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  router,
  domainAdminProcedure,
  rateLimitedDomainAdminProcedure,
} from "../_core/trpc";
import { funnelEvents } from "../../drizzle/schema";
import { getDb } from "../db";
import { auditLogger } from "../services/auditLogger";

// ── Constants ──

export const MAX_RANGE_DAYS = 90;

/**
 * Maximum rows returned per export operation.
 * Limit of 5000 balances usability (sufficient for most analytics needs)
 * with data minimization principles (prevents bulk extraction of entire datasets).
 * Protects against accidental or intentional large-scale data exfiltration.
 */
export const MAX_EXPORT_ROWS = 5000;

const CACHE_TTL = 300; // 5 minutes
const CACHE_PREFIX = "funnel:analytics:";

/**
 * Property keys to exclude from API responses and exports for privacy/compliance.
 *
 * Rationale:
 * - PII (email, phone, IP): GDPR Article 4(1) - personal data subject to right to erasure
 * - Credentials (password, apiKey, token): Security - prevent accidental exposure
 * - Financial (ssn, creditCard): PCI DSS / privacy regulations
 *
 * Update this list when:
 * - New sensitive fields are added to event instrumentation
 * - Privacy policy or legal requirements change
 * - Security audit identifies new sensitive data types
 */
export const DISALLOWED_PROPERTY_KEYS = new Set([
  "email",
  "phone",
  "phoneNumber",
  "ipAddress",
  "ip",
  "password",
  "apiKey",
  "api_key",
  "token",
  "secret",
  "accessToken",
  "refreshToken",
  "ssn",
  "creditCard",
  "cvv",
]);

export const STAGE_PRESETS = {
  acquisition: ["signup_completed", "email_verified"],
  activation: ["first_conversation", "first_llm_request"],
  usage: ["first_media_generation"],
  revenue: ["purchase_completed", "subscription_started"],
} as const;

export type FunnelStage = keyof typeof STAGE_PRESETS;

// ── Types ──

export interface FunnelScope {
  tenantId: string;
  domain: string | null;
}

type Bucket = "day" | "week" | "month";

// ── Shared helpers ──

/**
 * Sanitize event properties by removing disallowed sensitive keys.
 *
 * Used to prevent exposure of PII, credentials, and regulated data in:
 * - API responses (rawEvents endpoint)
 * - Export files (CSV/JSON downloads)
 * - Analytics aggregations where properties are returned
 *
 * Privacy rationale: Implements data minimization (GDPR Article 5(1)(c))
 * by excluding personal data that is not strictly necessary for analytics.
 *
 * @param properties - Raw event properties from database (may contain sensitive keys)
 * @returns Sanitized properties object with disallowed keys removed
 */
export function sanitizeEventProperties(
  properties: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!properties || typeof properties !== "object") {
    return {};
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!DISALLOWED_PROPERTY_KEYS.has(key) && value !== undefined) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Build tenant scope filter for funnel queries.
 *
 * Scope resolution logic (tenant-primary with explicit fallback):
 * 1. Prefer ctxTenantId (explicit tenant context from middleware)
 * 2. Fallback to registeredDomain if ctxTenantId is null
 * 3. Emit audit log when fallback occurs (for observability)
 *
 * Role-based domain filtering:
 * - domain_admin: Scoped to their specific domain (tenantId + domain filter)
 * - admin: Tenant-wide access (tenantId only, no domain filter)
 *
 * @param input - Role and tenant identifiers
 * @param userId - User ID for audit logging (nullable for test contexts)
 * @returns FunnelScope with tenantId and optional domain filter
 */
export function buildScopeFilter(
  input: {
    role: string;
    registeredDomain: string | null;
    ctxTenantId: string | null;
  },
  userId?: number | null,
): FunnelScope {
  const tenantId = input.ctxTenantId ?? input.registeredDomain;
  if (!tenantId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Unable to determine tenant scope",
    });
  }

  // Emit audit log if fallback occurred (unconditional for observability)
  const didFallback = !input.ctxTenantId && input.registeredDomain;
  if (didFallback) {
    auditLogger.log({
      eventType: "funnel_scope_fallback",
      userId: userId ?? null,
      metadata: {
        role: input.role,
        fallbackSource: "registeredDomain",
        resolvedTenantId: tenantId,
        registeredDomain: input.registeredDomain,
      },
    });
  }

  if (input.role === "domain_admin") {
    return { tenantId, domain: input.registeredDomain };
  }
  return { tenantId, domain: null };
}

export function clampDateRange(
  from: Date,
  to: Date,
): { from: Date; to: Date; clamped: boolean } {
  let f = from;
  let t = to;
  if (f.getTime() > t.getTime()) {
    [f, t] = [t, f];
  }
  const diffDays = (t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays > MAX_RANGE_DAYS) {
    const clampedFrom = new Date(
      t.getTime() - MAX_RANGE_DAYS * 24 * 60 * 60 * 1000,
    );
    return { from: clampedFrom, to: t, clamped: true };
  }
  return { from: f, to: t, clamped: false };
}

export function bucketToSql(bucket: Bucket): string {
  switch (bucket) {
    case "week":
      return "date_trunc('week', \"eventTime\" AT TIME ZONE 'UTC')::date::text";
    case "month":
      return "date_trunc('month', \"eventTime\" AT TIME ZONE 'UTC')::date::text";
    case "day":
    default:
      return "date_trunc('day', \"eventTime\" AT TIME ZONE 'UTC')::date::text";
  }
}

function escapeCsvField(value: string): string {
  if (/[,"\n\r]/.test(value) || /^[=+\-@\t\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function resolveStageEventNames(stage?: string | null): string[] | null {
  if (!stage) return null;
  const preset = STAGE_PRESETS[stage as FunnelStage];
  return preset ? [...preset] : null;
}

function scopeConditions(scope: FunnelScope) {
  const conditions = [eq(funnelEvents.tenantId, scope.tenantId)];
  if (scope.domain) {
    conditions.push(eq(funnelEvents.domain, scope.domain));
  }
  return conditions;
}

function resolveScope(ctx: {
  user: { id: number; role: string | null; registeredDomain: string | null };
  tenantId: string | null;
}) {
  const scope = buildScopeFilter(
    {
      role: ctx.user.role ?? "domain_admin",
      registeredDomain: ctx.user.registeredDomain ?? null,
      ctxTenantId: ctx.tenantId ?? null,
    },
    ctx.user.id,
  );
  console.log("[FunnelAnalytics] scope resolved", {
    tenantId: scope.tenantId,
    domain: scope.domain,
    role: ctx.user.role,
  });
  return scope;
}

async function getRedis() {
  try {
    const { getRedisClient } = await import("../services/redis");
    return getRedisClient();
  } catch {
    return null;
  }
}

async function cachedQuery<T>(
  cacheKey: string,
  queryFn: () => Promise<T>,
  opts?: { bypass?: boolean },
): Promise<{ data: T; cached: boolean }> {
  if (opts?.bypass) {
    return { data: await queryFn(), cached: false };
  }
  const redis = await getRedis();
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return { data: JSON.parse(cached), cached: true };
    } catch {
      // cache miss
    }
  }
  const data = await queryFn();
  if (redis) {
    try {
      await redis.set(cacheKey, JSON.stringify(data), "EX", CACHE_TTL);
    } catch {
      // cache write fail
    }
  }
  return { data, cached: false };
}

async function scanAndDelete(
  redis: { scanStream: (opts: any) => any; del: (...keys: string[]) => Promise<number> },
  pattern: string,
): Promise<number> {
  return new Promise((resolve) => {
    let cleared = 0;
    const stream = redis.scanStream({ match: pattern, count: 100 });
    stream.on("data", async (keys: string[]) => {
      if (keys.length > 0) {
        stream.pause();
        try {
          cleared += await redis.del(...keys);
        } catch {
          // ignore
        }
        stream.resume();
      }
    });
    stream.on("end", () => resolve(cleared));
    stream.on("error", () => resolve(cleared));
  });
}

// ── Input schemas ──

const stageEnum = z.enum(["acquisition", "activation", "usage", "revenue"]);

const dateRangeInput = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  bucket: z.enum(["day", "week", "month"]).default("day"),
  stage: stageEnum.optional(),
  bypassCache: z.boolean().default(false),
});

const exportInput = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  bucket: z.enum(["day", "week", "month"]).default("day"),
  stage: stageEnum.optional(),
  format: z.enum(["csv", "json"]).default("csv"),
});

const rawEventsInput = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  eventName: z.string().max(128).optional(),
  limit: z.number().min(1).max(500).default(100),
  offset: z.number().min(0).default(0),
  includeUserData: z.boolean().default(false),
});

// ── Router ──

export const funnelAnalyticsRouter = router({
  summary: domainAdminProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { stages: [], rangeClamped: false, cached: false };

      const scope = resolveScope(ctx);
      const range = clampDateRange(input.from, input.to);
      const stageNames = resolveStageEventNames(input.stage);
      const cacheKey = `${CACHE_PREFIX}summary:${scope.tenantId}:${scope.domain ?? "all"}:${input.stage ?? "all"}:${range.from.toISOString()}:${range.to.toISOString()}`;

      const { data, cached } = await cachedQuery(
        cacheKey,
        async () => {
          const conditions = [
            ...scopeConditions(scope),
            gte(funnelEvents.eventTime, range.from),
            lte(funnelEvents.eventTime, range.to),
          ];
          if (stageNames) {
            conditions.push(inArray(funnelEvents.eventName, stageNames));
          }

          const rows = await db
            .select({
              eventName: funnelEvents.eventName,
              total: count(funnelEvents.id).as("total"),
              uniqueUsers:
                sql<number>`COUNT(DISTINCT "userId")`.as("unique_users"),
            })
            .from(funnelEvents)
            .where(and(...conditions))
            .groupBy(funnelEvents.eventName)
            .orderBy(desc(sql`COUNT(${funnelEvents.id})`));

          return rows.map((r) => ({
            eventName: r.eventName,
            total: Number(r.total),
            uniqueUsers: Number(r.uniqueUsers),
          }));
        },
        { bypass: input.bypassCache },
      );

      return { stages: data, rangeClamped: range.clamped, cached };
    }),

  timeSeries: domainAdminProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { series: [], rangeClamped: false, cached: false };

      const scope = resolveScope(ctx);
      const range = clampDateRange(input.from, input.to);
      const stageNames = resolveStageEventNames(input.stage);
      const bucketSqlStr = bucketToSql(input.bucket);
      const cacheKey = `${CACHE_PREFIX}timeSeries:${scope.tenantId}:${scope.domain ?? "all"}:${input.stage ?? "all"}:${input.bucket}:${range.from.toISOString()}:${range.to.toISOString()}`;

      const { data, cached } = await cachedQuery(
        cacheKey,
        async () => {
          const conditions = [
            ...scopeConditions(scope),
            gte(funnelEvents.eventTime, range.from),
            lte(funnelEvents.eventTime, range.to),
          ];
          if (stageNames) {
            conditions.push(inArray(funnelEvents.eventName, stageNames));
          }

          const rows = await db
            .select({
              bucket: sql<string>`${sql.raw(bucketSqlStr)}`.as("bucket"),
              eventName: funnelEvents.eventName,
              total: count(funnelEvents.id).as("total"),
            })
            .from(funnelEvents)
            .where(and(...conditions))
            .groupBy(sql`${sql.raw(bucketSqlStr)}`, funnelEvents.eventName)
            .orderBy(sql`${sql.raw(bucketSqlStr)}`);

          return rows.map((r) => ({
            bucket: r.bucket,
            eventName: r.eventName,
            total: Number(r.total),
          }));
        },
        { bypass: input.bypassCache },
      );

      return { series: data, rangeClamped: range.clamped, cached };
    }),

  rawEvents: rateLimitedDomainAdminProcedure
    .input(rawEventsInput)
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { events: [], total: 0 };

      const scope = resolveScope(ctx);
      const range = clampDateRange(input.from, input.to);

      const conditions = [
        ...scopeConditions(scope),
        gte(funnelEvents.eventTime, range.from),
        lte(funnelEvents.eventTime, range.to),
      ];
      if (input.eventName) {
        conditions.push(eq(funnelEvents.eventName, input.eventName));
      }

      const [events, totalResult] = await Promise.all([
        db
          .select({
            id: funnelEvents.id,
            eventName: funnelEvents.eventName,
            eventTime: funnelEvents.eventTime,
            userId: funnelEvents.userId,
            domain: funnelEvents.domain,
            properties: funnelEvents.properties,
          })
          .from(funnelEvents)
          .where(and(...conditions))
          .orderBy(desc(funnelEvents.eventTime))
          .limit(input.limit)
          .offset(input.offset),
        db
          .select({ total: count(funnelEvents.id).as("total") })
          .from(funnelEvents)
          .where(and(...conditions)),
      ]);

      // Audit raw events query (per-user data access)
      auditLogger.log({
        eventType: "funnel_raw_events_query",
        userId: ctx.user.id,
        metadata: {
          dateRange: {
            from: range.from.toISOString(),
            to: range.to.toISOString(),
          },
          eventName: input.eventName ?? "all",
          rowCount: events.length,
          includeUserData: input.includeUserData,
          elevated: input.includeUserData,
          scope: { tenantId: scope.tenantId, domain: scope.domain },
        },
      });

      return {
        events: events.map((e) => ({
          ...e,
          eventTime: e.eventTime.toISOString(),
          // Conditionally include userId based on flag
          userId: input.includeUserData ? e.userId : undefined,
          properties: sanitizeEventProperties(
            e.properties as Record<string, unknown> | null,
          ),
        })),
        total: Number(totalResult[0]?.total ?? 0),
      };
    }),

  export: rateLimitedDomainAdminProcedure
    .input(exportInput)
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { data: "", mimeType: "text/csv", filename: "empty.csv" };

      const scope = resolveScope(ctx);
      const range = clampDateRange(input.from, input.to);
      const stageNames = resolveStageEventNames(input.stage);
      const bucketSqlStr = bucketToSql(input.bucket);

      const conditions = [
        ...scopeConditions(scope),
        gte(funnelEvents.eventTime, range.from),
        lte(funnelEvents.eventTime, range.to),
      ];
      if (stageNames) {
        conditions.push(inArray(funnelEvents.eventName, stageNames));
      }

      // Apply limit at SQL level (prevents OOM on large datasets)
      const rows = await db
        .select({
          bucket: sql<string>`${sql.raw(bucketSqlStr)}`.as("bucket"),
          eventName: funnelEvents.eventName,
          total: count(funnelEvents.id).as("total"),
          uniqueUsers:
            sql<number>`COUNT(DISTINCT "userId")`.as("unique_users"),
        })
        .from(funnelEvents)
        .where(and(...conditions))
        .groupBy(sql`${sql.raw(bucketSqlStr)}`, funnelEvents.eventName)
        .orderBy(sql`${sql.raw(bucketSqlStr)}`)
        .limit(MAX_EXPORT_ROWS + 1); // +1 to detect truncation

      const wasTruncated = rows.length > MAX_EXPORT_ROWS;
      const limitedRows = wasTruncated ? rows.slice(0, MAX_EXPORT_ROWS) : rows;

      const mapped = limitedRows.map((r) => ({
        bucket: r.bucket,
        eventName: r.eventName,
        total: Number(r.total),
        uniqueUsers: Number(r.uniqueUsers),
      }));

      // Audit export operation
      auditLogger.log({
        eventType: "funnel_export",
        userId: ctx.user.id,
        metadata: {
          format: input.format,
          rowCount: mapped.length,
          wasTruncated,
          dateRange: { from: range.from.toISOString(), to: range.to.toISOString() },
          stage: input.stage ?? "all",
          scope: { tenantId: scope.tenantId, domain: scope.domain },
        },
      });

      if (input.format === "json") {
        return {
          data: JSON.stringify(mapped, null, 2),
          mimeType: "application/json",
          filename: `funnel-analytics-${range.from.toISOString().slice(0, 10)}.json`,
        };
      }

      const csvHeader = "bucket,eventName,total,uniqueUsers";
      const csvRows = mapped.map(
        (r) =>
          `${escapeCsvField(r.bucket)},${escapeCsvField(r.eventName)},${r.total},${r.uniqueUsers}`,
      );
      return {
        data: [csvHeader, ...csvRows].join("\n"),
        mimeType: "text/csv",
        filename: `funnel-analytics-${range.from.toISOString().slice(0, 10)}.csv`,
      };
    }),

  invalidateCache: domainAdminProcedure.mutation(async ({ ctx }) => {
    const redis = await getRedis();
    if (!redis) return { cleared: 0 };

    const scope = resolveScope(ctx);
    const pattern = `${CACHE_PREFIX}*:${scope.tenantId}:*`;

    let cleared = 0;
    try {
      if (typeof (redis as any).scanStream === "function") {
        cleared = await scanAndDelete(redis as any, pattern);
      } else {
        // Fallback for Redis clients without scanStream
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          cleared = await redis.del(...keys);
        }
      }
    } catch {
      // cache clear failed
    }
    return { cleared };
  }),
});
