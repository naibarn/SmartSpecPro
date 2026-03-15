# Feature 034 — Entry Points from User Perspective

## User Journey Map

### Journey 1: Browse and Launch Agency

**Step 1: Navigate to Agency Dashboard**
- **URL**: `/agencies`
- **Component**: `apps/web/client/src/pages/AgencyPage.tsx` (or similar)
- **tRPC call**: `agency.list({ status: "published", limit: 50 })`
- **Server**: `apps/web/server/routers/agency.ts:list` (line ~112)

**Step 2: Click on Agency**
- **URL**: `/agencies/{agencyId}`
- **Component**: `AgencyChat.tsx` (line 94)
- **tRPC call**: `agency.getById(agencyId)`
- **Server**: `apps/web/server/routers/agency.ts:getById`

**Step 3: Agency Loads**
- **Feature flag check**: `AGENCY_SWARM_ENABLED` (enforced server-side)
- **Component state**: `agencyLoading`, `agency` object
- **Includes**: Agency name, agents, tools, version

---

### Journey 2: Send Message and Receive Streaming Response

**Step 1: Type Message in Chat Input**
- **Component**: `AgencyChat.tsx` line ~102-111 (input state)
- **Input field**: `<Textarea>` with user message

**Step 2: Click Send Button**
- **Handler**: `useAgencyStream.connect()`
- **File**: `apps/web/client/src/hooks/useAgencyStream.ts` line ~132-180
- **Parameters**:
  ```typescript
  {
    agencyId: "uuid",
    conversationId?: "uuid",
    message: "user message text",
    modelOverride?: "model-name",
    recipientAgent?: "agent-name",  // v1.8
    fileIds?: ["file-id"],          // v1.8
    additionalInstructions?: "extra prompt"  // v1.8
  }
  ```

**Step 3: Connect to SSE Stream**
- **HTTP**: `POST /api/v1/agency/stream`
- **Client code**: `useAgencyStream.ts` line 165-179
- **Body**:
  ```json
  {
    "agencyId": "...",
    "conversationId": "...",
    "message": "...",
    "modelOverride": "...",
    "recipientAgent": "...",
    "fileIds": [...],
    "additionalInstructions": "..."
  }
  ```

**Step 4: Express SSE Proxy**
- **Handler**: `apps/web/server/_core/agencyStreamProxy.ts:registerAgencyStreamRoutes`
- **Route**: `POST /api/v1/agency/stream`
- **Checks**:
  1. Auth via `authorizeRequest()` (JWT + session)
  2. Feature flag: `AGENCY_SWARM_ENABLED`
  3. Credit pre-check: `hasEnoughCredits()` (min 5.0 credits)
  4. AgencyID format validation: `AGENCY_ID_PATTERN.test()`
  5. Rate limiting: `MAX_STREAMS_PER_USER` (3 concurrent)
- **Action**: Forward to Python backend at `PY_BACKEND/api/v1/agencies/{agencyId}/run`

**Step 5: Python Backend Receives Request**
- **Endpoint**: `POST /api/v1/agencies/{agencyId}/run`
- **File**: `python-backend/app/api/agencies.py`
- **Handler**: `execute_run_stream()`
- **Input model**: `StreamingRunRequest` (line ~155)
- **Process**:
  1. Load agency config from DB
  2. Resolve tools based on `retrieval_scope`
  3. Instantiate `AgencySwarmAdapter()`
  4. Execute via `agency_service.execute_run_stream()`

**Step 6: Agency Executes (Python Service)**
- **File**: `python-backend/app/services/agency_service.py`
- **Method**: `execute_run_stream()` (line ~270+)
- **Flow**:
  1. Pre-check credits
  2. Load agency agents from DB
  3. Build agent configs
  4. Execute via `AgencySwarmAdapter.run()` (multi-agent orchestration)
  5. Emit SSE events as execution progresses
  6. **CRITICAL**: Parse response via `parse_agency_result_envelope(raw_response)`

