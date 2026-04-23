# Claude Spec: Obsidian-Inspired Markdown Knowledge Vault

## Product Intent

SmartSpecPro should upgrade the existing `/document-management` Library surface from a file browser into a Markdown-first knowledge vault that supports both:

- faster human knowledge navigation
- safer, explicit reuse of curated business knowledge by agent skills

This is an extension of the current Library system, not a replacement product and not an Obsidian clone.

## Desired Outcome

Users should be able to treat Markdown notes as the durable memory of a business. A note should be reachable not only by filename or keyword search, but by:

- aliases and recents
- backlinks and outgoing links
- unlinked mentions
- properties and tags
- saved views over note metadata
- local graph exploration
- canvas synthesis
- curated context packs that agent skills can consume for analysis

## Primary Users

- operators and knowledge owners maintaining SOPs, policies, decision logs, and project notes
- analysts and collaborators who need to move through related notes faster than folder/search workflows allow
- agent-skill authors and workflow owners who need a safe, explainable way to reuse curated Markdown knowledge as business memory

## Business Decisions

- V1 success should be measured primarily by whether curated note collections can be reused as business memory for analysis and agent skills.
- Human navigation improvements are still required in the first release because they are how users discover, validate, and curate memory-ready note sets.
- Agents should only consume explicitly published, permission-readable, memory-ready context packs by default.
- Users may explicitly attach other readable notes to downstream chat/work flows, but the system must not silently widen runtime context through graph edges or backlink expansion.
- The first analysis domains to optimize are SOP/operations, policy/compliance, and project handoff/strategic continuity.

## In Scope

### Markdown-first knowledge model

- Keep Markdown as the only full-fidelity note-native format in v1.
- Treat Markdown source files and version history as the authoritative record.
- Build a rebuildable knowledge cache for extracted properties, tags, aliases, headings, links, and relationship metadata.

### Canonical note identity and link resolution

- Use `library_items.id` as the durable note identity.
- Support user-facing references by title, alias, and logical path.
- Resolve references into one of four deterministic states:
  - `resolved`
  - `ambiguous`
  - `unresolved`
  - `forbidden`
- Never guess across collisions. Ambiguous and forbidden references must not silently collapse to a visible target.

### Note-centric navigation

- Add a note inspector for backlinks, outgoing links, unlinked mentions, aliases, properties, tags, related notes, and version history.
- Add a quick-switcher style opener that supports title, alias, recents, and create-on-miss behavior with clear disambiguation metadata.
- Add a related-content mode so users can move through note connections without re-running search every time.

### Properties and saved views

- Parse YAML frontmatter and extracted note metadata into a queryable property surface.
- Maintain an all-properties catalog so the UI can show popular properties, property types, and property-driven filters.
- Support saved views with filters, sorts, columns, and grouping over note properties, tags, and file metadata.
- Allow saved views to act as the source for published context packs when the owner explicitly marks them as memory-ready.
- Persist saved views in a dedicated contract instead of leaving them implicit. At minimum, each saved view must have a stable id, owner, optional managing group, serialized query definition, presentation definition, optimistic-concurrency timestamp, and explicit visibility mode.
- `view_backed` context packs must reference a stable saved-view id and re-run that saved view deterministically at resolve time; they must not depend on ad hoc client-side filter state.

### Graph and canvas

- Provide a local graph centered on the active note.
- Gate broader graph exploration behind scale and freshness limits.
- Provide a canvas workspace where notes and evidence assets can be arranged visually.
- Persist canvas boards as durable file records so they can be versioned, reopened, and shared.

### Context packs for agent skills

- Support manual, view-backed, and snapshot context packs.
- Require explicit publication before packs are approved for agents.
- Resolve packs into permission-filtered note references with stable source metadata, freshness, and citations.
- Map resolved pack content into the shared runtime context engine as `durable_memory` or `retrieved_evidence`, depending on pack intent and readiness.

### Backfill and repair

- Backfill existing Markdown notes so the feature works for current tenants without manual resaves.
- Provide tenant-scoped rebuild and repair workflows.
- Track freshness, failures, and coverage so operators know whether derived views can be trusted.

## Behavioral Requirements

### Knowledge cache

- Derived caches must be rebuildable from durable Markdown and Library records.
- Cache rebuild must be triggered on markdown save, rename, move, restore, share/permission change, and relevant folder/path changes.
- Cache reads must fail closed if the underlying note becomes unreadable, deleted, or private-vault locked.

### Capability matrix

- Markdown in Library: full behavior across browse, related, properties, views, graph, and canvas.
- Private-vault Markdown: same as Markdown after successful vault unlock.
- Shared Markdown: full behavior only when readable to the current actor.
- Non-Markdown files: browse and metadata/filter behavior only, with evidence-card support in canvas.
- Drive/OneDrive references: browse and metadata behavior only until imported/cached into Markdown-native storage.

