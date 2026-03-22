---
name: Chat Memory System - Quick Reference
description: Fast lookup tables, code locations, and decision trees for developers
type: project
---

# Chat Memory — Developer Quick Reference

## File Locations & Line Numbers

```
FRONTEND (React):
  apps/web/client/src/components/chat/MemoryPanel.tsx
    - UI for managing memories (762 lines)
    - Memory types config (line 70-82)
    - Summaries section (line 551-575)
    - Memory list rendering (line 605-697)
    - Compact button logic (line 524-537)
    - Clear Old dialog (line 725-758)
    - Project field (line 449-498)
    - Memory modes toggle (line 500-520)

  apps/web/client/src/components/chat/ChatView.tsx
    - Memory context fetching (line 1093-1110)
    - Stream response with memory (line 1087)
    - processMemoryMutation call (line 1271-1276)
    - Memory mode from conversation (line 1098)

  apps/web/client/src/pages/AdminSettings.tsx
    - Admin summary model selection (line 2217-2230)

BACKEND (Node.js):
  apps/web/server/routers/memory.ts (509 lines)
    - getEntityMemories (line 34-62)
    - upsertEntityMemory (line 67-97)
    - deleteEntityMemory (line 102-122)
    - getSummaries (line 127-150)
    - getChatContext (line 155-198) ← MAIN ENDPOINT FOR CHAT
    - processMemory (line 303-318)
    - compactConversation (line 323-386)
    - clearOldMemories (line 439-466)

  apps/web/server/services/memoryService.ts (1500+ lines)
    - Configuration constants (line 46-52)
      BUFFER_SIZE = 20
      SUMMARIZE_THRESHOLD_PERCENT = 0.70
      DEFAULT_CONTEXT_LENGTH = 8000
    - Buffer memory (line 91-126)
      getBufferMessages() — line 95
      getMessageCount() — line 116
    - Summary memory (line 128-302)
      needsSummarization() — line 134
      getMessagesToSummarize() — line 188
      generateSummaryPrompt() — line 237
      saveSummary() — line 260
      getSummaries() — line 289
    - Entity memory (line 363-676)
      extractEntitiesFromMessage() — line 369
      upsertEntityMemory() — line 532
      getEntityMemoriesForContext() — line 629
      Entity types (line 77-80)
      IMPORTANCE_BY_TYPE — line 83-88
    - Context building (line 678-1019)
      buildChatContext() — line 699 [MAIN FUNCTION]
      contextToMessages() — line 970
      Visual memory integration (line 876-939)
    - Auto-processing (line 1022-1233)
      processConversationMemory() — line 1034
    - Consolidation (line 1236-1515)
      consolidateSummaries() — line 1358
      checkAndConsolidate() — line 1315
      estimateContextChars() — line 1267

DATABASE:
  apps/web/drizzle/schema.ts
    - conversations table (line 1288-1360)
      memoryMode: varchar (line 1332)
      projectId: varchar (line 1329)
      model: varchar (line 1298)
      systemPrompt: text (line 1304)
    - messages table (line 1369-1440+)
      content: text (line 1379)
      conversationId FK (line 1373)
    - conversationSummaries table (line 1455-1483)
      conversationId FK (line 1459)
      summary: text (line 1461)
      messageRangeStart/End (line 1463-1464)
      messageCount: integer (line 1465)
    - entityMemories table (line 1489-1530)
      userId FK (line 1493)
      entityType: enum (line 1496)
      entityName: varchar (line 1499)
      facts: json array (line 1502)
      sourceConversationId FK (line 1505)
      projectId: varchar (line 1508)
      importance: integer (line 1510)
      reinforcementCount (line 1517)
```

---

## Entity Types & Defaults

```typescript
const IMPORTANCE_BY_TYPE: Record<string, number> = {
  rule: 10,                  // Always active, never auto-deleted
  decision: 8,               // Technology choices, architectural decisions
  plan: 9,                   // Roadmaps, milestones, next steps
  architecture: 9,           // System design, module structure
  code_knowledge: 8,         // Important code patterns, implementation details
  component: 7,              // Created components, services, functions
  project: 6,                // Project names, purposes, tech stacks
  task: 6,                   // TODOs, action items
  technical: 7,              // Framework/DB/API choices
  user: 5,                   // User name, role, expertise
  preference: 5,             // Coding style, tool preferences
};
```

