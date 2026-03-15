# Integration Notes: Opus Review Feedback

## Suggestions Integrated

### 1. `contextToMessages()` type break (Critical #1) — INTEGRATED
The reviewer correctly identified that `content: string` must become `string | ContentPart[]`. The plan will add a subsection detailing the type migration: union type + audit of all callers. This is the highest-risk change.

### 2. Adaptive budget allocation (Critical #2) — INTEGRATED
Budget allocation should only apply the 15% visual share when visual context exists. When no images are in scope, redistribute back to entity (40%) and summary (60%) — preserving current behavior for non-visual conversations.

### 3. Idempotency guards (Critical #3) — INTEGRATED
Add checksumSha256 dedup check before creating assets and make Celery task idempotent (skip if analysis row exists).

### 4. Python endpoint authentication (Security #5) — INTEGRATED
Explicitly require `x-proxy-token` header (existing gateway token pattern) on `POST /api/v1/vision/analyze`.

### 5. Cross-service data flow (Architectural #7) — INTEGRATED
Decision: Python writes directly to DB via SQLAlchemy models for the new tables. This follows the existing `media_tasks.py` pattern where Python writes task results to shared PostgreSQL tables.

### 6. Embedding provider isolation (Architectural #8) — INTEGRATED
Search must filter by `provider` column. Never mix Gemini and Cloudflare vectors in the same similarity search. Add re-embedding migration script for provider switchover.

### 7. `status` column on `media_assets` (Missing #13) — INTEGRATED
Add `status` varchar(32) with values: `pending`, `analyzing`, `analyzed`, `failed`, `nsfw_blocked`. Enables retry and state tracking.

### 8. Image format/size validation (Missing #14) — INTEGRATED
Add validation step before vision dispatch: check supported formats, max 20MB, resize if >4096px.

### 9. Feature flag gating detail (Missing #18) — INTEGRATED
Document specific gate locations: chat.ts upload hook, buildChatContext(), Python endpoint, retrieval service.

### 10. Backfill credit handling (Minor #21) — INTEGRATED
Backfill analysis is system-cost (not charged to users). Backfill vision is opt-in via admin dashboard.

### 11. Concurrency on visual state (Performance #11) — INTEGRATED
Use PostgreSQL jsonb_array_append in single UPDATE statements to avoid lost-update. No read-modify-write cycle.

### 12. HNSW after backfill (Performance #12) — INTEGRATED
Create HNSW index after initial data load, not in the migration.

## Suggestions NOT Integrated

### Signed URL leakage (Security #4) — NOT INTEGRATED
Acknowledged as a valid concern, but this is inherent to any system that sends images to LLM providers. GET-only scoping is already the default for S3 presigned URLs. The 1-hour TTL is standard practice. No plan change needed — this is a general operational concern, not a design decision.

### OCR PII redaction scope (Security #6) — NOT INTEGRATED (deferred)
Valid concern but OCR PII redaction for arbitrary text (credit cards, phone numbers) is a substantial effort beyond the scope of this feature. Phase 1 will use the existing `piiFilter.ts` as-is. If OCR reveals sensitive patterns, a dedicated OCR PII filter will be added as a follow-up task.

### Defer tables to later phases (Architectural #9) — NOT INTEGRATED
Creating all tables upfront in a single migration is simpler operationally. Empty tables cost nothing, and having the schema ready avoids mid-feature migrations. The Drizzle migration system handles this cleanly.

### LLM resolver regex pre-filter (Performance #10) — NOT INTEGRATED
The reviewer is correct that Thai regex is hard. We'll use a simple keyword list (รูป, ภาพ, image, photo, picture) as a cheap pre-filter. If none of these appear in the message AND no images exist in conversation_visual_state, skip resolution entirely. This is good enough for Phase 1.

### memory.ts router (Missing #15) — NOT INTEGRATED
The router already exists (`apps/web/server/routers/memory.ts`). No new router creation needed.

### Cleanup/TTL (Missing #16) — NOT INTEGRATED (deferred)
Valid but premature for Phase 1 at <10K images/month. Will be addressed as a Phase 2+ enhancement when scale warrants it.

### Test strategy (Missing #17) — NOT INTEGRATED
Testing will be covered separately in `claude-plan-tdd.md` (the TDD plan). Not duplicated in the main plan.

### Line number staleness (Minor #19) — NOT INTEGRATED
Accepted — function names are more stable. But line numbers aid initial orientation. Will keep both where possible.

### projectId varchar enforcement (Minor #20) — NOT INTEGRATED
This matches the existing pattern across the codebase (entity_memories, conversation_summaries all use varchar projectId). No change needed.
