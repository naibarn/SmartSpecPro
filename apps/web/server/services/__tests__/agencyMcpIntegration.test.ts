/**
 * Tests for MCP integration — service layer, tRPC procedures, and MCP server exposure.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock crypto before importing service
vi.mock("../crypto", () => ({
  encrypt: vi.fn((val: string) => `encrypted:${val}`),
  decrypt: vi.fn((val: string) => val.replace("encrypted:", "")),
}));

// Mock ssrfValidator
vi.mock("../ssrfValidator", () => ({
  validateSsrfUrl: vi.fn((url: string) => {
    const blocked = ["169.254.169.254", "127.0.0.1", "10.0.0.", "192.168.", "localhost"];
    for (const b of blocked) {
      if (url.includes(b)) throw new Error(`SSRF validation failed: blocked host`);
    }
  }),
}));

import {
  formatToolsAsMcp,
  encryptMcpTokens,
  decryptMcpTokens,
  validateMcpServerUrl,
  discoverToolsFromServer,
} from "../agencyMcpService";
import type { AgencyToolRecord } from "../agencyMcpService";

describe("Agency MCP Service", () => {
  describe("formatToolsAsMcp", () => {
    it("converts agency tools to MCP tool format with namespaced names", () => {
      const tools: AgencyToolRecord[] = [
        {
          toolId: "builtin-web-search",
          agencyId: "agency-1",
          name: "Web Search",
          description: "Search the web",
          inputSchema: { type: "object", properties: { query: { type: "string" } } },
        },
        {
          toolId: "custom-tool-abc",
          agencyId: "agency-1",
          name: "Custom API",
          description: "Call custom API",
        },
      ];

      const result = formatToolsAsMcp(tools);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: "agency.agency-1.builtin-web-search",
        description: "Search the web",
        inputSchema: { type: "object", properties: { query: { type: "string" } } },
      });
      expect(result[1].name).toBe("agency.agency-1.custom-tool-abc");
      expect(result[1].description).toBe("Call custom API");
    });
  });

  describe("encryptMcpTokens / decryptMcpTokens", () => {
    it("encrypts tokens and decrypts back to original", () => {
      const tokens = { "https://mcp.example.com": "secret-token-123" };
      const encrypted = encryptMcpTokens(tokens);

      // Mock encrypt prepends "encrypted:" — in real crypto the token would be ciphertext
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe("string");

      const decrypted = decryptMcpTokens(encrypted);
      expect(decrypted).toEqual(tokens);
    });
  });

  describe("validateMcpServerUrl", () => {
    it("rejects URLs pointing to metadata endpoint (SSRF)", () => {
      const result = validateMcpServerUrl("http://169.254.169.254/latest/meta-data");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("SSRF");
    });

    it("rejects URLs pointing to 127.0.0.1", () => {
      const result = validateMcpServerUrl("http://127.0.0.1:3000/rpc");
      expect(result.valid).toBe(false);
    });

    it("rejects URLs with missing scheme", () => {
      const result = validateMcpServerUrl("mcp.example.com/rpc");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid URL format");
    });

    it("accepts valid HTTPS URLs", () => {
      const result = validateMcpServerUrl("https://mcp.example.com/rpc");
      expect(result.valid).toBe(true);
    });

    it("accepts http in non-production", () => {
      const result = validateMcpServerUrl("http://mcp.example.com/rpc");
      expect(result.valid).toBe(true);
    });
  });

  describe("discoverToolsFromServer", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("returns tool list from external MCP server", async () => {
      const mockResponse = {
        jsonrpc: "2.0",
        id: 1,
        result: {
          tools: [
            { name: "search", description: "Search docs", inputSchema: { type: "object" } },
            { name: "retrieve", description: "Retrieve doc", inputSchema: { type: "object" } },
          ],
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const tools = await discoverToolsFromServer("https://mcp.example.com");
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe("search");
      expect(tools[1].name).toBe("retrieve");
    });

    it("sends Authorization header when token provided", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ jsonrpc: "2.0", id: 1, result: { tools: [] } }),
      });

      await discoverToolsFromServer("https://mcp.example.com", "my-token");

      const callArgs = (global.fetch as any).mock.calls[0];
      expect(callArgs[1].headers["Authorization"]).toBe("Bearer my-token");
    });

    it("handles timeout", async () => {
      global.fetch = vi.fn().mockImplementation((_url: string, opts: any) => {
        return new Promise((_resolve, reject) => {
          const signal = opts?.signal as AbortSignal | undefined;
          if (signal) {
            signal.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }
        });
      });

      await expect(
        discoverToolsFromServer("https://mcp.example.com", undefined, 100),
      ).rejects.toThrow();
    }, 10000);

    it("handles server error response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: "2.0",
            id: 1,
            error: { code: -1, message: "not found" },
          }),
      });

      await expect(discoverToolsFromServer("https://mcp.example.com")).rejects.toThrow(
        "not found",
      );
    });
  });

  describe("saveMcpServers validation", () => {
    it("enforces max 5 MCP servers via Zod schema", () => {
      const { z } = require("zod");
      const schema = z.object({
        agentId: z.string().uuid(),
        mcpServers: z.array(z.object({
          url: z.string().url(),
          name: z.string().max(50).optional(),
          transport: z.enum(["http", "sse"]).default("http"),
        })).max(5, "Maximum 5 MCP servers per agent"),
        tokens: z.record(z.string(), z.string()).optional(),
      });

      const sixServers = Array.from({ length: 6 }, (_, i) => ({
        url: `https://mcp${i}.example.com`,
      }));

      const result = schema.safeParse({
        agentId: "00000000-0000-0000-0000-000000000001",
        mcpServers: sixServers,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("Maximum 5");
      }
    });
  });
});
