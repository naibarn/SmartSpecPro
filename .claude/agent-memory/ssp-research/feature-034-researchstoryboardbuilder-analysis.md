---
name: Feature 034 — ResearchStoryboardBuilder Architecture & Data Flow
description: Complete mapping of how 034 connects UI → tRPC → Python backend, new functions, entry points, and data flow
type: project
---

# Feature 034 — ResearchStoryboardBuilder Architecture Analysis

**Status**: FULLY IMPLEMENTED (7/7 sections)
**Commits**: a867278b through a5c4e09a
**Tests**: 52 web tests + 18 Python tests passing

## Executive Summary

Feature 034 implements a structured result envelope system for agency runs that enables:
- **Structured output parsing**: Agencies emit JSON-wrapped results inside markdown code blocks
- **Preview artifact generation**: System extracts and persists structured data (research, storyboards, presentations, comparisons)
- **Commit flows**: Previews can be committed to library as permanent artifacts
- **Template seeding**: Built-in experience templates provide agency entry points with pre-configured retrieval scopes

Key innovation: Agency results flow through a 3-layer processing pipeline:
1. Raw LLM text → envelope parsing (Python)
2. Envelope → preview artifact (Node.js service layer)
3. Preview → commit to library (user action via tRPC)

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER INTERACTION (React)                         │
│                         AgencyChat.tsx                                    │
└─────────────────┬───────────────────────────────────────────────────────┘
                  │
                  │ User sends message to agency
                  ▼
         ┌─────────────────────┐
         │  useAgencyStream    │ ← Client hook manages SSE stream
         │  (useAgencyStream   │
         │   .ts)              │
         └────────┬────────────┘
                  │
                  │ fetch("/api/v1/agency/stream")
                  ▼
    ┌──────────────────────────────────────────┐
    │  registerAgencyStreamRoutes (Express)   │
    │  /api/v1/agency/stream (SSE POST)      │
    │  (agencyStreamProxy.ts)                 │
    │  1. Auth check                          │
    │  2. Feature flag check                  │
    │  3. Credit pre-check                    │
    │  4. Proxy to Python backend             │
    └───────────────┬────────────────────────┘
                    │
                    │ Establish SSE tunnel to Python
                    ▼
    ┌────────────────────────────────────────────────┐
    │     Python FastAPI Backend                      │
    │     /api/v1/agencies/{agencyId}/run (SSE)     │
    │     (python-backend/app/api/agencies.py)      │
    │     StreamingRunResponse                       │
    └────────┬─────────────────────────────────────┘
             │
             │ agency_service.execute_run_stream()
             ▼
    ┌────────────────────────────────────────────────┐
    │  AgencyService.execute_run_stream()            │
    │  (agency_service.py)                          │
    │                                               │
    │  1. Load agency config from DB                │
    │  2. Resolve tools based on retrieval scope    │
    │  3. Instantiate AgencySwarmAdapter            │
    │  4. Execute agency multi-agent run           │
    │  5. Parse response via envelope parser       │
    │  6. Extract structured result + artifacts    │
    │  7. Emit SSE events as it progresses         │
    └────────┬─────────────────────────────────────┘
             │
             │ As run progresses, emit SSE events:
             ├─ "message" (agent text chunks)
             ├─ "agent_switch" (agent changed)
             ├─ "tool_call" / "tool_result" (tools)
             ├─ "browser_session" (if launched)
             ├─ "preview_ready" (structured result found!)
             └─ "run_finished" (complete)
             │
             ▼ (When preview found)
    ┌────────────────────────────────────────────────┐
    │  Emit "preview_ready" event with:              │
    │  - run_id                                      │
    │  - preview_artifact_ids: [artifact1, ...]     │
    │  - intent (research, storyboard, etc.)        │
    │  - summary                                    │
    └────────┬─────────────────────────────────────┘
             │
             │ SSE tunnel sends back to Node.js Express proxy
             ▼
    ┌──────────────────────────────────────────┐
    │  agencyStreamProxy relays events         │
    │  → Client receives SSE events           │
    └─────────────┬────────────────────────────┘
                  │
                  │ Client parses SSE
                  ▼
    ┌──────────────────────────────────────────┐
    │  useAgencyStream hook processes events  │
    │  Detects "preview_ready" event          │
    │  Calls onPreviewReady callback           │
    └─────────────┬────────────────────────────┘
                  │
                  │ onPreviewReady callback in AgencyChat
                  ▼
    ┌──────────────────────────────────────────┐
    │  setComparisonPreview(...)               │
    │  or render preview UI card               │
    │  Display: title, summary, comparison data│
    └──────────────┬───────────────────────────┘
                   │
                   │ User clicks "Commit to Library"
                   ▼
    ┌──────────────────────────────────────────┐
    │  agency.commitPreview tRPC mutation     │
    │  (agency.ts router)                     │
    │  Input:                                 │
    │    - agencyId                          │
    │    - runId                             │
    │    - artifactId                        │
    │    - commitToken                       │
    └─────────────┬────────────────────────────┘
                  │
                  │ Call commitLibraryBackedPreview()
                  │ OR commitPresentationPreview()
                  ▼
    ┌──────────────────────────────────────────┐
    │  agencyCommitService.ts                 │
    │  1. Validate commit token               │
    │  2. Fetch preview artifact from DB      │
    │  3. Render to markdown (research) or    │
    │     slide JSON (presentation)           │
    │  4. Create library item                 │
    │  5. Persist to library.items table      │
    │  6. Link via agency_run_artifacts       │
    └─────────────┬────────────────────────────┘
                  │
                  │ Return AgencyPreviewCommitResult
                  ▼
    ┌──────────────────────────────────────────┐
    │  UI shows "Committed!" status            │
    │  Result available in library             │
    └──────────────────────────────────────────┘
