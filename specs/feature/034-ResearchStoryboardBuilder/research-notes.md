# Research Notes

## Codebase Recon

### Spec-driven impact map

The feature proposes three preconfigured agency experiences on top of the existing platform:

1. Deep Research agent using AgencySwarm plus tenant-scoped Library/RAG.
2. Storyboard Planner agent that can reuse the existing skill system and feed downstream media workflows.
3. Deck Builder agent that must create a real presentation deck inside the Presentation Editor, not just return text.

The central new cross-cutting requirement is a structured agency result contract plus artifact tracking so agency output can be routed into downstream product surfaces.

### Existing architecture and module boundaries

#### Agency runtime

- Python owns execution lifecycle and persistence.
- `python-backend/app/services/agency_service.py` creates `agency_runs`, resolves tools, chooses between the plain adapter path and `AgencyOrchestrator`, and writes run completion metadata.
- `python-backend/app/services/agency_swarm_adapter.py` is the only direct Agency Swarm integration layer and currently returns a plain-text `RunResult.response`.
- `python-backend/app/services/agency_orchestrator.py` already supports non-agent nodes: `agent`, `supervisor`, `router`, `aggregator`, `knowledge_base`, `skill_call`, and `human_approval`.
- Node owns the web/API bridge via `apps/web/server/services/agencyBridge.ts` and product-facing CRUD/template endpoints via `apps/web/server/routers/agency.ts`.

#### Skills and reusable generation flows

- Agency can already expose built-in tools such as `builtin-rag-knowledge`, `builtin-skill-executor`, and `builtin-document-search` from `apps/web/server/routers/agency.ts`.
- Python-side skill nodes discover `apps/web/skills/*/skill.md` and can execute skill bodies through the Node LLM gateway in `python-backend/app/orchestrator/node_executors/skill_executor.py`.
- Node skill definitions are loaded and normalized from DB plus auto-synced folders in `apps/web/server/services/skillRegistry.ts`.
- There is already a relevant skill seed at `apps/web/skills/video-storyboard-to-prompts/skill.md`, which reduces the amount of new storyboard generation logic needed.

#### Presentation/editor integration

- Presentation deck creation is already a first-class service, not an ad hoc JSON export.
- `apps/web/server/services/presentationService.ts` can create a presentation deck bound to a library item and then add slides sequentially with optimistic locking.
- `apps/web/server/services/presentationImportService.ts` shows the safest existing pattern for creating decks plus slides transactionally.
- `apps/web/shared/presentation/aiTypes.ts` already defines a structured `AIPresentationSlide` schema that looks close to a usable payload target for a deck-building envelope.
- `apps/web/server/services/artifactRouter.ts` already classifies artifact intent (`chat_reply`, `research_report`, `presentation_deck`, `media_prompt`) and chooses direct vs deterministic routes, which is a strong starting point for a new result router instead of inventing a parallel concept.
- `apps/web/server/services/artifactParser.ts` already parses fenced artifact blocks from model text, but it does not provide a typed envelope contract, artifact IDs, references, or routing metadata.

#### Library, RAG, and document provenance

- Library data is modeled in `apps/web/drizzle/schema.ts` with `library_items`, `library_chunks`, `library_permissions`, `library_links`, and content versions.
- Tenant and sharing scope propagation is handled in `apps/web/server/services/libraryService.ts` through `allowedScopes` and permission-aware lookups.
- The current library service already guards readable content access with actor/tenant checks before returning markdown or metadata.
- `python-backend/app/orchestrator/rag/hybrid_rag.py` provides the retrieval engine abstraction and supports citation-oriented fields such as `chunk_id`, `parent_doc_id`, and `parent_doc_title`.
- `apps/web/server/services/vectorProvider.ts` already supports tenant-tagged metadata and multiple vector backends, so no new retrieval runtime is needed.

### Current runtime contracts and integration seams

#### Agency output contract today is text-first

- `python-backend/app/services/agency_swarm_adapter.py` returns `RunResult(response: str, ...)`.
- `python-backend/app/api/agencies.py` exposes `AgencyRunResponse.output`.
- `apps/web/server/services/agencyBridge.ts` expects `data.response`.

This means there is already contract drift across Python and Node. Any new `AgencyResultEnvelope` work should normalize this boundary first, otherwise downstream routing will sit on top of an unstable response shape.

#### Artifact tracking does not exist for agency runs

- `python-backend/app/models/agency.py` stores `agency_runs` and `agency_messages`.
- `agency_runs` includes lifecycle and generic JSON `metadata`, but no dedicated `result_envelope` field and no artifact table.
- `agency_messages` stores content plus `tool_calls`, but not explicit artifact references.

