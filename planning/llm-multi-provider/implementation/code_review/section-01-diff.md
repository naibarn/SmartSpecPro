diff --git a/apps/web/drizzle/schema.ts b/apps/web/drizzle/schema.ts
index c35597a..bf1c40e 100644
--- a/apps/web/drizzle/schema.ts
+++ b/apps/web/drizzle/schema.ts
@@ -1,4 +1,4 @@
-import { integer, pgEnum, pgTable, text, timestamp, varchar, json, boolean, numeric, serial, uniqueIndex } from "drizzle-orm/pg-core";
+import { integer, pgEnum, pgTable, text, timestamp, varchar, json, boolean, numeric, serial, uniqueIndex, index } from "drizzle-orm/pg-core";
 
 /**
  * Enums
@@ -327,6 +327,21 @@ export const llmProviders = pgTable("llm_providers", {
   /** Sort order for display */
   sortOrder: integer("sortOrder").default(0).notNull(),
 
+  /** Provider classification: 'primary', 'secondary', 'fallback' */
+  providerType: varchar("providerType", { length: 32 }).default("primary").notNull(),
+
+  /** Health status managed by circuit breaker, persisted for dashboard and startup seeding */
+  healthStatus: varchar("healthStatus", { length: 32 }).default("healthy").notNull(),
+
+  /** Last time health was evaluated */
+  lastHealthCheck: timestamp("lastHealthCheck", { withTimezone: true }),
+
+  /** Rolling failure count */
+  failureCount: integer("failureCount").default(0).notNull(),
+
+  /** Rolling success count */
+  successCount: integer("successCount").default(0).notNull(),
+
   createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
   updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
 });
