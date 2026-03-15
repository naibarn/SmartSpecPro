# Opus Review

**Model:** claude-opus-4
**Generated:** 2026-03-14T00:00:00Z

---

# Review: Feature 044 — Multimodal Chat Memory Implementation Plan

## Overall Assessment

This is a well-structured and thorough plan. The phased rollout is sensible, the schema design is reasonable for the stated scale, and the integration points with the existing memory system are correctly identified. That said, I found several significant issues ranging from a breaking type change to missing error handling patterns and a few architectural blind spots.

---

## Critical Issues

### 1. `contextToMessages()` return type is string-only -- plan does not address this

**Section 5.4** says to extend `contextToMessages()` to include `image_url` content blocks. However, the current function signature at `/home/dev/projects/SmartSpecPro/apps/web/server/services/memoryService.ts:842-844` returns:

```typescript
Array<{ role: "system" | "user" | "assistant"; content: string }>
```

The `content` field is typed as `string`, not as the OpenAI-style multimodal content array (`Array<{type: "text", text: string} | {type: "image_url", image_url: {url: string}}>`). Changing this return type will break **every consumer** of `contextToMessages()` across the codebase. The plan does not mention this type migration at all. You need to either:
- Change the type to a union (`string | ContentPart[]`) and audit all callers, or
- Return a separate field for image content parts rather than mixing them into the content string.

This is a significant breaking change that deserves its own subsection and an enumeration of all affected call sites.

### 2. Budget allocation math does not add up -- and changes existing behavior

**Section 5.3** changes the budget split from the current system to:
- Entity: 20% (was 40% of post-system-prompt budget)
- Visual: 15%
- Summary: 25% (was 60%)
- Buffer: 40%

But the current code at line 682-684 shows `buildChatContext()` takes a `contextBudget` parameter and the percentages are internal to that function. The plan halves the entity context allocation from 40% to 20% and cuts summary from 60% to 25%. This is a **functional regression** for non-visual conversations. Users who never upload images will get worse entity and summary recall. The visual memory budget should come from a proportional reduction, or better yet, only be allocated when visual context actually exists (i.e., if no images are in scope, redistribute that 15% back to the other tiers).

### 3. No idempotency on the vision analysis pipeline

**Section 6.1** says "for each image attachment, call `mediaAssetService.createAssetFromAttachment()`" and then dispatch a Celery task. If the message creation partially fails and retries, or the user somehow uploads the same image twice, there is no deduplication guard. The `checksumSha256` column exists in the schema (Section 3.1) but is never referenced in any service logic. The plan should explicitly state:
- Deduplicate on `checksumSha256` before creating assets
- Use `perceptualHash` for near-duplicate grouping
- Make the Celery task idempotent (check if `media_asset_analysis` row already exists before re-analyzing)

---

## Security Concerns

### 4. Signed URL leakage to LLM providers

**Section 9.3** says all image URLs sent to LLM context must be signed with 1-hour expiry. However, when you send these signed URLs to Gemini (or any LLM provider) for either vision analysis or as image context, the signed URL is now in the LLM provider's possession. This is acknowledged implicitly but the plan should note:
- Signed URLs should be scoped to GET-only (no write permissions)
- The S3/R2 bucket should not contain other sensitive content reachable via path traversal on the same signing key
- Consider whether the 1-hour TTL is appropriate given that LLM providers may cache or log requests

### 5. Python vision endpoint has no authentication mentioned

**Section 6.2** defines `POST /api/v1/vision/analyze` but does not mention any authentication. The existing Python backend uses `SMARTSPEC_WEB_GATEWAY_TOKEN` for internal Node-to-Python calls. The plan should explicitly state that this endpoint is protected by the same gateway token, not exposed publicly.

### 6. OCR PII redaction references a function that may be limited

