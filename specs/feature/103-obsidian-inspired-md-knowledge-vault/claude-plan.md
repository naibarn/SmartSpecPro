# Claude Plan: Obsidian-Inspired Markdown Knowledge Vault

## Objective

Implement a Markdown-first knowledge-vault layer inside the existing Library / Document Management stack so that SmartSpecPro can:

- navigate notes through relationships and properties rather than filename search alone
- publish curated note sets as business-memory context packs
- hand approved context packs into agent runtime and MCP flows without weakening the existing permission model

This plan assumes the feature remains inside `/document-management`, preserves current search/RAG defaults, and builds on the partially scaffolded context-pack contracts already present in the codebase.

## Starting Point

The current repository already provides:

- a mature Library router and service layer for CRUD, search, sharing, version history, and indexing
- a Document Management UI entry point
- runtime context infrastructure with `durable_memory` and `retrieved_evidence` slots
- MCP and delegated-worker enforcement primitives
- scaffolded `library_context_packs` tables, shared Zod contracts, and router stubs

The plan should therefore complete and connect these pieces rather than starting over.

## Architecture Overview

The feature should be implemented as four cooperating layers:

1. **Durable Library layer**
   - `library_items`, markdown versions, permissions, and durable canvas files remain the source of truth.
2. **Derived knowledge layer**
   - new services extract properties, aliases, headings, links, and relationship edges into rebuildable caches keyed by `library_items.id`.
3. **Read and curation layer**
   - Library router procedures expose relationship panels, quick switching, saved views, graph data, and context-pack CRUD/resolve surfaces.
4. **Runtime and delegation layer**
   - approved context packs compile into shared runtime context slots and narrow MCP tools without changing the default retrieval path.

The overall data flow should be:

- markdown save / rename / move / restore / permission change
- enqueue or trigger cache refresh
- update knowledge records for readable Markdown notes
- serve note-centric UI and context-pack resolution from those records
- optionally map approved, explicitly resolved packs into runtime requests

## Section 1: Vault and Knowledge Cache

### Purpose

Create the derived knowledge model that makes Markdown notes behave like a connected vault while remaining rebuildable and safe.

### Core work

- Add a dedicated knowledge-cache service layer such as:
  - `libraryKnowledgeGraphService.ts`
  - `libraryKnowledgePropertyService.ts`
  - `libraryKnowledgeBackfillService.ts`
- Extend schema with knowledge-cache tables or JSON-backed records for:
  - canonical note path metadata
  - extracted aliases and tags
  - parsed property catalog entries
  - outgoing link edges
  - backlink indexes or read models
  - unresolved and ambiguous link diagnostics
  - unlinked-mention candidates, if stored rather than computed on demand
- Standardize canonical note identity on `library_items.id`.
- Standardize link resolution states:
  - `resolved`
  - `ambiguous`
  - `unresolved`
  - `forbidden`
- Hook cache refresh into existing markdown save, rename, move, restore, and share/permission-sensitive flows.

### Design choices

- Store only rebuildable derivatives. Durable note content remains in existing markdown/version tables.
- Treat private-vault lock state as a read-time gate, not as a reason to persist a separate decrypted cache.
- Keep unresolved/ambiguous edges visible only as diagnostics for authorized users; they are not graph nodes for normal readers.

### Why this comes first

Everything else in the feature depends on stable extraction, identity, and freshness semantics. Quick switching, properties, graph, and context packs all become noisy or unsafe if the cache model is inconsistent.

## Section 2: Note Navigation and Relationship Panels

### Purpose

Expose note-centric access paths that are faster and more informative than the current file list/search flow.

### Core work

- Add read-side service methods and router procedures for:
  - backlinks
  - outgoing links
  - unlinked mentions
  - quick-switcher search across title, alias, recents, and create-on-miss
  - local graph neighborhood
- Implement a richer inspector panel in the Document Management UI for:
  - aliases
  - properties
  - backlinks
  - outgoing links
  - unlinked mentions
  - related notes
  - version history handoff
- Ensure duplicate-title and alias-collision results expose disambiguation metadata such as logical path, owner scope, folder, or last updated timestamp.

### Files likely touched

- `apps/web/client/src/pages/DocumentManagement.tsx`
- `apps/web/client/src/components/library/DocumentPreviewPanel.tsx`
- new client components for knowledge inspector and quick switcher
- `apps/web/server/routers/library.ts`
- new read-side knowledge services

### Key constraints

- All relationship reads must use the same actor/tenant/private-vault gates as standard Library reads.
- Quick-switcher behavior should remain responsive under large tenant sizes, using ranked fallbacks and hard limits when needed.
- Related-note surfaces may offer explicit attach/open actions, but they must not enable implicit graph expansion for general retrieval.

## Section 3: Properties, Bases, and Search Facets

### Purpose

Turn frontmatter and extracted note metadata into a managed query surface that powers saved views and business-memory curation.

### Core work

