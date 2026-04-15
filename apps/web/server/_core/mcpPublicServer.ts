import { Express, Request, Response } from "express";
import { randomUUID } from "crypto";
import { getRedisClient } from "../services/redis";
import { getAppRuntimeConfig } from "../services/appRuntimeConfig";
import { auditLogger } from "../services/auditLogger";
import { hasScope } from "./tokens";
import type { AuthResult } from "./authz";
import {
  buildStaticMcpCatalog,
  executeMcpToolByName,
  listMcpToolsForSession,
  type McpToolSession,
} from "./mcpRegistry";
import { getDelegatedWorkerManifestBySessionId } from "../services/workerDelegationService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  params?: Record<string, unknown>;
  id: string | number | null;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

type SuccessfulAuthResult = AuthResult & { ok: true };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// M14: Configurable session TTL, default 900s (15 minutes)
const SESSION_TTL_SECONDS = parseInt(process.env.MCP_SESSION_TTL_SECONDS || "900", 10);
const TOOL_TIMEOUT_MS = 60_000;
const MAX_RESULT_BYTES = 100 * 1024; // 100KB
const MAX_BATCH_SIZE = 100; // DoS protection: max items per batch request
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-03-26"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePositiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function summarizeHiddenTools(hidden: Array<{ name: string; reason: string }>): Array<{ name: string; reason: string }> {
  return hidden.slice(0, 25).map((entry) => ({
    name: entry.name,
    reason: entry.reason,
  }));
}

function auditMcpToolEvent(input: {
  event: string;
  session?: McpToolSession | null;
  auth?: SuccessfulAuthResult | null;
  toolName?: string | null;
  hidden?: Array<{ name: string; reason: string }>;
  extra?: Record<string, unknown>;
}): void {
  const session = input.session ?? null;
  const auth = input.auth ?? null;
  const authTenantId = normalizeString(((auth as any)?.tenantId || (auth as any)?.user?.currentTenantId));
  const userId = session?.userId
    ?? normalizePositiveInteger((auth as any)?.userId)
    ?? normalizePositiveInteger((auth as any)?.user?.id)
    ?? null;

  auditLogger.log({
    eventType: "mcp_tool_call",
    userId,
    metadata: {
      event: input.event,
      authMode: session?.authMode ?? auth?.mode ?? null,
      tenantId: session?.tenantId ?? (authTenantId || null),
      toolName: input.toolName ?? null,
      workerId: session?.workerId ?? null,
      workerJobId: session?.workerJobId ?? null,
      delegatedSessionId: session?.delegatedSessionId ?? null,
      scopeProfile: session?.scopeProfile ?? null,
      runtimeType: session?.runtimeType ?? null,
      hiddenTools: input.hidden ? summarizeHiddenTools(input.hidden) : undefined,
      hiddenToolCount: input.hidden?.length ?? undefined,
      ...input.extra,
    },
  });
}

function classifyMcpExecutionFailure(err: unknown): { event: string; reason: string } {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const code = typeof err === "object" && err && "code" in err ? String((err as any).code ?? "") : "";

  if (message.startsWith("Tool unavailable: ")) {
    const reason = message.slice("Tool unavailable: ".length) || "tool_unavailable";
    if (reason.includes("budget") || code === "worker_spend_limit_exhausted" || code === "worker_job_budget_exhausted") {
      return { event: "budget_denied", reason };
    }
    if (reason.includes("approval_required")) {
      return { event: "approval_required", reason };
    }
    return { event: "execution_denied", reason };
  }
  if (
    code === "worker_spend_limit_exhausted"
    || code === "worker_job_budget_exhausted"
    || message.includes("credit cap")
    || message.includes("budget")
  ) {
    return { event: "budget_denied", reason: code || "worker_budget_exhausted" };
  }
  if (message.includes("requires params._meta.idempotencyKey")) {
    return { event: "idempotency_rejected", reason: "idempotency_required" };
  }
  if (message.includes("current grants")) {
    return { event: "owner_resource_denied", reason: "resource_grant_unavailable" };
  }
  return { event: "execution_failed", reason: code || "internal_error" };
}

function requireMcpScope(requiredScope: string) {
  return (req: Request, res: Response, next: (err?: unknown) => void) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({
        error: {
          code: "invalid_api_key",
          message: "Authentication required",
          type: "auth_error",
        },
      });
      return;
    }

    if (!hasScope(auth.scopes, requiredScope)) {
      res.status(403).json({
        error: {
          code: "insufficient_scopes",
          message: `Missing required scope: ${requiredScope}`,
          type: "auth_error",
        },
      });
      return;
    }

    next();
  };
}

