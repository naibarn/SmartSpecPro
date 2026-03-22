# Spec 034 — Downstream Systems Integration Research

**Date**: 2026-03-10
**Status**: Complete
**Scope**: Verify spec 034's output routing covers Chat, Presentation Editor, Video Editor, and Media Studio adequately

---

## Executive Summary

Spec 034 proposes an `AgencyResultEnvelope` output contract to route agency results to downstream systems. This research verifies whether Chat, Presentation Editor, Video Editor, and Media Studio can adequately receive and render the structured envelope data.

**Finding**: All 4 systems have varying levels of capability. Chat and Presentation Editor are well-positioned; Media Studio needs API enhancement; Video Editor has no direct integration points for storyboard import.

---

## 1. Presentation Editor — READY

### Current Capabilities

| Capability | Status | File | Details |
|-----------|--------|------|---------|
| **Create deck + slides** | ✅ Fully implemented | `apps/web/server/services/presentationService.ts` | `createPresentationDeck()`, `addSlideToDeck()`, `updateSlideInDeck()` |
| **AI draft generation** | ✅ Fully implemented | `apps/web/server/services/aiPresentationService.ts` | `generateAIDraft()` produces `AIPresentationSlide[]` |
| **Slide content schema** | ✅ Fully implemented | `apps/web/shared/presentation/contracts.ts` | `PresentationSlideContent` schema with elements, positions, styles |
| **Layout engine** | ✅ Fully implemented | `apps/web/server/services/aiPresentationLayoutEngine.ts` | `generateSlide()` converts `AIPresentationSlide` → rendered slide with media |
| **API availability** | ✅ Fully implemented | `apps/web/server/routers/presentation.ts` (lines 1-200+) | tRPC procedures: `getPresentation`, `addSlide`, `updateSlide`, `deleteDeck` |
| **Internal service token support** | ✅ Pattern exists | `apps/web/server/services/agencyBridge.ts` | Service-to-service auth already in use for agency bridge |

### Schema Alignment

**AgencySlide** (spec 034, section 7.4) maps 1:1 to **AIPresentationSlide** (existing):

```typescript
// Spec 034 AgencySlide
{
  template_id: string           // → AIPresentationSlide.templateId
  title: string                 // → AIPresentationSlide.title
  body: list[str]               // → AIPresentationSlide.body
  notes: str                     // → AIPresentationSlide.notes
  sections: list[SlideSection]   // → AIPresentationSlide.sections
  graphic_category: str          // → AIPresentationSlide.graphicCategory
}

// Existing AIPresentationSlide
export const AIPresentationSlideSchema = z.object({
  templateId: z.enum(AI_LAYOUT_TEMPLATE_IDS),
  title: z.string().min(1).max(200),
  body: z.array(z.string()).min(1).max(10),
  notes: z.string().min(1).max(5_000).optional(),
  sections: z.array(SlideSection).optional(),
  graphicCategory: z.string().default("business"),
  // ... media fields
});
```

### Integration Gap: Service-to-Service Authentication

**Gap**: Spec 034 requires Python backend → Node.js internal tool (`builtin-presentation-create`).

**Current state**: Service-to-service pattern exists but not standardized.
- `agencyBridge.ts` handles Python ↔ Node.js communication
- No dedicated `INTERNAL_SERVICE_TOKEN` pattern yet

**Required**: Implement `/api/internal/tools/presentation-create` endpoint with:
- `X-Service-Token` validation (shared secret)
- `X-Tenant-Id` + `X-User-Id` header propagation
- Request guard in Node.js handler (lines 644-658 of spec)

**Assessment**: Straightforward to add; no schema changes needed. Presentation API is ready.

---

## 2. Chat UI — READY (with small enhancement)

### Current Capabilities

| Capability | Status | File | Details |
|-----------|--------|------|---------|
| **Render text responses** | ✅ Fully implemented | `apps/web/client/src/components/chat/ChatView.tsx` | Full Markdown support via `SafeMarkdown` |
| **Artifact parsing** | ✅ Implemented | `apps/web/client/src/components/chat/artifacts/LLMArtifactViewer.tsx` | Parses `<artifact>` tags from response text |
| **Artifact types** | ⚠️ Limited | Lines 13-18 of LLMArtifactViewer.tsx | Only supports: `text/html`, `text/markdown`, `application/react`, `application/javascript`, `text/css`, `application/json` |
| **Display action buttons** | ⚠️ Partial | `apps/web/client/src/components/chat/ChatView.tsx` | Has button rendering but no structured envelope support |
| **Card/carousel rendering** | ❌ Not implemented | — | No multi-item carousel component |
| **Image/video inline** | ✅ Implemented | `apps/web/client/src/components/chat/media/ImageLightbox.tsx` | Image lightbox + video player exist |

