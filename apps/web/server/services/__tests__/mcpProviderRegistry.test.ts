import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

import {
  mcpConnectionGroupShares,
  mcpConnectionUsageEvents,
  mcpProviderTemplates,
  mcpMediaTasks,
  mcpSharedVideoApprovals,
  mcpToolSchemaCache,
  userMcpConnections,
} from "../../../drizzle/schema";
import {
  buildMcpProviderTemplateInsert,
  getMcpProviderTemplateSeed,
  MCP_PROVIDER_TEMPLATE_SEEDS,
} from "../mcpProviderRegistry";

const drizzleDir = path.resolve(import.meta.dirname, "../../../drizzle");
const migrationPath = path.join(drizzleDir, "0201_mcp_connect_foundation.sql");
const taskMigrationPath = path.join(drizzleDir, "0202_mcp_media_task_persistence.sql");
const magnificResolutionMigrationPath = path.join(drizzleDir, "0203_magnific_mcp_resolution_fix.sql");
const journalPath = path.join(drizzleDir, "meta/_journal.json");

describe("MCP provider registry seeds", () => {
  it("defines Magnific and Higgsfield as approved provider templates", () => {
    expect(MCP_PROVIDER_TEMPLATE_SEEDS).toHaveLength(2);
    expect(getMcpProviderTemplateSeed("magnific")).toMatchObject({
      mcpUrl: "https://mcp.magnific.com",
      authType: "oauth",
      allowedAssetTypes: ["image", "video"],
      isEnabled: true,
    });
    expect(getMcpProviderTemplateSeed("higgsfield")).toMatchObject({
      mcpUrl: "https://mcp.higgsfield.ai/mcp",
      authType: "oauth",
      allowedAssetTypes: ["image", "video"],
      isEnabled: true,
    });
  });

  it("builds insert rows without mutating seed constants", () => {
    const [magnific] = MCP_PROVIDER_TEMPLATE_SEEDS;
    const insert = buildMcpProviderTemplateInsert(magnific);

    expect(insert.providerKey).toBe("magnific");
    expect(insert.expectedToolHints).toEqual(magnific.expectedToolHints);
    expect(insert.allowedAssetTypes).toEqual(["image", "video"]);
    expect(insert.allowedAssetTypes).not.toBe(magnific.allowedAssetTypes);
  });
});

describe("MCP Connect Drizzle schema", () => {
  it("declares all MCP foundation tables", () => {
    expect(getTableName(mcpProviderTemplates)).toBe("mcp_provider_templates");
    expect(getTableName(userMcpConnections)).toBe("user_mcp_connections");
    expect(getTableName(mcpConnectionGroupShares)).toBe("mcp_connection_group_shares");
    expect(getTableName(mcpToolSchemaCache)).toBe("mcp_tool_schema_cache");
    expect(getTableName(mcpConnectionUsageEvents)).toBe("mcp_connection_usage_events");
    expect(getTableName(mcpSharedVideoApprovals)).toBe("mcp_shared_video_approvals");
  });

  it("includes encrypted session metadata and default constraints on connections", () => {
    const columns = getTableColumns(userMcpConnections);
    expect(columns.encryptedTokenRef).toBeDefined();
    expect(columns.encryptionKeyVersion).toBeDefined();
    expect(columns.defaultForImage).toBeDefined();
    expect(columns.defaultForVideo).toBeDefined();

    const config = getTableConfig(userMcpConnections);
    const indexNames = config.indexes.map((index) => index.config.name);
    expect(indexNames).toContain("user_mcp_connections_tenant_owner_status_idx");
    expect(indexNames).toContain("user_mcp_connections_tenant_provider_status_idx");
    expect(indexNames).toContain("user_mcp_connections_provider_account_hash_idx");
    expect(indexNames).toContain("user_mcp_connections_token_expires_at_idx");
    expect(indexNames).toContain("user_mcp_connections_default_image_unique");
    expect(indexNames).toContain("user_mcp_connections_default_video_unique");
  });

  it("uses integer groupId for shares and preserves audit lookup indexes", () => {
    const shareColumns = getTableColumns(mcpConnectionGroupShares);
    expect(shareColumns.groupId).toBeDefined();
    expect(shareColumns.deletedAt).toBeDefined();

    const usageConfig = getTableConfig(mcpConnectionUsageEvents);
    const usageIndexNames = usageConfig.indexes.map((index) => index.config.name);
    expect(usageIndexNames).toContain("mcp_connection_usage_events_connection_date_idx");
    expect(usageIndexNames).toContain("mcp_connection_usage_events_owner_date_idx");
    expect(usageIndexNames).toContain("mcp_connection_usage_events_actor_date_idx");
    expect(usageIndexNames).toContain("mcp_connection_usage_events_group_date_idx");
    expect(usageIndexNames).toContain("mcp_connection_usage_events_media_task_idx");
  });

  it("declares one-time shared video approval consumption index", () => {
    const config = getTableConfig(mcpSharedVideoApprovals);
    const indexNames = config.indexes.map((index) => index.config.name);
    expect(indexNames).toContain("mcp_shared_video_approvals_pending_expiry_idx");
    expect(indexNames).toContain("mcp_shared_video_approvals_consumed_task_unique");
  });
});