function normalizeMcpSessionAuth(
  req: Request,
  auth: SuccessfulAuthResult,
): Pick<McpToolSession, "tenantId" | "userId" | "apiKeyId" | "scopes" | "authMode" | "ownerUserId" | "workerId" | "workerJobId" | "delegatedSessionId" | "runtimeType" | "scopeProfile" | "teamId"> {
  const headerTenantId = normalizeString(req.headers["x-tenant-id"]);
  const headerUserId = normalizePositiveInteger(req.headers["x-user-id"]);

  if (auth.mode === "api_key") {
    const tenantId = normalizeString(auth.tenantId);
    const userId = normalizePositiveInteger(auth.userId);
    if (!tenantId || !userId) {
      throw new Error("Missing tenant or user context for MCP session");
    }
    return {
      authMode: "api_key",
      tenantId,
      userId,
      apiKeyId: normalizeString(auth.apiKeyId) || null,
      scopes: auth.scopes ?? [],
    };
  }

  if (auth.mode === "session") {
    const tenantId = normalizeString(auth.tenantId || auth.user?.currentTenantId);
    const userId = normalizePositiveInteger(auth.userId || auth.user?.id);
    if (!tenantId || !userId) {
      throw new Error("Missing tenant or user context for MCP session");
    }
    return {
      authMode: "session",
      tenantId,
      userId,
      apiKeyId: null,
      scopes: auth.scopes ?? [],
    };
  }

  if (auth.mode === "delegated_worker") {
    const tenantId = normalizeString(auth.tenantId);
    const userId = normalizePositiveInteger(auth.userId);
    const ownerUserId = normalizePositiveInteger(auth.ownerUserId);
    if (!tenantId || !userId || !ownerUserId) {
      throw new Error("Missing tenant or user context for MCP session");
    }
    return {
      authMode: "delegated_worker",
      tenantId,
      userId,
      apiKeyId: null,
      scopes: auth.scopes ?? [],
      ownerUserId,
      workerId: normalizeString(auth.workerId) || null,
      workerJobId: normalizeString(auth.workerJobId) || null,
      delegatedSessionId: normalizeString(auth.delegatedSessionId) || null,
      runtimeType: normalizeString(auth.runtimeType) || null,
      scopeProfile: normalizeString(auth.scopeProfile) || null,
      teamId: normalizeString(auth.teamId) || null,
    };
  }

  const allowHeaderContext = auth.sub === "static" || auth.sub === "internal";
  const tenantId = normalizeString((auth as any).tenantId)
    || (allowHeaderContext ? headerTenantId : "");
  const userId = normalizePositiveInteger((auth as any).userId)
    || normalizePositiveInteger(auth.sub)
    || (allowHeaderContext ? headerUserId : null);
  if (!tenantId || !userId) {
    throw new Error("Missing tenant or user context for MCP session");
  }
  return {
    authMode: "bearer",
    tenantId,
    userId,
    apiKeyId: normalizeString((auth as any).apiKeyId) || null,
    scopes: auth.scopes ?? [],
  };
}

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

function jsonRpcResult(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

function sessionKey(id: string): string {
  return `mcp:session:${id}`;
}

async function createSession(session: McpToolSession): Promise<string> {
  const sessionId = randomUUID();
  const redis = getRedisClient();
  await redis.set(sessionKey(sessionId), JSON.stringify(session), "EX", SESSION_TTL_SECONDS);
  return sessionId;
}

async function loadSession(sessionId: string): Promise<McpToolSession | null> {
  const redis = getRedisClient();
  const raw = await redis.get(sessionKey(sessionId));
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as McpToolSession;
    // Refresh TTL (sliding window)
    await redis.expire(sessionKey(sessionId), SESSION_TTL_SECONDS);
    return session;
  } catch {
    return null;
  }
}

async function executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Tool execution timeout")), timeoutMs),
    ),
  ]);
}

function idempotencyCacheKey(
  session: McpToolSession,
  toolName: string,
  idempotencyKey: string,
): string {
  return [
    "mcp",
    "idempotency",
    session.tenantId,
    session.userId,
    toolName,
    idempotencyKey,
  ].join(":");
}

async function loadDelegatedManifest(
  session: McpToolSession,
) {
  if (session.authMode !== "delegated_worker" || !session.delegatedSessionId) {
    return null;
  }
  return getDelegatedWorkerManifestBySessionId({
    delegatedSessionId: session.delegatedSessionId,
  });
}

