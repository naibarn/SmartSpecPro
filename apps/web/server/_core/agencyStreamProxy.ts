/**
 * Agency Stream Proxy — SSE stream proxy from Python backend to client.
 *
 * Registered on Express (not tRPC) because tRPC does not support SSE streaming.
 * Follows the same pattern as registerLLMRoutes and registerMediaJobRoutes.
 */
import type { Express, Request, Response } from "express";
import { authorizeRequest } from "./authz";
import { signBearerToken } from "./tokens";
import { getFeatureFlag } from "../services/featureFlags";
import { getAppRuntimeConfig } from "../services/appRuntimeConfig";
import { hasEnoughCredits } from "../services/creditService";
import { debugError } from "./logger";
export const HEARTBEAT_INTERVAL_MS = 15_000;

/** Conservative credit estimate for an agency run pre-check */
const AGENCY_RUN_ESTIMATED_CREDITS = 5.0;

/** Max concurrent SSE streams per user */
const MAX_STREAMS_PER_USER = 3;

/** Strict pattern for agencyId to prevent path traversal / SSRF */
const AGENCY_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Track active streams per userId for rate limiting */
const activeStreams = new Map<number, number>();

function acquireStream(userId: number): boolean {
  const current = activeStreams.get(userId) || 0;
  if (current >= MAX_STREAMS_PER_USER) return false;
  activeStreams.set(userId, current + 1);
  return true;
}

function releaseStream(userId: number): void {
  const current = activeStreams.get(userId) || 0;
  if (current <= 1) {
    activeStreams.delete(userId);
  } else {
    activeStreams.set(userId, current - 1);
  }
}

function writeSSEHeaders(res: Response): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
}

