import { describe, expect, it } from "vitest";

import { getMcpTransportMetadata } from "../mcpTransportTelemetry";

describe("MCP transport telemetry", () => {
  it("separates endpoint, client, version, protocol, and method without recording secrets", () => {
    const req = {
      originalUrl: "/v1/mcp?trace=ignored",
      path: "/mcp",
      method: "POST",
      headers: {
        "mcp-protocol-version": "2025-06-18",
        "user-agent": "claude-test-agent",
        authorization: "Bearer should-never-appear",
      },
      body: {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "render_video",
          clientInfo: { name: "Claude Desktop", version: "1.2.3" },
          arguments: { prompt: "private prompt" },
        },
        access_token: "should-never-appear",
      },
      mcpTelemetryAuth: {
        ok: true,
        mode: "bearer",
        tokenUse: "mcp_oauth",
        tenantId: "tenant-a",
        userId: 7,
      },
    } as any;

    const metadata = getMcpTransportMetadata(req, "modern_http");

    expect(metadata).toMatchObject({
      transport: "modern_http",
      endpoint: "/v1/mcp",
      clientName: "Claude Desktop",
      clientVersion: "1.2.3",
      protocolVersion: "2025-06-18",
      mcpMethod: "tools/call",
      toolName: "render_video",
      authMode: "oauth",
    });
    expect(JSON.stringify(metadata)).not.toContain("should-never-appear");
    expect(JSON.stringify(metadata)).not.toContain("private prompt");
  });
});
