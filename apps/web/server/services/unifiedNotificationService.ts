/**
 * Unified Notification Service
 *
 * Multi-source query layer that merges notifications from userNotifications
 * and orchestratorNotifications into a single sorted stream.
 * Includes Redis-cached unified unread count.
 */

import { and, count, desc, eq, gte, lte, sql, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  userNotifications,
  orchestratorNotifications,
  users,
} from "../../drizzle/schema";
import { getRedisClient } from "./redis";
import { logger } from "../_core/logger";

// ─── Types ──────────────────────────────────────────────────────────────────

export type NotificationSource = "user" | "orchestrator" | "guardian";

export interface UnifiedNotification {
  id: string;
  source: NotificationSource;
  userId: number;
  title: string;
  content: string | null;
  priority: "low" | "normal" | "high" | "critical";
  isRead: boolean;
  isDismissed: boolean;
  actionUrl: string | null;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
  teamId?: string | null;
  roomId?: string | null;
  runId?: string | null;
  occurrenceCount?: number;
  groupKey?: string | null;
}

export interface UnifiedNotificationFilters {
  source?: NotificationSource;
  severity?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  page?: number;
}

export interface UnifiedStats {
  total: number;
  unread: number;
  critical: number;
  today: number;
  bySource: { source: string; count: number }[];
  bySeverity: { severity: string; count: number }[];
}

// ─── Severity Mapping ───────────────────────────────────────────────────────

const ORCH_SEVERITY_MAP: Record<string, "low" | "normal" | "high" | "critical"> = {
  info: "low",
  warning: "normal",
  error: "high",
  critical: "critical",
};

// ─── Mappers ────────────────────────────────────────────────────────────────

export function mapUserNotification(row: any): UnifiedNotification {
  const metadata = row.metadata as Record<string, unknown> | null;
  const source: NotificationSource =
    typeof metadata?.source === "string" &&
    (metadata.source as string).startsWith("guardian.")
      ? "guardian"
      : "user";

  return {
    id: `user:${row.id}`,
    source,
    userId: row.userId,
    title: row.title,
    content: row.content,
    priority: row.priority ?? "normal",
    isRead: row.isRead ?? false,
    isDismissed: row.isDismissed ?? false,
    actionUrl: row.actionUrl,
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    metadata,
    occurrenceCount: row.occurrenceCount ?? 1,
    groupKey: row.groupKey,
  };
}

