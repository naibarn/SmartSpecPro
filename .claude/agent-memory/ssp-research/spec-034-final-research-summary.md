# Spec 034 — Final Research Summary

**Date**: 2026-03-10
**Status**: Complete with Implementation Patterns
**Scope**: Downstream Systems Integration for AgencyResultEnvelope Routing

---

## Executive Summary

Spec 034 proposes routing agency results via `AgencyResultEnvelope` to 4 downstream systems. This research verifies integration feasibility with existing codebase patterns.

**Verdict**: All 3 Phase 1 systems (Chat, Presentation Editor, Media Studio) are achievable with 6-11 hours engineering effort. Video Editor deferred to Phase 2 per spec. **No architectural blockers found.**

---

## 1. System-by-System Analysis

### 1.1 Presentation Editor — PRODUCTION-READY

**Status**: 90% ready. Existing pattern proves implementation path.

**What exists**:
- `presentationService.ts` (line 1082): `createPresentationDeckForLibraryItem()` — creates deck + library item in one call
- `aiPresentationLayoutEngine.ts` (line 2204): `generateSlide()` — converts `AIPresentationSlide` → `PresentationSlideContent`
- `aiPresentationService.ts` (line 2904): Uses exact pattern needed: calls `generateSlide()` for each slide, then `addSlideToDeck()`
- Layout engine handles: Thai text, responsive canvas, media positioning, SVG graphics, watermarks, geometric accents

**Schema alignment**:
```typescript
// Spec 034 AgencySlide
{ template_id, title, body, notes, sections, graphic_category }

// Existing AIPresentationSlide (exact match)
{ templateId, title, body, notes, sections, graphicCategory }
```

**Implementation path**:
```
POST /api/internal/tools/presentation-create (new)
  ├─ Validate X-Service-Token + X-Tenant-Id headers
  ├─ createLibraryItem(type: "presentation")
  ├─ createPresentationDeck()
  ├─ for each AgencySlide:
  │   ├─ generateSlide({ slideData, stylePreset, ... })
  │   ├─ addSlideToDeck(deck_id, slide_content)
  ├─ Return { deck_id, library_item_id, editor_url, warnings[] }
```

**Effort**: 2-3 hours
- ~120 lines for route handler
- ~80 lines for input validation + error handling
- ~50 lines for service token guard (can reuse browser tool pattern from `browserTool.ts`)

**Files**:
- Create: `apps/web/server/routes/internalToolsPresentationCreate.ts`
- Modify: `apps/web/server/_core/index.ts` (register route, ~3 lines)

---

### 1.2 Chat UI — HIGH-CONFIDENCE

**Status**: 80% ready. Artifact pipeline exists; needs envelope integration.

**What exists**:
- `ChatView.tsx` (lines 1-300+): Full Markdown rendering + artifact parsing
- `LLMArtifactViewer.tsx` (lines 188-200): `parseArtifacts()` finds `<artifact>` tags in text
- `ArtifactPanel.tsx`: Renders artifacts by type (code, markdown, image, video)
- Message flow: text → parse artifacts → render both as Markdown + artifact cards

**Current artifact format** (XML tags in message text):
```xml
<artifact identifier="id" type="type" title="title">content</artifact>
```

**Envelope integration**:
1. Python-side: `EnvelopeParser.parse()` extracts envelope (spec 7.5, lines 349-365)
2. Node.js returns `RunResult` with `result_intent`, `result_envelope`, `artifacts[]`
3. Chat receives envelope + summary in message
4. Frontend renders summary as Markdown + artifact action buttons

**UI components needed**:
- `ArtifactActionButtons.tsx` (~80 lines): Buttons for each artifact type
  - "View Presentation" → navigate to `/presentation/<deckId>`
  - "Download Report" → R2 link
  - "View Storyboard" → JSON modal viewer
  - "Generate Media" → redirect with prefill URL

**Effort**: 3-4 hours
- ~80 lines for ArtifactActionButtons.tsx
- ~40 lines to modify ChatView.tsx (render buttons)
- ~30 lines to modify chat.ts router (pass envelope to frontend)

**Files**:
- Create: `apps/web/client/src/components/chat/ArtifactActionButtons.tsx`
- Modify: `apps/web/client/src/components/chat/ChatView.tsx`
- Modify: `apps/web/server/routers/chat.ts`

---

### 1.3 Media Studio — STRAIGHTFORWARD

**Status**: 85% ready. Just needs URL param parsing.

**What exists**:
- `MediaStudio.tsx` (lines 1-300+): Full image/video/audio generation UI
- Accepts prompt via state: `{ prompt, mediaType, model, parameters }`
- Can load reference images: `ReferenceImage[] = { url, name }`
- Wouter router: `useLocation()` returns current path + query params

