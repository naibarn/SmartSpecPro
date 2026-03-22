/**
 * Agency SSE Streaming Routes — Redis pub/sub based event streaming.
 *
 * Unlike agencyStreamProxy.ts (which pipes Python's SSE response byte-for-byte),
 * this route subscribes to Redis pub/sub events emitted by the Python orchestrator.
 * This enables:
 * - Replay on reconnect (Redis list persistence)
 * - Backpressure control (bounded buffer)
 * - Node.js-side event injection (e.g. approval events from tRPC)
 *
 * Gated behind feature flag AGENCY_STREAMING_ENABLED.
 *
 * Routes:
 * - POST /api/agency/:agencyId/stream  — SSE stream for agency run
 * - POST /api/agency/:agencyId/cancel  — Cancel a running agency
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { sdk } from "../_core/sdk";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import { isFeatureEnabled } from "../services/tenantFeatureFlagService";
import type { TenantRequest } from "../_core/tenant";
import { persistRunTrace } from "../services/agencyTraceService";

const agencyStreamRouter = Router();

const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const MAX_BUFFER_SIZE = 1000;
const AGENCY_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Max concurrent SSE streams per user. */
const MAX_STREAMS_PER_USER = 3;
const activeStreams = new Map<string, number>();

function acquireStream(userId: string): boolean {
  const current = activeStreams.get(userId) || 0;
  if (current >= MAX_STREAMS_PER_USER) return false;
  activeStreams.set(userId, current + 1);
  return true;
}

function releaseStream(userId: string): void {
  const current = activeStreams.get(userId) || 0;
  if (current <= 1) {
    activeStreams.delete(userId);
  } else {
    activeStreams.set(userId, current - 1);
  }
}

// ── Request validation ───────────────────────────────────────────────────────

const streamBodySchema = z.object({
  runId: z.string().min(1),
  message: z.string().optional(),
  conversationId: z.string().optional(),
});

const cancelBodySchema = z.object({
  runId: z.string().min(1),
  mode: z.enum(["immediate", "after_turn"]),
});

// ── Auth helper ──────────────────────────────────────────────────────────────

async function authenticateSSE(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return null;
    }
    return user;
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
}

// ── SSE Stream Route ─────────────────────────────────────────────────────────

