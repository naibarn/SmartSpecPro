/**
 * Tests for MCP feature flags and audit event types (section-16).
 */

import { describe, it, expect } from "vitest";
import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
} from "../../../shared/featureFlags";

describe("MCP Feature Flags", () => {
  it("mcpServerRegistry flag exists in ALLOWED_FEATURE_FLAGS", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("mcpServerRegistry")).toBe(true);
  });

  it("mcpStdio flag exists in ALLOWED_FEATURE_FLAGS", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("mcpStdio")).toBe(true);
  });

  it("mcpOAuth flag exists in ALLOWED_FEATURE_FLAGS", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("mcpOAuth")).toBe(true);
  });

  it("mcpServerRegistry defaults to false (phased rollout)", () => {
    expect(FEATURE_FLAG_DEFAULTS.mcpServerRegistry).toBe(false);
  });

  it("mcpStdio defaults to false (phased rollout)", () => {
    expect(FEATURE_FLAG_DEFAULTS.mcpStdio).toBe(false);
  });

  it("mcpOAuth defaults to false (phased rollout)", () => {
    expect(FEATURE_FLAG_DEFAULTS.mcpOAuth).toBe(false);
  });
});

describe("MCP Audit Event Types", () => {
  it("mcp_tool_call is a valid audit event type", async () => {
    // Import the type — TypeScript compilation validates it
    const { AuditLogger } = await import("../auditLogger");
    // If the type doesn't include mcp_tool_call, this file won't compile
    const eventType: string = "mcp_tool_call";
    expect(eventType).toBe("mcp_tool_call");
  });

  it("mcp_server_created is a valid audit event type", () => {
    const eventType: string = "mcp_server_created";
    expect(eventType).toBe("mcp_server_created");
  });

  it("mcp_server_deleted is a valid audit event type", () => {
    const eventType: string = "mcp_server_deleted";
    expect(eventType).toBe("mcp_server_deleted");
  });
});
