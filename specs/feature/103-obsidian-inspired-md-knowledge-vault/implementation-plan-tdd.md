# TDD Guidance

## First failing tests to add

1. Markdown parser tests for:
   - frontmatter properties
   - aliases
   - tags
   - internal links
   - headings
2. Knowledge cache tests for:
   - relation extraction
   - canonical note resolution by path, title, and alias
   - ambiguous-link fallback without silent guessing
   - backlink lookup
   - outgoing link lookup
   - cache refresh after save, rename, and move
   - tenant backfill and rebuild job behavior
3. Permission tests for:
   - hidden note filtering
   - tenant isolation
   - private vault gating
   - stale-cache fail-closed behavior
4. Saved view tests for:
   - property filters
   - tag filters
   - sort and grouping
   - persistence and restore
5. Context-pack tests for:
   - manual pack resolution
   - saved-view-backed pack resolution
   - snapshot pack stability
   - permission filtering at resolve time
   - partial results for stale, deleted, or unindexed notes
   - citation metadata on every returned note context
   - default `relation_expansion_policy = none`
6. Runtime adapter tests for:
   - Library context-pack refs compile into context-engine slots
   - reviewed packs default to `durable_memory`
   - task-scoped packs default to `retrieved_evidence`
   - required-pack resolution failure aborts runtime request construction
   - optional-pack resolution failure surfaces diagnostics without silent raw-note fallback
   - runtime evidence items preserve Library source refs and included reasons
7. MCP / delegated-worker tests for:
   - context-pack list tool visibility follows manifest flags
   - context-pack resolve tool enforces per-pack grants
   - resolve does not imply blanket `library.get` access on underlying notes
   - private-vault or unreadable items stay redacted in resolved output
8. UI tests for:
   - quick switcher opening recent notes
   - duplicate-title results showing enough disambiguation metadata
   - note inspector showing related content
   - explicit attach/open from a related-note surface passes a user-chosen note forward without enabling implicit graph expansion globally
   - unsupported non-markdown and cloud-reference combinations rendering intentional empty or disabled states
   - graph panel rendering the active note's neighborhood
   - canvas board opening and saving a note layout

## Rollout gate tests

- Cache freshness test or harness for markdown save to relation-read readiness.
- Backfill coverage reporting test at tenant scope.
- Graph node-cap default guard test.
- RAG compatibility test proving navigation cache does not auto-inject into context in v1.
- Explicit-attach compatibility test proving user-selected related notes can still be passed into downstream chat/work flows intentionally.
- Context-pack latency or harness test for normal pack resolution.
- Citation-coverage test for resolved business-memory context.
- Runtime fail-closed test for required Library context packs.
- Delegated-worker leakage test for context-pack resolve without raw note grants.

## Expected failing condition

The current codebase does not yet expose a dedicated knowledge cache or note-relationship API, so tests that expect backlinks, properties, or saved views should fail until the new services and schema are added.

## Regression checks

- Markdown save still enqueues exactly one reindex path.
- Existing document search still returns the same visible items for current scopes.
- Sharing and private-vault access rules still work.
- Version history still restores the correct content.
- Folders and current list browsing still function.
- Rename and move flows preserve canonical backlinks for resolved notes.
- Context-pack resolution stays stable when a saved view, share rule, or note title changes.
- Runtime request building remains backward compatible when no Library context packs are requested.

## Test philosophy

- Start with pure parser and service tests.
- Add router tests for access boundaries before UI polish.
- Add context-pack contract tests before wiring agent integrations.
- Add runtime-adapter and MCP grant tests before enabling delegated-worker consumption.
- Add UI tests only after the data contracts are stable.
- Treat ambiguity and unsupported-mode behavior as first-class cases, not edge cases.
- Keep the feature backward compatible for users who only browse by search and folders.
