/**
 * Internal Metrics Push Route
 *
 * Receives health-check metrics from Python Celery tasks and persists them
 * via monitoringService. Authentication uses the same timing-safe bearer token
 * pattern as other internal endpoints (SMARTSPEC_WEB_GATEWAY_TOKEN /
 * X-Internal-Token header).
 *
 * POST /api/internal/metrics/push
 *   Auth:  X-Internal-Token: <SMARTSPEC_WEB_GATEWAY_TOKEN>
 *          OR Authorization: Bearer <SMARTSPEC_WEB_GATEWAY_TOKEN>
 *   Body:  PushMetricsBody (JSON)
 */

import crypto from "crypto";
import type { Application, Request, Response } from "express";
import { z } from "zod";
import * as monitoringService from "../services/monitoringService";
import { ENV } from "../_core/env";

// Simple in-process rate limiter: max 10 req/min for this endpoint
const _rateBucket = { count: 0, resetAt: Date.now() + 60_000 };
function _checkRateLimit(): boolean {
  const now = Date.now();
  if (now > _rateBucket.resetAt) {
    _rateBucket.count = 0;
    _rateBucket.resetAt = now + 60_000;
  }
  _rateBucket.count += 1;
  return _rateBucket.count <= 10;
}

// ─── Input schema ─────────────────────────────────────────────────────────────

const alertSchema = z.object({
  severity: z.string().min(1).max(16),
  title: z.string().min(1).max(256),
  message: z.string().min(1),
  channel: z.string().min(1).max(64),
});

const pushMetricsBodySchema = z.object({
  checkType: z.string().min(1).max(64),
  status: z.enum(["ok", "warning", "critical", "error"]),
  source: z.string().min(1).max(64).default("celery_task"),
  details: z.record(z.unknown()).default({}).refine(
    (v) => JSON.stringify(v).length <= 32_768,
    { message: "details payload exceeds 32 KB limit" }
  ),
  alert: alertSchema.nullable().optional(),
});

// ─── Auth helper ──────────────────────────────────────────────────────────────

/**
 * Verify either X-Internal-Token or Authorization: Bearer header against
 * SMARTSPEC_WEB_GATEWAY_TOKEN using a timing-safe comparison.
 */
function verifyMetricsToken(req: Request): boolean {
  const expected = ENV.webGatewayToken;
  if (!expected || expected.length < 32) return false;

  // Accept both X-Internal-Token and Authorization: Bearer
  const headerToken =
    (req.headers["x-internal-token"] as string | undefined) ??
    (() => {
      const auth = req.headers.authorization ?? "";
      return auth.startsWith("Bearer ") ? auth.slice(7) : "";
    })();

  if (!headerToken || headerToken.length < 32) return false;

  const tokenBuf = Buffer.from(headerToken);
  const expectedBuf = Buffer.from(expected);
  if (tokenBuf.length !== expectedBuf.length) return false;

  return crypto.timingSafeEqual(tokenBuf, expectedBuf);
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerInternalMetricsRoute(app: Application): void {
  app.post("/api/internal/metrics/push", async (req: Request, res: Response) => {
    if (!_checkRateLimit()) {
      return res.status(429).json({ success: false, error: "Too Many Requests" });
    }
    if (!verifyMetricsToken(req)) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const parsed = pushMetricsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
    }

    try {
      const result = await monitoringService.pushMetrics({
        checkType: parsed.data.checkType,
        status: parsed.data.status,
        source: parsed.data.source,
        details: parsed.data.details,
        alert: parsed.data.alert ?? null,
      });

      return res.status(200).json({ success: true, checkId: result.checkId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      console.error("[internalMetrics] push failed:", message);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  });
}