async function handleInitialize(
  req: Request,
  params: Record<string, unknown>,
  auth: SuccessfulAuthResult,
): Promise<{ result: unknown; sessionId: string }> {
  const normalizedAuth = normalizeMcpSessionAuth(req, auth);
  const session: McpToolSession = {
    state: "ready",
    authMode: normalizedAuth.authMode,
    tenantId: normalizedAuth.tenantId,
    userId: normalizedAuth.userId,
    apiKeyId: normalizedAuth.apiKeyId,
    scopes: normalizedAuth.scopes,
    createdAt: new Date().toISOString(),
    ownerUserId: normalizedAuth.ownerUserId ?? null,
    workerId: normalizedAuth.workerId ?? null,
    workerJobId: normalizedAuth.workerJobId ?? null,
    delegatedSessionId: normalizedAuth.delegatedSessionId ?? null,
    runtimeType: normalizedAuth.runtimeType ?? null,
    scopeProfile: normalizedAuth.scopeProfile ?? null,
    teamId: normalizedAuth.teamId ?? null,
  };

  const sessionId = await createSession(session);

  // Protocol version negotiation per MCP spec 2025-03-26
  const clientVersion = params?.protocolVersion as string | undefined;
  const negotiatedVersion = clientVersion && SUPPORTED_PROTOCOL_VERSIONS.includes(clientVersion)
    ? clientVersion
    : SUPPORTED_PROTOCOL_VERSIONS[0];

  const result = {
    protocolVersion: negotiatedVersion,
    serverInfo: { name: "SmartAIHub", version: "1.0.0" },
    capabilities: { tools: { listChanged: false } },
  };

  auditMcpToolEvent({
    event: "initialize",
    auth,
    session,
    extra: {
      protocolVersion: negotiatedVersion,
    },
  });

  return { result, sessionId };
}

async function handleToolsList(
  session: McpToolSession,
  params?: Record<string, unknown>,
): Promise<unknown> {
  const PAGE_SIZE = 50;
  const delegatedManifest = await loadDelegatedManifest(session);
  const { tools: allTools, hidden } = await listMcpToolsForSession({
    session,
    delegatedManifest,
    idempotencyKey: null,
  });

  const rawCursor = params?.cursor;
  if (rawCursor !== undefined && !/^\d+$/.test(String(rawCursor))) {
    throw { code: -32602, message: "Invalid cursor value" };
  }
  const cursor = rawCursor !== undefined ? Number(rawCursor) : 0;
  // Validate cursor is a safe integer — prevents NaN/Infinity bypass
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > 100000) {
    throw { code: -32602, message: "Invalid cursor value" };
  }

  const page = allTools.slice(cursor, cursor + PAGE_SIZE);
  const nextCursor =
    cursor + PAGE_SIZE < allTools.length
      ? String(cursor + PAGE_SIZE)
      : undefined;

  auditMcpToolEvent({
    event: "tools_list",
    session,
    hidden,
    extra: {
      visibleToolCount: allTools.length,
      pageCursor: cursor,
      pageCount: page.length,
      nextCursor: nextCursor ?? null,
    },
  });

  return { tools: page, nextCursor };
}

async function handleToolsCall(
  session: McpToolSession,
  params: Record<string, unknown>,
): Promise<unknown> {
  const toolName = params.name as string;
  const args = (params.arguments ?? {}) as Record<string, unknown>;
  const meta = params._meta && typeof params._meta === "object"
    ? params._meta as Record<string, unknown>
    : {};
  const idempotencyKey = typeof meta.idempotencyKey === "string"
    ? meta.idempotencyKey.trim()
    : "";

  if (!toolName) {
    throw { code: -32602, message: "Invalid params: missing name" };
  }

  const delegatedManifest = await loadDelegatedManifest(session);
  const redis = getRedisClient();
  if (idempotencyKey && redis) {
    const cached = await redis.get(idempotencyCacheKey(session, toolName, idempotencyKey));
    if (cached) {
      try {
        auditMcpToolEvent({
          event: "idempotency_replay_hit",
          session,
          toolName,
          extra: {
            idempotencyKey,
          },
        });
        return JSON.parse(cached);
      } catch {
        // ignore corrupt cache entry
      }
    }
  }

  const rawResult = await executeWithTimeout(
    async () => {
      const executed = await executeMcpToolByName(toolName, args, {
        session,
        delegatedManifest,
        idempotencyKey: idempotencyKey || null,
      });
      return executed.result;
    },
    TOOL_TIMEOUT_MS,
  );

  const serialized = JSON.stringify(rawResult);
  const result = serialized.length > MAX_RESULT_BYTES
    ? {
        content: [
          {
            type: "text",
            text: `[Result truncated: ${serialized.length} bytes exceeds ${MAX_RESULT_BYTES} byte limit. Use the REST API for large results.]`,
          },
        ],
      }
    : {
        content: [
          {
            type: "text",
            text: typeof rawResult === "string" ? rawResult : JSON.stringify(rawResult, null, 2),
          },
        ],
      };

  if (idempotencyKey && redis) {
    await redis.set(
      idempotencyCacheKey(session, toolName, idempotencyKey),
      JSON.stringify(result),
      "EX",
      Math.min(SESSION_TTL_SECONDS, 24 * 60 * 60),
    ).catch(() => {});
  }

  auditMcpToolEvent({
    event: "execute_success",
    session,
    toolName,
    extra: {
      idempotencyKey: idempotencyKey || null,
      resultContentType: Array.isArray((result as any)?.content) ? "content_block" : typeof rawResult,
    },
  });

  return result;
}

