I now have all the context needed. Let me produce the section content.

# Section 04 — Fact Extractor

## Section ID
`section-04-fact-extractor`

## Dependencies
- **section-01-schema-migration**: `scoped_memories` table with `embedding`, `reinforcementCount`, `importance`, `memoryKind` columns must exist.
- **section-03-embedding-pipeline**: BullMQ `memory-embedding` queue (`embeddingQueue.ts`) and `queryEmbeddingService.ts` must be available to queue embedding jobs after fact insertion.

## Overview

This section implements `factExtractor.ts`, an LLM-based service that extracts structured facts from each user+assistant message pair and persists them as `scoped_memories` records. It is the Level 1 write path of the 2-level vector RAG system. The service:

1. Takes the latest message pair (user + assistant response)
2. Calls an LLM with an extraction system prompt, placing conversation content in a `HumanMessage` role (prompt injection defense)
3. Validates the JSON response through a Zod schema
4. Filters out injection patterns and caps importance at 8
5. Deduplicates against existing memories using cosine similarity (threshold 0.92)
6. Either reinforces an existing memory or inserts a new `scoped_memories` record
7. Queues each new fact for async embedding via BullMQ

## File to Create

`/home/dev/projects/SmartSpecPro/apps/web/server/services/factExtractor.ts`

## Test File to Create

`/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/factExtractor.test.ts`

---

## TDD Specification

### Test: `factExtractor.test.ts`

Tests follow the existing pattern in `scopedMemoryService.test.ts` -- Vitest with mocked Drizzle ORM. The module under test is imported dynamically; DB access (`getDb`) and external dependencies (`embeddingQueue`, `queryEmbeddingService`) are mocked via `vi.mock()`.

```
# Test: valid LLM response parsed into ExtractedFact[] via Zod schema
  - Provide a well-formed JSON array with 2 facts (title, content, category, importance)
  - Assert parseLLMResponse returns 2 ExtractedFact objects with correct fields

# Test: Zod rejects fact with importance > 8
  - Provide a fact with importance: 9
  - Assert Zod refinement clamps or rejects; the result has importance <= 8

# Test: Zod rejects fact with missing required fields
  - Provide JSON missing "content" field
  - Assert parseLLMResponse returns empty array (graceful failure)

# Test: injection pattern filter removes facts containing "OVERRIDE", "SYSTEM:", etc.
  - Provide facts where title or content contains "OVERRIDE" or "SYSTEM:"
  - Assert filterInjections removes those facts, keeps clean ones

# Test: mapCategoryToKind correctly maps all 7 categories
  - For each: decision, rule, fact, preference, checklist, artifact_note, note
  - Assert maps to the corresponding memoryKindEnum value

# Test: mapCategoryToKind returns "note" for unknown category
  - Provide "unknown_category"
  - Assert returns "note"

# Test: deduplicateAndStore inserts new fact when no similar memory exists
  - Mock searchMemories to return empty array
  - Assert createMemory called once with correct fields
  - Assert enqueueEmbedding called once with { type: "scoped_memory", recordId, text }

# Test: deduplicateAndStore reinforces existing memory when cosine > 0.92
  - Mock searchMemories to return a memory with score > 0.92
  - Assert updateMemory called with incremented reinforcementCount
  - Assert createMemory NOT called

# Test: deduplicateAndStore increments reinforcementCount on reinforce
  - Mock existing memory with reinforcementCount: 3
  - Assert updateMemory sets reinforcementCount: 4

# Test: deduplicateAndStore uses max(existing, new) for importance on reinforce
  - Existing memory importance: 5, new fact importance: 7
  - Assert updateMemory sets importance: 7
  - Reverse case: existing 7, new 5 => importance stays 7

# Test: extracted facts have sourceType "auto" and ownerType "user"
  - After extractAndStore, assert createMemory called with sourceType: "auto", ownerType: "user"

# Test: embedding queued via BullMQ with correct job payload { type, recordId, text }
  - After inserting a new fact, assert enqueueEmbedding receives correct shape

# Test: empty LLM response (no facts) returns { inserted: 0, reinforced: 0, skipped: 0 }
  - Mock LLM to return "[]" or empty string
  - Assert extractFacts returns zeroed stats

# Test: malformed LLM response (not JSON array) handled gracefully, returns empty
  - Mock LLM to return "I cannot extract facts from this"
  - Assert extractFacts returns zeroed stats without throwing
```