### Runtime boundary with search/RAG

- Default Library search and current RAG flows remain backward compatible in v1.
- Graph neighbors, backlinks, unlinked mentions, and canvas adjacency must not auto-expand retrieval or ranking by default.
- Explicit user attach/open actions and explicit context-pack resolution are the only supported bridge into analysis runtime in v1.

### Business-memory readiness

Memory-ready context packs should expose and enforce:

- approval state
- reviewer/owner metadata
- freshness expectations
- stable pack identity
- citations for every resolved note context
- partial/empty diagnostics when notes are stale, deleted, unreadable, or over budget
- a deterministic lifecycle:
  - `draft` -> `review_pending` -> `trusted`
  - `trusted` -> `stale` when the pack definition, saved-view definition, source-note visibility, or freshness window changes
  - `stale` -> `review_pending` when an owner re-submits for review
- explicit audit fields for `submittedForReviewAt`, `reviewedAt`, `approvedAt`, `reviewerUserId`, `lastSourceMutationAt`, and `freshUntil`
- automatic reset of `approvedForAgents = false` whenever a trusted pack becomes stale or unreadable

### Runtime request contract for Library context packs

- `BuildContextPackRequest` must gain a typed `libraryContextPacks` array rather than hiding Library pack references inside `dynamicParams`.
- Each entry must contain:
  - `ref`
  - `required` with default `true`
  - optional `runtimeTierOverride`
  - optional `maxItems`
  - optional `tokenBudgetHint`
  - `includeCitations` with default `true`
- Runtime resolution order must preserve caller order after static prompt/knowledgebase inputs and before generic dynamic evidence injection.
- Duplicate pack refs in a single request must be deduplicated by canonical pack id with `first declaration wins` semantics and a diagnostic for ignored duplicates.
- V1 should cap explicit Library context packs at 5 packs per request.

### Security and access control

- Every derived read must reuse existing tenant, ACL, group-sharing, and private-vault rules.
- Hidden notes must not appear through backlinks, mentions, graph edges, saved views, or context packs.
- Delegated workers may resolve only the specific context packs granted to them.
- Context-pack resolution must not imply blanket raw-note read access.

## Non-Goals

- replacing the current Library with a standalone app
- building a literal Obsidian clone
- introducing a plugin ecosystem or community-extension model
- silently changing search or RAG ranking using graph heuristics in v1
- building a full spreadsheet/formula platform in the first release
- treating binary files or connector references as first-class note graph participants in v1

## Success Metrics and Rollout Gates

- quick-switcher p95 <= 250 ms for the first 20 results on tenants with up to 10k visible notes
- note-save to inspector-read cache freshness p95 <= 5 seconds on warm indexing workers
- local graph p95 <= 400 ms with the default cap of 75 visible nodes; broader graph remains feature-flagged with a hard cap of 250 nodes
- context-pack resolution p95 <= 1200 ms for packs up to 25 resolved notes or 20k estimated tokens
- citation coverage = 100% for every resolved note that is included in runtime context
- hidden-note leakage = 0 in automated tests and rollout telemetry
- tenant backfill coverage >= 99% of readable Markdown notes before graph mode is enabled by default
- runtime construction fails closed for required packs and degrades explicitly for optional packs
- v1 does not regress current Library search visibility or existing RAG behavior

## Rollout Shape

1. Build the knowledge cache and canonical resolution model.
2. Expose read-side relationships, properties, and quick-switcher/navigation surfaces.
3. Add saved views and publishable context packs.
4. Bridge approved packs into runtime and MCP with narrow grants.
5. Expand graph and canvas after cache freshness, ACL safety, and pack resolution are stable.

## Acceptance Criteria

- A user can open a note by title, alias, or recent history without relying on folder browsing.
- A readable Markdown note shows backlinks, outgoing links, and unlinked mentions in a permission-safe inspector.
- Saved views over properties and tags can be created, reopened, and used to curate note sets.
- Existing Markdown notes are populated by backfill rather than manual resave.
- A context pack can be published from a note set or saved view and resolved into citation-backed, permission-filtered note context.
- The agent runtime can consume approved context packs through the shared context engine without bypassing budgeting or compaction.
- Delegated workers can only list or resolve granted packs, and unreadable/private content remains redacted or absent.
- Unsupported non-Markdown and connector-backed combinations show intentional empty, read-only, or metadata-only states.
- Saved views have durable ownership, visibility, and query-definition contracts instead of being ephemeral client state.
- Trusted business-memory packs automatically lose agent approval when their source view, source notes, or freshness window changes.
