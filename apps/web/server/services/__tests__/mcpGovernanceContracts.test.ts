import { describe, expect, it } from "vitest";

import {
  buildMcpExecutionJobDefinition,
  canExecuteMcpTool,
  canonicalizeMcpToolSchema,
  classifyMcpRisk,
  type McpGrant,
  type McpToolDescriptor,
} from "../mcpGovernanceContracts";

const tool: McpToolDescriptor = {
  connectionId: "conn-1",
  tenantId: "tenant-1",
  toolName: "calendar.create",
  inputSchema: { type: "object", properties: { title: { type: "string" } } },
  schemaRevision: "schema-1",
  risk: "high",
  mutatesExternalState: true,
};
const grant: McpGrant = {
  grantId: "grant-1",
  tenantId: "tenant-1",
  connectionId: "conn-1",
  toolName: "calendar.create",
  grantRevision: "schema-1",
  state: "active",
  requiresApproval: true,
};

describe("Feature 199 MCP governance contracts", () => {
  it("canonicalizes safe schemas and classifies mutating tools as high risk", () => {
    const first = canonicalizeMcpToolSchema({ b: 2, a: 1 });
    const second = canonicalizeMcpToolSchema({ a: 1, b: 2 });
    expect(first.schemaHash).toBe(second.schemaHash);
    expect(classifyMcpRisk(tool)).toBe("high");
    expect(() => canonicalizeMcpToolSchema({ apiKey: "secret" })).toThrowError(
      expect.objectContaining({ code: "MCP_GOVERNANCE_CONTRACT_INVALID" })
    );
  });

  it("rechecks grant revision and approval at effect time", () => {
    expect(() =>
      canExecuteMcpTool({
        connectionState: "active",
        tool,
        grant,
        approvedByCommand: false,
      })
    ).toThrowError(expect.objectContaining({ code: "MCP_APPROVAL_REQUIRED" }));
    expect(() =>
      canExecuteMcpTool({
        connectionState: "active",
        tool,
        grant: { ...grant, grantRevision: "old" },
        approvedByCommand: true,
      })
    ).toThrowError(expect.objectContaining({ code: "MCP_GRANT_STALE" }));
  });

  it("builds a durable canonical Job definition without provider credentials", () => {
    const definition = buildMcpExecutionJobDefinition({
      requestId: "req-1",
      tenantId: "tenant-1",
      actorId: 4,
      connectionId: "conn-1",
      toolName: "calendar.create",
      grantId: "grant-1",
      grantRevision: "schema-1",
      arguments: { title: "Review" },
      durable: true,
      approvedByCommand: true,
      tool,
      grant,
    });
    expect(definition).toMatchObject({
      jobType: "mcp.tool.execute",
      executionClass: "external",
      tenantId: "tenant-1",
    });
    expect(definition.input).not.toHaveProperty("accessToken");
  });
});
