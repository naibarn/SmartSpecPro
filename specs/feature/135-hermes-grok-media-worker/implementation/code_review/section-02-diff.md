diff --git a/apps/web/drizzle/manual_hermes_provider_connections.sql b/apps/web/drizzle/manual_hermes_provider_connections.sql
new file mode 100644
index 000000000..18c1d2172
--- /dev/null
+++ b/apps/web/drizzle/manual_hermes_provider_connections.sql
@@ -0,0 +1,94 @@
+-- Feature 135 (Hermes Grok media worker) — section-02-db-schema.
+-- New table `hermes_provider_connections` + two new enums. Purely additive:
+-- no existing table/column touched, so no data-loss risk and no backup of
+-- existing tables is required (Database Safety Protocol §Risk
+-- Classification: ADD TABLE is not in the risk table at all — it is the
+-- lowest-risk category, equivalent to "new object, zero blast radius").
+--
+-- Hand-authored from drizzle/schema.ts because `drizzle-kit generate` is
+-- blocked by the same pre-existing meta-journal collision (0146/0147)
+-- documented for the prior manual migrations in this directory (see
+-- manual_vertical_drama_series_watermark.sql and siblings). Verified via
+-- `npx drizzle-kit generate` failing with:
+--   "Error: [drizzle/meta/0146_snapshot.json, drizzle/meta/0147_snapshot.json]
+--    are pointing to a parent snapshot: drizzle/meta/0146_snapshot.json/snapshot.json
+--    which is a collision."
+-- This collision predates this change (git status shows drizzle/meta/* and
+-- drizzle/*.sql unmodified at HEAD) and is out of scope for section-02 to fix.
+--
+-- Not seeded into drizzle.__drizzle_migrations — following the established
+-- convention for this repo's manual_*.sql files (none of the 14 prior
+-- manual_*.sql migrations are hash-seeded either; they are applied directly
+-- via psql and tracked only by this file's presence + git history).
+--
+-- Idempotent + transactional, matching the manual_video_intelligence_tables.sql
+-- sibling convention: whole file wrapped in BEGIN;...COMMIT;, CREATE TABLE and
+-- all CREATE [UNIQUE] INDEX statements use IF NOT EXISTS, and both CREATE TYPE
+-- statements are guarded via DO $$ ... EXCEPTION WHEN duplicate_object THEN
+-- NULL; END $$; (Postgres has no CREATE TYPE IF NOT EXISTS). Safe to re-run.
+
+BEGIN;
+
+DO $$ BEGIN
+  CREATE TYPE "hermes_connection_scope" AS ENUM (
+    'server_shared',
+    'server_personal',
+    'private_worker'
+  );
+EXCEPTION
+  WHEN duplicate_object THEN NULL;
+END $$;
+
+DO $$ BEGIN
+  CREATE TYPE "hermes_connection_status" AS ENUM (
+    'pending',
+    'authorized',
+    'reauth_required',
+    'entitlement_restricted',
+    'disconnected',
+    'error'
+  );
+EXCEPTION
+  WHEN duplicate_object THEN NULL;
+END $$;
+
+CREATE TABLE IF NOT EXISTS "hermes_provider_connections" (
+  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
+  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
+  "ownerUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
+  "scope" "hermes_connection_scope" NOT NULL,
+  "providerType" varchar(64) NOT NULL DEFAULT 'xai_grok',
+  "adapterType" varchar(64) NOT NULL DEFAULT 'hermes_cli',
+  "authenticationType" varchar(64) NOT NULL DEFAULT 'oauth_device_code',
+  "status" "hermes_connection_status" NOT NULL DEFAULT 'pending',
+  "assignedWorkerId" varchar(36) REFERENCES "workers"("id") ON DELETE SET NULL,
+  "profileReference" varchar(255) NOT NULL,
+  "accountLabel" varchar(120),
+  "accountHint" varchar(120),
+  "entitlementStatus" varchar(64),
+  "capabilitiesJson" jsonb,
+  "defaultForImage" boolean NOT NULL DEFAULT false,
+  "defaultForVideo" boolean NOT NULL DEFAULT false,
+  "dailyJobQuota" integer,
+  "metadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
+  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
+  "authorizedAt" timestamp with time zone,
+  "lastProbeAt" timestamp with time zone,
+  "disconnectedAt" timestamp with time zone
+);
+
+CREATE INDEX IF NOT EXISTS "hermes_provider_connections_tenant_owner_status_idx"
+  ON "hermes_provider_connections" ("tenantId", "ownerUserId", "status");
+
+CREATE INDEX IF NOT EXISTS "hermes_provider_connections_tenant_scope_status_idx"
+  ON "hermes_provider_connections" ("tenantId", "scope", "status");
+
+CREATE UNIQUE INDEX IF NOT EXISTS "hermes_provider_connections_default_image_unique"
+  ON "hermes_provider_connections" ("tenantId", "ownerUserId")
+  WHERE "defaultForImage" = true AND "status" IN ('authorized', 'reauth_required', 'entitlement_restricted');
+
+CREATE UNIQUE INDEX IF NOT EXISTS "hermes_provider_connections_default_video_unique"
+  ON "hermes_provider_connections" ("tenantId", "ownerUserId")
+  WHERE "defaultForVideo" = true AND "status" IN ('authorized', 'reauth_required', 'entitlement_restricted');
+
+COMMIT;
diff --git a/apps/web/drizzle/schema.ts b/apps/web/drizzle/schema.ts
index c8c81f881..bb854abb1 100644
--- a/apps/web/drizzle/schema.ts
+++ b/apps/web/drizzle/schema.ts
@@ -36,6 +36,7 @@ import type {
   AutoTeamStageStatus,
   AutoTeamStageType,
 } from "../shared/autoTeamExecution";
+import type { HermesConnectionCapabilityManifest } from "../shared/hermesMedia";
 
 /**
  * pgvector custom column type for 1536-dimension embeddings (OpenAI text-embedding-3-small).
@@ -14077,6 +14078,99 @@ export const workerJobs = pgTable(
 export type WorkerJob = typeof workerJobs.$inferSelect;
 export type InsertWorkerJob = typeof workerJobs.$inferInsert;
 
+/**
+ * Feature 135 — Hermes Grok media worker connections (spec §10.1, §12.2).
+ * Records connection identity, scope, status, worker assignment, capability
+ * manifest, defaults, and quota metadata. NEVER stores a token or secret —
+ * tokens live only inside the Hermes CLI profile on the worker host.
+ */
+export const hermesConnectionScopeEnum = pgEnum("hermes_connection_scope", [
+  "server_shared",
+  "server_personal",
+  "private_worker",
+]);
+export const hermesConnectionStatusEnum = pgEnum("hermes_connection_status", [
+  "pending",
+  "authorized",
+  "reauth_required",
+  "entitlement_restricted",
+  "disconnected",
+  "error",
+]);
+
+export const hermesProviderConnections = pgTable(
+  "hermes_provider_connections",
+  {
+    id: varchar("id", { length: 36 })
+      .primaryKey()
+      .default(sql`gen_random_uuid()`),
+    tenantId: varchar("tenantId", { length: 36 })
+      .notNull()
+      .references(() => tenants.id, { onDelete: "cascade" }),
+    ownerUserId: integer("ownerUserId")
+      .notNull()
+      .references(() => users.id, { onDelete: "cascade" }),
+    scope: hermesConnectionScopeEnum("scope").notNull(),
+    providerType: varchar("providerType", { length: 64 })
+      .notNull()
+      .default("xai_grok"),
+    adapterType: varchar("adapterType", { length: 64 })
+      .notNull()
+      .default("hermes_cli"),
+    authenticationType: varchar("authenticationType", { length: 64 })
+      .notNull()
+      .default("oauth_device_code"),
+    status: hermesConnectionStatusEnum("status").notNull().default("pending"),
+    assignedWorkerId: varchar("assignedWorkerId", { length: 36 }).references(
+      () => workers.id,
+      { onDelete: "set null" }
+    ),
+    profileReference: varchar("profileReference", { length: 255 }).notNull(),
+    accountLabel: varchar("accountLabel", { length: 120 }),
+    accountHint: varchar("accountHint", { length: 120 }),
+    entitlementStatus: varchar("entitlementStatus", { length: 64 }),
+    capabilitiesJson: jsonb("capabilitiesJson").$type<HermesConnectionCapabilityManifest>(),
+    defaultForImage: boolean("defaultForImage").notNull().default(false),
+    defaultForVideo: boolean("defaultForVideo").notNull().default(false),
+    dailyJobQuota: integer("dailyJobQuota"),
+    metadataJson: jsonb("metadataJson")
+      .$type<Record<string, unknown>>()
+      .notNull()
+      .default({}),
+    createdAt: timestamp("createdAt", { withTimezone: true })
+      .notNull()
+      .defaultNow(),
+    authorizedAt: timestamp("authorizedAt", { withTimezone: true }),
+    lastProbeAt: timestamp("lastProbeAt", { withTimezone: true }),
+    disconnectedAt: timestamp("disconnectedAt", { withTimezone: true }),
+  },
+  t => [
+    index("hermes_provider_connections_tenant_owner_status_idx").on(
+      t.tenantId,
+      t.ownerUserId,
+      t.status
+    ),
+    index("hermes_provider_connections_tenant_scope_status_idx").on(
+      t.tenantId,
+      t.scope,
+      t.status
+    ),
+    uniqueIndex("hermes_provider_connections_default_image_unique")
+      .on(t.tenantId, t.ownerUserId)
+      .where(
+        sql`"defaultForImage" = true AND "status" IN ('authorized', 'reauth_required', 'entitlement_restricted')`
+      ),
+    uniqueIndex("hermes_provider_connections_default_video_unique")
+      .on(t.tenantId, t.ownerUserId)
+      .where(
+        sql`"defaultForVideo" = true AND "status" IN ('authorized', 'reauth_required', 'entitlement_restricted')`
+      ),
+  ]
+);
+
+export type HermesProviderConnection = typeof hermesProviderConnections.$inferSelect;
+export type InsertHermesProviderConnection = typeof hermesProviderConnections.$inferInsert;
+
 export const workerJobEvents = pgTable(
   "worker_job_events",
   {
@@ -20471,6 +20565,14 @@ export const verticalDramaCharacters = pgTable(
     characterKey: varchar("characterKey", { length: 64 }).notNull(),
     name: varchar("name", { length: 255 }).notNull(),
     role: varchar("role", { length: 100 }),
+    /** Canonical story role; legacy `role` remains the occupation/status compatibility field. */
+    narrativeRole: varchar("narrativeRole", { length: 32 }),
+    /** Detailed visual-design tier shared with the Character Visual Bible V2 contract. */
+    roleTier: varchar("roleTier", { length: 48 }),
+    occupation: varchar("occupation", { length: 160 }),
+    roleVisualIntent: jsonb("roleVisualIntent"),
+    roleProvenance: varchar("roleProvenance", { length: 24 }),
+    roleReviewStatus: varchar("roleReviewStatus", { length: 32 }),
     /** Full VerticalDramaCharacter payload (identityLock, wardrobeRules, currentState, ...). */
     data: jsonb("data"),
     /**
diff --git a/apps/web/server/__tests__/hermesProviderConnections.schema.test.ts b/apps/web/server/__tests__/hermesProviderConnections.schema.test.ts
new file mode 100644
index 000000000..5a0914d00
--- /dev/null
+++ b/apps/web/server/__tests__/hermesProviderConnections.schema.test.ts
@@ -0,0 +1,189 @@
+import { describe, it, expect } from "vitest";
+import { getTableColumns, getTableName } from "drizzle-orm";
+import { getTableConfig } from "drizzle-orm/pg-core";
+import type {
+  HermesProviderConnection,
+  InsertHermesProviderConnection,
+} from "@db/schema";
+
+describe("hermes_provider_connections schema", () => {
+  it("defines the table with required camelCase columns", async () => {
+    const schema = await import("@db/schema");
+    expect(schema.hermesProviderConnections).toBeDefined();
+
+    const table = schema.hermesProviderConnections;
+    expect(getTableName(table)).toBe("hermes_provider_connections");
+
+    const columns = getTableColumns(table);
+    const expectedColumns = [
+      "id",
+      "tenantId",
+      "ownerUserId",
+      "scope",
+      "providerType",
+      "adapterType",
+      "authenticationType",
+      "status",
+      "assignedWorkerId",
+      "profileReference",
+      "accountLabel",
+      "accountHint",
+      "entitlementStatus",
+      "capabilitiesJson",
+      "defaultForImage",
+      "defaultForVideo",
+      "dailyJobQuota",
+      "metadataJson",
+      "createdAt",
+      "authorizedAt",
+      "lastProbeAt",
+      "disconnectedAt",
+    ];
+    for (const name of expectedColumns) {
+      expect(columns).toHaveProperty(name);
+    }
+
+    const notNullColumns = [
+      "tenantId",
+      "ownerUserId",
+      "scope",
+      "providerType",
+      "adapterType",
+      "authenticationType",
+      "status",
+      "profileReference",
+      "defaultForImage",
+      "defaultForVideo",
+      "createdAt",
+    ] as const;
+    for (const name of notNullColumns) {
+      expect(columns[name].notNull).toBe(true);
+    }
+
+    const nullableColumns = [
+      "assignedWorkerId",
+      "accountLabel",
+      "accountHint",
+      "entitlementStatus",
+      "dailyJobQuota",
+      "authorizedAt",
+      "lastProbeAt",
+      "disconnectedAt",
+    ] as const;
+    for (const name of nullableColumns) {
+      expect(columns[name].notNull).toBe(false);
+    }
+
+    // DB name check (camelCase family) — every column's literal DB name must
+    // match its TS property name exactly (catches typos like "tenant_Id").
+    for (const name of expectedColumns) {
+      expect(columns[name as keyof typeof columns].name).toBe(name);
+    }
+  });
+
+  it("exposes the scope and status pgEnums with exact value sets", async () => {
+    const schema = await import("@db/schema");
+    expect(schema.hermesConnectionScopeEnum.enumValues).toEqual([
+      "server_shared",
+      "server_personal",
+      "private_worker",
+    ]);
+    expect(schema.hermesConnectionStatusEnum.enumValues).toEqual([
+      "pending",
+      "authorized",
+      "reauth_required",
+      "entitlement_restricted",
+      "disconnected",
+      "error",
+    ]);
+  });
+
+  it("has NO secret-bearing columns (review-checklist guard)", async () => {
+    const schema = await import("@db/schema");
+    const columns = getTableColumns(schema.hermesProviderConnections);
+    const columnNames = Object.keys(columns);
+
+    const forbiddenPattern = /token|secret|password|cookie|credential|apikey|api_key/i;
+    for (const name of columnNames) {
+      expect(name).not.toMatch(forbiddenPattern);
+    }
+
+    // /auth/i needs an explicit allowlist — two legitimate metadata columns
+    // ("authenticationType", "authorizedAt") contain "auth" but hold no
+    // secret material.
+    const authMatches = columnNames.filter((name) => /auth/i.test(name));
+    expect(authMatches.sort()).toEqual(["authenticationType", "authorizedAt"].sort());
+
+    expect(columnNames).not.toContain("authJson");
+    expect(columnNames).not.toContain("auth_json");
+    expect(columnNames).not.toContain("deviceCode");
+  });
+
+  it("declares the partial-unique default indexes and plain indexes", async () => {
+    const schema = await import("@db/schema");
+    const config = getTableConfig(schema.hermesProviderConnections);
+
+    const uniqueIndexes = config.indexes.filter((idx) => idx.config.unique);
+    const imageUnique = uniqueIndexes.find(
+      (idx) => idx.config.name === "hermes_provider_connections_default_image_unique"
+    );
+    const videoUnique = uniqueIndexes.find(
+      (idx) => idx.config.name === "hermes_provider_connections_default_video_unique"
+    );
+    expect(imageUnique).toBeDefined();
+    expect(videoUnique).toBeDefined();
+    expect(imageUnique!.config.unique).toBe(true);
+    expect(videoUnique!.config.unique).toBe(true);
+
+    expect(imageUnique!.config.where).toBeDefined();
+    expect(videoUnique!.config.where).toBeDefined();
+
+    const imageWhereSql = JSON.stringify(imageUnique!.config.where);
+    const videoWhereSql = JSON.stringify(videoUnique!.config.where);
+    expect(imageWhereSql).toMatch(/defaultForImage/);
+    expect(imageWhereSql).toMatch(/authorized/);
+    expect(imageWhereSql).toMatch(/reauth_required/);
+    expect(imageWhereSql).toMatch(/entitlement_restricted/);
+    expect(videoWhereSql).toMatch(/defaultForVideo/);
+    expect(videoWhereSql).toMatch(/authorized/);
+    expect(videoWhereSql).toMatch(/reauth_required/);
+    expect(videoWhereSql).toMatch(/entitlement_restricted/);
+
+    const indexNames = config.indexes.map((idx) => idx.config.name);
+    expect(indexNames).toContain("hermes_provider_connections_tenant_owner_status_idx");
+    expect(indexNames).toContain("hermes_provider_connections_tenant_scope_status_idx");
+
+    // Column composition + order for the two plain composite indexes.
+    const tenantOwnerStatusIdx = config.indexes.find(
+      (idx) => idx.config.name === "hermes_provider_connections_tenant_owner_status_idx"
+    );
+    const tenantScopeStatusIdx = config.indexes.find(
+      (idx) => idx.config.name === "hermes_provider_connections_tenant_scope_status_idx"
+    );
+    expect(tenantOwnerStatusIdx).toBeDefined();
+    expect(tenantScopeStatusIdx).toBeDefined();
+
+    const tenantOwnerStatusColumnNames = tenantOwnerStatusIdx!.config.columns.map(
+      (col) => (col as { name: string }).name
+    );
+    const tenantScopeStatusColumnNames = tenantScopeStatusIdx!.config.columns.map(
+      (col) => (col as { name: string }).name
+    );
+    expect(tenantOwnerStatusColumnNames).toEqual(["tenantId", "ownerUserId", "status"]);
+    expect(tenantScopeStatusColumnNames).toEqual(["tenantId", "scope", "status"]);
+  });
+
+  it("exports select/insert types", () => {
+    function acceptSelect(value: HermesProviderConnection): HermesProviderConnection {
+      return value;
+    }
+    function acceptInsert(
+      value: InsertHermesProviderConnection
+    ): InsertHermesProviderConnection {
+      return value;
+    }
+    expect(typeof acceptSelect).toBe("function");
+    expect(typeof acceptInsert).toBe("function");
+    expect(true).toBe(true);
+  });
+});