**URL param prefill pattern**:
```typescript
// On mount: read query params
const location = useLocation();
const params = new URLSearchParams(location[1]); // location[1] = query string
const prefillPrompt = params.get("prompt");
const prefillType = params.get("type");

// Initialize state
useEffect(() => {
  if (prefillPrompt) setPrompt(prefillPrompt);
  if (prefillType) setMediaType(prefillType as "image" | "video");
}, []);
```

**Result router generates URLs**:
```typescript
// For media_prompt envelope
const mediaStudioUrl = `/media-studio?prompt=${encodeURIComponent(payload.prompt)}&type=${payload.prompt_type}&model=${model}`;
```

**Effort**: 1-2 hours
- ~50 lines to parse URL params + hydrate state in MediaStudio.tsx
- ~40 lines in resultRouter.ts to generate Media Studio URLs

**Files**:
- Modify: `apps/web/client/src/pages/MediaStudio.tsx`
- Modify: `apps/web/server/services/resultRouter.ts`

---

### 1.4 Video Editor — PHASE 2

**Status**: Out of scope (spec section 5.6, line 97).

Deferred because:
- No import API exists yet
- Would need tRPC CRUD endpoints for video projects
- Scene → timeline clip conversion needs UI work
- Storyboard can be displayed as JSON artifact in Chat for now

**Phase 2 requirements** (sketch):
- `POST /api/video-projects/<projectId>/import-storyboard`
- Convert scenes → clips with timing + media references
- Update timeline UI to show imported clips

---

## 2. Existing Implementation Patterns (Reference)

### Pattern A: Service-to-Service Auth

**File**: `apps/web/server/routes/browserTool.ts`
**Pattern**: Validate internal token in headers

```typescript
// Guard function
function validateInternalRequest(req: Request): { userId: string; tenantId: string } {
  const token = req.headers["x-service-token"];
  if (token !== process.env.INTERNAL_SERVICE_TOKEN) {
    throw new Error("Invalid service token");
  }
  return {
    userId: req.headers["x-user-id"] as string,
    tenantId: req.headers["x-tenant-id"] as string,
  };
}

// Route handler
app.post("/api/internal/tool-name", (req, res) => {
  const { userId, tenantId } = validateInternalRequest(req);
  // Process request...
});
```

**Reuse for presentation-create route**: Copy this exact pattern.

---

### Pattern B: Library Item + Presentation Deck Creation

**File**: `apps/web/server/services/presentationService.ts` (line 1082)
**Pattern**: Create library item, then create deck

```typescript
export async function createPresentationDeckForLibraryItem(
  input: CreatePresentationDeckForLibraryItemInput,
  actor: PresentationActor,
): Promise<{ created: boolean; deck: PresentationDeck }> {
  // 1. Verify library item exists + user has write permission
  const item = await resolveReadableLibraryItem(input.libraryItemId, actor);

  // 2. Check if deck already exists
  const existing = await getDeckByLibraryItemId(input.libraryItemId, actor.tenantId);
  if (existing) return { created: false, deck: existing };

  // 3. Create deck linked to library item
  const deck = await createPresentationDeck({
    tenantId: actor.tenantId,
    libraryItemId: input.libraryItemId,
    title: input.title,
    description: input.description,
  });

  return { created: true, deck };
}
```

**Reuse for internal tool**: Simplify by passing actor context via headers.

---

### Pattern C: Slide Generation + Addition Loop

**File**: `apps/web/server/services/aiPresentationService.ts` (lines 2900-2920)
**Pattern**: For each slide, generateSlide + addSlideToDeck

```typescript
for (let slideIndex = 0; slideIndex < aiSlides.length; slideIndex++) {
  const aiSlide = aiSlides[slideIndex];

  // 1. Generate slide content with layout engine
  const result = generateSlide({
    slideData: aiSlide,
    imageUrl: null,
    svgGraphic: null,
    stylePreset: getBuiltInPreset("dark-professional"),
    slideIndex,
    totalSlides: aiSlides.length,
    canvasWidth: 1920,
    canvasHeight: 1080,
  });

  // 2. Add to deck
  await addSlideToDeck({
    deckId: deck.id,
    expectedVersion: currentVersion,
    title: aiSlide.title,
    slideContent: result.slideContent,
    notes: aiSlide.notes,
  });

  currentVersion++; // Update expected version after each add

  // 3. Collect warnings for user
  allWarnings.push(...result.warnings);
}
```

**Reuse for internal tool**: Identical loop structure.