### Test Structure Guidance

```typescript
// factExtractor.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing module under test
vi.mock("../../db", () => ({ getDb: vi.fn() }));
vi.mock("../scopedMemoryService", () => ({
  searchMemories: vi.fn(),
  createMemory: vi.fn(),
  updateMemory: vi.fn(),
}));
vi.mock("../embeddingQueue", () => ({
  enqueueEmbedding: vi.fn(),
}));

describe("factExtractor", () => {
  describe("parseLLMResponse", () => { /* Zod parsing tests */ });
  describe("filterInjections", () => { /* Regex filter tests */ });
  describe("mapCategoryToKind", () => { /* Category mapping tests */ });
  describe("deduplicateAndStore", () => { /* Dedup + insert/reinforce tests */ });
  describe("extractFacts (end-to-end)", () => { /* Full pipeline tests with mocked LLM */ });
});
```

---

## Implementation Guidance

### Exported Types

```typescript
/** Shape returned by LLM, validated via Zod */
export interface ExtractedFact {
  title: string;           // Short label (max 100 chars)
  content: string;         // Fact body (max 500 chars)
  category: string;        // One of: decision, rule, fact, preference, checklist, artifact_note, note
  importance: number;       // 1-8 (capped; only user-confirmed can reach 9-10)
}

/** Stats returned after extraction */
export interface ExtractionResult {
  inserted: number;
  reinforced: number;
  skipped: number;        // Injection-filtered or malformed
  factIds: string[];      // UUIDs of inserted/reinforced scoped_memories
}
```

### Zod Schema for LLM Response Validation

Define a Zod schema `extractedFactSchema` that validates each fact object from the LLM response:
- `title`: `z.string().min(1).max(100)`
- `content`: `z.string().min(1).max(500)`
- `category`: `z.string()`
- `importance`: `z.number().int().min(1).max(8)` -- the max(8) is the cap; if LLM returns 9 or 10, Zod rejects it

The response wrapper: `z.array(extractedFactSchema)`. Use `safeParse` so malformed JSON never throws.

### `parseLLMResponse(raw: string): ExtractedFact[]`

1. Try `JSON.parse(raw)` -- if the LLM wraps in markdown code fences, strip them first (`/^\s*```(?:json)?\s*|\s*```\s*$/g`)
2. Run through `z.array(extractedFactSchema).safeParse(parsed)`
3. On failure: log warning, return `[]`
4. On success: return `data`

### `filterInjections(facts: ExtractedFact[]): ExtractedFact[]`

Apply regex `/OVERRIDE|INJECTION|SYSTEM:|RULE:|IGNORE.*PREVIOUS|DISREGARD/i` to `title + " " + content` of each fact. Remove any fact that matches.

### `mapCategoryToKind(category: string): MemoryKindEnum`

Simple lookup map:

| Input Category | memoryKindEnum Value |
|----------------|---------------------|
| `"decision"` | `"decision"` |
| `"rule"` | `"rule"` |
| `"fact"` | `"fact"` |
| `"preference"` | `"preference"` |
| `"checklist"` | `"checklist"` |
| `"artifact_note"` | `"artifact_note"` |
| `"note"` | `"note"` |
| anything else | `"note"` (fallback) |

### `deduplicateAndStore(facts, tenantId, userId, embedding?)` 

