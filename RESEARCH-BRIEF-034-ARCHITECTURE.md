# Research Brief: Feature 034 — ResearchStoryboardBuilder Architecture & Data Flow

## Findings

Feature 034 implements a **structured result envelope system** that enables agencies to emit JSON-wrapped outputs inside markdown code blocks. The system provides three critical capabilities:

1. **Structured Output Parsing** — Agencies emit intent-aware results (research reports, storyboards, presentations, comparisons) inside code fences. The Python backend parses and validates these envelopes using Pydantic models.

2. **Preview Artifact Generation** — When an envelope is detected, the system immediately creates a `PreviewArtifact` record with lifecycle state, payload storage (inline or S3), and commit token. A `preview_ready` SSE event alerts the client.

3. **Commit Flows** — Users can commit previews to the library as permanent artifacts. Three commit types: library-backed (research/storyboard), presentation (slides), and future extensible types. Commits are validated via HMAC-SHA256 tokens.

**Key Innovation**: Results flow through a 3-layer pipeline — LLM text → envelope (Python) → preview artifact (Node.js) → library (user action). This enables incremental adoption without requiring LLM model retraining.

---

## Current Architecture

### Data Flow (Complete Chain)

```
USER MESSAGE (AgencyChat.tsx)
    ↓
useAgencyStream.connect() [fetch /api/v1/agency/stream]
    ↓
Express SSE proxy (agencyStreamProxy.ts)
    ├─ Auth check
    ├─ Feature flag check
    ├─ Credit pre-check
    └─ Forward to Python backend
    ↓
Python FastAPI (agencies.py: execute_run_stream)
    ├─ Load agency config + agents
    ├─ Resolve tools (respects retrieval_scope)
    ├─ Execute via AgencySwarmAdapter
    ├─ Emit SSE: message, agent_switch, tool_call, tool_result, browser_session
    └─ Parse response via parse_agency_result_envelope()
    ├─ If envelope FOUND + VALID:
    │   ├─ Extract StructuredRunResult
    │   ├─ Create PreviewArtifact records
    │   ├─ Persist to agencyRunArtifacts table
    │   └─ Emit SSE: preview_ready
    └─ Emit SSE: run_finished
    ↓
SSE tunnel back to client
    ↓
useAgencyStream hook processes events
    ├─ Detects "preview_ready" event
    └─ Calls onPreviewReady callback
    ↓
AgencyChat.tsx onPreviewReady handler
    ├─ Fetches full preview from DB (via getRunDetails tRPC)
    ├─ Normalizes payload via buildAgencyPreview()
    └─ Renders preview card (ComparisonPreviewCard, etc.)
    ↓
USER CLICKS "Commit to Library"
    ↓
agency.commitPreview tRPC mutation
    ├─ Validate commit token (HMAC-SHA256)
    ├─ Fetch artifact from agencyRunArtifacts
    ├─ Call commitLibraryBackedPreview() or commitPresentationPreview()
    ├─ Create libraryItems entry
    ├─ Link via agencyRunArtifacts (target_type=library_item, target_id=libraryId)
    └─ Return commit result
    ↓
UI shows "Committed!" badge + link to library
```

### New tRPC Procedures (Node.js)

| Procedure | Input | Output | Purpose |
|-----------|-------|--------|---------|
| `agency.sendMessage` | `{ agencyId, conversationId, message, retrievalScopeOverride?, modelOverride?, recipientAgent?, fileIds?, additionalInstructions? }` | `{ conversationId, runId }` | Initiate agency run; delegates to SSE proxy |
| `agency.commitPreview` | `{ agencyId, runId, artifactId, commitToken }` | `{ artifactId, runId, commitToken, status, targetType, targetId }` | Persist preview to library |
| `agency.getConversation` | `{ agencyId, conversationId }` | Conversation + message history + previews | Load conversation state |
| `agency.getRunDetails` | `{ agencyId, runId }` | `RunResult` with `structuredResult` + `previewArtifacts` | Fetch run metadata from Python |

### New Python Endpoints (FastAPI)

| Endpoint | Method | Purpose | Returns |
|----------|--------|---------|---------|
| `/api/v1/agencies/{agency_id}/run` | POST | Streaming run execution | SSE stream with events (message, preview_ready, run_finished, etc.) |
| `/api/v1/agencies/{agency_id}/runs/{run_id}` | GET | Fetch run details | `AgencyRunResponse` with `structured_result` + `preview_artifacts` |
| `/api/v1/agencies/{agency_id}/runs` | GET | List runs | Paginated run list |
| `/api/v1/agencies/{agency_id}/runs/{run_id}/cancel` | POST | Abort active run | Empty response |

