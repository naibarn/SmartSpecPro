import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { eq, and, count, gt, isNull, or } from "drizzle-orm";
import { requireScopes } from "../middleware/requireScopes";
import { sendApiError } from "../middleware/publicApiHeaders";
import { agencyBridge } from "../services/agencyBridge";
import { deductCredits, refundCredits, getCreditBalance } from "../services/creditService";
import { incrementDailyCredits } from "../services/apiKeyRateLimiter";
import { createInternalTokenFromAuth } from "../_core/tokens";
import { db } from "../db";
import { agencies, agencyConversations } from "../../drizzle/schema";
import { emitPublicApiEvent } from "../services/webhookDeliveryService";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const AGENCY_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

const InvokeBodySchema = z.object({
  message: z.string().min(1).max(10000),
  conversation_id: z.string().uuid().optional(),
  max_credits: z.number().positive().optional(),
  stream: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Conversation helper
// ---------------------------------------------------------------------------

interface AuthInfo {
  userId: number;
  tenantId: string;
  apiKeyId: string;
}

async function getOrCreateAgencyApiConversation(
  agencyId: string,
  auth: AuthInfo,
): Promise<string> {
  const drizzle = db.instance;

  // Tenant-safe: JOIN through agencies to verify tenant ownership; skip expired conversations
  const existing = await drizzle
    .select({ id: agencyConversations.id })
    .from(agencyConversations)
    .innerJoin(agencies, eq(agencyConversations.agencyId, agencies.id))
    .where(
      and(
        eq(agencyConversations.agencyId, agencyId),
        eq(agencyConversations.userId, auth.userId),
        eq(agencyConversations.source, "api"),
        eq(agencies.tenantId, auth.tenantId),
        or(isNull(agencyConversations.expiresAt), gt(agencyConversations.expiresAt, new Date())),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // +30 days

  await drizzle.insert(agencyConversations).values({
    id,
    agencyId,
    userId: auth.userId,
    tenantId: auth.tenantId,
    title: "API Conversation",
    source: "api",
    apiKeyId: auth.apiKeyId,
    expiresAt,
  });

  return id;
}

// ---------------------------------------------------------------------------
// Agency ownership check helper
// ---------------------------------------------------------------------------

async function verifyAgencyTenant(
  agencyId: string,
  tenantId: string,
): Promise<boolean> {
  const drizzle = db.instance;
  const rows = await drizzle
    .select({ id: agencies.id })
    .from(agencies)
    .where(and(eq(agencies.id, agencyId), eq(agencies.tenantId, tenantId)))
    .limit(1);
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createPublicAgencyRouter(): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // GET /v1/agencies
  // -------------------------------------------------------------------------
  router.get("/", requireScopes("agencies:list"), async (req, res) => {
    try {
      const auth = req.auth!;
      const tenantId = (auth as any).tenantId as string;
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20),
      );

      const drizzle = db.instance;

      const [{ value: total }] = await drizzle
        .select({ value: count() })
        .from(agencies)
        .where(eq(agencies.tenantId, tenantId));

      const rows = await drizzle
        .select({
          id: agencies.id,
          name: agencies.name,
          slug: agencies.slug,
          description: agencies.description,
          defaultModel: agencies.defaultModel,
          status: agencies.status,
          createdAt: agencies.createdAt,
        })
        .from(agencies)
        .where(eq(agencies.tenantId, tenantId))
        .orderBy(agencies.createdAt)
        .limit(limit)
        .offset((page - 1) * limit);

      const offset = (page - 1) * limit;
      res.json({
        agencies: rows.map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          description: r.description ?? "",
          default_model: r.defaultModel ?? null,
          created_at: r.createdAt?.toISOString() ?? null,
        })),
        pagination: { page, limit, total, has_more: offset + rows.length < total },
      });
    } catch (err) {
      console.error("[PublicAgencyApi] GET /v1/agencies error", err);
      sendApiError(res, 500, "internal_error", "Internal server error");
    }
  });

  // -------------------------------------------------------------------------
  // POST /v1/agencies/:agencyId/invoke
  // -------------------------------------------------------------------------
  router.post(
    "/:agencyId/invoke",
    requireScopes("agencies:invoke"),
    async (req, res) => {
      try {
        const { agencyId } = req.params;

        // Validate agencyId format (prevent path traversal)
        if (!AGENCY_ID_PATTERN.test(agencyId)) {
          sendApiError(res, 400, "invalid_request", "Invalid agency ID format");
          return;
        }

        const auth = req.auth!;
        const userId = (auth as any).userId as number;
        const tenantId = (auth as any).tenantId as string;
        const apiKeyId = (auth as any).apiKeyId as string;

        // Verify agency exists AND belongs to this tenant (IDOR: 404, not 403)
        const agencyExists = await verifyAgencyTenant(agencyId, tenantId);
        if (!agencyExists) {
          sendApiError(res, 404, "not_found", "Agency not found");
          return;
        }

        // Parse and validate body
        const parsed = InvokeBodySchema.safeParse(req.body);
        if (!parsed.success) {
          sendApiError(
            res,
            400,
            "invalid_request",
            parsed.error.issues.map((i) => i.message).join("; "),
          );
          return;
        }

        const { message, conversation_id, max_credits, stream } = parsed.data;

        // Get or create conversation
        let conversationId: string;
        if (conversation_id) {
          // Validate caller-supplied conversation_id belongs to this user+agency+tenant
          const owned = await db.instance
            .select({ id: agencyConversations.id })
            .from(agencyConversations)
            .innerJoin(agencies, eq(agencyConversations.agencyId, agencies.id))
            .where(
              and(
                eq(agencyConversations.id, conversation_id),
                eq(agencyConversations.agencyId, agencyId),
                eq(agencyConversations.userId, userId),
                eq(agencies.tenantId, tenantId),
              ),
            )
            .limit(1);
          if (!owned.length) {
            sendApiError(res, 404, "not_found", "Conversation not found");
            return;
          }
          conversationId = conversation_id;
        } else {
          conversationId = await getOrCreateAgencyApiConversation(agencyId, {
            userId,
            tenantId,
            apiKeyId,
          });
        }

        // Credit reservation if max_credits specified
        let reservedCredits = 0;
        if (max_credits) {
          reservedCredits = max_credits;
          // Reserve credits upfront
          await deductCredits({
            userId,
            amount: reservedCredits,
            sourceType: "api_agency",
            description: `Agency invocation reservation: ${agencyId}`,
          } as any);
        }

        // Generate a short-lived (15 min) bearer token for the agency bridge
        const userToken = createInternalTokenFromAuth({ userId });

        // Execute run — if this throws and we had a reservation, refund it
        let result: Awaited<ReturnType<typeof agencyBridge.executeRun>>;
        try {
          result = await agencyBridge.executeRun({
            agencyId,
            conversationId,
            message,
            userToken,
            tenantId,
            userId,
          });
        } catch (runErr) {
          if (reservedCredits > 0) {
            await refundCredits({
              userId,
              amount: reservedCredits,
              reason: `Agency invocation failed — full reservation refund: ${agencyId}`,
            } as any).catch(() => {});
          }
          throw runErr;
        }

        const creditsUsed = result.creditsUsed ?? 0;

        // Deduct credits (or refund excess if reservation was used)
        if (max_credits && max_credits > 0) {
          // Refund unused credits
          const unused = Math.max(0, reservedCredits - creditsUsed);
          if (unused > 0) {
            await refundCredits({
              userId,
              amount: unused,
              reason: `Agency invocation refund: used ${creditsUsed} of ${reservedCredits} reserved`,
            } as any);
          }
        } else {
          // Incremental deduction
          if (creditsUsed > 0) {
            await deductCredits({
              userId,
              amount: creditsUsed,
              sourceType: "api_agency",
              description: `Agency invocation: ${agencyId}`,
            } as any);
          }
        }

        // Get remaining balance
        let remaining = 0;
        try {
          const bal = await getCreditBalance(userId);
          remaining = bal?.credits ?? 0;
        } catch {
          // Non-fatal
        }

        if (creditsUsed > 0 && auth.mode === "api_key") {
          incrementDailyCredits(apiKeyId, creditsUsed).catch(() => {});
        }
        res.setHeader("X-Credits-Used", String(creditsUsed));
        res.setHeader("X-Credits-Remaining", String(remaining));

        // Emit agency.message event for webhook subscribers and SSE consumers
        emitPublicApiEvent(tenantId, "agency.message", {
          agency_id: agencyId,
          conversation_id: conversationId,
          run_id: result.runId,
          status: result.status,
          credits_used: creditsUsed,
          timestamp: new Date().toISOString(),
        }).catch(() => {});

        if (stream) {
          // SSE: send result as a single event then close
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");
          res.setHeader("X-Accel-Buffering", "no");
          const hb = setInterval(() => { if (!res.writableEnded) res.write(": heartbeat\n\n"); }, 15000);
          req.on("close", () => clearInterval(hb));
          res.write(`data: ${JSON.stringify({ type: "result", data: result })}\n\n`);
          clearInterval(hb);
          res.write("data: [DONE]\n\n");
          res.end();
        } else {
          res.json({
            run_id: result.runId,
            conversation_id: conversationId,
            status: result.status,
            response: result.response,
            credits_used: creditsUsed,
          });
        }
      } catch (err) {
        console.error("[PublicAgencyApi] POST invoke error", err);
        if (!res.headersSent) {
          sendApiError(res, 500, "internal_error", "Internal server error");
        }
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/agencies/:agencyId/runs/:runId/stream  (must come before /:runId)
  // -------------------------------------------------------------------------
  router.get(
    "/:agencyId/runs/:runId/stream",
    requireScopes("agencies:invoke"),
    async (req, res) => {
      try {
        const { agencyId, runId } = req.params;
        const auth = req.auth!;
        const userId = (auth as any).userId as number;
        const tenantId = (auth as any).tenantId as string;

        const agencyExists = await verifyAgencyTenant(agencyId, tenantId);
        if (!agencyExists) {
          sendApiError(res, 404, "not_found", "Agency not found");
          return;
        }

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");

        // Heartbeat
        const heartbeat = setInterval(() => {
          if (!res.writableEnded) res.write(": heartbeat\n\n");
        }, 15000);

        req.on("close", () => clearInterval(heartbeat));

        // Fetch run details and emit as SSE
        try {
          const userToken = createInternalTokenFromAuth({ userId });
          const result = await agencyBridge.getRunDetails(agencyId, runId, userToken);
          res.write(`data: ${JSON.stringify({ type: "run_status", data: result })}\n\n`);
        } catch (e) {
          res.write(
            `data: ${JSON.stringify({ type: "error", message: "Failed to fetch run" })}\n\n`,
          );
        }

        clearInterval(heartbeat);
        res.write("data: [DONE]\n\n");
        res.end();
      } catch (err) {
        console.error("[PublicAgencyApi] stream error", err);
        if (!res.headersSent) {
          sendApiError(res, 500, "internal_error", "Internal server error");
        }
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/agencies/:agencyId/runs/:runId
  // -------------------------------------------------------------------------
  router.get(
    "/:agencyId/runs/:runId",
    requireScopes("agencies:invoke"),
    async (req, res) => {
      try {
        const { agencyId, runId } = req.params;
        const auth = req.auth!;
        const userId = (auth as any).userId as number;
        const tenantId = (auth as any).tenantId as string;

        const agencyExists = await verifyAgencyTenant(agencyId, tenantId);
        if (!agencyExists) {
          sendApiError(res, 404, "not_found", "Agency not found");
          return;
        }

        const userToken = createInternalTokenFromAuth({ userId });
        const result = await agencyBridge.getRunDetails(agencyId, runId, userToken);

        res.json({
          run_id: result.runId,
          status: result.status,
          response: result.response,
          messages: [],
          credits_used: result.creditsUsed,
          duration_ms: result.durationMs,
          started_at: result.startedAt ?? null,
          completed_at: result.completedAt ?? null,
        });
      } catch (err) {
        console.error("[PublicAgencyApi] GET run error", err);
        sendApiError(res, 500, "internal_error", "Internal server error");
      }
    },
  );

  return router;
}
