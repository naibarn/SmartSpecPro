# Implementation Spec

## Summary

Add three built-in AgencySwarm-backed experiences to SmartSpecPro: Deep Research, Storyboard Planner, and Deck Builder. Each experience should ship as a platform-managed template that tenants clone into editable drafts. The implementation must use the existing AgencySwarm runtime, library and RAG stack, skill system, LLM gateway, and presentation services rather than introducing a new external runtime.

The core platform change is a structured result contract and routing layer that separates ephemeral generation results from committed user-facing artifacts. Successful runs must always persist audit and provenance data, while reports, storyboards, and decks are only written when the user explicitly confirms a preview.

## Product Behavior

### Built-in experiences

The system must provide three curated starting points:

1. Deep Research: analyze and synthesize tenant-authorized library material into a structured research result with citations and source provenance.
2. Storyboard Planner: turn a brief into a structured storyboard package including scenes, timing, narration, and prompt-ready media guidance.
3. Deck Builder: turn a brief into a structured slide deck preview that can be committed into the Presentation Editor.

These experiences are distributed as built-in platform templates. Tenants create their own editable draft copies from the platform templates before customizing or running them.

### Preview-before-commit behavior

Agency runs that generate downstream-capable outputs must produce an ephemeral structured preview first. The preview is visible in chat and related product surfaces, but it does not create a library report item, storyboard record, or presentation deck automatically.

Only an explicit user confirmation action promotes the preview into committed downstream records.

This preview-first rule applies to all three built-in experiences. The system must distinguish clearly between:

- run completed
- preview available
- artifact committed
- artifact commit failed

### Persistence behavior

Every successful run must persist immutable audit information even if the user never commits the preview. Persisted audit data includes:

- agency run identifiers and lifecycle state
- user and tenant attribution
- run input and configured scope
- structured envelope summary and payload snapshot
- source references and citation metadata
- model, skill, and routing metadata
- timestamps and status transitions

User-facing artifacts such as saved reports, committed storyboards, and presentation decks must be created only when the user explicitly saves or promotes the preview.

### Research scope behavior

Each built-in template defines a default retrieval scope. At run time, the user can narrow or expand the scope within tenant permissions. The platform must never allow scope expansion beyond what the current user is allowed to read.

## Functional Requirements

### Structured agency result contract

Introduce a canonical `AgencyResultEnvelope` contract for downstream-capable agency runs. The envelope must:

- be versioned
- carry an explicit intent such as `research_report`, `video_storyboard`, or `presentation_deck`
- separate human-readable summary text from machine-routed payload
- include structured references to source documents and chunks
- include artifact descriptors for preview and commit operations
- include execution metrics and skill usage where available

The platform must continue supporting the existing plain-text response path for backward compatibility. The new envelope is additive, not a breaking replacement.

### Envelope parsing and validation

The runtime must parse, validate, and persist envelopes without breaking chat-only agencies. If envelope parsing fails, the run should still complete as a plain-text result unless the template explicitly requires structured output for success.

Validation must include:

- schema validity
- allowed intent values
- tenant-safe reference structure
- payload compatibility with the downstream target

### Result routing

Add a result-routing layer that consumes validated envelopes and produces one of two outcomes:

1. preview-only structured run result
2. explicit commit flow into downstream records after user confirmation

The router must support:

- research previews with citations and provenance
- storyboard previews with prompt-ready structured content
- deck previews that can later be committed into a real presentation deck

Streaming and non-streaming agency execution must both remain supported. For streaming runs, the platform must define a backward-compatible event contract that allows text tokens or progress events to continue working while also emitting a final structured preview artifact or structured-result-ready event once envelope parsing and preview persistence have completed.

Phase 1 streaming decision:

- preserve existing events such as `run_started`, token or progress events, `run_finished`, and `run_error`
- add an optional additive terminal event `preview_ready`
- emit `preview_ready` only after envelope parsing, preview persistence, and preview artifact metadata are ready
- emit `run_finished` after `preview_ready` so legacy clients retain the same terminal behavior

Phase 1 commit targets:

- research report saved as a library-backed artifact, indexed by `agency_run_artifacts`
- storyboard saved as a library-backed artifact, indexed by `agency_run_artifacts`
- presentation deck creation through existing Node presentation services

### Artifact tracking

Extend agency persistence with dedicated artifact tracking linked to runs. Artifact tracking must distinguish:

- ephemeral preview artifacts
- committed downstream artifacts
- source references and linked library items
- commit attempts and outcomes

The system must support linking artifacts back to:

- run ID
- conversation ID
- tenant ID
- originating template or agency
- relevant library item IDs and chunk refs

### Committed artifact representation

Phase 1 committed research and storyboard outputs must have an explicit library representation rather than relying on opaque run-scoped blobs alone.

The implementation should define:

- the `library_items.itemType` and `source` conventions for committed research and storyboard outputs
- whether the committed body is stored primarily as markdown, JSON, or a hybrid representation
- which representation is considered canonical for later reopen, export, and downstream reuse
- the default viewer or retrieval path used by the UI when opening a committed artifact

Phase 1 committed artifact decision:

- committed research and storyboard outputs use `library_items.itemType = "md"`
- committed research and storyboard outputs use `source = "agency_generated"`
- the canonical readable body is stored as `markdown_source`
- typed machine-readable payloads remain attached through artifact records or referenced snapshots
- `metadata.source_type` distinguishes `agency_research_report` from `agency_storyboard`
- the default open path is the existing markdown or document-style library viewer flow