The spec’s artifact-tracking requirement therefore needs additive schema work on active runtime tables, not just service-layer changes.

#### Presentation import path is close to the desired deck-builder behavior

- `createDeckFromImportResult()` in `apps/web/server/services/presentationImportService.ts` already demonstrates the correct order:
  1. create library item
  2. create deck
  3. add slides sequentially
  4. record provenance
  5. keep the full flow transactional

Deck Builder should probably reuse this pattern or an adjacent helper instead of bypassing presentation services from Python directly.

### Existing tests and likely coverage gaps

Relevant existing test coverage exists for:

- agency bridge and agency router flows
- artifact parser and artifact router behavior
- library service, library ops, and tenant attribution
- presentation service, import service, AI presentation flows, rollout/readiness checks
- skill execution policies and runtime sync

Notable likely gaps for this feature:

- no tests for a typed agency result envelope crossing Python and Node boundaries
- no tests for agency-created presentation artifacts being imported/routed automatically
- no tests for agency artifact persistence and provenance back to library items
- no tests for template provisioning of the three proposed prebuilt agency experiences
- no tests for storyboard/deck/research result routing failures or partial-success recovery

### Database and migration risk

Risk classification: high.

Reasons:

- `agency_runs` is an active runtime table used for historical queries and status reporting.
- The feature adds new runtime metadata and a new artifact relation table.
- The work spans both SQLAlchemy models in Python and Drizzle schema/query usage in Node.

Migration implications:

- use additive, non-destructive migrations only
- prefer nullable new columns first
- backfill asynchronously where possible
- keep old text response behavior working during rollout until both services read the new contract

### Tenant attribution, permission checks, and security controls

- Agency runs already carry `tenant_id`, `user_id`, and `conversation_id` through Python execution context.
- Cross-agency and higher-risk tool use is already whitelist-based in `python-backend/app/services/agency_tools.py`.
- Library visibility and sharing are permission-checked in `apps/web/server/services/libraryService.ts`; readable presentation/library resources go through actor-aware access checks in `presentationService.ts`.
- Scope propagation updates `allowedScopes` on both library items and chunks and then propagates to vector infrastructure, which is critical for any research agent that cites or links source documents.
- RAG- and document-based results should preserve `library_item_id`, chunk refs, and tenant context in any new artifact model to avoid cross-tenant leakage.

### Existing templates and product-entry points

- Agency templates already exist generically through `apps/web/server/routers/agency.ts` (`listTemplates`, `createFromTemplate`).
- The current system does not appear to contain prebuilt Deep Research, Storyboard Planner, or Deck Builder templates yet.

This is good news for implementation: the platform already has a place to surface preconfigured experiences, but seed/template content and post-run routing still need to be added.

### Regression and compatibility risks

1. Python and Node agency response shape mismatch can break old clients if envelope support is added carelessly.
2. Writing presentation decks outside the existing service transaction flow risks orphaned library items or partially created decks.
3. Any artifact links to library items without scope propagation or actor checks could create tenant leakage.
4. Replacing plain text output too early could regress chat-only agencies that expect a raw response string.
5. Runtime-table migrations on `agency_runs` can degrade historical list/detail queries if indexes and nullability are not handled carefully.

### Recommended implementation bias from recon

1. Keep the current plain-text response path as backward-compatible fallback.
2. Add an additive envelope parser plus router rather than replacing the whole agency execution path.
3. Route presentation artifacts through existing Node presentation services, ideally by reusing transactional deck/slides helpers.
4. Store artifact provenance in a dedicated table linked back to `agency_runs` and, where relevant, `library_items`.
5. Reuse existing skill and template infrastructure for Storyboard Planner rather than introducing a new runtime.

### Destructive or data-loss risk detected

No immediate destructive behavior is required by the spec, but the planned schema work touches runtime data. Treat database changes as migration-sensitive and use expand -> backfill -> contract rollout if schema normalization becomes necessary later.

## Web Research

Date: 2026-03-11

### Topic 1 - structured-output-contracts

Recommendation:

- Use a strict schema contract for every machine-routed agency artifact, with explicit versioning and backward-compatible text fallback.
- Disable parallel tool calling in any step where strict schema conformance is required.
- Treat schema validity as separate from semantic correctness; validate both.

Why:

- OpenAI’s function-calling guide recommends `strict: true`, requires `additionalProperties: false` and required fields, and notes that parallel tool calls can disable strict behavior in some cases.
- MCP’s tools spec now supports structured tool output and output schemas, which aligns well with the spec’s proposed `AgencyResultEnvelope`.
- OpenAI’s agent safety guidance explicitly recommends structured outputs between nodes to constrain downstream data flow and reduce injection risk.

Implication for this feature:

- `AgencyResultEnvelope` should be the canonical structured contract.
- Preserve `response` text for chat/UI compatibility, but parse/store a validated envelope alongside it.
- Envelope-carrying agent/template flows should run with a single structured result path, not multi-tool parallel result aggregation.

Sources:

- OpenAI function calling guide: https://developers.openai.com/api/docs/guides/function-calling
- OpenAI agent safety guide: https://developers.openai.com/api/docs/guides/agent-builder-safety
- MCP tools specification: https://modelcontextprotocol.io/specification/draft/server/tools
- MCP 2025-06-18 changelog: https://modelcontextprotocol.io/specification/2025-06-18/changelog

### Topic 2 - agent-artifact-routing

Recommendation:

- Model the router around a typed structured result plus explicit artifact/resource references instead of parsing freeform text alone.
- Separate user-visible summary text from machine-visible structured payload and resource references.
- Carry per-artifact metadata such as audience, priority, modification timestamp, and provenance link targets when possible.

Why:

- MCP tool results support both human-readable content and `structuredContent`, plus resource links and embedded resources with annotations.
- MCP explicitly recommends returning serialized JSON alongside structured content for backward compatibility.
- OpenAI’s safety guidance supports isolating machine-routed data into validated schemas instead of freeform text channels.

Implication for this feature:

- Result routing should likely ingest:
  - summary text for chat
  - typed payload for `research_report`, `video_storyboard`, or `presentation_deck`
  - artifact/resource references for provenance and follow-on actions
- `agency_run_artifacts` should store typed refs rather than only raw blob payloads.

Sources:

- MCP tools specification: https://modelcontextprotocol.io/specification/draft/server/tools
- MCP 2025-06-18 changelog: https://modelcontextprotocol.io/specification/2025-06-18/changelog
- OpenAI agent safety guide: https://developers.openai.com/api/docs/guides/agent-builder-safety

### Topic 3 - presentation-import-pipelines

Recommendation:

- Keep deck creation idempotent and transactional.
- Use batched/ordered slide mutation APIs, but create persistent provenance and retry keys at the application layer.
- Treat deck creation as a write workflow with safe retries, not a best-effort side effect.

Why:

- Google Slides’ official API patterns are built around `presentations.batchUpdate`, which is a single ordered request list for slide mutations.
- Stripe’s idempotency guidance is a strong official reference for safe retry semantics on create/update APIs: retry with the same idempotency key and return the original result for duplicate submissions.

Implication for this feature:

- The Node-side deck builder path should own:
  - idempotency key generation or deterministic artifact keying
  - transaction boundary for library item + deck + slides + provenance rows
  - safe retry semantics when Python or routing retries occur
- Reuse the existing `presentationImportService`/`presentationService` pattern instead of creating slides directly from Python.

Sources:

- Google Slides API slide operations: https://developers.google.com/workspace/slides/api/samples/slides
- Stripe idempotent requests: https://docs.stripe.com/api/idempotent_requests

### Topic 4 - rag-citations-provenance

Recommendation:

- Persist both source chunks and the model-to-source support mapping, not just document IDs.
- Keep retrieval-query metadata and citation display metadata available for UI rendering and audits.
- Design the envelope/reference model so each generated claim block can point back to chunk-level evidence when available.

Why:

- Vertex AI grounding metadata includes `groundingChunks` plus `groundingSupports`, explicitly linking generated content to supporting evidence.
- Google’s grounding docs also expose query metadata and display entry points, reinforcing that provenance is not only storage metadata but also UI-facing explanation data.
- Google’s external search grounding contract requires each result to return both a snippet and a URI, which is a practical minimal provenance shape.

Implication for this feature:

- `references` in `AgencyResultEnvelope` should probably expand beyond document ID to include chunk IDs and evidence mapping.
- Artifact tracking should retain enough information to show “which sources supported this output” inside chat/editor surfaces.

Sources:

- Vertex AI `GroundingMetadata` reference: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1/GroundingMetadata
- Vertex AI grounding with your search API: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/grounding/grounding-with-your-search-api
- Vertex AI Search check grounding: https://cloud.google.com/generative-ai-app-builder/docs/check-grounding

### Topic 5 - multi-tenant-agent-security

Recommendation:

