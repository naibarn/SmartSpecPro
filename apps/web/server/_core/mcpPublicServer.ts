import { Express, Request, Response } from "express";
import { createHash, randomUUID } from "crypto";
import { getCacheClient } from "../services/redisClients";
import { getAppRuntimeConfig } from "../services/appRuntimeConfig";
import { auditLogger } from "../services/auditLogger";
import { hasScope } from "./tokens";
import { authorizeRequest } from "./authz";
import { enforceJsonBodyMaxBytes, rateLimit } from "./limits";
import { buildContextToolStateHintsFromResult } from "../services/contextToolService";
import type { AuthResult } from "./authz";
import {
  buildStaticMcpCatalog,
  executeMcpToolByName,
  listMcpToolsForSession,
  type McpToolSession,
} from "./mcpRegistry";
import { getDelegatedWorkerManifestBySessionId } from "../services/workerDelegationService";
import { resolveMcpDownloadRef } from "../services/mcpDownloadBrokerService";
import {
  approveHermesAgentPairing,
  exchangeHermesAgentPairing,
  refreshHermesAgentPairing,
  resolveHermesPairingIdByUserCode,
  startHermesAgentPairing,
} from "../services/hermesAgentPairingService";
import {
  isModernMcpRequest,
  isSupportedLegacyProtocolVersion,
  MCP_SUPPORTED_PROTOCOL_VERSIONS,
  buildMcpDiscoveryDocument,
  decodeMcpCursor,
  encodeMcpCursor,
  mcpCapabilitySnapshot,
  modernResultMetadata,
  validateModernMcpRequest,
} from "./mcpV2Protocol";
import {
  listMcpDocumentationResources,
  readMcpDocumentationResource,
} from "./mcpResources";
import {
  mcpRolloutError,
  mcpTenantIdFromAuth,
  resolveMcpRolloutPolicy,
} from "./mcpRolloutPolicy";
import {
  getMcpProtectedResourceMetadata,
  setMcpBearerChallenge,
} from "./mcpOAuthMetadata";
import { attachMcpTransportTelemetry } from "../services/mcpTransportTelemetry";
import { getCachedMcpRuntimeConfig } from "../services/mcpRuntimeConfig";

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
const TOOL_TIMEOUT_MS = 60_000;
const MAX_RESULT_BYTES = 100 * 1024; // 100KB
const MAX_BATCH_SIZE = 100; // DoS protection: max items per batch request
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAIRING_ID_RE = UUID_RE;

