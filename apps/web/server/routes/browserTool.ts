/**
 * Browser Automation Tool Endpoint — Credit Pre-Reservation Pattern
 *
 * POST /api/internal/tools/browser
 *
 * Flow:
 * 1. Validate request (userId, tenantId, actions)
 * 2. Verify X-Internal-Token header
 * 3. Check feature flag (browserAutomation must be enabled)
 * 4. Check concurrency limits (Redis semaphore)
 * 5. Check credit balance (hasEnoughCredits >= 20)
 * 6. Pre-reserve 20 credits via deductCredits({ sourceType: 'browser_automation', amount: 20 })
 * 7. Forward to Python browser service (POST /api/browser/execute)
 * 8. On success: if actualCost < 20, refundCredits({ amount: 20 - actualCost })
 * 9. On failure: refundCredits({ amount: 20 })
 */

import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "crypto";

import { deductCredits, refundCredits, hasEnoughCredits } from "../services/creditService";
import { getRedisClient } from "../services/redis";
import { getTenantFeatureFlag } from "../services/featureFlags";
import { ENV } from "../_core/env";

const router = Router();

// ── Domain validation (exported for testing) ────────────────────────────────

export interface DomainValidationError {
  status: number;
  code: string;
  message: string;
}

export function validateBrowserDomains(
  actions: Array<{ action: string; url?: string; [key: string]: unknown }>,
  allowedDomains: string[] | undefined,
): DomainValidationError | null {
  const urlsInActions = actions
    .filter((a) => a.action === "navigate" && a.url)
    .map((a) => a.url as string);

  if (urlsInActions.length === 0) {
    return null; // No navigate actions = no domain check needed
  }

  if (!allowedDomains || allowedDomains.length === 0) {
    return {
      status: 403,
      code: "DOMAIN_NOT_ALLOWED",
      message: "No allowed domains configured. All navigation is blocked.",
    };
  }

  for (const url of urlsInActions) {
    let hostname: string;
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      return {
        status: 400,
        code: "INVALID_URL",
        message: `Invalid URL: "${url}"`,
      };
    }

    const isAllowed = allowedDomains.some((d: string) => {
      const domain = d.toLowerCase().trim();
      return hostname === domain || hostname.endsWith("." + domain);
    });

    if (!isAllowed) {
      return {
        status: 403,
        code: "DOMAIN_NOT_ALLOWED",
        message: `Domain "${hostname}" is not in the allowed domains list.`,
      };
    }
  }

  return null;
}

const BROWSER_RESERVE_CREDITS = 20;
const PYTHON_BACKEND_URL = ENV.pythonBackendUrl || "http://127.0.0.1:8000";

// ── Internal token check ───────────────────────────────────────────────────

