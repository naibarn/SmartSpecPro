import { createHash, createHmac, timingSafeEqual } from "crypto";
import type { Request } from "express";
import { getMcpProtectedResourceMetadata, mcpProtectedResourceMetadataUrl } from "./mcpOAuthMetadata";
import { getCachedMcpRuntimeConfig } from "../services/mcpRuntimeConfig";

export const MCP_MODERN_PROTOCOL_VERSION = "2026-07-28";
export const MCP_LEGACY_PROTOCOL_VERSIONS = ["2025-11-25", "2025-03-26"] as const;
export const MCP_SUPPORTED_PROTOCOL_VERSIONS = [
  MCP_MODERN_PROTOCOL_VERSION,
  ...MCP_LEGACY_PROTOCOL_VERSIONS,
] as const;

export const MCP_MODERN_DISABLED_ERROR = -32004;
export const MCP_MODERN_RESULT_TTL_MS = 30_000;
export const MCP_CURSOR_TTL_MS = 15 * 60_000;

export type McpCursorContext = {
  tenantId: string;
  userId: number;
  scopes: string[];
  protocolEra: "legacy" | "modern";
};

type McpCursorPayload = {
  v: 1;
  p: number;
  t: string;
  u: number;
  s: string;
  e: "legacy" | "modern";
  exp: number;
};

type ProtocolError = { code: number; message: string };

function headerValue(req: Request, name: string): string {
  const value = req.headers[name.toLowerCase()];
  return typeof value === "string" ? value.trim() : "";
}