---

## Memory Modes

```typescript
type MemoryMode = "full" | "no_long" | "off";

const memoryModeLabels: Record<string, { label: string; desc: string }> = {
  full: { label: "Full Memory", desc: "All tiers active" },
  no_long: { label: "No Long Memory", desc: "Summaries + buffer only" },
  off: { label: "Memory Off", desc: "Raw messages only" },
};
```

| Mode | Entities | Summaries | Buffer | Rules |
|------|----------|-----------|--------|-------|
| full | ✅ | ✅ | ✅ | ✅ |
| no_long | ❌ | ✅ | ✅ | ❌ |
| off | ❌ | ❌ | ✅ | ❌ |

---

## Budget Allocation (buildChatContext)

**Default context:** 8000 tokens
**Budget used for:** `contextLength × 0.7` (70% reserve)

```
With NO visual context:
  - System prompt + rules: Fixed (never trimmed)
  - Entities: 40% of budget
  - Summaries: 60% of budget
  - Buffer: Fill remaining

With VISUAL context:
  - System prompt + rules: Fixed (never trimmed)
  - Entities: 20% of budget
  - Summaries: 25% of budget
  - Visual: Up to 15% of budget
  - Buffer: Fill remaining
```

---

## Summarization Trigger Condition

```typescript
function needsSummarization(conversationId):
  1. Get conversation model
  2. Get model context length from model_provider_map
  3. Calculate threshold = contextLength × 4 × 0.70 (chars)
  4. Get last summarized message ID
  5. Sum unsummarized message char lengths
  6. if (unsummarizedChars >= threshold) return true
```

**Example:** GPT-4o has 128K context
- Context budget: 128,000 tokens
- Char threshold: 128,000 × 4 × 0.70 = 358,400 chars
- Trigger when unsummarized messages exceed 358KB

---

## Consolidation Trigger Condition

```typescript
function checkAndConsolidate(conversationId):
  1. Get conversation model
  2. Calculate context limit in chars
  3. Sum all summary chars + unsummarized message chars
  4. threshold = contextLimit × 0.70
  5. if (totalChars >= threshold AND summaryCount >= 2):
      → consolidateSummaries()
```

---

## Context Building Flow (buildChatContext)

```
STEP 1: Resolve Persona
  - Check conversations.personaId
  - Fetch persona template
  - Prepend to system prompt

STEP 2: Check Visual State
  - Load visualStateService
  - Determine if adaptive budgets needed

STEP 3: Build Entity Context (if memoryMode === "full")
  - Get top entities by (importance, reinforcementCount, lastAccessedAt)
  - Separate rules (always include) from others
  - Rank non-rules by relevance to currentUserMessage
  - Include entities up to entityBudget
  - Format: "[rule] fact1; fact2\n[memory]\n[type:name] fact1; fact2"

STEP 4: Build Summary Context (if memoryMode !== "off")
  - Get conversation summaries (max 10)
  - Get project summaries if projectId set (max 5)
  - Include oldest-to-newest until summaryBudget exhausted
  - Format: "Previous conversation context:\n[Summary 1]\n\n[Summary 2]"

STEP 5: Build Buffer Context
  - Get all messages (max 50)
  - Filter out system messages
  - Fill remaining budget from newest to oldest
  - Maintain chronological order for LLM

STEP 6: Visual Memory (Section 07, if multimodalMemory flag enabled)
  - Check if image keywords in currentUserMessage
  - Resolve references → retrieve assets
  - Build image context with embedding scores
  - Append image instructions to system prompt

STEP 7: Return ChatContext
  {
    systemPrompt: effectiveSystemPrompt,
    entityContext: string or null,
    summaryContext: string or null,
    bufferMessages: Array<{role, content}>,
    totalTokenEstimate: number,
    visualMemoryContext: string or null,
    imageAssets: Array<{assetId, fileUrl, caption, role}>
  }
```