// ---------------------------------------------------------------------------
// Main MCP handler — processes a single JSON-RPC request object
// ---------------------------------------------------------------------------

async function processSingleRequest(
  body: Partial<JsonRpcRequest>,
  req: Request,
  auth: any,
): Promise<JsonRpcResponse | null> {
  // Validate JSON-RPC format
  if (!body || body.jsonrpc !== "2.0" || !body.method) {
    return jsonRpcError(body?.id ?? null, -32600, "Invalid Request");
  }

  const { method, params = {}, id } = body as JsonRpcRequest;

  // notifications/initialized — accepted as no-op per MCP spec
  if (method === "notifications/initialized") {
    return null; // No response for notifications
  }

  // initialize method creates a new session
  if (method === "initialize") {
    try {
      const { result, sessionId } = await handleInitialize(req, params as Record<string, unknown>, auth);
      // NOTE: Mcp-Session-Id header is set by the outer handler for single requests
      // For batches, the session ID from the first initialize in the batch wins
      (req as any)._mcpNewSessionId = sessionId;
      return jsonRpcResult(id, result);
    } catch (err: any) {
      console.error("[MCP] initialize error", err);
      return jsonRpcError(id, -32603, "Internal error");
    }
  }

  // All other methods require a session
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId) {
    return jsonRpcError(id, -32603, "Session required. Call initialize first.");
  }

  let session: McpToolSession | null;
  try {
    session = await loadSession(sessionId);
  } catch (err) {
    console.error("[MCP] session load error", err);
    return jsonRpcError(id, -32603, "Internal error");
  }

  if (!session) {
    // Signal to outer handler that session is expired → HTTP 404
    (req as any)._mcpSessionExpired = true;
    return jsonRpcError(id, -32603, "Session expired or invalid");
  }

  try {
    if (method === "ping") {
      return jsonRpcResult(id, {});
    } else if (method === "tools/list") {
      const result = await handleToolsList(session, params as Record<string, unknown>);
      return jsonRpcResult(id, result);
    } else if (method === "tools/call") {
      const result = await handleToolsCall(session, params as Record<string, unknown>);
      return jsonRpcResult(id, result);
    } else {
      // M28: Do not reflect method name in error (prevents XSS/injection)
      return jsonRpcError(id, -32601, "Method not found");
    }
  } catch (err: any) {
    if (method === "tools/call") {
      const toolName = typeof (params as Record<string, unknown>)?.name === "string"
        ? String((params as Record<string, unknown>).name)
        : null;
      const classified = classifyMcpExecutionFailure(err);
      auditMcpToolEvent({
        event: classified.event,
        session,
        toolName,
        extra: {
          reason: classified.reason,
        },
      });
    } else if (method === "tools/list") {
      auditMcpToolEvent({
        event: "tools_list_failed",
        session,
        extra: {
          reason: err instanceof Error ? err.message : String(err ?? "unknown_error"),
        },
      });
    }
    if (err?.code && typeof err.code === "number") {
      // M08: For internal error code (-32603), use a generic message to avoid
      // leaking implementation details (e.g. upstream HTTP status codes, internal
      // service URLs). Log the original message server-side for diagnostics.
      // -32601 (method/tool not found) and -32602 (invalid params) are safe to
      // forward verbatim because they reflect user-input errors, not internals.
      if (err.code === -32603) {
        console.error("[MCP] internal error (original):", err.message);
        return jsonRpcError(id, -32603, "Internal error");
      }
      return jsonRpcError(id, err.code, err.message);
    } else {
      console.error("[MCP] handler error", err);
      return jsonRpcError(id, -32603, "Internal error");
    }
  }
}