### New Node.js Services

**agencyBridge.ts** (Updated)
- `executeRun()` now returns `StructuredRunResult` + `PreviewArtifactMetadata[]`
- `StructuredRunResult`: version, intent, summary, payload, artifacts[], references[], metrics{}
- `PreviewArtifactMetadata`: id, intent, artifact_type, state, commit_token, payload_json/storage_key, target_type, target_id

**agencyPreviewService.ts** (NEW)
- `buildAgencyPreview()` — Parses envelope + validates payload against intent-specific schemas
- Schema validators: `researchPayloadSchema`, `storyboardPayloadSchema`, `presentationPayloadSchema`, `comparisonPayloadSchema`
- Normalizes data structures for rendering

**agencyCommitService.ts** (NEW)
- `commitLibraryBackedPreview()` — Renders to markdown (research) or structured format (storyboard), creates library item
- `commitPresentationPreview()` — Handles slide-specific commit logic (via agencyDeckCommitService)
- Custom error: `AgencyPreviewCommitError` with codes (ARTIFACT_NOT_FOUND, INVALID_COMMIT_TOKEN, PERMISSION_DENIED, STALE_PREVIEW, UNSUPPORTED_PREVIEW)

**agencyExperienceTemplateService.ts** (NEW)
- `ensureBuiltInAgencyExperienceTemplates()` — Seeds system templates on startup
- `resolveAgencyRetrievalScope()` — Merges template scope rules with user overrides (tenant_accessible, library_only, web_fallback)

**agencyPreviewLifecycleService.ts** (NEW)
- `expireRunPreviewArtifacts()` — Marks artifacts as expired after timeout, clears payload to save space
- `recordAgencyPreviewMetric()` — Logs preview events (generated, expired, committed) for observability

### New Python Services

**agency_result_envelope.py** (NEW)
- `AgencyResultEnvelope` (Pydantic model) — Canonical structure with version, intent, summary, payload, artifacts[], references[], metrics
- `AgencyIntent` — Literal union: "chat_reply", "research_report", "ticket_comparison", "hotel_comparison", "shortlist", "video_storyboard", "presentation_deck", "media_prompt"
- `parse_agency_result_envelope()` — Searches response text for fenced JSON (```agency-result\n{...}\n```), validates, returns `AgencyEnvelopeParseOutcome`

**agency_service.py** (Updated)
- `execute_run_stream()` enhancement:
  1. Execute agency (existing logic)
  2. Parse response via `parse_agency_result_envelope()`
  3. If valid, call `_build_preview_artifact()` to create records
  4. Emit `preview_ready` SSE event
  5. Return `StreamingRunResponse` with `preview_artifacts`
- `_build_preview_artifact()` — Creates row in `agency_run_artifacts`, computes commit token (HMAC-SHA256), stores payload inline/S3, returns metadata

**agency_tools.py** (Updated)
- `resolve_tools_for_agent()` — When `retrieval_scope_mode == "library_only"`, filters out external tools (web_search), keeps library tools

**agency_audit.py** (Updated)
- Logs `preview_ready` events with intent, summary, artifact count, state

### Database Schema Changes

**agencyRunArtifacts** (NEW)
- id (UUID)
- run_id → agency_runs
- agency_id → agencies
- conversation_id → agency_conversations
- tenant_id → tenants
- state (VARCHAR 50) — preview_generated, expired_preview, commit_pending, committed, commit_failed
- preview_intent (VARCHAR 100) — research_report, video_storyboard, presentation_deck, comparison
- artifact_type (VARCHAR 100)
- payload_json (JSONB) — Inline if < 64KB
- payload_storage_key (VARCHAR 500) — S3 key if > 64KB (run_structured_result_payload/{run_id}/{artifact_id})
- provenance_json (JSONB) — Source references
- summary_text (TEXT)
- commit_token (VARCHAR 255) — HMAC-SHA256 hash
- commit_status, target_type, target_id
- created_at, committed_at, expired_at