---

## Auto-Processing Flow (processConversationMemory)

Runs after each message, called from ChatView (line 1271)

```
STEP 1: Check Summarization
  if (needsSummarization):
    → generateSummaryPrompt()
    → Call summary model LLM
    → saveSummary()
    → Deduct credits

STEP 2: Extract Entities
  Get last 5 messages
  for each message:
    → extractEntitiesFromMessage() [regex patterns]
    → Filter for PII
    if importance < 8:
      → Auto-save silently
    else:
      → Suggest to user in toast

STEP 3: Cleanup (every 50 messages)
  → cleanupExpiredMemories(userId) [delete >180 days]

STEP 4: Check Consolidation
  if (totalChars >= 70% context AND summaries >= 2):
    → consolidateSummaries()
```

---

## PII Filtering

**Removed patterns:**
- Email addresses: `name@domain.com`
- Phone numbers: `(555) 123-4567`
- AWS/Cloud credentials
- API keys: `sk-xxx`, `ghp_xxx`
- Tokens: `Bearer xxx`, partial token fragments
- File paths: `/home/user`, `C:\Users\`

**Redaction:** Replaces with `[filtered]` or `[REDACTED]`

**Result:** If all facts removed → Memory creation fails with error

---

## getTRPC Calls from Frontend

```typescript
// Chat streaming — before each LLM call
const contextData = await utils.memory.getChatContext.fetch({
  conversationId: number,
  modelContextLength?: number,
  currentMessage?: string,
  memoryMode?: "full" | "no_long" | "off",
});
// Returns: { messages, tokenEstimate, hasEntityMemory, hasSummaries, bufferSize }

// After message — auto-process
processMemoryMutation.mutateAsync({ conversationId });
// Returns: { summarized, entitiesExtracted, suggestedMemories, compacted, consolidat }

// Manual compact
compactMutation.mutateAsync({ conversationId });
// Returns: { compacted, messageCount, summary }

// Manual clear
clearOldMutation.mutateAsync({ olderThanDays: 30 | 90 | 180 });
// Returns: { deletedCount }

// Add memory
addMemoryMutation.mutate({
  entityType: EntityType,
  entityName: string,
  facts: string[],
  importance?: number,
  source?: "auto" | "manual" | "suggested",
  projectId?: string,
});

// Delete memory
deleteMemoryMutation.mutate({ id: number });

// Get conversation summary for transfer
utils.memory.getConversationSummary.fetch({ conversationId });
// Returns: { summary: string }
```

---

## Database Queries Cheat Sheet

```sql
-- Get all memories for user in project
SELECT * FROM entity_memories
WHERE user_id = $1
  AND (project_id = $2 OR project_id IS NULL)
ORDER BY importance DESC, reinforcement_count DESC, last_accessed_at DESC;

-- Get unsummarized messages
SELECT id, content FROM messages
WHERE conversation_id = $1
  AND id > (
    SELECT COALESCE(MAX(message_range_end), 0)
    FROM conversation_summaries
    WHERE conversation_id = $1
  )
ORDER BY created_at ASC;

-- Check if summarization needed
SELECT COALESCE(SUM(LENGTH(content)), 0) as total_chars
FROM messages
WHERE conversation_id = $1
  AND id > (
    SELECT COALESCE(MAX(message_range_end), 0)
    FROM conversation_summaries
    WHERE conversation_id = $1
  );

-- Clean up expired memories
DELETE FROM entity_memories
WHERE user_id = $1
  AND entity_type != 'rule'
  AND last_accessed_at < NOW() - INTERVAL '180 days';