agencyStreamRouter.post(
  "/api/agency/:agencyId/stream",
  async (req: Request, res: Response) => {
    // 1. Authenticate first (need tenantId for feature flag check)
    const user = await authenticateSSE(req, res);
    if (!user) return;

    const tenantReq = req as TenantRequest;
    const tenantId = resolveTenantIdVarchar(
      tenantReq.tenant?.id ?? null,
      user.currentTenantId,
    );
    if (!tenantId) {
      return res.status(403).json({ error: "Tenant context required" });
    }

    // 2. Tenant-scoped feature flag check
    const { db: flagDb } = await import("../db");
    const { tenants } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const [tenantRow] = await flagDb
      .select({ featureFlags: tenants.featureFlags })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    const storedFlags = (tenantRow?.featureFlags as Record<string, boolean>) ?? null;
    if (!isFeatureEnabled(storedFlags, "agencyStreaming")) {
      return res.status(403).json({ error: "Agency streaming not enabled for this tenant" });
    }

    // 3. Validate agencyId
    const { agencyId } = req.params;
    if (!agencyId || !AGENCY_ID_PATTERN.test(agencyId)) {
      return res.status(400).json({ error: "Invalid agencyId format" });
    }

    // 4. Validate body
    const bodyResult = streamBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      return res.status(400).json({ error: "runId is required" });
    }
    const { runId } = bodyResult.data;

    // 5. Per-user stream limit
    const userId = String(user.id);
    if (!acquireStream(userId)) {
      return res.status(429).json({ error: "Too many concurrent streams" });
    }

    // 6. Verify agency belongs to tenant
    try {
      const { getDb } = await import("../db");
      const { agencies } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const db = await getDb();
      if (db) {
        const [agency] = await db
          .select({ id: agencies.id })
          .from(agencies)
          .where(
            and(
              eq(agencies.id, agencyId),
              eq(agencies.tenantId, tenantId),
            ),
          )
          .limit(1);
        if (!agency) {
          releaseStream(userId);
          return res.status(404).json({ error: "Agency not found" });
        }
      }
    } catch {
      // DB unavailable — cannot verify tenant isolation, refuse
      releaseStream(userId);
      return res.status(503).json({ error: "Service temporarily unavailable" });
    }

    // 7. Write SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // 8. Setup heartbeat
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(": keepalive\n\n");
      }
    }, HEARTBEAT_INTERVAL_MS);

    // 9. Max duration timeout
    const maxDuration = setTimeout(() => {
      if (!res.writableEnded) {
        res.write(
          'event: close\ndata: {"reason":"max_duration"}\n\n',
        );
      }
      cleanup();
    }, MAX_DURATION_MS);

    let subscriber: any = null;
    let cleaned = false;

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearInterval(heartbeat);
      clearTimeout(maxDuration);
      releaseStream(userId);
      if (subscriber) {
        subscriber.unsubscribe(`agency:stream:${runId}`).catch(() => {});
        subscriber.quit().catch(() => {});
      }
      if (!res.writableEnded) {
        res.end();
      }
    };

    res.on("close", cleanup);

    // 10. Replay missed events if Last-Event-ID provided
    const lastEventId = req.headers["last-event-id"] as string | undefined;

    try {
      const { getRedisClient } = await import("../services/redis");
      const redis = getRedisClient();
      if (!redis) {
        if (!res.writableEnded) {
          res.write(
            'event: error\ndata: {"code":"redis_unavailable","message":"Streaming unavailable"}\n\n',
          );
        }
        cleanup();
        return;
      }

      // Replay from Redis list
      if (lastEventId) {
        try {
          const events = await redis.lrange(
            `agency:stream:${runId}:events`,
            0,
            -1,
          );
          const lastId = parseInt(lastEventId, 10);
          if (!isNaN(lastId)) {
            for (const raw of events) {
              try {
                const ev = JSON.parse(raw);
                if (parseInt(ev.id, 10) > lastId) {
                  res.write(`id: ${ev.id}\n`);
                  res.write(`event: ${ev.event}\n`);
                  res.write(`data: ${raw}\n\n`);
                }
              } catch {
                // Skip malformed events
              }
            }
          }
        } catch {
          // Replay is best-effort
        }
      }

      // 11. Subscribe to live channel
      subscriber = redis.duplicate();
      await subscriber.subscribe(`agency:stream:${runId}`);

      // Bounded buffer for backpressure
      const buffer: string[] = [];

      subscriber.on("message", (_ch: string, message: string) => {
        if (res.writableEnded) return;

        try {
          const ev = JSON.parse(message);

          // Bounded buffer: track last N events
          if (buffer.length >= MAX_BUFFER_SIZE) {
            buffer.shift(); // Drop oldest
          }
          buffer.push(message);

          // Write SSE frame
          res.write(`id: ${ev.id}\n`);
          res.write(`event: ${ev.event}\n`);
          res.write(`data: ${message}\n\n`);

          // Persist run trace when trace_complete arrives
          if (ev.event === "trace_complete" && ev.data) {
            const d = ev.data;
            if (d.runId && d.agencyId && d.tenantId && d.trace) {
              persistRunTrace(d).catch((err: unknown) => {
                console.error("[AgencyStream] Failed to persist trace:", err);
              });
            } else {
              console.error("[AgencyStream] Malformed trace_complete event, missing required fields");
            }
          }

          // Auto-close on terminal events
          if (ev.event === "run_complete" || ev.event === "error") {
            cleanup();
          }
        } catch {
          // Skip malformed messages
        }
      });
    } catch {
      // Redis not available — just keep heartbeat going
    }
  },
);

// ── Cancel Route ─────────────────────────────────────────────────────────────

agencyStreamRouter.post(
  "/api/agency/:agencyId/cancel",
  async (req: Request, res: Response) => {
    // 1. Authenticate
    const user = await authenticateSSE(req, res);
    if (!user) return;

    // 2. Tenant-scoped feature flag check
    const tenantReq = req as TenantRequest;
    const cancelTenantId = resolveTenantIdVarchar(
      tenantReq.tenant?.id ?? null,
      user.currentTenantId,
    );
    if (cancelTenantId) {
      const { db: flagDb } = await import("../db");
      const { tenants } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [tenantRow] = await flagDb
        .select({ featureFlags: tenants.featureFlags })
        .from(tenants)
        .where(eq(tenants.id, cancelTenantId))
        .limit(1);
      const storedFlags = (tenantRow?.featureFlags as Record<string, boolean>) ?? null;
      if (!isFeatureEnabled(storedFlags, "agencyStreaming")) {
        return res.status(403).json({ error: "Agency streaming not enabled for this tenant" });
      }
    }

    // 3. Validate agencyId
    const { agencyId } = req.params;
    if (!agencyId || !AGENCY_ID_PATTERN.test(agencyId)) {
      return res.status(400).json({ error: "Invalid agencyId format" });
    }

    // 4. Validate body
    const bodyResult = cancelBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      return res.status(400).json({ error: "runId and mode are required" });
    }
    const { runId, mode } = bodyResult.data;

    // 5. Set cancellation key in Redis
    try {
      const { getRedisClient } = await import("../services/redis");
      const redis = getRedisClient();
      if (redis) {
        await redis.set(`agency:cancel:${runId}`, mode, "EX", 300);
      }
    } catch {
      // Redis failure is non-fatal — try direct cancel below
    }

    return res.json({ cancelled: true });
  },
);

export default agencyStreamRouter;