export function mapOrchestratorNotification(row: any): UnifiedNotification {
  return {
    id: `orch:${row.id}`,
    source: "orchestrator",
    userId: row.userId,
    title: row.title,
    content: row.body ?? null,
    priority: ORCH_SEVERITY_MAP[row.severity] ?? "normal",
    isRead: row.isRead ?? false,
    isDismissed: row.isDismissed ?? false,
    actionUrl: row.actionUrl ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    metadata: null,
    teamId: row.teamId,
    roomId: row.roomId,
    runId: row.runId,
  };
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function getUnifiedNotifications(
  tenantId: string,
  filters: UnifiedNotificationFilters = {},
): Promise<{ items: UnifiedNotification[]; hasMore: boolean }> {
  const db = getDb();
  const limit = Math.min(filters.limit ?? 20, 100);
  const offset = ((filters.page ?? 0)) * limit;
  const startTime = Date.now();

  const conditions = {
    user: buildUserConditions(tenantId, filters),
    orch: buildOrchConditions(tenantId, filters),
  };

  // Query both sources in parallel (skip if source filter excludes)
  const [userRows, orchRows] = await Promise.all([
    filters.source === "orchestrator"
      ? []
      : db
          .select()
          .from(userNotifications)
          .where(and(...conditions.user))
          .orderBy(desc(userNotifications.createdAt))
          .limit(limit + 1)
          .offset(offset),
    filters.source === "user" || filters.source === "guardian"
      ? []
      : db
          .select()
          .from(orchestratorNotifications)
          .where(and(...conditions.orch))
          .orderBy(desc(orchestratorNotifications.createdAt))
          .limit(limit + 1)
          .offset(offset),
  ]);

  // Map to unified format
  const mapped = [
    ...userRows.map(mapUserNotification),
    ...orchRows.map(mapOrchestratorNotification),
  ];

  // Filter guardian source if specifically requested
  const filtered =
    filters.source === "guardian"
      ? mapped.filter((n) => n.source === "guardian")
      : mapped;

  // Sort by createdAt DESC
  filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // N+1 pattern: detect hasMore
  const hasMore = filtered.length > limit;
  const items = filtered.slice(0, limit);

  const durationMs = Date.now() - startTime;
  try {
    logger.info("unified_query", {
      tenantId,
      source: filters.source ?? "all",
      resultCount: items.length,
      durationMs,
    });
  } catch {
    // logger may not be available in tests
  }

  return { items, hasMore };
}

function buildUserConditions(tenantId: string, filters: UnifiedNotificationFilters) {
  const conditions: any[] = [
    // Tenant isolation: only users from current tenant
    inArray(
      userNotifications.userId,
      sql`(SELECT id FROM users WHERE "currentTenantId" = (SELECT id FROM tenants WHERE id = ${tenantId} LIMIT 1))`,
    ),
  ];

  if (filters.severity) {
    conditions.push(eq(userNotifications.priority, filters.severity as any));
  }
  if (filters.startDate) {
    conditions.push(gte(userNotifications.createdAt, filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(lte(userNotifications.createdAt, filters.endDate));
  }

  return conditions;
}

function buildOrchConditions(tenantId: string, filters: UnifiedNotificationFilters) {
  const conditions: any[] = [
    eq(orchestratorNotifications.tenantId, tenantId),
  ];

  if (filters.severity) {
    // Map priority back to orch severity
    const reverseMap: Record<string, string> = {
      low: "info",
      normal: "warning",
      high: "error",
      critical: "critical",
    };
    const orchSeverity = reverseMap[filters.severity] ?? filters.severity;
    conditions.push(eq(orchestratorNotifications.severity, orchSeverity as any));
  }
  if (filters.startDate) {
    conditions.push(gte(orchestratorNotifications.createdAt, filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(lte(orchestratorNotifications.createdAt, filters.endDate));
  }

  return conditions;
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export async function getUnifiedStats(tenantId: string): Promise<UnifiedStats> {
  const db = getDb();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const tenantUserFilter = sql`"userId" IN (SELECT id FROM users WHERE "currentTenantId" = (SELECT id FROM tenants WHERE id = ${tenantId} LIMIT 1))`;

  const [userStats, orchStats] = await Promise.all([
    db
      .select({
        total: count(),
        unread: sql<number>`COUNT(*) FILTER (WHERE "isRead" = false)`,
        critical: sql<number>`COUNT(*) FILTER (WHERE priority = 'critical')`,
        today: sql<number>`COUNT(*) FILTER (WHERE "createdAt" >= ${todayStart})`,
      })
      .from(userNotifications)
      .where(tenantUserFilter),
    db
      .select({
        total: count(),
        unread: sql<number>`COUNT(*) FILTER (WHERE "isRead" = false)`,
        critical: sql<number>`COUNT(*) FILTER (WHERE severity = 'critical')`,
        today: sql<number>`COUNT(*) FILTER (WHERE "createdAt" >= ${todayStart})`,
      })
      .from(orchestratorNotifications)
      .where(eq(orchestratorNotifications.tenantId, tenantId)),
  ]);

  const uStats = userStats[0] ?? { total: 0, unread: 0, critical: 0, today: 0 };
  const oStats = orchStats[0] ?? { total: 0, unread: 0, critical: 0, today: 0 };

  return {
    total: Number(uStats.total) + Number(oStats.total),
    unread: Number(uStats.unread) + Number(oStats.unread),
    critical: Number(uStats.critical) + Number(oStats.critical),
    today: Number(uStats.today) + Number(oStats.today),
    bySource: [
      { source: "user", count: Number(uStats.total) },
      { source: "orchestrator", count: Number(oStats.total) },
    ],
    bySeverity: [], // Simplified — full severity distribution deferred
  };
}

// ─── Cached Unread Count ────────────────────────────────────────────────────

const UNIFIED_COUNT_TTL_SECONDS = 60;

export async function getUnifiedUnreadCount(userId: number): Promise<number> {
  const cacheKey = `notification:unified_count:${userId}`;

  // Try Redis cache first
  try {
    const redis = getRedisClient();
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      try {
        logger.info("unified_count_cache_hit", { userId });
      } catch {
        // logger unavailable
      }
      return parseInt(cached, 10);
    }
  } catch {
    // Redis unavailable — fall through to DB
  }

  try {
    logger.info("unified_count_cache_miss", { userId });
  } catch {
    // logger unavailable
  }

  // DB fallback
  const db = getDb();
  const [userCount, orchCount] = await Promise.all([
    db
      .select({ c: count() })
      .from(userNotifications)
      .where(
        and(
          eq(userNotifications.userId, userId),
          eq(userNotifications.isRead, false),
        ),
      ),
    db
      .select({ c: count() })
      .from(orchestratorNotifications)
      .where(
        and(
          eq(orchestratorNotifications.userId, userId),
          eq(orchestratorNotifications.isRead, false),
        ),
      ),
  ]);

  const total =
    Number(userCount[0]?.c ?? 0) + Number(orchCount[0]?.c ?? 0);

  // Cache in Redis
  try {
    const redis = getRedisClient();
    await redis.setex(cacheKey, UNIFIED_COUNT_TTL_SECONDS, String(total));
  } catch {
    // Redis unavailable — skip caching
  }

  return total;
}
