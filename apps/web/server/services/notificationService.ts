/**
 * Centralized Notification Service
 *
 * Provides a single point for creating notifications across all channels.
 * Handles database insertion and optional delivery via Telegram (and future channels).
 */

import type { DrizzleDB } from "../db";
import { userNotifications, notificationOccurrences, notificationPreferences, users } from "../../drizzle/schema";
import { sql, eq, and } from "drizzle-orm";
import { createRateLimiter } from "./rateLimiter";

/**
 * Rate limiter for notification creation.
 * Per-user: max 200 notifications per 5 minutes.
 * Per-tenant (keyed by "tenant:{id}"): max 1000 per 5 minutes.
 * Escalated notifications bypass rate limiting.
 */
const notificationRateLimiter = createRateLimiter("notification-create", {
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 200, // 200 per user per 5 minutes
  blockDurationMs: 60_000, // Block for 1 minute if exceeded
});

/**
 * Sanitize actionUrl — only allow relative paths and https URLs.
 * Blocks javascript:, data:, vbscript: and other dangerous protocols.
 */
function sanitizeActionUrl(url?: string): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  const trimmed = url.trim();
  if (trimmed.length === 0 || trimmed.length > 2000) return undefined;
  const lower = trimmed.toLowerCase();
  // Block dangerous protocols
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("blob:")
  ) {
    return undefined;
  }
  // Allow relative paths (starting with /) and https:// URLs only
  if (trimmed.startsWith("/") || lower.startsWith("https://")) {
    return trimmed;
  }
  // Block everything else (http:, ftp:, etc.)
  return undefined;
}

/**
 * Truncate error messages to prevent oversized metadata storage.
 */
function sanitizeMetadata(meta?: NotificationMetadata): NotificationMetadata | undefined {
  if (!meta) return undefined;
  const sanitized = { ...meta };
  if (sanitized.errorDetails?.errorMessage) {
    sanitized.errorDetails = {
      ...sanitized.errorDetails,
      errorMessage: sanitized.errorDetails.errorMessage.slice(0, 500),
    };
  }
  if (sanitized.source) {
    sanitized.source = sanitized.source.slice(0, 200);
  }
  // Strip escalation fields — only the escalation job (section-06) may set these
  // by passing them after sanitization. Prevents untrusted callers from triggering bypass.
  delete sanitized.isEscalated;
  delete sanitized.escalatedAt;
  delete sanitized.escalatedTo;
  return sanitized;
}

/**
 * Notification type enumeration (matches database enum)
 */
type NotificationType =
  | "scheduled_message"
  | "follow_request"
  | "alert"
  | "system"
  | "direct_message"
  | "urgent_message";

/**
 * Priority levels (matches reminder_priority enum)
 */
type ReminderPriority = "low" | "normal" | "high" | "critical";

/**
 * Known resource types for structured action linking
 */
type ResourceType =
  | "media_job"
  | "credits"
  | "workflow"
  | "skill"
  | "feedback"
  | "agency"
  | "approval"
  | "team_run"
  | "room"
  | "user"
  | "conversation"
  | "scheduled_message"
  | "system_health"
  | "security"
  | "incident";

/**
 * Structured metadata attached to notifications
 */
interface NotificationMetadata {
  eventId?: string;
  source?: string;
  signal?: string | null;
  recommendation?: string | null;
  observedAt?: string | null;
  errorDetails?: {
    errorCode?: string;
    errorMessage?: string;
  };
  metrics?: {
    durationMs?: number;
    costUsd?: number;
    itemCount?: number;
  };
  retryInfo?: {
    retryCount?: number;
    maxRetries?: number;
    nextRetryAt?: string;
  };
  relatedItems?: Record<string, string>;
  isEscalated?: boolean;
  escalatedAt?: string;
  escalatedTo?: string;
}

/**
 * Parameters for creating a notification
 */
interface CreateNotificationParams {
  db: DrizzleDB;
  userId: number;
  type: NotificationType;
  title: string;
  content: string;
  priority?: ReminderPriority;
  conversationId?: number;
  scheduledMessageId?: number;
  /** Resource type for structured action linking */
  relatedResourceType?: ResourceType;
  /** ID of the related resource */
  relatedResourceId?: string;
  /** Direct action URL (overrides legacy string matching) */
  actionUrl?: string;
  /** Action button label */
  actionLabel?: string;
  /** Structured metadata */
  metadata?: NotificationMetadata;
  /** Auto-expire after this date */
  expiresAt?: Date;
  /** Dedup group key — notifications with the same groupKey for the same user are merged */
  groupKey?: string;
}

