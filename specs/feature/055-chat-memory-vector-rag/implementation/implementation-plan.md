# Implementation Plan — Feature 055 Chat Memory Retrieval Upgrade

## Objective

Make each chat turn go through a retrieval-first context assembly pipeline so the model sees persona memories, session chat memories, long-term memories, and vector RAG hits before it answers.

## Current Codebase Fit

The foundation already exists. `ChatView` fetches `memory.getChatContext` before streaming, `memory.ts` delegates to `buildChatContext`, and `memoryService.ts` already assembles persona, rules, summary, buffer, and vector-aware memory context. `scopedMemoryService.ts` already provides hybrid search, and `factExtractor.ts` already stores learned facts back into memory.

## Implementation Approach

1. Keep the frontend thin.
- Leave the chat page responsible for sending the current message and streaming the response.
- Do not add a separate client-side vector search step.
- Continue to request server-built context before each streamed response.

2. Tighten the server retrieval policy in `buildChatContext()`.
- Make the retrieval order explicit: persona and rules first, then session summaries and recent buffer, then long-term memory, then vector RAG, then the final user turn.
- Use query intent, `memoryMode`, and token budget to decide how deep to search.
- Preserve the existing fallback path when vector memory is disabled or unavailable.

3. Keep memory writeback in `processConversationMemory()` aligned with the new retrieval policy.
- Ensure archive, fact extraction, chunk indexing, and summarization remain sequenced as a single post-turn pipeline.
- Keep extraction and summarization resilient so a failed memory writeback does not block chat response delivery.

4. Preserve tenant and user boundaries everywhere.
- Keep retrieval scoped to the authenticated conversation owner.
- Keep agency/skill context builders separate unless a shared helper is clearly safe to reuse.

5. Add regression coverage before changing behavior.
- Update service tests around `buildChatContext()` and `processConversationMemory()`.
- Add or adjust chat router tests if the retrieval policy changes request shape or message ordering.
- Verify the chat UI still streams normally and does not depend on a new client-side search path.

## Affected Files and Modules

- `apps/web/server/services/memoryService.ts`
- `apps/web/server/routers/memory.ts`
- `apps/web/server/services/scopedMemoryService.ts`
- `apps/web/server/services/factExtractor.ts`
- `apps/web/client/src/components/chat/ChatView.tsx`
- `apps/web/server/services/__tests__/...`
- `apps/web/server/routers/__tests__/...`

## Risks and Mitigations

- Risk: retrieval latency increases. Mitigation: keep adaptive depth and token budgets.
- Risk: prompt noise from too many memories. Mitigation: keep ranking, deduping, and budget caps in the server layer.
- Risk: regressions in non-chat flows. Mitigation: preserve current fallback behavior and keep agency flows isolated.
- Risk: memory injection or cross-user leakage. Mitigation: keep tenant and ownership checks in every retrieval path.

## Acceptance Criteria

- Every normal chat turn is answered with server-built context that includes relevant persona, session, long-term, and vector-derived memory when available.
- The system still works when vector retrieval is disabled or unavailable.
- Existing streaming behavior remains intact.
- Memory writeback still extracts and persists useful facts after the assistant response.
- Tests cover both the happy path and the fallback path.
