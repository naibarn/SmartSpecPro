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
import { eq } from "drizzle-orm";
import { adapterRegistry } from "../services/channelAdapters";
import { getCacheClient } from "../services/redisClients";
import { channelGateway } from "../services/channelGateway";
import { auditLogger } from "../services/auditLogger";
import { getDb } from "../db";
import { channelConnections } from "../../drizzle/schema";
import type { ChatIngressEvent } from "@shared/channelTypes";

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

    // 2. Validate webhook
    let valid: boolean;
    try {
      valid = await adapter.validateWebhook({
        headers: req.headers as Record<string, string | string[] | undefined>,
        body: req.body,
        params: req.params,
      });
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

    // 6. Async: look up connection → ingest
    const parsedEvent = parsed.event;
    const dedupKey = parsed.dedupKey;

    setImmediate(async () => {
      try {
        const db = await getDb();
        if (!db) return;

        const [connection] = await db
          .select()
          .from(channelConnections)
          .where(eq(channelConnections.id, connectionId))
          .limit(1);

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
