import type { Request, Response } from "express";

import { auditLogger } from "./auditLogger";
import { logPublicApiRequest } from "./publicApiAuditLogger";

export type McpTransportKind =
  | "modern_http"
  | "legacy_rest"
  | "pairing"
  | "download_broker"
  | "oauth";

type TelemetryAuth = {
  ok?: boolean;
  mode?: string;
  tokenUse?: string;
  userId?: number;
  tenantId?: string;
};

type McpTransportTelemetryOptions = {
  transport: McpTransportKind;
  endpoint?: string;
};

function headerValue(req: Request, ...names: string[]): string | null {
  for (const name of names) {
    const value = req.headers[name];
    const normalized = Array.isArray(value) ? value[0] : value;
    if (typeof normalized === "string" && normalized.trim()) {
      return normalized
        .replace(/[\r\n]/g, " ")
        .trim()
        .slice(0, 160);
    }
  }
  return null;
}

function requestBody(req: Request): Record<string, unknown> | null {
  const body = (req as any).body;
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function bodyString(
  body: Record<string, unknown> | null,
  key: string
): string | null {
  const value = body?.[key];
  return typeof value === "string" && value.trim()
    ? value
        .replace(/[\r\n]/g, " ")
        .trim()
        .slice(0, 160)
    : null;
}

function authForRequest(req: Request): TelemetryAuth | null {
  const auth = (req as any).mcpTelemetryAuth ?? (req as any).auth;
  return auth && typeof auth === "object" ? (auth as TelemetryAuth) : null;
}

export function getMcpTransportMetadata(
  req: Request,
  transport: McpTransportKind
): Record<string, unknown> {
  const body = requestBody(req);
  const params =
    body?.params &&
    typeof body.params === "object" &&
    !Array.isArray(body.params)
      ? (body.params as Record<string, unknown>)
      : null;
  const clientInfo =
    params?.clientInfo &&
    typeof params.clientInfo === "object" &&
    !Array.isArray(params.clientInfo)
      ? (params.clientInfo as Record<string, unknown>)
      : null;
  const auth = authForRequest(req);
  const authMode =
    auth?.tokenUse === "mcp_oauth" ? "oauth" : (auth?.mode ?? null);
  const protocolVersion =
    headerValue(req, "mcp-protocol-version", "x-mcp-protocol-version") ??
    bodyString(body, "protocolVersion") ??
    bodyString(params, "protocolVersion");

  return {
    transport,
    endpoint: String(req.originalUrl || req.path).split("?", 1)[0],
    httpMethod: req.method,
    clientName:
      headerValue(
        req,
        "mcp-client-name",
        "mcp-name",
        "x-mcp-client-name",
        "x-client-name"
      ) ?? bodyString(clientInfo, "name"),
    clientVersion:
      headerValue(
        req,
        "mcp-client-version",
        "x-mcp-version",
        "x-client-version"
      ) ?? bodyString(clientInfo, "version"),
    userAgent: headerValue(req, "user-agent"),
    protocolVersion,
    mcpMethod:
      headerValue(req, "mcp-method", "x-mcp-method") ??
      bodyString(body, "method"),
    toolName: bodyString(params, "name") ?? bodyString(body, "name"),
    authMode,
    tokenUse: auth?.tokenUse ?? null,
  };
}

/**
 * Records request-level MCP compatibility telemetry without delaying or
 * changing the originating response. Secrets, prompts, arguments, and bodies
 * are intentionally excluded.
 */
export function attachMcpTransportTelemetry(
  req: Request,
  res: Response,
  options: McpTransportTelemetryOptions
): void {
  const startedAt = Date.now();
  res.once("finish", () => {
    const auth = authForRequest(req);
    const metadata = getMcpTransportMetadata(req, options.transport);
    const endpoint = options.endpoint ?? String(metadata.endpoint ?? req.path);
    const statusCode = res.statusCode;
    const result =
      statusCode >= 500
        ? "server_error"
        : statusCode >= 400
          ? "client_error"
          : "ok";
    const tenantId =
      typeof auth?.tenantId === "string" && auth.tenantId.trim()
        ? auth.tenantId
        : null;
    const userId =
      Number.isInteger(auth?.userId) && Number(auth?.userId) > 0
        ? Number(auth?.userId)
        : null;
    const traceId =
      String(
        (req as any).requestId || headerValue(req, "x-trace-id") || ""
      ).slice(0, 128) || undefined;

    auditLogger.log({
      traceId,
      eventType: "mcp_tool_call",
      userId,
      tenantId,
      endpoint,
      requestType: options.transport,
      statusCode,
      timing: { totalMs: Date.now() - startedAt },
      errorType: result === "ok" ? undefined : result,
      metadata: { ...metadata, result },
    });

    // /v1/mcp is already persisted by publicApiAuditMiddleware. Avoid a
    // duplicate public_api_audit_log row while still keeping the richer
    // request-level auditLogger event for every transport.
    if (options.transport !== "modern_http" && tenantId && auth?.ok) {
      void logPublicApiRequest({
        tenantId,
        userId: userId ?? undefined,
        method: req.method,
        path: endpoint,
        statusCode,
        durationMs: Date.now() - startedAt,
        traceId,
        ip: req.ip,
        userAgent:
          typeof metadata.userAgent === "string"
            ? metadata.userAgent
            : undefined,
        requestMeta: { ...metadata, result },
      });
    }
  });
}

export function setMcpTelemetryAuth(
  req: Request,
  auth: TelemetryAuth | null
): void {
  if (auth) (req as any).mcpTelemetryAuth = auth;
}