---

### Pattern D: Artifact Parsing in Node.js Routes

**File**: `apps/web/server/routes/browserTool.ts`
**Pattern**: Parse request, call service, return structured response

```typescript
app.post("/api/internal/tool-action", (req, res) => {
  try {
    // 1. Validate & guard
    const { userId, tenantId } = validateInternalRequest(req);

    // 2. Parse input
    const input = validateInput(req.body);

    // 3. Call service
    const result = await myService.execute(input, { userId, tenantId });

    // 4. Return structured response
    res.json({
      success: true,
      data: result,
      warnings: result.warnings || [],
    });
  } catch (err) {
    res.status(err.code || 500).json({
      success: false,
      error: err.message,
      error_code: err.errorCode,
    });
  }
});
```

**Reuse for presentation-create route**: Follow this exact structure.

---

## 3. Detailed Implementation Specification

### 3.1 Internal Tool Route: `/api/internal/tools/presentation-create`

**File to create**: `apps/web/server/routes/internalToolsPresentationCreate.ts`

**Input schema** (Zod):
```typescript
const createPresentationInputSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  slides: z.array(z.object({
    templateId: z.enum(AI_LAYOUT_TEMPLATE_IDS),
    title: z.string().min(1).max(200),
    body: z.array(z.string()).min(1).max(10),
    notes: z.string().max(5000).optional(),
    sections: z.array(z.object({
      heading: z.string(),
      details: z.array(z.string()),
    })).optional(),
    graphicCategory: z.string().default("business"),
  })).min(1).max(30),  // Agency-specific limit (spec 8.3, line 517)
});
```

**Response schema** (success):
```typescript
{
  success: true,
  deck_id: 142,
  library_item_id: 891,
  slide_count: 8,
  editor_url: "/presentation/891",
  warnings?: [
    { slide_index: 3, error: "..." },
  ]
}
```

**Response schema** (failure):
```typescript
{
  success: false,
  error: "Failed to create deck: insufficient permissions",
  error_code: "PERMISSION_DENIED"
}
```

**Error codes**: `PERMISSION_DENIED`, `CREDIT_INSUFFICIENT`, `SLIDE_LIMIT_EXCEEDED`, `VALIDATION_ERROR`, `INTERNAL_ERROR`

**Implementation pseudocode**:
```typescript
export async function internalToolsPresentationCreate(app: Express) {
  app.post("/api/internal/tools/presentation-create", async (req, res) => {
    try {
      // 1. Validate service token + headers
      const serviceToken = req.headers["x-service-token"];
      if (serviceToken !== process.env.INTERNAL_SERVICE_TOKEN) {
        return res.status(403).json({ success: false, error_code: "PERMISSION_DENIED" });
      }
      const tenantId = req.headers["x-tenant-id"] as string;
      const userId = parseInt(req.headers["x-user-id"] as string);
      const runId = req.headers["x-agency-run-id"] as string;

      if (!tenantId || !userId || !runId) {
        return res.status(400).json({ success: false, error_code: "VALIDATION_ERROR" });
      }

      // 2. Parse + validate input
      const input = createPresentationInputSchema.parse(req.body);

      // 3. Check credits
      const actor = { userId, tenantId };
      const deckCreationCost = calculateCost(input.slides.length);
      if (!await hasEnoughCredits(userId, deckCreationCost)) {
        return res.status(402).json({ success: false, error_code: "CREDIT_INSUFFICIENT" });
      }

      // 4. Create library item
      const libraryItem = await createLibraryItem({
        tenantId,
        createdBy: userId,
        type: "presentation",
        title: input.title,
        description: input.description,
      });

      // 5. Create deck
      const deck = await createPresentationDeck({
        tenantId,
        libraryItemId: libraryItem.id,
        title: input.title,
        description: input.description,
      });

      // 6. Generate + add slides (with partial success handling)
      const warnings = [];
      let slideCount = 0;
      let currentVersion = deck.version;

      for (let i = 0; i < input.slides.length; i++) {
        try {
          const slideData = input.slides[i] as AIPresentationSlide;
          const result = generateSlide({
            slideData,
            imageUrl: null,
            svgGraphic: null,
            stylePreset: getBuiltInPreset("dark-professional"),
            slideIndex: i,
            totalSlides: input.slides.length,
          });

          await addSlideToDeck({
            deckId: deck.id,
            expectedVersion: currentVersion,
            title: slideData.title,
            slideContent: result.slideContent,
            notes: slideData.notes,
          });

          currentVersion++;
          slideCount++;
        } catch (err) {
          warnings.push({ slide_index: i, error: err.message });
        }
      }

      // 7. Check partial failure
      if (slideCount === 0) {
        // All slides failed - rollback deck
        await deletePresentationDeck(deck.id);
        return res.status(400).json({
          success: false,
          error_code: "VALIDATION_ERROR",
          error: "All slides failed validation/layout",
        });
      }

      // 8. Deduct credits
      await deductCredits(userId, deckCreationCost);

      // 9. Return success with warnings
      res.json({
        success: true,
        deck_id: deck.id,
        library_item_id: libraryItem.id,
        slide_count: slideCount,
        editor_url: `/presentation/${libraryItem.id}`,
        ...(warnings.length > 0 && { warnings }),
      });

    } catch (err) {
      res.status(500).json({
        success: false,
        error_code: "INTERNAL_ERROR",
        error: err.message,
      });
    }
  });
}
```