```

---

## Debugging Checklist

**Memory not saving:**
- [ ] Check `entityMemories` table for user_id + entity_type + entity_name combo
- [ ] Check if PII filter removed all facts (look for console log: "[PII Filter]")
- [ ] Check if importance < 8 (auto-saved silently) or >= 8 (needs user confirmation)
- [ ] Check `sourceConversationId` if memory was created from conversation

**Memories not appearing in chat:**
- [ ] Check `memory_mode` in `conversations` table (not "off")
- [ ] Check `projectId` match (if conversation has projectId, memory must too)
- [ ] Check `getChatContext` logs — did it fetch entities?
- [ ] Check token budget didn't exceed (entities trimmed first)

**Summaries not generating:**
- [ ] Check if summarization needed: `unsummarized_chars >= threshold`
- [ ] Check `systemSettings` for `summaryModel` configured
- [ ] Check LLM provider is enabled + has API key
- [ ] Check credits available (summarization deducts credits)

**Consolidation not running:**
- [ ] Check if 2+ summaries exist: `SELECT count(*) FROM conversation_summaries WHERE conversation_id = $1`
- [ ] Check if `totalChars >= 70% context`
- [ ] Check `systemSettings.summaryModel` configured
- [ ] Check logs: `[Memory] Consolidation triggered:` message

**Cross-project memory not working:**
- [ ] Verify both conversations have same `projectId`
- [ ] Verify memories have matching `projectId` (not null)
- [ ] Check `getProjectSummaries()` is being called

---

## Performance Considerations

**High-frequency operations (per message):**
- `getBufferMessages()` — O(20 read)
- `needsSummarization()` — O(1 summary lookup + 1 count query)
- `extractEntitiesFromMessage()` — O(regex patterns) = O(message length)

**Medium-frequency (periodic):**
- `getEntityMemoriesForContext()` — O(limit read)
- `buildChatContext()` — O(entities + summaries + buffer) reads
- `processConversationMemory()` — Multiple LLM calls (if summarization/consolidation triggered)

**One-time operations:**
- `consolidateSummaries()` — LLM call to merge summaries (heavy)
- `cleanupExpiredMemories()` — DELETE query (every 50 messages)

**Optimization tips:**
- Cache `model_provider_map` context lengths (rarely change)
- Use memory mode "no_long" to skip entity extraction overhead
- Monitor consolidation frequency (should be rare)
- Set summary model to cheaper, faster LLM

---

## Feature Flags & Configuration

```typescript
// multimodalMemory feature (Section 07/09)
const flags = await getTenantFeatureFlags(tenantId);
if (!flags.multimodalMemory) {
  // Visual memory disabled
  visualMemoryContext = null;
  imageAssets = [];
}

// Summary model (admin config)
SELECT value FROM system_settings
WHERE category = 'ai' AND key = 'summaryModel';
// Returns model ID or null

// Persona resolution (Section 00)
const persona = await resolvePersona(
  { personaId: conversations.personaId, tenantId: conversations.tenantId },
  user,
  tenant
);
```

---

## Testing Scenarios

**Unit test: Budget allocation**
```
Input: 5 summaries (1000 chars each), 20 buffer messages (500 chars each), 10 entities (200 chars each)
Budget: 8000 tokens = 32000 chars threshold
Expected: All summaries included, some entities trimmed, all buffer
```

**Integration test: Consolidation**
```
Setup: 3 summaries + 20 unsummarized messages in conversation
Action: Call processConversationMemory
Expected: consolidateSummaries() triggered, 3 summaries deleted, 1 new summary created
```

**E2E test: Project scoping**
```
Setup: User creates memory in conversation with projectId="SmartSpec"
Action: Open new conversation with same projectId="SmartSpec"
Expected: Memory appears in MemoryPanel + included in getChatContext
```

---

## Common Mistakes to Avoid

- ❌ Forgetting `memoryMode` check when building context → include entity memory in "off" mode
- ❌ Not sanitizing prompt input → prompt injection in summarization
- ❌ Assuming all facts will auto-extract → patterns only match some patterns, suggest high-importance ones
- ❌ Not checking PII filter result → memory creation fails silently
- ❌ Deleting summaries without consolidation → data loss if not careful
- ❌ Ignoring token budget → context overflow, model errors
- ❌ Not handling Redis failure in rate limiter → crashes instead of graceful fallback

---

**Last updated:** 2026-03-17
