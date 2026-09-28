import { describe, it, expect } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import type {
  HermesProviderConnection,
  InsertHermesProviderConnection,
} from "@db/schema";

describe("hermes_provider_connections schema", () => {
  it("defines the table with required camelCase columns", async () => {
    const schema = await import("@db/schema");
    expect(schema.hermesProviderConnections).toBeDefined();

    const table = schema.hermesProviderConnections;
    expect(getTableName(table)).toBe("hermes_provider_connections");

    const columns = getTableColumns(table);
    const expectedColumns = [
      "id",
      "tenantId",
      "ownerUserId",
      "scope",
      "providerType",
      "adapterType",
      "authenticationType",
      "status",
      "assignedWorkerId",
      "profileReference",
      "accountLabel",
      "accountHint",
      "entitlementStatus",
      "capabilitiesJson",
      "defaultForImage",
      "defaultForVideo",
      "dailyJobQuota",
      "metadataJson",
      "createdAt",
      "authorizedAt",
      "lastProbeAt",
      "disconnectedAt",
    ];
    for (const name of expectedColumns) {
      expect(columns).toHaveProperty(name);
    }

    const notNullColumns = [
      "tenantId",
      "ownerUserId",
      "scope",
      "providerType",
      "adapterType",
      "authenticationType",
      "status",
      "profileReference",
      "defaultForImage",
      "defaultForVideo",
      "createdAt",
    ] as const;
    for (const name of notNullColumns) {
      expect(columns[name].notNull).toBe(true);
    }

    const nullableColumns = [
      "assignedWorkerId",
      "accountLabel",
      "accountHint",
      "entitlementStatus",
      "dailyJobQuota",
      "authorizedAt",
      "lastProbeAt",
      "disconnectedAt",
    ] as const;
    for (const name of nullableColumns) {
      expect(columns[name].notNull).toBe(false);
    }

    // DB name check (camelCase family) — every column's literal DB name must
    // match its TS property name exactly (catches typos like "tenant_Id").
    for (const name of expectedColumns) {
      expect(columns[name as keyof typeof columns].name).toBe(name);
    }
  });

  it("exposes the scope and status pgEnums with exact value sets", async () => {
    const schema = await import("@db/schema");
    expect(schema.hermesConnectionScopeEnum.enumValues).toEqual([
      "server_shared",
      "server_personal",
      "private_worker",
    ]);
    expect(schema.hermesConnectionStatusEnum.enumValues).toEqual([
      "pending",
      "authorized",
      "reauth_required",
      "entitlement_restricted",
      "disconnected",
      "error",
    ]);
  });

  it("has NO secret-bearing columns (review-checklist guard)", async () => {
    const schema = await import("@db/schema");
    const columns = getTableColumns(schema.hermesProviderConnections);
    const columnNames = Object.keys(columns);

    const forbiddenPattern = /token|secret|password|cookie|credential|apikey|api_key/i;
    for (const name of columnNames) {
      expect(name).not.toMatch(forbiddenPattern);
    }

    // /auth/i needs an explicit allowlist — two legitimate metadata columns
    // ("authenticationType", "authorizedAt") contain "auth" but hold no
    // secret material.
    const authMatches = columnNames.filter((name) => /auth/i.test(name));
    expect(authMatches.sort()).toEqual(["authenticationType", "authorizedAt"].sort());

    expect(columnNames).not.toContain("authJson");
    expect(columnNames).not.toContain("auth_json");
    expect(columnNames).not.toContain("deviceCode");
  });

  it("declares the partial-unique default indexes and plain indexes", async () => {
    const schema = await import("@db/schema");
    const config = getTableConfig(schema.hermesProviderConnections);

    const uniqueIndexes = config.indexes.filter((idx) => idx.config.unique);
    const imageUnique = uniqueIndexes.find(
      (idx) => idx.config.name === "hermes_provider_connections_default_image_unique"
    );
    const videoUnique = uniqueIndexes.find(
      (idx) => idx.config.name === "hermes_provider_connections_default_video_unique"
    );
    expect(imageUnique).toBeDefined();
    expect(videoUnique).toBeDefined();
    expect(imageUnique!.config.unique).toBe(true);
    expect(videoUnique!.config.unique).toBe(true);

    expect(imageUnique!.config.where).toBeDefined();
    expect(videoUnique!.config.where).toBeDefined();

    const imageWhereSql = JSON.stringify(imageUnique!.config.where);
    const videoWhereSql = JSON.stringify(videoUnique!.config.where);
    expect(imageWhereSql).toMatch(/defaultForImage/);
    expect(imageWhereSql).toMatch(/authorized/);
    expect(imageWhereSql).toMatch(/reauth_required/);
    expect(imageWhereSql).toMatch(/entitlement_restricted/);
    expect(videoWhereSql).toMatch(/defaultForVideo/);
    expect(videoWhereSql).toMatch(/authorized/);
    expect(videoWhereSql).toMatch(/reauth_required/);
    expect(videoWhereSql).toMatch(/entitlement_restricted/);

    const indexNames = config.indexes.map((idx) => idx.config.name);
    expect(indexNames).toContain("hermes_provider_connections_tenant_owner_status_idx");
    expect(indexNames).toContain("hermes_provider_connections_tenant_scope_status_idx");

    // Column composition + order for the two plain composite indexes.
    const tenantOwnerStatusIdx = config.indexes.find(
      (idx) => idx.config.name === "hermes_provider_connections_tenant_owner_status_idx"
    );
    const tenantScopeStatusIdx = config.indexes.find(
      (idx) => idx.config.name === "hermes_provider_connections_tenant_scope_status_idx"
    );
    expect(tenantOwnerStatusIdx).toBeDefined();
    expect(tenantScopeStatusIdx).toBeDefined();

    const tenantOwnerStatusColumnNames = tenantOwnerStatusIdx!.config.columns.map(
      (col) => (col as { name: string }).name
    );
    const tenantScopeStatusColumnNames = tenantScopeStatusIdx!.config.columns.map(
      (col) => (col as { name: string }).name
    );
    expect(tenantOwnerStatusColumnNames).toEqual(["tenantId", "ownerUserId", "status"]);
    expect(tenantScopeStatusColumnNames).toEqual(["tenantId", "scope", "status"]);
  });

  it("exports select/insert types", () => {
    function acceptSelect(value: HermesProviderConnection): HermesProviderConnection {
      return value;
    }
    function acceptInsert(
      value: InsertHermesProviderConnection
    ): InsertHermesProviderConnection {
      return value;
    }
    expect(typeof acceptSelect).toBe("function");
    expect(typeof acceptInsert).toBe("function");
    expect(true).toBe(true);
  });
});