export function registerAgencyStreamRoutes(app: Express): void {
  app.post("/api/v1/agency/stream", async (req: Request, res: Response) => {
    // Step 1: Authenticate
    const auth = await authorizeRequest(req, {
      allowBearer: true,
      allowSession: true,
    });
    if (!auth.ok) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Step 2: Check feature flag
    const enabled = await getFeatureFlag("AGENCY_SWARM_ENABLED");
    if (!enabled) {
      return res.status(404).json({ error: "Agency feature not enabled" });
    }

    // Step 3: Extract and validate request body
    const {
      agencyId, conversationId, message, modelOverride,
      recipientAgent, fileIds, additionalInstructions, compilePreview,
    } = req.body || {};
    if (!agencyId || !message) {
      return res
        .status(400)
        .json({ error: "agencyId and message are required" });
    }

    // Validate agencyId format to prevent SSRF/path traversal
    if (typeof agencyId !== "string" || !AGENCY_ID_PATTERN.test(agencyId)) {
      return res.status(400).json({ error: "Invalid agencyId format" });
    }

    // Validate conversationId if provided
    if (conversationId != null && typeof conversationId !== "string") {
      return res.status(400).json({ error: "Invalid conversationId format" });
    }

    // Step 3b: Verify agency belongs to user's tenant (IDOR protection)
    const userId = Number(auth.sub);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(403).json({ error: "Invalid user context" });
    }
    try {
      const { getDb } = await import("../db");
      const { agencies: agencyTable, users: usersTable } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const ownerDb = await getDb();
      if (ownerDb) {
        const [userRow] = await ownerDb.select({ tenantId: usersTable.currentTenantId }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
        if (userRow?.tenantId) {
          const [agencyRow] = await ownerDb.select({ id: agencyTable.id }).from(agencyTable)
            .where(and(eq(agencyTable.id, agencyId), eq(agencyTable.tenantId, String(userRow.tenantId))))
            .limit(1);
          if (!agencyRow) {
            return res.status(404).json({ error: "Agency not found" });
          }
        }
      }
    } catch (e) {
      // Fail-closed: if DB unavailable, deny access
      return res.status(503).json({ error: "Service unavailable" });
    }

    // Step 4: Credit pre-check

    const sufficient = await hasEnoughCredits(
      userId,
      AGENCY_RUN_ESTIMATED_CREDITS,
    );
    if (!sufficient) {
      return res.status(402).json({ error: "Insufficient credits" });
    }

    // Step 5: Per-user concurrent stream limit
    if (!acquireStream(userId)) {
      return res.status(429).json({ error: "Too many concurrent streams" });
    }

    const requestId = (req as any).requestId || "";

    // Step 6: Build upstream auth token
    let upstreamToken: string;
    const existingAuth = req.headers.authorization;
    if (existingAuth && typeof existingAuth === "string") {
      upstreamToken = existingAuth.replace(/^Bearer\s+/i, "");
    } else {
      upstreamToken = signBearerToken(
        { sub: auth.sub, type: "access", scopes: ["agency:run"] },
        "15m",
      );
    }

    // Step 7: Fetch upstream (Python) BEFORE sending SSE headers
    const controller = new AbortController();
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      releaseStream(userId);
    };

    req.on("close", () => {
      controller.abort();
      cleanup();
    });

    // Resolve persona prefix for this agency conversation
    let personaPrefix: string | undefined;
    try {
      const { resolvePersona, buildPersonaPromptSegments } = await import("../services/personaService");
      const { getDb } = await import("../db");
      const { conversations: convTable } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const pdb = await getDb();
      if (pdb && conversationId) {
        // Try to load conversation persona context
        const convResult = await pdb
          .select({ personaId: convTable.personaId, tenantId: convTable.tenantId })
          .from(convTable)
          .where(eq(convTable.id, Number(conversationId) || 0))
          .limit(1);

        const conv = convResult[0];
        if (conv) {
          const persona = await resolvePersona(
            { personaId: conv.personaId || null, tenantId: conv.tenantId || null },
            { id: userId, defaultPersonaId: null },
            { id: conv.tenantId || "", defaultPersonaId: null },
          );
          if (persona) {
            personaPrefix = buildPersonaPromptSegments(persona).prefix;
          }
        }
      }
    } catch (err) {
      // Persona resolution failed — continue without persona
      if (err instanceof Error && !err.message?.includes("not enabled")) {
        debugError("agencyStreamProxy", "Persona resolution failed", err);
      }
    }

    try {
      const runtime = await getAppRuntimeConfig();
      const upstream = await fetch(
        `${runtime.pythonBackendUrl}/api/v1/agencies/${encodeURIComponent(agencyId)}/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${upstreamToken}`,
            Accept: "text/event-stream",
            "x-request-id": requestId,
          },
          body: JSON.stringify({
            message,
            conversation_id: conversationId,
            ...(modelOverride && typeof modelOverride === "string" ? { model_override: modelOverride } : {}),
            ...(personaPrefix ? { persona_prefix: personaPrefix } : {}),
            ...(recipientAgent && typeof recipientAgent === "string" ? { recipient_agent: recipientAgent } : {}),
            ...(Array.isArray(fileIds) && fileIds.length > 0 ? { file_ids: fileIds } : {}),
            ...(additionalInstructions && typeof additionalInstructions === "string" ? { additional_instructions: additionalInstructions } : {}),
            ...(compilePreview && typeof compilePreview === "object" ? { compile_preview: compilePreview } : {}),
          }),
          signal: controller.signal,
        },
      );

      // Return proper HTTP errors if upstream rejects before streaming
      if (!upstream.ok) {
        cleanup();
        const status = upstream.status >= 400 && upstream.status < 600
          ? upstream.status
          : 502;
        return res
          .status(status)
          .json({ error: `Upstream error: ${upstream.status}` });
      }

      if (!upstream.body) {
        cleanup();
        return res
          .status(502)
          .json({ error: "No response body from upstream" });
      }

      // Step 8: Upstream OK — now send SSE headers and start heartbeat
      writeSSEHeaders(res);

      heartbeatInterval = setInterval(() => {
        if (!res.writableEnded) {
          res.write(": keepalive\n\n");
        }
      }, HEARTBEAT_INTERVAL_MS);

      // Step 9: Pipe upstream body to response
      const reader = (upstream.body as ReadableStream<Uint8Array>).getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.writableEnded) {
            res.write(value);
          }
        }
      } catch {
        if (!res.writableEnded) {
          res.write(
            `event: error\ndata: ${JSON.stringify({ message: "Upstream connection lost" })}\n\n`,
          );
        }
      } finally {
        cleanup();
        if (!res.writableEnded) {
          res.end();
        }
      }
    } catch (fetchErr: any) {
      cleanup();
      if (fetchErr.name === "AbortError") {
        // Client disconnected — nothing to send
        if (!res.writableEnded) res.end();
        return;
      }
      // Fetch-level error before headers sent
      if (!res.headersSent) {
        return res
          .status(502)
          .json({ error: "Failed to connect to upstream" });
      }
      // Headers already sent — send SSE error
      if (!res.writableEnded) {
        res.write(
          `event: error\ndata: ${JSON.stringify({ message: "Upstream connection lost" })}\n\n`,
        );
        res.end();
      }
    }
  });
}
