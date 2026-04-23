# Section 02: Migration Integration Tests and DB Safety

## Objective

Prove the Feature 103 and Feature 104 database surfaces are safe to deploy, idempotent where practical, and permission-safe under realistic database flows.

## Scope

- migration apply smoke tests
- migration idempotency checks
- schema/contract parity checks
- backfill write integration tests
- saved-view to context-pack DB flow tests
- ACL and private-vault leakage tests

## Likely Files and Modules

- `apps/web/drizzle/0157_library_md_knowledge_vault.sql`
- new migration after 0157 for index payload fields
- `apps/web/drizzle/__tests__/...`
- `apps/web/server/services/libraryKnowledgeBackfillService.ts`
- `apps/web/server/services/libraryKnowledgeReadService.ts`
- `apps/web/server/services/librarySavedViewService.ts`
- `apps/web/server/services/libraryContextPackService.ts`
- `apps/web/server/services/__tests__/...integration.test.ts`

## Implementation Guidance

### 1. Add DB integration smoke for migrations

- Apply migrations against a disposable test database.
- Verify all expected enums, tables, columns, indexes, and constraints exist.
- Re-run idempotent migrations when written with `IF NOT EXISTS` patterns.
- If Drizzle meta snapshots are required by team convention, generate/update them in the same slice.

### 2. Test core write flows with real DB behavior

- Seed tenant, users, Markdown library items, chunks, shares, and private-vault state.
- Run tenant backfill.
- Assert `library_knowledge_notes` and `library_knowledge_relations` rows are persisted.
- Update content and run single-note refresh.
- Assert old outgoing relations are replaced, not duplicated.

### 3. Test permission-sensitive reads

- Backlink source unreadable to actor must be hidden.
- Private-vault note names must not appear in unlinked mentions.
- Deleted notes must not resolve into context pack items.
- Revoked shares must stop appearing even if cache rows remain.

### 4. Test context-pack DB flows

- Create saved view.
- Execute saved view server-side.
- Publish saved view as view-backed context pack.
- Resolve pack.
- Mutate saved-view query or membership.
- Assert trusted pack becomes stale and `approvedForAgents` clears when appropriate.

### 5. Keep integration tests isolated

- Use existing `RUN_DB_INTEGRATION_TESTS` conventions where available.
- Keep unit tests fast and integration tests opt-in if local DB setup is expensive.
- Ensure test data uses unique tenant IDs to avoid collision.

## Test-First Checklist

- Test: 0157 and follow-up migration apply successfully on empty DB.
- Test: migration idempotency for `IF NOT EXISTS` migrations.
- Test: backfill writes note and relation cache rows.
- Test: single-note refresh replaces outgoing relations.
- Test: saved view publishes and resolves into a context pack.
- Test: hidden backlink source remains hidden.
- Test: private-vault locked note does not leak through mentions, graph, or pack resolve.
- Test: stale cache after share revocation does not grant access.

## Acceptance Checkpoints

- CI or opt-in DB tests can prove migration and core data flows.
- Teams can deploy the schema without relying only on unit tests.
- Leakage-sensitive DB behavior is covered by executable tests.
