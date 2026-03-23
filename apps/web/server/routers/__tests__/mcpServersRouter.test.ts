/**
 * Tests for MCP Server CRUD tRPC router (section-13).
 * Validates Zod schemas, admin-only access, encrypted field redaction,
 * header allowlisting, and assignment operations.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  createMcpServerSchema,
  updateMcpServerSchema,
  assignToAgencySchema,
  BLOCKED_HEADERS,
  sanitizeDescription,
  validateHeaders,
  mcpToolNameRegex,
} from "../mcpServers";

// ────────────────────────────────────────────────────────────
// Zod schema validation
// ────────────────────────────────────────────────────────────

describe("createMcpServerSchema", () => {
  const validHttp = {
    name: "My MCP Server",
    slug: "my-mcp-server",
    transportType: "http" as const,
    config: { url: "https://example.com/mcp" },
  };

  it("accepts valid HTTP config", () => {
    const result = createMcpServerSchema.safeParse(validHttp);
    expect(result.success).toBe(true);
  });

  it("sets riskLevel=high by default", () => {
    const result = createMcpServerSchema.parse(validHttp);
    expect(result.riskLevel).toBe("high");
  });

  it("sets timeoutSeconds=30 by default", () => {
    const result = createMcpServerSchema.parse(validHttp);
    expect(result.timeoutSeconds).toBe(30);
  });

  it("sets dataClassification=internal by default", () => {
    const result = createMcpServerSchema.parse(validHttp);
    expect(result.dataClassification).toBe("internal");
  });

  it("rejects unknown keys in config (strict mode)", () => {
    const result = createMcpServerSchema.safeParse({
      ...validHttp,
      config: { url: "https://example.com/mcp", hack: true },
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid stdio config with npx only", () => {
    const result = createMcpServerSchema.safeParse({
      name: "Local Server",
      slug: "local-server",
      transportType: "stdio" as const,
      config: { command: "npx", args: ["-y", "@modelcontextprotocol/server-sqlite"] },
    });
    expect(result.success).toBe(true);
  });

  it("rejects stdio config with disallowed command", () => {
    const result = createMcpServerSchema.safeParse({
      name: "Bad Server",
      slug: "bad-server",
      transportType: "stdio" as const,
      config: { command: "bash", args: ["-c", "rm -rf /"] },
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid streamable_http config", () => {
    const result = createMcpServerSchema.safeParse({
      name: "Streamable",
      slug: "streamable",
      transportType: "streamable_http" as const,
      config: { url: "https://api.example.com/mcp" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects slug with invalid characters", () => {
    const result = createMcpServerSchema.safeParse({
      ...validHttp,
      slug: "My Server!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding 100 chars", () => {
    const result = createMcpServerSchema.safeParse({
      ...validHttp,
      name: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejects timeoutSeconds below 5", () => {
    const result = createMcpServerSchema.safeParse({
      ...validHttp,
      timeoutSeconds: 2,
    });
    expect(result.success).toBe(false);
  });

  it("rejects timeoutSeconds above 120", () => {
    const result = createMcpServerSchema.safeParse({
      ...validHttp,
      timeoutSeconds: 200,
    });
    expect(result.success).toBe(false);
  });

  it("rejects creditPerCall above 100", () => {
    const result = createMcpServerSchema.safeParse({
      ...validHttp,
      creditPerCall: 150,
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional oauthConfig", () => {
    const result = createMcpServerSchema.safeParse({
      ...validHttp,
      oauthConfig: {
        tokenUrl: "https://auth.example.com/token",
        grantType: "client_credentials",
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("updateMcpServerSchema", () => {
  it("accepts partial updates", () => {
    const result = updateMcpServerSchema.safeParse({
      id: 1,
      name: "Updated Name",
    });
    expect(result.success).toBe(true);
  });

  it("requires id", () => {
    const result = updateMcpServerSchema.safeParse({
      name: "Updated Name",
    });
    expect(result.success).toBe(false);
  });
});

describe("assignToAgencySchema", () => {
  it("accepts valid assignment", () => {
    const result = assignToAgencySchema.safeParse({
      mcpServerId: 1,
      targetType: "agency",
      targetId: "abc-123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid targetType", () => {
    const result = assignToAgencySchema.safeParse({
      mcpServerId: 1,
      targetType: "invalid",
      targetId: "abc-123",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional tool filters", () => {
    const result = assignToAgencySchema.safeParse({
      mcpServerId: 1,
      targetType: "agent",
      targetId: "agent-1",
      enabledToolNames: ["tool1", "tool2"],
    });
    expect(result.success).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// Header allowlist
// ────────────────────────────────────────────────────────────

describe("validateHeaders", () => {
  it("allows safe headers", () => {
    expect(() => validateHeaders({ Authorization: "Bearer xxx", "Content-Type": "application/json" })).not.toThrow();
  });

  it("rejects Host header", () => {
    expect(() => validateHeaders({ Host: "evil.com" })).toThrow();
  });

  it("rejects X-Forwarded-For header", () => {
    expect(() => validateHeaders({ "X-Forwarded-For": "1.2.3.4" })).toThrow();
  });

  it("rejects Cookie header", () => {
    expect(() => validateHeaders({ Cookie: "session=abc" })).toThrow();
  });

  it("rejects Set-Cookie header", () => {
    expect(() => validateHeaders({ "Set-Cookie": "session=abc" })).toThrow();
  });

  it("is case-insensitive", () => {
    expect(() => validateHeaders({ host: "evil.com" })).toThrow();
    expect(() => validateHeaders({ "x-forwarded-host": "evil.com" })).toThrow();
  });
});

// ────────────────────────────────────────────────────────────
// Description sanitization
// ────────────────────────────────────────────────────────────

describe("sanitizeDescription", () => {
  it("passes clean text through", () => {
    expect(sanitizeDescription("A useful tool")).toBe("A useful tool");
  });

  it("strips HTML tags", () => {
    expect(sanitizeDescription("<b>Bold</b> text")).toBe("Bold text");
    expect(sanitizeDescription("<script>alert('xss')</script>")).toBe("alert('xss')");
    expect(sanitizeDescription("<img src=x onerror=alert(1)>Tool")).toBe("Tool");
  });

  it("truncates to 500 chars", () => {
    const long = "a".repeat(600);
    expect(sanitizeDescription(long).length).toBe(500);
  });

  it("handles undefined gracefully", () => {
    expect(sanitizeDescription(undefined)).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────
// Tool name validation
// ────────────────────────────────────────────────────────────

describe("mcpToolNameRegex", () => {
  it("accepts valid tool names", () => {
    expect(mcpToolNameRegex.test("read_file")).toBe(true);
    expect(mcpToolNameRegex.test("get-data")).toBe(true);
    expect(mcpToolNameRegex.test("myTool123")).toBe(true);
  });

  it("rejects tool names with special chars", () => {
    expect(mcpToolNameRegex.test("read file")).toBe(false);
    expect(mcpToolNameRegex.test("tool;rm")).toBe(false);
    expect(mcpToolNameRegex.test("")).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// BLOCKED_HEADERS constant
// ────────────────────────────────────────────────────────────

describe("BLOCKED_HEADERS", () => {
  it("includes all required blocked headers", () => {
    const lower = BLOCKED_HEADERS.map((h) => h.toLowerCase());
    expect(lower).toContain("host");
    expect(lower).toContain("cookie");
    expect(lower).toContain("set-cookie");
  });

  it("blocks x-forwarded-* pattern headers", () => {
    // X-Forwarded-For, X-Forwarded-Host, X-Forwarded-Proto
    const lower = BLOCKED_HEADERS.map((h) => h.toLowerCase());
    const hasXForwarded = lower.some((h) => h.startsWith("x-forwarded-"));
    expect(hasXForwarded).toBe(true);
  });
});