- Keep authentication, tenant mapping, and authorization as separate concerns.
- Store tenant roles/permissions explicitly and avoid duplicating credentials per tenant when possible.
- Choose a clear tenant-isolation model for artifacts and models before enabling shared training or cross-tenant reuse.

Why:

- Microsoft’s multitenant identity guidance recommends against building authentication yourself and distinguishes identity storage from tenant authorization storage.
- The same guidance recommends a single identity per person when possible and warns against storing credentials multiple times for per-tenant identities.
- Microsoft’s AI/multitenant guidance emphasizes that tenants must not gain unauthorized access to other tenants’ data or models, and that shared-model training requires tenant understanding/consent plus removal of identifying data.

Implication for this feature:

- Artifact access must inherit tenant and permission checks from library resources.
- If future phases train or tune on tenant data, that must be a separate consent/isolation decision, not an accidental byproduct of these new agents.
- The current project’s tool whitelist, tenant IDs, and library permission checks are directionally correct and should remain the enforcement backbone.

Sources:

- Microsoft identity guidance for multitenant solutions: https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/considerations/identity
- Microsoft AI/ML multitenancy guidance: https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/ai-machine-learning
- Google Identity Platform multi-tenancy overview: https://cloud.google.com/identity-platform/docs/multi-tenancy

### Topic 6 - skill-augmented-agents

Recommendation:

- Prefer a small set of well-described, higher-signal skills/tools over many narrow tools.
- Make handoffs/state transitions explicit and return a tool response every time a tool initiates a state change.
- Use detailed tool descriptions, examples for complex inputs, and compact response payloads.

Why:

- Anthropic’s tool-use guidance stresses that detailed descriptions are the biggest factor in tool performance, recommends consolidating related actions, and recommends returning only high-signal information.
- LangChain’s handoff guidance shows that tool-driven state transitions need a matching `ToolMessage`; otherwise conversation history becomes malformed.
- This supports the spec’s “no new runtime” direction: the critical problem is orchestration and tool contract quality, not absence of another agent framework.

Implication for this feature:

- The three proposed agents should rely on a curated tool/skill surface:
  - research: RAG/document search plus maybe report formatting skill
  - storyboard: storyboard/prompt skills plus optional media-prefill output
  - deck builder: structured deck-generation skill plus presentation-create/import tool
- Add as few new built-ins as necessary and invest more in precise descriptions, schemas, and result shaping.

Sources:

- Anthropic tool-use implementation guide: https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use
- LangChain handoffs guide: https://docs.langchain.com/oss/python/langchain/multi-agent/handoffs

### Consolidated takeaways

1. The spec’s existing direction is supported by current platform and external guidance: add a strict structured contract, not a new orchestration runtime.
2. Keep compatibility by preserving plain-text response rendering while storing a typed envelope in parallel.
3. Route deck creation through the existing Node presentation transaction boundary with retry-safe/idempotent semantics.
4. Treat provenance as first-class data: chunk refs, source URIs, support mappings, and artifact-to-library links.
5. Keep tenant isolation explicit across run records, artifact records, tool inputs, library items, and any future model-tuning work.

## Testing

### Existing test frameworks and commands

- Node and web/server code uses Vitest from `apps/web/package.json` and `apps/web/vitest.config.ts`.
- Main Node test command: `npm --prefix apps/web test`
- Coverage command: `npm --prefix apps/web test:coverage`
- Vitest includes `server/**/*.test.ts`, `server/**/*.spec.ts`, `shared/**/*.test.ts`, and client tests. Server tests run in `node`; client `tsx` tests can switch to `jsdom`.

- Python backend uses pytest configured in `python-backend/pyproject.toml` and `python-backend/pytest.ini`.
- Main Python test command: `uv run --project python-backend pytest`
- Pytest uses `tests/`, `test_*.py` or `*_test.py`, async mode `auto`, strict markers, and coverage enforcement around the `app` package.

### Existing testing patterns relevant to this feature

- Node service and router tests already cover agency bridge, artifact parsing/routing, library services, presentation services, and template/feature readiness checks.
- Python-side agency behavior is more service-oriented, with pytest suited for adapter, API, and persistence-path validation.
- The repo already uses targeted unit/service tests plus a smaller number of integration-style tests for transactional flows and readiness gates.

### Recommended test strategy for this feature

- Use Vitest for all Node-facing contract normalization, router, commit API, template seeding, presentation commit, and library-backed artifact behaviors.
- Use pytest for Python envelope parsing, persistence updates, and API response normalization on the agency backend.
- Prefer narrow service-level tests first, then add a few integration tests at the Node/Python boundary and deck-commit path where cross-service behavior matters.