**Section 9.4** mentions passing OCR text through `piiFilter.ts`. Looking at the actual import in `memoryService.ts`, the file exports `sanitizeEntityForStorage` and `filterEntityFacts`. These are entity-fact-specific filters, not general-purpose PII redactors. OCR text is unstructured and may contain credit card numbers, phone numbers, addresses, etc. The plan should verify that `piiFilter.ts` handles arbitrary text, or specify building a new OCR-specific redaction function.

---

## Architectural Issues

### 7. Cross-service data flow for analysis results is underspecified

**Section 6.2** says the Celery task "stores result via callback to Node API or directly to DB (follow existing media_tasks pattern)." This is ambiguous. The existing `media_tasks` pattern in the Python backend writes to its own tables via SQLAlchemy, but the new tables (`media_asset_analysis`, `multimodal_memory_items`, `multimodal_memory_vectors`) are defined in Drizzle (Node.js schema). The plan needs to decide:
- Does the Python backend write directly to these tables (requires SQLAlchemy model definitions for the new tables)?
- Or does it callback to a Node.js endpoint that handles the write?

Either approach has implications. Direct DB writes mean maintaining parallel schema definitions. Callbacks add latency and failure modes. Pick one and document it.

### 8. Embedding dimension compatibility is assumed but not guaranteed

**Section 4.3** states Gemini Embedding 2 (768-dim) and Cloudflare bge-base (768-dim) produce compatible embeddings. Same dimensionality does not mean the same embedding space. Vectors from Gemini and vectors from Cloudflare will NOT be comparable via cosine similarity. If a user's images are embedded with Gemini but a query is embedded with Cloudflare (or vice versa during a provider switchover), retrieval quality will be terrible. The plan should:
- Track which provider generated each embedding (the schema has this)
- Only search within the same provider's vectors
- Re-embed existing vectors when switching providers (migration script)

### 9. Six new tables is a lot of schema surface for Phase 0

**Section 12, Phase 0** says to add all 6 tables before any functional code exists. This front-loads schema debt before any validation. Consider adding only `media_assets` and `media_asset_analysis` in Phase 0, then `multimodal_memory_items` + `multimodal_memory_vectors` in Phase 1 when they are actually used. `conversation_visual_state` and `multimodal_memory_links` can wait for Phase 2-3. This reduces the risk of needing schema changes before the tables even have data.

---

## Performance Concerns

### 10. LLM call for every message with potential image references

**Section 7.1** describes an LLM call (Gemini Flash) for reference resolution on messages that reference images. **Section 7.2** mentions a "fast regex pre-filter" to skip resolution, but does not define the regex. For Thai language support, a regex that catches all image-referencing phrases (ordinal, semantic, positional) is extremely hard to write correctly. If the regex is too broad, you get an LLM call on nearly every message. If too narrow, references are missed. The plan should define the specific keywords/patterns or accept the cost of calling the resolver on every message (and budget accordingly).

### 11. `conversation_visual_state` as a single-row JSON is a concurrency risk

**Section 3.5** stores `recentAssetIds`, `activeAssetIds`, etc. as JSONB arrays on a single row keyed by `conversationId`. If two messages arrive near-simultaneously (e.g., user sends two images in quick succession), the read-modify-write on the JSONB column is a classic lost-update problem. Use either:
- PostgreSQL `jsonb_insert` / array append operations in a single UPDATE statement
- A row-per-asset junction table instead of a JSONB array
- Explicit row-level locking (`SELECT ... FOR UPDATE`)

### 12. HNSW index parameters may be premature

**Section 3.4** specifies `m=16, ef_construction=128` for the HNSW index. At <10K vectors, a flat scan or IVFFlat index would be simpler and the HNSW build overhead is unnecessary. More importantly, HNSW index build locks the table during creation on large inserts (the backfill). At 10K scale this is fine, but the plan should note that the index should be created AFTER the backfill, not before.

---

## Missing Considerations

### 13. No error handling for failed vision analysis

