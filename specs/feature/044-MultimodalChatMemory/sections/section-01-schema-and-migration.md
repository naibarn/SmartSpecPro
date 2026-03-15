I now have all the context needed. Let me generate the section content.

# Section 01 — Schema and Migration

## Overview

This section adds the foundational database tables for the Multimodal Chat Memory feature (Feature 044). It defines 6 new Drizzle `pgTable` declarations in `apps/web/drizzle/schema.ts`, enables the `pgvector` PostgreSQL extension, updates the `messages.attachments` TypeScript type to include an optional `assetId` field, and generates + applies the migration. All changes are purely additive -- no existing columns are modified or removed.

**This section blocks all other sections.** Every subsequent section depends on these table definitions.

---

## Files to Create or Modify

| File | Action |
|------|--------|
| `apps/web/drizzle/schema.ts` | Add 6 new table definitions + update attachments type |
| `apps/web/drizzle/schema.test.ts` | Add test blocks for all 6 new tables |
| `apps/web/drizzle/0080_multimodal_memory_foundation.sql` | Generated migration (via `pnpm db:push`) |

---

## Tests FIRST

Add the following test blocks to `apps/web/drizzle/schema.test.ts`. These follow the existing pattern in that file: import table exports, use `getTableColumns()` from `drizzle-orm`, and verify column presence, nullability, and defaults.

### Test stubs to add

```typescript
import {
  mediaAssets,
  mediaAssetAnalysis,
  multimodalMemoryItems,
  multimodalMemoryVectors,
  conversationVisualState,
  multimodalMemoryLinks,
  messages,
} from './schema';
```

**Test: `media_assets` table**

```typescript
describe('media_assets table schema', () => {
  // Test: has all required columns (id, tenantId, userId, projectId, conversationId,
  //   messageId, sourceType, status, storageKey, originalUrl, thumbnailUrl,
  //   mimeType, width, height, fileSize, checksumSha256, perceptualHash,
  //   createdAt, updatedAt)
  // Test: storageKey is not null
  // Test: mimeType is not null
  // Test: status defaults to 'pending'
  // Test: sourceType defaults to 'chat_attachment'
  // Test: userId is not null (FK to users)
  // Test: tenantId is not null
});
```

**Test: `media_asset_analysis` table**

```typescript
describe('media_asset_analysis table schema', () => {
  // Test: has all required columns (id, mediaAssetId, provider, model,
  //   shortCaption, detailedCaption, ocrText, objects, styles, materials,
  //   colors, rooms, architectureTags, aestheticScore, safetyLabels,
  //   extractedJson, createdAt)
  // Test: mediaAssetId is not null (FK to media_assets CASCADE)
});
```

**Test: `multimodal_memory_items` table**

```typescript
describe('multimodal_memory_items table schema', () => {
  // Test: has all required columns (id, tenantId, userId, projectId,
  //   conversationId, messageId, mediaAssetId, memoryKind, title, summary,
  //   searchableText, sourceRole, salience, confidence, lastAccessedAt,
  //   accessCount, createdAt, updatedAt)
  // Test: searchableText is not null
  // Test: salience defaults to '0.500'
  // Test: confidence defaults to '0.800'
  // Test: accessCount defaults to 0
});
```

**Test: `multimodal_memory_vectors` table**

```typescript
describe('multimodal_memory_vectors table schema', () => {
  // Test: has all required columns (id, memoryItemId, provider, model,
  //   modality, embedding, embeddingVersion, createdAt)
  // Test: memoryItemId is not null (FK CASCADE)
  // Test: provider is not null
});
```

**Test: `conversation_visual_state` table**

```typescript
describe('conversation_visual_state table schema', () => {
  // Test: has all required columns (conversationId, recentAssetIds,
  //   activeAssetIds, comparedAssetIds, namedSets, updatedAt)
  // Test: conversationId is the primary key (FK to conversations CASCADE)
});
```

**Test: `multimodal_memory_links` table**

```typescript
describe('multimodal_memory_links table schema', () => {
  // Test: has all required columns (id, fromMemoryItemId, toMemoryItemId,
  //   relationType, weight, createdAt)
  // Test: fromMemoryItemId is not null
  // Test: toMemoryItemId is not null
  // Test: weight defaults to '1.000'
});
```

**Test: attachments backward compatibility**

```typescript
describe('messages.attachments assetId extension', () => {
  // Test: attachments column is defined (type annotation updated, no DB change)
  // Test: attachments without assetId still works (backward compatible type union)
});
```

---

## Implementation Details

### 1. pgvector Extension Prerequisite

Before the migration can run, the `vector` extension must be enabled on PostgreSQL. This must happen via a raw SQL statement either in the migration file header or run manually beforehand:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Drizzle does not manage extensions natively. The implementer should either prepend this to the generated migration SQL file or run it as a pre-migration step.

