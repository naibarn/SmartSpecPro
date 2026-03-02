/**
 * Widget Gateway
 *
 * HTTP endpoint: POST /api/widget/init
 *   - Validates widgetId, checks feature flag + is_active + allowed origins
 *   - Returns HMAC-signed init token (24h TTL)
 *
 * WebSocket endpoint: /widget/v1/ws
 *   - First message must be { type: "auth", token: "..." }
 *   - Token validated via HMAC-SHA256 + timingSafeEqual + exp check (HMAC first)
 *   - Subsequent messages processed by LLM and response sent back through WS
 *   - Per-visitor credit caps enforced via Redis
 *   - Rate limiting via Redis INCR with 60s TTL
 *
 * Security:
 *   - HMAC key derived from LLM_ENCRYPTION_KEY (never transmitted)
 *   - timingSafeEqual for constant-time token comparison (HMAC checked BEFORE expiry)
 *   - Empty allowed_origins = deny all (deny-by-default)
 *   - Origin validated during WebSocket upgrade
 *   - Token contains only IDs and timestamps (no secrets or PII)
 */

import crypto from "crypto";
import { Router } from "express";
import type { IncomingMessage } from "http";
import type { Socket } from "net";
import { WebSocketServer, WebSocket } from "ws";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { chatWidgets } from "../../drizzle/schema";
import { getCacheClient } from "../services/redisClients";
import { getTenantFeatureFlag } from "../services/featureFlags";
import { auditLogger } from "../services/auditLogger";

// ── Constants ──────────────────────────────────────────────────────────────────

export const INIT_TOKEN_TTL_SECONDS = 86400; // 24 hours
export const CLOSE_CODE_UNAUTHORIZED = 4001;
export const CLOSE_CODE_RATE_LIMIT = 4003;

// ── HMAC token helpers ─────────────────────────────────────────────────────────

function getHmacKey(): Buffer {
  const encKey = process.env.LLM_ENCRYPTION_KEY;
  if (!encKey) {
    throw new Error("LLM_ENCRYPTION_KEY is not configured");
  }
  // Derive widget-specific subkey
  return crypto
    .createHmac("sha256", encKey)
    .update("widget-token-v1")
    .digest();
}

export interface InitTokenPayload {
  tenantId: string;
  widgetId: string;
  visitorSessionId: string;
  iat: number;
  exp: number;
}

/**
 * Generate a signed init token.
 * Format: base64url(JSON.stringify(payload)) + "." + base64url(hmac-signature)
 */
export function generateInitToken(payload: InitTokenPayload): string {
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr).toString("base64url");

  const key = getHmacKey();
  const sig = crypto.createHmac("sha256", key).update(payloadStr).digest();
  const sigB64 = sig.toString("base64url");

  return `${payloadB64}.${sigB64}`;
}

/**
 * Validate and parse an init token.
 * Returns null if invalid (wrong HMAC, expired, or malformed).
 * Uses timingSafeEqual to prevent timing attacks.
 * IMPORTANT: HMAC is validated BEFORE expiry to avoid timing oracle attacks.
 */
export function validateInitToken(token: string): InitTokenPayload | null {
  try {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx <= 0) return null;

    const payloadB64 = token.slice(0, dotIdx);
    const sigB64 = token.slice(dotIdx + 1);

    if (!payloadB64 || !sigB64) return null;

    const payloadStr = Buffer.from(payloadB64, "base64url").toString();
    const payload = JSON.parse(payloadStr) as InitTokenPayload;

    // Verify required fields
    if (!payload.tenantId || !payload.widgetId || !payload.visitorSessionId) {
      return null;
    }
    if (typeof payload.iat !== "number" || typeof payload.exp !== "number") {
      return null;
    }

    // ── HMAC verified FIRST (before expiry) to avoid timing oracle ─────────
    const key = getHmacKey();
    const expectedSig = crypto.createHmac("sha256", key).update(payloadStr).digest();
    const receivedSig = Buffer.from(sigB64, "base64url");

    // Constant-time comparison with length check
    const len = Math.max(expectedSig.length, receivedSig.length);
    const padExpected = Buffer.alloc(len);
    const padReceived = Buffer.alloc(len);
    expectedSig.copy(padExpected);
    receivedSig.copy(padReceived);

    if (
      !crypto.timingSafeEqual(padExpected, padReceived) ||
      expectedSig.length !== receivedSig.length
    ) {
      return null;
    }

    // ── Check expiry AFTER HMAC is confirmed valid ─────────────────────────
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// ── Origin validation ──────────────────────────────────────────────────────────

export function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin || allowedOrigins.length === 0) return false;
  // Normalize: strip trailing slash
  const normalizedOrigin = origin.replace(/\/$/, "");
  return allowedOrigins.some((allowed) => {
    const normalizedAllowed = allowed.replace(/\/$/, "");
    // Support wildcard subdomain: *.example.com
    // Security fix: ensure full segment match (not suffix) to prevent
    // evil-example.com from matching *.example.com
    if (normalizedAllowed.startsWith("*.")) {
      const suffix = normalizedAllowed.slice(1); // .example.com
      // Must end with .example.com AND have additional content before it
      return (
        normalizedOrigin.endsWith(suffix) &&
        normalizedOrigin.length > suffix.length
      );
    }
    return normalizedOrigin === normalizedAllowed;
  });
}