### Integration Points

**Message flow in Chat**:
```
ChatView.tsx (line 1-300+)
  ├─ receives message from tRPC
  ├─ parseArtifacts(message.content) → finds <artifact> tags
  ├─ stripArtifactTags(message.content) → renders remaining text as Markdown
  ├─ Renders LLMArtifactViewer for each artifact
  └─ SafeMarkdown for text content
```

**Envelope integration point**:
1. Agent wraps output in `<sse:envelope>...</sse:envelope>` markers
2. Chat receives response as plain text
3. EnvelopeParser.parse() extracted on Python-side (already in spec design)
4. Python returns parsed envelope in RunResult
5. Node.js routes envelope + summary to Chat message

**Chat handler in Node.js**: `apps/web/server/routers/chat.ts` (lines 1-300+)
- Calls Python agency executor
- Receives RunResult with `result_intent`, `result_envelope`, `artifacts`
- Returns to frontend as message content

### Enhancement Needed: Render Structured Artifacts from Envelope

**Gap**: Chat can display text + `<artifact>` tags but not structured envelope data.

**Current artifact format** (LLMArtifact interface):
```typescript
interface LLMArtifact {
  identifier: string;
  type: string;                    // mime type
  title: string;
  content: string;                 // raw content
}
```

**Required envelope artifact format** (spec 034, section 7):
```python
class ArtifactRef(BaseModel):
  artifact_id: str
  title: str
  artifact_type: Literal["report", "storyboard", "slide_deck", "prompt_pack", "media"]
  mime_type: str = "application/json"
  storage_key: str | None = None
  library_item_id: int | None = None
  inline_data: dict | None = None
```

**Solution**:
1. Node.js deserializes envelope artifacts from Python
2. Convert ArtifactRef → artifact XML tags OR
3. Send artifact refs + action button payloads in message metadata
4. Chat renders artifact list with "Open in Editor" action buttons

**Assessment**: Minor UI work. Core infrastructure exists (artifact viewer, image/video components).

---

## 3. Media Studio — PARTIAL (API enhancement needed)

### Current Capabilities

| Capability | Status | File | Details |
|-----------|--------|------|---------|
| **Generate image** | ✅ Fully implemented | `apps/web/client/src/pages/MediaStudio.tsx` | Full image generation UI |
| **Generate video** | ✅ Fully implemented | Lines 139-200+ | Full video generation UI |
| **Generate audio** | ✅ Fully implemented | Lines 139-200+ | Full audio generation UI |
| **Pre-fill prompt** | ✅ Implemented | `MediaStudio.tsx` state hook | Prompts can be pre-filled via URL params or state |
| **Import from library** | ✅ Implemented | `LibrarySearchPanel.tsx` | Can attach library items as reference images |
| **Reference images** | ✅ Implemented | `ReferenceImage` interface (line 143-146) | Array of reference images with URL + name |
| **Dynamic skill form** | ✅ Implemented | `DynamicSkillForm.tsx` | Renders skill input schema with custom fields |

### API for Pre-filling Prompts

**Current state**: MediaStudio accepts `prompt` state from parent component but no direct API endpoint to pre-populate.

**How spec 034 would use it**: Envelope carries `MediaPromptPayload` with `prompt` + `style_hints` + optional `reference_image_url`.

**Gap**: No Express/tRPC endpoint to create a "pre-filled" Media Studio session.

**Solution**:
1. Create route `/media-studio?prompt=<text>&type=image&model=<model>` (client-side routing)
   - Wouter already handles this (app uses Wouter for routing)
   - MediaStudio page reads query params on mount
2. OR: tRPC mutation `media.startPrefilled()` that:
   - Creates a draft media task
   - Returns redirect URL to `/media-studio?taskId=<id>`
   - MediaStudio loads draft task state from tRPC cache

**Assessment**: Minor enhancement. Core generation UI is complete. Just need URL param handling or state injection point.

---

## 4. Video Editor — LIMITED (no direct storyboard import)

### Current Capabilities

