# Section 12 -- Feature Flags and Integration Tests

## Overview

This section defines the five chat-memory feature flags, a helper service for reading them with caching, and integration-level tests verifying each flag correctly gates its pipeline step. When **all** flags are OFF the system behaves identically to the pre-feature-055 legacy path.

**Depends on:** section-08 (process integration), section-07 (context retrieval)
**Parallel with:** section-09, section-10

---

## Flag Definitions

| Flag Key | Default | Controls | Phase |
|----------|---------|----------|-------|
| `chat_archive_enabled` | `"true"` | Archive messages to encrypted JSONL | Phase 0 |
| `chat_fact_extraction_enabled` | `"false"` | Fact extraction into `scoped_memories` | Phase 1a |
| `chat_chunk_index_enabled` | `"false"` | Message chunk indexing for L2 vector search | Phase 1b |
| `chat_vector_memory_enabled` | `"false"` | 2-level vector search in `buildChatContext()` | Phase 2 |
| `chat_smart_summarize_enabled` | `"false"` | SAFE/RISKY classification gate before summarization | Phase 3 |

All stored in `system_settings` with `category = 'feature_flags'`. Per-tenant override via key naming: `tenant_${tenantId}_${flag}`.

---

## Files to Create

### `apps/web/server/services/chatMemoryFlags.ts`

Thin service reading chat memory flags from `system_settings` with in-memory caching (60s TTL).

**Exports:**

```typescript
export type ChatMemoryFlag =
  | "chat_archive_enabled"
  | "chat_fact_extraction_enabled"
  | "chat_chunk_index_enabled"
  | "chat_vector_memory_enabled"
  | "chat_smart_summarize_enabled";

export const CHAT_MEMORY_FLAG_DEFAULTS: Record<ChatMemoryFlag, boolean>;

export async function getChatMemoryFlag(flag: ChatMemoryFlag, tenantId?: string): Promise<boolean>;
export async function getAllChatMemoryFlags(tenantId?: string): Promise<Record<ChatMemoryFlag, boolean>>;
export function clearChatMemoryFlagCache(): void;
```

**Lookup order:**
1. Tenant-specific row: `category='feature_flags'`, key=`tenant_${tenantId}_${flag}`
2. Global row: `category='feature_flags'`, key=flag
3. `CHAT_MEMORY_FLAG_DEFAULTS[flag]`

**Cache:** `Map<string, { value: boolean; expiresAt: number }>`, key = `${tenantId ?? "global"}:${flag}`.

---

## Tests

### `apps/web/server/services/__tests__/chatMemoryFlags.test.ts` (Unit)

```
# Test: getChatMemoryFlag returns default when no DB rows exist
  - chat_archive_enabled defaults to true
  - chat_fact_extraction_enabled defaults to false

# Test: getChatMemoryFlag reads global row from system_settings
# Test: getChatMemoryFlag prefers tenant-specific row over global
# Test: getChatMemoryFlag returns default when DB unavailable (getDb returns null)
# Test: getAllChatMemoryFlags returns all 5 flags in single call
# Test: in-memory cache returns cached value within TTL
# Test: clearChatMemoryFlagCache forces re-read from DB
# Test: per-tenant isolation -- tenant A flags do not affect tenant B
```

### `apps/web/server/services/__tests__/chatMemoryFlagIntegration.test.ts` (Integration)

```
# processConversationMemory tests:
# Test: all flags OFF -> legacy behavior only (no new services called)
# Test: chat_archive_enabled ON -> archiveMessage called
# Test: chat_fact_extraction_enabled ON -> extractFacts called when summarization triggered
# Test: chat_chunk_index_enabled ON -> indexMessageChunks called
# Test: chat_smart_summarize_enabled ON -> smartSummarize replaces legacy summarization
# Test: chat_smart_summarize_enabled OFF -> legacy generateSummaryPrompt used

# buildChatContext tests:
# Test: chat_vector_memory_enabled OFF -> legacy getEntityMemoriesForContext used
# Test: chat_vector_memory_enabled ON -> searchMemories + mergeAndDedup used
# Test: chat_vector_memory_enabled ON + L1 >= 3 -> L2 NOT triggered
# Test: chat_vector_memory_enabled ON + L1 < 3 -> L2 triggered

# Per-tenant:
# Test: tenant A ON, tenant B OFF -> correct paths for each
```

---

## Seed Data

```sql
INSERT INTO system_settings (category, key, value, description, "isSensitive", "createdAt", "updatedAt")
VALUES
  ('feature_flags', 'chat_archive_enabled', 'true',
   'Enable encrypted JSONL archiving of chat messages (Phase 0)', false, NOW(), NOW()),
  ('feature_flags', 'chat_fact_extraction_enabled', 'false',
   'Enable LLM fact extraction into scoped_memories (Phase 1a)', false, NOW(), NOW()),
  ('feature_flags', 'chat_chunk_index_enabled', 'false',
   'Enable message chunk indexing for Level 2 vector search (Phase 1b)', false, NOW(), NOW()),
  ('feature_flags', 'chat_vector_memory_enabled', 'false',
   'Enable 2-level vector search in buildChatContext (Phase 2)', false, NOW(), NOW()),
  ('feature_flags', 'chat_smart_summarize_enabled', 'false',
   'Enable safe/risky classification gate before summarization (Phase 3)', false, NOW(), NOW())
ON CONFLICT DO NOTHING;
```

---

## Rollout Verification

| Phase | Flag | Verification |
|-------|------|-------------|
| 0 | `chat_archive_enabled = 'true'` | JSONL files in `data/memory-archives/` |
| 1a | `chat_fact_extraction_enabled = 'true'` | `scoped_memories` rows with `sourceType = 'auto'` |
| 1b | `chat_chunk_index_enabled = 'true'` | `message_chunks` rows + embeddings queued |
| 2 | `chat_vector_memory_enabled = 'true'` | Audit log `memory_vector_search` events |
| 3 | `chat_smart_summarize_enabled = 'true'` | `conversation_summaries.skippedRiskyCount > 0` |

**Rollback:** Set flag to `'false'` + `clearChatMemoryFlagCache()` (or wait 60s).
