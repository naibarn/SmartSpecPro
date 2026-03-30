---
name: Chat Memory System Architecture Research Brief
description: Complete analysis of SmartSpecPro chat memory storage, retrieval, vector DB integration, RAG pipelines, and context management
type: project
---

# Research Brief: Chat Memory System Architecture

**Date:** 2026-03-23
**Scope:** Three-tier chat memory (buffer, summaries, entity facts)
**Status:** Complete

---

## Executive Summary

SmartSpecPro implements a **three-tier chat memory system** with buffer memory (recent messages), summary memory (LLM-compressed history), and entity memory (persistent facts).

**Key Finding:** No vector database is currently used for chat memory retrieval. Entity memories use exact lookup; summaries are managed via message ranges. pgvector infrastructure exists for image embeddings only (multimodal), not for text chat.

**Architecture Level:** ⭐⭐⭐ (Sophisticated token budgeting and summarization) / ❌ (No semantic search or RAG)

---

## Current Architecture

### 1. Three-Tier Memory System

| Tier | Storage | Size | Retrieval | Purpose |
|------|---------|------|-----------|---------|
| **Buffer** | Recent 20 messages | ~5KB-10KB | Full fetch, no filtering | Preserve conversation flow |
| **Summaries** | `conversationSummaries` table | Max 5 summaries | Fetch by conversation ID | Compress old messages |
| **Entity** | `entityMemories` table | Per-user entity facts | Exact lookup by userId + projectId | Persistent context across chats |

### 1.1 Buffer Memory (Tier 1)

- **What:** Last 20 messages in conversation
- **Stored In:** `messages` table (joined at query time)
- **Retrieval:** `memoryService.buildChatContext()` → fetch most recent 20
- **Token Allocation:** ~50-60% of context budget
- **No Processing:** Raw messages injected as-is

### 1.2 Summary Memory (Tier 2)

**Database Schema:**
```sql
CREATE TABLE conversation_summaries (
  id SERIAL PRIMARY KEY,
  conversationId INT REFERENCES conversations(id),
  summary TEXT,                    -- LLM-generated summary
  messageRangeStart INT,           -- ID of first summarized message
  messageRangeEnd INT,             -- ID of last summarized message
  messageCount INT,                -- # of messages in this summary
  tokensUsed INT,                  -- Tokens consumed generating summary
  createdAt TIMESTAMP
);
```

**Triggering:**
```
IF (unsummarized_chars / total_chars) > 0.70 THEN trigger summarization
```

**Flow:**
1. `memory.checkSummarization()` → returns `{ needed: true/false }`
2. If needed, `memory.getMessagesToSummarize()` → fetch unsummarized range
3. Generate LLM prompt via `memory.getSummaryPrompt()`
4. User/system calls LLM (async, frontend handles)
5. `memory.saveSummary()` → store summary in DB
6. Future calls to `buildChatContext()` include this summary

**Context Injection:**
- Fetch up to 5 most recent summaries
- Injected as separate user-role messages before buffer messages
- Ordered by recency (most recent first)

**Token Allocation:** ~20-30% of context budget

### 1.3 Entity Memory (Tier 3)

**Database Schema:**
```sql
CREATE TABLE entity_memories (
  id SERIAL PRIMARY KEY,
  userId INT REFERENCES users(id),          -- Owner
  entityType VARCHAR(50),                    -- user, project, preference, technical, decision, plan, architecture, component, task, code_knowledge, rule
  entityName VARCHAR(255),                   -- "coding_style", "SmartAIHub project"
  facts TEXT[] NOT NULL,                     -- Array of fact strings
  confidence NUMERIC(3,2) DEFAULT 0.8,       -- Reliability score
  importance INT DEFAULT 5,                  -- 1-10, user-specified
  reinforcementCount INT DEFAULT 0,          -- Incremented each time recalled
  lastAccessedAt TIMESTAMP,                  -- For cleanup
  source ENUM ('auto', 'manual', 'suggested'), -- How created
  personaId INT,                             -- Optional: scoped to persona
  projectId VARCHAR(255),                    -- Optional: scoped to project
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);

-- Indexes
CREATE INDEX entity_memories_user_idx ON entity_memories(userId);
CREATE INDEX entity_memories_user_project_idx ON entity_memories(userId, projectId);
CREATE UNIQUE INDEX entity_memories_lookup_idx
  ON entity_memories(userId, entityType, entityName, projectId);
```

