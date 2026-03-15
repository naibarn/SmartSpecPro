# Implementation Plan

## Goal

Implement three built-in AgencySwarm experiences, Deep Research, Storyboard Planner, and Deck Builder, by adding a strict but backward-compatible structured result contract, preview-first result routing, commit-time downstream writes, and run-linked artifact tracking. The design must reuse the existing agency runtime, skill system, library and RAG stack, and presentation services.

## Implementation strategy

The work should be delivered in layers so backward compatibility is preserved throughout rollout.

The first layer is runtime contract normalization. The current Python and Node agency interfaces disagree on response field names and only treat the result as plain text. Introduce a canonical agency result shape that still carries readable text but also supports a validated `AgencyResultEnvelope` and persisted parsing metadata. This layer should be additive and must not require all agencies to emit structured output immediately.

The second layer is artifact persistence and preview semantics. Add run-linked artifact storage that records ephemeral preview artifacts and immutable provenance for successful runs. Preview data should be queryable and renderable without creating user-facing assets. Committed artifact state should be represented separately so the system can cleanly support “run succeeded but nothing was saved yet.”

The third layer is result routing. Build a router that consumes validated envelopes, maps them to platform intents, and prepares preview payloads for research, storyboard, and presentation outputs. The router should keep summary text for chat rendering while exposing structured payloads for product surfaces and commit actions.

The fourth layer is downstream commit flows. For research and storyboard, commit should create platform-tracked saved artifacts only when the user explicitly promotes the preview. For presentation decks, commit should invoke Node-side presentation services in a transaction-safe path modeled after the existing import flow. Commit behavior must be retry-safe and authorization-checked at the time of commit.

The fifth layer is product packaging. Seed built-in platform templates for the three experiences and provide clone-to-draft flows so tenants start from curated defaults without mutating the platform canonical version.

## Runtime contract and persistence changes

Add a versioned envelope parser and validator in the Python execution path after an agency run completes and before the final response is persisted or returned. The parser should extract structured envelope data from the result text, validate intent and payload shape, and emit a parsing outcome that can be stored with the run. If parsing fails for non-required templates, preserve the plain-text response and store the failure reason for diagnostics.

Extend agency run persistence with additive fields for structured result storage and introduce a dedicated `agency_run_artifacts` table. The artifact table should store run linkage, tenant attribution, artifact intent and type, preview versus committed state, summary, payload snapshot reference, provenance reference, commit target identifiers, and commit status. Keep artifact rows normalized enough for UI queries without forcing downstream products to reverse-engineer blob payloads.

Because `agency_runs` is a high-write runtime table, all schema changes should be additive and nullable at first. Avoid any contract that requires rewriting historical rows before new code can deploy.

Preview artifacts should follow an explicit lifecycle so UI, cleanup, and retries are deterministic. At minimum, the model should distinguish generated preview, expired preview, commit pending, committed, and commit failed states, together with timestamps and a stable commit token or idempotency key for safe retries.

## Preview-first routing behavior

The result router should classify intents from validated envelopes and produce structured preview records for the supported artifact types. The router should not create downstream deck, storyboard, or report records automatically. Instead, it should persist preview data plus commit metadata and return a response that lets the UI render the preview and offer an explicit save or promote action.

Research previews should surface summary, sections, comparison outputs, and citations. Storyboard previews should surface scene order, timing, narration, and prompt-ready media instructions. Deck previews should surface title, slide outline, notes, and any asset suggestions in a shape compatible with the existing presentation schemas and layout engine.

Preview rendering should remain available even if commit targets are temporarily disabled or fail. That separation prevents a failed write from discarding useful generated work.

Preview retention must be explicit. Ephemeral preview payloads should have a defined retention window and cleanup path, while immutable run audit data, routing metadata, and provenance summaries remain available after preview cleanup. The UI should indicate when a preview has expired and require regeneration before a new commit attempt can begin.

Streaming compatibility must be planned explicitly. The current agency system supports both non-streaming and SSE-style execution paths, so the structured-preview rollout cannot assume request-response only. The streaming contract should preserve existing token and progress behavior for legacy clients while defining how and when a final structured preview or preview-ready event is emitted. If preview material is only available after full envelope parsing and persistence, the event model should make that explicit instead of implying token-by-token structured routing.

For Phase 1, keep the stream contract additive. Python should continue emitting the existing stream events already proxied by Node, and structured preview support should appear as a new optional terminal `preview_ready` event emitted after preview persistence succeeds and before `run_finished`. The proxy can continue passing events through unchanged, which keeps legacy clients compatible while giving new clients a deterministic preview-available signal.

## Commit flows

Research and storyboard commit flows should create durable artifact records only after explicit confirmation. If the project already has an appropriate library or artifact storage mechanism, reuse it rather than inventing parallel content tables. If not, commit should at minimum mark the artifact as committed in `agency_run_artifacts` and store enough typed payload or storage references for later retrieval and export.