For each fact:
1. Call `searchMemories()` from `scopedMemoryService.ts` with:
   - `tenantId`
   - `scopes: [{ type: "user", id: String(userId) }]`
   - `query: fact.title + " " + fact.content`
   - `topK: 1`
   - `embedding` (if available from the query embedding service)
2. If the top result has `score >= 0.92`: **reinforce** it:
   - `updateMemory(existingId, tenantId, { reinforcementCount: existing.reinforcementCount + 1, importance: Math.max(existing.importance, fact.importance) })`
   - Add existingId to `factIds`
3. If no match or score < 0.92: **insert** new:
   - `createMemory({ tenantId, ownerType: "user", ownerId: String(userId), memoryKind: mapCategoryToKind(fact.category), sourceType: "auto", title: fact.title, content: fact.content, importance: fact.importance })`
   - Queue embedding: `enqueueEmbedding({ type: "scoped_memory", recordId: newMemory.id, text: fact.title + " " + fact.content })`
   - Add newMemory.id to `factIds`

### `extractFacts(messages, tenantId, userId): Promise<ExtractionResult>`

Main entry point called from `processConversationMemory()` (section-08).

1. Build the LLM extraction prompt:
   - **System prompt**: Instructs the LLM to extract key facts as a JSON array. Include the schema definition and examples.
   - **User message** (HumanMessage role): The actual conversation messages formatted as `USER: ... \n ASSISTANT: ...`
   - Using `HumanMessage` role for conversation content prevents prompt injection from user messages being interpreted as system instructions.

2. Call the LLM (same provider resolution pattern as `processConversationMemory()` at line 2116 of `memoryService.ts`):
   - Use the summary model (`getSummaryModel()`)
   - Temperature: 0.1 (low for structured extraction)
   - max_tokens: 1000

3. Parse and validate the response via `parseLLMResponse()`
4. Filter injections via `filterInjections()`
5. Store via `deduplicateAndStore()`
6. Return `ExtractionResult`

### LLM System Prompt (extraction)

The extraction prompt should instruct the LLM to:
- Extract facts, decisions, rules, preferences, checklists, and notes
- Output only a JSON array of objects with `{ title, content, category, importance }`
- Rate importance 1-8 (never higher)
- Omit trivial greetings, small talk, and meta-conversation

Do NOT hardcode the full prompt text here -- define it as a constant string in the module so it can be iterated on without changing logic.

### Error Handling

- LLM call failure (network, timeout): log error, return zeroed `ExtractionResult` -- never throw to caller
- Zod parse failure: log warning with the raw response (truncated to 200 chars for safety), return empty
- DB write failure: log error, continue with remaining facts (partial success is acceptable)

### Imports Required

```typescript
import { z } from "zod";
import { searchMemories, createMemory, updateMemory } from "./scopedMemoryService";
import { enqueueEmbedding } from "./embeddingQueue";  // from section-03
import { getDb } from "../db";
import { eq, asc } from "drizzle-orm";
import { llmProviders } from "../../drizzle/schema";
import { decrypt } from "./crypto";
```

### Integration Points

- **Called by**: `processConversationMemory()` in `memoryService.ts` (section-08 wires this)
- **Feature flag**: `chat_fact_extraction_enabled` -- checked by caller (section-08), NOT by this module
- **Writes to**: `scoped_memories` table via `scopedMemoryService.createMemory()` / `updateMemory()`
- **Queues to**: `memory-embedding` BullMQ queue via `enqueueEmbedding()` (section-03)
- **Reads from**: `scoped_memories` via `searchMemories()` for dedup check

### Security Considerations

1. **Prompt injection defense**: Conversation content placed in `HumanMessage` role, never in system prompt
2. **Injection filter regex**: Applied post-extraction to catch any facts that contain control phrases
3. **Importance cap at 8**: Prevents LLM from creating artificially high-priority memories that could dominate context
4. **No raw user content in system prompt**: The system prompt is a static template; only the formatted messages go in the user role
5. **Zod validation**: Ensures LLM output conforms to expected schema before any DB operations