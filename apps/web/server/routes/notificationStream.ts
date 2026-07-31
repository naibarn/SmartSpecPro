/**
 * Notification SSE Stream — real-time notification push via Server-Sent Events.
 *
 * GET /api/notifications/stream
 * Requires JWT authentication. Pushes new notifications as they arrive.
 *
 * Security hardening:
 * - Per-user connection cap (max 5 concurrent SSE connections)
 * - Redis messages parsed and re-serialized to prevent SSE frame injection
 * - No userId leaked in connected event
 */

import { Router, type Request, type Response } from "express";
import { sdk } from "../_core/sdk";
import { createSSEEvictionLogLimiter } from "./notificationStreamDiagnostics";

const notificationStreamRouter = Router();

const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_SSE_PER_USER = 5;

// Track active SSE subscribers per user to prevent resource leaks
const activeSubscribers = new Map<number, Set<{ disconnect: () => void }>>();
const evictionLogLimiter = createSSEEvictionLogLimiter();

notificationStreamRouter.get("/api/notifications/stream", async (req: Request, res: Response) => {
  // Authenticate
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

  // Setup SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("\n");

  const userId = user.id;
  const channel = `notifications:user:${userId}`;

  // Enforce per-user connection cap — close oldest if at limit
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
      try { oldest.disconnect(); } catch { /* already closed */ }
      userSubs.delete(oldest);
    }
  }
  activeSubscribers.set(userId, userSubs);

  // Subscribe to Redis
  let subscriber: any = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let subEntry: { disconnect: () => void } | null = null;

  try {
    const { getRedisClient } = await import("../services/redis");
    const redis = getRedisClient();
    if (!redis) {
      res.write("event: error\ndata: Redis unavailable\n\n");
      res.end();
      return;
    }

    // Duplicate connection for subscriber
    subscriber = redis.duplicate();
    await subscriber.subscribe(channel);

    subscriber.on("message", (_ch: string, message: string) => {
      try {
        // Parse and re-serialize to prevent SSE frame injection via embedded newlines
        const parsed = JSON.parse(message);
        const safe = JSON.stringify(parsed);
        res.write(`event: notification\ndata: ${safe}\n\n`);
      } catch {
        // Malformed JSON — drop silently, don't forward
      }
    });

    // Heartbeat to keep connection alive
    heartbeatTimer = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch {
        // Connection closed
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Send initial connected event — no userId to prevent unnecessary data exposure
    res.write('event: connected\ndata: {"status":"connected"}\n\n');

    // Register in active subscribers map
    subEntry = {
      disconnect: () => {
        try {
          subscriber?.unsubscribe(channel);
          subscriber?.disconnect();
        } catch { /* already closed */ }
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        res.end();
      },
    };
    userSubs.add(subEntry);

  } catch (err) {
    console.error("[NotificationStream] Redis subscribe failed:", err);
    res.write("event: error\ndata: Subscribe failed\n\n");
    res.end();
    return;
  }

  // Cleanup on disconnect
  const cleanup = async () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    if (subscriber) {
      try {
        await subscriber.unsubscribe(channel);
        subscriber.disconnect();
      } catch {
        // Already disconnected
      }
      subscriber = null;
    }
    // Remove from active subscribers tracking
    if (subEntry) {
      const subs = activeSubscribers.get(userId);
      if (subs) {
        subs.delete(subEntry);
        if (subs.size === 0) activeSubscribers.delete(userId);
      }
      subEntry = null;
    }
  };

  req.on("close", cleanup);
  req.on("error", cleanup);
});

/** Returns the total number of active SSE connections across all users. */
export function getActiveSSEConnectionCount(): number {
  let count = 0;
  for (const subs of activeSubscribers.values()) {
    count += subs.size;
  }
  return count;
}

export default notificationStreamRouter;