/**
 * Maps a notification's resource type and type to one of the 11 preference categories.
 * Evaluated in order — first match wins. relatedResourceType takes priority over type.
 */
function mapToCategory(
  relatedResourceType?: string,
  type?: NotificationType
): string {
  if (relatedResourceType === "system_health") return "system_health";
  if (relatedResourceType === "credits") return "credits";
  if (relatedResourceType === "media_job") return "media_jobs";
  if (relatedResourceType === "workflow") return "workflow";
  if (relatedResourceType === "skill") return "skill";
  if (relatedResourceType === "feedback") return "feedback";
  if (relatedResourceType === "agency") return "agency";
  if (relatedResourceType === "security") return "security";
  if (type === "follow_request") return "follow";
  if (type === "scheduled_message") return "scheduled";
  return "business";
}

const SEVERITY_ORDER: Record<ReminderPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  critical: 3,
};

function severityAtOrAbove(
  actual: ReminderPriority,
  threshold: ReminderPriority
): boolean {
  return SEVERITY_ORDER[actual] >= SEVERITY_ORDER[threshold];
}

interface UserPreference {
  inApp: boolean;
  email: boolean;
  telegram: boolean;
  minSeverity: ReminderPriority | null;
  mutedUntil: Date | string | null;
  emailDigestFrequency: string | null;
}

/**
 * Load a user's notification preference for a category, with Redis caching.
 * Returns null when no preference row exists (caller applies defaults).
 */
async function loadUserPreference(
  db: DrizzleDB,
  userId: number,
  category: string
): Promise<UserPreference | null> {
  const cacheKey = `notification:prefs:${userId}:${category}`;

  // 1. Try Redis cache
  try {
    const { getRedisClient } = await import("./redis");
    const redis = getRedisClient();
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log("[NotificationService] notification_preference_cache_hit", { userId, category });
      return JSON.parse(cached) as UserPreference;
    }
  } catch {
    // Redis unavailable — fall through to DB
  }

  console.log("[NotificationService] notification_preference_cache_miss", { userId, category });

  // 2. Query DB
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.category, category)
      )
    )
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  const pref: UserPreference = {
    inApp: row.inApp,
    email: row.email,
    telegram: row.telegram,
    minSeverity: row.minSeverity as ReminderPriority | null,
    mutedUntil: row.mutedUntil,
    emailDigestFrequency: row.emailDigestFrequency,
  };

  // 3. Store in Redis with 60s TTL
  try {
    const { getRedisClient } = await import("./redis");
    const redis = getRedisClient();
    await redis.set(cacheKey, JSON.stringify(pref), "EX", 60);
  } catch {
    // Non-fatal — next request will re-query DB
  }

  return pref;
}

function isPreferenceEnabled(): boolean {
  return process.env.NOTIFICATION_PREFERENCES_ENABLED === "true";
}

interface ChannelFlags {
  inApp: boolean;
  email: boolean;
  telegram: boolean;
}

/**
 * Centralized notification creator.
 *
 * Inserts a notification into the database and enqueues it for Telegram delivery
 * if the user has linked their Telegram account and enabled notifications.
 *
 * Fire-and-forget pattern: Telegram enqueue failures are logged but don't fail
 * the notification creation.
 *
 * @returns Object containing the created notification ID, or null if suppressed by preferences
 */
