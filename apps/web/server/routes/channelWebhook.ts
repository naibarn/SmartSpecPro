/**
 * Generalized Channel Webhook Router
 *
 * POST /webhooks/:channelType/:connectionId
 *
 * Routes incoming webhooks to the correct ChannelAdapter based on
 * the channelType URL parameter. Platform-specific validation,
 * parsing, and dedup are delegated to the adapter.
 *
 * Processing flow:
 * 1. Resolve adapter from registry
 * 2. Validate webhook (adapter-specific signature check)
 * 3. Parse inbound (adapter-specific body parsing)
 * 4. Redis dedup (NX set with 24h TTL)
 * 5. Return 200 immediately
 * 6. Async: look up connection → build ChatIngressEvent → channelGateway.ingest()
 */

import { Router } from "express";
import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { adapterRegistry } from "../services/channelAdapters";
import { getCacheClient } from "../services/redisClients";
import { channelGateway } from "../services/channelGateway";
import { auditLogger } from "../services/auditLogger";
import { getDb } from "../db";
import { channelConnections, channelCredentials } from "../../drizzle/schema";
import { decrypt } from "../services/crypto";
import type { ChatIngressEvent } from "@shared/channelTypes";

/** Maps channelType to the req field name each adapter expects for its webhook secret */
const SECRET_FIELD: Record<string, string> = {
  slack: "signingSecret",
  whatsapp: "appSecret",
  line: "channelSecret",
};

export function createChannelWebhookRouter(): Router {
  const router = Router();

  router.post("/:channelType/:connectionId", async (req, res) => {
    const { channelType, connectionId } = req.params;

    // 1. Resolve adapter
    const adapter = adapterRegistry.get(channelType);
    if (!adapter) {
      res.status(404).json({ error: `Unknown channel type: ${channelType}` });
      return;
    }

    // 1.5. Look up connection (needed for tenantId → credentials lookup)
    const db = await getDb();
    let connection: typeof channelConnections.$inferSelect | undefined;
    if (db) {
      const [row] = await db
        .select()
        .from(channelConnections)
        .where(eq(channelConnections.id, connectionId))
        .limit(1);
      connection = row;
    }

    // 1.6. Inject platform webhook secret for HMAC-based adapters
    // Telegram manages its own secret internally; Discord is Gateway-based (no HTTP webhook).
    // Slack, WhatsApp, and LINE require the secret injected into req before validateWebhook().
    const secretField = SECRET_FIELD[channelType];
    if (secretField && connection?.tenantId && db) {
      try {
        const [cred] = await db
          .select({ webhookSecretEncrypted: channelCredentials.webhookSecretEncrypted })
          .from(channelCredentials)
          .where(
            and(
              eq(channelCredentials.tenantId, connection.tenantId),
              eq(channelCredentials.channelType, channelType),
              eq(channelCredentials.isActive, true),
            ),
          )
          .limit(1);
        if (cred?.webhookSecretEncrypted) {
          (req as any)[secretField] = decrypt(cred.webhookSecretEncrypted);
        }
      } catch {
        // Decrypt failure → validateWebhook will return false → 403 below
      }
    }

    // 2. Validate webhook
    let valid: boolean;
    try {
      valid = await adapter.validateWebhook({
        headers: req.headers as Record<string, string | string[] | undefined>,
        body: req.body,
        params: req.params,
        // rawBody is populated by the express.json verify callback in index.ts
        // and used by HMAC-based adapters (WhatsApp, LINE) for signature verification
        rawBody: (req as any).rawBody,
        // signingSecret / appSecret / channelSecret injected above
        ...(secretField ? { [secretField]: (req as any)[secretField] } : {}),
      } as any);
    } catch {
      valid = false;
    }
    if (!valid) {
      auditLogger.log({
        eventType: "channel_webhook_validation_failed",
        metadata: { channelType, connectionId },
      });
      res.sendStatus(403);
      return;
    }

    // 3. Parse inbound
    let parsed: Awaited<ReturnType<typeof adapter.parseInbound>>;
    try {
      parsed = await adapter.parseInbound(req.body, connectionId);
    } catch {
      res.sendStatus(200);
      return;
    }
    if (!parsed) {
      // Ignored message type (non-text, etc.)
      res.sendStatus(200);
      return;
    }

    // 4. Redis dedup
    try {
      const redis = getCacheClient();
      const dedupResult = await redis.set(
        `channel:dedup:${parsed.dedupKey}`,
        "1",
        "EX",
        86400,
        "NX",
      );
      if (dedupResult === null) {
        // Duplicate — already processed
        res.sendStatus(200);
        return;
      }
    } catch (err) {
      // Redis unavailable — continue (accept risk of rare duplicate)
      auditLogger.log({
        eventType: "channel_webhook_dedup_failed",
        metadata: { channelType, connectionId, error: String(err) },
      });
    }

    // 5. Return 200 immediately
    res.sendStatus(200);

    // 6. Async: ingest using already-fetched connection
    const parsedEvent = parsed.event;
    const dedupKey = parsed.dedupKey;

    setImmediate(async () => {
      try {
        if (!connection || connection.status !== "active") return;

        if (!connection.activeChannelId) {
          auditLogger.log({
            eventType: "channel_webhook_no_active_channel",
            metadata: { channelType, connectionId },
          });
          return;
        }

        const event: ChatIngressEvent = {
          eventId: crypto.randomUUID(),
          eventType: parsedEvent.eventType,
          tenantId: connection.tenantId,
          userId: connection.userId,
          conversationId: connection.activeChannelId,
          conversationType: "chat",
          channel: {
            type: channelType as ChatIngressEvent["channel"]["type"],
            connectionId,
            externalChatId: parsedEvent.channel.externalChatId,
            externalMessageId: parsedEvent.channel.externalMessageId,
          },
          message: parsedEvent.message,
          idempotencyKey: dedupKey,
        };

        await channelGateway.ingest(event);
      } catch (err) {
        auditLogger.log({
          eventType: "channel_webhook_ingest_error",
          metadata: { channelType, connectionId, error: String(err) },
        });
      }
    });
  });

  return router;
}
