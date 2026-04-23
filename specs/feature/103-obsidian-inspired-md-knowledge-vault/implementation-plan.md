# Implementation Plan

## Objective

Extend the existing Library / Document Management surface into a markdown-first knowledge vault with metadata-driven access, note relationships, saved views, graph / canvas exploration, and explicit agent-memory handoff.

## Current-codebase fit

The repo already has the right base to build on:

- `DocumentManagement.tsx` already acts as the dedicated Library workspace.
- `mcpRegistry.ts` already exposes library-backed search flows that can later consume explicit context-pack resolution.
- `libraryService.ts` already handles item CRUD, search, markdown read/save, versions, sharing, and indexing jobs.
- `library_items` already has metadata, allowed scopes, folders, project ids, and markdown content support.
- The UI already has markdown preview/editing and version history.
- The workspace already includes interaction libraries that fit this feature well:
  - `cmdk` / `fuse.js` for quick switcher behavior
  - `reactflow` / `@xyflow/react` for graph or canvas surfaces
  - `tiptap` for note-centric editing

The plan should preserve these strengths and add a knowledge layer on top.

## Affected files and modules

Likely touch points:

- `apps/web/client/src/pages/DocumentManagement.tsx`
- `apps/web/client/src/components/library/DocumentLibraryTabs.tsx`
- `apps/web/client/src/components/library/DocumentPreviewPanel.tsx`
- `apps/web/client/src/lib/documentManagementUi.ts`
- `apps/web/server/_core/mcpRegistry.ts`
- `apps/web/server/routers/library.ts`
- `apps/web/server/services/contextPackBuilder.ts`
- `apps/web/server/services/agentRuntime/requestBuilder.ts`
- `apps/web/server/services/libraryService.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/shared/workerDelegation.ts`

Likely new modules:

- `apps/web/server/services/libraryKnowledgeGraphService.ts`
- `apps/web/server/services/libraryKnowledgePropertyService.ts`
- `apps/web/server/services/librarySavedViewsService.ts`
- `apps/web/server/services/libraryContextPackService.ts`
- `apps/web/server/services/libraryContextPackRuntimeAdapter.ts`
- `apps/web/server/services/libraryKnowledgeBackfillService.ts`
- `apps/web/client/src/components/library/KnowledgeInspectorPanel.tsx`
- `apps/web/client/src/components/library/KnowledgeGraphPanel.tsx`
- `apps/web/client/src/components/library/KnowledgeCanvasPanel.tsx`
- `apps/web/client/src/lib/libraryKnowledgeUi.ts`

## Implementation approach

1. Add a derived knowledge cache for markdown files.
2. Define canonical note identity, logical-path normalization, and link resolution states before building backlinks on top.
3. Parse frontmatter, tags, aliases, headings, and internal links during save / upload / rename / move flows.
4. Add a backfill and rebuild path so existing markdown notes populate the cache without manual edits.
5. Expose note relations and properties through the library router.
6. Add note-inspector UI affordances for backlinks, outgoing links, and unlinked mentions.
7. Add a quick switcher style opener for title / alias / recent-note navigation.
8. Add saved views that can filter and group notes by properties and tags.
9. Allow manual note sets or saved views to be published as reusable context packs for agent and analysis workflows.
10. Expose a resolve API for context packs that returns readable note references, citations, freshness metadata, and partial-result states.
11. Persist Library context-pack definitions in dedicated tables instead of overloading saved-view storage.
12. Extend the shared context-pack builder with typed Library context-pack refs rather than hiding them inside ad hoc dynamic params.
13. Add a runtime adapter that compiles resolved Library context packs into context-engine durable-memory or retrieved-evidence slots.
14. Add narrow MCP list/resolve tools plus delegated-worker scopes and grants for context-pack access.
15. Add graph and canvas surfaces after the cache and note-inspector paths are stable.
16. Persist canvas boards as durable file records so they can be versioned and reopened.
17. Keep the first release navigation-first: derived relations can enrich filters and views, but they do not automatically alter RAG context injection or ranking behavior.
18. Support explicit user attach/open flows and explicit context-pack resolution without changing the default retrieval path for everyone else.

## Risks and mitigations

- Risk: relationship leaks through stale caches.
  - Mitigation: permission-check every read path and rebuild caches on write events.
- Risk: title or alias collisions create incorrect backlinks.
  - Mitigation: define canonical resolution states and never guess through ambiguity.
- Risk: saved views become too broad.
  - Mitigation: keep the first version limited to filters, sort, columns, and grouping.
- Risk: canvas scope expands into a new editor.
  - Mitigation: start with a note board, not a general-purpose drawing app.
- Risk: markdown rename/update can drift internal links.
  - Mitigation: use atomic update + reindex paths and add rename regression tests.
- Risk: old notes remain partially unindexed after rollout.
  - Mitigation: add tenant-scoped backfill progress, retry, and rebuild workflows.
- Risk: context packs drift or grow too broad for reliable analysis.
  - Mitigation: support manual, view-backed, and snapshot modes with max-item budgets, freshness metadata, and explicit ownership.
- Risk: agent-facing memory contracts lose explainability.
  - Mitigation: require source note ids, titles, and citation metadata on every resolved context item.
- Risk: Library context packs and runtime ContextPacks get conflated during implementation.
  - Mitigation: keep a dedicated persistence layer plus a separate runtime adapter boundary.
- Risk: delegated workers gain overly broad knowledge access through pack resolution.
  - Mitigation: add dedicated list/resolve scopes and ensure resolve does not imply blanket `library.get` grants.

## Acceptance criteria

- Markdown notes can be opened through a faster note-centric path than filename search.
- A note can show backlinks, outgoing links, and unlinked mentions.
- Property-based views can be saved and reopened.
- Graph and canvas views respect the same library permissions as search.
- Duplicate titles and aliases do not silently resolve to the wrong note.
- Existing markdown notes are populated through backfill instead of requiring manual resaves.
- Unsupported non-markdown and cloud-reference combinations degrade intentionally with clear UI states.
- RAG/search behavior remains backward compatible unless an explicitly gated enrichment path is enabled.
- Related-note UI can hand off an explicit user-selected note into downstream chat/work flows without making graph expansion implicit for normal retrieval.
- A saved view or manual note set can be published as a context pack for agent or analysis use.
- Context-pack resolution returns permission-filtered note references with stable source metadata, citations, and `complete|partial|empty` status.
- Context-pack resolution does not auto-expand graph neighbors or backlinks unless a future gated policy is explicitly enabled.
- Runtime request construction can consume Library context packs through the shared context engine without bypassing budgeting or compaction.
- Required Library context packs fail closed if resolution is unsafe; optional packs degrade with explicit diagnostics.
- Delegated workers can list or resolve only the context packs granted to them, and pack resolution does not implicitly unlock raw note reads.
- Existing upload, markdown save, sharing, and version history flows continue to work.

## Rollout and testing notes

- Keep the new experience behind a feature flag until the cache and derived views are stable.
- Preserve the current `/document-management` route so old entry points keep working.
- Add tests before wiring UI polish so extraction and access control are locked down first.
- Run tenant-scoped backfill before enabling graph-heavy modes broadly.
- Track cache freshness, backfill coverage, quick-switcher latency, context-pack resolution latency, citation coverage, and hidden-note leakage as rollout gates.
- Ship runtime-adapter and MCP list/resolve paths behind flags until grant behavior and fail-closed semantics are proven.