### 2. Custom Column Type for `vector(768)`

Drizzle ORM does not have a built-in `vector` column type. Define a custom column type at the top of `schema.ts` (or in a shared utility) using Drizzle's `customType` from `drizzle-orm/pg-core`:

```typescript
import { customType } from "drizzle-orm/pg-core";

const vector = customType<{ data: number[]; driverParam: string }>({
  dataType() {
    return "vector(768)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    // PostgreSQL returns "[0.1,0.2,...]"
    return JSON.parse(value);
  },
});
```

This custom type must be added to the existing import block at the top of `schema.ts` -- add `customType` to the `drizzle-orm/pg-core` import.

### 3. Table Definitions

Add these 6 table definitions at the end of `apps/web/drizzle/schema.ts`, before the final export types. The naming convention follows the existing codebase (camelCase columns, `pgTable` with string table name).

#### 3.1 `media_assets`

Canonical registry for all uploaded images.

**Columns**: `id` (bigserial PK), `tenantId` (varchar 36, not null), `userId` (int, not null, FK users), `projectId` (varchar 100), `conversationId` (int, FK conversations), `messageId` (int, FK messages), `sourceType` (varchar 32, default `'chat_attachment'`), `status` (varchar 32, default `'pending'`; values: `pending`, `analyzing`, `analyzed`, `failed`, `nsfw_blocked`), `storageKey` (text, not null), `originalUrl` (text), `thumbnailUrl` (text), `mimeType` (varchar 100, not null), `width` (int), `height` (int), `fileSize` (bigint), `checksumSha256` (varchar 64), `perceptualHash` (varchar 128), `createdAt` (timestamptz, defaultNow), `updatedAt` (timestamptz, defaultNow).

**Indexes**: `(userId)`, `(conversationId)`, `(tenantId, projectId)`, `(checksumSha256)` for dedup lookups.

**Foreign keys**: `userId` references `users.id` with `onDelete: "cascade"`. `conversationId` references `conversations.id` with `onDelete: "set null"`. `messageId` references `messages.id` with `onDelete: "set null"`.

Export types: `MediaAsset` (select) and `InsertMediaAsset` (insert).

#### 3.2 `media_asset_analysis`

Vision enrichment results from Gemini Flash analysis.

**Columns**: `id` (bigserial PK), `mediaAssetId` (bigint, not null, FK media_assets CASCADE), `provider` (varchar 64), `model` (varchar 128), `shortCaption` (text), `detailedCaption` (text), `ocrText` (text), `objects` (jsonb), `styles` (jsonb), `materials` (jsonb), `colors` (jsonb), `rooms` (jsonb), `architectureTags` (jsonb), `aestheticScore` (numeric precision 4, scale 3), `safetyLabels` (jsonb), `extractedJson` (jsonb), `createdAt` (timestamptz, defaultNow).

**Indexes**: `(mediaAssetId)`.

**Foreign key**: `mediaAssetId` references `mediaAssets.id` with `onDelete: "cascade"`.

Export types: `MediaAssetAnalysis` and `InsertMediaAssetAnalysis`.

#### 3.3 `multimodal_memory_items`

Retrievable memory entries bridging images and text.

**Columns**: `id` (bigserial PK), `tenantId` (varchar 36), `userId` (int, FK users), `projectId` (varchar 100), `conversationId` (int, FK conversations), `messageId` (int), `mediaAssetId` (bigint, FK media_assets CASCADE), `memoryKind` (varchar 32; values: `'image'`, `'text'`, `'image_text'`, `'group'`), `title` (text), `summary` (text), `searchableText` (text, not null), `sourceRole` (varchar 16), `salience` (numeric, default `'0.500'`), `confidence` (numeric, default `'0.800'`), `lastAccessedAt` (timestamptz), `accessCount` (int, default 0), `createdAt` (timestamptz, defaultNow), `updatedAt` (timestamptz, defaultNow).

**Indexes**: `(userId, projectId)`, `(conversationId)`, `(mediaAssetId)`.

**Foreign keys**: `userId` references `users.id` with `onDelete: "cascade"`. `conversationId` references `conversations.id` with `onDelete: "set null"`. `mediaAssetId` references `mediaAssets.id` with `onDelete: "cascade"`.

Export types: `MultimodalMemoryItem` and `InsertMultimodalMemoryItem`.

#### 3.4 `multimodal_memory_vectors`

pgvector embeddings for multimodal retrieval.

**Columns**: `id` (bigserial PK), `memoryItemId` (bigint, not null, FK multimodal_memory_items CASCADE), `provider` (varchar 64, not null), `model` (varchar 128), `modality` (varchar 16; values: `'image'`, `'text'`, `'fused'`), `embedding` (vector(768) -- uses the custom column type), `embeddingVersion` (varchar 32), `createdAt` (timestamptz, defaultNow).

**Indexes**: `(memoryItemId)`.