// ---------------------------------------------------------------------------
// Top-level MCP handler — supports batch and single requests
// ---------------------------------------------------------------------------

async function mcpHandler(req: Request, res: Response): Promise<void> {
  const body = req.body;
  const auth = (req as any).auth;

  // Batch request support per MCP spec 2025-03-26
  if (Array.isArray(body)) {
    // DoS protection: limit batch size
    // JSON-RPC 2.0 §5 requires error responses as 200 OK, not HTTP 4xx
    if (body.length > MAX_BATCH_SIZE) {
      res.json(jsonRpcError(null, -32600, `Batch too large: ${body.length} items exceeds limit of ${MAX_BATCH_SIZE}`));
      return;
    }

    // Reject batches with multiple initialize calls (at most one allowed)
    const initCount = body.filter((item: any) => item?.method === "initialize").length;
    if (initCount > 1) {
      res.json(jsonRpcError(null, -32600, "Batch may contain at most one initialize request"));
      return;
    }

    const results = await Promise.all(
      body.map((item: Partial<JsonRpcRequest>) => processSingleRequest(item, req, auth)),
    );
    // Filter out null responses (notifications don't produce a response)
    const responses = results.filter((r): r is JsonRpcResponse => r !== null);

    // If new session was created in the batch, set the header
    if ((req as any)._mcpNewSessionId) {
      res.setHeader("Mcp-Session-Id", (req as any)._mcpNewSessionId);
    }

    // HTTP 404 for expired sessions in batch mode
    if ((req as any)._mcpSessionExpired) {
      res.status(404).json(responses);
      return;
    }

    res.json(responses);
    return;
  }

  // Single request
  const result = await processSingleRequest(body, req, auth);

  // Set session ID header if a new session was created
  if ((req as any)._mcpNewSessionId) {
    res.setHeader("Mcp-Session-Id", (req as any)._mcpNewSessionId);
  }

  // Notification: no id means no response
  if (result === null) {
    res.status(204).end();
    return;
  }

  // HTTP 404 for expired/invalid session per MCP spec
  if ((req as any)._mcpSessionExpired) {
    res.status(404).json(result);
    return;
  }

  res.json(result);
}

// ---------------------------------------------------------------------------
// Session termination handler (DELETE /v1/mcp)
// ---------------------------------------------------------------------------

async function mcpDeleteHandler(req: Request, res: Response): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId && UUID_RE.test(sessionId)) {
    const redis = getRedisClient();
    await redis.del(sessionKey(sessionId));
  }
  res.status(204).end();
}

// ---------------------------------------------------------------------------
// Discovery manifest handler
// ---------------------------------------------------------------------------

function mcpDiscoveryHandler(_req: Request, res: Response): void {
  res.json({
    name: "SmartAIHub",
    url: "https://smartaihub.app/v1/mcp",
    auth: { type: "bearer" },
    capabilities: { tools: true, prompts: false, resources: false },
    docs: "https://smartaihub.app/v1/docs",
    catalog: "https://smartaihub.app/v1/mcp/catalog",
  });
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerMcpPublicRoutes(app: Express): void {
  void getAppRuntimeConfig().then((runtimeConfig) => {
    if (!runtimeConfig.pythonBackendUrl) {
      console.warn(
        "[MCP] Python backend URL is not configured in UI settings — agency tool calls will fall back to localhost",
      );
    }
    if (!runtimeConfig.proxyToken && !runtimeConfig.webGatewayToken) {
      console.warn(
        "[MCP] Internal proxy/web gateway token is not configured in UI settings — inter-service requests may be unauthenticated",
      );
    }
  }).catch(() => {});

  // NOTE: /v1/mcp relies on the shared app.use("/v1", ...) middleware chain for
  // CORS, headers, auth, feature guard, rate limiting, idempotency, and audit.
  // The duplicate apiKeyAuthMiddleware that was previously here is removed —
  // it caused double auth lookups and made the audit middleware run twice.
  app.post(
    "/v1/mcp",
    requireMcpScope("mcp:read"),
    mcpHandler,
  );

  // Session termination per MCP spec 2025-03-26
  app.delete(
    "/v1/mcp",
    requireMcpScope("mcp:read"),
    mcpDeleteHandler,
  );

  app.get("/v1/mcp/catalog", (_req, res) => {
    res.json(buildStaticMcpCatalog());
  });

  app.get("/.well-known/mcp.json", mcpDiscoveryHandler);
}
