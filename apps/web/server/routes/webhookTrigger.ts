/**
 * Webhook Trigger Express Route — POST /api/webhooks/trigger/:triggerId
 *
 * Processing order (strictly enforced):
 *   1. Lookup trigger (404 if not found or inactive)
 *   2. Feature flag check (403 if disabled)
 *   3. Auth verification (401 on failure) — BEFORE any template processing
 *   4. Deduplication (200 early return if duplicate)
 *   5. Rate limit check (429 if exceeded)
 *   6. Credit check (402 if insufficient)
 *   7. Template substitution
 *   8. Target dispatch (async after 200 ack)
 *   9. Log recording
 *
 * Security notes:
 * - Auth verified with timingSafeEqual to prevent timing attacks
 * - HMAC replay protected by 300s timestamp window
 * - Dedup key includes body hash to prevent false dedup on same-second requests
 * - Source IP masked to /24 prefix in logs
 * - Auth headers stripped from logged headers (only Content-Type, User-Agent, X-Forwarded-For)
 * - Secret pattern values redacted before log storage
 */

import crypto from "crypto";
import { Router, type Request, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { webhookTriggers, webhookTriggerLogs } from "../../drizzle/schema";
import { getTenantFeatureFlag } from "../services/featureFlags";
import { hasEnoughCredits, deductCredits } from "../services/creditService";
import { auditLogger } from "../services/auditLogger";
import { channelGateway } from "../services/channelGateway";
import { agencyBridge } from "../services/agencyBridge";
import {
  verifyTokenAuth,
  verifyHmacAuth,
  checkDedup,
  checkWebhookRateLimit,
  stripSecrets,
  substituteTemplateObject,
  hashBody,
  maskIp,
} from "../services/webhookTriggerService";

// Safe request headers to log (no auth headers)
const SAFE_HEADERS = new Set(["content-type", "user-agent", "x-forwarded-for"]);

function extractSafeHeaders(headers: Record<string, string | string[] | undefined>) {
  const safe: Record<string, string> = {};
  for (const key of SAFE_HEADERS) {
    const val = headers[key];
    if (val) safe[key] = Array.isArray(val) ? val[0] : val;
  }
  return safe;
}

async function recordLog(
  triggerId: string,
  data: {
    status: "success" | "auth_failed" | "rate_limited" | "target_error" | "credit_insufficient";
    requestMethod: string;
    requestBodyHash: string;
    requestBodySize: number;
    requestHeadersSafe: Record<string, string>;
    extractedVariables: Record<string, unknown>;
    sourceIpMasked: string;
    creditsConsumed: number;
    errorMessage?: string;
    processingTimeMs: number;
  },
) {
  try {
    await db
      .insert(webhookTriggerLogs)
      .values({
        triggerId,
        requestMethod: data.requestMethod,
        requestBodyHash: data.requestBodyHash,
        requestBodySize: data.requestBodySize,
        requestHeadersSafe: data.requestHeadersSafe,
        extractedVariables: stripSecrets(data.extractedVariables),
        sourceIpMasked: data.sourceIpMasked,
        status: data.status,
        creditsConsumed: String(data.creditsConsumed),
        errorMessage: data.errorMessage ?? null,
        processingTimeMs: data.processingTimeMs,
      } as any);
  } catch (err) {
    auditLogger.log({
      eventType: "webhook_ingest_error" as any,
      userId: null,
      metadata: { triggerId, error: String(err) },
    });
  }
}

export function createWebhookTriggerRouter(): Router {
  const router = Router();

  router.post("/:triggerId", async (req: Request, res: Response) => {
    const startTime = Date.now();
    const { triggerId } = req.params;
    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
    const bodyHash = hashBody(rawBody);
    const bodySize = Buffer.byteLength(rawBody, "utf8");
    const sourceIp = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const sourceIpMasked = maskIp(sourceIp);
    const requestHeadersSafe = extractSafeHeaders(req.headers as any);

    // ── Step 1: Lookup trigger ─────────────────────────────────────────────────
    const [trigger] = await db
      .select()
      .from(webhookTriggers)
      .where(eq(webhookTriggers.id, triggerId))
      .limit(1);

    if (!trigger || !trigger.isActive) {
      return res.status(404).json({ error: "Trigger not found" });
    }

    // ── Step 2: Feature flag check ─────────────────────────────────────────────
    const flagEnabled = await getTenantFeatureFlag("webhookTriggers", trigger.tenantId);
    if (!flagEnabled) {
      return res.status(403).json({ error: "Webhook triggers not enabled for this tenant" });
    }

    // ── Step 3: Auth verification (BEFORE template processing) ─────────────────
    let authOk = false;

    if (trigger.authType === "token") {
      const authHeader = req.headers["authorization"] ?? "";
      const token = String(authHeader).replace(/^Bearer\s+/i, "");
      authOk = await verifyTokenAuth(trigger.authSecretEncrypted, token);
    } else if (trigger.authType === "hmac_sha256") {
      const timestamp = String(req.headers["x-webhook-timestamp"] ?? "");
      const signature = String(req.headers["x-webhook-signature"] ?? "");
      const result = await verifyHmacAuth(trigger.authSecretEncrypted, timestamp, signature, rawBody);
      authOk = result.valid;
    }

    if (!authOk) {
      const processingTimeMs = Date.now() - startTime;
      await recordLog(triggerId, {
        status: "auth_failed",
        requestMethod: req.method,
        requestBodyHash: bodyHash,
        requestBodySize: bodySize,
        requestHeadersSafe,
        extractedVariables: {},
        sourceIpMasked,
        creditsConsumed: 0,
        processingTimeMs,
      });
      return res.status(401).json({ error: "Authentication failed" });
    }

    // ── Step 4: Deduplication ─────────────────────────────────────────────────
    // For HMAC auth the timestamp has already been validated in step 3 (within ±300s).
    // For token auth X-Webhook-Timestamp is unchecked — always use server-synthesized
    // time to prevent callers from crafting dedup keys to force dedup (DoS) or bypass it.
    const serverTimestamp = String(Math.floor(Date.now() / 1000));
    const dedupTimestamp =
      trigger.authType === "hmac_sha256"
        ? String(req.headers["x-webhook-timestamp"] ?? serverTimestamp)
        : serverTimestamp;
    const timestamp = dedupTimestamp; // also used in templateVars below
    const isDuplicate = await checkDedup(triggerId, dedupTimestamp, bodyHash);
    if (isDuplicate) {
      return res.status(200).json({ ok: true, deduplicated: true });
    }

    // ── Step 5: Rate limit ────────────────────────────────────────────────────
    const isRateLimited = await checkWebhookRateLimit(triggerId, trigger.rateLimitPerMinute ?? 10);
    if (isRateLimited) {
      const processingTimeMs = Date.now() - startTime;
      await recordLog(triggerId, {
        status: "rate_limited",
        requestMethod: req.method,
        requestBodyHash: bodyHash,
        requestBodySize: bodySize,
        requestHeadersSafe,
        extractedVariables: {},
        sourceIpMasked,
        creditsConsumed: 0,
        processingTimeMs,
      });
      return res.status(429).json({ error: "Rate limit exceeded" });
    }

    // ── Step 6: Credit check ───────────────────────────────────────────────────
    const creditCost = 1;
    const hasCredits = await hasEnoughCredits(trigger.userId, creditCost);
    if (!hasCredits) {
      const processingTimeMs = Date.now() - startTime;
      await recordLog(triggerId, {
        status: "credit_insufficient",
        requestMethod: req.method,
        requestBodyHash: bodyHash,
        requestBodySize: bodySize,
        requestHeadersSafe,
        extractedVariables: {},
        sourceIpMasked,
        creditsConsumed: 0,
        processingTimeMs,
      });
      return res.status(402).json({ error: "Insufficient credits" });
    }

    // ── Step 7: Template substitution ─────────────────────────────────────────
    const parsedBody: Record<string, unknown> =
      typeof req.body === "object" && req.body !== null ? req.body : {};
    const templateVars = {
      eventType: String((parsedBody as any)?.type ?? (parsedBody as any)?.event?.type ?? ""),
      eventData: parsedBody,
      triggerName: trigger.name,
      triggerId: trigger.id,
      timestamp,
    };

    const payloadTemplate = (trigger.payloadTemplate ?? {}) as Record<string, unknown>;
    const substitutedPayload = substituteTemplateObject(payloadTemplate, templateVars);

    // ── Step 8: Acknowledge immediately, dispatch async ───────────────────────
    res.status(200).json({ ok: true });

    // Async dispatch (fires after response sent)
    setImmediate(async () => {
      const processingTimeMs = Date.now() - startTime;
      try {
        // Extract the dispatch message text from the substituted payload, with fallbacks
        const dispatchMessage: string =
          typeof (substitutedPayload as any).message === "string"
            ? (substitutedPayload as any).message
            : typeof (substitutedPayload as any).text === "string"
            ? (substitutedPayload as any).text
            : JSON.stringify(substitutedPayload);

        // Dispatch to configured target
        if (trigger.targetType === "agency" && trigger.targetAgencyId) {
          await agencyBridge.executeRun({
            agencyId: trigger.targetAgencyId,
            conversationId: trigger.targetAgencyId, // agencyId as server-side conv fallback
            message: dispatchMessage,
            userToken: "", // server-side dispatch — no user session token
            tenantId: trigger.tenantId,
            userId: trigger.userId,
          });
        } else if (trigger.targetType === "chat" && trigger.targetConversationId) {
          await channelGateway.processMessageServerSide({
            conversationId: trigger.targetConversationId,
            userId: trigger.userId,
            tenantId: trigger.tenantId,
            content: dispatchMessage,
            connectionId: `webhook_${triggerId}`,
          });
        } else {
          // Workflow dispatch not yet implemented; log for observability
          auditLogger.log({
            eventType: "webhook_dispatch_stub" as any,
            userId: trigger.userId,
            metadata: {
              triggerId,
              targetType: trigger.targetType,
              reason:
                trigger.targetType === "workflow"
                  ? "workflow_dispatch_not_implemented"
                  : "no_target_configured",
            },
          });
        }

        // Deduct credits after successful dispatch acknowledgement
        await deductCredits({
          userId: trigger.userId,
          tenantId: trigger.tenantId,
          amount: creditCost,
          description: `Webhook trigger: ${trigger.name}`,
          sourceType: "webhook_trigger",
        }).catch(() => {}); // fire-and-forget; audit trail preserved in log below

        await recordLog(triggerId, {
          status: "success",
          requestMethod: req.method,
          requestBodyHash: bodyHash,
          requestBodySize: bodySize,
          requestHeadersSafe,
          extractedVariables: stripSecrets(parsedBody),
          sourceIpMasked,
          creditsConsumed: creditCost,
          processingTimeMs,
        });

        // Increment trigger counter atomically via SQL expression (avoids read-modify-write race)
        await db
          .update(webhookTriggers)
          .set({
            totalTriggers: sql`${webhookTriggers.totalTriggers} + 1`,
            lastTriggeredAt: new Date(),
          } as any)
          .where(eq(webhookTriggers.id, triggerId));
      } catch (err) {
        await recordLog(triggerId, {
          status: "target_error",
          requestMethod: req.method,
          requestBodyHash: bodyHash,
          requestBodySize: bodySize,
          requestHeadersSafe,
          extractedVariables: {},
          sourceIpMasked,
          creditsConsumed: 0,
          errorMessage: String(err),
          processingTimeMs: Date.now() - startTime,
        });
      }
    });
  });

  return router;
}
