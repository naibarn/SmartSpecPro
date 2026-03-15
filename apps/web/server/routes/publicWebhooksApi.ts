import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireScopes } from "../middleware/requireScopes";
import { sendApiError } from "../middleware/publicApiHeaders";
import { getDb } from "../db";
import { apiWebhookEndpoints } from "../../drizzle/schema";
import { encrypt } from "../services/crypto";
import { sanitizeUri, assertPublicIp } from "../services/ssrfValidation";
import { KNOWN_EVENT_TYPES } from "../services/webhookDeliveryService";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const CreateWebhookSchema = z.object({
  url: z.string().max(2048).startsWith("https://", "URL must use HTTPS"),
  events: z.array(z.enum(KNOWN_EVENT_TYPES as [string, ...string[]])).min(1),
  retry_policy: z.enum(["exponential", "none"]).default("exponential"),
});

const PatchWebhookSchema = z.object({
  is_active: z.literal(true),
});

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createPublicWebhooksRouter(): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // POST /v1/webhooks — register endpoint
  // -------------------------------------------------------------------------
  router.post("/", requireScopes("webhooks:manage"), async (req, res) => {
    const parsed = CreateWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(res, 400, "invalid_request", parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }

    const { url, events, retry_policy } = parsed.data;
    const auth = req.auth!;
    const tenantId = (auth as any).tenantId as string;
    const apiKeyId = (auth as any).apiKeyId as string | undefined;

    // SSRF validation
    try {
      sanitizeUri(url);
      const hostname = new URL(url).hostname;
      await assertPublicIp(hostname);
    } catch (err: any) {
      sendApiError(res, 400, "invalid_request", err.message ?? "Invalid URL");
      return;
    }

    // Generate and encrypt signing secret
    const rawSecret = crypto.randomBytes(32).toString("hex");
    const secretEncrypted = encrypt(rawSecret);

    const db = await getDb();
    if (!db) {
      sendApiError(res, 500, "internal_error", "Database unavailable");
      return;
    }

    const id = randomUUID();
    const now = new Date();

    await db.insert(apiWebhookEndpoints).values({
      id,
      tenantId,
      apiKeyId: apiKeyId ?? null,
      url,
      secretEncrypted,
      events,
      retryPolicy: retry_policy,
      isActive: true,
      failureCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json({
      id,
      url,
      events,
      retry_policy,
      secret: rawSecret,
      created_at: now.toISOString(),
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/webhooks — list endpoints
  // -------------------------------------------------------------------------
  router.get("/", requireScopes("webhooks:manage"), async (req, res) => {
    const auth = req.auth!;
    const tenantId = (auth as any).tenantId as string;

    const db = await getDb();
    if (!db) {
      sendApiError(res, 500, "internal_error", "Database unavailable");
      return;
    }

    const rows = await db
      .select({
        id: apiWebhookEndpoints.id,
        url: apiWebhookEndpoints.url,
        events: apiWebhookEndpoints.events,
        retryPolicy: apiWebhookEndpoints.retryPolicy,
        isActive: apiWebhookEndpoints.isActive,
        failureCount: apiWebhookEndpoints.failureCount,
        lastDeliveredAt: apiWebhookEndpoints.lastDeliveredAt,
        createdAt: apiWebhookEndpoints.createdAt,
      })
      .from(apiWebhookEndpoints)
      .where(eq(apiWebhookEndpoints.tenantId, tenantId));

    res.json({
      webhooks: rows.map((r) => ({
        id: r.id,
        url: r.url,
        events: r.events,
        retry_policy: r.retryPolicy,
        is_active: r.isActive,
        failure_count: r.failureCount,
        last_delivered_at: r.lastDeliveredAt?.toISOString() ?? null,
        created_at: r.createdAt.toISOString(),
      })),
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /v1/webhooks/:id — deactivate endpoint
  // -------------------------------------------------------------------------
  router.delete("/:id", requireScopes("webhooks:manage"), async (req, res) => {
    const { id } = req.params;
    const auth = req.auth!;
    const tenantId = (auth as any).tenantId as string;

    const db = await getDb();
    if (!db) {
      sendApiError(res, 500, "internal_error", "Database unavailable");
      return;
    }

    const rows = await db
      .select({ id: apiWebhookEndpoints.id, tenantId: apiWebhookEndpoints.tenantId })
      .from(apiWebhookEndpoints)
      .where(eq(apiWebhookEndpoints.id, id));

    const endpoint = rows[0];
    if (!endpoint || endpoint.tenantId !== tenantId) {
      sendApiError(res, 404, "not_found", "Webhook not found");
      return;
    }

    await db
      .update(apiWebhookEndpoints)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(apiWebhookEndpoints.id, id));

    res.json({ deleted: true });
  });

  // -------------------------------------------------------------------------
  // PATCH /v1/webhooks/:id — re-enable endpoint
  // -------------------------------------------------------------------------
  router.patch("/:id", requireScopes("webhooks:manage"), async (req, res) => {
    const { id } = req.params;
    const auth = req.auth!;
    const tenantId = (auth as any).tenantId as string;

    const parsed = PatchWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      sendApiError(res, 400, "invalid_request", parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }

    const db = await getDb();
    if (!db) {
      sendApiError(res, 500, "internal_error", "Database unavailable");
      return;
    }

    const rows = await db
      .select()
      .from(apiWebhookEndpoints)
      .where(eq(apiWebhookEndpoints.id, id));

    const endpoint = rows[0];
    if (!endpoint || endpoint.tenantId !== tenantId) {
      sendApiError(res, 404, "not_found", "Webhook not found");
      return;
    }

    await db
      .update(apiWebhookEndpoints)
      .set({ isActive: true, failureCount: 0, updatedAt: new Date() })
      .where(eq(apiWebhookEndpoints.id, id));

    res.json({
      id,
      url: endpoint.url,
      events: endpoint.events,
      is_active: true,
      failure_count: 0,
    });
  });

  return router;
}
