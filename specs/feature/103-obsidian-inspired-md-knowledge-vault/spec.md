# Feature 103 - Obsidian-Inspired Markdown Knowledge Vault

Version: 1.3
Date: 2026-04-21
Status: Draft
Depends-on: 009-sharefile
Audience: Product, Document Management UI, Library/RAG, Search/Retrieval, Data, Security, QA

---

## 1. Executive Summary

SmartSpecPro already has a capable Library and Document Management surface for Markdown files, uploads, sharing, preview, and version history.

What it does not yet have is a true knowledge-vault access model.

This feature upgrades the existing Library into an Obsidian-inspired knowledge layer where Markdown files are accessed not only by filename search, but also by:

- properties and tags
- backlinks and outgoing links
- unlinked mentions
- recent notes and quick switching
- graph-based relationship exploration
- saved views that behave like lightweight databases
- a canvas-style workspace for synthesis
- reusable context packs that agent skills can consume as curated business memory

The goal is not to clone Obsidian UI. The goal is to bring Obsidian's mental model into SmartSpecPro's existing document system.

---

## 2. Problem Statement

The current Document Management experience is still mostly file-centric:

- users browse by scope, folder, and search
- markdown editing exists, but the note is still treated like a file row
- relationships between notes are not yet a first-class access path
- properties are not yet a management surface
- users cannot easily pivot from one note into related context

That works for storage and retrieval, but it is not enough for knowledge work.

When users are building a body of knowledge, they do not think only in filenames. They think in:

- topics
- references
- related notes
- metadata
- clusters
- follow-up ideas
- reusable views

Without a richer access model, users must keep falling back to search even when the answer is already inside the vault.

---

## 3. Product Goals

The feature should make Markdown files feel like a connected knowledge system.

### 3.1 Access goals

- Open a note quickly by title, alias, or recent history.
- Jump from a note to related notes without searching again.
- See what links into a note and what the note links out to.
- Surface unlinked mentions so users can connect related ideas.
- Expose note properties as a first-class control surface.
- Let users save repeatable filtered views.
- Let users explore a local graph around the current note.
- Let users arrange notes in a visual workspace.
- Let teams hand off curated note sets into analysis and agent workflows without rebuilding context each time.

### 3.2 Product goals

- Preserve the current Library capabilities.
- Keep markdown as the primary knowledge format.
- Treat other file types as supporting evidence, attachments, or linked artifacts.
- Keep all derived knowledge views permission-aware and tenant-safe.
- Make the experience faster to navigate than a pure search workflow.
- Make curated markdown knowledge reusable by agent skills without weakening permission boundaries or silently widening retrieval.

---

## 4. Non-Goals

- Do not replace the current Library with a new standalone application.
- Do not implement Obsidian plugins, sync, or community extensions.
- Do not build a full wiki engine.
- Do not add real-time collaboration in this feature.
- Do not introduce a generic formula language unless it is clearly scoped to saved views.
- Do not expose inaccessible notes through graph, backlinks, or mentions.

---

## 5. Current Codebase Fit

This is a continuation of the existing Library stack, not a new domain.

Relevant current pieces:

- `apps/web/client/src/pages/DocumentManagement.tsx`
- `apps/web/client/src/components/library/DocumentLibraryTabs.tsx`
- `apps/web/client/src/components/library/DocumentPreviewPanel.tsx`
- `apps/web/client/src/components/library/DocumentVersionHistory.tsx`
- `apps/web/client/src/lib/documentManagementUi.ts`
- `apps/web/server/_core/mcpRegistry.ts`
- `apps/web/server/routers/library.ts`
- `apps/web/server/services/contextPackBuilder.ts`
- `apps/web/server/services/agentRuntime/requestBuilder.ts`
- `apps/web/server/services/libraryService.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/shared/contextEngine.ts`
- `apps/web/shared/workerDelegation.ts`

Useful existing foundations:

- Markdown content is already saved and versioned.
- Reindex jobs already exist for markdown updates.
- Library items already carry metadata and allowed scopes.
- Sharing and permission checks already exist.
- The UI already has a dedicated Document Management page and route.

