# Section 03: Scoped Memory — Schema, Service, and Hybrid Retrieval

## Overview

Implements the scoped memory subsystem: two new tables (`scoped_memories`, `memory_promotions`), pgvector extension for vector search, and a service layer for CRUD + hybrid retrieval (keyword + vector). This is the memory backbone for all agents, teams, rooms, and runs.

**Depends on:** Section 01 (tenants table referenced by tenantId)
**Blocks:** Sections 06 (prompt composer), 08 (summary), 15 (Python memory)

**Files to create/modify:**
- `apps/web/drizzle/schema.ts` — add enums, tables
- `apps/web/server/services/scopedMemoryService.ts` — CRUD + hybrid retrieval
- `apps/web/server/services/__tests__/scopedMemoryService.test.ts` — tests

---

## Tests (Write First)

### Test 1: Scope isolation
- Agent A's private memories NOT readable by agent B
- Team-scoped memories readable by all team members

### Test 2: Promotion audit
- `promoteMemory()` changes ownerType + creates `memory_promotions` record

### Test 3: Embedding column
- Accepts 1536-dim vector array and null

### Test 4: createMemory defaults
- `ownerType=agent` → visibility defaults to `private`

### Test 5: Multi-scope retrieval
- Results from agent/run/room/team scopes returned in correct priority order

### Test 6: Hybrid retrieval
- Combines keyword score + vector similarity
- Falls back to keyword-only when embedding is null

### Test 7: Access control
- Agent A cannot read agent B's private memories via `searchMemories`

```typescript
// apps/web/server/services/__tests__/scopedMemoryService.test.ts
import { describe, it, expect } from "vitest";

describe("scopedMemoryService", () => {
  describe("scope isolation", () => {
    it("agent private memories not readable by other agents");
    it("team-scoped memories readable by all team members");
  });
  describe("memory promotion", () => {
    it("promoteMemory changes ownerType and creates audit record");
  });
  describe("embedding column", () => {
    it("accepts 1536-dim vector and null");
  });
  describe("createMemory", () => {
    it("ownerType=agent defaults visibility to private");
  });
  describe("searchMemories", () => {
    it("returns results from multiple scopes in priority order");
    it("hybrid retrieval combines keyword + vector scores");
    it("works when embedding is null (keyword-only fallback)");
  });
  describe("access control", () => {
    it("agent A cannot read agent B's private memories");
  });
});
```

---

## Schema

### New Enums

```typescript
export const memoryOwnerTypeEnum = pgEnum("memory_owner_type", [
  "user", "agent", "team", "room", "project", "run",
]);
export const memoryKindEnum = pgEnum("memory_kind", [
  "fact", "rule", "preference", "decision", "note",
  "checklist", "artifact_note", "handoff_note", "episode",
]);
export const memoryVisibilityEnum = pgEnum("memory_visibility", [
  "private", "shared_team", "shared_room", "shared_project",
]);
export const memorySourceTypeEnum = pgEnum("memory_source_type", [
  "auto", "manual", "promoted",
]);
```

### Custom vector type (1536 dimensions)

```typescript
const vector1536 = customType<{ data: number[]; driverParam: string }>({
  dataType() { return "vector(1536)"; },
  toDriver(value: number[]): string { return `[${value.join(",")}]`; },
  fromDriver(value: string): number[] { return JSON.parse(value); },
});
```

### Table: `scoped_memories`

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | UUID via crypto.randomUUID() |
| tenantId | varchar(36) NOT NULL | Tenant isolation |
| ownerType | memoryOwnerTypeEnum NOT NULL | user/agent/team/room/project/run |
| ownerId | text NOT NULL | ID of the owner entity |
| memoryKind | memoryKindEnum NOT NULL | |
| visibility | memoryVisibilityEnum NOT NULL | default "private" |
| sourceType | memorySourceTypeEnum NOT NULL | default "auto" |
| sourceUserId | integer nullable | |
| sourceAssistantId | text nullable | |
| sourceRoomId | text nullable | |
| projectId | varchar(100) nullable | |
| title | text NOT NULL | |
| content | text NOT NULL | |
| summary | text nullable | |
| tags | text[] | |
| metadataJson | jsonb nullable | |
| embedding | vector(1536) nullable | null = keyword-only retrieval |
| confidence | numeric(3,2) | default 0.80 |
| importance | integer | default 5 |
| reinforcementCount | integer | default 0 |
| lastAccessedAt | timestamptz nullable | |
| expiresAt | timestamptz nullable | |
| createdAt, updatedAt | timestamptz NOT NULL | |