**Step 7: Envelope Parsing (Python)**
- **File**: `python-backend/app/services/agency_result_envelope.py`
- **Function**: `parse_agency_result_envelope()` (line 88)
- **Logic**:
  1. Search for fenced JSON: ` ```agency-result\n{...}\n``` ` or ` ```json\n{...}\n``` `
  2. Fallback to plain JSON: `{...}` at start/end
  3. Parse JSON
  4. Validate against `AgencyResultEnvelope` Pydantic model
  5. Return `AgencyEnvelopeParseOutcome`

**Step 8: If Envelope Valid, Create Preview Artifact**
- **File**: `python-backend/app/services/agency_service.py`
- **Method**: `_build_preview_artifact()` (line 190)
- **Actions**:
  1. Create row in `agency_run_artifacts` table
  2. Compute commit token: `HMAC-SHA256(artifact_id + summary + run_id, key)`
  3. Store payload:
     - If < 64KB: inline in `payload_json` (JSONB)
     - If > 64KB: external in S3, key in `payload_storage_key`
  4. Set `state = "preview_generated"`
  5. Return artifact metadata

**Step 9: Emit Preview Ready Event**
- **SSE Event**: `preview_ready`
- **Data**:
  ```json
  {
    "event": "preview_ready",
    "data": {
      "run_id": "...",
      "preview_artifact_ids": ["artifact-1", "artifact-2"],
      "intent": "research_report",
      "summary": "Brief description"
    }
  }
  ```
- **Sent from**: Python backend through Express proxy to client

**Step 10: Client Processes Event**
- **File**: `apps/web/client/src/hooks/useAgencyStream.ts`
- **Handler**: `case "preview_ready":` (line 341)
- **Logic**:
  1. Parse SSE event
  2. Call `onPreviewReady?.({runId, previewArtifactIds, intent, summary})`
  3. This triggers callback in `AgencyChat.tsx`

**Step 11: Display Preview**
- **File**: `apps/web/client/src/pages/AgencyChat.tsx`
- **Handler**: `onPreviewReady` callback (line 147-150)
- **Actions**:
  1. Fetch full run details via `agency.getRunDetails(agencyId, runId)` tRPC
  2. Call `buildAgencyPreview()` to normalize payload
  3. Set `comparisonPreview` state
  4. Render `ComparisonPreviewCard` component

**Step 12: Fetch Full Preview Data**
- **tRPC**: `agency.getRunDetails`
- **File**: `apps/web/server/routers/agency.ts` (line ~1520)
- **Logic**:
  1. Validate artifact not expired (via `expireRunPreviewArtifacts()`)
  2. Call `agencyBridge.getRunDetails()` to fetch from Python
  3. Return full `RunResult` with `structuredResult` + `previewArtifacts`

**Step 13: Normalize and Display**
- **File**: `apps/web/server/services/agencyPreviewService.ts`
- **Function**: `buildAgencyPreview(runResult, intent, ...)`
- **Logic**:
  1. Extract payload from `runResult.structuredResult`
  2. Validate against schema based on intent:
     - `researchPayloadSchema` for research_report
     - `storyboardPayloadSchema` for video_storyboard
     - `presentationPayloadSchema` for presentation_deck
     - `comparisonPayloadSchema` for comparisons
  3. Normalize data structure (extract title, summary, data)
  4. Return typed `AgencyPreview<T>`

**Step 14: Render Preview Card**
- **Component**: `ComparisonPreviewCard.tsx` (or type-specific preview)
- **Props**: Preview object with title, summary, data, state
- **UI elements**:
  - Title header
  - Summary text
  - Data visualization (table for comparison, sections for research, scenes for storyboard)
  - "Commit to Library" button
  - State badge (preview_generated, commit_pending, committed)

---

### Journey 3: Commit Preview to Library

**Step 1: User Clicks "Commit to Library" Button**
- **Component**: `ComparisonPreviewCard.tsx`
- **Trigger**: onClick handler
- **Payload**: PreviewArtifact metadata (id, commitToken, runId, etc.)

