/**
 * Notification SSE stream backed by durable PostgreSQL notification rows.
 *
 * GET /api/notifications/stream requires JWT authentication. New notifications
 * are polled from the user's persisted inbox, so reconnects do not depend on
 * transient pub/sub delivery to a particular web instance.
 */

import { Router, type Request, type Response } from "express";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { sdk } from "../_core/sdk";
import { getDb } from "../db";
import { notificationOccurrences, userNotifications } from "../../drizzle/schema";
import { createSSEEvictionLogLimiter } from "./notificationStreamDiagnostics";

const notificationStreamRouter = Router();
const HEARTBEAT_INTERVAL_MS = 30_000;
const POLL_INTERVAL_MS = 2_000;
const MAX_SSE_PER_USER = 5;

const activeSubscribers = new Map<number, Set<{ disconnect: () => void }>>();
const evictionLogLimiter = createSSEEvictionLogLimiter();

notificationStreamRouter.get("/api/notifications/stream", async (req: Request, res: Response) => {
  let user;
  try {
    user = await sdk.authenticateRequest(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userId = user.id;
  let lastSeenId: number;
  try {
    lastSeenId = (await getDb().select({ id: notificationOccurrences.id })
      .from(notificationOccurrences)
      .innerJoin(userNotifications, eq(notificationOccurrences.notificationId, userNotifications.id))
      .where(eq(userNotifications.userId, userId))
      .orderBy(desc(notificationOccurrences.id))
      .limit(1))[0]?.id ?? 0;
  } catch (err) {
    console.error("[NotificationStream] PostgreSQL setup failed:", err);
    res.status(503).json({ error: "Notification stream unavailable" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("\n");

  const userSubs = activeSubscribers.get(userId) ?? new Set();
  if (userSubs.size >= MAX_SSE_PER_USER) {
    const oldest = userSubs.values().next().value;
    if (oldest) {
      const evictionLog = evictionLogLimiter.record(userId);
      if (evictionLog.shouldLog) {
        console.warn("[NotificationStream] evicting_oldest_sse_connection", {
          userId,
          tenantId: user.currentTenantId ?? null,
          activeConnections: userSubs.size,
          suppressedEvictions: evictionLog.suppressedCount,
        });
      }
      oldest.disconnect();
      userSubs.delete(oldest);
    }
  }
  activeSubscribers.set(userId, userSubs);

  let heartbeatTimer: NodeJS.Timeout | null = null;
  let pollTimer: NodeJS.Timeout | null = null;
  let pollInFlight = false;
  let subEntry: { disconnect: () => void } | null = null;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (pollTimer) clearInterval(pollTimer);
    heartbeatTimer = null;
    pollTimer = null;
    const subs = activeSubscribers.get(userId);
    if (subEntry && subs) {
      subs.delete(subEntry);
      if (subs.size === 0) activeSubscribers.delete(userId);
    }
    subEntry = null;
    try { res.end(); } catch { /* already closed */ }
  };

  const poll = async () => {
    if (pollInFlight || closed || res.writableEnded) return;
    pollInFlight = true;
    try {
      const rows = await getDb().select({
        occurrenceId: notificationOccurrences.id,
        occurrenceContent: notificationOccurrences.content,
        occurrenceMetadata: notificationOccurrences.metadata,
        id: userNotifications.id,
        type: userNotifications.type,
        title: userNotifications.title,
        content: userNotifications.content,
        priority: userNotifications.priority,
        relatedResourceType: userNotifications.relatedResourceType,
        relatedResourceId: userNotifications.relatedResourceId,
        actionUrl: userNotifications.actionUrl,
        actionLabel: userNotifications.actionLabel,
        metadata: userNotifications.metadata,
        occurrenceCount: userNotifications.occurrenceCount,
        createdAt: notificationOccurrences.occurredAt,
      })
        .from(notificationOccurrences)
        .innerJoin(userNotifications, eq(notificationOccurrences.notificationId, userNotifications.id))
        .where(and(eq(userNotifications.userId, userId), gt(notificationOccurrences.id, lastSeenId)))
        .orderBy(asc(notificationOccurrences.id))
        .limit(100);
      for (const notification of rows) {
        lastSeenId = notification.occurrenceId;
        const event = {
          id: notification.id,
          userId,
          type: notification.type,
          title: notification.title,
          content: notification.occurrenceContent ?? notification.content,
          priority: notification.priority,
          relatedResourceType: notification.relatedResourceType,
          relatedResourceId: notification.relatedResourceId,
          actionUrl: notification.actionUrl,
          actionLabel: notification.actionLabel,
          metadata: notification.occurrenceMetadata ?? notification.metadata,
          occurrenceCount: notification.occurrenceCount,
          createdAt: notification.createdAt?.toISOString(),
        };
        res.write(`event: notification\ndata: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err) {
      console.error("[NotificationStream] PostgreSQL poll failed:", err);
    } finally {
      pollInFlight = false;
    }
  };

  subEntry = { disconnect: cleanup };
  userSubs.add(subEntry);
  pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
  heartbeatTimer = setInterval(() => {
    if (res.writableEnded) return cleanup();
    res.write(": heartbeat\n\n");
  }, HEARTBEAT_INTERVAL_MS);
  res.write('event: connected\ndata: {"status":"connected"}\n\n');
  req.on("close", cleanup);
  req.on("error", cleanup);
});

/** Returns the total number of active SSE connections across all users. */
export function getActiveSSEConnectionCount(): number {
  let count = 0;
  for (const subs of activeSubscribers.values()) count += subs.size;
  return count;
}

export default notificationStreamRouter;