**Important**: The HNSW index on the `embedding` column should NOT be created in this initial migration. Per the plan, it should be created **after** the backfill data load (section 12) to avoid table lock during bulk insert. Add a SQL comment in the migration indicating where the HNSW index will be created later:

```sql
-- HNSW index on embedding: CREATE INDEX CONCURRENTLY after backfill
-- CREATE INDEX multimodal_memory_vectors_embedding_idx
--   ON multimodal_memory_vectors USING hnsw (embedding vector_cosine_ops)
--   WITH (m = 16, ef_construction = 128);
```

**Foreign key**: `memoryItemId` references `multimodalMemoryItems.id` with `onDelete: "cascade"`.

Export types: `MultimodalMemoryVector` and `InsertMultimodalMemoryVector`.

#### 3.5 `conversation_visual_state`

Per-conversation working set for image tracking.

**Columns**: `conversationId` (int, PK, FK conversations CASCADE), `recentAssetIds` (jsonb, default `[]`), `activeAssetIds` (jsonb, default `[]`), `comparedAssetIds` (jsonb, default `[]`), `namedSets` (jsonb, default `{}`), `updatedAt` (timestamptz, defaultNow).

**No additional indexes** -- the PK on conversationId is sufficient.

**Foreign key**: `conversationId` references `conversations.id` with `onDelete: "cascade"`.

Export types: `ConversationVisualState` and `InsertConversationVisualState`.

#### 3.6 `multimodal_memory_links`

Relationships between memory items.

**Columns**: `id` (bigserial PK), `fromMemoryItemId` (bigint, not null, FK multimodal_memory_items CASCADE), `toMemoryItemId` (bigint, not null, FK multimodal_memory_items CASCADE), `relationType` (varchar 32; values: `'same_topic'`, `'derived_from'`, `'generated_from'`, `'comparison_set'`), `weight` (numeric, default `'1.000'`), `createdAt` (timestamptz, defaultNow).

**Indexes**: `(fromMemoryItemId)`, `(toMemoryItemId)`.

**Foreign keys**: Both `fromMemoryItemId` and `toMemoryItemId` reference `multimodalMemoryItems.id` with `onDelete: "cascade"`.

Export types: `MultimodalMemoryLink` and `InsertMultimodalMemoryLink`.

### 4. Attachments Type Update

Update the `messages.attachments` column type annotation in `schema.ts` to include the optional `assetId` field. This is a TypeScript-only change -- no database column is added.

Current type at line 1391:

```typescript
attachments: json("attachments").$type<Array<{
  type: "image" | "file" | "audio" | "video";
  url: string;
  key?: string;
  name?: string;
  size?: number;
  mimeType?: string;
  thumbnail?: string;
}>>().default([]),
```

Updated type (add `assetId?` field):

```typescript
attachments: json("attachments").$type<Array<{
  type: "image" | "file" | "audio" | "video";
  url: string;
  key?: string;
  name?: string;
  size?: number;
  mimeType?: string;
  thumbnail?: string;
  assetId?: number;
}>>().default([]),
```

This is backward compatible -- existing rows without `assetId` continue to work since the field is optional.

### 5. Migration Generation and Execution

After adding all table definitions to `schema.ts`:

1. Run `cd apps/web && pnpm db:push` which executes `drizzle-kit generate && drizzle-kit migrate`
2. The generated migration SQL file will contain all `CREATE TABLE` statements
3. **Manually prepend** `CREATE EXTENSION IF NOT EXISTS vector;` to the generated migration file if Drizzle does not handle it
4. Verify the migration applied successfully
5. Verify all 6 new tables exist with correct column counts

### 6. Naming Conventions

Follow the existing codebase conventions observed in `schema.ts`:
- Table names: snake_case strings (`"media_assets"`, `"media_asset_analysis"`)
- Column names in Drizzle: camelCase JS identifiers mapping to camelCase DB column names (this matches the existing pattern where `userId` maps to `"userId"` column)
- Index names: descriptive snake_case (`"media_assets_user_idx"`, `"media_assets_checksum_idx"`)
- Type exports: PascalCase (`MediaAsset`, `InsertMediaAsset`)

---

## Dependencies

- **None** -- this is the foundation section with no dependencies on other sections.

## Downstream Dependents

All subsequent sections depend on this one:
- Section 02 (mediaAssetService) reads/writes `media_assets`
- Section 03 (vision pipeline) writes `media_asset_analysis`, `multimodal_memory_items`, `multimodal_memory_vectors`
- Section 04 (embedding provider) writes to `multimodal_memory_vectors`
- Section 05 (visual state) reads/writes `conversation_visual_state`
- Section 06 (retrieval) queries across all tables
- Section 10 (deletion) cascades through `media_assets` and related tables
- Section 12 (backfill) creates the deferred HNSW index on `multimodal_memory_vectors.embedding`