- Parse frontmatter into typed property records and expose a property catalog.
- Normalize built-in note properties such as tags and aliases into shared query behavior.
- Implement saved views with:
  - filters
  - sort rules
  - selected columns
  - grouping mode
  - optional owner/team scope
- Keep non-Markdown support intentionally limited to metadata/file-property filtering rather than note-native properties.
- Reuse or extend Library search filters so note properties and tags can become first-class search facets.
- Add dedicated saved-view persistence instead of relying on an undefined placeholder. The minimum contract should include:
  - `library_saved_views` with stable id/slug, tenant id, owner user id, optional managing group id, visibility mode, scope mode, query definition, presentation definition, archived state, and timestamps
  - optimistic concurrency via `updatedAt` or revision number
  - a deterministic serialization format for filters, grouping, columns, and sort rules
- Define `view_backed` pack behavior explicitly:
  - the pack stores a stable `savedViewId`
  - resolve re-runs the server-side saved-view definition at call time
  - resolution stamps a source fingerprint or revision snapshot into diagnostics for auditability

### Design choices

- Saved views should feel like lightweight bases, not a spreadsheet engine.
- Property names can have global catalog metadata, but value interpretation must remain tenant-scoped and permission-safe.
- Views should be stable enough to publish as context-pack sources without requiring a separate curation system.

## Section 4: Canvas Rollout and Compatibility

### Purpose

Provide a visual synthesis layer without turning the feature into a full drawing app or creating new hidden retrieval signals.

### Core work

- Add a note/evidence board view within Document Management using existing UI patterns and a graph/canvas-capable library already present in the workspace.
- Persist boards as durable file records, ideally in an open `.canvas`-style format or a compatible JSON document.
- Support note cards, evidence attachments, and labeled connection lines in v1.
- Keep unsupported combinations explicit:
  - non-Markdown files can appear as evidence cards
  - connector-backed references can appear as reference cards
  - canvas connections do not create automatic backlinks or retrieval edges

### Rollout constraint

- Canvas ships only after the knowledge cache and relationship reads are stable enough that users can trust what they are arranging.

## Section 5: Agent Skill Context Packs and Business Memory

### Purpose

Provide the product-level bridge from curated vault knowledge into repeatable analysis and agent skill workflows.

### Core work

- Finish `libraryContextPackService.ts` and its router procedures for:
  - list
  - get
  - create
  - update
  - archive
  - publish saved view as pack
  - resolve
- Support three pack source modes:
  - `manual`
  - `view_backed`
  - `snapshot`
- Preserve pack-level policy fields already scaffolded in the shared schema:
  - readiness status
  - approved-for-agents
  - default runtime tier
  - relation expansion policy
  - budget profile
  - max-note count / token hints
- Resolve packs into note references with:
  - permission filtering
  - citations
  - freshness metadata
  - included reason
  - `complete | partial | empty` status
  - diagnostics for unreadable, stale, deleted, or over-budget items

### Product rule

- Only approved, memory-ready packs are agent-default business memory.
- Explicit per-note attach remains available as a separate human-in-the-loop path.
- Default relation expansion remains `none` in v1.

### Approval lifecycle

- Keep `status`, `readinessStatus`, and `approvedForAgents` separate.
- Use the following readiness state machine:
  - `draft`: editable by the owner, never agent-eligible
  - `review_pending`: submitted by the owner or managing-group maintainer for review
  - `trusted`: approved by an authorized reviewer, with `approvedForAgents = true`
  - `stale`: auto-entered whenever saved-view logic, source-note set, note visibility, or freshness window changes
- Require explicit audit fields for:
  - `submittedForReviewAt`
  - `reviewedAt`
  - `approvedAt`
  - `reviewerUserId`
  - `lastSourceMutationAt`
  - `freshUntil`
- Transition rules:
  - `trusted` -> `stale` automatically clears `approvedForAgents`
  - `stale` content must be re-submitted through `review_pending` before it becomes `trusted` again
  - archive/revoke paths must preserve audit history even when the pack is no longer active

## Section 6: Runtime and MCP Integration

### Purpose

Map approved Library context packs into shared runtime and delegated-worker systems without widening permissions or bypassing budgeting.

### Core work

- Extend `BuildContextPackRequest` and the runtime orchestration call sites so Library context-pack refs become typed inputs rather than ad hoc dynamic params.
- Add a runtime adapter that resolves Library packs and emits context-engine slots as either:
  - `durable_memory` for trusted/reviewed business memory
  - `retrieved_evidence` for task-scoped or less durable supporting notes
- Preserve slot provenance, source refs, included reasons, and token estimates in runtime requests.
- Add narrow MCP tools for listing and resolving granted packs.
- Extend delegated-worker scope/grant validation so:
  - workers can only see explicitly granted packs
  - pack resolution never implies unrestricted `library.get`
  - unreadable/private-vault items are redacted or absent

### Runtime request contract

