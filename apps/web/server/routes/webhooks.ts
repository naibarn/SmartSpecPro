/**
 * Express webhook routes for external service callbacks.
 *
 * These are plain Express routes (not tRPC) because webhook senders
 * (e.g. Google Drive) send raw HTTP POSTs without tRPC framing.
 */

import { Router } from "express";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { googleDriveSyncState } from "../../drizzle/schema";
import { auditLogger } from "../services/auditLogger";

import { ENV } from "../_core/env";

const PYTHON_BACKEND_URL = ENV.pythonBackendUrl || "http://localhost:8000";
const PROXY_TOKEN = process.env.SMARTSPEC_PROXY_TOKEN || "";

export function createWebhookRouter(): Router {
  const router = Router();

  /**
   * Google Drive Changes API webhook handler.
   *
   * Google sends POST requests with these headers:
   *   X-Goog-Channel-ID: the channel_id we registered
   *   X-Goog-Resource-ID: the resource_id from the watch response
   *   X-Goog-Channel-Token: the secret token we generated
   *   X-Goog-Resource-State: "sync" (initial) or "change" (update)
   *
   * Security: triple validation of channel_id + resource_id + channel_token_hash.
   */
  router.post("/gdrive", async (req, res) => {
    const channelId = req.headers["x-goog-channel-id"] as string | undefined;
    const resourceId = req.headers["x-goog-resource-id"] as string | undefined;
    const channelToken = req.headers["x-goog-channel-token"] as string | undefined;
    const resourceState = req.headers["x-goog-resource-state"] as string | undefined;

    if (!channelId || !resourceId || !channelToken) {
      auditLogger.log({
        eventType: "google_drive_webhook",
        userId: null,
        metadata: { rejection: "missing_headers", sourceIp: req.ip },
      });
      res.status(403).json({ error: "Missing required headers" });
      return;
    }

    // Look up sync state by channel_id
    const [syncState] = await db
      .select()
      .from(googleDriveSyncState)
      .where(eq(googleDriveSyncState.channelId, channelId))
      .limit(1);

    if (!syncState) {
      auditLogger.log({
        eventType: "google_drive_webhook",
        userId: null,
        metadata: { rejection: "unknown_channel", channelId, sourceIp: req.ip },
      });
      res.status(403).json({ error: "Unknown channel" });
      return;
    }

    // Validate resource_id
    if (syncState.resourceId !== resourceId) {
      auditLogger.log({
        eventType: "google_drive_webhook",
        userId: syncState.userId,
        metadata: { rejection: "resource_mismatch", channelId, resourceId, sourceIp: req.ip },
      });
      res.status(403).json({ error: "Resource mismatch" });
      return;
    }

    // Validate channel_token via hash comparison (timing-safe)
    const receivedHash = crypto.createHash("sha256").update(channelToken).digest("hex");
    const storedHash = syncState.channelTokenHash || "";

    if (
      receivedHash.length !== storedHash.length ||
      !crypto.timingSafeEqual(Buffer.from(receivedHash), Buffer.from(storedHash))
    ) {
      auditLogger.log({
        eventType: "google_drive_webhook",
        userId: syncState.userId,
        metadata: { rejection: "invalid_token", channelId, sourceIp: req.ip },
      });
      res.status(403).json({ error: "Invalid token" });
      return;
    }

    // Return 200 immediately (Google requires fast response)
    res.status(200).send("OK");

    auditLogger.log({
      eventType: "google_drive_webhook",
      userId: syncState.userId,
      metadata: { channelId, resourceState, action: "accepted" },
    });

    // Skip processing for initial "sync" notification
    if (resourceState === "sync") {
      return;
    }

    // Skip if auto-sync is disabled
    if (!syncState.autoSyncEnabled) {
      return;
    }

    // Fire-and-forget: enqueue change processing via Python backend
    try {
      fetch(`${PYTHON_BACKEND_URL}/api/internal/gdrive/process-changes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-proxy-token": PROXY_TOKEN,
        },
        body: JSON.stringify({
          user_id: syncState.userId,
          tenant_id: syncState.tenantId,
        }),
        signal: AbortSignal.timeout(5000),
      }).catch((err) => {
        auditLogger.log({
          eventType: "google_drive_webhook",
          userId: syncState.userId,
          metadata: {
            channelId,
            action: "enqueue_failed",
            error: String(err),
          },
        });
        console.error("[Webhook] Failed to enqueue Drive changes:", err);
      });
    } catch {
      // Non-blocking -- don't let errors affect the 200 response
    }
  });

  return router;
}
