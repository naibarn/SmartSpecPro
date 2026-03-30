# Section 08 — Process Integration

## Section ID
`section-08-process-integration`

## Dependencies
- **section-02-archive-service**: `archiveMessage()` from `apps/web/server/services/memoryArchiveService.ts`
- **section-04-fact-extractor**: `extractFacts()` from `apps/web/server/services/factExtractor.ts`, returns `ExtractionResult { inserted, reinforced, skipped, factIds }`
- **section-05-message-chunker**: `indexMessageChunks()` from `apps/web/server/services/messageChunkerService.ts`
- **section-06-smart-summarizer**: `smartSummarize()` from `apps/web/server/services/smartSummarizer.ts`, returns `SmartSummaryResult`
- **section-07-context-retrieval**: `memoryMerger.ts` and `buildChatContext()` modifications (read path -- this section only handles the write path in `processConversationMemory()`)

## Blocks
- **section-09-background-tasks**: Depends on the pipeline being wired and feature flags being consumed
- **section-12-feature-flags-tests**: Integration tests that verify flags gate each pipeline step

## Overview

This section wires all previously-built services into the existing `processConversationMemory()` function in `apps/web/server/services/memoryService.ts`. The function currently handles summarization and entity extraction. This section adds a 5-step pipeline before and around the existing summarization logic:

1. **Archive** -- fire-and-forget JSONL archival of new messages (runs on every call)
2. **Chunk** -- index new messages into `message_chunks` with async embedding (runs on every call)
3. **Extract facts** -- LLM-based fact extraction into `scoped_memories` (runs when summarization is triggered)
4. **Smart summarize** -- classify segments as SAFE/RISKY, summarize only SAFE (replaces existing summarization when flag is ON)
5. **Legacy entity extraction** -- existing code, kept as fallback

Each step is independently gated by a per-tenant feature flag using `getChatMemoryFlag()` from `apps/web/server/services/chatMemoryFlags.ts` (section-12).

---

## File to Modify

`/home/dev/projects/SmartSpecPro/apps/web/server/services/memoryService.ts`

## Test File to Create

`/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/processIntegration.test.ts`

---

## TDD Specification

### Test: `processIntegration.test.ts`

```
# Test: with all flags OFF, processConversationMemory uses legacy behavior only
  - Mock all getChatMemoryFlag calls to return false
  - Assert archiveMessage NOT called
  - Assert indexMessageChunks NOT called
  - Assert extractFacts NOT called
  - Assert smartSummarize NOT called
  - Assert existing summarization + entity extraction runs normally

# Test: chat_archive_enabled ON archives messages on every call
  - Mock getChatMemoryFlag("chat_archive_enabled", tenantId) to return true
  - Assert archiveMessage called for recent messages

# Test: chat_chunk_index_enabled ON indexes chunks on every call
  - Mock getChatMemoryFlag("chat_chunk_index_enabled", tenantId) to return true
  - Assert indexMessageChunks called with correct tenantId, userId, conversationId

# Test: chat_fact_extraction_enabled ON extracts facts when summarization is triggered
  - Mock flag ON + needsSummarization true
  - Assert extractFacts called with messages, tenantId, userId

# Test: chat_fact_extraction_enabled ON but needsSummarization false -- extractFacts NOT called

# Test: chat_smart_summarize_enabled ON replaces legacy summarization
  - Mock flag ON + needsSummarization true
  - Mock smartSummarize to return { summaryText: "safe summary", skippedRiskyCount: 2, classificationStats: { safe: 5, risky: 2 } }
  - Assert smartSummarize called with messagesToSummarize
  - Assert saveSummary called with summaryText and new metadata columns
  - Assert the legacy LLM fetch for summarization is NOT called

# Test: chat_smart_summarize_enabled OFF uses legacy summarization path

# Test: saveSummary receives extractedFactIds from fact extraction result
  - Mock both fact extraction + smart summarize ON
  - Assert saveSummary called with extractedFactIds from extractFacts result

# Test: saveSummary receives hasRawArchive: true when archive flag ON

# Test: archive step failure does not block subsequent pipeline steps
  - Mock archiveMessage to throw
  - Assert indexMessageChunks still called

# Test: pipeline steps execute in correct order (archive -> chunk -> extract -> summarize)

# Test: return type includes new fields (factsExtracted, chunksIndexed, archived)
```

### Test Structure

```typescript
vi.mock("../memoryArchiveService", () => ({ archiveMessage: vi.fn() }));
vi.mock("../factExtractor", () => ({ extractFacts: vi.fn().mockResolvedValue({ inserted: 0, reinforced: 0, skipped: 0, factIds: [] }) }));
vi.mock("../messageChunkerService", () => ({ indexMessageChunks: vi.fn().mockResolvedValue({ chunksCreated: 0 }) }));
vi.mock("../smartSummarizer", () => ({ smartSummarize: vi.fn().mockResolvedValue({ summaryText: "", skippedRiskyCount: 0, classificationStats: { safe: 0, risky: 0 } }) }));
vi.mock("../chatMemoryFlags", () => ({ getChatMemoryFlag: vi.fn().mockResolvedValue(false), getAllChatMemoryFlags: vi.fn() }));
```

---

## Implementation Guidance

### Extended Return Type

```typescript
export async function processConversationMemory(conversationId: number, userId: number): Promise<{
  // Existing
  summarized: boolean;
  entitiesExtracted: number;
  suggestedMemories: SuggestedMemory[];
  compacted: boolean;
  compactedMessageCount: number;
  consolidated: boolean;
  // New
  factsExtracted: number;
  chunksIndexed: number;
  archived: boolean;
}>
```