// ── HTTP Init Endpoint ─────────────────────────────────────────────────────────

export function createWidgetInitRouter(): Router {
  const router = Router();

  router.post("/init", async (req, res) => {
    try {
      const { widgetId } = req.body as { widgetId?: string };
      if (!widgetId || typeof widgetId !== "string") {
        res.status(400).json({ error: "widgetId is required" });
        return;
      }

      const db = await getDb();
      if (!db) {
        res.status(503).json({ error: "Service unavailable" });
        return;
      }

      const [widget] = await db
        .select()
        .from(chatWidgets)
        .where(eq(chatWidgets.id, widgetId))
        .limit(1);

      if (!widget) {
        res.status(404).json({ error: "Widget not found" });
        return;
      }

      if (!widget.isActive) {
        res.status(403).json({ error: "Widget is not active" });
        return;
      }

      // Check feature flag
      const flagEnabled = await getTenantFeatureFlag("chatWidget", widget.tenantId);
      if (!flagEnabled) {
        res.status(403).json({ error: "Widget feature is not enabled" });
        return;
      }

      // Validate request origin
      const requestOrigin = req.headers.origin;
      const allowedOrigins = (widget.allowedOrigins as string[]) ?? [];
      if (!isOriginAllowed(requestOrigin, allowedOrigins)) {
        auditLogger.log({
          eventType: "widget_origin_rejected",
          metadata: { widgetId, origin: requestOrigin ?? "none" },
        });
        res.status(403).json({ error: "Origin not allowed" });
        return;
      }

      // Generate visitor session ID and token
      const visitorSessionId = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      const payload: InitTokenPayload = {
        tenantId: widget.tenantId,
        widgetId,
        visitorSessionId,
        iat: now,
        exp: now + INIT_TOKEN_TTL_SECONDS,
      };

      const token = generateInitToken(payload);
      res.json({ token });
    } catch (err) {
      auditLogger.log({
        eventType: "widget_init_error",
        metadata: { error: String(err) },
      });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}

// ── WebSocket connection registry ──────────────────────────────────────────────

/**
 * Maps visitorSessionId → active WebSocket connection.
 * Used to route AI responses back to the correct client.
 */
const widgetConnections = new Map<string, WebSocket>();

// ── WebSocket Server ───────────────────────────────────────────────────────────

interface WidgetSession {
  tenantId: string;
  widgetId: string;
  visitorSessionId: string;
  conversationId?: number;
  authenticated: boolean;
  rateLimitKey: string;
  rateLimitPerMinute: number;
  // Widget config for credit cap checks
  maxCreditsPerVisitorSession: number;
  maxCreditsPerVisitorDay: number;
  monthlyCreditBudget: number | null;
  allowedOrigins: string[];
}

let widgetWss: WebSocketServer | null = null;

function getWidgetWss(): WebSocketServer {
  if (!widgetWss) {
    widgetWss = new WebSocketServer({ noServer: true });
  }
  return widgetWss;
}

/**
 * Handles the HTTP upgrade to WebSocket.
 * Validates the Origin header against a permissive check before accepting.
 * Per-widget origin validation happens after token auth.
 */
export function handleWidgetUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
  const origin = req.headers.origin;

  // Reject connections with no Origin header (non-browser clients attempting bypass)
  if (!origin) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

  const wss = getWidgetWss();
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
    handleWidgetConnection(ws, origin);
  });
}

