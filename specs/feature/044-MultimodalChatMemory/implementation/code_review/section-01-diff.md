diff --git a/apps/web/drizzle/schema.test.ts b/apps/web/drizzle/schema.test.ts
index 9344e589..68c3b833 100644
--- a/apps/web/drizzle/schema.test.ts
+++ b/apps/web/drizzle/schema.test.ts
@@ -340,3 +340,224 @@ describe('agency_conversations table schema', () => {
     expect(columns.updatedAt).toBeDefined();
   });
 });
+
+// ==========================================
+// Section 044: Multimodal Chat Memory Schema Tests
+// ==========================================
+
+import {
+  mediaAssets,
+  mediaAssetAnalysis,
+  multimodalMemoryItems,
+  multimodalMemoryVectors,
+  conversationVisualState,
+  multimodalMemoryLinks,
+  messages,
+} from './schema';
+
+describe('media_assets table schema', () => {
+  test('has all required columns', () => {
+    const cols = getTableColumns(mediaAssets);
+    expect(cols.id).toBeDefined();
+    expect(cols.tenantId).toBeDefined();
+    expect(cols.userId).toBeDefined();
+    expect(cols.projectId).toBeDefined();
+    expect(cols.conversationId).toBeDefined();
+    expect(cols.messageId).toBeDefined();
+    expect(cols.sourceType).toBeDefined();
+    expect(cols.status).toBeDefined();
+    expect(cols.storageKey).toBeDefined();
+    expect(cols.originalUrl).toBeDefined();
+    expect(cols.thumbnailUrl).toBeDefined();
+    expect(cols.mimeType).toBeDefined();
+    expect(cols.width).toBeDefined();
+    expect(cols.height).toBeDefined();
+    expect(cols.fileSize).toBeDefined();
+    expect(cols.checksumSha256).toBeDefined();
+    expect(cols.perceptualHash).toBeDefined();
+    expect(cols.createdAt).toBeDefined();
+    expect(cols.updatedAt).toBeDefined();
+  });
+
+  test('storageKey is not null', () => {
+    const cols = getTableColumns(mediaAssets);
+    expect(cols.storageKey.notNull).toBe(true);
+  });
+
+  test('mimeType is not null', () => {
+    const cols = getTableColumns(mediaAssets);
+    expect(cols.mimeType.notNull).toBe(true);
+  });
+
+  test('status defaults to "pending"', () => {
+    const cols = getTableColumns(mediaAssets);
+    expect(cols.status.default).toBe('pending');
+  });
+
+  test('sourceType defaults to "chat_attachment"', () => {
+    const cols = getTableColumns(mediaAssets);
+    expect(cols.sourceType.default).toBe('chat_attachment');
+  });
+
+  test('userId is not null', () => {
+    const cols = getTableColumns(mediaAssets);
+    expect(cols.userId.notNull).toBe(true);
+  });
+
+  test('tenantId is not null', () => {
+    const cols = getTableColumns(mediaAssets);
+    expect(cols.tenantId.notNull).toBe(true);
+  });
+});
+
+describe('media_asset_analysis table schema', () => {
+  test('has all required columns', () => {
+    const cols = getTableColumns(mediaAssetAnalysis);
+    expect(cols.id).toBeDefined();
+    expect(cols.mediaAssetId).toBeDefined();
+    expect(cols.provider).toBeDefined();
+    expect(cols.model).toBeDefined();
+    expect(cols.shortCaption).toBeDefined();
+    expect(cols.detailedCaption).toBeDefined();
+    expect(cols.ocrText).toBeDefined();
+    expect(cols.objects).toBeDefined();
+    expect(cols.styles).toBeDefined();
+    expect(cols.materials).toBeDefined();
+    expect(cols.colors).toBeDefined();
+    expect(cols.rooms).toBeDefined();
+    expect(cols.architectureTags).toBeDefined();
+    expect(cols.aestheticScore).toBeDefined();
+    expect(cols.safetyLabels).toBeDefined();
+    expect(cols.extractedJson).toBeDefined();
+    expect(cols.createdAt).toBeDefined();
+  });
+
+  test('mediaAssetId is not null', () => {
+    const cols = getTableColumns(mediaAssetAnalysis);
+    expect(cols.mediaAssetId.notNull).toBe(true);
+  });
+});
+
+describe('multimodal_memory_items table schema', () => {
+  test('has all required columns', () => {
+    const cols = getTableColumns(multimodalMemoryItems);
+    expect(cols.id).toBeDefined();
+    expect(cols.tenantId).toBeDefined();
+    expect(cols.userId).toBeDefined();
+    expect(cols.projectId).toBeDefined();
+    expect(cols.conversationId).toBeDefined();
+    expect(cols.messageId).toBeDefined();
+    expect(cols.mediaAssetId).toBeDefined();
+    expect(cols.memoryKind).toBeDefined();
+    expect(cols.title).toBeDefined();
+    expect(cols.summary).toBeDefined();
+    expect(cols.searchableText).toBeDefined();
+    expect(cols.sourceRole).toBeDefined();
+    expect(cols.salience).toBeDefined();
+    expect(cols.confidence).toBeDefined();
+    expect(cols.lastAccessedAt).toBeDefined();
+    expect(cols.accessCount).toBeDefined();
+    expect(cols.createdAt).toBeDefined();
+    expect(cols.updatedAt).toBeDefined();
+  });
+
+  test('searchableText is not null', () => {
+    const cols = getTableColumns(multimodalMemoryItems);
+    expect(cols.searchableText.notNull).toBe(true);
+  });
+
+  test('salience defaults to "0.500"', () => {
+    const cols = getTableColumns(multimodalMemoryItems);
+    expect(cols.salience.default).toBe('0.500');
+  });
+
+  test('confidence defaults to "0.800"', () => {
+    const cols = getTableColumns(multimodalMemoryItems);
+    expect(cols.confidence.default).toBe('0.800');
+  });
+
+  test('accessCount defaults to 0', () => {
+    const cols = getTableColumns(multimodalMemoryItems);
+    expect(cols.accessCount.default).toBe(0);
+  });
+});
+
+describe('multimodal_memory_vectors table schema', () => {
+  test('has all required columns', () => {
+    const cols = getTableColumns(multimodalMemoryVectors);
+    expect(cols.id).toBeDefined();
+    expect(cols.memoryItemId).toBeDefined();
+    expect(cols.provider).toBeDefined();
+    expect(cols.model).toBeDefined();
+    expect(cols.modality).toBeDefined();
+    expect(cols.embedding).toBeDefined();
+    expect(cols.embeddingVersion).toBeDefined();
+    expect(cols.createdAt).toBeDefined();
+  });
+
+  test('memoryItemId is not null', () => {
+    const cols = getTableColumns(multimodalMemoryVectors);
+    expect(cols.memoryItemId.notNull).toBe(true);
+  });
+
+  test('provider is not null', () => {
+    const cols = getTableColumns(multimodalMemoryVectors);
+    expect(cols.provider.notNull).toBe(true);
+  });
+});
+
+describe('conversation_visual_state table schema', () => {
+  test('has all required columns', () => {
+    const cols = getTableColumns(conversationVisualState);
+    expect(cols.conversationId).toBeDefined();
+    expect(cols.recentAssetIds).toBeDefined();
+    expect(cols.activeAssetIds).toBeDefined();
+    expect(cols.comparedAssetIds).toBeDefined();
+    expect(cols.namedSets).toBeDefined();
+    expect(cols.updatedAt).toBeDefined();
+  });
+
+  test('conversationId is the primary key', () => {
+    const cols = getTableColumns(conversationVisualState);
+    expect(cols.conversationId.notNull).toBe(true);
+  });
+});
+
+describe('multimodal_memory_links table schema', () => {
+  test('has all required columns', () => {
+    const cols = getTableColumns(multimodalMemoryLinks);
+    expect(cols.id).toBeDefined();
+    expect(cols.fromMemoryItemId).toBeDefined();
+    expect(cols.toMemoryItemId).toBeDefined();
+    expect(cols.relationType).toBeDefined();
+    expect(cols.weight).toBeDefined();
+    expect(cols.createdAt).toBeDefined();
+  });
+
+  test('fromMemoryItemId is not null', () => {
+    const cols = getTableColumns(multimodalMemoryLinks);
+    expect(cols.fromMemoryItemId.notNull).toBe(true);
+  });
+
+  test('toMemoryItemId is not null', () => {
+    const cols = getTableColumns(multimodalMemoryLinks);
+    expect(cols.toMemoryItemId.notNull).toBe(true);
+  });
+
+  test('weight defaults to "1.000"', () => {
+    const cols = getTableColumns(multimodalMemoryLinks);
+    expect(cols.weight.default).toBe('1.000');
+  });
+});
+
+describe('messages.attachments assetId extension', () => {
+  test('attachments column is defined', () => {
+    const cols = getTableColumns(messages);
+    expect(cols.attachments).toBeDefined();
+  });
+
+  test('attachments column is nullable (backward compatible)', () => {
+    const cols = getTableColumns(messages);
+    expect(cols.attachments.notNull).toBeFalsy();
+  });
+});
diff --git a/apps/web/drizzle/schema.ts b/apps/web/drizzle/schema.ts
index e635293e..52027376 100644
--- a/apps/web/drizzle/schema.ts
+++ b/apps/web/drizzle/schema.ts
@@ -1,4 +1,4 @@
-import { integer, pgEnum, pgTable, text, timestamp, varchar, json, jsonb, boolean, numeric, serial, uniqueIndex, index, foreignKey, bigint, bigserial, check, type AnyPgColumn } from "drizzle-orm/pg-core";
+import { integer, pgEnum, pgTable, text, timestamp, varchar, json, jsonb, boolean, numeric, serial, uniqueIndex, index, foreignKey, bigint, bigserial, check, type AnyPgColumn, customType } from "drizzle-orm/pg-core";
 import { sql } from "drizzle-orm";
 
 /**
@@ -1396,6 +1396,7 @@ export const messages = pgTable("messages", {
     size?: number;
     mimeType?: string;
     thumbnail?: string;
+    assetId?: number;
   }>>().default([]),
 
   /** Artifacts extracted from response (code, markdown, media) */