function verifyInternalToken(req: Request): boolean {
  const expected = ENV.webGatewayToken;
  if (!expected) return false;
  const token = req.headers["x-internal-token"] as string | undefined;
  if (!token) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

// ── Concurrency limit keys ─────────────────────────────────────────────────

const USER_SEM_TTL = 310; // seconds

async function checkAndAcquireConcurrency(
  userId: number,
  tenantId: string,
  sessionId: string,
): Promise<{ acquired: boolean; reason?: string }> {
  const redis = getRedisClient();
  const userKey = `browser:sem:user:${userId}`;

  // Per-user: SET NX EX (atomic)
  const acquired = await redis.set(userKey, sessionId, "EX", USER_SEM_TTL, "NX" as any);
  if (!acquired) {
    return { acquired: false, reason: "User already has an active browser session." };
  }

  // Per-tenant: INCR + EXPIRE via pipeline (atomic pair)
  const tenantKey = `browser:sem:tenant:${tenantId}`;
  try {
    const pipeline = redis.pipeline();
    pipeline.incr(tenantKey);
    pipeline.expire(tenantKey, USER_SEM_TTL);
    const results = await pipeline.exec();
    const tenantCount = (results?.[0]?.[1] as number) ?? 0;

    if (tenantCount > 2) {
      await redis.decr(tenantKey);
      await redis.del(userKey);
      return { acquired: false, reason: "Tenant concurrent browser session limit reached." };
    }
  } catch {
    await redis.del(userKey);
    throw new Error("Failed to acquire browser session concurrency slot.");
  }

  return { acquired: true };
}

async function releaseConcurrency(userId: number, tenantId: string): Promise<void> {
  const redis = getRedisClient();
  const userKey = `browser:sem:user:${userId}`;
  const tenantKey = `browser:sem:tenant:${tenantId}`;

  await redis.del(userKey);
  const remaining = await redis.decr(tenantKey);
  if (remaining < 0) {
    await redis.set(tenantKey, 0, "EX", USER_SEM_TTL);
  }
}

// ── Main handler ─────────────────────────────────────────────────────────

router.post("/api/internal/tools/browser", async (req: Request, res: Response) => {
  // Verify internal service token
  if (!verifyInternalToken(req)) {
    res.status(401).json({ error: "Unauthorized.", code: "UNAUTHORIZED" });
    return;
  }

  const { userId, tenantId, actions, allowedDomains = [], timeout = 300, parentReservationId } =
    req.body as {
      userId?: number;
      tenantId?: string;
      actions?: unknown[];
      allowedDomains?: string[];
      timeout?: number;
      parentReservationId?: string;
    };

  // Basic validation
  if (!userId || !tenantId) {
    res.status(400).json({ error: "userId and tenantId are required.", code: "INVALID_REQUEST" });
    return;
  }

  if (!Array.isArray(actions) || actions.length === 0) {
    res
      .status(400)
      .json({ error: "actions array is required and must not be empty.", code: "INVALID_REQUEST" });
    return;
  }

  // Feature flag check
  const browserEnabled = await getTenantFeatureFlag("browserAutomation", tenantId).catch(
    () => false,
  );
  if (!browserEnabled) {
    res
      .status(403)
      .json({ error: "Browser automation is not enabled for this tenant.", code: "FEATURE_DISABLED" });
    return;
  }

  // Domain validation — BEFORE concurrency and credit checks (fail fast)
  const domainError = validateBrowserDomains(
    actions as Array<{ action: string; url?: string }>,
    allowedDomains,
  );
  if (domainError) {
    res.status(domainError.status).json({
      error: domainError.message,
      code: domainError.code,
    });
    return;
  }

  const sessionId = crypto.randomUUID();
  let concurrencyAcquired = false;
  let creditsReserved = false;

  try {
    // Concurrency check
    const concurrencyResult = await checkAndAcquireConcurrency(userId, tenantId, sessionId);
    if (!concurrencyResult.acquired) {
      res.status(429).json({
        error: concurrencyResult.reason ?? "Browser session limit reached.",
        code: "CONCURRENT_LIMIT",
      });
      return;
    }
    concurrencyAcquired = true;

    // Credit balance check
    const hasCredits = await hasEnoughCredits(userId, BROWSER_RESERVE_CREDITS);
    if (!hasCredits) {
      res.status(402).json({
        error: "Insufficient credits for browser session.",
        code: "INSUFFICIENT_CREDITS",
      });
      return;
    }

    // Pre-reserve credits
    await deductCredits({
      userId,
      amount: BROWSER_RESERVE_CREDITS,
      description: "Browser automation session reservation",
      sourceType: "browser_automation",
      tenantId,
    });
    creditsReserved = true;

    // Forward to Python browser service
    const pythonRes = await fetch(`${PYTHON_BACKEND_URL}/api/browser/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": ENV.webGatewayToken ?? "",
      },
      body: JSON.stringify({
        session_id: sessionId,
        actions,
        allowed_domains: allowedDomains,
        timeout,
        user_id: userId,
        tenant_id: tenantId,
      }),
      signal: AbortSignal.timeout((timeout + 10) * 1000),
    });

    if (!pythonRes.ok) {
      // Log raw error internally, return sanitized response
      const rawBody = await pythonRes.text().catch(() => "");
      console.error("[browserTool] Python service error", pythonRes.status, rawBody.slice(0, 200));

      await refundCredits({
        userId,
        amount: BROWSER_RESERVE_CREDITS,
        description: "Browser session full refund (service error)",
      });
      creditsReserved = false;

      // Normalize upstream error to avoid leaking internal details
      res.status(502).json({
        error: "Browser execution failed.",
        code: "EXECUTION_ERROR",
      });
      return;
    }

    const result = (await pythonRes.json()) as {
      session_id: string;
      results: unknown[];
      actual_cost: number;
      screenshots_taken: number;
      pages_loaded: number;
    };

    // Clamp actual_cost to prevent over-refund from malicious/buggy response
    const actualCost = Math.max(0, Math.min(result.actual_cost ?? 0, BROWSER_RESERVE_CREDITS));
    if (actualCost < BROWSER_RESERVE_CREDITS) {
      const refundAmount = BROWSER_RESERVE_CREDITS - actualCost;
      await refundCredits({
        userId,
        amount: refundAmount,
        description: `Browser session partial refund (used ${actualCost} of ${BROWSER_RESERVE_CREDITS} credits)`,
      });
    }

    res.json(result);
  } catch (err) {
    if (creditsReserved) {
      await refundCredits({
        userId,
        amount: BROWSER_RESERVE_CREDITS,
        description: "Browser session full refund (unexpected error)",
      }).catch(() => {});
    }

    console.error("[browserTool] Unexpected error:", err);
    res.status(500).json({ error: "Browser tool failed.", code: "INTERNAL_ERROR" });
  } finally {
    if (concurrencyAcquired) {
      await releaseConcurrency(userId, tenantId).catch(() => {});
    }
  }
});

export default router;
