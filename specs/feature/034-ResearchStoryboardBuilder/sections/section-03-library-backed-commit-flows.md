# Section 03 - Library-Backed Commit Flows

## Objective

Commit confirmed research reports and storyboards as first-class library-backed artifacts while preserving `agency_run_artifacts` as the run-scoped provenance and audit index.

## Prerequisites

- Section 01 complete.
- Section 02 complete.

## Scope

- Commit research previews into library-backed saved outputs.
- Commit storyboard previews into library-backed saved outputs.
- Preserve provenance links back to runs, sources, and chunks.
- Enforce commit-time authorization, stale-preview checks, and idempotent retries.

## Primary files and areas

- Library services under `apps/web/server/services/libraryService.ts`
- Agency router/service layers for confirm actions
- Artifact persistence and linking tables
- Any artifact storage helpers used for saved outputs

## Required implementation work

### 1. Choose the library-backed commit representation

Research and storyboard committed outputs must become first-class library artifacts in Phase 1. Reuse existing library item patterns rather than inventing a separate silo.

Each commit should:

- create or link a library item
- update `agency_run_artifacts` to committed state
- preserve artifact-to-run linkage
- retain source provenance and citation metadata

This section must explicitly lock:

- `library_items.itemType`
- `source`
- canonical persisted body format
- optional secondary machine-readable payload reference
- default UI open path for each artifact type

For Phase 1, lock these values as:

- `itemType = "md"`
- `source = "agency_generated"`
- canonical persisted body format = markdown in `markdown_source`
- optional secondary machine-readable payload reference = run artifact snapshot or referenced blob
- default UI open path = existing library markdown/document viewing path

### 2. Enforce commit-time revalidation

Before commit, re-check:

- user authorization
- source readability
- preview freshness
- commit token validity

If stale or unauthorized, reject commit deterministically and require regeneration or access restoration.

### 3. Handle retries and partial failures

Commit failures must not destroy previews. Transient failures should record `commit_failed` while allowing safe retry with the same commit token. Duplicate commit requests must not create duplicate library artifacts.

### 4. Define RAG re-index policy

Committed research and storyboard outputs must not silently become default retrieval evidence. This section should define whether committed generated artifacts:

- are never indexed for RAG
- are indexed with exclusion metadata
- require explicit opt-in before retrieval

Phase 1 should default to safe exclusion from ordinary research retrieval.

## Tests to write first

- Node test: confirmed research preview becomes a library-backed artifact and updates artifact state to committed.
- Node test: confirmed storyboard preview becomes a library-backed artifact and preserves provenance links.
- Node test: stale preview is rejected with no library artifact created.
- Node test: lost permissions at commit time block commit.
- Node test: duplicate commit requests reuse the same idempotency token and do not duplicate artifacts.
- Node test: commit failure preserves preview visibility and records failure state separately.
- Node test: committed generated artifacts follow the agreed RAG exclusion or filtering policy.

## Risks and safeguards

- Permission leakage risk if library commit bypasses normal ACL checks. Always reuse actor-aware library services.
- Storage consistency risk if run index and library artifact can diverge. Update both in one deterministic flow and store target identifiers.
- Reuse risk if committed artifact schema is too weak. Ensure saved outputs are discoverable and re-openable as library-backed items.

## Exit criteria

- Research and storyboard confirms create library-backed artifacts.
- `agency_run_artifacts` remains the provenance/audit index.
- Commit-time stale-preview and auth checks are enforced.
- Duplicate commit suppression is test-covered.

## Implementation notes

- Added `apps/web/server/services/agencyCommitService.ts` as the Section 03 commit path for `research_report` and `video_storyboard` previews.
- The commit flow now re-checks preview freshness, commit-token validity, conversation ownership, and readable numeric provenance documents before writing a durable artifact.
- Confirmed research and storyboard previews now create library items with `itemType = "md"`, `source = "agency_generated"`, and markdown stored in the `markdown_source` chunk path.
- `agency.commitPreview` in `apps/web/server/routers/agency.ts` now resolves the requested preview artifact, delegates to the commit service, and returns stable committed target identifiers instead of the Section 02 placeholder response.
- Committed artifacts are linked idempotently through `library_links(linkType = "agency_run_artifact")`, while `agency_run_artifacts` remains the run-scoped source of truth for commit state and provenance.
- The initial commit path stores markdown directly without enqueueing ordinary library indexing, keeping generated research/storyboard artifacts out of default RAG retrieval by default in Phase 1.

## Tests added and updated

- `apps/web/server/services/agencyCommitService.test.ts`
- `apps/web/server/routers/__tests__/agency.test.ts`

## Known follow-ups

- Section 04 still needs the parallel deck commit path so `presentation_deck` previews commit into real presentation decks instead of returning `PRECONDITION_FAILED`.
- Source readability revalidation currently enforces numeric library document identifiers in provenance; non-library references such as external URLs remain audit-only in this phase.