@@ -5581,3 +5582,170 @@ export const automationJobs = pgTable("automation_jobs", {
 
 export type AutomationJob = typeof automationJobs.$inferSelect;
 export type InsertAutomationJob = typeof automationJobs.$inferInsert;
+
+// =============================================================================
+// Feature 044: Multimodal Chat Memory
+// =============================================================================
+
+/**
+ * pgvector custom column type for 768-dimension embeddings (Gemini text-embedding-004).
+ */
+const vector = customType<{ data: number[]; driverParam: string }>({
+  dataType() {
+    return "vector(768)";
+  },
+  toDriver(value: number[]): string {
+    return `[${value.join(",")}]`;
+  },
+  fromDriver(value: string): number[] {
+    return JSON.parse(value);
+  },
+});
+
+/**
+ * media_assets — canonical registry for all uploaded images (and other media) tied to chat messages.
+ */
+export const mediaAssets = pgTable("media_assets", {
+  id: bigserial("id", { mode: "number" }).primaryKey(),
+  tenantId: varchar("tenantId", { length: 36 }).notNull(),
+  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
+  projectId: varchar("projectId", { length: 100 }),
+  conversationId: integer("conversationId").references(() => conversations.id, { onDelete: "set null" }),
+  messageId: integer("messageId").references(() => messages.id, { onDelete: "set null" }),
+  sourceType: varchar("sourceType", { length: 32 }).default("chat_attachment"),
+  status: varchar("status", { length: 32 }).default("pending"),
+  storageKey: text("storageKey").notNull(),
+  originalUrl: text("originalUrl"),
+  thumbnailUrl: text("thumbnailUrl"),
+  mimeType: varchar("mimeType", { length: 100 }).notNull(),
+  width: integer("width"),
+  height: integer("height"),
+  fileSize: bigint("fileSize", { mode: "number" }),
+  checksumSha256: varchar("checksumSha256", { length: 64 }),
+  perceptualHash: varchar("perceptualHash", { length: 128 }),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
+  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
+}, (t) => [
+  index("media_assets_user_idx").on(t.userId),
+  index("media_assets_conversation_idx").on(t.conversationId),
+  index("media_assets_tenant_project_idx").on(t.tenantId, t.projectId),
+  index("media_assets_checksum_idx").on(t.checksumSha256),
+]);
+
+export type MediaAsset = typeof mediaAssets.$inferSelect;
+export type InsertMediaAsset = typeof mediaAssets.$inferInsert;
+
+/**
+ * media_asset_analysis — vision enrichment results from Gemini Flash structured output.
+ */
+export const mediaAssetAnalysis = pgTable("media_asset_analysis", {
+  id: bigserial("id", { mode: "number" }).primaryKey(),
+  mediaAssetId: bigint("mediaAssetId", { mode: "number" }).notNull().references(() => mediaAssets.id, { onDelete: "cascade" }),
+  provider: varchar("provider", { length: 64 }),
+  model: varchar("model", { length: 128 }),
+  shortCaption: text("shortCaption"),
+  detailedCaption: text("detailedCaption"),
+  ocrText: text("ocrText"),
+  objects: jsonb("objects"),
+  styles: jsonb("styles"),
+  materials: jsonb("materials"),
+  colors: jsonb("colors"),
+  rooms: jsonb("rooms"),
+  architectureTags: jsonb("architectureTags"),
+  aestheticScore: numeric("aestheticScore", { precision: 4, scale: 3 }),
+  safetyLabels: jsonb("safetyLabels"),
+  extractedJson: jsonb("extractedJson"),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
+}, (t) => [
+  index("media_asset_analysis_asset_idx").on(t.mediaAssetId),
+]);
+
+export type MediaAssetAnalysis = typeof mediaAssetAnalysis.$inferSelect;
+export type InsertMediaAssetAnalysis = typeof mediaAssetAnalysis.$inferInsert;
+
+/**
+ * multimodal_memory_items — retrievable memory entries bridging images and text.
+ */
+export const multimodalMemoryItems = pgTable("multimodal_memory_items", {
+  id: bigserial("id", { mode: "number" }).primaryKey(),
+  tenantId: varchar("tenantId", { length: 36 }),
+  userId: integer("userId").references(() => users.id, { onDelete: "cascade" }),
+  projectId: varchar("projectId", { length: 100 }),
+  conversationId: integer("conversationId").references(() => conversations.id, { onDelete: "set null" }),
+  messageId: integer("messageId"),
+  mediaAssetId: bigint("mediaAssetId", { mode: "number" }).references(() => mediaAssets.id, { onDelete: "cascade" }),
+  memoryKind: varchar("memoryKind", { length: 32 }),
+  title: text("title"),
+  summary: text("summary"),
+  searchableText: text("searchableText").notNull(),
+  sourceRole: varchar("sourceRole", { length: 16 }),
+  salience: numeric("salience").default("0.500"),
+  confidence: numeric("confidence").default("0.800"),
+  lastAccessedAt: timestamp("lastAccessedAt", { withTimezone: true }),
+  accessCount: integer("accessCount").default(0),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
+  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
+}, (t) => [
+  index("multimodal_memory_items_user_project_idx").on(t.userId, t.projectId),
+  index("multimodal_memory_items_conversation_idx").on(t.conversationId),
+  index("multimodal_memory_items_asset_idx").on(t.mediaAssetId),
+]);
+
+export type MultimodalMemoryItem = typeof multimodalMemoryItems.$inferSelect;
+export type InsertMultimodalMemoryItem = typeof multimodalMemoryItems.$inferInsert;
+
+/**
+ * multimodal_memory_vectors — pgvector embeddings for multimodal retrieval.
+ * HNSW index on embedding: CREATE INDEX CONCURRENTLY after backfill
+ * CREATE INDEX multimodal_memory_vectors_embedding_idx
+ *   ON multimodal_memory_vectors USING hnsw (embedding vector_cosine_ops)
+ *   WITH (m = 16, ef_construction = 128);
+ */
+export const multimodalMemoryVectors = pgTable("multimodal_memory_vectors", {
+  id: bigserial("id", { mode: "number" }).primaryKey(),
+  memoryItemId: bigint("memoryItemId", { mode: "number" }).notNull().references(() => multimodalMemoryItems.id, { onDelete: "cascade" }),
+  provider: varchar("provider", { length: 64 }).notNull(),
+  model: varchar("model", { length: 128 }),
+  modality: varchar("modality", { length: 16 }),
+  embedding: vector("embedding"),
+  embeddingVersion: varchar("embeddingVersion", { length: 32 }),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
+}, (t) => [
+  index("multimodal_memory_vectors_item_idx").on(t.memoryItemId),
+]);
+
+export type MultimodalMemoryVector = typeof multimodalMemoryVectors.$inferSelect;
+export type InsertMultimodalMemoryVector = typeof multimodalMemoryVectors.$inferInsert;
+
+/**
+ * conversation_visual_state — per-conversation working set tracking which images are active/recent.
+ */
+export const conversationVisualState = pgTable("conversation_visual_state", {
+  conversationId: integer("conversationId").primaryKey().references(() => conversations.id, { onDelete: "cascade" }),
+  recentAssetIds: jsonb("recentAssetIds").default([]),
+  activeAssetIds: jsonb("activeAssetIds").default([]),
+  comparedAssetIds: jsonb("comparedAssetIds").default([]),
+  namedSets: jsonb("namedSets").default({}),
+  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
+});
+
+export type ConversationVisualState = typeof conversationVisualState.$inferSelect;
+export type InsertConversationVisualState = typeof conversationVisualState.$inferInsert;
+
+/**
+ * multimodal_memory_links — directed relationships between memory items.
+ */
+export const multimodalMemoryLinks = pgTable("multimodal_memory_links", {
+  id: bigserial("id", { mode: "number" }).primaryKey(),
+  fromMemoryItemId: bigint("fromMemoryItemId", { mode: "number" }).notNull().references(() => multimodalMemoryItems.id, { onDelete: "cascade" }),
+  toMemoryItemId: bigint("toMemoryItemId", { mode: "number" }).notNull().references(() => multimodalMemoryItems.id, { onDelete: "cascade" }),
+  relationType: varchar("relationType", { length: 32 }),
+  weight: numeric("weight").default("1.000"),
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
+}, (t) => [
+  index("multimodal_memory_links_from_idx").on(t.fromMemoryItemId),
+  index("multimodal_memory_links_to_idx").on(t.toMemoryItemId),
+]);
+
+export type MultimodalMemoryLink = typeof multimodalMemoryLinks.$inferSelect;
+export type InsertMultimodalMemoryLink = typeof multimodalMemoryLinks.$inferInsert;
