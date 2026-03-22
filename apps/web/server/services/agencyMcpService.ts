/**
 * Agency MCP Service — formats tools for MCP protocol, encrypts/decrypts tokens,
 * and validates MCP server URLs against SSRF.
 */

import { encrypt, decrypt } from "./crypto";
import { validateSsrfUrl } from "./ssrfValidator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AgencyToolRecord {
  toolId: string;
  agencyId: string;
  name?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpServerEntry {
  url: string;
  name?: string;
  transport?: "http" | "sse";
}

// ---------------------------------------------------------------------------
// Tool formatting
// ---------------------------------------------------------------------------

/**
 * Converts internal agency tool records to MCP tool definition format.
 * Each tool is namespaced as `agency.{agencyId}.{toolId}`.
 */
export function formatToolsAsMcp(tools: AgencyToolRecord[]): McpToolDef[] {
  return tools.map((t) => ({
    name: `agency.${t.agencyId}.${t.toolId}`,
    description: t.description || `Agency tool: ${t.name || t.toolId}`,
    inputSchema: t.inputSchema ?? { type: "object", properties: {} },
  }));
}

// ---------------------------------------------------------------------------
// Token encryption
// ---------------------------------------------------------------------------

/**
 * Encrypts a token map (serverUrl → bearerToken) for storage.
 */
export function encryptMcpTokens(tokens: Record<string, string>): string {
  return encrypt(JSON.stringify(tokens));
}

/**
 * Decrypts a stored token map back to plaintext.
 */
export function decryptMcpTokens(encrypted: string): Record<string, string> {
  const json = decrypt(encrypted);
  return JSON.parse(json) as Record<string, string>;
}

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

/**
 * Validates an MCP server URL for safety and format.
 * In production, only HTTPS is allowed. In development, http://localhost is permitted.
 */
export function validateMcpServerUrl(url: string): { valid: boolean; error?: string } {
  if (!url || typeof url !== "string") {
    return { valid: false, error: "URL is required" };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  // Scheme check
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction && parsed.protocol !== "https:") {
    return { valid: false, error: "Only HTTPS URLs are allowed in production" };
  }
  if (!isProduction && parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { valid: false, error: "Only HTTP(S) URLs are allowed" };
  }

  // SSRF check (reuse existing validator)
  try {
    validateSsrfUrl(url);
  } catch (err: any) {
    return { valid: false, error: err.message || "SSRF validation failed" };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// MCP JSON-RPC client helper
// ---------------------------------------------------------------------------

/**
 * Discovers tools from an external MCP server via JSON-RPC tools/list.
 */
export async function discoverToolsFromServer(
  serverUrl: string,
  token?: string,
  timeoutMs = 10_000,
): Promise<McpToolDef[]> {
  const rpcUrl = serverUrl.endsWith("/rpc") ? serverUrl : `${serverUrl.replace(/\/$/, "")}/rpc`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/list",
        params: {},
        id: 1,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`MCP server returned ${response.status}`);
    }

    const json = (await response.json()) as any;
    if (json.error) {
      throw new Error(json.error.message || "MCP server error");
    }

    const tools = json.result?.tools ?? [];
    return tools.map((t: any) => ({
      name: String(t.name || ""),
      description: String(t.description || ""),
      inputSchema: t.inputSchema ?? {},
    }));
  } finally {
    clearTimeout(timer);
  }
}