function requestMeta(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const params = (body as Record<string, unknown>).params;
  if (!params || typeof params !== "object" || Array.isArray(params)) return {};
  const meta = (params as Record<string, unknown>)._meta;
  return meta && typeof meta === "object" && !Array.isArray(meta)
    ? meta as Record<string, unknown>
    : {};
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function cursorSecret(): string {
  return (process.env.MCP_CURSOR_SECRET || process.env.JWT_SECRET || "").trim();
}

function cursorScopeHash(scopes: string[]): string {
  return createHash("sha256").update([...scopes].sort().join("\n")).digest("hex");
}

function cursorSignature(encodedPayload: string): string | null {
  const secret = cursorSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function encodeMcpCursor(position: number, context: McpCursorContext): string | null {
  if (!Number.isSafeInteger(position) || position < 0) return null;
  const payload: McpCursorPayload = {
    v: 1,
    p: position,
    t: context.tenantId,
    u: context.userId,
    s: cursorScopeHash(context.scopes),
    e: context.protocolEra,
    exp: Date.now() + MCP_CURSOR_TTL_MS,
  };
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = cursorSignature(encodedPayload);
  return signature ? `${encodedPayload}.${signature}` : null;
}

export function decodeMcpCursor(value: unknown, context: McpCursorContext): number | null {
  if (typeof value !== "string") return null;
  const [encodedPayload, encodedSignature, ...extra] = value.split(".");
  if (!encodedPayload || !encodedSignature || extra.length > 0) return null;
  const expectedSignature = cursorSignature(encodedPayload);
  if (!expectedSignature) return null;
  const provided = Buffer.from(encodedSignature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<McpCursorPayload>;
    if (
      payload.v !== 1
      || payload.e !== context.protocolEra
      || payload.t !== context.tenantId
      || payload.u !== context.userId
      || payload.s !== cursorScopeHash(context.scopes)
      || !Number.isSafeInteger(payload.p)
      || (payload.p as number) < 0
      || !Number.isSafeInteger(payload.exp)
      || (payload.exp as number) <= Date.now()
    ) return null;
    return payload.p as number;
  } catch {
    return null;
  }
}

export function isModernMcpEnabled(): boolean {
  return getCachedMcpRuntimeConfig().modernProtocolEnabled;
}

export function advertisedMcpProtocolVersions() {
  return isModernMcpEnabled()
    ? MCP_SUPPORTED_PROTOCOL_VERSIONS
    : MCP_LEGACY_PROTOCOL_VERSIONS;
}

export function isModernMcpRequest(req: Request, body: unknown): boolean {
  return headerValue(req, "mcp-protocol-version") === MCP_MODERN_PROTOCOL_VERSION
    || requestMeta(body)["io.modelcontextprotocol/protocolVersion"] === MCP_MODERN_PROTOCOL_VERSION;
}

export function getMcpProtocolVersion(req: Request, body: unknown): string {
  return headerValue(req, "mcp-protocol-version")
    || (requestMeta(body)["io.modelcontextprotocol/protocolVersion"] as string | undefined)
    || "";
}

export function validateModernMcpRequest(
  req: Request,
  body: unknown,
  options: { allowBatch?: boolean } = {},
): ProtocolError | null {
  if (!isModernMcpEnabled()) {
    return { code: MCP_MODERN_DISABLED_ERROR, message: "Modern MCP protocol is not enabled" };
  }
  if (!req.is("application/json")) {
    return { code: -32600, message: "MCP requests must use application/json" };
  }

  if (getMcpProtocolVersion(req, body) !== MCP_MODERN_PROTOCOL_VERSION) {
    return { code: -32600, message: "Unsupported MCP protocol version" };
  }

  if (Array.isArray(body)) {
    return options.allowBatch === false
      ? { code: -32600, message: "Modern MCP batches are not supported for this request" }
      : null;
  }
  if (!body || typeof body !== "object") {
    return { code: -32600, message: "Invalid Request" };
  }

  const request = body as Record<string, unknown>;
  if (headerValue(req, "mcp-session-id")) {
    return { code: -32600, message: "Modern MCP requests must not use Mcp-Session-Id" };
  }
  const method = typeof request.method === "string" ? request.method : "";
  const declaredMethod = headerValue(req, "mcp-method");
  if (declaredMethod && declaredMethod !== method) {
    return { code: -32600, message: "Mcp-Method does not match the JSON-RPC method" };
  }

  const declaredName = headerValue(req, "mcp-name");
  if (declaredName) {
    const params = request.params;
    const name = params && typeof params === "object" && !Array.isArray(params)
      ? (params as Record<string, unknown>).name
      : undefined;
    if (method !== "tools/call" || typeof name !== "string" || name.trim() !== declaredName) {
      return { code: -32600, message: "Mcp-Name does not match the tool call" };
    }
  }
  const params = request.params;
  if (params && typeof params === "object" && !Array.isArray(params)) {
    const paramRecord = params as Record<string, unknown>;
    if ("inputResponses" in paramRecord || "requestState" in paramRecord) {
      return { code: -32602, message: "MRTR/requestState is not supported" };
    }
    const meta = requestMeta(body);
    const unsupportedReservedKey = Object.keys(meta).find((key) =>
      key.startsWith("io.modelcontextprotocol/") && key !== "io.modelcontextprotocol/protocolVersion",
    );
    if (unsupportedReservedKey) {
      return { code: -32602, message: "Unsupported reserved MCP metadata" };
    }
  }
  return null;
}

export function modernResultMetadata(cacheScope = "private") {
  return { ttlMs: MCP_MODERN_RESULT_TTL_MS, cacheScope } as const;
}

export function isSupportedLegacyProtocolVersion(
  value: unknown,
): value is typeof MCP_LEGACY_PROTOCOL_VERSIONS[number] {
  return typeof value === "string" && MCP_LEGACY_PROTOCOL_VERSIONS.includes(value as any);
}

export function mcpCapabilitySnapshot(options: { resourcesEnabled?: boolean } = {}) {
  const resourcesEnabled = options.resourcesEnabled ?? true;
  return {
    tools: { listChanged: false },
    ...(resourcesEnabled ? { resources: { subscribe: false, listChanged: false } } : {}),
  } as const;
}

function configuredMcpEndpoint(): string {
  const configured = getCachedMcpRuntimeConfig().publicBaseUrl;
  if (configured) {
    try {
      const url = new URL(configured);
      if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password && !url.hash) {
        return `${url.toString().replace(/\/$/, "")}/v1/mcp`;
      }
    } catch {
      // Use the canonical production endpoint below when deployment config is invalid.
    }
  }
  return process.env.VITEST === "true" ? "https://smartaihub.app/v1/mcp" : "";
}

export function buildMcpDiscoveryDocument(options: { resourcesEnabled?: boolean } = {}) {
  const metadataUrl = getCachedMcpRuntimeConfig().oauthProtectedResourceEnabled
    && getMcpProtectedResourceMetadata()
    ? mcpProtectedResourceMetadataUrl()
    : null;
  return {
    serverInfo: { name: "SmartAIHub", version: "1.0.0" },
    endpoint: configuredMcpEndpoint(),
    protocolVersions: advertisedMcpProtocolVersions(),
    eras: { modern: isModernMcpEnabled(), legacy: true },
    capabilities: mcpCapabilitySnapshot(options),
    authorization: {
      required: true,
      ...(metadataUrl ? { protectedResourceMetadata: metadataUrl } : {}),
    },
    ...{ ttlMs: 60_000, cacheScope: "public" as const },
  };
}