For this feature, confirmed research reports and storyboards should be committed as library-backed artifacts in Phase 1. `agency_run_artifacts` should remain the run-scoped index and provenance layer, while the committed object becomes a first-class library resource that can participate in existing ACL, reuse, sharing, and future downstream tooling.

That library-backed representation needs to be specified concretely during implementation rather than left as an abstract “saved artifact.” The plan should lock a canonical representation for each committed artifact type, including the `library_items.itemType`, `source`, canonical content representation, and the default open/view behavior. A practical Phase 1 shape is a hybrid model where a user-facing markdown representation coexists with a machine-oriented JSON payload reference, but one representation must be designated canonical so export, reopen, and future workflows behave consistently.

For Phase 1, confirmed research and storyboard outputs should use `library_items.itemType = "md"` and `source = "agency_generated"`. Their canonical readable body should live in markdown content storage using `markdown_source`, while any richer machine-oriented payload remains in `agency_run_artifacts` or a referenced snapshot. Metadata should distinguish `agency_research_report` from `agency_storyboard`, and the default open path should reuse the existing markdown/document library viewing path.

Deck commit should be implemented in Node, not directly in Python, because presentation creation already depends on Node-side services, feature gates, and transactional helpers. The commit path should create the backing library item and deck, add slides sequentially through existing optimistic-locking APIs or a dedicated transactional helper, and attach provenance references back to the originating agency run and source documents.

The canonical deck preview contract should be `AIPresentationSlide[]` plus deck-level metadata such as title, subtitle or framing summary, and optional notes. Commit should translate this preview payload through the existing layout and presentation services so the preview format stays stable even if final slide rendering internals evolve. Avoid introducing a second fully materialized slide-content preview contract in Phase 1 unless an implementation blocker appears.

Each commit path should perform an authorization check at commit time, not rely solely on preview-time authorization. It should also use a deterministic commit key or idempotency token so repeated button clicks or retried backend calls do not create duplicate decks or saved artifacts.

Commit-time revalidation must also detect stale previews. Before commit, the system should verify that the user still has permission to the referenced sources, that the resolved retrieval scope is still valid, that the preview has not expired, and that any commit target assumptions remain valid. If any of these checks fail, the system should surface a stale-preview or commit-conflict state and require regeneration instead of silently attempting a write.

Intent-specific fallback behavior must be defined. Research and storyboard previews should remain viewable even if final commit fails, with commit status updated separately and retries allowed when the underlying cause is transient. Deck preview commit should preserve the preview, record the failure, and avoid partial duplicate deck creation by relying on transactional writes and idempotency keys. If envelope parsing succeeds but downstream payload validation fails for a specific intent, the system should keep the run as a successful text-plus-preview attempt only when the preview can still be rendered safely; otherwise it should mark the structured preview portion as failed while preserving the plain-text result for diagnostics.

## Retrieval scope and provenance

Each built-in template should declare a default retrieval scope, but the run request should allow the caller to narrow or broaden the scope within the documents the caller is allowed to read. The resolved scope should be written into immutable run metadata so audits and citations can later explain what corpus was used.

The envelope reference model should carry both document-level and chunk-level provenance when available. Persist source document identifiers, chunk identifiers, relevance data, and any support mappings the retrieval path can provide. This provenance should be queryable for both preview display and post-commit audits.

Committed research and storyboard artifacts also need a clear re-index policy. Phase 1 should default to preventing model-generated reports and storyboards from being treated as primary evidence in later RAG runs. If these committed artifacts are stored in the library, they should either not be indexed into default retrieval at all or be indexed with metadata and filters that exclude them from ordinary research scopes unless a future feature explicitly opts them in.

The concrete Phase 1 default should be exclusion from ordinary RAG retrieval. If these library items still need indexing-related metadata for storage or consistency reasons, they must carry exclusion flags or filters so generated summaries are never mistaken for primary source evidence in default research runs.

## Built-in templates and skill usage

Create platform-owned templates for Deep Research, Storyboard Planner, and Deck Builder using the existing agency template infrastructure. These templates should define the default instructions, default retrieval scope rules, and curated tool surface for each experience. Tenants should clone them into editable drafts rather than editing the platform originals.

Storyboard Planner should lean on the existing storyboard skill and related skill registry rather than inventing a specialized runtime. Deck Builder should prefer structured slide-generation logic that can map into the presentation layout system. Deep Research should use existing RAG and document-search capabilities with stronger citation and summary formatting.

Only add new built-in tools where a gap clearly exists. A presentation commit or deck-creation bridge is justified because the current spec requires downstream deck creation, but new tools should remain narrow and well-described.

## API and UI work

Update the agency API contract so Node receives both readable response text and optional structured envelope data consistently. Normalize the field mismatch between Python `output` and Node `response` handling as part of this work rather than allowing envelope support to sit on top of a drifting base contract.