### Tenant ID Resolution

Move conversation metadata lookup to the TOP of the function (before pipeline steps):

```typescript
const db = await getDb();
const [conv] = await db.select({ projectId: conversations.projectId, tenantId: conversations.tenantId })
  .from(conversations).where(eq(conversations.id, conversationId)).limit(1);
const conversationTenantId = conv?.tenantId ?? null;
const conversationProjectId = conv?.projectId ?? null;
```

### Feature Flag Checks

```typescript
import { getChatMemoryFlag } from "./chatMemoryFlags";
```

### Pipeline Step 1: Archive (runs on every call)

```typescript
const archiveEnabled = await getChatMemoryFlag("chat_archive_enabled", conversationTenantId ?? undefined);
if (archiveEnabled) {
  try {
    const recentPair = await getBufferMessages(conversationId, 2);
    for (const msg of recentPair) {
      await archiveMessage(conversationTenantId || "default", userId, conversationId, {
        messageId: msg.id, role: msg.role, content: msg.content, createdAt: msg.createdAt,
      });
    }
    archived = true;
  } catch (err) {
    console.error("[Memory] Archive step failed (non-blocking):", err);
  }
}
```

### Pipeline Step 2: Chunk Indexing (runs on every call)

```typescript
const chunkEnabled = await getChatMemoryFlag("chat_chunk_index_enabled", conversationTenantId ?? undefined);
if (chunkEnabled) {
  try {
    const recentPair = await getBufferMessages(conversationId, 2);
    const result = await indexMessageChunks({
      tenantId: conversationTenantId || "default", userId, conversationId,
      messages: recentPair, projectId: conversationProjectId ?? undefined,
    });
    chunksIndexed = result.chunksCreated;
  } catch (err) {
    console.error("[Memory] Chunk indexing step failed (non-blocking):", err);
  }
}
```

### Pipeline Step 3: Fact Extraction (inside shouldSummarize block)

```typescript
let extractionResult: ExtractionResult | null = null;
const factEnabled = await getChatMemoryFlag("chat_fact_extraction_enabled", conversationTenantId ?? undefined);
if (factEnabled && shouldSummarize && messagesToSummarize.length > 0) {
  try {
    extractionResult = await extractFacts(messagesToSummarize, conversationTenantId || "default", userId);
    factsExtracted = extractionResult.inserted + extractionResult.reinforced;
  } catch (err) {
    console.error("[Memory] Fact extraction step failed (non-blocking):", err);
  }
}
```

### Pipeline Step 4: Smart Summarization Gate

```typescript
const smartSummarizeEnabled = await getChatMemoryFlag("chat_smart_summarize_enabled", conversationTenantId ?? undefined);

if (smartSummarizeEnabled && shouldSummarize) {
  try {
    const smartResult = await smartSummarize(messagesToSummarize, extractionResult?.factIds ?? [], archived);
    if (smartResult.summaryText && smartResult.summaryText.length >= 20) {
      await saveSummary(conversationId, smartResult.summaryText,
        messagesToSummarize[0].id, messagesToSummarize[messagesToSummarize.length - 1].id,
        messagesToSummarize.length, smartResult.totalTokensUsed,
        {
          skippedRiskyCount: smartResult.skippedRiskyCount,
          extractedFactIds: extractionResult?.factIds ?? [],
          hasRawArchive: archived,
          classificationStats: smartResult.classificationStats,
        }
      );
      summarized = true;
    }
  } catch (err) {
    console.error("[Memory] Smart summarization failed, falling back to legacy:", err);
  }
}

if (!summarized && shouldSummarize) {
  // EXISTING: Legacy LLM summarization (unchanged)
}
```

### saveSummary Signature Extension

```typescript
export async function saveSummary(
  conversationId: number, summary: string, messageRangeStart: number, messageRangeEnd: number,
  messageCount: number, tokensUsed?: number,
  metadata?: {
    skippedRiskyCount?: number; extractedFactIds?: string[];
    hasRawArchive?: boolean; classificationStats?: { safe: number; risky: number };
  }
): Promise<ConversationSummary>
```

### Imports to Add

```typescript
import { archiveMessage } from "./memoryArchiveService";
import { extractFacts, type ExtractionResult } from "./factExtractor";
import { indexMessageChunks } from "./messageChunkerService";
import { smartSummarize } from "./smartSummarizer";
import { getChatMemoryFlag } from "./chatMemoryFlags";
```

### Error Isolation Pattern

Every pipeline step is wrapped in its own try/catch. A failure in any step NEVER prevents subsequent steps from running.

### Feature Flag Names

| Flag Name | When Checked | Gate Behavior |
|-----------|-------------|---------------|
| `chat_archive_enabled` | Before step 1 | Skip archive when OFF |
| `chat_chunk_index_enabled` | Before step 2 | Skip chunk indexing when OFF |
| `chat_fact_extraction_enabled` | Before step 3 | Skip fact extraction when OFF |
| `chat_smart_summarize_enabled` | Before step 4 | Use legacy summarization when OFF |

All flags default to `false` (except `chat_archive_enabled` = `true`) -- when all are OFF, function behaves identically to current implementation.

### Security Considerations

1. No new external API surface -- only internal pipeline logic
2. Tenant isolation via per-tenant flag checks
3. Error containment via per-step try/catch
4. Backward compatibility -- all flags default OFF
