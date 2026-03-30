# Adversarial Self-Review — claude-plan.md

## Round 1

### Approach
Role-playing as a skeptical senior architect reviewing the plan for gaps, assumptions, and ambiguity.

### Findings

**1. FIXED: Cross-conversation chunk search needs projectId index**
The plan enables cross-conversation L2 search (interview decision) but the message_chunks schema only has `(tenantId, userId)` and `(conversationId, chunkIndex)` indexes. Cross-conversation search would filter by `projectId` — needs an index.
→ **AUTO-FIX:** Added `(tenantId, projectId)` index note in Section 2.1.

**2. FIXED: Chunk cleanup uses hardcoded 90 days but archive cleanup is per-tenant configurable**
Inconsistency between Section 9.1 (per-tenant retention from system_settings) and 9.2 (hardcoded 90 days).
→ **AUTO-FIX:** Chunk cleanup should also read per-tenant retention.

**3. OK: No concern about embedding API latency in the chat hot path**
`generateQueryEmbedding()` adds a network round-trip to Python backend on every chat message. With Redis cache (5min TTL), most queries within a conversation will hit cache. Cold start: ~100-200ms. Acceptable — current `buildChatContext` already takes 50-200ms.

**4. OK: Memory Panel UI update is Phase 2+ (not blocking)**
The UI change to show extracted facts alongside entity memories doesn't need to be in Phase 0/1. Factually correct — facts are stored behind the scenes first, UI comes later.

### Changes Applied
- Section 2.1: Added note about `(tenantId, projectId)` index for cross-conversation search
- Section 9.2: Changed from hardcoded 90 days to per-tenant retention from system_settings

### Verdict: Plan is solid. No significant gaps found.