**Indexes:** `(ownerType, ownerId, createdAt)`, `(tenantId, memoryKind)`, GIN on tags, HNSW on embedding.

### Table: `memory_promotions`

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | UUID |
| memoryId | text FK → scoped_memories (CASCADE) | |
| fromOwnerType, fromOwnerId | enum/text | Original scope |
| toOwnerType, toOwnerId | enum/text | New scope |
| promotedByUserId | integer nullable | |
| promotedByAssistantId | text nullable | |
| reason | text nullable | |
| createdAt | timestamptz | |

### Migration: Raw SQL for indexes

```sql
CREATE INDEX IF NOT EXISTS scoped_memories_tags_gin_idx
  ON scoped_memories USING gin (tags);
CREATE INDEX IF NOT EXISTS scoped_memories_embedding_hnsw_idx
  ON scoped_memories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

---

## Service: `scopedMemoryService.ts`

### Types

```typescript
export interface MemoryScope {
  type: "user" | "agent" | "team" | "room" | "project" | "run";
  id: string;
}
export interface SearchOptions {
  scopes: MemoryScope[];
  query: string;
  topK?: number;          // default 20
  keywordWeight?: number; // default 0.4
  vectorWeight?: number;  // default 0.6
  embedding?: number[];   // pre-computed 1536-dim; omit for keyword-only
}
export interface MemorySearchResult {
  memory: ScopedMemory;
  score: number;
  matchType: "keyword" | "vector" | "hybrid";
}
```

### Key Functions

**`createMemory(input)`** — If ownerType=agent and no visibility provided, default to "private". Insert into scoped_memories.

**`searchMemories(options)`** — Hybrid retrieval:
1. Scope filter: WHERE (ownerType, ownerId) IN scopes + visibility check
2. Keyword: `ts_rank(to_tsvector('english', content || ' ' || title), plainto_tsquery(query))` × importance × recency_factor
3. Vector (if embedding provided): cosine similarity, skip null embeddings
4. Merge: `keywordWeight × keywordScore + vectorWeight × vectorScore`
5. Deduplicate across scopes (prefer more specific: agent > run > room > team > project > user)
6. Sort by combined score, return top K

Recency factor: `1.0 / (1.0 + days_since_update × 0.1)`

**`promoteMemory(memoryId, toOwnerType, toOwnerId, reason, promotedBy)`** — In transaction: insert memory_promotions, update scoped_memories ownerType/ownerId/sourceType.

**`retrieveForPrompt(assistantId, runId, query, tokenBudget, embedding?)`** — Convenience wrapper for prompt composition (Section 06). Retrieves in priority order: agent → run → room → team → project → user.

**`updateMemory(memoryId, updates)`**, **`deleteMemory(memoryId)`**, **`getMemory(memoryId)`** — Standard CRUD.

### Visibility Rules

| visibility | Who can read |
|---|---|
| private | Only exact owner (ownerType + ownerId match) |
| shared_team | Any agent/user in same team |
| shared_room | Any participant in same room |
| shared_project | Any user/agent on same project |

---

## pgvector Notes

- Extension already available (Feature 044 uses vector(768))
- This section uses vector(1536) for OpenAI text-embedding-3-small
- HNSW params: m=16, ef_construction=64 — good for up to ~1M records
- Embeddings generated async by Python backend (Section 15); until then, null embedding = keyword-only

## Downstream Consumers

- Section 06: `retrieveForPrompt()` for agent prompt injection
- Section 08: May write summary memories
- Section 10: Exposes via tRPC
- Section 15: Python embedding service writes vectors back

## Implementation Notes (Actual)

**Migration:** `drizzle/0086_supreme_speedball.sql` — 4 enums, 2 tables. Embedding column defined in schema.ts but created WITHOUT it in DB because pgvector shared library (`$libdir/vector`) is missing from the Docker container. The embedding column + HNSW index need to be added when pgvector is properly reinstalled.

**Files created/modified:**
- `apps/web/drizzle/schema.ts` — 4 enums, vector1536 custom type, scoped_memories + memory_promotions tables
- `apps/web/server/services/scopedMemoryService.ts` — full service: CRUD, promoteMemory, searchMemories (hybrid), retrieveForPrompt
- `apps/web/server/services/__tests__/scopedMemoryService.test.ts` — 15 tests (all passing)

**Deviations:**
- pgvector shared library missing from Docker — embedding column deferred. Service handles null embeddings gracefully (keyword-only fallback).

**Test count:** 15 tests, all passing.