function validateMcpHttpContract(req: Request, res: Response, next: (err?: unknown) => void): void {
  if (req.method !== "POST") {
    next();
    return;
  }
  if (!req.is("application/json")) {
    res.status(415).json({ error: { code: "unsupported_media_type", message: "MCP requests must use application/json" } });
    return;
  }
  const accept = String(req.headers.accept || "").toLowerCase();
  if (accept && !accept.includes("application/json") && !accept.includes("*/*")) {
    res.status(406).json({ error: { code: "not_acceptable", message: "MCP responses require application/json" } });
    return;
  }
  next();
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePositiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function auditValueHash(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function setMcpJsonHeaders(res: Response, payload: unknown, cacheControl = "private, no-store"): void {
  const serialized = JSON.stringify(payload);
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("ETag", `W/\"${createHash("sha256").update(serialized).digest("hex").slice(0, 32)}\"`);
}

function summarizeHiddenTools(hidden: Array<{ name: string; reason: string }>): Array<{ name: string; reason: string }> {
  return hidden.slice(0, 25).map((entry) => ({
    name: entry.name,
    reason: entry.reason,
  }));
}

function stripContextMetaFromToolResult(result: unknown): unknown {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return result;
  }

  const record = result as Record<string, unknown>;
  if (!("_meta" in record)) {
    return result;
  }

  const { _meta, ...rest } = record;
  return rest;
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
      setMcpBearerChallenge(req, res);
      res.status(401).json({
        error: {
          code: "invalid_api_key",
          message: "Authentication required",
          hint: "Use 'openclaw mcp login smartaihub' (browser) or 'openclaw mcp login smartaihub --device-code' (remote server, container, or headless environments).",
          type: "auth_error",
        },
      });
      return;
    }

    if (!hasScope(auth.scopes, requiredScope)) {
      setMcpBearerChallenge(req, res, { error: "insufficient_scope", scope: requiredScope });
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

/**
 * Cookie-backed MCP sessions need an origin check because /v1 is intentionally
 * outside the legacy /api CSRF middleware. Bearer/API-key and delegated-worker
 * callers are not vulnerable to browser CSRF and remain usable from agents.
 */
function requireMcpSessionOrigin(req: Request, res: Response, next: (err?: unknown) => void) {
  if (req.auth?.mode !== "session") {
    next();
    return;
  }

  const origin = normalizeString(req.headers.origin);
  const requestHost = normalizeString(req.get("host"));
  const configured = getCachedMcpRuntimeConfig().sessionAllowedOrigins;
  const trustedOrigins = configured.length > 0
    ? configured
    : requestHost
      ? [`https://${requestHost}`, `http://${requestHost}`]
      : [];

  // Development/test clients often omit Origin. Production browser sessions
  // must send it so a cross-site form cannot invoke MCP write tools.
  if (!origin) {
    if (process.env.NODE_ENV !== "production") {
      next();
      return;
    }
    res.status(403).json({
      error: { code: "csrf_origin_required", message: "Origin header is required for cookie-authenticated MCP" },
    });
    return;
  }
  if (!trustedOrigins.includes(origin)) {
    res.status(403).json({
      error: { code: "csrf_origin_forbidden", message: "MCP session origin is not trusted" },
    });
    return;
  }
  next();
}

function pairingErrorResponse(res: Response, error: unknown): void {
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code ?? "pairing_failed")
    : "pairing_failed";
  const status = code === "pairing_not_found" || code === "pairing_expired" ? 404
    : code === "pairing_binding_failed" || code === "pairing_refresh_invalid" ? 401
      : code === "pairing_scope_invalid" || code === "pairing_scope_widened" ? 400
        : code === "pairing_not_approved" ? 409
          : 400;
  res.status(status).json({
    error: {
      code,
      message: code === "pairing_scope_invalid"
        ? "The requested MCP permissions are not allowed."
        : code === "pairing_binding_failed"
          ? "The device verification did not match this pairing request."
          : code === "pairing_refresh_invalid"
            ? "The refresh token is invalid or has already been rotated."
            : "The MCP pairing request could not be completed.",
      type: "pairing_error",
    },
  });
}

function pairingUserCode(): string {
  return randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

function pairingStringBody(body: unknown, field: string, maxLength = 512): string {
  if (!body || typeof body !== "object") return "";
  const value = (body as Record<string, unknown>)[field];
  return typeof value === "string" && value.length <= maxLength ? value.trim() : "";
}

function pairingScopesBody(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const value = (body as Record<string, unknown>).scopes;
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value.map((item) => item.trim()).filter(Boolean).slice(0, 32)
    : [];
}

async function requireBrowserPairingSession(req: Request): Promise<
  { tenantId: string; userId: number } | null
> {
  const auth = await authorizeRequest(req, { allowBearer: false, allowSession: true });
  if (!auth.ok || auth.mode !== "session") return null;
  const tenantId = normalizeString(auth.tenantId || auth.user?.currentTenantId);
  const userId = normalizePositiveInteger(auth.userId || auth.user?.id);
  return tenantId && userId ? { tenantId, userId } : null;
}

function requirePairingBrowserOrigin(req: Request, res: Response): boolean {
  const origin = normalizeString(req.headers.origin);
  const requestHost = normalizeString(req.get("host"));
  const configured = getCachedMcpRuntimeConfig().sessionAllowedOrigins;
  const trustedOrigins = configured.length > 0
    ? configured
    : requestHost ? [`https://${requestHost}`, `http://${requestHost}`] : [];
  if (!origin && process.env.NODE_ENV !== "production") return true;
  if (!origin || !trustedOrigins.includes(origin)) {
    res.status(403).json({ error: { code: "csrf_origin_forbidden", message: "A trusted browser origin is required." } });
    return false;
  }
  return true;
}

function normalizeMcpSessionAuth(
  req: Request,
  auth: SuccessfulAuthResult,
): Pick<McpToolSession, "tenantId" | "userId" | "apiKeyId" | "scopes" | "authMode" | "ownerUserId" | "workerId" | "workerJobId" | "delegatedSessionId" | "runtimeType" | "scopeProfile" | "teamId" | "deviceIdHash"> {
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
      // A first-party authenticated browser session is already bound to the
      // current tenant/user. Grant only the read/download MCP capabilities
      // here; write/generation scopes remain explicit on API keys and
      // delegated worker credentials.
      scopes: Array.from(new Set([
        ...(auth.scopes ?? []),
        "library:search",
        "library:read",
        "library:download",
        "media:read",
        "media:download",
      ])),
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

  if (auth.mode === "agent_pairing") {
    return {
      authMode: "agent_pairing",
      tenantId: auth.tenantId,
      userId: auth.userId,
      apiKeyId: null,
      scopes: auth.scopes,
      deviceIdHash: auth.deviceIdHash,
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
  const redis = getCacheClient();
  const sessionTtlSeconds = getCachedMcpRuntimeConfig().sessionTtlSeconds;
  await redis.set(sessionKey(sessionId), JSON.stringify(session), "EX", sessionTtlSeconds);
  return sessionId;
}

async function loadSession(sessionId: string): Promise<McpToolSession | null> {
  const redis = getCacheClient();
  const raw = await redis.get(sessionKey(sessionId));
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as McpToolSession;
    // Refresh TTL (sliding window)
    await redis.expire(sessionKey(sessionId), getCachedMcpRuntimeConfig().sessionTtlSeconds);
    return session;
  } catch {
    return null;
  }
}

async function executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number, req?: Request): Promise<T> {
  if (req?.aborted) throw Object.assign(new Error("MCP request aborted"), { code: -32800 });
  let abortHandler: (() => void) | undefined;
  const abortPromise = req
    ? new Promise<T>((_, reject) => {
      abortHandler = () => reject(Object.assign(new Error("MCP request aborted"), { code: -32800 }));
      req.once("aborted", abortHandler);
    })
    : new Promise<T>(() => {});
  try {
    return await Promise.race([
      fn(),
      abortPromise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("Tool execution timeout")), timeoutMs),
      ),
    ]);
  } finally {
    if (req && abortHandler) req.removeListener("aborted", abortHandler);
  }
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
  legacyBroadScopeCompatibility = false,
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
    deviceIdHash: normalizedAuth.deviceIdHash ?? null,
    legacyBroadScopeCompatibility,
  };

  const sessionId = await createSession(session);

  // Legacy protocol version negotiation. Modern requests never enter initialize.
  const clientVersion = params?.protocolVersion as string | undefined;
  const negotiatedVersion = clientVersion && isSupportedLegacyProtocolVersion(clientVersion)
    ? clientVersion
    : "2025-03-26";

  const result = {
    protocolVersion: negotiatedVersion,
    serverInfo: { name: "SmartAIHub", version: "1.0.0" },
    capabilities: mcpCapabilitySnapshot(),
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

function buildRequestScopedMcpSession(
  req: Request,
  auth: SuccessfulAuthResult,
): McpToolSession {
  const normalizedAuth = normalizeMcpSessionAuth(req, auth);
  return {
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
    deviceIdHash: normalizedAuth.deviceIdHash ?? null,
    legacyBroadScopeCompatibility: false,
  };
}

async function handleModernRequest(
  body: Partial<JsonRpcRequest>,
  req: Request,
  auth: SuccessfulAuthResult,
): Promise<JsonRpcResponse | null> {
  const validation = validateModernMcpRequest(req, body);
  if (validation) return jsonRpcError(body?.id ?? null, validation.code, validation.message);

  const rollout = await resolveMcpRolloutPolicy(mcpTenantIdFromAuth(auth));
  if (!rollout.modern) {
    return jsonRpcError(body?.id ?? null, mcpRolloutError("modern").code, mcpRolloutError("modern").message);
  }

  const method = body.method;
  if (method === "notifications/initialized") return null;

  if (method === "server/discover") {
    auditMcpToolEvent({
      event: "discover",
      auth,
      extra: {
        protocolEra: "modern",
        protocolVersion: MCP_SUPPORTED_PROTOCOL_VERSIONS[0],
      },
    });
    const discovery = buildMcpDiscoveryDocument({ resourcesEnabled: rollout.resources });
    return jsonRpcResult(body.id ?? null, {
      ...discovery,
      authorization: rollout.protectedResourceMetadata
        ? discovery.authorization
        : { required: discovery.authorization.required },
    });
  }

  let session: McpToolSession;
  try {
    session = buildRequestScopedMcpSession(req, auth);
  } catch {
    return jsonRpcError(body.id ?? null, -32603, "Internal error");
  }

  try {
    if (method === "ping") {
      auditMcpToolEvent({
        event: "ping",
        session,
        auth,
        extra: { protocolEra: "modern", protocolVersion: MCP_SUPPORTED_PROTOCOL_VERSIONS[0] },
      });
      return jsonRpcResult(body.id ?? null, modernResultMetadata("private"));
    }
    if (method === "tools/list") {
      const result = await handleToolsList(session, body.params as Record<string, unknown> | undefined, "modern");
      return jsonRpcResult(body.id ?? null, {
        ...(result as Record<string, unknown>),
        ...modernResultMetadata("private"),
      });
    }
    if (method === "resources/list") {
      if (!rollout.resources) {
        const error = mcpRolloutError("resources");
        return jsonRpcError(body.id ?? null, error.code, error.message);
      }
      auditMcpToolEvent({
        event: "resources_list",
        session,
        auth,
        extra: { protocolEra: "modern", protocolVersion: MCP_SUPPORTED_PROTOCOL_VERSIONS[0], resourceClass: "documentation" },
      });
      return jsonRpcResult(body.id ?? null, listMcpDocumentationResources());
    }
    if (method === "resources/read") {
      if (!rollout.resources) {
        const error = mcpRolloutError("resources");
        return jsonRpcError(body.id ?? null, error.code, error.message);
      }
      const resourceParams = body.params as Record<string, unknown> | undefined;
      auditMcpToolEvent({
        event: "resources_read",
        session,
        auth,
        extra: {
          protocolEra: "modern",
          protocolVersion: MCP_SUPPORTED_PROTOCOL_VERSIONS[0],
          resourceClass: "documentation",
          resourceUriHash: auditValueHash(resourceParams?.uri),
        },
      });
      return jsonRpcResult(body.id ?? null, readMcpDocumentationResource(resourceParams?.uri));
    }
    if (method === "tools/call") {
      const result = await handleToolsCall(session, body.params as Record<string, unknown>, "modern", req);
      return jsonRpcResult(body.id ?? null, {
        ...(result as Record<string, unknown>),
        ...modernResultMetadata("private"),
      });
    }
    return jsonRpcError(body.id ?? null, -32601, "Method not found");
  } catch (err: any) {
    if (method === "tools/call") {
      const toolName = typeof body.params === "object" && body.params && !Array.isArray(body.params)
        ? (body.params as Record<string, unknown>).name
        : null;
      const classified = classifyMcpExecutionFailure(err);
      auditMcpToolEvent({
        event: classified.event,
        session,
        auth,
        toolName: typeof toolName === "string" ? toolName : null,
        extra: {
          reason: classified.reason,
          protocolEra: "modern",
          protocolVersion: MCP_SUPPORTED_PROTOCOL_VERSIONS[0],
        },
      });
    } else if (method === "resources/read") {
      const resourceUri = typeof body.params === "object" && body.params && !Array.isArray(body.params)
        ? (body.params as Record<string, unknown>).uri
        : null;
      auditMcpToolEvent({
        event: "resources_read_failed",
        session,
        auth,
        extra: {
          protocolEra: "modern",
          protocolVersion: MCP_SUPPORTED_PROTOCOL_VERSIONS[0],
          resourceClass: "documentation",
          resourceUriHash: auditValueHash(resourceUri),
        },
      });
    }
    if (err?.code && typeof err.code === "number") {
      return jsonRpcError(
        body.id ?? null,
        err.code === -32603 ? -32603 : err.code,
        err.code === -32603 ? "Internal error" : err.message,
      );
    }
    return jsonRpcError(body.id ?? null, -32603, "Internal error");
  }
}

async function handleToolsList(
  session: McpToolSession,
  params?: Record<string, unknown>,
  protocolEra: "legacy" | "modern" = "legacy",
): Promise<unknown> {
  const PAGE_SIZE = 50;
  const delegatedManifest = await loadDelegatedManifest(session);
  const { tools: allTools, hidden } = await listMcpToolsForSession({
    session,
    delegatedManifest,
    idempotencyKey: null,
  });

  const rawCursor = params?.cursor;
  let cursor = 0;
  if (protocolEra === "modern") {
    if (rawCursor !== undefined) {
      const decoded = decodeMcpCursor(rawCursor, {
        tenantId: session.tenantId,
        userId: session.userId,
        scopes: session.scopes,
        protocolEra,
      });
      if (decoded === null) throw { code: -32602, message: "Invalid cursor value" };
      cursor = decoded;
    }
  } else {
    if (rawCursor !== undefined && !/^\d+$/.test(String(rawCursor))) {
      throw { code: -32602, message: "Invalid cursor value" };
    }
    cursor = rawCursor !== undefined ? Number(rawCursor) : 0;
  }
  // Validate cursor is a safe integer — prevents NaN/Infinity/out-of-range bypass
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > 100000) {
    throw { code: -32602, message: "Invalid cursor value" };
  }

  const page = allTools.slice(cursor, cursor + PAGE_SIZE).map((tool) => ({
    ...tool,
    inputSchema: (tool.inputSchema && typeof tool.inputSchema === "object" && Object.keys(tool.inputSchema).length > 0)
      ? tool.inputSchema
      : { type: "object", properties: {}, additionalProperties: false },
  }));
  const nextCursor = cursor + PAGE_SIZE < allTools.length
    ? protocolEra === "modern"
      ? encodeMcpCursor(cursor + PAGE_SIZE, {
          tenantId: session.tenantId,
          userId: session.userId,
          scopes: session.scopes,
          protocolEra,
        })
      : String(cursor + PAGE_SIZE)
    : undefined;
  if (cursor + PAGE_SIZE < allTools.length && !nextCursor) {
    throw { code: -32603, message: "Cursor signing is not configured" };
  }

  auditMcpToolEvent({
    event: "tools_list",
    session,
    hidden,
    extra: {
      visibleToolCount: allTools.length,
      pageCursor: cursor,
      pageCount: page.length,
      nextCursor: nextCursor ?? null,
      protocolEra,
      protocolVersion: protocolEra === "modern" ? MCP_SUPPORTED_PROTOCOL_VERSIONS[0] : "legacy",
    },
  });

  return { tools: page, nextCursor };
}

