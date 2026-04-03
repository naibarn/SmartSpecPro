import crypto from "crypto";
import { eq } from "drizzle-orm";

import { systemSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import { decrypt } from "./crypto";

const CATEGORY = "infrastructure" as const;

const APP_RUNTIME_KEYS = [
  "python_backend_url",
  "smartspec_proxy_token",
  "smartspec_web_gateway_token",
  "smartspec_mcp_token",
  "smartspec_internal_url",
  "node_server_internal_url",
  "upload_post_api_base_url",
  "public_url",
  "app_public_url",
  "app_url",
  "s3_endpoint",
  "r2_public_url",
  "oauth_server_url",
  "forge_api_url",
  "forge_api_key",
  "llm_gateway_service_account_id",
] as const;

export type RuntimeConfig = {
  pythonBackendUrl: string;
  proxyToken: string;
  webGatewayToken: string;
  mcpServerToken: string;
  internalNodeUrl: string;
  smartspecInternalUrl: string;
  uploadPostApiBaseUrl: string;
  publicUrl: string;
  appPublicUrl: string;
  appUrl: string;
  s3Endpoint: string;
  r2PublicUrl: string;
  oauthServerUrl: string;
  forgeApiUrl: string;
  forgeApiKey: string;
  llmGatewayServiceAccountId: number;
};

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  pythonBackendUrl: (process.env.PYTHON_BACKEND_URL || process.env.BACKEND_URL || "http://localhost:8000").replace(/\/+$/, ""),
  proxyToken: process.env.SMARTSPEC_PROXY_TOKEN || "",
  webGatewayToken: process.env.SMARTSPEC_WEB_GATEWAY_TOKEN || process.env.WEB_GATEWAY_TOKEN || "",
  mcpServerToken: process.env.SMARTSPEC_MCP_TOKEN || process.env.MCP_SERVER_TOKEN || "",
  internalNodeUrl: (process.env.NODE_SERVER_INTERNAL_URL || "http://localhost:3000").replace(/\/+$/, ""),
  smartspecInternalUrl: (process.env.SMARTSPEC_INTERNAL_URL || process.env.NODE_SERVER_INTERNAL_URL || "http://localhost:3000").replace(/\/+$/, ""),
  uploadPostApiBaseUrl: (process.env.UPLOAD_POST_API_BASE_URL || process.env.PYTHON_BACKEND_URL || "http://localhost:8000").replace(/\/+$/, ""),
  publicUrl: (process.env.PUBLIC_URL || "").replace(/\/+$/, ""),
  appPublicUrl: (process.env.APP_PUBLIC_URL || "").replace(/\/+$/, ""),
  appUrl: (process.env.APP_URL || "").replace(/\/+$/, ""),
  s3Endpoint: (process.env.S3_ENDPOINT || "").replace(/\/+$/, ""),
  r2PublicUrl: (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, ""),
  oauthServerUrl: (process.env.OAUTH_SERVER_URL || "").replace(/\/+$/, ""),
  forgeApiUrl: (process.env.FORGE_API_URL || "").replace(/\/+$/, ""),
  forgeApiKey: process.env.FORGE_API_KEY || "",
  llmGatewayServiceAccountId: normalizeInteger(process.env.LLM_GATEWAY_SERVICE_ACCOUNT_ID || "1", 1),
};

let runtimeConfigCache: RuntimeConfig = { ...DEFAULT_RUNTIME_CONFIG };
let runtimeConfigRefreshPromise: Promise<RuntimeConfig> | null = null;

function readRowValue(row?: { value: string | null; isSensitive: boolean | null }) {
  if (!row?.value) return "";
  return row.isSensitive ? (decrypt(row.value) || "") : row.value;
}

function normalizeUrl(value: string, fallback = ""): string {
  return (value || fallback).replace(/\/+$/, "");
}

function normalizeInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function mapRowsToRuntimeConfig(rows: Array<{ key: string; value: string | null; isSensitive: boolean | null }>): RuntimeConfig {
  const map = new Map(rows.map((row) => [row.key, row]));
  const resolve = (key: (typeof APP_RUNTIME_KEYS)[number], fallback: string) => (
    readRowValue(map.get(key)) || fallback
  );

  return {
    pythonBackendUrl: normalizeUrl(resolve("python_backend_url", DEFAULT_RUNTIME_CONFIG.pythonBackendUrl)),
    proxyToken: resolve("smartspec_proxy_token", DEFAULT_RUNTIME_CONFIG.proxyToken),
    webGatewayToken: resolve("smartspec_web_gateway_token", DEFAULT_RUNTIME_CONFIG.webGatewayToken),
    mcpServerToken: resolve("smartspec_mcp_token", DEFAULT_RUNTIME_CONFIG.mcpServerToken),
    internalNodeUrl: normalizeUrl(resolve("node_server_internal_url", DEFAULT_RUNTIME_CONFIG.internalNodeUrl)),
    smartspecInternalUrl: normalizeUrl(resolve("smartspec_internal_url", DEFAULT_RUNTIME_CONFIG.smartspecInternalUrl)),
    uploadPostApiBaseUrl: normalizeUrl(resolve("upload_post_api_base_url", DEFAULT_RUNTIME_CONFIG.uploadPostApiBaseUrl)),
    publicUrl: normalizeUrl(resolve("public_url", DEFAULT_RUNTIME_CONFIG.publicUrl)),
    appPublicUrl: normalizeUrl(resolve("app_public_url", DEFAULT_RUNTIME_CONFIG.appPublicUrl)),
    appUrl: normalizeUrl(resolve("app_url", DEFAULT_RUNTIME_CONFIG.appUrl)),
    s3Endpoint: normalizeUrl(resolve("s3_endpoint", DEFAULT_RUNTIME_CONFIG.s3Endpoint)),
    r2PublicUrl: normalizeUrl(resolve("r2_public_url", DEFAULT_RUNTIME_CONFIG.r2PublicUrl)),
    oauthServerUrl: normalizeUrl(resolve("oauth_server_url", DEFAULT_RUNTIME_CONFIG.oauthServerUrl)),
    forgeApiUrl: normalizeUrl(resolve("forge_api_url", DEFAULT_RUNTIME_CONFIG.forgeApiUrl)),
    forgeApiKey: resolve("forge_api_key", DEFAULT_RUNTIME_CONFIG.forgeApiKey),
    llmGatewayServiceAccountId: normalizeInteger(
      resolve("llm_gateway_service_account_id", String(DEFAULT_RUNTIME_CONFIG.llmGatewayServiceAccountId)),
      DEFAULT_RUNTIME_CONFIG.llmGatewayServiceAccountId,
    ),
  };
}

async function loadAppRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const db = await getDb();
    const rows = db
      ? await db.select().from(systemSettings).where(eq(systemSettings.category, CATEGORY))
      : [];
    return mapRowsToRuntimeConfig(rows);
  } catch {
    return { ...DEFAULT_RUNTIME_CONFIG };
  }
}

export async function refreshAppRuntimeConfigCache(): Promise<RuntimeConfig> {
  if (!runtimeConfigRefreshPromise) {
    runtimeConfigRefreshPromise = loadAppRuntimeConfig()
      .then((config) => {
        runtimeConfigCache = config;
        return config;
      })
      .finally(() => {
        runtimeConfigRefreshPromise = null;
      });
  }
  return runtimeConfigRefreshPromise;
}

export async function getAppRuntimeConfig(): Promise<RuntimeConfig> {
  return refreshAppRuntimeConfigCache();
}

export function getCachedAppRuntimeConfig(): RuntimeConfig {
  return runtimeConfigCache;
}

export async function getPreferredInternalToken(): Promise<string> {
  const config = await getAppRuntimeConfig();
  return config.webGatewayToken || config.proxyToken || "";
}

export function getCachedPreferredInternalToken(): string {
  return (
    runtimeConfigCache.webGatewayToken
    || runtimeConfigCache.proxyToken
    || process.env.SMARTSPEC_WEB_GATEWAY_TOKEN
    || process.env.WEB_GATEWAY_TOKEN
    || process.env.SMARTSPEC_PROXY_TOKEN
    || ""
  );
}

export function getCachedMcpServerToken(): string {
  return (
    runtimeConfigCache.mcpServerToken
    || runtimeConfigCache.webGatewayToken
    || runtimeConfigCache.proxyToken
    || process.env.SMARTSPEC_MCP_TOKEN
    || process.env.MCP_SERVER_TOKEN
    || process.env.SMARTSPEC_WEB_GATEWAY_TOKEN
    || process.env.WEB_GATEWAY_TOKEN
    || process.env.SMARTSPEC_PROXY_TOKEN
    || ""
  );
}

export function getCachedPythonBackendUrl(): string {
  return runtimeConfigCache.pythonBackendUrl || DEFAULT_RUNTIME_CONFIG.pythonBackendUrl;
}

export function getCachedPublicAppUrl(): string {
  return runtimeConfigCache.publicUrl || runtimeConfigCache.appPublicUrl || runtimeConfigCache.appUrl;
}

export function getCachedInternalNodeUrl(): string {
  return runtimeConfigCache.internalNodeUrl || runtimeConfigCache.smartspecInternalUrl || DEFAULT_RUNTIME_CONFIG.internalNodeUrl;
}

export function compareCachedInternalToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const expected = getCachedPreferredInternalToken();
  if (!expected) return false;
  const tokenHash = crypto.createHash("sha256").update(token).digest();
  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(tokenHash, expectedHash);
}
