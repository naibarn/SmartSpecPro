import { Router } from "express";
import { sdk } from "../_core/sdk";

export function createGuardianSSERouter(): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    // Authenticate — only admins
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!user || (user.role !== "admin" && user.role !== "domain_admin" && user.role !== "system_agent")) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    // Heartbeat
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 30_000);

    // Max connection duration: 60 minutes
    const maxDuration = setTimeout(() => {
      res.write("event: close\ndata: {\"reason\":\"max_duration\"}\n\n");
      cleanup();
    }, 60 * 60 * 1000);

    // Redis subscriber for guardian events
    let subscriber: any = null;
    try {
      const { getRedisClient } = await import("../services/redis");
      const redis = getRedisClient();
      if (redis && typeof redis.duplicate === "function") {
        subscriber = redis.duplicate();
        await subscriber.subscribe("guardian:events");
        subscriber.on("message", (_channel: string, message: string) => {
          try {
            const event = JSON.parse(message);
            // Filter by tenant if user is not domain_admin
            if (user.role !== "domain_admin" && event.tenantId && event.tenantId !== (req as any).tenant?.id) {
              return;
            }
            res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data ?? event)}\n\n`);
          } catch {
            // Skip malformed events
          }
        });
      }
    } catch {
      // Redis not available — SSE still works, just no live events
    }

    function cleanup() {
      clearInterval(heartbeat);
      clearTimeout(maxDuration);
      if (subscriber) {
        subscriber.unsubscribe().catch(() => {});
        subscriber.quit().catch(() => {});
        subscriber = null;
      }
      res.end();
    }

    req.on("close", cleanup);
  });

  return router;
}
