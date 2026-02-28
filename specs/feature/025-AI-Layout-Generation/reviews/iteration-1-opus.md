# Opus Review

**Model:** claude-opus-4-6
**Generated:** 2026-02-26T18:00:00Z

---

## Critical Issue 1: `executeSkill()` for `llm-only` Mode Does NOT Generate Content

**Severity: BLOCKER**

For `llm-only` and `enhance-prompt` execution modes, `executeSkill()` simply echoes back the user's prompt. It does NOT invoke any LLM. The actual LLM call happens in the chat router, which combines the skill's system prompt with the user message and routes to the LLM gateway.

This means Phase 1 will return the user's topic string as-is, not an article. Phase 3 will return raw keywords as-is, not an enhanced prompt.

The plan needs to either:
1. Bypass `executeSkill()` and call the LLM directly, loading the skill's system prompt from the skill definition.
2. Create a new execution path in the skill executor for server-side orchestration.

## Critical Issue 2: `addSlideToDeck` Version Management Without Transaction

**Severity: HIGH**

The import service wraps all slide insertions in a database transaction. The AI draft service should do the same. Also, the starting `expectedVersion` must be read inside the transaction.

## Critical Issue 3: `generateImageAsync` Returns a Task, Not an Image URL

**Severity: HIGH**

`generateImageAsync()` returns a `MediaTask` (task ID for async polling), not an image URL. The orchestrator must poll the media task status until completion and extract the final URL.

## Critical Issue 4: `userToken` Not Available in Background Context

**Severity: HIGH**

`executeSkill()` and `generateImageAsync()` both require a `userToken` parameter. Since the pipeline runs as a background task, the token must be captured at mutation time and passed into the orchestrator. JWT TTL must be sufficient for pipeline duration.

## Issue 5: `callLLMStructured` Duplicates Existing Infrastructure

**Severity: MEDIUM**

The codebase has `invokeLLM()` in `llm.ts` and full infrastructure in `llmRoutes.ts`. Build on top of these, not a parallel fetch() implementation.

## Issue 6: Redis Lock Without Cleanup Guarantee

**Severity: MEDIUM**

120s TTL may expire while pipeline is still running. Use longer TTL (180-300s) with heartbeat renewal. Use `SET key value NX EX ttl` for atomic acquisition.

## Issue 7: Feature Flag on Client Side

**Severity: MEDIUM**

`isPresentationAIGenerationEnabled()` reads `process.env` (server-only). Client must ONLY use the tRPC availability query result. Function should be server-only.

## Issue 8: No Cancellation Mechanism

**Severity: MEDIUM**

No way for user to cancel a running draft. Add `ai.cancelDraft` mutation + Redis cancellation flag + Cancel button in UI.

## Issue 9: No System-Wide Rate Limiting

**Severity: MEDIUM**

No system-wide semaphore for AI draft generation. Consider max 5 concurrent drafts across all users.

## Issue 10: SVG Catalog Extraction

**Severity: LOW-MEDIUM**

Grep for all importers of `SvgGraphic` and `SVG_GRAPHICS` before refactoring.

## Issue 11: Missing tenantId Flow

**Severity: MEDIUM**

`getProviderForModel()` does not take tenantId. Provider resolution is currently global.

## Issue 12: Availability Schema Breaking Change

**Severity: MEDIUM**

Make `aiGenerationEnabled` optional: `z.boolean().optional()`.

## Issue 13: Article Truncation Arbitrary

**Severity: LOW**

2000 word limit unnecessary given modern LLM context windows. Better to limit in skill prompt.

## Issue 14: No Idempotency for Phase 6

**Severity: MEDIUM**

Wrap Phase 6 slide insertions in a database transaction (same as import service).

## Issue 15: `p-map` Not Available

**Severity: LOW**

Use native Promise.all with chunked batches instead of adding new dependency.

## Issue 16: No Cleanup of Generated Images on Failure

**Severity: LOW**

Orphaned images on pipeline failure. Track asset URLs, clean up or mark for garbage collection.

## Issue 17: Credit Estimate Accuracy

**Severity: LOW**

Pre-check estimates are inherently inaccurate. 20% buffer may not be sufficient.

## Issue 18: Missing Test Strategy for Background Task

**Severity: LOW-MEDIUM**

Testing fire-and-forget with Redis progress updates is non-trivial. Plan needs testing approach for async pipeline.