- Extend `BuildContextPackRequest` with:
  - `libraryContextPacks?: Array<{ ref; required?: boolean; runtimeTierOverride?: ...; maxItems?: number; tokenBudgetHint?: number; includeCitations?: boolean }>`
- Default behaviors:
  - `required = true`
  - `includeCitations = true`
  - `maxItems` and `tokenBudgetHint` inherit pack policy when omitted
- Cap the request at 5 explicit Library context packs.
- Preserve caller order for resolution and slot injection.
- Deduplicate repeated pack refs by canonical pack id using `first declaration wins`; emit a diagnostic for ignored duplicates.
- Resolve Library context packs before generic dynamic evidence injection and never translate them into freeform `knowledgebase` text concatenation.

### Fail-closed behavior

- Required pack resolution failures abort runtime request construction.
- Optional pack resolution failures surface diagnostics but do not silently fall back to raw note reads or graph expansion.

## Section 7: Schema and Router Contracts

### Purpose

Turn the planning concepts into implementation-ready contracts that match the repo's Drizzle/TRPC/Zod conventions.

### Core work

- Finalize database schema for knowledge-cache tables and indexes.
- Reconcile new tables with already scaffolded context-pack tables in `schema.ts`.
- Add router inputs/outputs that mirror the shared contracts instead of introducing duplicated shapes.
- Keep API boundaries explicit for:
  - note relationships
  - property catalogs
  - saved views
  - context-pack resolution
  - graph and canvas data

### Migration strategy

- Add forward-only migrations for new tables and indexes.
- Include tenant-scoped backfill/repair commands or jobs after migrations land.
- Ensure existing Library features continue to operate even when knowledge caches have not finished backfilling.

### Required contract additions

- Add dedicated saved-view persistence because there is currently no concrete table behind `savedViewId`.
- Either:
  - introduce `library_saved_views` plus optional `library_saved_view_membership` / share tables, or
  - define an equivalent normalized contract that gives `view_backed` packs a durable server-side source
- Promote pack approval audit fields into first-class persisted fields or a companion review-history table; do not leave approval lifecycle entirely inside freeform metadata.

## Section 8: End-to-End Sequence Flows and Rollout

### Purpose

Define the order of delivery, runtime behavior, repair paths, observability, and acceptance checkpoints so implementation teams can ship the feature safely.

### Core work

- Document end-to-end sequences for:
  - markdown save to cache refresh
  - quick-switcher open
  - note inspector reads
  - saved view publish to context pack
  - context-pack resolve to runtime build
  - delegated worker resolve
  - permission change and private-vault lock/unlock
- Add rollout gates for:
  - cache freshness
  - backfill coverage
  - quick-switcher latency
  - context-pack resolution latency
  - citation coverage
  - hidden-note leakage
- Gate graph/global-canvas or agent-facing pack consumption behind feature flags until core ACL and freshness metrics are stable.

### Numeric rollout thresholds

- cache freshness p95 <= 5 seconds from save/rename/move to inspector-read readiness
- quick-switcher p95 <= 250 ms for the first 20 results on tenants with up to 10k visible notes
- local graph default cap = 75 visible nodes, p95 <= 400 ms
- global graph hard cap = 250 visible nodes until a later scale review
- context-pack resolution p95 <= 1200 ms for packs up to 25 resolved notes or 20k estimated tokens
- citation coverage = 100% for resolved notes included in runtime context
- hidden-note leakage = 0
- backfill coverage >= 99% of readable Markdown notes before graph mode becomes default

## Delivery Order

Recommended implementation order:

1. Schema and knowledge-cache foundations
2. Extraction and backfill workflows
3. Relationship reads and quick-switcher/navigation UI
4. Property catalog and saved views
5. Context-pack CRUD and resolve
6. Runtime adapter and MCP grants
7. Graph polish and canvas rollout
8. Final rollout instrumentation and compatibility hardening

## Key Risks and Mitigations

- **Stale relationship data leaks note existence**
  - Recompute on write events, enforce read-time permissions, and expose freshness diagnostics.
- **Title/alias collisions cause silent wrong links**
  - Canonical IDs plus explicit `ambiguous` state, never best-effort guessing.
- **Backfill never catches up on large tenants**
  - Tenant-scoped job tracking, pause/resume/retry, and read-time freshness banners.
- **Context packs become an invisible alternate retrieval system**
  - Explicit publication, explicit resolve, explicit runtime inclusion, and no default graph expansion.
- **Delegated workers overreach**
  - Separate pack grants from raw note grants, and test for fail-closed behavior.

## Implementation Completion Criteria

The feature is complete when:

- knowledge cache extraction and backfill are stable enough to power note relationships for current tenants
- the Document Management UI exposes note inspector, quick switcher, and saved views with intentional degraded states
- context packs can be authored, published, resolved, and consumed by runtime/MCP integrations with citation-backed output
- default search/RAG behavior remains backward compatible for users who never use the knowledge-vault features