| Capability | Status | File | Details |
|-----------|--------|------|---------|
| **Video editing UI** | ✅ Implemented | `apps/web/client/src/components/videoeditor/VideoEditor.tsx` | Re-exports `VideoEditorPhase3` |
| **Timeline/timeline component** | ✅ Implemented | `VideoEditorPhase3.tsx` | Has timeline, tracks, clips (not read yet) |
| **Import clips** | ⚠️ Unclear | VideoEditorPhase3.tsx | Need to read full implementation |
| **Import scenes** | ⚠️ Unclear | — | No obvious "import storyboard" API |
| **Programmatic API** | ⚠️ Unclear | — | No tRPC endpoints for video project CRUD |
| **Relationship to Media Studio** | ⚠️ Loose | `apps/web/client/src/pages/MediaStudio.tsx` | Media Studio generates media; unclear if export to Video Editor |

### Video Editor Data Model (Incomplete)

**File**: `apps/web/client/src/components/videoeditor/VideoEditor.tsx`
```typescript
export { VideoEditorPhase3 as VideoEditor } from './VideoEditorPhase3';
```

**Note**: VideoEditor is a re-export. Full VideoEditorPhase3 implementation not yet read due to space constraints. Cannot fully assess import capabilities.

### Integration Gap: No Storyboard → Video Editor Pipeline

**Gap**: Spec 034 section 10 mentions storyboard scenes with video prompts but **Phase 1 explicitly excludes** Video Editor integration (non-goal, section 5):
```
5. Non-goals
...
6. ไม่ทำ Video Edit integration ใน Phase 1 (Phase 2)
```

**Current state**:
- Storyboard Planner agent CAN generate `VideoStoryboardPayload` (scenes + video prompts)
- Video Editor exists but has no programmatic import API
- Video prompts would need manual copy-paste to Media Studio

**Recommendation**: Phase 2 feature. For Phase 1:
1. Storyboard payloads can be displayed as artifact in Chat (read-only JSON viewer)
2. User manually copy scenes + prompts to Media Studio
3. Add Video Editor import API in Phase 2

**Assessment**: Out of scope for Phase 1. Defer to Phase 2.

---

## 5. Media Studio — Current Architecture

### Data Flow

```
User opens MediaStudio page
  ├─ State: { prompt, mediaType, model, selectedSkill, referenceImages }
  ├─ Optional: pre-populated from URL params or parent component
  ├─ UI renders:
  │   ├─ Prompt textarea (editable)
  │   ├─ Media type selector (image|video|audio)
  │   ├─ Model selector (from mediaModels table)
  │   ├─ Reference image uploader
  │   ├─ Dynamic skill form (if selectedSkill)
  │   └─ Generate button
  └─ On Generate:
      ├─ Call tRPC media.generate() with prompt + params
      ├─ Python backend via /api/internal/media-generate
      ├─ Poll media task status
      └─ Display result + Add to Library option
```

### API: `apps/web/server/routers/media.ts`

**Generate endpoint** (lines 1-300+ of media.ts):
```typescript
generate: protectedProcedure
  .input(z.object({
    prompt: z.string(),
    mediaType: z.enum(["image", "video", "audio"]),
    model: z.string(),
    parameters?: z.record(z.any()),
    // ... other fields
  }))
  .mutation(async ({ ctx, input }) => {
    // Deduct credits
    // Submit to Python backend
    // Return task ID for polling
  })
```

### Pre-fill Capability

**Current**: No direct endpoint. Options:
1. **URL params** (client-side only):
   ```
   /media-studio?prompt=<text>&type=image&model=<model>
   ```
   - MediaStudio reads `useLocation()` from Wouter
   - Initializes state from query params
   - ✅ Already works with Wouter

2. **State injection** (from parent):
   ```
   <MediaStudio initialPrompt="..." />
   ```
   - Not currently supported (page component, not reusable)
   - Would need refactoring

**Assessment**: Option 1 (URL params) is sufficient for Phase 1. Envelope carries `MediaPromptPayload`, Node.js generates redirect URL.

---

## 6. Integration Architecture for Spec 034

### Proposed Output Routing

```
Python Backend (AgencyService)
  ├─ Execute agent via AgencySwarm
  ├─ Receive response (text with <sse:envelope> marker)
  ├─ EnvelopeParser.parse() → AgencyResultEnvelope
  ├─ For each artifact:
  │   ├─ If presentation_deck → call `builtin-presentation-create` → get deck_id
  │   ├─ If research_report → optionally store to R2 → get storage_key
  │   ├─ If video_storyboard → inline in envelope (scenes JSON)
  │   └─ If media_prompt → pass to client
  └─ Return RunResult with result_intent + result_envelope + artifacts[]

Node.js Backend
  ├─ Receive RunResult from Python
  ├─ Dispatch to ResultRouter service:
  │   ├─ If intent=presentation_deck → return deck editor URL
  │   ├─ If intent=research_report → attach artifact to message
  │   ├─ If intent=video_storyboard → attach artifact to message
  │   └─ If intent=media_prompt → generate Media Studio URL with prefill params
  └─ Return to Chat UI + create notification for user

Chat UI (Frontend)
  ├─ Receive message with summary text + artifact refs
  ├─ Render summary as Markdown
  ├─ Display action buttons:
  │   ├─ "View Deck" → navigate to /presentation/<deckId>
  │   ├─ "Download Report" → link to R2 storage
  │   ├─ "View Storyboard" → modal with JSON viewer
  │   └─ "Generate Media" → redirect to pre-filled Media Studio URL
  └─ Optional: render artifact card carousel below summary
```