@@ -334,6 +349,112 @@ export const llmProviders = pgTable("llm_providers", {
 export type LlmProvider = typeof llmProviders.$inferSelect;
 export type InsertLlmProvider = typeof llmProviders.$inferInsert;
 
+/**
+ * Model-to-provider mapping
+ * Maps which providers offer which models, replacing the availableModels JSON approach
+ */
+export const modelProviderMap = pgTable("model_provider_map", {
+  id: serial("id").primaryKey(),
+
+  /** Canonical model identifier used internally by frontend/routing */
+  modelId: varchar("modelId", { length: 128 }).notNull(),
+
+  /** Foreign key to llm_providers */
+  providerId: integer("providerId").notNull().references(() => llmProviders.id),
+
+  /** Human-readable display name */
+  modelName: varchar("modelName", { length: 128 }).notNull(),
+
+  /** Provider-specific model string sent in API requests */
+  providerModelId: varchar("providerModelId", { length: 256 }).notNull(),
+
+  /** Cost per 1M input tokens (0 for free) */
+  pricingInput: numeric("pricingInput", { precision: 12, scale: 8 }).default("0").notNull(),
+
+  /** Cost per 1M output tokens (0 for free) */
+  pricingOutput: numeric("pricingOutput", { precision: 12, scale: 8 }).default("0").notNull(),
+
+  /** Whether this model is free to use */
+  isFree: boolean("isFree").default(false).notNull(),
+
+  /** Maximum context window size */
+  contextLength: integer("contextLength"),
+
+  /** Whether this mapping is active */
+  isEnabled: boolean("isEnabled").default(true).notNull(),
+
+  /** Lower = higher priority within this provider */
+  priority: integer("priority").default(0).notNull(),
+}, (t) => [
+  uniqueIndex("model_provider_map_unique").on(t.modelId, t.providerId),
+]);
+
+export type ModelProviderMap = typeof modelProviderMap.$inferSelect;
+export type InsertModelProviderMap = typeof modelProviderMap.$inferInsert;
+
+/**
+ * Provider usage log
+ * Per-request tracking for dashboards and cost reconciliation
+ */
+export const providerUsageLog = pgTable("provider_usage_log", {
+  id: serial("id").primaryKey(),
+
+  userId: integer("userId").notNull().references(() => users.id),
+  providerId: integer("providerId").notNull().references(() => llmProviders.id),
+  modelUsed: varchar("modelUsed", { length: 128 }).notNull(),
+  inputTokens: integer("inputTokens").default(0).notNull(),
+  outputTokens: integer("outputTokens").default(0).notNull(),
+
+  /** Provider-reported or calculated cost */
+  costUsd: numeric("costUsd", { precision: 12, scale: 8 }).default("0").notNull(),
+
+  creditsCharged: integer("creditsCharged").default(0).notNull(),
+  responseTimeMs: integer("responseTimeMs"),
+  statusCode: integer("statusCode"),
+
+  /** Error classification: 'rate_limit', 'timeout', 'server_error' */
+  errorType: varchar("errorType", { length: 64 }),
+
+  wasFallback: boolean("wasFallback").default(false).notNull(),
+  fallbackFromProviderId: integer("fallbackFromProviderId").references(() => llmProviders.id),
+
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+}, (t) => [
+  index("provider_usage_log_user_created").on(t.userId, t.createdAt),
+  index("provider_usage_log_provider_created").on(t.providerId, t.createdAt),
+]);
+
+export type ProviderUsageLog = typeof providerUsageLog.$inferSelect;
+export type InsertProviderUsageLog = typeof providerUsageLog.$inferInsert;
+
+/**
+ * Routing rules
+ * Admin-configured routing preferences per model pattern
+ */
+export const routingRules = pgTable("routing_rules", {
+  id: serial("id").primaryKey(),
+
+  /** Glob-style pattern: "*", "kimi-*", or exact model ID */
+  modelPattern: varchar("modelPattern", { length: 128 }).notNull(),
+
+  /** Routing strategy: 'cost', 'quality', 'priority' */
+  routingMode: varchar("routingMode", { length: 32 }).notNull(),
+
+  /** Array of provider IDs for priority mode */
+  providerOrder: json("providerOrder").$type<number[]>(),
+
+  /** Maximum fallback attempts */
+  maxFallbacks: integer("maxFallbacks").default(3).notNull(),
+
+  /** Whether this rule is active */
+  isActive: boolean("isActive").default(true).notNull(),
+
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+});
+
+export type RoutingRule = typeof routingRules.$inferSelect;
+export type InsertRoutingRule = typeof routingRules.$inferInsert;
+
 /**
  * Tenants table - White Label Multi-Tenant System
  * Each tenant represents a separate branded instance with its own domain
diff --git a/apps/web/server/schema.test.ts b/apps/web/server/schema.test.ts
new file mode 100644
index 0000000..9f3a133
--- /dev/null
+++ b/apps/web/server/schema.test.ts
@@ -0,0 +1,76 @@
+import { describe, it, expect } from "vitest";
+import {
+  llmProviders,
+  modelProviderMap,
+  providerUsageLog,
+  routingRules,
+} from "../drizzle/schema";
+
+describe("llmProviders extended columns", () => {
+  it("has providerType column", () => {
+    expect(llmProviders.providerType).toBeDefined();
+  });
+
+  it("has healthStatus column", () => {
+    expect(llmProviders.healthStatus).toBeDefined();
+  });
+
+  it("has lastHealthCheck column", () => {
+    expect(llmProviders.lastHealthCheck).toBeDefined();
+  });
+
+  it("has failureCount column", () => {
+    expect(llmProviders.failureCount).toBeDefined();
+  });
+
+  it("has successCount column", () => {
+    expect(llmProviders.successCount).toBeDefined();
+  });
+});
+
+describe("modelProviderMap table", () => {
+  it("has expected columns", () => {
+    expect(modelProviderMap.id).toBeDefined();
+    expect(modelProviderMap.modelId).toBeDefined();
+    expect(modelProviderMap.providerId).toBeDefined();
+    expect(modelProviderMap.providerModelId).toBeDefined();
+    expect(modelProviderMap.modelName).toBeDefined();
+    expect(modelProviderMap.pricingInput).toBeDefined();
+    expect(modelProviderMap.pricingOutput).toBeDefined();
+    expect(modelProviderMap.isFree).toBeDefined();
+    expect(modelProviderMap.contextLength).toBeDefined();
+    expect(modelProviderMap.isEnabled).toBeDefined();
+    expect(modelProviderMap.priority).toBeDefined();
+  });
+});
+
+describe("providerUsageLog table", () => {
+  it("has expected columns", () => {
+    expect(providerUsageLog.id).toBeDefined();
+    expect(providerUsageLog.userId).toBeDefined();
+    expect(providerUsageLog.providerId).toBeDefined();
+    expect(providerUsageLog.modelUsed).toBeDefined();
+    expect(providerUsageLog.inputTokens).toBeDefined();
+    expect(providerUsageLog.outputTokens).toBeDefined();
+    expect(providerUsageLog.costUsd).toBeDefined();
+    expect(providerUsageLog.creditsCharged).toBeDefined();
+    expect(providerUsageLog.responseTimeMs).toBeDefined();
+    expect(providerUsageLog.statusCode).toBeDefined();
+    expect(providerUsageLog.errorType).toBeDefined();
+    expect(providerUsageLog.wasFallback).toBeDefined();
+    expect(providerUsageLog.fallbackFromProviderId).toBeDefined();
+    expect(providerUsageLog.createdAt).toBeDefined();
+  });
+});
+
+describe("routingRules table", () => {
+  it("has expected columns", () => {
+    expect(routingRules.id).toBeDefined();
+    expect(routingRules.modelPattern).toBeDefined();
+    expect(routingRules.routingMode).toBeDefined();
+    expect(routingRules.providerOrder).toBeDefined();
+    expect(routingRules.maxFallbacks).toBeDefined();
+    expect(routingRules.isActive).toBeDefined();
+    expect(routingRules.createdAt).toBeDefined();
+  });
+});