function handleWidgetConnection(ws: WebSocket, upgradeOrigin: string): void {
  let session: WidgetSession | null = null;
  let authTimeout: ReturnType<typeof setTimeout>;

  // Require auth message within 10 seconds
  authTimeout = setTimeout(() => {
    if (!session?.authenticated) {
      ws.close(CLOSE_CODE_UNAUTHORIZED, "Auth timeout");
    }
  }, 10000);

  ws.on("message", async (data) => {
    try {
      const msg = JSON.parse(data.toString()) as { type: string; token?: string; text?: string };

      if (msg.type === "auth") {
        clearTimeout(authTimeout);
        const payload = validateInitToken(msg.token ?? "");
        if (!payload) {
          ws.close(CLOSE_CODE_UNAUTHORIZED, "Invalid token");
          return;
        }

        // Load widget to verify is_active, get config, and validate origin
        const db = await getDb();
        if (!db) {
          ws.close(1011, "Server error");
          return;
        }
        const [widget] = await db
          .select()
          .from(chatWidgets)
          .where(eq(chatWidgets.id, payload.widgetId))
          .limit(1);

        if (!widget || !widget.isActive) {
          ws.close(CLOSE_CODE_UNAUTHORIZED, "Widget inactive");
          return;
        }

        // Validate origin against per-widget allowlist
        const allowedOrigins = (widget.allowedOrigins as string[]) ?? [];
        if (!isOriginAllowed(upgradeOrigin, allowedOrigins)) {
          ws.close(CLOSE_CODE_UNAUTHORIZED, "Origin not allowed");
          return;
        }

        session = {
          tenantId: payload.tenantId,
          widgetId: payload.widgetId,
          visitorSessionId: payload.visitorSessionId,
          authenticated: true,
          rateLimitKey: `widget:rate:${payload.visitorSessionId}`,
          rateLimitPerMinute: widget.rateLimitPerMinute ?? 10,
          maxCreditsPerVisitorSession: widget.maxCreditsPerVisitorSession ?? 50,
          maxCreditsPerVisitorDay: widget.maxCreditsPerVisitorDay ?? 100,
          monthlyCreditBudget: widget.monthlyCreditBudget ?? null,
          allowedOrigins,
        };

        // Register in connection registry for response routing
        widgetConnections.set(payload.visitorSessionId, ws);

        ws.send(JSON.stringify({ type: "auth_ok" }));
        return;
      }

      if (!session?.authenticated) {
        ws.close(CLOSE_CODE_UNAUTHORIZED, "Not authenticated");
        return;
      }

      if (msg.type === "message" && msg.text) {
        // Rate limit check
        const redis = getCacheClient();
        const rateCount = await redis.incr(session.rateLimitKey);
        if (rateCount === 1) {
          await redis.expire(session.rateLimitKey, 60); // 1 minute window
        }
        if (rateCount > session.rateLimitPerMinute) {
          ws.close(CLOSE_CODE_RATE_LIMIT, "Rate limit exceeded");
          return;
        }

        // Per-visitor credit cap check (with fixed creditCost=1 per message)
        const visitorIp = "unknown"; // WebSocket doesn't expose req here; use placeholder
        try {
          const { checkVisitorCaps } = await import("../services/widgetService");
          await checkVisitorCaps({
            widgetId: session.widgetId,
            visitorSessionId: session.visitorSessionId,
            visitorIp,
            creditCost: 1,
            maxPerSession: session.maxCreditsPerVisitorSession,
            maxPerDay: session.maxCreditsPerVisitorDay,
            monthlyBudget: session.monthlyCreditBudget,
          });
        } catch (capErr: unknown) {
          const errName = (capErr as Error)?.name ?? "";
          if (errName === "WidgetCapExceededError") {
            ws.send(JSON.stringify({ type: "error", code: "RATE_LIMIT_EXCEEDED" }));
            return;
          }
          throw capErr;
        }

        // Echo acknowledgement
        ws.send(JSON.stringify({ type: "ack" }));

        // Process message and return AI response
        setImmediate(async () => {
          try {
            const { channelGateway } = await import("../services/channelGateway");
            const { getOrCreateSystemUser } = await import("../services/widgetService");
            const { createConversation } = await import("../services/chatService");

            const { userId } = await getOrCreateSystemUser(session!.tenantId);

            // Lazy conversation creation on first message
            if (!session!.conversationId) {
              const conv = await createConversation({
                userId,
                title: `Widget Chat (${session!.visitorSessionId.slice(0, 8)})`,
                model: "gpt-4o-mini",
              });
              session!.conversationId = conv.id;
            }

            const result = await channelGateway.processMessageServerSide({
              conversationId: session!.conversationId!,
              userId,
              tenantId: session!.tenantId,
              content: msg.text!,
              connectionId: session!.widgetId,
            });

            // Send response back through WebSocket
            const activeWs = widgetConnections.get(session!.visitorSessionId);
            if (activeWs && activeWs.readyState === WebSocket.OPEN) {
              if (result.success && result.content) {
                activeWs.send(JSON.stringify({ type: "message", text: result.content }));
              } else {
                activeWs.send(JSON.stringify({
                  type: "error",
                  code: "PROCESSING_ERROR",
                  message: "Failed to process message",
                }));
              }
            }
          } catch (err) {
            auditLogger.log({
              eventType: "widget_ingest_error",
              metadata: { error: String(err), widgetId: session?.widgetId },
            });
            const activeWs = widgetConnections.get(session?.visitorSessionId ?? "");
            if (activeWs && activeWs.readyState === WebSocket.OPEN) {
              activeWs.send(JSON.stringify({ type: "error", code: "SERVER_ERROR" }));
            }
          }
        });
      }
    } catch {
      // Malformed JSON — ignore
    }
  });

  ws.on("close", () => {
    clearTimeout(authTimeout);
    if (session?.visitorSessionId) {
      widgetConnections.delete(session.visitorSessionId);
    }
    session = null;
  });

  ws.on("error", () => {
    clearTimeout(authTimeout);
    if (session?.visitorSessionId) {
      widgetConnections.delete(session.visitorSessionId);
    }
  });
}