That means the new feature should extend the current system by adding a knowledge cache and richer navigation surfaces, not by rebuilding storage from scratch.

---

## 6. Obsidian-Inspired Principles

### 6.1 Files are the source of truth

Markdown files remain durable plain-text assets. Derived caches can be rebuilt.

### 6.2 Relationships are first-class

The system should know which notes link to which notes, which notes mention each other, and which notes share a topic.

### 6.2.1 Note identity must be canonical

Every note needs a stable internal identity so backlinks, graph edges, and saved views remain correct after rename or move operations.

The durable source-of-truth identity is the `library_items.id`.

User-facing note references may still use titles, aliases, and logical paths, but the derived relation cache must resolve them into a canonical target item id whenever resolution is unambiguous.

### 6.3 Properties are queryable

Frontmatter and extracted properties should power filtering, grouping, and saved views.

### 6.4 Search is not the only entry point

Search remains available, but users should also be able to navigate by related content, recent notes, graph context, and saved views.

### 6.5 Knowledge work needs more than a list

The interface should support both inspection and synthesis:

- a note inspector for details
- a graph for context
- a canvas for spatial thinking
- a saved-view system for repeatable work

### 6.6 Access must be safe by default

Every derived surface must respect the same tenant, project, private-vault, and permission boundaries as the underlying files.

---

## 7. Proposed Experience

### 7.1 Keep the existing Library scopes

The current scope tabs remain useful:

- My Library
- Private Files
- My Drive
- My OneDrive
- Shared With Me
- Shared Groups
- Trash

These should continue to exist as the source-scope layer.

### 7.2 Add a knowledge-mode layer

Inside the Document Management page, introduce a second layer of navigation for how a user wants to work with the vault:

- Browse
- Related
- Properties
- Views
- Graph
- Canvas

This lets users stay in the same location while changing the access style.

### 7.3 Add a note inspector

The active note should have a richer side panel that can show:

- properties
- aliases
- backlinks
- outgoing links
- unlinked mentions
- tags
- related notes
- version history

### 7.4 Add a keyboard-first opener

The system should support a quick switcher style entry point where users can:

- search by title or alias
- open recent notes
- jump directly to a note
- create a new note when no exact match exists

### 7.5 Add graph-based context

Users should be able to open a local graph around the active note and a broader vault graph when needed.

### 7.6 Add saved views

Users should be able to save repeatable filtered views over notes, such as:

- all notes tagged `#research`
- notes with `status = draft`
- notes updated this week
- notes with a missing property
- notes connected to a topic cluster

These views should feel like lightweight bases, not like raw SQL.

Saved views may also be publishable as reusable context packs for downstream agent or analysis workflows when the owner intentionally marks them as memory-ready.

### 7.7 Add a canvas workspace

Users should be able to place notes, attachments, and links into a visual workspace for synthesis and planning.

The first version can start with note cards and connection lines. Web embeds and richer card types can follow later.

The canvas should be stored as a durable file record, ideally in an open canvas-style format so it can be reconstructed, versioned, and shared like the rest of the vault.

### 7.8 Capability matrix

Knowledge-mode behavior should be explicit instead of implied.

| Surface | Markdown in Library | Private Vault Markdown | Shared Markdown | Non-Markdown Files | Drive / OneDrive references |
|---|---|---|---|---|---|
| Browse | Full | Full after vault unlock | Full if readable | Full | Full |
| Related | Full | Full after vault unlock | Full if readable | Hidden or empty-state | Hidden until imported or cached as markdown |
| Properties | Full | Full after vault unlock | Full if readable | Metadata-only | Metadata-only |
| Views | Full | Full after vault unlock | Full if readable | Filterable by file metadata only | Filterable by connector metadata only |
| Graph | Full | Full after vault unlock | Full if readable | Not shown in v1 | Not shown in v1 |
| Canvas | Full | Full after vault unlock | Full if readable | Can attach as evidence card | Can attach as reference card only |

The UI should render disabled, read-only, or empty states intentionally for unsupported combinations rather than failing silently.

---

## 8. Data Model and Indexing

`library_items` remains the source of truth for files.

The feature should add derived knowledge caches for:

- note metadata
- note properties
- note relations
- saved views
- optional canvas workspace data

Recommended derived records:

- `library_note_properties`
- `library_note_relations`
- `library_saved_views`
- `library_context_packs`
- `library_knowledge_cache_jobs` or an equivalent extension to the existing indexing job flow

Derived data should include:

- tenant id
- owner user id where private-vault scoping requires it
- project id or scope markers
- source item id
- relation type
- property name and value
- cache freshness metadata

### 8.1 Canonical note identity and link resolution

The canonical note identity is `library_items.id`.

Derived relation rows should store:

- `source_library_item_id`
- `raw_reference_text`
- `normalized_reference_key`
- `resolved_target_library_item_id`
- `resolution_status`
- `resolution_method`

Recommended `resolution_status` values:

- `resolved`
- `ambiguous`
- `unresolved`
- `forbidden`

Recommended `resolution_method` values:

- `path_exact`
- `title_exact`
- `alias_exact`
- `manual_pin`

Resolution rules for markdown links and mentions:

1. Try exact logical-path match within the same tenant and accessible scope.
2. Fall back to an exact unique title match.
3. Fall back to an exact unique alias match.
4. If multiple readable candidates remain, mark the relation `ambiguous` and do not guess.
5. If the target exists but is not readable to the actor, expose no resolved target in UI reads.

Rename and move operations must trigger relation refresh so backlinks remain attached to the canonical target item id instead of drifting with stale titles.

### 8.2 Backfill, rebuild, and repair

This feature needs an explicit adoption path for existing markdown content.

Required jobs:

- initial tenant-scoped backfill for existing markdown notes
- incremental refresh on save, rename, move, restore, share, and unshare
- manual rebuild or retry path for failed or stale items

Backfill requirements:

- existing markdown notes should enter a visible `knowledge_indexing` or equivalent state until derived cache rows are ready
- operators need progress visibility at tenant level
- failures need durable error reasons and retry counts
- the system must support item-level rebuild and tenant-level rebuild without rewriting the source files

### 8.3 Relationship to RAG and search

The first version of this feature is primarily a navigation and management layer, not a full retrieval rewrite.

Rules:

- source markdown content and `library_chunks` remain the primary RAG/search substrate
- note properties and tags may enrich search filters in v1
- backlinks, unlinked mentions, graph edges, and canvas layout must not be auto-injected into LLM context by default
- any future use of derived note relations for retrieval ranking must be gated behind parity and relevance evaluation

### 8.3.1 What "navigation-first" means in practice

In v1, the knowledge cache is mainly for helping humans move through the vault and choose what matters.

Allowed in v1:

- show backlinks, outgoing links, graph neighbors, unlinked mentions, and canvas relationships in the UI
- let the user open a related note from those surfaces
- let the user explicitly attach or open a related note for chat or work context
- let note properties and tags improve browse filters and structured search facets

Not allowed by default in v1:

- automatically append backlink notes, graph neighbors, or canvas-linked notes into the LLM prompt
- automatically widen retrieval candidates just because a note is graph-adjacent
- automatically boost ranking weight from relation edges without separate evaluation
- treat canvas proximity or note-link count as authoritative evidence relevance

This means the default RAG path stays conservative:

1. retrieve from the existing content substrate
2. apply the existing tenant / project / scope boundaries
3. optionally use structured metadata filters
4. only include graph-related notes when a human explicitly selects them or a future gated enrichment path is enabled

### 8.3.2 Why this boundary exists

This boundary reduces four early risks:

- relevance regressions from over-expanding the retrieval set
- hidden token growth from silently attaching neighboring notes
- permission leakage through derived relation expansion
- weaker explainability when the model sees notes the user did not explicitly select

### 8.3.3 Future upgrade path

Later phases may introduce relation-aware retrieval, but only behind a dedicated flag and evaluation gate.

A future relation-aware retrieval mode should require:

- offline relevance comparison against the baseline retrieval path
- explicit leakage regression coverage
- token-budget guardrails
- explainability output that states why a related note was pulled in
- safe rollback to the baseline content-only path

### 8.4 Agent skill context packs and business memory contract

