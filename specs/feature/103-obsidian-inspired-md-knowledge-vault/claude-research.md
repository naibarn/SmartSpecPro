# Research Notes

## Research Decision (Auto)

- Codebase: yes. The feature extends an existing TypeScript monorepo with a mature `apps/web` Library stack, existing document routes, Markdown storage/versioning, permission checks, search, agent runtime, and MCP surfaces.
- Web topics: yes. The spec explicitly depends on Obsidian-inspired note navigation, backlinks, properties, graph view, bases, canvas, quick switching, and file-backed storage models.
- Testing: existing setup. `apps/web/package.json` uses `vitest run` for tests and `tsc --noEmit` for type checking. The repo already contains router, service, schema, runtime, and MCP security tests that match this feature's needs.

## Codebase Findings

### Existing product and service foundations

- `apps/web/client/src/pages/DocumentManagement.tsx` is already the dedicated workspace for Library / Document Management and is the right entry point for a knowledge-vault layer.
- `apps/web/server/routers/library.ts` already exposes the main Library TRPC surface, including search, list, save markdown, get markdown content, sharing, trash, and new scaffolded context-pack procedures.
- `apps/web/server/services/libraryService.ts` already owns item CRUD, search, markdown save, version history, restore, sharing, and indexing job handoff.
- `apps/web/server/_core/mcpRegistry.ts` already exposes owner-bound RAG search and ingest flows through delegated worker aware MCP tools. This is the correct insertion point for future narrow `context_packs.list/resolve` tools.
- `apps/web/server/services/contextPackBuilder.ts`, `apps/web/server/services/contextEngineAdapter.ts`, and `apps/web/server/services/agentRuntime/requestBuilder.ts` already provide a shared runtime context pipeline with `durable_memory` and `retrieved_evidence` tiers. The knowledge-vault feature should plug into this pipeline rather than inventing a second memory system.

### Existing permission and safety boundaries

- `libraryRouter.search` resolves tenant context, checks the Library feature flag, constructs a Library actor, and gates private-vault access before delegating to `searchLibraryItems`.
- `searchLibraryItems(...)` filters by tenant, folder, scope, item metadata, ACL rows, group memberships, and private-vault visibility before returning results. This is the existing safety baseline for any derived relationship or context-pack read surface.
- Private-vault state is already mediated through `createLibraryActor(...)` and `validatePrivateVaultAccessToken(...)`. New knowledge surfaces should reuse this actor model and fail closed when the vault is locked.

### Current retrieval behavior

- Current owner-bound RAG search in `mcpRegistry.ts` calls `searchLibraryItems(...)` with keyword/vector hybrid search over `library_items` and `library_chunks`.
- The current system is document-centric and chunk-centric. It can retrieve notes, but it does not yet maintain a first-class note relationship graph, canonical alias resolution, property catalog, or curated business-memory pack lifecycle.
- This means the new feature should improve both human navigation and agent-ready curation without breaking the current retrieval path.

### Partial implementation already present

- `apps/web/shared/libraryContextPacks.ts` already defines shared Zod and TypeScript contracts for context-pack CRUD, resolution, diagnostics, and runtime tiers.
- `apps/web/drizzle/schema.ts` already contains enums and tables for `library_context_packs` and `library_context_pack_members`.
- `apps/web/server/services/libraryContextPackService.ts` and new `libraryRouter` procedures are scaffolded but intentionally return `METHOD_NOT_SUPPORTED`.
- Planning should therefore treat context packs as a partially-started implementation stream, not a greenfield concept.

### Testing patterns already in use

- Router tests commonly use `appRouter.createCaller(ctx)` or directly invoke router procedures with mocked service functions.
- Service tests use `vitest`, module mocks, and lightweight fake DB objects. `apps/web/server/services/librarySearchService.test.ts` is a particularly relevant example because it verifies deterministic ranking, tenant filtering, and no-leakage behavior around `searchLibraryItems`.
- Runtime request builder tests already validate that context-pack refs and slot metadata are preserved and that runtime construction fails closed when context-pack creation fails.
- Schema tests exist for Drizzle enums/tables. This makes it reasonable to require schema-level regression coverage for any new knowledge-cache tables or enum extensions.

## Web Research: Obsidian Product Model

### Files remain the durable source of truth

