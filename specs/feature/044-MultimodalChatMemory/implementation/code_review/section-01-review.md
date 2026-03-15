# Code Review: Section 01 — Schema and Migration

## HIGH

1. **Migration SQL not in diff** — the migration file `0080_shocking_pete_wisdom.sql` was generated and applied manually (tables confirmed in DB), but not in the schema.ts diff. It is staged separately as a new file in `apps/web/drizzle/`. This is resolved — the migration was applied correctly.

2. **`multimodal_memory_items.tenantId/userId` nullable** — unlike `media_assets`, memory items allow NULL tenantId. For retrieval queries this creates a tenant-isolation gap: any row filter on tenantId silently skips NULL rows. *Auto-fix: add `.notNull()` to tenantId and userId on multimodalMemoryItems, consistent with media_assets.*

3. **`multimodal_memory_vectors.embedding` nullable** — a vector row with NULL embedding is useless and will crash cosine similarity queries. *Auto-fix: add `.notNull()` to embedding column.*

## MEDIUM

4. **Missing `(tenantId, userId)` index on media_assets** — hot path for retrieval is "all assets for user X in tenant Y"; current `(tenantId, projectId)` doesn't serve that. *Auto-fix: add index.*

5. **No unique constraint on checksumSha256** — dedup requires uniqueness, not just an index; concurrent uploads race. *Decision: acceptable for MVP — service-layer dedup is good enough; production hardening can add unique constraint in section 12.*

6. **No unique constraint on memory_links (from, to, relationType)** — duplicate edges silently corrupt graph. *Auto-fix: add unique index.*

7. **`conversation_visual_state` missing tenantId** — inconsistent with all other tables; creates defense-in-depth gap. *Auto-fix: add tenantId column.*

## LOW

8. **`JSON.parse` fragility in fromDriver** — acceptable for now; pgvector stable format.

9. **Backward compat test doesn't validate deserialization** — acknowledged; column type is TypeScript-only, no DB change needed.

10. **vector type not exported** — acceptable for current scope.

## Interview Decisions

- **Issue 2** (tenantId nullable on memory items): AUTO-FIX — add `.notNull()` consistent with media_assets
- **Issue 3** (embedding nullable): AUTO-FIX — add `.notNull()`
- **Issue 4** (missing tenantId+userId index): AUTO-FIX — add index
- **Issue 6** (no unique on links): AUTO-FIX — add uniqueIndex
- **Issue 7** (visual state missing tenantId): AUTO-FIX — add tenantId column
- **Issue 5** (dedup uniqueness): LET GO for now