Navigation-first does not mean analysis-hostile.

The system should give agent skills and downstream analysis flows a safe, explicit way to reuse curated Markdown knowledge as business memory without turning every related note into automatic context.

The core mechanism is a `context pack`.

A context pack is a named, permission-aware bundle of note context that can be resolved on demand from:

- a manual pinned note set
- a saved view definition
- a saved view plus pinned additions or exclusions
- a snapshot created for a specific workflow or audit trail

Example packs:

- `finance-brain`
- `ops-sop`
- `product-memory`
- `customer-escalation-playbook`

Required context-pack metadata:

- pack id
- tenant id
- owner or managing group
- title
- purpose and intended analysis use
- source mode: `manual`, `view_backed`, or `snapshot`
- allowed scopes
- default sort order
- default runtime tier
- max note count or token budget hint
- budget profile
- freshness expectation
- relation expansion policy

Default `relation_expansion_policy` should be `none`.

Recommended optional later values:

- `manual_only`
- `one_hop_gated`

Recommended `default_runtime_tier` values:

- `durable_memory`
- `retrieved_evidence`

### 8.4.1 Context-pack resolution contract

When a user or agent skill requests a context pack:

1. Resolve the current pack definition into candidate note ids.
2. Apply the same tenant, project, share, and private-vault permissions at request time.
3. Exclude or mark items that are stale, deleted, unreadable, or not yet knowledge-indexed.
4. Return note context with stable source metadata and citations.
5. Do not automatically expand graph neighbors, backlinks, unlinked mentions, or canvas-adjacent notes unless the call explicitly opts into a future gated mode.

Every returned note context should carry:

- `library_item_id`
- title
- logical path when available
- last indexed timestamp
- source scope markers
- excerpt or chunk citations usable by downstream analysis

The resolution result should also state whether it is:

- `complete`
- `partial`
- `empty`

and include reasons for missing items so the caller can decide whether to continue, retry, or warn the user.

### 8.4.2 What this improves for agent skills

Compared with a pure file-search workflow, context packs make the markdown vault more useful as business memory because they:

- reduce missed context by starting from curated note sets instead of only ad hoc keyword search
- preserve human knowledge curation while still being machine-consumable
- make analysis inputs repeatable across runs, users, and workflows
- keep citations attached so outputs can be traced back to the underlying notes
- let teams separate trusted operating memory from the rest of the vault without building a second storage system

This means the first strong upgrade for agent use is not full autonomous graph retrieval.

It is a safer contract:

- humans organize the vault with notes, links, properties, and views
- teams publish the most useful subsets as memory-ready packs
- agent skills resolve those packs into explicit, permission-safe analysis context

### 8.4.3 Business-memory readiness signals

To make a note set usable as internal business memory, the system should support simple readiness indicators on notes, views, or packs such as:

- `status`
- `owner`
- `domain`
- `reviewed_at`
- `fresh_until`
- `approved_for_agents`

These indicators should be filterable and visible in the UI so teams can distinguish draft notes from operationally trusted memory.

The first version can store these as normal properties and pack metadata rather than inventing a separate truth store.

### 8.4.4 Future structured fact layer

A later phase may extract business facts, definitions, or decisions from curated context packs, but that is not a launch blocker for this feature.

If a fact layer is introduced later:

- markdown notes remain the source of truth
- every fact must keep source citations and timestamps
- confidence and freshness must be explicit
- inferred facts must never silently outrank directly cited note content

### 8.4.5 Terminology alignment with the existing runtime context pack

This spec now uses two related but distinct concepts:

- `library context pack`: a persisted Library-managed definition for curated business memory
- `runtime ContextPack`: the ephemeral prompt-context object already used by the agent runtime and context engine

They are not the same storage object.

The intended flow is:

1. store or publish a Library context-pack definition
2. resolve it into readable note references plus citations
3. compile the resolved result into runtime context-engine slots

This keeps Library governance, runtime compaction, and agent observability separated cleanly.

The Library feature should feed the existing runtime context engine rather than bypassing it.

### 8.4.6 Suggested persistence and router contract

Recommended persisted records:

- `library_context_packs`
- `library_context_pack_members`