describe("MCP Connect migration", () => {
  it("is registered in the drizzle journal", () => {
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const latest = journal.entries[journal.entries.length - 1];
    expect(latest).toMatchObject({
      idx: 189,
      tag: "0203_magnific_mcp_resolution_fix",
    });
    expect(journal.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ idx: 187, tag: "0201_mcp_connect_foundation" }),
        expect.objectContaining({ idx: 188, tag: "0202_mcp_media_task_persistence" }),
      ]),
    );
  });

  it("creates all MCP tables and critical indexes", () => {
    const migration = fs.readFileSync(migrationPath, "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "mcp_provider_templates"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "user_mcp_connections"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "mcp_connection_group_shares"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "mcp_tool_schema_cache"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "mcp_connection_usage_events"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "mcp_shared_video_approvals"');
    expect(migration).toContain('"encryption_key_version" varchar(64)');
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "mcp_provider_templates_provider_key_unique"');
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "mcp_connection_group_shares_active_unique"');
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "mcp_shared_video_approvals_consumed_task_unique"');
  });

  it("documents flag rollback instead of destructive production rollback", () => {
    const migration = fs.readFileSync(migrationPath, "utf8");
    expect(migration).toContain("feature-flag rollback");
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migration).not.toMatch(/\bDROP\s+COLUMN\b/i);
  });

  it("persists MCP media tasks with idempotency indexes", () => {
    expect(getTableName(mcpMediaTasks)).toBe("mcp_media_tasks");
    const columns = getTableColumns(mcpMediaTasks);
    expect(columns).toHaveProperty("id");
    expect(columns).toHaveProperty("tenantId");
    expect(columns).toHaveProperty("userId");
    expect(columns).toHaveProperty("idempotencyKey");
    expect(columns).toHaveProperty("parameters");
    expect(columns).toHaveProperty("resultData");

    const migration = fs.readFileSync(taskMigrationPath, "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "mcp_media_tasks"');
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "mcp_media_tasks_idempotency_unique"');
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migration).not.toMatch(/\bDROP\s+COLUMN\b/i);
  });

  it("migrates Magnific MCP image models away from unsupported 1K resolution", () => {
    const migration = fs.readFileSync(magnificResolutionMigrationPath, "utf8");
    expect(migration).toContain("Unsupported resolution: 1K");
    expect(migration).toContain("'[\"2K\",\"4K\"]'::jsonb");
    expect(migration).toContain("'\"2K\"'::jsonb");
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migration).not.toMatch(/\bDROP\s+COLUMN\b/i);
  });
});
