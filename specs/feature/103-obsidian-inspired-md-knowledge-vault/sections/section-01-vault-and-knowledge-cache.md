# Section 01: Vault and Knowledge Cache

## Objective

Create the rebuildable knowledge layer that makes Markdown notes behave like a connected vault while preserving the current Library system as the durable source of truth.

## Scope

- canonical note identity and logical-path normalization
- Markdown extraction for frontmatter, aliases, tags, headings, and internal links
- relation cache and diagnostics
- tenant-scoped backfill, rebuild, and repair flows
- freshness and leakage-safe read semantics

## Likely Files and Modules

- `apps/web/server/services/libraryService.ts`
- `apps/web/server/services/libraryKnowledgeGraphService.ts`
- `apps/web/server/services/libraryKnowledgePropertyService.ts`
- `apps/web/server/services/libraryKnowledgeBackfillService.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/server/services/__tests__/...`

## Implementation Guidance

### 1. Keep Markdown and Library records authoritative

- Do not move source-of-truth note content out of existing Library/version tables.
- Store only rebuildable derivatives in knowledge-cache tables or compact read models.
- Use `library_items.id` as the only durable note identity.

### 2. Define deterministic link resolution

- Normalize user-facing references by title, alias, and logical path.
- Resolve every internal link into:
  - `resolved`
  - `ambiguous`
  - `unresolved`
  - `forbidden`
- Persist enough metadata for explainable diagnostics, but never leak forbidden note identity to unauthorized readers.

### 3. Build extraction and refresh hooks

- Extend markdown save, rename, move, restore, and relevant permission/share paths so they trigger cache refresh.
- Extract:
  - aliases
  - tags
  - typed properties
  - headings
  - outgoing internal links
- Recompute backlinks from outgoing edges rather than storing hand-maintained reverse links that can drift.

### 4. Add backfill and repair operations

- Provide tenant-scoped initial backfill for all existing Markdown notes.
- Track progress, failures, retry counts, and last successful rebuild times.
- Include an operator-visible rebuild/repair path for stale or corrupted cache state.

### 5. Enforce fail-closed reads

- Every knowledge read must re-check current actor visibility, tenant, group sharing, and private-vault unlock state.
- If cache state is fresher than permissions, the read path must still hide the note.
- If cache state is missing or stale beyond policy, surface a stale/partial diagnostic instead of guessing.

## Test-First Checklist

- Test: canonical note resolution for title, alias, logical path, and collision cases
- Test: extraction of frontmatter, tags, aliases, headings, and links from representative fixtures
- Test: refresh after save, rename, move, restore, and share-sensitive changes
- Test: tenant backfill coverage and retry behavior
- Test: hidden or locked notes remain invisible even when stale cache entries exist

## Acceptance Checkpoints

- Implementers can trust a stable canonical note id and resolution contract.
- Existing Markdown notes can be enrolled without manual resaves.
- Derived caches never outrun read-time permission checks.

## Implementation Notes

- Added parser/normalization foundations in:
  - `apps/web/server/services/libraryKnowledgePropertyService.ts`
  - `apps/web/server/services/libraryKnowledgeGraphService.ts`
  - `apps/web/server/services/libraryKnowledgeBackfillService.ts`
- Extended Library refresh metadata hooks for markdown save, item update, and restore flows in `apps/web/server/services/libraryService.ts`.
- Extended share/remove-share/update-share-permission and trash-restore refresh hooks so permission-sensitive read surfaces can treat cache assumptions as stale after ACL changes.
- Added persisted schema contracts for note cache state, relation cache rows, and tenant backfill runs in `apps/web/drizzle/schema.ts`.
- Added concrete tenant backfill and single-item refresh execution in `apps/web/server/services/libraryKnowledgeBackfillService.ts` that extracts Markdown knowledge, upserts note cache rows, replaces outgoing relation rows, and records run progress/failures.
- Added operator CLI entry point `npm run -w @smartspec/web backfill:library-knowledge -- --tenant-id=<tenant>` with optional `--item-id=<id>` repair mode.
- Added forward-only deployment migration `apps/web/drizzle/0157_library_md_knowledge_vault.sql`.
- Added focused tests for extraction/resolution helpers, backfill row building, backfill metadata helpers, markdown-save refresh hooks, and schema shape.
- Deferred to a follow-up implementation slice:
  - queue worker wiring that persists/consumes Library index job payload metadata and invokes the concrete backfill/refresh executor without bypassing vector indexing
  - operator UI affordances for repair and rebuild operations