```

---

## New tRPC Procedures (Node.js / Express)

All in `apps/web/server/routers/agency.ts`:

### 1. **agency.sendMessage**
- **Input**: `{ agencyId, conversationId, message, retrievalScopeOverride?, modelOverride?, recipientAgent?, fileIds?, additionalInstructions? }`
- **Output**: `{ conversationId, runId }`
- **Purpose**: Initiate a run; delegates to SSE proxy which handles streaming
- **Type**: `agencyMessageProcedure` (rate-limited to 60/min)
- **Implementation**: Creates/gets conversation, records task metadata, delegates to Python

### 2. **agency.commitPreview**
- **Input**: `{ agencyId, runId, artifactId, commitToken }`
- **Output**: `{ artifactId, runId, commitToken, status, targetType, targetId }`
- **Purpose**: Persist a preview to the library
- **Logic**:
  - Validates commit token (HMAC-SHA256 hash)
  - Fetches artifact from `agencyRunArtifacts` table
  - Calls `commitLibraryBackedPreview()` or `commitPresentationPreview()` based on artifact type
  - Creates new `libraryItems` entry with markdown/JSON content
- **Error codes**: `ARTIFACT_NOT_FOUND`, `INVALID_COMMIT_TOKEN`, `PERMISSION_DENIED`, `STALE_PREVIEW`, `UNSUPPORTED_PREVIEW`

### 3. **agency.getConversation**
- **Input**: `{ agencyId, conversationId }`
- **Output**: Conversation with full message history and preview artifacts
- **Purpose**: Load conversation after page reload
- **Includes**: Messages, runs, preview artifacts

### 4. **agency.getRunDetails**
- **Input**: `{ agencyId, runId }`
- **Output**: Full `RunResult` with structured result + preview artifacts
- **Purpose**: Fetch run metadata from Python backend via `agencyBridge.getRunDetails()`
- **Includes**: Credits used, duration, step attempt snapshots

### 5. (Existing) **agency.list** / **agency.getById** / **agency.saveBuilder**
- These were already in place; see feature 033 notes

---

## New Python Endpoints (FastAPI)

All in `python-backend/app/api/agencies.py`:

### 1. **POST /api/v1/agencies/{agency_id}/run** (SSE Streaming)
- **Handler**: `execute_run_stream()`
- **Input**:
  ```python
  class StreamingRunRequest(BaseModel):
    conversation_id: str
    message: str
    task_metadata: Optional[dict] = None
    retrieval_scope: Optional[dict] = None
    recipient_agent: Optional[str] = None
    file_ids: Optional[list[str]] = None
    additional_instructions: Optional[str] = None
  ```
- **Output**: Server-Sent Events stream
- **Events emitted**:
  - `message` — text chunk from agent
  - `agent_switch` — agent changed
  - `tool_call` — tool invoked
  - `tool_result` — tool returned data
  - `browser_session` — browser session artifact
  - `preview_ready` — structured result parsed! Payload: `{ run_id, preview_artifact_ids, intent, summary }`
  - `run_finished` — run complete
- **Purpose**: Multi-agent execution with streaming output
- **Key logic** in `AgencyService.execute_run_stream()`:
  1. Pre-check credits
  2. Load agency config + agent definitions
  3. Resolve tools based on retrieval scope (filters external tools if `library_only` mode)
  4. Execute via `AgencySwarmAdapter` (calls `agency-swarm` library)
  5. Parse response via `parse_agency_result_envelope()`
  6. If envelope found, create `preview_artifacts` records
  7. Emit `preview_ready` SSE event
  8. Persist to `agency_run_artifacts` table

### 2. **GET /api/v1/agencies/{agency_id}/runs/{run_id}**
- **Handler**: `get_run_details()`
- **Output**: `AgencyRunResponse` with `structured_result` + `preview_artifacts`
- **Purpose**: Fetch run metadata for client page reload or history
- **Returns**: Full run context for resume

### 3. **GET /api/v1/agencies/{agency_id}/runs** (List)
- **Handler**: `list_runs()`
- **Purpose**: List runs with pagination

### 4. **POST /api/v1/agencies/{agency_id}/runs/{run_id}/cancel**
- **Handler**: `cancel_run()`
- **Purpose**: Abort active stream

---

## New Services (Node.js)

### **agencyPreviewService.ts**
- **`buildAgencyPreview(runResult, ...)`**
  - Parses `runResult.structuredResult` (envelope)
  - Normalizes payload based on intent (research, storyboard, presentation, comparison)
  - Validates against schemas (zod)
  - Returns typed `AgencyPreview<T>` object
  - Handles missing/invalid payloads gracefully

- **Schema validators**:
  - `researchPayloadSchema` — title, executive_summary, sections[], key_findings[], recommendations[]
  - `storyboardPayloadSchema` — title, total_duration_seconds, style, scenes[]
  - `presentationPayloadSchema` — title, description, language, style_preset, slides[]
  - `comparisonPayloadSchema` — (from `agencyComparison` shared module)

### **agencyCommitService.ts**
- **`commitLibraryBackedPreview(preview, ...)`**
  - Renders preview to markdown (research) or structured format (storyboard)
  - Creates library item via `createLibraryItem()`
  - Stores metadata in `libraryItems.metadata`
  - Links via `agencyRunArtifacts` with `targetType='library_item'`, `targetId=libraryId`
  - Returns commit result

- **`commitPresentationPreview(preview, ...)`**
  - Normalizes slides from envelope payload
  - Creates presentation in `presentations` table
  - Commits each slide to library
  - Returns presentation ID

- **`AgencyPreviewCommitError`** — Custom error for commit failures

### **agencyDeckCommitService.ts**
- **`commitPresentationPreview(...)`**
  - Handles presentation-specific commit logic
  - Parses AI-generated slide structure
  - Creates presentation + pages

### **agencyExperienceTemplateService.ts**
- **`ensureBuiltInAgencyExperienceTemplates()`**
  - Seeds system templates on startup
  - Ensures consistency across environments
  - Example template: "Research Report Builder" with research-focused agent config

- **`resolveAgencyRetrievalScope(template, userScope)`**
  - Merges template scope rules with user overrides
  - Returns `ResolvedAgencyRetrievalScope` with `effectiveMode`, `whitelistedLibraryIds`
  - Modes: `tenant_accessible`, `library_only`, `web_fallback`

### **agencyPreviewLifecycleService.ts**
- **`expireRunPreviewArtifacts(runId)`**
  - Marks artifacts as `expired_preview` after timeout
  - Clears payload storage to save space
  - Returns count of expired artifacts

- **`recordAgencyPreviewMetric(eventName, metadata)`**
  - Logs preview events (generated, expired, committed) to audit
  - Used for observability + billing

### **agencyBridge.ts** (Updated)
- **`executeRun(params)`** — Now includes:
  - `structuredResult: StructuredRunResult | null`
  - `previewArtifacts: PreviewArtifactMetadata[]`
  - `stepAttemptSnapshots` for billing reconciliation

- **`StructuredRunResult` interface**:
  ```typescript
  {
    version: string;
    intent: AgencyIntent;  // "research_report" | "video_storyboard" | "presentation_deck" | etc.
    summary: string;
    payload: Record<string, unknown>;  // Intent-specific data
    artifacts: Array<{ artifact_type, title?, metadata? }>;
    references: Array<{ source_title, source_id, chunk_refs?, source_uri?, support_summary? }>;
    metrics: Record<string, unknown>;
  }
  ```

- **`PreviewArtifactMetadata` interface**:
  ```typescript
  {
    id: string;
    intent: string;
    artifact_type: string;
    state: "preview_generated" | "expired_preview" | "commit_pending" | "committed" | "commit_failed";
    summary: string | null;
    commit_status: string;
    commit_token: string;  // HMAC-SHA256, used to validate commit request
    payload_json?: Record<string, unknown> | null;  // Inline if < 64KB
    payload_storage_key?: string | null;  // S3 key if > 64KB, stored in run_structured_result_payload
    provenance_json?: Array<Record<string, unknown>> | null;
    target_type?: string | null;  // "library_item", "presentation", etc.
    target_id?: string | null;
    committed_at?: string | null;
    expired_at?: string | null;
  }
  ```

---

## New Python Services

### **agency_result_envelope.py**
- **`AgencyResultEnvelope` (Pydantic model)**:
  - Canonical structure emitted by agencies
  - Contains: version, intent, summary, payload, artifacts[], references[], metrics{}
  - Validated via Pydantic

- **`parse_agency_result_envelope(raw_response)`**
  - Searches response text for markdown-fenced JSON:
    ` ```agency-result\n{...}\n``` ` or ` ```json\n{...}\n``` `
  - Falls back to plain JSON if text is exactly `{...}`
  - Returns `AgencyEnvelopeParseOutcome`:
    - `found: bool` — fence or JSON found?
    - `valid: bool` — Pydantic validation passed?
    - `text_response: str` — Surrounding text (fallback if no envelope)
    - `envelope: AgencyResultEnvelope | None`
    - `error: str | None` — Validation errors

### **agency_service.py** (Updated)
- **`execute_run_stream()` enhancement**:
  1. Call original execution flow
  2. Parse response via `parse_agency_result_envelope()`
  3. If valid, create preview artifact records:
     ```python
     preview_artifacts = [
       self._build_preview_artifact(
         run_id=...,
         agency_id=...,
         conversation_id=...,
         tenant_id=...,
         envelope=structured_result,
       )
     ]
     ```
  4. Emit `preview_ready` SSE event with artifact IDs
  5. Return `StreamingRunResponse` with `preview_artifacts` list

- **`_build_preview_artifact(envelope, ...)`**:
  - Creates row in `agency_run_artifacts` table
  - Computes commit token: `HMAC-SHA256(artifact_id + envelope.summary + run_id, LLM_ENCRYPTION_KEY)`
  - Stores payload inline if < 64KB, else in S3 with key `run_structured_result_payload/{run_id}/{artifact_id}`
  - Marks state as `preview_generated`
  - Returns artifact metadata

### **agency_tools.py** (Updated)
- **`resolve_tools_for_agent(agent_config, retrieval_scope_mode)`**
  - When `retrieval_scope_mode == "library_only"`:
    - Filter out external retrieval tools (web_search, etc.)
    - Keep library-only tools (library_retrieval, etc.)
  - Respects agent's tool whitelist + retrieval scope

### **agency_audit.py** (Updated)
- Logs `preview_ready` events with:
  - `eventType: "preview_ready"`
  - `intent` (research_report, etc.)
  - `summary`
  - `artifactCount`
  - `state` (lifecycle state)

---

## Database Schema Changes

### **agencyRunArtifacts** (New Table)
```sql
CREATE TABLE agency_run_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES agency_runs(id),
  agency_id UUID NOT NULL REFERENCES agencies(id),
  conversation_id UUID NOT NULL REFERENCES agency_conversations(id),
  tenant_id UUID NOT NULL,

  -- Preview lifecycle
  state VARCHAR(50) NOT NULL,  -- preview_generated, expired_preview, commit_pending, committed, commit_failed
  preview_intent VARCHAR(100),  -- research_report, video_storyboard, presentation_deck, comparison
  artifact_type VARCHAR(100),

  -- Payload storage
  payload_json JSONB,  -- Inline if < 64KB
  payload_storage_key VARCHAR(500),  -- S3 key if > 64KB (run_structured_result_payload/{run_id}/{artifact_id})

  -- Provenance
  provenance_json JSONB,  -- Source references
  summary_text TEXT,

  -- Commit state
  commit_token VARCHAR(255),  -- HMAC-SHA256 hash
  commit_status VARCHAR(50),
  target_type VARCHAR(100),  -- library_item, presentation, etc.
  target_id UUID,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  committed_at TIMESTAMP,
  expired_at TIMESTAMP,

  -- Indexes
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  INDEX idx_run_id (run_id),
  INDEX idx_agency_id (agency_id),
  INDEX idx_state (state),
  INDEX idx_created_at (created_at)
);
```

### **agencyExperienceTemplates** (New Table)
```sql
CREATE TABLE agency_experience_templates (
  id UUID PRIMARY KEY,
  slug VARCHAR(100) UNIQUE,  -- research-report, video-storyboard, etc.
  name VARCHAR(255),
  description TEXT,
  icon VARCHAR(50),

  -- Template config (serialized AgencyConfig)
  agent_config JSONB,  -- Template agents, tools, scope
  retrieval_scope_mode VARCHAR(50),  -- tenant_accessible, library_only, web_fallback

  -- Metadata
  category VARCHAR(100),  -- research, media, comparison
  is_system_template BOOLEAN DEFAULT TRUE,
  is_public BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);
