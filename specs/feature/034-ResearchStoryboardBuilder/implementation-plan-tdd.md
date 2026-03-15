# Implementation Plan TDD

## Testing Context

This feature spans the Node web app and the Python backend.

- Node tests should follow the existing Vitest setup in `apps/web`.
- Python tests should follow the existing pytest setup in `python-backend`.
- Primary test commands:
  - `npm --prefix apps/web test`
  - `uv run --project python-backend pytest`

## Goal

Write tests first for the structured agency result contract, preview-first routing, library-backed commit behavior, deck commit integration, and built-in template distribution. Preserve backward compatibility for text-only agencies while adding structured preview and commit capabilities.

### Test stubs

- Test: text-only agency runs still return a readable result when no envelope is present.
- Test: structured agency runs return text plus envelope metadata without breaking existing consumers.
- Test: preview-first runs persist immutable audit metadata but do not auto-create committed artifacts.
- Test: committed research and storyboard outputs become library-backed artifacts and remain linked to the originating run.
- Test: deck previews use `AIPresentationSlide[]` plus deck metadata and commit through the existing presentation pipeline only after confirmation.

## Implementation strategy

### Test stubs

- Test: rollout preserves backward compatibility while new nullable persistence fields are unused by old readers.
- Test: preview and commit states are distinguishable in API responses and persistence records.
- Test: routing decisions are logged and queryable for observability.
- Test: duplicate confirm actions reuse the same commit token and do not create duplicate committed artifacts.

## Runtime contract and persistence changes

### Test stubs

- Python test: envelope parser accepts a valid `AgencyResultEnvelope` block and stores parsed metadata.
- Python test: parser rejects invalid schema or unsupported intent values and records failure details without breaking text fallback.
- Python test: text-only runs do not require envelope data to complete successfully.
- Python test: `agency_runs` persistence stores new nullable structured-result fields without regressing historical queries.
- Node test: normalized run response maps Python output into one canonical text field plus optional envelope field.
- Node test: `agency_run_artifacts` preview rows store tenant attribution, run linkage, state, and commit token correctly.

## Preview-first routing behavior

### Test stubs

- Node test: router classifies `research_report`, `video_storyboard`, and `presentation_deck` intents correctly.
- Node test: router creates preview records without creating downstream committed assets.
- Node test: preview payloads remain renderable when commit actions are unavailable or fail.
- Node test: expired previews are marked unavailable for commit while run audit metadata remains readable.
- Node test: preview APIs return summary text plus structured preview data for supported intents.
- Node test: streaming agency responses preserve existing SSE behavior while emitting a final structured-preview-ready event or equivalent terminal preview metadata.
- Node test: legacy SSE consumers still receive readable text/progress data even when structured preview support is enabled.
- Node or Python test: `preview_ready` is emitted only after preview persistence succeeds and before `run_finished` for structured-preview streaming runs.

## Commit flows

### Test stubs

- Node test: research confirm action creates a library-backed saved artifact and updates `agency_run_artifacts` to committed state.
- Node test: storyboard confirm action creates a library-backed saved artifact and preserves run provenance links.
- Node test: committed research artifact uses the agreed library item representation and opens through the expected viewer path.
- Node test: committed storyboard artifact uses the agreed library item representation and opens through the expected viewer path.
- Node test: committed research and storyboard outputs use `itemType = "md"`, `source = "agency_generated"`, and typed `metadata.source_type`.
- Node test: commit-time authorization is re-evaluated and denied when the user has lost access since preview generation.
- Node test: stale previews are rejected with a deterministic stale-preview error and no downstream write occurs.
- Node test: transient commit failures mark commit status as failed while preserving the preview and allowing retry.
- Node test: repeated commit requests with the same token do not create duplicate saved outputs.

## Retrieval scope and provenance

### Test stubs

- Node test: built-in template default retrieval scope is applied when the user does not override it.
- Node test: user overrides can narrow or broaden scope only within readable tenant resources.
- Node test: resolved scope is persisted into immutable run metadata.
- Node test: provenance DTOs include source title, identifiers, chunk refs when available, URI when available, and support summary.
- Node or Python test: envelope references preserve document and chunk-level provenance for supported retrieval results.
- Node test: committed research and storyboard artifacts are excluded from default RAG retrieval unless explicitly opted in by policy.
- Node or Python test: any indexing metadata for committed generated artifacts prevents them from being mistaken for primary source documents.
- Node or Python test: generated `agency_generated` markdown artifacts are excluded from default research retrieval paths in Phase 1.

## Built-in templates and skill usage

### Test stubs

- Node test: the three built-in platform templates are listed as active templates.
- Node test: cloning a built-in template produces an editable tenant draft without mutating the platform canonical template.
- Node test: storyboard template wiring includes the expected skill/tool surface.
- Node test: research and deck templates declare default retrieval or generation settings as expected.

## API and UI work

### Test stubs

- Node router test: preview-fetch endpoint returns committed status, preview status, and open-target metadata consistently.
- Node router test: confirm endpoint returns committed target identifiers for library-backed artifacts or presentation decks.
- Node component or contract test: research preview rendering can display citations and provenance entries from the new DTO.
- Node component or contract test: deck preview rendering accepts `AIPresentationSlide[]` plus deck metadata without requiring final slide content.

## Regression prevention strategy

### Test stubs

- Node test: agency bridge contract tests cover both envelope-present and text-only responses.
- Node test: artifact router and artifact parser regressions remain covered after introducing envelope-aware routing.
- Node test: presentation commit integration uses existing deck creation helpers without leaving orphaned library items on failure.
- Python test: agency API list/detail responses continue working after additive schema changes.
- Integration test: a structured run can move from completed preview to committed artifact with provenance intact.

## Impact map for existing features likely to regress

### Test stubs

- Node test: agency chat rendering still works for existing plain-text agencies.
- Node test: run history views can read runs with and without structured preview data.
- Node test: presentation editor features unrelated to agency commit remain unaffected.
- Node test: library permissions still block unreadable committed artifacts and previews.

## Data safety strategy

### Test stubs

- Migration verification test: new columns and artifact tables are additive and nullable where planned.
- Migration verification test: old run reads continue to succeed before any backfill occurs.
- Node or Python test: artifact rows always store the correct tenant and run IDs.
- Node test: committed deck artifacts point to real library item and deck identifiers after successful commit.
- Operational verification stub: run a smoke suite for plain-text agency run, structured preview run, run history read, and deck commit after migration.
- Node or Python test: large preview payloads above the inline threshold are stored via the referenced snapshot strategy without breaking preview APIs.
- Node or Python test: preview fetch responses remain stable when payload bodies are truncated, summarized, or stored out-of-line.
- Node or Python test: payloads above `5MB` are rejected from direct preview persistence or summarized according to the Phase 1 policy.

## Compatibility notes

### Test stubs

- Node test: old clients can still render readable text when structured envelope data is ignored.
- Node test: compatibility shim handles current Python `output` naming until consumers fully migrate.
- Python test: structured templates can require envelope parsing while generic text-only agencies still complete normally.