### Deck Builder integration

Deck Builder must convert a structured preview payload into a real presentation deck only after explicit confirmation. The commit path must run through existing Node presentation services and preserve transactional consistency for:

- library item creation
- deck creation
- slide insertion
- provenance attachment

The canonical deck preview payload should use `AIPresentationSlide[]` plus deck-level metadata. Commit-time translation should run through the existing presentation layout and deck creation pipeline rather than requiring previews to emit fully materialized final slide content.

### Storyboard integration

Storyboard Planner should reuse the existing skill ecosystem where possible, especially the current storyboard prompt skill. Phase 1 only needs structured storyboard output plus preview and save flows; direct video-edit integration remains out of scope.

### RAG re-index policy for committed artifacts

Committed research and storyboard artifacts must not accidentally pollute future retrieval. The implementation must define whether each committed artifact type is:

- never indexed back into RAG
- indexed only with explicit metadata that keeps it excluded from default retrieval
- indexed only after a separate user-controlled action

The default behavior in Phase 1 should prevent recursive retrieval of model-generated summaries as if they were primary source evidence.

Phase 1 re-index decision:

- committed generated artifacts are excluded from default research retrieval
- if indexing metadata is required for storage consistency, it must carry exclusion markers that keep these artifacts out of normal RAG scopes
- any future opt-in retrieval of generated artifacts must be a separate explicit product decision

### Template distribution

The system must ship canonical built-in platform templates for the three experiences and allow tenants to clone them into editable drafts. Platform-owned templates remain the curated source; tenant copies are where edits occur.

## Non-Functional Requirements

### Compatibility

- Existing agency runs and chat-only experiences must continue working without envelope data.
- Existing list/detail APIs for agency runs must remain functional during rollout.
- Old clients should still receive a readable text response even when structured data is present.

### Security and tenant isolation

- All RAG and document access must remain tenant-scoped and permission-checked.
- Retrieval scope expansion must never exceed the caller’s readable library surface.
- Artifact references must preserve tenant attribution and prevent cross-tenant leakage.
- Commit actions must re-check authorization instead of trusting preview-time state alone.

### Reliability

- Downstream commit operations must be idempotent or safely retryable.
- Presentation commit flows must be transactional where existing services already support transactions.
- Envelope parsing failures must degrade gracefully when possible.
- Structured preview and committed artifact storage must handle large payloads without overloading hot runtime tables.

### Observability

The system should log:

- structured result parsing outcomes
- routing decisions
- commit attempts and failures
- source/reference counts
- preview-to-commit conversion events

## Data Model Direction

The implementation requires additive persistence changes to agency runtime data. Expected additions include:

- a structured result field on agency run records or equivalent linked storage
- a dedicated `agency_run_artifacts` table for preview and committed artifact records
- explicit status fields or metadata that distinguish preview from committed state

Data changes must be additive and rollout-safe. Existing text response behavior must remain usable while new fields are introduced and backfilled where necessary.

Large preview and envelope payloads must use a defined storage strategy. The implementation should specify size thresholds for:

- inline database storage
- compressed or summarized storage
- external blob/object storage with database references

The platform should avoid storing arbitrarily large preview payloads directly in hot-path runtime rows when a referenced snapshot model is more appropriate.

Phase 1 storage decision:

- serialized preview or envelope payloads of `64KB` or less may be stored inline
- payloads larger than `64KB` must use referenced snapshot storage
- payloads larger than `5MB` are out of bounds for direct preview persistence in Phase 1 and must be summarized or rejected from structured preview persistence
- preview APIs should return a stable summarized response plus snapshot metadata when the full body is stored out-of-line

## API and UI Direction

The product needs new or updated APIs for:

- returning structured preview data alongside text output
- listing preview and committed artifacts for a run
- confirming or promoting a preview into a committed artifact
- retrieving commit status and target identifiers
- streaming structured-preview readiness in a backward-compatible way for SSE clients

The UI needs:

- clear preview rendering for research, storyboard, and deck intents
- an explicit commit or save action
- visible citation and provenance display for research outputs
- a clear transition from preview to committed deck or artifact

## Acceptance Criteria

1. A tenant can create editable draft copies of the three built-in templates.
2. A Deep Research run returns a structured preview with citations and persisted audit metadata without auto-creating a final report record.
3. A Storyboard Planner run returns a structured storyboard preview and only creates a saved storyboard artifact after explicit confirmation.
4. A Deck Builder run returns a structured deck preview and only creates a real presentation deck after explicit confirmation.
5. Successful runs persist immutable audit and provenance metadata even when the user never commits the preview.
6. Retrieval scope defaults come from the template and can be narrowed or expanded per run within tenant permissions.
7. Existing plain-text agencies continue to work without requiring an envelope.
8. Artifact records and references remain tenant-safe and traceable to their originating run.
9. Streaming agency clients continue to receive existing SSE events, and structured-preview runs additionally emit `preview_ready` before `run_finished`.
10. Confirmed research and storyboard outputs are saved as markdown-backed library items using `itemType = "md"` and `source = "agency_generated"`.
11. Committed generated artifacts do not enter default RAG retrieval as primary evidence in Phase 1.
12. Preview payloads larger than the inline threshold follow the referenced snapshot policy without breaking preview APIs.