async function handleToolsCall(
  session: McpToolSession,
  params: Record<string, unknown>,
  protocolEra: "legacy" | "modern" = "legacy",
  req?: Request,
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
    const redis = getCacheClient();
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
            protocolEra,
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
    req,
  );

  // Public API auditing and MCP CLI credit budgets consume the same response
  // header as REST routes. MCP tools return their actual charge in the
  // structured result, so expose only the numeric total (never tool args or
  // result content) on the request/response boundary.
  if (req && rawResult && typeof rawResult === "object" && !Array.isArray(rawResult)) {
    const reportedCredits = Number(
      (rawResult as Record<string, unknown>).creditsUsed
      ?? (rawResult as Record<string, unknown>).credits_used
      ?? 0,
    );
    if (Number.isFinite(reportedCredits) && reportedCredits > 0) {
      const previous = Number((req as any)._mcpCreditsUsed ?? 0);
      (req as any)._mcpCreditsUsed = previous + reportedCredits;
    }
  }

  const ownerType = session.teamId ? "team" : "user";
  const ownerId = session.teamId ? session.teamId : String(session.userId);
  const contextState = buildContextToolStateHintsFromResult({
    title: `MCP tool result: ${toolName}`,
    content: rawResult,
    ownerType,
    ownerId,
    sourceRef: `mcp:${toolName}`,
    source: typeof rawResult === "string" ? "semantic" : "structured",
    includedReason: `MCP tool result from ${toolName}`,
    trust: "derived",
    freshness: "recent",
  });

  const contentResult = stripContextMetaFromToolResult(rawResult);

  const isPreformattedResult =
    contentResult !== null &&
    typeof contentResult === "object" &&
    !Array.isArray(contentResult) &&
    Array.isArray((contentResult as any).content) &&
    "structuredContent" in (contentResult as any);

  let result: Record<string, unknown>;
  if (isPreformattedResult) {
    result = { ...(contentResult as Record<string, unknown>) };
  } else {
    const serialized = JSON.stringify(contentResult);
    let structuredContent: Record<string, unknown>;
    if (contentResult !== null && typeof contentResult === "object") {
      structuredContent = Array.isArray(contentResult)
        ? { items: contentResult }
        : (contentResult as Record<string, unknown>);
    } else {
      structuredContent = { value: contentResult ?? null };
    }

    result = serialized.length > MAX_RESULT_BYTES
      ? {
          content: [
            {
              type: "text",
              text: `[Result truncated: ${serialized.length} bytes exceeds ${MAX_RESULT_BYTES} byte limit. Use the REST API for large results.]`,
            },
          ],
          structuredContent: {
            truncated: true,
            byteLength: serialized.length,
          },
        }
      : {
          content: [
            {
              type: "text",
              text: typeof contentResult === "string" ? contentResult : JSON.stringify(contentResult, null, 2),
            },
          ],
          structuredContent,
        };
  }

  if (Object.keys(contextState).length > 0) {
    (result as Record<string, unknown>)._meta = {
      contextState,
      contextSource: "mcp_tool_result",
      toolName,
    };
  }

  if (idempotencyKey && redis) {
    await redis.set(
      idempotencyCacheKey(session, toolName, idempotencyKey),
      JSON.stringify(result),
      "EX",
      Math.min(getCachedMcpRuntimeConfig().sessionTtlSeconds, 24 * 60 * 60),
    ).catch(() => {});
  }

  auditMcpToolEvent({
    event: "execute_success",
    session,
    toolName,
    extra: {
      idempotencyKey: idempotencyKey || null,
      resultContentType: Array.isArray((result as any)?.content) ? "content_block" : typeof rawResult,
      protocolEra,
      protocolVersion: protocolEra === "modern" ? MCP_SUPPORTED_PROTOCOL_VERSIONS[0] : "legacy",
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

  const modernHeaderMarker = req.headers["mcp-method"] || req.headers["mcp-name"];
  if (modernHeaderMarker && !isModernMcpRequest(req, body)) {
    return jsonRpcError(id, -32600, "Modern MCP protocol version is required for MCP routing headers");
  }

  if (isModernMcpRequest(req, body)) {
    return handleModernRequest(body, req, auth);
  }

  // notifications/initialized — accepted as no-op per MCP spec
  if (method === "notifications/initialized") {
    return null; // No response for notifications
  }

  // initialize method creates a new session
  if (method === "initialize") {
    try {
      const rollout = await resolveMcpRolloutPolicy(mcpTenantIdFromAuth(auth));
      if (!rollout.legacy) {
        const error = mcpRolloutError("legacy");
        return jsonRpcError(id, error.code, error.message);
      }
      const { result, sessionId } = await handleInitialize(
        req,
        params as Record<string, unknown>,
        auth,
        rollout.legacyBroadScopeCompatibility,
      );
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

  const rollout = await resolveMcpRolloutPolicy(session.tenantId);
  if (!rollout.legacy) {
    const error = mcpRolloutError("legacy");
    return jsonRpcError(id, error.code, error.message);
  }
  session.legacyBroadScopeCompatibility = rollout.legacyBroadScopeCompatibility;

  try {
    if (method === "ping") {
      return jsonRpcResult(id, {});
    } else if (method === "tools/list") {
      const result = await handleToolsList(session, params as Record<string, unknown>);
      return jsonRpcResult(id, result);
    } else if (method === "tools/call") {
      const result = await handleToolsCall(session, params as Record<string, unknown>, "legacy", req);
      return jsonRpcResult(id, result);
    } else if (method === "resources/list") {
      const rollout = await resolveMcpRolloutPolicy(session.tenantId);
      if (!rollout.resources) {
        const error = mcpRolloutError("resources");
        return jsonRpcError(id, error.code, error.message);
      }
      return jsonRpcResult(id, listMcpDocumentationResources());
    } else if (method === "resources/read") {
      const rollout = await resolveMcpRolloutPolicy(session.tenantId);
      if (!rollout.resources) {
        const error = mcpRolloutError("resources");
        return jsonRpcError(id, error.code, error.message);
      }
      return jsonRpcResult(id, readMcpDocumentationResource((params as Record<string, unknown>)?.uri));
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

  const setCreditsHeader = () => {
    const creditsUsed = Number((req as any)._mcpCreditsUsed ?? 0);
    if (Number.isFinite(creditsUsed) && creditsUsed > 0) {
      res.setHeader("X-Credits-Used", String(Math.ceil(creditsUsed)));
    }
  };

  // Batch request support per MCP spec 2025-03-26
  if (Array.isArray(body)) {
    // DoS protection: limit batch size
    // JSON-RPC 2.0 §5 requires error responses as 200 OK, not HTTP 4xx
    if (body.length > MAX_BATCH_SIZE) {
      const error = jsonRpcError(null, -32600, `Batch too large: ${body.length} items exceeds limit of ${MAX_BATCH_SIZE}`);
      setMcpJsonHeaders(res, error);
      res.json(error);
      return;
    }

    // Reject batches with multiple initialize calls (at most one allowed)
    const initCount = body.filter((item: any) => item?.method === "initialize").length;
    if (initCount > 1) {
      const error = jsonRpcError(null, -32600, "Batch may contain at most one initialize request");
      setMcpJsonHeaders(res, error);
      res.json(error);
      return;
    }

    const results = await Promise.all(
      body.map((item: Partial<JsonRpcRequest>) => processSingleRequest(item, req, auth)),
    );
    // Filter out null responses (notifications don't produce a response)
    const responses = results.filter((r): r is JsonRpcResponse => r !== null);
    setCreditsHeader();

    // If new session was created in the batch, set the header
    if ((req as any)._mcpNewSessionId) {
      res.setHeader("Mcp-Session-Id", (req as any)._mcpNewSessionId);
    }

    // HTTP 404 for expired sessions in batch mode
    if ((req as any)._mcpSessionExpired) {
      setMcpJsonHeaders(res, responses);
      res.status(404).json(responses);
      return;
    }

    setMcpJsonHeaders(res, responses);
    res.json(responses);
    return;
  }

  // Single request
  const result = await processSingleRequest(body, req, auth);
  setCreditsHeader();

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
    setMcpJsonHeaders(res, result);
    res.status(404).json(result);
    return;
  }

  setMcpJsonHeaders(res, result);
  res.json(result);
}

// ---------------------------------------------------------------------------
// Session termination handler (DELETE /v1/mcp)
// ---------------------------------------------------------------------------

async function mcpDeleteHandler(req: Request, res: Response): Promise<void> {
  if (String(req.headers["mcp-protocol-version"] || "") === "2026-07-28") {
    res.status(204).end();
    return;
  }
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId && UUID_RE.test(sessionId)) {
    const redis = getCacheClient();
    await redis.del(sessionKey(sessionId));
  }
  res.status(204).end();
}

// ---------------------------------------------------------------------------
// Discovery manifest handler
// ---------------------------------------------------------------------------

function mcpDiscoveryHandler(_req: Request, res: Response): void {
  // This manifest is unauthenticated and has no tenant context. Do not
  // advertise tenant-gated documentation resources here; authenticated
  // server/discover is the authoritative capability response.
  const discovery = buildMcpDiscoveryDocument({ resourcesEnabled: false });
  const endpoint = discovery.endpoint;
  const origin = endpoint.replace(/\/v1\/mcp$/, "");
  const manifest = {
    name: "SmartAIHub",
    url: endpoint,
    auth: { type: "bearer" },
    protocols: discovery.protocolVersions,
    eras: discovery.eras,
    serverDiscover: discovery.eras.modern,
    // Keep the historical boolean `tools` marker for older clients, but omit
    // unsupported capability keys. Several strict MCP clients deserialize
    // this discovery object with the same model they use for InitializeResult
    // and reject `prompts: false`/`tasks: false` because those fields must be
    // capability objects when present. JSON-RPC server/discover remains the
    // authoritative typed capability document.
    capabilities: {
      tools: true,
      resources: Boolean(discovery.capabilities.resources),
      toolsListChanged: discovery.capabilities.tools.listChanged,
    },
    authorization: discovery.authorization,
    docs: `${origin}/v1/docs`,
    catalog: `${origin}/v1/mcp/catalog`,
  };
  setMcpJsonHeaders(res, manifest, "public, max-age=60");
  res.json(manifest);
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

  const pairingLimiter = rateLimit("mcp-agent-pairing", { rpm: 30 });
  const pairingBodyLimit = enforceJsonBodyMaxBytes(16 * 1024);

  // Browser approval is deliberately separate from the MCP JSON-RPC endpoint.
  // The agent never receives a browser cookie and the browser never receives a
  // device refresh token; only the short-lived Redis pairing record connects
  // the two flows.
  app.post("/api/mcp/pairing/start", (req, res, next) => {
    attachMcpTransportTelemetry(req, res, { transport: "pairing", endpoint: "/api/mcp/pairing/start" });
    next();
  }, pairingLimiter, pairingBodyLimit, async (req, res) => {
    try {
      if (!requirePairingBrowserOrigin(req, res)) return;
      const browser = await requireBrowserPairingSession(req);
      if (!browser) {
        res.status(401).json({ error: { code: "unauthorized", message: "Login is required to pair a Hermes agent." } });
        return;
      }
      const deviceId = pairingStringBody(req.body, "device_id", 256);
      const codeChallenge = pairingStringBody(req.body, "code_challenge", 256);
      const scopes = pairingScopesBody(req.body);
      if (!deviceId || !codeChallenge || !scopes.length) {
        res.status(400).json({ error: { code: "invalid_request", message: "device_id, code_challenge, and scopes are required." } });
        return;
      }
      const displayName = pairingStringBody(req.body, "display_name", 255) || null;
      const runtimeType = pairingStringBody(req.body, "runtime_type", 80) || null;
      const clientLabel = displayName || (runtimeType === "openclaw_gateway" ? "OpenClaw" : "Hermes");
      const result = await startHermesAgentPairing({
        tenantId: browser.tenantId,
        userId: browser.userId,
        deviceId,
        requestedScopes: scopes,
        codeChallenge,
        userCode: pairingUserCode(),
        verificationUri: "https://smartaihub.app/mcp/pairing/approve",
        displayName,
        platform: pairingStringBody(req.body, "platform", 40) || null,
        architecture: pairingStringBody(req.body, "architecture", 40) || null,
        runtimeType,
      });
      res.status(201).json({
        ...result,
        verificationUri: `${result.verificationUri}?pairing_id=${encodeURIComponent(result.pairingId)}&user_code=${encodeURIComponent(result.userCode)}&client_name=${encodeURIComponent(clientLabel)}`,
      });
    } catch (error) {
      pairingErrorResponse(res, error);
    }
  });

  app.post("/api/mcp/pairing/approve", (req, res, next) => {
    attachMcpTransportTelemetry(req, res, { transport: "pairing", endpoint: "/api/mcp/pairing/approve" });
    next();
  }, pairingLimiter, pairingBodyLimit, async (req, res) => {
    try {
      if (!requirePairingBrowserOrigin(req, res)) return;
      const browser = await requireBrowserPairingSession(req);
      if (!browser) {
        res.status(401).json({ error: { code: "unauthorized", message: "Login is required to approve an agent." } });
        return;
      }
      let pairingId = pairingStringBody(req.body, "pairing_id", 64);
      if (!pairingId) pairingId = await resolveHermesPairingIdByUserCode(pairingStringBody(req.body, "user_code", 32)) ?? "";
      const scopes = pairingScopesBody(req.body);
      if (!PAIRING_ID_RE.test(pairingId)) {
        res.status(400).json({ error: { code: "invalid_request", message: "A valid pairing_id is required." } });
        return;
      }
      const result = await approveHermesAgentPairing({
        pairingId,
        tenantId: browser.tenantId,
        userId: browser.userId,
        ...(scopes.length ? { approvedScopes: scopes } : {}),
      });
      res.json(result);
    } catch (error) {
      pairingErrorResponse(res, error);
    }
  });

  app.post("/api/mcp/pairing/exchange", (req, res, next) => {
    attachMcpTransportTelemetry(req, res, { transport: "pairing", endpoint: "/api/mcp/pairing/exchange" });
    next();
  }, pairingLimiter, pairingBodyLimit, async (req, res) => {
    try {
      const pairingId = pairingStringBody(req.body, "pairing_id", 64);
      const deviceId = pairingStringBody(req.body, "device_id", 256);
      const codeVerifier = pairingStringBody(req.body, "code_verifier", 256);
      if (!PAIRING_ID_RE.test(pairingId) || !deviceId || !codeVerifier) {
        res.status(400).json({ error: { code: "invalid_request", message: "pairing_id, device_id, and code_verifier are required." } });
        return;
      }
      res.json(await exchangeHermesAgentPairing({ pairingId, deviceId, codeVerifier }));
    } catch (error) {
      pairingErrorResponse(res, error);
    }
  });

  app.post("/api/mcp/pairing/refresh", (req, res, next) => {
    attachMcpTransportTelemetry(req, res, { transport: "pairing", endpoint: "/api/mcp/pairing/refresh" });
    next();
  }, pairingLimiter, pairingBodyLimit, async (req, res) => {
    try {
      const refreshToken = pairingStringBody(req.body, "refresh_token", 16 * 1024);
      if (!refreshToken) {
        res.status(400).json({ error: { code: "invalid_request", message: "refresh_token is required." } });
        return;
      }
      res.json(await refreshHermesAgentPairing(refreshToken));
    } catch (error) {
      pairingErrorResponse(res, error);
    }
  });

  // Binary transfer is deliberately outside JSON-RPC. The ref is short-lived,
  // opaque to the caller, and the broker re-checks the underlying ACL/object
  // ownership before every stream (including Range requests).
  const handleMcpDownload = async (req: Request, res: Response) => {
    try {
      const result = await resolveMcpDownloadRef(req.params.token, req.headers.range);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", result.contentType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${result.fileName.replace(/"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
      );
      if (result.contentLength != null) res.setHeader("Content-Length", String(result.contentLength));
      if (result.isPartial && result.rangeStart != null && result.rangeEnd != null) {
        res.status(206);
        res.setHeader("Content-Range", `bytes ${result.rangeStart}-${result.rangeEnd}/${result.totalLength ?? "*"}`);
      }
      const stream = result.stream as any;
      if (typeof stream.pipe === "function") {
        stream.pipe(res);
        return;
      }
      const reader = stream.getReader();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        res.write(chunk.value);
      }
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : "download_failed";
      const status = message === "download_ref_invalid" ? 401
        : message === "download_ref_revoked" ? 410
          : message === "download_grant_unavailable" ? 503
            : 404;
      if (!res.headersSent) res.status(status).json({ error: message });
    }
  };

  // Keep the real extension in the public path because providers such as Kie.ai
  // validate reference-file types from the URL before fetching the content. The
  // signed token remains the source of truth; the suffix is only a provider hint.
  app.get("/api/mcp/downloads/:token/:fileName", (req, res, next) => {
    attachMcpTransportTelemetry(req, res, { transport: "download_broker", endpoint: "/api/mcp/downloads/:token/:fileName" });
    next();
  }, handleMcpDownload);
  // Backward compatibility for refs issued before extension-bearing URLs.
  app.get("/api/mcp/downloads/:token", (req, res, next) => {
    attachMcpTransportTelemetry(req, res, { transport: "download_broker", endpoint: "/api/mcp/downloads/:token" });
    next();
  }, handleMcpDownload);

  // NOTE: /v1/mcp relies on the shared app.use("/v1", ...) middleware chain for
  // CORS, headers, auth, feature guard, rate limiting, idempotency, and audit.
  // The duplicate apiKeyAuthMiddleware that was previously here is removed —
  // it caused double auth lookups and made the audit middleware run twice.
  app.post(
    "/v1/mcp",
    (req, res, next) => {
      attachMcpTransportTelemetry(req, res, { transport: "modern_http", endpoint: "/v1/mcp" });
      next();
    },
    validateMcpHttpContract,
    requireMcpSessionOrigin,
    requireMcpScope("mcp:read"),
    mcpHandler,
  );

  const rejectMcpGet = (_req: Request, res: Response) => {
    res.status(405).setHeader("Allow", "POST, DELETE, OPTIONS").json({
      error: { code: "method_not_allowed", message: "Use POST for MCP JSON-RPC requests." },
    });
  };
  app.get("/v1/mcp", (req, res, next) => {
    attachMcpTransportTelemetry(req, res, { transport: "modern_http", endpoint: "/v1/mcp" });
    next();
  }, requireMcpScope("mcp:read"), rejectMcpGet);
  app.head("/v1/mcp", (req, res, next) => {
    attachMcpTransportTelemetry(req, res, { transport: "modern_http", endpoint: "/v1/mcp" });
    next();
  }, requireMcpScope("mcp:read"), rejectMcpGet);

  // Session termination per MCP spec 2025-03-26
  app.delete(
    "/v1/mcp",
    (req, res, next) => {
      attachMcpTransportTelemetry(req, res, { transport: "modern_http", endpoint: "/v1/mcp" });
      next();
    },
    requireMcpSessionOrigin,
    requireMcpScope("mcp:read"),
    mcpDeleteHandler,
  );

  app.get("/v1/mcp/catalog", (_req, res) => {
    res.json(buildStaticMcpCatalog());
  });

  app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  const metadata = getCachedMcpRuntimeConfig().oauthProtectedResourceEnabled
      ? getMcpProtectedResourceMetadata()
      : null;
    if (!metadata) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(metadata);
  });

  app.get("/.well-known/mcp.json", mcpDiscoveryHandler);
}
