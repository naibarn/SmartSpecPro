import { afterEach, describe, expect, it } from "vitest";
import type { Request } from "express";
import {
  decodeMcpCursor,
  encodeMcpCursor,
  isModernMcpRequest,
  isSupportedLegacyProtocolVersion,
  MCP_MODERN_DISABLED_ERROR,
  modernResultMetadata,
  validateModernMcpRequest,
} from "../mcpV2Protocol";

function makeRequest(headers: Record<string, string>, contentType = "application/json"): Request {
  return {
    headers: Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])),
    is: (type: string) => type === "application/json" && contentType === "application/json",
  } as unknown as Request;
}

afterEach(() => {
  delete process.env.MCP_MODERN_PROTOCOL_ENABLED;
});

describe("mcpV2Protocol", () => {
  it("requires the rollout flag before accepting modern protocol traffic", () => {
    const request = makeRequest({ "MCP-Protocol-Version": "2026-07-28" });
    const error = validateModernMcpRequest(request, { jsonrpc: "2.0", method: "ping", id: 1 });
    expect(error?.code).toBe(MCP_MODERN_DISABLED_ERROR);
  });

  it("validates modern method and tool headers against the JSON-RPC body", () => {
    process.env.MCP_MODERN_PROTOCOL_ENABLED = "true";
    const body = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "image.generate" },
      id: 1,
    };
    expect(isModernMcpRequest(makeRequest({ "MCP-Protocol-Version": "2026-07-28" }), body)).toBe(true);
    expect(validateModernMcpRequest(makeRequest({
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": "tools/call",
      "Mcp-Name": "image.generate",
    }), body)).toBeNull();
    expect(validateModernMcpRequest(makeRequest({
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": "tools/list",
      "Mcp-Name": "image.generate",
    }), body)?.code).toBe(-32600);
  });

  it("rejects non-JSON modern requests and keeps cache metadata private", () => {
    process.env.MCP_MODERN_PROTOCOL_ENABLED = "true";
    const request = makeRequest({ "MCP-Protocol-Version": "2026-07-28" }, "text/plain");
    expect(validateModernMcpRequest(request, { jsonrpc: "2.0", method: "ping", id: 1 })?.message)
      .toContain("application/json");
    expect(modernResultMetadata()).toEqual({ ttlMs: 30_000, cacheScope: "private" });
  });

  it("recognizes supported legacy revisions but not modern as initialize revisions", () => {
    expect(isSupportedLegacyProtocolVersion("2025-11-25")).toBe(true);
    expect(isSupportedLegacyProtocolVersion("2025-03-26")).toBe(true);
    expect(isSupportedLegacyProtocolVersion("2026-07-28")).toBe(false);
  });

  it("rejects legacy session headers and unsupported MRTR/requestState fields", () => {
    process.env.MCP_MODERN_PROTOCOL_ENABLED = "true";
    const sessionRequest = makeRequest({
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Session-Id": "session-1",
    });
    expect(validateModernMcpRequest(sessionRequest, {
      jsonrpc: "2.0",
      method: "ping",
      id: 1,
    })?.message).toContain("Mcp-Session-Id");

    const mrtrRequest = makeRequest({ "MCP-Protocol-Version": "2026-07-28" });
    expect(validateModernMcpRequest(mrtrRequest, {
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "models.list", requestState: {} },
      id: 2,
    })?.message).toContain("MRTR/requestState");
  });

  it("signs cursors and binds them to the principal, scopes, and protocol era", () => {
    process.env.JWT_SECRET = "test-jwt-secret-32-chars-minimum-1234567890";
    const context = {
      tenantId: "tenant-1",
      userId: 7,
      scopes: ["mcp:read", "llm:chat"],
      protocolEra: "modern" as const,
    };
    const cursor = encodeMcpCursor(50, context);
    expect(cursor).toMatch(/\.[A-Za-z0-9_-]+$/);
    expect(decodeMcpCursor(cursor, context)).toBe(50);
    expect(decodeMcpCursor(`${cursor}tampered`, context)).toBeNull();
    expect(decodeMcpCursor(cursor, { ...context, userId: 8 })).toBeNull();
    expect(decodeMcpCursor(cursor, { ...context, protocolEra: "legacy" })).toBeNull();
  });
});