**Retrieval:**
```sql
SELECT * FROM entity_memories
WHERE userId = ?
  AND (projectId = ? OR projectId IS NULL)
  AND source != 'deleted'
ORDER BY importance DESC, lastAccessedAt DESC
LIMIT 10;
```

**Key Points:**
- Always scoped by `userId` (user's memories only)
- Optional scope by `projectId` (conversation-scoped within a project)
- Falls back to global user memories if no project match
- Ordered by importance, then recency
- No semantic search; facts returned in full

**Context Injection:**
- Formatted as single user-role message with `<entity_context>` wrapper
- Includes entity type, name, and facts for each memory
- Token Allocation: ~10-20% of context budget

**Management (Manual):**
- Create: `memory.upsertEntityMemory()` tRPC mutation
- Delete: `memory.deleteEntityMemory()` (soft delete)
- Clear old: `memory.clearOldMemories()` (prune by age, preserves rules)

---

## 2. Vector Database Integration Status

### Finding: NO Vector Database for Chat Memory

**Current State:**
- Entity memories retrieved via **exact SQL lookup**, not semantic search
- Summaries indexed by **message range**, not embeddings
- NO RAG pipeline for chat

**Why?**
1. Entity memories are categorical facts ("User prefers TypeScript"), not documents
2. Summaries are auto-grouped by message boundaries (deterministic)
3. Buffer is recent N (no ranking needed)
4. Entity memory is typically small (<20 items per user)
5. Exact lookup is fast enough; vector DB would add overhead

### Optional Infrastructure: pgvector (Images Only)

**What exists:**
- `multimodalMemoryItems`, `multimodalMemoryVectors`, `multimodalMemoryLinks` tables
- pgvector extension configured in PostgreSQL
- Three vector providers supported: `chromadb`, `pgvector`, `cloudflare_vectorize`
- Hybrid ranking for image retrieval: explicit refs (0.35) + vector (0.25) + recency (0.20) + metadata (0.10) + projectScope (0.05) + salience (0.05)

**What it's used for:**
- **Image embeddings only**, not text
- Visual reference resolution in chat ("compare with the previous image")
- Feature-gated: `multimodalMemory` flag per-tenant

**NOT used for:**
- Chat message embeddings
- Semantic search of conversations
- Text-to-text similarity

---

## 3. Memory Retrieval Strategy

### 3.1 Entity Memory Retrieval

**Method:** Direct SQL lookup (no semantic search)

**Query:**
```sql
SELECT * FROM entity_memories
WHERE userId = ?
  AND (projectId = ? OR projectId IS NULL)
ORDER BY importance DESC, lastAccessedAt DESC
LIMIT 10;
```

**Scoping Logic:**
1. **By user:** Always required. Each user has isolated memories.
2. **By project:** If `conversation.projectId` is set, fetch memories for that project + global user memories
3. **If no project:** Fetch only global user memories

**No ranking beyond importance + recency:**
- No semantic similarity to current user message
- No filtering based on relevance
- All facts in array returned as-is

### 3.2 Summary Memory Retrieval

**Query:**
```sql
SELECT * FROM conversation_summaries
WHERE conversationId = ?
ORDER BY messageRangeEnd DESC
LIMIT 5;
```

**Integration:**
- One query per chat session
- Summaries returned in order (most recent first)
- Injected as separate user messages before buffer

### 3.3 Buffer Message Retrieval

**Query:**
```sql
SELECT * FROM messages
WHERE conversationId = ?
ORDER BY createdAt DESC
LIMIT 20;
```

**No filtering:** All recent messages included, regardless of role or content

### 3.4 Context Assembly & Token Budgeting

**Process:**
1. **Calculate context budget:** `budget = modelContextLength * 0.7`
2. **Estimate buffer tokens:** Sum of message lengths / 4 chars-per-token
3. **Remaining budget:** `budget - buffer_tokens = head_room`
4. **Allocate to summaries:** Up to 5 summaries (oldest discarded if exceeds budget)
5. **Allocate to entity:** Up to 10 facts (lowest-importance discarded if exceeds budget)

**No real-time token counting:**
- Uses approximation: `chars / 4 ≈ tokens`
- Could implement `js_tiktoken` but deferred

**Injection Order (in message array):**
1. System prompt (if provided)
2. Entity context (single message)
3. Summary context (up to 5 messages)
4. Buffer messages (recent conversation, up to 20)

---

## 4. Summarization Logic

### 4.1 Automatic Trigger

**Condition:**
```
unsummarized_message_chars > (total_conversation_chars * 0.70)
```

**Calculation:**
1. Get all messages since last summary
2. Sum their character lengths → `unsummarized_chars`
3. Sum all conversation message lengths → `total_chars`
4. Check if `unsummarized_chars / total_chars > 0.70`

### 4.2 Summarization Flow

**User Workflow:**
1. Chat naturally
2. After sufficient messages, system detects `checkSummarization.needed = true`
3. System returns `getMessagesToSummarize()` → message range
4. UI optionally shows "Summarize?" prompt
5. User can request manual summarization or ignore
6. LLM generates summary (async, frontend waits)
7. User calls `memory.saveSummary()` → stored in DB

**Automatic Workflow (Optional):**
- Service can auto-trigger summarization via `memory.processMemory()` after each message
- (Currently opt-in via UI, not automatic background task)

### 4.3 Summarization Prompt Template

```
You are an expert at summarizing conversations concisely.

Summarize the following messages, capturing:
- Key decisions made
- Important facts discussed
- Action items or next steps
- Main themes

Messages:
[conversation transcript]

Provide a summary in 2-3 sentences.
```

### 4.4 Manual Compaction

**Procedure:** `memory.compactConversation()` tRPC mutation

**Logic:**
1. Find last summarized message ID
2. Fetch all unsummarized messages EXCEPT most recent 5
3. Concatenate message text
4. Generate summary via `generateSummaryPrompt()`
5. Save as new summary
6. Return summary preview to user

**Why keep recent 5?**
- Buffer safety: ensures recent messages always visible in context
- Avoids summarizing while user still actively using that thread

---

## 5. Context Window Management

### 5.1 Token Budget Allocation

**Model Context Budget:**
```
contextBudget = modelContextLength * 0.70
```

(Reserve 30% for response generation)

**Tier Allocation:**
- **Buffer:** 50-60% (recent 20 messages)
- **Summaries:** 20-30% (up to 5 summaries)
- **Entity:** 10-20% (up to 10 facts)

**Dynamic Pruning:**
- If summaries exceed budget, drop oldest summaries
- If entity memories exceed budget, drop lowest-importance facts
- Buffer always prioritized (never pruned)

### 5.2 Memory Mode Configuration

**Per-conversation setting:** `conversations.memoryMode`

| Mode | Behavior | Use Case |
|------|----------|----------|
| `full` | All tiers (buffer + summaries + entity) | Default, recommended |
| `no_long` | Summaries + buffer only (skip entity) | Privacy mode, fresh start |
| `off` | Raw buffer only (no memory) | Isolated conversations |

**Frontend:** Memory mode toggle in MemoryPanel (Full / No Long / Off buttons)

---

## 6. Memory Processing & Lifecycle

### 6.1 Post-Message Memory Processing

**Trigger:** `memory.processMemory()` mutation (called after LLM response)

**Steps:**
1. Check if conversation needs summarization
2. If yes, optionally auto-trigger summarization
3. Update entity memory `reinforcementCount` for recalled facts
4. (Future) Extract new learnings from LLM response

### 6.2 No Memory Decay for Chat

**Entity Memories:** Persist indefinitely (no decay)
- Can be manually deleted or cleared by age
- `memory.clearOldMemories()` mutation prunes by `olderThanDays` threshold
- Rules (entityType='rule') are **always preserved**

**Contrast:** Agency agent memories DO decay (exponential: confidence *= 0.95^days)

### 6.3 Entity Memory Management (Manual)

**Add:** `memory.upsertEntityMemory()`
- Input: entityType, entityName, facts (array), importance, source
- Creates or updates memory entry
- Checks for duplicate via content hash (within same entity)

**Delete:** `memory.deleteEntityMemory()`
- Soft delete (sets `source='deleted'`)
- Only owner can delete own memories (unless admin)

**Clear Old:** `memory.clearOldMemories()`
- Deletes memories older than `olderThanDays` threshold
- **Exemption:** Rules always preserved regardless of age
- Input: olderThanDays (min 7, max 365)

---

## Risks

### 1. No Semantic Search for Fuzzy Matching

**Risk:** User asks "Tell me about TypeScript" but memory is named "typescript-style". System won't find it.

**Impact:** Low today (manual memories, small set). High if auto-extraction is added.

**Mitigation:** Add semantic search via vector embeddings if auto-extraction is implemented.

### 2. Token Estimates Are Approximations

**Risk:** Using `chars / 4` for token counting. Actual tokens could exceed model limit.

**Impact:** Potential context truncation or API errors.

**Mitigation:** Implement `js_tiktoken` for accurate counting, but not critical for current scale.

### 3. Memory Not Conversation-Scoped

**Risk:** Entity memories are global-or-project-scoped, not per-conversation. Memories from one chat leak to another.

**Impact:** May be desired, but no per-conversation isolation available.

**Mitigation:** Add `conversationId` column if cross-chat isolation becomes required.

### 4. No Hierarchical Summarization

**Risk:** Multiple summaries accumulate. 5 summary limit means oldest lost when 6th is added.

**Impact:** Important early context may be discarded.

**Mitigation:** Could implement "summaries of summaries" (hierarchical compression), but added complexity.

### 5. No Memory Sharing

**Risk:** Entity memories are user-scoped only. No way to share learned facts with team members.

**Impact:** In collaborative scenarios, duplicate memories across users.

**Mitigation:** Add `visibility` field (private, shared_team, shared_project) if collaboration is added.

### 6. No Auto-Extraction

**Risk:** Users must manually add memories. System doesn't learn automatically from conversations.

**Impact:** Sparse memory coverage; most context comes from buffer + summaries.

**Mitigation:** Auto-extraction exists for agency agents (not yet for chat). Could port pattern.

---

## Options

### Option A: Keep Current Architecture (No Changes)

**Approach:** Continue with exact-lookup entity memory, message-range summaries, no vector DB.

**Pros:**
- Simple to understand and maintain
- Fast for current scale (small memory sets)
- No external vector DB dependency

**Cons:**
- No fuzzy fact matching
- No auto-extraction of learnings
- Memory coverage sparse (manual only)

**Effort:** 0 hours

### Option B: Add Semantic Search for Entity Memory

**Approach:** Embed entity facts using OpenAI embeddings or local model. Store in pgvector. Retrieve top-K similar facts.

**Changes:**
1. Add `embedding` vector column to `entityMemories` table
2. Create background task to embed all entity facts
3. Modify `buildChatContext()` to:
   - Embed user message
   - Run cosine similarity search in pgvector
   - Return top 10 matching facts
4. Update UI to show relevance scores

**Pros:**
- Fuzzy matching ("TypeScript" finds "typescript-style")
- Better fact relevance
- Matches user intent better

**Cons:**
- Adds vector DB complexity
- Requires embeddings API calls (costs)
- May retrieve irrelevant facts (hallucination risk)

**Effort:** 12-16 hours

### Option C: Implement Auto-Extraction of Facts

**Approach:** Port agency memory extraction logic to chat. After each LLM response, call LLM to extract learnable facts.

**Changes:**
1. Add `long_term_memory.extract_and_store_memories()` call to chat flow
2. Add safety filter to reject command-like content (jailbreak protection)
3. Implement duplicate detection via content hash
4. Update UI to show extracted facts with accept/reject buttons

**Pros:**
- Automated memory building
- Consistent with agency memory system
- Reduces manual effort

**Cons:**
- Adds LLM cost (one extraction call per message exchange)
- Requires safety validation to prevent poisoning
- Could extract irrelevant facts

**Effort:** 16-20 hours

### Option D: Hierarchical Summarization

**Approach:** When >3 summaries exist, summarize the summaries. Create summary of summaries.

**Changes:**
1. Add `parentSummaryId` column to `conversationSummaries`
2. Batch summaries (e.g., every 3-5 summaries)
3. Create meta-summary of batch
4. Inject meta-summary instead of individual summaries

**Pros:**
- Preserves more historical context
- Better compression ratio
- No loss of early context

**Cons:**
- Adds DB schema complexity
- Requires LLM call to create meta-summaries
- Harder to debug (nested abstractions)

**Effort:** 10-14 hours

### Option E: Implement All (Complete Memory System)

**Approach:** Combine semantic search + auto-extraction + hierarchical summarization.

**Pros:**
- Most sophisticated memory system
- Best context relevance and coverage
- Aligns with agency memory

**Cons:**
- High complexity (12-14 week integration)
- Increased LLM costs (embeddings + extraction + meta-summaries)
- More moving parts to maintain

**Effort:** 40-50 hours (phased)

---

## Recommendation

**Priority 1 (Quick Win):** Auto-extraction of facts (Option C, 16-20 hours)
- Reuses existing agency memory pattern
- Immediate benefit: memories grow automatically
- Low risk: safety filter + duplicate detection proven in agency system
- Cost: Reasonable (one LLM call per message pair)

**Priority 2 (If Needed):** Semantic search (Option B, 12-16 hours)
- Addresses "find similar facts" use case
- Requires decision on embedding provider (OpenAI vs. local)
- Run after auto-extraction is stable

**Not Recommended:** Hierarchical summarization (Option D)
- Current 5-summary limit not yet a problem
- Adds complexity with marginal benefit
- Revisit if users report lost context

**Not Recommended:** Full implementation (Option E)
- Too much up-front complexity
- Phased approach (A → C → B) is lower risk

---

## Open Questions

1. **Should entity memory auto-extract be enabled for all chats or opt-in?**
   - All (default): Users get automatic memory building
   - Opt-in: Users choose whether to learn from chats
   - Recommendation: Opt-in, with toggle in MemoryPanel

2. **Should extracted facts require user approval before storing?**
   - Yes: UI shows "3 new facts detected, accept?" → better control
   - No: Auto-store, user can delete later → simpler
   - Recommendation: Show preview in MemoryPanel sidebar, auto-store after 10s

3. **Should memory decay be added to chat memories (like agency)?**
   - Yes: Memories become less important over time
   - No: Keep forever (current behavior)
   - Recommendation: No, unless user requests. Chat is shorter-lived than agency runs.

4. **Should there be per-conversation memory isolation?**
   - Yes: Each chat has separate memories
   - No: Memories are project-scoped (current)
   - Recommendation: No change for now. Project scope works; conversation scope adds complexity.

5. **What's the maximum entity memory per user before pruning?**
   - Current: No enforced limit (only soft delete by age)
   - Proposal: 500 entity memories per user, auto-prune oldest low-importance
   - Recommendation: Defer; monitor usage first

---

## Key File Locations

### Frontend

- **Memory Panel UI:** `apps/web/client/src/components/chat/MemoryPanel.tsx` (762 lines)
- **Chat Page:** `apps/web/client/src/pages/Chat.tsx` (uses MemoryPanel)

### Backend

- **tRPC Router:** `apps/web/server/routers/memory.ts` (509 lines)
  - Procedures: getEntityMemories, upsertEntityMemory, deleteEntityMemory, getSummaries, getChatContext, checkSummarization, getSummaryPrompt, saveSummary, processMemory, compactConversation, getConversationSummary, clearOldMemories, deleteImageFromMemory, pinImageToMemory

- **Memory Service:** `apps/web/server/services/memoryService.ts` (1000+ lines)
  - Core: buildChatContext, contextToMessages, needsSummarization, generateSummaryPrompt, saveSummary, processConversationMemory, getEntityMemoriesForContext, upsertEntityMemory, cleanupExpiredMemories

- **Multimodal Retrieval:** `apps/web/server/services/multimodalRetrievalService.ts`
  - Hybrid ranking for images (not text)

- **Vector Provider:** `apps/web/server/services/vectorProvider.ts` (1000+ lines)
  - Abstract adapter for chromadb, pgvector, cloudflare_vectorize
  - NOT used for chat memory (images only)

### Database

- **Drizzle Schema:** `apps/web/drizzle/schema.ts`
  - conversations (line ~1307)
  - conversationSummaries (line ~1474)
  - entityMemories (line ~1508)
  - multimodalMemoryItems, multimodalMemoryVectors, multimodalMemoryLinks (line ~6108)

### Python Backend (Optional, Agency Only)

- **Long-Term Memory Service:** `python-backend/app/services/long_term_memory.py` (414 lines)
- **Model:** `python-backend/app/models/agency_agent_memories.py` (97 lines)
- **Tests:** `python-backend/tests/unit/test_long_term_memory.py`

---

## Summary

SmartSpecPro's chat memory system is **well-designed for its current use case** (manual memory management) but lacks **semantic retrieval** and **auto-learning**. The three-tier architecture (buffer + summaries + entity) cleanly separates concerns and handles token budgeting well.

**Next evolution:** Auto-extraction of facts (Option C) would be a high-value, low-risk enhancement, reusing proven agency memory patterns.

**Not recommended for now:** Vector DB integration for chat text (entity memories are categorical, not semantic). Keep pgvector for images only.