- Obsidian stores note content in plain files, and Canvas boards in `.canvas` files using the open JSON Canvas format. Derived views are built on top of those files, not instead of them.
- Implication for SmartSpecPro: Markdown source and durable canvas records should remain authoritative, while knowledge caches stay rebuildable.

Sources:
- https://help.obsidian.md/data-storage
- https://help.obsidian.md/Plugins/Canvas

### Backlinks are more than reverse links

- Obsidian's Backlinks plugin distinguishes `linked mentions` from `unlinked mentions`, and exposes them together as part of note-centric navigation.
- Implication: SmartSpecPro should model both resolved backlinks and heuristic unlinked mentions, but keep ambiguous or unreadable notes out of the result set.

Source:
- https://help.obsidian.md/plugins/backlinks

### Quick switching is title-and-alias first, with recents and create-on-miss

- Obsidian's Quick Switcher searches by note name or alias, shows recent notes when the query is empty, and can create a note when there is no exact match.
- It also degrades its matching algorithm at large vault sizes to preserve responsiveness.
- Implication: SmartSpecPro should prioritize title, alias, recents, and deterministic disambiguation metadata in its opener, while adding scaling guardrails for large tenants.

Source:
- https://help.obsidian.md/plugins/quick-switcher

### Properties are a first-class management surface

- Obsidian supports YAML-backed note properties, a per-file property view, and an all-properties catalog that can sort by frequency and drive prefilled property search.
- Property types are global per property name across the vault.
- Implication: SmartSpecPro should treat frontmatter and extracted fields as a managed catalog, not just passive metadata blobs.

Sources:
- https://help.obsidian.md/properties
- https://help.obsidian.md/plugins/properties

### Search and views are property-aware

- Obsidian Search supports property search syntax. Bases build repeatable views from note properties and file properties, and the Bases docs explicitly distinguish Markdown-only note properties from file properties that exist for all file types.
- The Bases syntax docs also note that backlink-style fields can be performance heavy and may not auto-refresh immediately.
- Implication: SmartSpecPro should keep note properties Markdown-first, expose metadata-only behavior for non-Markdown files, and set clear freshness/performance expectations for relationship-derived views.

Sources:
- https://help.obsidian.md/plugins/search
- https://help.obsidian.md/bases
- https://help.obsidian.md/bases/syntax

### Graph view is local and global, with filterable visibility

- Obsidian provides both a global graph and a local graph around the active note, with controls for search filtering, attachments, tags, orphan visibility, and depth.
- It can optionally restrict to existing files only.
- Implication: SmartSpecPro should ship a local graph first, keep global graph behind limits, and expose filters that prevent non-existent or unreadable nodes from appearing.

Source:
- https://help.obsidian.md/plugins/graph

### Canvas is visual synthesis, not a replacement for note relationships

- Obsidian Canvas stores an infinite visual workspace in an open file format, but text-only cards do not automatically participate in backlinks.
- Implication: SmartSpecPro should treat Canvas as a synthesis layer over notes and evidence cards, not as a hidden source of relationship edges for RAG or backlinks in v1.

Source:
- https://help.obsidian.md/Plugins/Canvas

## Planning Implications

- The feature should preserve the current search and Library model while adding a rebuildable knowledge cache for Markdown notes.
- Canonical note identity must be stable and based on `library_items.id`; titles, aliases, and logical paths are user-facing references, not durable keys.
- Context packs should become the explicit bridge from curated vault knowledge into agent analysis, rather than silently expanding retrieval through graph edges.
- Unsupported surfaces must degrade intentionally for binary files and connector-backed references because both the codebase and the Obsidian model distinguish note-native behavior from file metadata behavior.

## Testing

- Framework: Vitest
- Type checking: `npm run -w @smartspec/web check`
- Primary commands:
  - `npm run -w @smartspec/web test`
  - `npm run -w @smartspec/web check`
- Recommended test layers for this feature:
  - pure parser/extractor tests
  - service tests for cache extraction, ACL filtering, and backfill behavior
  - router tests for context-pack and relationship endpoints
  - runtime tests for context-pack handoff into `durable_memory` / `retrieved_evidence`
  - MCP/delegated-worker security tests
  - UI tests for quick switcher, inspector, graph, and unsupported-state rendering