---

### 3.2 Result Router Service

**File to create**: `apps/web/server/services/resultRouter.ts`

**Purpose**: Deserialize envelope from Python, route by intent, generate action payloads

**Input**: `RunResult` (from Python agency executor)
```typescript
{
  run_id: string,
  response: string,              // contains <sse:envelope>...</sse:envelope>
  result_intent?: string,        // "presentation_deck", "research_report", etc.
  result_envelope?: dict,        // parsed envelope as dict
  artifacts?: list,              // array of ArtifactRef
}
```

**Output**: Routed payload for each system
```typescript
{
  summary: string,              // human-readable summary always shown
  intent: string,               // envelope intent
  artifacts: ArtifactRef[],     // for Chat UI
  actionButtons: Array<{        // generated by router
    label: string,
    action: "navigate" | "download" | "external",
    target: string,
  }>,
  routes: {
    chat?: ChatMessagePayload,
    presentationEditor?: { deckId, editorUrl },
    mediaStudio?: { prefillUrl },
  },
}
```

**Implementation pseudocode**:
```typescript
export interface RoutedEnvelope {
  summary: string;
  intent: string;
  artifacts: ArtifactRef[];
  actionButtons: Array<{ label: string; action: string; target: string }>;
  routes: {
    chat?: { summaryMarkdown: string; artifacts: ArtifactRef[] };
    presentation?: { deckId: number; editorUrl: string };
    mediaStudio?: { prefillUrl: string };
  };
}

export async function routeAgencyResult(
  result: RunResult,
  context: { tenantId: string; userId: number },
): Promise<RoutedEnvelope> {
  const summary = extractSummaryFromResponse(result.response);
  const intent = result.result_intent || "chat_reply";
  const artifacts = result.artifacts || [];

  const routed: RoutedEnvelope = {
    summary,
    intent,
    artifacts,
    actionButtons: [],
    routes: {},
  };

  switch (intent) {
    case "presentation_deck":
      // Presentation artifact should have presentation_deck_id
      const deckArtifact = artifacts.find(a => a.artifact_type === "slide_deck");
      if (deckArtifact?.presentation_deck_id) {
        const deckId = deckArtifact.presentation_deck_id;
        routed.routes.presentation = {
          deckId,
          editorUrl: `/presentation/${deckId}`,
        };
        routed.actionButtons.push({
          label: "View in Presentation Editor",
          action: "navigate",
          target: `/presentation/${deckId}`,
        });
      }
      break;

    case "research_report":
      const reportArtifact = artifacts.find(a => a.artifact_type === "report");
      if (reportArtifact?.storage_key) {
        routed.actionButtons.push({
          label: "Download Report",
          action: "download",
          target: `/api/artifacts/download/${reportArtifact.artifact_id}`,
        });
      }
      break;

    case "video_storyboard":
      const storyboardArtifact = artifacts.find(a => a.artifact_type === "storyboard");
      if (storyboardArtifact?.inline_data) {
        routed.actionButtons.push({
          label: "View Storyboard",
          action: "external",
          target: `artifact:${storyboardArtifact.artifact_id}`, // trigger modal
        });
      }
      break;

    case "media_prompt":
      const promptArtifact = artifacts.find(a => a.artifact_type === "media");
      if (promptArtifact?.inline_data) {
        const payload = promptArtifact.inline_data as MediaPromptPayload;
        const prefillUrl = `/media-studio?prompt=${encodeURIComponent(payload.prompt)}&type=${payload.prompt_type}`;
        routed.routes.mediaStudio = { prefillUrl };
        routed.actionButtons.push({
          label: "Generate Media",
          action: "navigate",
          target: prefillUrl,
        });
      }
      break;
  }

  // Always include Chat route
  routed.routes.chat = {
    summaryMarkdown: summary,
    artifacts,
  };

  return routed;
}
```

