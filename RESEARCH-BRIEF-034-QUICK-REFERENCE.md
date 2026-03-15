# Feature 034 — Quick Reference Guide

## One-Page Data Flow

```
USER SENDS MESSAGE TO AGENCY
         ↓
useAgencyStream → /api/v1/agency/stream (POST)
         ↓
Express SSE Proxy (auth, feature flag, credit check)
         ↓
Python FastAPI: execute_run_stream()
  ├─ Load agency config
  ├─ Execute via AgencySwarmAdapter
  ├─ Parse response envelope
  └─ If valid: create preview_artifacts + emit "preview_ready"
         ↓
Client receives SSE events → onPreviewReady callback
         ↓
AgencyChat renders ComparisonPreviewCard
         ↓
USER CLICKS "COMMIT TO LIBRARY"
         ↓
agency.commitPreview tRPC mutation
  ├─ Validate HMAC-SHA256 token
  ├─ Fetch artifact from DB
  ├─ Render to markdown (research) or JSON (storyboard)
  ├─ Create library item
  └─ Link via agencyRunArtifacts (target_type, target_id)
         ↓
UI shows "Committed!" + library link
```

---

## API Endpoints & Procedures

### SSE Streaming (Express)
- **POST** `/api/v1/agency/stream`
- **Headers**: Content-Type: application/json, Cookie (session)
- **Body**: `{ agencyId, conversationId?, message, modelOverride?, recipientAgent?, fileIds?, additionalInstructions? }`
- **Events emitted**: message, agent_switch, tool_call, tool_result, browser_session, preview_ready, run_finished, error

### SSE Streaming (Python)
- **POST** `/api/v1/agencies/{agency_id}/run` (SSE)
- **Headers**: Authorization: Bearer {gateway_token}, X-User-Token, X-Tenant-Id, X-User-Id
- **Body**: `{ conversation_id, message, task_metadata?, retrieval_scope?, recipient_agent?, file_ids?, additional_instructions? }`
- **Returns**: StreamingRunResponse (AgencyRunResponse with structured_result + preview_artifacts)

### Run Details (Python)
- **GET** `/api/v1/agencies/{agency_id}/runs/{run_id}`
- **Returns**: Full RunResult with structured_result + previewArtifacts[]

### Cancel Run (Python)
- **POST** `/api/v1/agencies/{agency_id}/runs/{run_id}/cancel`

### tRPC: Send Message
- `agency.sendMessage({ agencyId, conversationId, message, ... })`
- **Returns**: `{ conversationId, runId }`

### tRPC: Get Run Details
- `agency.getRunDetails({ agencyId, runId })`
- **Returns**: Full RunResult with structured_result + previewArtifacts

### tRPC: Commit Preview
- `agency.commitPreview({ agencyId, runId, artifactId, commitToken })`
- **Returns**: `{ artifactId, runId, commitToken, status, targetType, targetId }`

---

## Structured Result Envelope

```json
{
  "version": "1.0",
  "intent": "research_report" | "video_storyboard" | "presentation_deck" | "hotel_comparison" | ...,
  "summary": "Brief description",
  "payload": {
    // Intent-specific data
    // research_report: { title, executive_summary, sections[], key_findings[], recommendations[] }
    // video_storyboard: { title, total_duration_seconds, style, scenes[] }
    // presentation_deck: { title, description, language, style_preset, slides[] }
  },
  "artifacts": [
    { "artifact_type": "...", "title": "...", "metadata": {...} }
  ],
  "references": [
    { "source_title": "...", "source_id": "...", "source_uri": "..." }
  ],
  "metrics": {
    "research_depth": "high",
    "sources_used": 12,
    ...
  }
}
```

**How to emit from agency**: Wrap in code fence:
```
```agency-result
{...envelope JSON...}
```
```

---

## Preview Artifact Lifecycle

```
preview_generated  → (user action) → commit_pending → committed
                  ↓ (7 days timeout)
              expired_preview
                  ↓ (cleanup)
              [deleted]
```

**States**:
- `preview_generated` — Envelope parsed, artifact created
- `commit_pending` — User initiated commit (transient)
- `committed` — Persisted to library (target_type + target_id set)
- `commit_failed` — Commit error
- `expired_preview` — 7-day TTL exceeded

**Payload Storage**:
- < 64KB: inline in `payload_json` (PostgreSQL)
- > 64KB: external in S3 with key `run_structured_result_payload/{run_id}/{artifact_id}` (payload_storage_key)

---

## Commit Token Security

**Generation** (Python backend):
```python
commit_token = HMAC-SHA256(artifact_id + envelope.summary + run_id, LLM_ENCRYPTION_KEY)
```

**Validation** (Node.js on commit):
```typescript
received_token === HMAC-SHA256(artifact_id + summary + run_id, LLM_ENCRYPTION_KEY)
```

**Risk**: Not time-bound. Solution: Consider adding expiration timestamp.

---

## Retrieval Scope Modes

| Mode | Description | Tools Allowed |
|------|-------------|---------------|
| `tenant_accessible` | Use library first, fallback to web | library_retrieval, web_search |
| `library_only` | Library sources only | library_retrieval (no web_search) |
| `web_fallback` | Web search if library insufficient | web_search, library_retrieval |

**Implementation**: Filtered in `agency_tools.py:resolve_tools_for_agent()` based on `retrieval_scope_mode`.

---

## Database Tables