async function createNotification(
  params: CreateNotificationParams
): Promise<{ notificationId: number; deduplicated: boolean; channels?: ChannelFlags } | null> {
  const {
    db,
    userId,
    type,
    title,
    content,
    priority: requestedPriority = "normal",
    conversationId,
    scheduledMessageId,
    relatedResourceType,
    relatedResourceId,
    actionUrl,
    actionLabel,
    metadata,
    expiresAt,
    groupKey: rawGroupKey,
  } = params;
  let priority = requestedPriority;

  // --- Rate limit gate ---
  // Escalated notifications bypass rate limiting (they're system-critical).
  const isEscalated = metadata?.isEscalated === true;
  if (!isEscalated) {
    const userKey = String(userId);
    if (!notificationRateLimiter.isAllowed(userKey)) {
      console.warn("[NotificationService] notification_rate_limited", {
        userId,
        type,
        title: title.slice(0, 50),
      });
      return null;
    }
  }

  // --- Preference gate ---
  // Read isEscalated from raw metadata BEFORE sanitization strips it.
  // sanitizeMetadata removes isEscalated/escalatedAt/escalatedTo to prevent
  // untrusted callers from triggering the bypass — only the escalation job
  // (section-06) is allowed to set these fields.
  let channels: ChannelFlags = { inApp: true, email: false, telegram: false };

  if (isEscalated) {
    // Escalated notifications bypass all preference checks — deliver on all channels
    channels = { inApp: true, email: true, telegram: true };
    console.log("[NotificationService] notification_preference_check", {
      userId,
      category: mapToCategory(relatedResourceType, type),
      result: "escalation_bypass",
    });
  } else if (isPreferenceEnabled()) {
    const category = mapToCategory(relatedResourceType, type);
    const pref = await loadUserPreference(db, userId, category);

    if (pref) {
      // Credit exhaustion is a user-action alert. Its default priority is High,
      // but the category setting is also the user's explicit display priority:
      // lowering it must lower the persisted/delivered priority so it no longer
      // enters the center-screen urgent reminder query.
      if (category === "credits") {
        priority = pref.minSeverity ?? "high";
      }
      // Check mute window
      if (pref.mutedUntil && new Date(pref.mutedUntil) > new Date()) {
        console.log("[NotificationService] notification_preference_check", {
          userId, category, result: "muted",
        });
        return null;
      }
      // Check minimum severity threshold
      if (category !== "credits" && pref.minSeverity && !severityAtOrAbove(priority, pref.minSeverity)) {
        console.log("[NotificationService] notification_preference_check", {
          userId, category, result: "severity_filtered",
        });
        return null;
      }
      // Check in-app channel
      if (!pref.inApp) {
        console.log("[NotificationService] notification_preference_check", {
          userId, category, result: "channel_disabled",
        });
        return null;
      }
      channels = { inApp: pref.inApp, email: pref.email, telegram: pref.telegram };
      console.log("[NotificationService] notification_preference_check", {
        userId, category, result: "delivered",
      });
    } else {
      // No preference row — defaults apply: inApp=true, email=false, telegram=false
      console.log("[NotificationService] notification_preference_check", {
        userId, category, result: "default_delivered",
      });
    }
  }

  // Truncate groupKey to 200 chars to match DB column constraint
  const groupKey = rawGroupKey?.substring(0, 200) || undefined;

  // 1. Build insert values
  const values: any = {
    userId,
    type,
    title,
    content,
    priority,
    isRead: false,
    isDismissed: false,
  };

  if (conversationId !== undefined) {
    values.conversationId = conversationId;
  }

  if (scheduledMessageId !== undefined) {
    values.scheduledMessageId = scheduledMessageId;
  }

  if (relatedResourceType) {
    values.relatedResourceType = relatedResourceType;
  }

  if (relatedResourceId) {
    values.relatedResourceId = relatedResourceId;
  }

  const safeActionUrl = actionUrl ? sanitizeActionUrl(actionUrl) : undefined;
  if (safeActionUrl) {
    values.actionUrl = safeActionUrl;
  }

  if (actionLabel) {
    values.actionLabel = actionLabel.slice(0, 100);
  }

  if (metadata) {
    values.metadata = sanitizeMetadata(metadata);
  }

  if (expiresAt) {
    values.expiresAt = expiresAt;
  }

  if (groupKey) {
    values.groupKey = groupKey;
  }

  let notificationId: number;
  let occurrenceCount = 1;
  let deduplicated = false;

  if (groupKey) {
    // Dedup path: INSERT ... ON CONFLICT on idx_notif_dedup_active
    const [result] = await db
      .insert(userNotifications)
      .values(values)
      .onConflictDoUpdate({
        target: [userNotifications.userId, userNotifications.groupKey],
        targetWhere: sql`"isDismissed" = false AND "groupKey" IS NOT NULL`,
        set: {
          occurrenceCount: sql`${userNotifications.occurrenceCount} + 1`,
          lastOccurredAt: sql`now()`,
          // A deduplicated notification represents the latest occurrence.
          // Keep its visible title and structured action target in sync with
          // the latest event; otherwise the content can mention ticket N
          // while the button still opens the ticket from the first event.
          title: sql`excluded."title"`,
          priority: sql`excluded."priority"`,
          content: sql`excluded."content"`,
          relatedResourceType: sql`excluded."relatedResourceType"`,
          relatedResourceId: sql`excluded."relatedResourceId"`,
          actionUrl: sql`excluded."actionUrl"`,
          actionLabel: sql`excluded."actionLabel"`,
          metadata: sql`excluded."metadata"`,
          isRead: sql`false`,
        },
      })
      .returning({
        id: userNotifications.id,
        occurrenceCount: userNotifications.occurrenceCount,
      });

    notificationId = result.id;
    occurrenceCount = result.occurrenceCount;
    deduplicated = occurrenceCount > 1;

    // Insert occurrence snapshot on dedup hit
    if (deduplicated) {
      try {
        await db
          .insert(notificationOccurrences)
          .values({
            notificationId,
            content,
            metadata: metadata ? sanitizeMetadata(metadata) : undefined,
          });
      } catch {
        // Non-fatal — occurrence tracking is supplementary
      }

      console.log("[NotificationService] notification_dedup_hit", {
        groupKey,
        notificationId,
        newOccurrenceCount: occurrenceCount,
      });
    }
  } else {
    // Standard path: plain INSERT (no dedup)
    const [result] = await db
      .insert(userNotifications)
      .values(values)
      .returning({ id: userNotifications.id });

    notificationId = result.id;
  }

  // 2. Enqueue for Telegram delivery (only when channel is enabled)
  if (channels.telegram) {
    try {
      const { enqueueTelegramNotification } = await import("./telegramService");
      await enqueueTelegramNotification(db, userId, {
        notificationId,
        title,
        content,
        priority,
        createdAt: new Date(),
      });
    } catch (err) {
      // Log but don't throw - Telegram delivery is optional
      console.error("[NotificationService] Telegram enqueue failed (non-fatal):", err);
    }
  }

  // 3. Publish to Redis for real-time SSE (fire-and-forget)
  try {
    const { getRedisClient } = await import("./redis");
    const redis = getRedisClient();
    if (redis) {
      const event = JSON.stringify({
        id: notificationId,
        userId,
        type,
        title,
        content,
        priority,
        relatedResourceType,
        relatedResourceId,
        actionUrl: safeActionUrl,
        actionLabel,
        metadata,
        occurrenceCount,
        deduplicated,
        createdAt: new Date().toISOString(),
      });
      await redis.publish(`notifications:user:${userId}`, event);
    }
  } catch {
    // Non-fatal — SSE listeners just won't get real-time updates
  }

  // 4. Email delivery (fire-and-forget, immediate for high/critical)
  // Note: channels.email defaults to false — only true when user has email preference enabled.
  // Tenant-level NOTIFICATION_EMAIL_DELIVERY flag gate is added by section-13.
  // Locale hardcoded to "en" — users table has no locale column (known gap).
  if (channels.email && (priority === "high" || priority === "critical")) {
    try {
      const userRow = await db.select({
        email: users.email,
        name: users.name,
      }).from(users).where(eq(users.id, userId)).limit(1);
      if (userRow[0]?.email) {
        const { sendNotificationEmail } = await import("./notificationEmailService");
        await sendNotificationEmail({
          userEmail: userRow[0].email,
          userName: userRow[0].name ?? undefined,
          locale: "en",
          notification: {
            id: notificationId,
            type,
            title,
            content,
            priority,
            actionUrl: safeActionUrl ?? undefined,
            actionLabel: actionLabel ?? undefined,
            metadata: metadata as Record<string, unknown> | undefined,
          },
        });
      }
    } catch (err) {
      console.error("[NotificationService] Email delivery failed (non-fatal):", err);
    }
  }
  // Low/normal priority with email=true: handled by digest job (notificationDigestJob.ts)

  // 5. Webhook delivery (fire-and-forget)
  // Tenant-level NOTIFICATION_WEBHOOK_DELIVERY flag gate is added by section-13.
  {
    try {
      const { findMatchingWebhooks, enqueueWebhookDelivery } = await import(
        "./notificationWebhookService"
      );

      // Resolve tenantId from user's currentTenantId
      const userRow = await db
        .select({ currentTenantId: users.currentTenantId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const tenantId = userRow[0]?.currentTenantId
        ? String(userRow[0].currentTenantId)
        : null;
      if (tenantId) {
        const category = mapToCategory(relatedResourceType, type);
        const webhooks = await findMatchingWebhooks(
          tenantId,
          userId,
          category,
          priority
        );

        const webhookPayload = {
          event: "notification.created" as const,
          timestamp: new Date().toISOString(),
          notification: {
            id: notificationId,
            type,
            title,
            content,
            priority,
            relatedResourceType: relatedResourceType ?? null,
            relatedResourceId: relatedResourceId ?? null,
            actionUrl: safeActionUrl ?? null,
            metadata: (metadata as Record<string, unknown>) ?? null,
            createdAt: new Date().toISOString(),
          },
        };

        for (const hook of webhooks) {
          await enqueueWebhookDelivery(hook.id, webhookPayload);
        }
      }
    } catch (err) {
      console.error(
        "[NotificationService] Webhook enqueue failed (non-fatal):",
        err
      );
    }
  }

  return { notificationId, deduplicated, channels };
}

export { createNotification, mapToCategory };
export type { CreateNotificationParams, NotificationType, ReminderPriority, ResourceType, NotificationMetadata, ChannelFlags };
