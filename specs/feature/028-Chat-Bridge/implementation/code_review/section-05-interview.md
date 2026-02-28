# Section 05 Code Review Interview

## Auto-fixes Applied

1. **channelRefId null check** — Added guard in emitEgress loop to skip bindings with null channelRefId
2. **syncMode filter** — Added `inArray(syncMode, ['two_way', 'notify_only'])` to queryActiveBindings
3. **parseInt validation** — Added NaN check before querying with parsed conversationId
4. **Dead jobId variable removed** — Removed unused `jobId` variable (dedup will be handled in deliveryQueue section-06)
5. **Test data fix** — Changed test `conversationId` from "conv-1" to "123" (numeric string for chat type)

## Deferred to Later Sections

- **Routing stubs** (issues #5, #6): ingest() routing to actual chat/agency pipelines deferred to section-07 (processMessageServerSide) and section-08 (pipeline hooks)
- **sourceChannel metadata** (issue #7): will be set when section-07 implements actual message saving
- **Deterministic job ID** (issue #1): will be implemented in section-06 deliveryQueue via BullMQ jobId option
- **Structured logger** (issue #4): codebase uses console.* throughout (confirmed in previous sections) — not switching to structured logger

## Let Go

- Schema mock fragility (issue #13): acceptable tradeoff for test isolation
- splitForTelegram HTML-safety (issue #11): edge case for very long messages, acceptable for Phase 1