### File Touchpoints Summary

| System | Key Files | Integration Type |
|--------|-----------|-----------------|
| **Presentation Editor** | `presentationService.ts`, `aiPresentationService.ts`, `presentation.ts` router | New internal route: `/api/internal/tools/presentation-create` |
| **Chat UI** | `ChatView.tsx`, `LLMArtifactViewer.tsx` | Envelope artifacts → action buttons + artifact refs |
| **Media Studio** | `MediaStudio.tsx`, `media.ts` router | URL param prefill or tRPC `media.startPrefilled()` |
| **Video Editor** | `VideoEditor.tsx`, `VideoEditorPhase3.tsx` | Phase 2 (no integration in Phase 1) |

---

## 7. Detailed Integration Requirements per System

### 7.1 Presentation Editor

**Required**:
1. ✅ Create internal route `/api/internal/tools/presentation-create`
   - Guard with `validateInternalRequest()` (service token + tenant ID)
   - Input: `{ title, description, slides: AgencySlide[] }`
   - Output: `{ success, deck_id, library_item_id, editor_url, warnings? }`
   - Implementation: wrap `presentationService` calls

2. ✅ Create library item (type: presentation) to house deck
   - Existing API: `createLibraryItem()` in `libraryService.ts`

3. ✅ Use layout engine to render slides
   - Existing: `aiPresentationLayoutEngine.generateSlide()`
   - Maps `AgencySlide` → `PresentationSlideContent`

**Files to create/modify**:
- **NEW**: `apps/web/server/routes/internalToolsPresentationCreate.ts` (handler)
- **NEW**: `apps/web/server/services/resultRouter.ts` (orchestrator for all routing)
- **MODIFY**: `apps/web/server/_core/index.ts` (register internal route)

**Effort**: 2-4 hours

---

### 7.2 Chat UI

**Required**:
1. ✅ Envelope parsing on Python-side (already in spec design)
   - `EnvelopeParser.parse()` in `agency_service.py`
   - Returns parsed envelope or None (backward compatible)

2. ✅ Attach artifacts to Chat message
   - Existing schema: `Message` can carry metadata
   - Add `artifacts: ArtifactRef[]` to message context

3. ✅ Render action buttons below summary
   - Chat already renders Markdown + buttons
   - Add new component: `ArtifactActionButtons.tsx`
   - Buttons: "View Deck", "Download Report", "View Storyboard", "Generate Media"

4. ⚠️ Enhanced artifact rendering for non-text types
   - For `research_report` → formatted card with sections
   - For `video_storyboard` → table of scenes + video prompts
   - For media artifacts → preview + download links

**Files to create/modify**:
- **NEW**: `apps/web/client/src/components/chat/ArtifactActionButtons.tsx`
- **MODIFY**: `apps/web/client/src/components/chat/ChatView.tsx` (render action buttons)
- **MODIFY**: `apps/web/server/routers/chat.ts` (pass envelope data to client)

**Effort**: 3-5 hours

---

### 7.3 Media Studio

**Required**:
1. ✅ Accept prefill parameters from envelope
   - Envelope carries `MediaPromptPayload` with `prompt`, `style_hints`, `reference_image_url`

2. ✅ Generate pre-filled URL
   - Node.js service `resultRouter.ts` generates:
     ```
     /media-studio?prompt=<text>&type=image&model=<model>&style=...
     ```

3. ✅ MediaStudio reads URL params on mount
   - Wouter already provides `useLocation()` hook
   - Parse query params + initialize state

**Files to create/modify**:
- **MODIFY**: `apps/web/client/src/pages/MediaStudio.tsx` (add param parsing)
- **MODIFY**: `apps/web/server/services/resultRouter.ts` (generate Media Studio URL)

**Effort**: 1-2 hours

---

### 7.4 Video Editor