**Step 2: Call tRPC Mutation**
- **tRPC**: `agency.commitPreview`
- **File**: `apps/web/client/src/pages/AgencyChat.tsx` or component
- **Client code**: `trpc.agency.commitPreview.useMutation()`
- **Input**:
  ```typescript
  {
    agencyId: "...",
    runId: "...",
    artifactId: "...",
    commitToken: "..."
  }
  ```

**Step 3: Server-Side Commit Handler**
- **File**: `apps/web/server/routers/agency.ts`
- **Procedure**: `commitPreview` (line 1589)
- **Validation**:
  1. Ensure user owns artifact (permission check)
  2. Fetch artifact from `agencyRunArtifacts` table
  3. Validate commit token matches

**Step 4: Commit Service Decision**
- **File**: `apps/web/server/services/agencyCommitService.ts`
- **Function**: `commitLibraryBackedPreview()` (or presentation version)
- **Checks artifact type**:
  - If `preview_intent = "research_report"` → library-backed commit
  - If `preview_intent = "presentation_deck"` → presentation commit
  - If `preview_intent = "video_storyboard"` → library-backed (rendered as markdown)

**Step 5: Render to Format**
- **For Research**: `renderResearchMarkdown()` (line 63)
  ```
  # {title}

  ## Executive Summary
  {executive_summary}

  ## Sections
  ### {heading}
  {content}
  ...
  ```
- **For Storyboard**: `renderStoryboardMarkdown()` (line 98)
- **For Presentation**: `commitPresentationPreview()` in `agencyDeckCommitService.ts`

**Step 6: Create Library Item**
- **File**: `apps/web/server/services/libraryService.ts`
- **Function**: `createLibraryItem()`
- **Input**:
  - `title` (from preview.data.title)
  - `content` (rendered markdown)
  - `metadata` (source_template, intent, references)
  - `tenantId`, `createdBy` (user ID)
- **Output**: `{ id: libraryItemId }`
- **Action**: Creates row in `library_items` table

**Step 7: Link Artifact to Library**
- **Update**: `agencyRunArtifacts` row
- **Fields**:
  - `state = "committed"`
  - `target_type = "library_item"`
  - `target_id = libraryItemId`
  - `committed_at = NOW()`

**Step 8: Return Commit Result**
- **Output**:
  ```typescript
  {
    artifactId: "...",
    runId: "...",
    commitToken: "...",
    status: "committed",
    targetType: "library_item",
    targetId: "library-item-uuid"
  }
  ```

**Step 9: UI Updates**
- **Component**: Shows "Committed!" badge
- **Link**: "View in Library" link with targetId
- **State update**: `comparisonPreview.lifecycleState = "committed"`

---

## Key Code Locations (Exact Line References)

| Action | File | Lines |
|--------|------|-------|
| SSE proxy registration | `_core/agencyStreamProxy.ts` | 55–200 |
| Agency stream tRPC | `routers/agency.ts` | 1393–1410 |
| Commit preview tRPC | `routers/agency.ts` | 1589–1650 |
| useAgencyStream hook | `hooks/useAgencyStream.ts` | 90–350 |
| Envelope parsing | `agency_result_envelope.py` | 88–130 |
| Python run stream | `agency_service.py` | 270–350 |
| Preview artifact creation | `agency_service.py` | 190–230 |
| AgencyChat page | `pages/AgencyChat.tsx` | 94–300 |
| Preview preview display | `pages/AgencyChat.tsx` | 147–160 |
| Library commit service | `agencyCommitService.ts` | 1–150 |
| Preview normalization | `agencyPreviewService.ts` | 1–100 |

---

## Data Flow Sequence Diagram

