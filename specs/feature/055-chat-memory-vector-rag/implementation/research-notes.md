# Research Notes — Feature 055 Chat Memory Retrieval Upgrade

## What the Codebase Already Does

- `apps/web/client/src/components/chat/ChatView.tsx` already calls `memory.getChatContext` before each streamed LLM request.
- `apps/web/server/routers/memory.ts` already exposes `getChatContext`, which delegates to `buildChatContext`.
- `apps/web/server/services/memoryService.ts` already assembles persona context, entity memories, summaries, buffer messages, and vector-aware retrieval.
- `apps/web/server/services/scopedMemoryService.ts` already implements hybrid keyword + vector + recency search and also has `getRuleMemories()`.
- `apps/web/server/services/factExtractor.ts` already extracts durable facts and writes them back into scoped memory with embedding queueing.

## Key Integration Observations

- The main leverage point is server-side context assembly, not the chat UI.
- The existing pipeline is close to retrieval-first already, but the policy needs to be made explicit so every turn uses persona, session context, long-term memory, and RAG in a consistent order.
- The current vector search path should stay tenant-scoped and user-scoped so retrieval does not leak memory across users.
- `processConversationMemory()` remains the correct writeback entry point for archive, fact extraction, chunking, and summarization.

## Risks Found During Research

- Latency can grow if retrieval depth is unbounded.
- Prompt noise can increase if vector results are always injected without ranking or budget limits.
- A frontend-side vector search would duplicate work and make behavior harder to reason about.
- Any change to the retrieval order must preserve current fallback behavior for non-vector or degraded environments.