Recommended `library_context_packs` fields:

- id
- tenant id
- slug
- title
- description
- owner user id
- managing group id
- status: `draft`, `active`, or `archived`
- source mode: `manual`, `view_backed`, or `snapshot`
- saved view id when applicable
- relation expansion policy
- default runtime tier
- budget profile
- max note count
- max token hint
- freshness window or expectation
- readiness status
- approved for agents flag
- metadata json
- created at / updated at

Recommended `library_context_pack_members` fields:

- id
- context pack id
- library item id
- member mode: `include`, `exclude`, or `pin`
- order index
- rationale
- snapshot revision metadata when relevant

Recommended library router procedures:

- `library.listContextPacks`
- `library.getContextPack`
- `library.createContextPack`
- `library.updateContextPack`
- `library.archiveContextPack`
- `library.publishSavedViewAsContextPack`
- `library.resolveContextPack`

`library.resolveContextPack` should accept either an id or slug plus optional runtime hints such as:

- requested mode or intent
- max items
- token budget hint
- target runtime tier override
- fail-if-partial toggle

`library.resolveContextPack` should return:

- pack metadata
- resolution status: `complete`, `partial`, or `empty`
- resolved note contexts
- missing or excluded reasons
- token estimate summary
- freshness summary
- a signal that relation expansion was not applied unless explicitly requested in a future gated mode

### 8.4.7 Agent runtime integration contract

The cleanest integration path is to make Library context packs an explicit source for the existing context engine.

Recommended addition to `BuildContextPackRequest`:

- `libraryContextPacks?: Array<{ ref: string; required?: boolean; runtimeTier?: "durable_memory" | "retrieved_evidence"; maxItems?: number; tokenBudgetHint?: number }>`

Recommended behavior:

1. `library.resolveContextPack` resolves the selected pack at request time.
2. A dedicated adapter converts the resolved note contexts into `ContextStateBlock` inputs for the existing context engine.
3. Reviewed or policy-backed packs may default to `durable_memory`.
4. Task-specific packs may default to `retrieved_evidence`.
5. The runtime still goes through normal compaction, budgeting, sanitization, and evidence-item generation.

Recommended provenance defaults for resolved Library notes:

- `source = "structured"`
- `includedReason = "Resolved from library context pack <title>"`
- stable `sourceRef` per note or note excerpt

Failure behavior should be explicit:

- if a required Library context pack cannot be resolved safely, runtime request building fails closed
- if an optional pack is partial or unavailable, runtime request building may continue with diagnostics

### 8.4.8 MCP and delegated worker mapping

For delegated agents and worker skills, the first safe MCP surface is read-only context-pack discovery and resolution.

Recommended MCP tools:

- `smartspec.knowledge.library.context_packs.list`
- `smartspec.knowledge.library.context_packs.resolve`

Recommended scope and grant additions:

- delegated scopes: `library:pack:list`, `library:pack:resolve`
- delegated grant types: `context_pack`, `context_pack_scope`
- delegated manifest `knowledgeAccess` additions: `contextPackList`, `contextPackResolve`

Important safety rule:

Resolving a context pack should not automatically grant raw `library.get` access to every underlying note.

Instead:

- the resolve tool should return the curated note contexts, citations, and missing-item diagnostics needed for analysis
- raw note reads should still require normal `library_item` grants or user-driven attach/open flows

This keeps agent memory broad enough for analysis but narrow enough to remain explainable and permission-safe.

### 8.5 Cache rebuild triggers

The cache should be rebuilt from the Markdown file when a file is:

- created
- updated
- renamed
- moved
- shared or unshared
- restored from trash

The system should follow the same Obsidian-inspired rule that metadata can be rebuilt when needed, rather than assuming the cache is always perfect.

---

## 9. Security and Access Rules

This feature must be access-aware at every layer.

Rules:

- A user must never see a note, property, mention, or graph edge that they cannot read.
- Tenant boundaries must be enforced before relation or property data is rendered.
- Private vault content must remain isolated unless the vault is unlocked.
- Cached relations must not leak hidden note titles through graph labels, mention snippets, or autocomplete.
- Saved views must not widen the user's access beyond what the base library permissions allow.
- Permission changes must be reflected in derived views quickly and safely.
- Ambiguous relations must remain unresolved until a deterministic winner exists or a manual pin flow is introduced.