**agencyExperienceTemplates** (NEW)
- id (UUID), slug (VARCHAR 100 UNIQUE)
- name, description, icon
- agent_config (JSONB) — Serialized AgencyConfig
- retrieval_scope_mode (VARCHAR 50) — tenant_accessible, library_only, web_fallback
- category, is_system_template, is_public
- created_at, updated_at

### UI Integration

**AgencyChat.tsx** (Entry point: `/agencies/:id`)
- `useAgencyStream()` hook manages SSE streaming
- `onPreviewReady` callback triggers when preview_ready event received
- Renders `ComparisonPreviewCard` to display preview
- `agency.commitPreview` mutation on "Commit to Library" button click

**useAgencyStream.ts** (Hook)
- Connects to `/api/v1/agency/stream` (Express SSE proxy)
- Parses SSE events (message, agent_switch, tool_call, tool_result, browser_session, preview_ready, run_finished)
- Calls callbacks on lifecycle events
- Manages abort/reconnect logic

**ComparisonPreviewCard.tsx** (Component)
- Displays preview data (title, summary, comparison table)
- Shows commit button + state badge
- Renders markdown for research, JSON for storyboards, slides for presentations

---

## Risks

1. **Envelope Parsing Brittleness** — If agency response format drifts (different fence markers, JSON outside code blocks), envelope won't be detected. Fallback to text response works but loses structure. Mitigation: Test envelope parsing in existing agency tests; add regression tests for format variations.

2. **Token Validation Gap** — Commit token is HMAC-SHA256 but not time-bound. A compromised token remains valid indefinitely. Mitigation: Consider adding exp timestamp to token; rotate keys on policy change.

3. **Payload Storage Strategy Complexity** — Inline/S3 decision at 64KB threshold. Edge cases near boundary could cause inconsistency. Mitigation: Choose threshold conservatively (64KB is safe for PostgreSQL); add observability for payload size distribution.

4. **Retrieval Scope Enforcement Incomplete** — Only filters tools at agent level. External calls (e.g., direct HTTP tool) could bypass scope. Mitigation: Add centralized backend policy for all external-access tools (deferred per implementation notes).

5. **Lifecycle State Consistency** — Artifacts can be committed while running (race condition between preview_generated → committed). Mitigation: Validate state transitions on commit; use advisory locks if needed.

6. **SSE Stream Abort Handling** — If client aborts stream mid-run, Python might continue execution. Mitigation: Implement graceful cancellation via `cancel_run` endpoint; check implementation in agency_service.

7. **Credit Pre-Check vs Actual Cost** — Pre-check estimates 5.0 credits but actual might be higher if run is multi-agent. Over-commitment risk. Mitigation: Record step attempt snapshots and reconcile post-run (already implemented).

---

## Options

### Option A: Current Architecture (CHOSEN)
- SSE streaming via Express proxy
- Envelope parsing post-hoc in Python
- 3-layer commit flow (library/presentation/future)
- Retrieval scope as first-class template config
- Inline/S3 payload storage with 64KB threshold

**Pros**: Incremental adoption, no LLM retraining, extensible intent types, fast for small payloads
**Cons**: Envelope parsing is post-hoc (not guaranteed), retrieval scope enforcement incomplete, token time-bound missing

### Option B: Request-Time Envelope Specification
- Require agency run request to specify expected intent (research_report, etc.)
- Python validates response matches intent
- Stricter, but loses flexibility

**Pros**: Stricter validation, earlier error detection
**Cons**: Requires UI changes, less flexible for ambiguous queries

### Option C: LLM-Native Envelope Support
- Retrain agency models to emit envelopes in system prompt
- Guarantee envelope in every response
- Add instruction to guardrail (if no envelope, generate one)

**Pros**: Guaranteed structure, no parsing fallback needed
**Cons**: Requires model retraining, higher latency (additional generation step)

**Recommendation**: Stick with Option A (implemented). It provides flexibility for gradual rollout. If envelope parsing becomes unreliable in practice, escalate to Option C.

---

## Recommendation

**The feature is production-ready with the following caveats:**

1. **Security audit REQUIRED** before general availability:
   - Review commit token generation (HMAC-SHA256 vs time-bound + rotation)
   - Audit retrieval scope enforcement across all tool types (not just agent-level)
   - Verify permission checks in library creation (AgencyPreviewCommitError codes)