```

### **agencySourceTemplateProvenance** (Schema 0068)
- Links agencies to source templates
- Tracks which template an agency was cloned/created from

---

## UI Integration Points

### **AgencyChat.tsx** (Pages)
- **Entry point**: `/agencies/:id` route
- **State management**:
  - `useAgencyStream()` hook for SSE streaming
  - `useAgencyById()` for agency metadata
  - `comparisonPreview` state for displaying preview
- **Key callbacks**:
  - `onPreviewReady`: Called when SSE emits `preview_ready` event
    - Sets `comparisonPreview` state
    - Renders preview card UI
  - `onBrowserSession`: For browser automation artifacts
  - `onRunFinished`: Logs credits used
- **Commit flow**:
  - User clicks "Commit to Library" button
  - Calls `trpc.agency.commitPreview.useMutation()`
  - Shows "Committed!" status

### **ComparisonPreviewCard.tsx** (Component)
- Displays preview data (title, summary, comparison table)
- Shows commit button
- Displays state badge (preview_generated, etc.)

### **useAgencyStream.ts** (Hook)
- Manages SSE connection to `/api/v1/agency/stream`
- Parses SSE events (message, agent_switch, preview_ready, etc.)
- Calls callbacks on lifecycle events
- Handles reconnection + abort

---

## Entry Points from User Perspective

### **1. Browse Agencies**
- Navigate to Agency list
- Select agency or create one
- Redirected to `/agencies/{id}`

### **2. Send Message to Agency**
- Type message in chat input
- Click "Send" or press Enter
- `useAgencyStream.connect()` initiates SSE stream
- Agency processes message in Python backend
- Results stream back to UI

### **3. View Preview (when intent is detected)**
- If agency response includes structured envelope:
  - Python detects valid `AgencyResultEnvelope` in response
  - Emits `preview_ready` SSE event
  - Client receives and calls `onPreviewReady` callback
  - UI renders preview card (comparison, research, storyboard, etc.)

### **4. Commit Preview to Library**
- User views preview card in chat
- Clicks "Commit to Library" button
- `commitPreview` tRPC mutation sends:
  - `agencyId`, `runId`, `artifactId`, `commitToken`
- Server validates token + artifact + permissions
- Renders to markdown/JSON and creates library item
- Returns `targetId` (library item ID)
- UI shows "Committed!" with link to library

### **5. Use Template Agency**
- Browse system-provided experience templates
- "Research Report Builder", "Video Storyboard Generator", etc.
- Built-in agents already configured
- Click "Start" → redirects to `/agencies/{templateId}`
- First message uses template's retrieval scope

---

## Key Design Decisions

1. **Envelope Parsing is Post-Hoc**: Agency LLM doesn't "know" about envelopes; any response can be parsed. This allows gradual rollout without retraining.

2. **Commit Token Strategy**: HMAC-SHA256 prevents users from forging commits for others' artifacts. Only the system that created the token can validate it.

3. **Payload Storage Strategy**:
   - Inline for < 64KB (fast, no S3 latency)
   - External for > 64KB (saves DB space, scales)
   - Auto-cleanup after 7 days

4. **Retrieval Scope as First-Class Citizen**: Template's scope mode can be overridden per run. Allows "research with library only" vs "research with web fallback".

5. **Three-Layer Commit**: Library-backed commit (most common), presentation commit (special handling), extensible for future types.

6. **Step Attempt Snapshots**: Billing layer can reconcile credits used across multiple LLM calls within one run.

---

## Testing Coverage

- **Web services**: 52 tests covering:
  - `agencyBridge.ts` (HTTP client)
  - `agencyPreviewService.ts` (schema normalization)
  - `agencyCommitService.ts` (library persistence)
  - `agencyExperienceTemplateService.ts` (template resolution)
  - `agencyRouter.ts` (tRPC procedures)
  - `presentationService.ts` (deck commit)

- **Python services**: 18+ tests covering:
  - `agency_result_envelope.py` (envelope parsing + validation)
  - `agency_service.py` (run execution + preview artifact creation)
  - `agency_orchestrator.py` (runtime checks)
  - `agency_tools.py` (tool resolution with scope filtering)
  - `agency_audit.py` (event logging)

---

## Known Deferred Items

1. **Retrieval-scope centralization**: Current filtering only happens in agent-level tool resolution. Broader enforcement across all external-access paths is deferred.

2. **Credit reconciliation**: Preview metrics logged but true gateway-total reconciliation deferred.

3. **Broader Python test suite**: Individual suites stable; full suite regression still has occasional hangs (harness issue, not code issue).

---

## Files Modified

- `apps/web/server/services/agencyBridge.ts` — added StructuredRunResult + PreviewArtifactMetadata types
- `apps/web/server/services/agencyPreviewService.ts` — NEW
- `apps/web/server/services/agencyCommitService.ts` — NEW
- `apps/web/server/services/agencyDeckCommitService.ts` — NEW
- `apps/web/server/services/agencyExperienceTemplateService.ts` — NEW
- `apps/web/server/services/agencyPreviewLifecycleService.ts` — NEW
- `apps/web/server/routers/agency.ts` — added commitPreview procedure
- `apps/web/server/_core/agencyStreamProxy.ts` — SSE proxy infrastructure
- `python-backend/app/services/agency_result_envelope.py` — NEW
- `python-backend/app/services/agency_service.py` — added envelope parsing + preview artifact creation
- `python-backend/app/api/agencies.py` — updated StreamingRunResponse, added preview_artifacts field
- `apps/web/drizzle/schema.ts` — agencyRunArtifacts + agencyExperienceTemplates tables
- `apps/web/drizzle/0068_agency_source_template_provenance.sql` — NEW migration