Expose run preview details and commit actions through Node APIs. The UI should render previews in agency chat or related product surfaces, show citations for research outputs, and provide an explicit promote action for each artifact type. The UI should also show whether a preview has already been committed and where the committed artifact can be opened.

The normalized run response should expose one canonical text field, one optional structured envelope field, and explicit artifact preview metadata so Python and Node do not rely on separate field-name conventions. Compatibility shims can remain temporarily, but new APIs and tests should target the normalized contract only.

The preview and committed-artifact APIs should expose a minimum provenance display contract so frontend surfaces can render citations consistently. At minimum, each provenance entry should include source title, source identifier, chunk references when available, source URI when available, and a short support summary suitable for hover or inline citation display.

The API plan must also define payload-size and snapshot behavior. Large research previews and deck payloads should not automatically live inline in hot-path runtime rows forever. The implementation should define thresholds for inline storage versus referenced snapshot storage, together with rules for truncation, summarization, or object-storage indirection. API responses should remain predictable even when the underlying preview body is stored out-of-line.

For Phase 1, use `64KB` serialized size as the inline storage threshold. Anything above that threshold should be stored out-of-line behind a referenced snapshot record or object-storage key, with hot-path runtime rows storing only compact metadata and references. Anything above `5MB` serialized size should not be persisted as a full direct preview payload in Phase 1; the system should either store a summarized preview or fail structured preview persistence deterministically while preserving text fallback when allowed.

## Regression prevention strategy

Protect the rollout with targeted tests at each seam: Python envelope parsing and persistence, Node bridge contract normalization, artifact router behavior, preview rendering APIs, commit APIs, and template seeding flows. Add integration coverage for deck commit using the existing presentation service test patterns and for provenance persistence using existing library service and agency test infrastructure.

Include explicit state-transition tests for preview lifecycle changes, duplicate commit suppression, stale-preview rejection, and commit retry behavior after transient failures. Add contract tests that assert Python and Node agree on the same run response shape when envelope data is present and when it is absent.

Ship behind feature gates where practical so preview-first flows can be enabled before downstream commit paths are broadly exposed. Capture routing and commit metrics so failures are visible before they become silent data inconsistencies.

Rollout should be phased. First enable structured envelope persistence and preview-only rendering for internal or limited tenants. Then enable research and storyboard commit flows. Enable deck commit only after preview metrics, parse success rates, duplicate suppression, and transaction safety checks are healthy. Template seeding should have a separate verification gate to confirm that platform templates clone correctly into editable tenant drafts before broader exposure.

Ownership should be explicit across Python runtime changes, Node routing changes, and template seeding. Monitoring should include parse failure rates, preview creation rates, commit success rates, duplicate-commit suppression, and deck creation failure causes.

## Impact map for existing features likely to regress

The most likely regression areas are existing agency run APIs, run list/detail views, agency chat rendering, artifact parsing utilities, presentation deck creation flows, library provenance display, and any reporting queries that depend on `agency_runs`. There is also risk to custom agencies if strict structured parsing accidentally becomes mandatory for all runs.

The plan must preserve old text-only behavior and treat structured output as opt-in or template-driven. Presentation functionality unrelated to agencies must continue using current services unchanged. Library permission behavior must not be bypassed by new preview or commit APIs.

## Data safety strategy

Risk classification: high.

This scope changes active runtime persistence and adds new artifact-linkage data. Although the migrations are additive, the affected tables are operationally important and power existing list/detail queries.

The migration strategy should be non-destructive and follow expand, migrate or backfill, then contract only if a later cleanup becomes necessary. Phase 1 should stop after the expand step and keep backward-compatible reads in place.

Pre-migration backup plan:

- take a database backup or snapshot before applying migrations in environments with production-like data
- record current row counts and index health for `agency_runs` and `agency_messages`
- verify rollback procedures for the application deploy and database schema separately

Restore and rollback runbook:

- trigger rollback if agency run creation starts failing, run list/detail latency spikes materially, or preview/commit APIs persist malformed records
- first roll back application code to the previous release that ignores new fields
- if schema-level issues persist, restore from the pre-migration backup or revert only the additive schema objects that are not yet relied on by older code
- verify recovery by executing an existing plain-text agency run, listing runs, and reading a historical run detail successfully

Automated migration and consistency checks:

- add migration tests or verification scripts that confirm new nullable columns and artifact tables are present
- add post-migration checks that new writes do not block old read paths
- validate that artifact rows always point to the correct tenant and run
- validate that committed deck artifacts point to existing library item and deck identifiers

If no destructive cleanup is performed in this phase, there is no need for data rewrite or deletion. That is why a backup is precautionary rather than part of a risky transform.

## Compatibility notes

Backward compatibility is mandatory. Existing agencies that emit only text must still complete successfully. Existing Node clients should continue to show readable responses even before they understand structured preview payloads. The new built-in templates and preview/commit flows should not require changes to unrelated agency builder graphs.

Because agency response fields are already inconsistent across services, contract normalization should happen early and be covered by tests before any UI depends on the new structured fields.