```
┌────────────────┐
│   User (UI)    │
└────────┬───────┘
         │ 1. Type message + click Send
         │
         ▼
┌────────────────────────────────────────┐
│    useAgencyStream.connect()          │
│    (useAgencyStream.ts)               │
└────────┬───────────────────────────────┘
         │ 2. POST /api/v1/agency/stream
         │
         ▼
┌────────────────────────────────────────┐
│  Express SSE Proxy                     │
│  (agencyStreamProxy.ts)                │
│  - Auth check                          │
│  - Feature flag                        │
│  - Credit pre-check                    │
│  - Forward to Python                   │
└────────┬───────────────────────────────┘
         │ 3. POST /api/v1/agencies/{agencyId}/run (SSE tunnel)
         │
         ▼
┌────────────────────────────────────────┐
│  Python FastAPI                        │
│  (agencies.py: execute_run_stream)     │
│  - Load config                         │
│  - Execute agency                      │
│  - Parse envelope                      │
│  - Create preview artifact             │
│  - Emit SSE events                     │
└────────┬───────────────────────────────┘
         │ 4. SSE: preview_ready event (with artifact IDs)
         │
         ▼
┌────────────────────────────────────────┐
│  useAgencyStream hook                  │
│  - Detect preview_ready                │
│  - Call onPreviewReady callback        │
└────────┬───────────────────────────────┘
         │ 5. Callback: setComparisonPreview()
         │
         ▼
┌────────────────────────────────────────┐
│  tRPC: agency.getRunDetails()          │
│  - Fetch full preview from DB          │
│  - Normalize payload                   │
└────────┬───────────────────────────────┘
         │ 6. Render ComparisonPreviewCard
         │
         ▼
┌────────────────────────────────────────┐
│  User views preview in UI              │
│  - Title, summary, data visible        │
│  - "Commit to Library" button ready    │
└────────┬───────────────────────────────┘
         │ 7. User clicks "Commit"
         │
         ▼
┌────────────────────────────────────────┐
│  tRPC: agency.commitPreview()          │
│  (routers/agency.ts)                   │
│  - Validate token                      │
│  - Fetch artifact                      │
│  - Render to markdown                  │
│  - Create library item                 │
│  - Update artifact state               │
└────────┬───────────────────────────────┘
         │ 8. Return commit result
         │
         ▼
┌────────────────────────────────────────┐
│  UI shows "Committed!" badge           │
│  - Link to library item available      │
└────────────────────────────────────────┘
```

---

## Error Scenarios

### Scenario 1: Envelope Not Found
- **What happens**: `parse_agency_result_envelope()` returns `found=false`
- **Preview**:  None displayed
- **Message**: Still shown as plain text
- **User experience**: Normal chat, no special preview

### Scenario 2: Envelope Invalid (Malformed JSON)
- **What happens**: JSON parsing fails
- **Response**: `AgencyEnvelopeParseOutcome { found=true, valid=false, error="invalid_json: ..." }`
- **Preview**: None displayed (fallback to text_response)
- **Audit**: Error logged to `apiAuditEvents`

### Scenario 3: Token Validation Fails on Commit
- **Error**: `INVALID_COMMIT_TOKEN`
- **Message**: "Invalid commit token. This preview may be stale."
- **UI**: Commit button disabled, error shown

### Scenario 4: Preview Expired (7 days old)
- **State**: Artifact marked `expired_preview`
- **Payload**: Cleared from DB (memory optimization)
- **UI**: "Preview expired, no longer available"
- **Action**: User must regenerate

### Scenario 5: Insufficient Credits
- **Error**: Pre-check fails at Express proxy
- **HTTP**: 402 Payment Required
- **UI**: "Insufficient credits" message
- **Action**: Redirect to credits page

---

## Testing Entry Points

### Manual Testing
1. Navigate to `/agencies/{agencyId}`
2. Type message in chat
3. Observe SSE events in browser DevTools (Network → EventStream)
4. When preview_ready fires, verify preview renders
5. Click "Commit to Library"
6. Navigate to library to verify item created

### Automated Testing
```bash
# Test tRPC procedures
npm --prefix apps/web test -- server/routers/__tests__/agency.test.ts

# Test Python envelope parsing
cd python-backend && pytest tests/unit/test_agency_result_envelope.py

# Test services
npm --prefix apps/web test -- \
  server/services/agencyPreviewService.test.ts \
  server/services/agencyCommitService.test.ts
```