The final read path should fail closed if the cache is stale or ambiguous.

---

## 10. Phased Delivery

### Phase 0 - Identity and backfill contract

- Define canonical note identity and relation resolution states.
- Finalize the logical-path contract used for note disambiguation.
- Add backfill, rebuild, and repair job contracts.
- Keep all new read paths dark until backfill behavior is observable.

### Phase 1 - Knowledge cache foundation

- Parse markdown properties, tags, aliases, headings, and links.
- Build derived property and relation caches.
- Refresh the cache on save, rename, and move.
- Run initial backfill for existing markdown notes.
- Keep search and markdown editing behavior unchanged.

### Phase 2 - Note navigation

- Add backlinks and outgoing links panels.
- Add unlinked mention discovery.
- Add quick switcher behavior for title, alias, and recent notes.
- Add note inspector improvements.

### Phase 3 - Views and graph

- Add property-driven saved views.
- Add global and local graph exploration.
- Add query facets for notes based on properties and tags.
- Add deliberate disabled or read-only states for unsupported non-markdown and cloud-reference combinations.

### Phase 4 - Agent context packs and analysis handoff

- Allow manual note sets and saved views to be published as context packs.
- Add an agent-facing resolve contract that returns readable note context with citations and freshness metadata.
- Add explicit partial-result states for stale, unreadable, or not-yet-indexed notes.
- Keep relation expansion opt-in and disabled by default.
- Compile resolved Library context packs through the existing runtime context engine instead of bypassing it.
- Add narrow MCP read tools and delegated-worker grants for list/resolve flows.

### Phase 5 - Canvas and polish

- Add a canvas workspace for arranging notes visually.
- Add drag-and-drop note cards and relationship lines.
- Refine keyboard shortcuts and navigation ergonomics.

---

## 11. Rollout Gates

The feature should not be considered rollout-ready until these gates are met:

- Backfill coverage: at least 95% of eligible markdown notes in an enabled tenant have successful knowledge-cache rows within 24 hours of feature enablement.
- Cache freshness: markdown save to refreshed properties/backlinks readiness should be `p95 < 5s`.
- Quick switcher latency: tenant-local title or alias lookup should be `p95 < 250ms` for normal interactive queries.
- Local graph latency: active-note neighborhood load should be `p95 < 1s` with default node caps.
- Unlinked mention budget: active-note mention discovery should be capped and return `p95 < 2s`.
- Context-pack resolution latency: resolving a normal memory-ready pack into readable note references should be `p95 < 1.5s`.
- Citation coverage: `100%` of note content handed to agent or analysis flows through context-pack resolution must carry source note ids and titles.
- Runtime integration safety: required Library context packs must fail closed on unsafe resolution rather than silently degrading.
- Graph safety: global graph defaults must cap visible nodes and require narrowing before large expansions.
- Access safety: hidden-note leakage rate through relation reads must remain zero in regression and rollout tests.

---

## 12. Success Criteria

The feature is successful when:

- users can reach a note without needing its exact filename
- users can discover related notes from the note itself
- users can inspect properties without leaving the Library context
- users can reuse saved views instead of rebuilding filters every time
- graph and canvas views help users understand context faster than search alone
- all derived views obey the same access boundaries as the source files
- rename and move operations do not break canonical backlinks for resolved notes
- existing markdown notes become usable in knowledge modes through backfill, not only after manual edits
- teams can hand off curated markdown knowledge into agent analysis through explicit context packs instead of rebuilding context manually
- agent-facing business-memory context stays permission-safe, citation-backed, and explainable
- agent-facing business-memory context is injected through the existing context engine with normal budgeting and compaction rules
- markdown remains the durable source of truth
- the existing Library behavior still works for users who only want browse and search

---

## 13. Detailed Appendices

For implementation-handoff detail beyond the main product spec, use:

- `sections/section-07-schema-and-router-contracts.md`
- `sections/section-08-end-to-end-sequence-flows.md`