### agencyRunArtifacts
- `id` (UUID) — Artifact ID
- `run_id` (UUID FK) — Associated run
- `state` (VARCHAR 50) — preview_generated | expired_preview | commit_pending | committed | commit_failed
- `preview_intent` (VARCHAR 100) — research_report | video_storyboard | presentation_deck | ...
- `payload_json` (JSONB) — Inline if < 64KB
- `payload_storage_key` (VARCHAR 500) — S3 key if > 64KB
- `commit_token` (VARCHAR 255) — HMAC-SHA256 hash
- `target_type` (VARCHAR 100) — library_item | presentation | future_type
- `target_id` (UUID) — Link to library_items or presentations

### agencyExperienceTemplates
- `id` (UUID)
- `slug` (VARCHAR 100) — research-report | video-storyboard | ...
- `name`, `description`, `icon`
- `agent_config` (JSONB) — Pre-configured agency setup
- `retrieval_scope_mode` (VARCHAR 50) — Default scope for this template

---

## Key Services & Functions

### Node.js
| Module | Function | Purpose |
|--------|----------|---------|
| agencyBridge.ts | `executeRun()` | HTTP client to Python, now returns structuredResult + previewArtifacts |
| agencyPreviewService.ts | `buildAgencyPreview()` | Parse envelope + normalize payload by intent |
| agencyCommitService.ts | `commitLibraryBackedPreview()` | Render preview to markdown, create library item |
| agencyCommitService.ts | `commitPresentationPreview()` | Create presentation with slides |
| agencyExperienceTemplateService.ts | `resolveAgencyRetrievalScope()` | Merge template scope with user overrides |
| agencyPreviewLifecycleService.ts | `expireRunPreviewArtifacts()` | Mark old artifacts as expired, clear payloads |

### Python
| Module | Function | Purpose |
|--------|----------|---------|
| agency_result_envelope.py | `parse_agency_result_envelope()` | Extract + validate JSON from markdown or plain text |
| agency_service.py | `execute_run_stream()` | Execute agency, parse envelope, emit preview_ready |
| agency_service.py | `_build_preview_artifact()` | Create artifact record, compute commit token |
| agency_tools.py | `resolve_tools_for_agent()` | Filter tools based on retrieval_scope_mode |

---

## SSE Event Types

| Event | Payload | Purpose |
|-------|---------|---------|
| `message` | `{ text, agentName?, isStreaming }` | Agent text chunk |
| `agent_switch` | `{ from, to }` | Agent changed |
| `tool_call` | `{ agentName, toolName, input }` | Tool invoked |
| `tool_result` | `{ agentName, toolName, result }` | Tool returned |
| `browser_session` | `{ sessionId, status, result }` | Browser automation artifact |
| `preview_ready` | `{ run_id, preview_artifact_ids[], intent, summary }` | **Structured result found!** |
| `run_finished` | `{ runId, status, creditsUsed, durationMs }` | Run complete |
| `error` | `{ code, message }` | Error occurred |

---

## Envelope Intent Types

| Intent | Payload Schema | Example |
|--------|---|---|
| `research_report` | title, executive_summary, sections[], key_findings[], recommendations[] | Academic research, market analysis |
| `video_storyboard` | title, total_duration_seconds, style, scenes[] | Video production planning |
| `presentation_deck` | title, description, language, style_preset, slides[] | Business presentations |
| `hotel_comparison` | hotels[], criteria, recommendation | Travel recommendations |
| `ticket_comparison` | tickets[], pros[], cons[] | Price comparison |
| `shortlist` | items[], criteria, summary | Curated shortlist |
| `media_prompt` | title, prompt, metadata | Image/video generation prompt |
| `chat_reply` | message | Fallback: plain text response |

---

## Testing Checklist

- [ ] Envelope parsing (valid, invalid, missing JSON, wrong structure)
- [ ] Preview artifact creation (inline vs S3 threshold at 64KB)
- [ ] Commit token validation (HMAC-SHA256 check)
- [ ] Retrieval scope filtering (library_only removes web_search)
- [ ] Preview lifecycle (generated → expired after 7 days)
- [ ] Library commit (artifact → libraryItems)
- [ ] Presentation commit (slides → presentationPages)
- [ ] Error handling (ARTIFACT_NOT_FOUND, STALE_PREVIEW, etc.)
- [ ] SSE stream events (all event types emit correctly)
- [ ] Permission checks (user can only commit own artifacts)

---

## Common Issues & Debugging

**Preview not showing**
- Check if envelope was parsed: `agency_run_artifacts.state` should be `preview_generated`
- Check payload: `payload_json` (inline) or `payload_storage_key` (S3)
- Verify intent matches one of the 8 types

**Commit fails with INVALID_COMMIT_TOKEN**
- Token should be HMAC-SHA256(artifact_id + summary + run_id, LLM_ENCRYPTION_KEY)
- Verify LLM_ENCRYPTION_KEY hasn't changed since artifact creation
- Check artifact not in commit_failed state (stale)

**Retrieval scope not working**
- Verify `retrieval_scope_mode` is set in template or run request
- Check `agency_tools.py:resolve_tools_for_agent()` is called
- Ensure tool resolution happens BEFORE agent execution

**Preview expires too quickly**
- Default TTL is 7 days
- Check `agencyPreviewLifecycleService.expireRunPreviewArtifacts()` scheduling
- Confirm SUMMARY_ONLY_PREVIEW_STORAGE_KEY is set if payload was large

---

## Deployment Checklist

- [ ] Run full test suite: `npm test` (web), `pytest` (python)
- [ ] Security audit: commit token, retrieval scope, permission checks
- [ ] Verify S3/R2 bucket configured for payload storage (if > 64KB)
- [ ] Confirm LLM_ENCRYPTION_KEY is set in all environments
- [ ] Test TTL cleanup job (7-day expiry)
- [ ] Verify feature flag AGENCY_SWARM_ENABLED for tenant
- [ ] Document envelope format for agency developers
- [ ] Add observability: metrics for envelope parsing success rate