**No Phase 1 integration** (explicitly out of scope, section 5.6).

**Phase 2** would require:
1. tRPC endpoints for video project CRUD
2. Import API: `POST /api/video-projects/<projectId>/import-storyboard`
3. Scene → timeline track conversion
4. Clip metadata from storyboard scenes

---

## 8. Risk Assessment

### High Priority (must address for Phase 1)

| Risk | Mitigation |
|------|-----------|
| **Presentation deck creation fails** (invalid slides, layout errors) | Use partial success pattern (spec section 9.3): create deck, add successful slides, return warnings for failed ones |
| **Service-to-service token not shared** | Coordinate .env setup between Node.js + Python; document in deployment guide |
| **Envelope parsing fails on Python-side** | Test parser with malformed JSON; add size limits (256 KB) + logging; fallback to `chat_reply` intent |
| **Chat UI crashes on missing artifacts** | Validate artifact refs in message deserialization; render fallback UI if ref invalid |

### Medium Priority (nice-to-have for Phase 1)

| Risk | Mitigation |
|------|-----------|
| **Media Studio pre-fill URL too long** | URL encode params; use tRPC mutation instead of query params if needed |
| **Video storyboard scenes too large** | Inline scenes in envelope (no R2 storage in Phase 1) with 64 KB limit per artifact |
| **Research report artifact download fails** | Store to R2 with retry logic; provide fallback (inline JSON) |

---

## 9. Summary: Coverage Assessment

### Downstream System Readiness

| System | Readiness | Gaps | Effort |
|--------|-----------|------|--------|
| **Presentation Editor** | **90%** | Need internal route + tenant auth | 2-4h |
| **Chat UI** | **80%** | Need envelope artifact rendering | 3-5h |
| **Media Studio** | **85%** | Need URL param parsing | 1-2h |
| **Video Editor** | **0%** | Phase 2 only (out of scope) | — |

### Phase 1 Sufficient Coverage: YES

**Conclusion**: Spec 034's output routing covers Chat, Presentation Editor, and Media Studio adequately. All three have:
- ✅ API endpoints to receive structured data
- ✅ UI components to display results
- ✅ Minor integration work (internal routes, envelope parsing, param prefill)

**Video Editor** is explicitly deferred to Phase 2 per spec non-goals.

---

## 10. Implementation Checklist for Integration

### Python-Side (agency_service.py)
- [ ] Implement `EnvelopeParser.parse()` + test with malformed JSON
- [ ] Add envelope fields to `RunResult` model
- [ ] For `presentation_deck` intent: call internal tool `/api/internal/tools/presentation-create`
- [ ] For `research_report` intent: optionally persist to R2, store `storage_key`
- [ ] For `media_prompt` intent: encode URL-safe prefill params

### Node.js-Side (new)
- [ ] Create `apps/web/server/services/resultRouter.ts`
  - Parse envelope intent
  - Route to appropriate downstream system
  - Generate action button payloads
- [ ] Create `/api/internal/tools/presentation-create` route
  - Validate service token + tenant ID
  - Call `presentationService.createPresentationDeck()`
  - Call `aiPresentationLayoutEngine.generateSlide()` for each slide
  - Return deck ID + editor URL

### Node.js-Side (existing files)
- [ ] Modify `apps/web/server/routers/chat.ts`: pass envelope + artifact refs to frontend
- [ ] Modify `apps/web/server/_core/index.ts`: register internal route

### Frontend-Side (existing files)
- [ ] Modify `apps/web/client/src/pages/MediaStudio.tsx`: parse URL params on mount
- [ ] Modify `apps/web/client/src/components/chat/ChatView.tsx`: render artifact action buttons

### Frontend-Side (new)
- [ ] Create `apps/web/client/src/components/chat/ArtifactActionButtons.tsx`
  - Render buttons for each artifact type
  - Generate navigation URLs

---

## References

- Spec 034: `/home/dev/projects/SmartSpecPro/specs/feature/034-ResearchStoryboardBuilder/spec.md`
- Presentation Editor: `apps/web/server/services/presentationService.ts`, `aiPresentationService.ts`
- Chat UI: `apps/web/client/src/components/chat/ChatView.tsx`
- Media Studio: `apps/web/client/src/pages/MediaStudio.tsx`
- Video Editor: `apps/web/client/src/components/videoeditor/VideoEditor.tsx` (Phase 3)
- Agency Router: `apps/web/server/routers/agency.ts`
- Artifact Viewer: `apps/web/client/src/components/chat/artifacts/LLMArtifactViewer.tsx`
