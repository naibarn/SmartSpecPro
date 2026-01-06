import { render, screen } from "@testing-library/react";
import React from "react";

import LLMChatPage from "./LLMChat";

describe("LLMChatPage", () => {
  it("renders and loads policy", async () => {
    // mock policy endpoint
    const mockFetch = vi.fn(async (url: any) => {
      if (String(url).includes("/v1/policy")) {
        return new Response(
          JSON.stringify({
            proxy: {
              localhostOnly: false,
              autoMcpTools: true,
              mcpToolAllowlist: [],
              maxToolIters: 8,
              mcpTimeoutSeconds: 20,
              gatewayTimeoutSeconds: 90,
              approval: {
                approvalTools: ["workspace_write_file"],
                timeoutSeconds: 120,
                autoApproveNonstream: false,
                redisEnabled: false,
                pollInterval: 0.5,
                keyPrefix: "approval",
              },
              audit: { path: "logs/llm_tool_audit.jsonl", rotateDaily: true, retentionDays: 30 },
              throttling: { maxConcurrentPerTrace: 2, concurrencyWaitSeconds: 10, traceSemIdleTtlSeconds: 600, rateLimitCount: 30, rateLimitWindowSeconds: 60, traceRateIdleTtlSeconds: 600 },
            },
            mcp: { workspaceRoot: ".", enableWrite: false, writeTokenRequired: true, maxReadBytes: 1000, maxWriteBytes: 1000, readExtAllowlist: [".md"], writeExtAllowlist: [".md"], pathAllowlist: ["."], pathDenylist: [".env"], controlPlaneConfigured: true },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    });

    (globalThis as any).fetch = mockFetch;

    render(<LLMChatPage />);

    expect(screen.getByText(/LLM Chat/i)).toBeInTheDocument();

    // Policy panel should eventually show "loaded"
    expect(await screen.findByText(/loaded/i)).toBeInTheDocument();
    // Send button exists
    expect(screen.getByRole("button", { name: /Send/i })).toBeInTheDocument();
  });
});
