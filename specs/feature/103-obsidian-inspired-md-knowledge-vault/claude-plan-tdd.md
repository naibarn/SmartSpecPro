# Claude Plan TDD

## Objective

Write tests before implementation so the knowledge-vault feature lands as a safe extension of the existing Library, runtime, and MCP systems rather than as a UI-only layer.

## Section 1: Vault and Knowledge Cache

- Test: Markdown extraction parses frontmatter, tags, aliases, headings, and internal links from representative note fixtures.
- Test: canonical resolution converts title, alias, and logical-path references into `resolved | ambiguous | unresolved | forbidden`.
- Test: cache refresh runs after markdown save, rename, move, restore, and share-sensitive changes.
- Test: knowledge-cache reads fail closed when the note is deleted, unreadable, or private-vault locked.
- Test: backfill jobs report coverage, retryable failures, and rebuild behavior at tenant scope.

## Section 2: Note Navigation and Relationship Panels

- Test: backlink queries only return readable notes in the actor's scope.
- Test: outgoing links include unresolved and ambiguous diagnostics without leaking forbidden targets.
- Test: unlinked-mention results exclude unreadable notes and honor query filters.
- Test: quick-switcher ranks exact title, alias, and recent-note matches deterministically.
- Test: duplicate-title results include enough metadata to disambiguate safely.
- Test: explicit attach/open from related-note surfaces passes only the user-selected note downstream.

## Section 3: Properties, Bases, and Search Facets

- Test: property extraction produces stable typed values for supported YAML field shapes.
- Test: property catalog aggregates frequency/type information without crossing tenant boundaries.
- Test: saved views persist filters, sort, grouping, and columns and can be restored without mutation drift.
- Test: saved views enforce ownership, visibility mode, and optimistic-concurrency updates.
- Test: `view_backed` context packs resolve against the current server-side saved-view definition rather than client-side transient state.
- Test: non-Markdown items remain metadata-only in view/filter behavior.
- Test: property-driven filters and tags integrate with existing Library search visibility rules.

## Section 4: Canvas Rollout and Compatibility

- Test: canvas boards persist and reopen with stable note/evidence card references.
- Test: connector-backed or binary assets render only in allowed evidence/reference modes.
- Test: canvas connections do not create automatic backlinks or retrieval edges in v1.
- Test: unsupported combinations show intentional disabled or read-only states rather than empty failures.

## Section 5: Agent Skill Context Packs and Business Memory

- Test: create, update, archive, and publish flows validate the shared Zod contracts and persistence invariants.
- Test: manual, view-backed, and snapshot packs resolve into `complete | partial | empty` status with diagnostics.
- Test: unreadable, stale, deleted, and unindexed notes are handled as redactions/diagnostics rather than silent drops.
- Test: every resolved item includes source refs, included reason, and citation metadata when requested.
- Test: default relation expansion policy remains `none`.
- Test: only approved-for-agents, readable packs are considered default business memory.
- Test: readiness lifecycle transitions `draft -> review_pending -> trusted -> stale` behave deterministically.
- Test: trusted packs automatically clear `approvedForAgents` when source membership, visibility, or freshness windows change.

## Section 6: Runtime and MCP Integration

- Test: Library context-pack refs extend shared runtime request construction without bypassing compaction or budgeting.
- Test: trusted packs map to `durable_memory` and task-scoped packs map to `retrieved_evidence`.
- Test: `BuildContextPackRequest.libraryContextPacks` preserves caller order and deduplicates repeated refs with diagnostics.
- Test: request-level caps reject more than 5 explicit Library context packs.
- Test: required pack resolution failures abort runtime request construction.
- Test: optional pack failures surface diagnostics without raw-note fallback.
- Test: MCP list/resolve tools enforce manifest flags and per-pack grants.
- Test: resolving a granted pack does not unlock unrestricted `library.get` access on underlying notes.

## Section 7: Schema and Router Contracts

- Test: new schema enums, tables, indexes, and constraints match declared contracts.
- Test: router input/output shapes remain aligned with shared Zod contracts.
- Test: migrations preserve existing Library CRUD/search/version flows.
- Test: cache-unready states degrade safely while migrations/backfill are in progress.

## Section 8: End-to-End Sequence Flows and Rollout

- Test: save-to-cache-refresh readiness stays within rollout freshness expectations.
- Test: tenant backfill coverage and repair flows expose usable diagnostics and progress state.
- Test: quick-switcher and context-pack resolution remain within accepted latency budgets under representative datasets.
- Test: local graph respects the default 75-node cap and broader graph respects the 250-node hard cap while feature-flagged.
- Test: hidden-note leakage remains zero across inspector, graph, saved views, context packs, runtime, and MCP.
- Test: current Library search results remain backward compatible when knowledge-vault features are disabled or unused.