2. **Observability improvements**:
   - Add metrics for envelope parsing success rate (found, valid, invalid)
   - Add metrics for payload storage (inline vs S3) distribution
   - Alert if preview expiry rate spikes (indicates configuration issue)

3. **Testing gaps**:
   - Add integration tests for retrieval scope filtering (library_only mode)
   - Add regression tests for envelope parsing (variations in format)
   - Add end-to-end test: send message → receive preview → commit → verify library item

4. **Operational readiness**:
   - Document the 64KB payload threshold for operators
   - Document envelope format spec for agency developers
   - Provide troubleshooting guide for preview_ready not firing (common support issue)

**Status**: Ship as-is for internal/beta users. General availability requires security audit + documentation.

---

## Open Questions

1. **Retrieval Scope Hardening** — Current implementation only filters tools in agent-level resolution. What happens if an agent uses a generic "web_request" tool? Should we centralize enforcement at the service layer?

2. **Envelope Format Versioning** — `AgencyResultEnvelope.version` is "1.0" but no versioning logic in parser. What's the upgrade path if we need to change envelope structure?

3. **Payload Storage Eviction** — Artifacts older than 7 days are auto-deleted. Is that policy configurable? Should committed artifacts have indefinite retention?

4. **Intent Type Extensibility** — Currently enum of 8 intents. How do we add new intents (e.g., "hotel_search") without DB migration?

5. **Preview Expiry Window** — When do previews expire? On first commit, after timeout, or never? Current code suggests time-based expiry but no TTL specified.

6. **Step Attempt Reconciliation** — `stepAttemptSnapshots` are logged but billing reconciliation is "deferred". What's the timeline for true credit reconciliation?

7. **Browser Session in Envelopes** — Can an agency emit both a browser session artifact AND an envelope? How are they prioritized?

---

## Key File Locations

| Artifact | Path |
|----------|------|
| **tRPC Router** | `apps/web/server/routers/agency.ts` (lines 1393–1650+) |
| **Preview Service** | `apps/web/server/services/agencyPreviewService.ts` |
| **Commit Service** | `apps/web/server/services/agencyCommitService.ts` |
| **Bridge (HTTP client)** | `apps/web/server/services/agencyBridge.ts` (lines 43–206) |
| **SSE Proxy** | `apps/web/server/_core/agencyStreamProxy.ts` |
| **Envelope Parser** | `python-backend/app/services/agency_result_envelope.py` |
| **Agency Service (Python)** | `python-backend/app/services/agency_service.py` (execute_run_stream, _build_preview_artifact) |
| **Agency API** | `python-backend/app/api/agencies.py` (execute_run_stream, StreamingRunResponse) |
| **Client Hook** | `apps/web/client/src/hooks/useAgencyStream.ts` |
| **Chat Page** | `apps/web/client/src/pages/AgencyChat.tsx` (lines 72–150+) |
| **Database Schema** | `apps/web/drizzle/schema.ts` (agencyRunArtifacts, agencyExperienceTemplates) |
| **Tests** | `apps/web/server/routers/__tests__/agency.test.ts` (52 tests), `python-backend/tests/unit/test_agency_service.py` (18+ tests) |

---

## Verification Commands

```bash
# Web feature suite
npm --prefix apps/web test -- \
  server/services/agencyBridge.test.ts \
  server/services/agencyPreviewService.test.ts \
  server/services/agencyCommitService.test.ts \
  server/services/agencyExperienceTemplateService.test.ts \
  server/routers/__tests__/agency.test.ts

# Python structured result suite
cd python-backend && \
DEBUG=false PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 UV_CACHE_DIR=/tmp/uv-cache \
uv run --project . pytest -p pytest_asyncio.plugin -p pytest_cov --noconftest \
  tests/unit/test_agency_service.py::TestAgencyServiceExecuteRun::test_execute_run_normalizes_structured_result_and_preview_artifact \
  tests/unit/test_agency_service.py::TestAgencyPreviewPersistencePolicy \
  tests/unit/migrations/test_agency_structured_results_migration.py

# Type check
cd apps/web && pnpm check
cd python-backend && mypy app/
```

---

## Summary

Feature 034 successfully implements a 3-layer structured result pipeline: LLM text → envelope (Python) → preview artifact (Node.js) → library commit (user). The architecture is extensible, enables incremental adoption, and requires no LLM retraining. Key remaining work: security audit (retrieval scope, token validation), observability (parsing success metrics), and operational documentation.