What happens when the Celery task fails (Gemini API down, rate limited, image corrupt)? The plan does not describe:
- Retry policy (how many retries, backoff)
- What state the `media_assets` row is left in (no `status` column exists)
- Whether the image is still usable as a normal attachment (it should be)
- How to re-trigger analysis for failed assets

Add a `status` column to `media_assets` (e.g., `pending`, `analyzed`, `failed`, `nsfw_blocked`) so the system can distinguish between "not yet analyzed" and "analysis failed."

### 14. No consideration of image format/size limits

The plan assumes all uploaded images can be sent to Gemini for analysis. But:
- What is the maximum image size Gemini accepts?
- What formats are supported (WebP, HEIC, SVG)?
- Should images be resized/converted before analysis?
- What about animated GIFs or very large DSLR photos?

The `mediaAssetService` should validate and potentially transcode images before dispatching to the vision pipeline.

### 15. No mention of the `memory.ts` router

**Section 13** lists `apps/web/server/routers/memory.ts` as a modified file for the delete/pin mutations, but there is no mention of whether this router already exists. If it does not, it needs to be created and registered in the tRPC app router. If it does, the plan should reference the existing endpoints.

### 16. Missing cleanup/TTL for visual memory

The plan has no mention of memory expiration. If a user uploads thousands of images over months, the `multimodal_memory_items` table grows unbounded. Consider:
- A TTL or archival policy for low-salience items not accessed in N days
- A per-user or per-project cap on visual memory items
- Pruning vectors for archived items to save storage

### 17. No test strategy

The plan has no section on testing. For a feature this complex, you need at minimum:
- Unit tests for each new service
- Integration test for the ingestion pipeline (upload -> asset -> analysis -> memory -> vector)
- Integration test for retrieval (query -> resolve references -> vector search -> context assembly)
- Test for the budget allocation changes (ensure non-visual conversations are not degraded)
- Test for NSFW blocking (analysis with safety labels -> no memory creation)

### 18. Feature flag gating is mentioned but not detailed

**Section 12** mentions `MULTIMODAL_MEMORY_ENABLED` but does not specify where the gates go. At minimum, gates are needed at:
- Upload hook in `chat.ts` (skip asset creation if flag is off)
- `buildChatContext()` (skip visual memory assembly if flag is off)
- Python vision endpoint (reject requests if flag is off)
- Retrieval service (return empty results if flag is off)

The flag also does not appear in the existing `featureFlags.ts` file (confirmed via grep), so it needs to be added with the correct tenant-scoping pattern.

---

## Minor Issues

### 19. Line number references may be stale

The plan references specific line numbers (e.g., `memoryService.ts:670`, `schema.ts:1372`, `chat.ts:865`). Given the heavy modifications visible in the git status, these line numbers may already be inaccurate. Consider referencing function names or section markers instead.

### 20. `projectId` as varchar(100) but no enforcement

Multiple tables use `projectId` varchar(100) but there is no FK constraint or validation. If the project system uses UUIDs or numeric IDs, the varchar(100) may be overly permissive. Check what the existing project identification pattern is.

### 21. The backfill script (Section 6.3) needs rate limiting for credits too

The backfill queues vision analysis for existing images. If a user has 200 old images, the backfill would deduct ~100 credits worth of vision analysis from their account without their knowledge. The plan should either skip credit deduction for backfill, or make backfill analysis opt-in per user.

---

## Summary of Recommended Changes

1. **Address the `contextToMessages()` type break** -- this is the highest-risk code change in the plan.
2. **Make budget allocation adaptive** -- do not degrade non-visual conversations.
3. **Add a `status` column to `media_assets`** for pipeline state tracking.
4. **Specify the Python-to-Node data flow** for analysis results (direct DB or callback).
5. **Do not mix embedding providers** for search -- track and isolate by provider.
6. **Add idempotency guards** on asset creation and analysis dispatch.
7. **Add a testing section** with specific test scenarios.
8. **Defer unused tables** to the phases that actually need them.
9. **Handle backfill credit implications** explicitly.
10. **Document the Python endpoint authentication** requirement.