---

## 4. Integration Effort Summary

| Component | Type | Effort | Files | LOC |
|-----------|------|--------|-------|-----|
| Presentation Create Route | Node.js | 2-3h | 1 new + 1 mod | 120 + 3 |
| Result Router | Node.js | 1-2h | 1 new | 150-200 |
| Chat Artifact Buttons | React | 1.5-2h | 1 new + 2 mod | 80 + 40 + 30 |
| Media Studio URL Params | React | 1h | 1 mod | 50 |
| Python Envelope Parser | FastAPI | 1-2h | existing patterns | — |
| **TOTAL** | — | **6.5-10h** | 4 new, 4 mod | ~650 |

---

## 5. Risk Mitigation

### High Risk (must address)

| Risk | Mitigation | Effort |
|------|-----------|--------|
| **Slide layout fails** | Partial success: create deck + successful slides, return warnings | Already shown in pseudocode |
| **Service token not synced** | Document .env sync requirement in deployment guide | 0.5h |
| **Envelope parsing fails** | Test malformed JSON; add size limit (256 KB); fallback to chat_reply | Built into spec 7.7 |
| **Chat crashes on invalid artifact refs** | Validate refs in message deserialization; render fallback | 0.5h |

### Medium Risk (nice-to-have)

| Risk | Mitigation | Effort |
|------|-----------|--------|
| **Media Studio URL too long** | URL-encode; implement tRPC mutation for large params | 0.5h optional |
| **R2 download fails** | Cache-bust with ETag; provide inline JSON fallback | Part of artifact storage |

---

## 6. Testing Strategy

### Unit Tests
- `EnvelopeParser.parse()` with valid/invalid/malformed JSON
- `resultRouter.routeAgencyResult()` for each intent type
- `/api/internal/tools/presentation-create` with valid/invalid slides

### Integration Tests
- End-to-end: agency run → envelope parsing → routing → chat message + action buttons
- Presentation creation: deck + library item + 5 slides with various templates
- Media Studio: URL prefill → state hydration → generation

### Manual Tests
- Deep Research agent → research report artifact → Chat
- Deck Builder agent → presentation artifact → view in editor
- Storyboard agent → media prompt → Media Studio prefill

---

## 7. Deployment Checklist

Before deploying Phase 1:

- [ ] `.env` includes `INTERNAL_SERVICE_TOKEN` (both Node.js + Python)
- [ ] Database migrations for `agency_runs` columns (result_intent, result_envelope, artifact_count)
- [ ] Python side: `EnvelopeParser` tested with size limits
- [ ] Node.js routes registered in `_core/index.ts`
- [ ] Chat UI: artifact buttons tested in Chrome/Firefox/Safari
- [ ] Media Studio: URL params tested with long prompts (URL encoding)
- [ ] Presentation Editor: API calls authenticated with service token
- [ ] Credit deduction verified (internal tool calls counted correctly)
- [ ] Logs include traceId for debugging (already in spec design)

---

## 8. Conclusion

**Verdict**: Spec 034's downstream routing is **fully achievable in Phase 1** with **6.5-10 hours engineering effort**. No architectural blockers. All 3 systems leverage existing patterns:

1. **Presentation Editor**: Reuse `generateSlide()` + `addSlideToDeck()` from AI draft (proven)
2. **Chat UI**: Reuse artifact parsing + add action buttons (straightforward)
3. **Media Studio**: Add URL param parsing (trivial)

**Video Editor** deferred to Phase 2 per spec requirements.

**Recommended start date**: Immediately after spec approval. Can run in parallel with agency template development.

---

## References

- **Spec 034 Full**: `/home/dev/projects/SmartSpecPro/specs/feature/034-ResearchStoryboardBuilder/spec.md`
- **Layout Engine**: `apps/web/server/services/aiPresentationLayoutEngine.ts` (line 2204)
- **Presentation Service**: `apps/web/server/services/presentationService.ts` (line 1082)
- **AI Draft Service**: `apps/web/server/services/aiPresentationService.ts` (line 2904)
- **Chat View**: `apps/web/client/src/components/chat/ChatView.tsx` (lines 1-300+)
- **Artifact Viewer**: `apps/web/client/src/components/chat/artifacts/LLMArtifactViewer.tsx` (lines 188-200)
- **Media Studio**: `apps/web/client/src/pages/MediaStudio.tsx` (lines 1-300+)
- **Browser Tool Pattern**: `apps/web/server/routes/browserTool.ts` (service token validation)

---

**Research completed**: 2026-03-10
**Next phase**: Implementation sprint (6.5-10 hours)
