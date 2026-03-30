/**
 * Tests for MCP Server Registry schema definitions.
 * Verifies Drizzle schema matches the section-12 spec requirements.
 */

import { describe, it, expect } from "vitest";
import {
  mcpServers,
  mcpServerAssignments,
} from "../../../drizzle/schema";

describe("mcpServers schema", () => {
  it("has all required columns", () => {
    const cols = mcpServers;
    // Core columns
    expect(cols.id).toBeDefined();
    expect(cols.tenantId).toBeDefined();
    expect(cols.name).toBeDefined();
    expect(cols.slug).toBeDefined();
    expect(cols.description).toBeDefined();
    expect(cols.transportType).toBeDefined();
    expect(cols.enabled).toBeDefined();
    expect(cols.config).toBeDefined();

    // OAuth encrypted columns (dedicated, not JSONB)
    expect(cols.oauthClientId).toBeDefined();
    expect(cols.oauthClientSecretEncrypted).toBeDefined();
    expect(cols.oauthAccessTokenEncrypted).toBeDefined();
    expect(cols.oauthRefreshTokenEncrypted).toBeDefined();
    expect(cols.oauthTokenExpiresAt).toBeDefined();
    expect(cols.oauthConfig).toBeDefined();

    // MCP configuration
    expect(cols.capabilities).toBeDefined();
    expect(cols.toolNamePrefix).toBeDefined();
    expect(cols.maxToolsExposed).toBeDefined();
    expect(cols.timeoutSeconds).toBeDefined();
    expect(cols.endpointPath).toBeDefined();

    // Security & governance
    expect(cols.riskLevel).toBeDefined();
    expect(cols.dataClassification).toBeDefined();
    expect(cols.configHash).toBeDefined();
    expect(cols.approvedAt).toBeDefined();
    expect(cols.approvedBy).toBeDefined();

    // Billing & health
    expect(cols.creditPerCall).toBeDefined();
    expect(cols.lastHealthCheck).toBeDefined();
    expect(cols.healthStatus).toBeDefined();

    // Timestamps
    expect(cols.createdAt).toBeDefined();
    expect(cols.updatedAt).toBeDefined();
    expect(cols.createdBy).toBeDefined();
  });

  it("tenantId is NOT NULL", () => {
    const col = mcpServers.tenantId;
    expect(col.notNull).toBe(true);
  });

  it("riskLevel defaults to high", () => {
    const col = mcpServers.riskLevel;
    expect(col.hasDefault).toBe(true);
    expect(col.default).toBe("high");
  });

  it("enabled defaults to true", () => {
    const col = mcpServers.enabled;
    expect(col.hasDefault).toBe(true);
    expect(col.default).toBe(true);
  });

  it("transportType defaults to http", () => {
    const col = mcpServers.transportType;
    expect(col.hasDefault).toBe(true);
    expect(col.default).toBe("http");
  });
});

describe("mcpServerAssignments schema", () => {
  it("has all required columns", () => {
    const cols = mcpServerAssignments;
    expect(cols.id).toBeDefined();
    expect(cols.mcpServerId).toBeDefined();
    expect(cols.targetType).toBeDefined();
    expect(cols.targetId).toBeDefined();
    expect(cols.enabledToolNames).toBeDefined();
    expect(cols.disabledToolNames).toBeDefined();
    expect(cols.createdAt).toBeDefined();
    expect(cols.updatedAt).toBeDefined();
  });

  it("mcpServerId is NOT NULL", () => {
    const col = mcpServerAssignments.mcpServerId;
    expect(col.notNull).toBe(true);
  });

  it("targetType is NOT NULL", () => {
    const col = mcpServerAssignments.targetType;
    expect(col.notNull).toBe(true);
  });

  it("targetId is NOT NULL", () => {
    const col = mcpServerAssignments.targetId;
    expect(col.notNull).toBe(true);
  });
});
