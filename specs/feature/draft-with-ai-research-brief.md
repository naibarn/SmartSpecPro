# Research Brief: Draft with AI Functionality

**Date**: 2026-03-10
**Researcher**: SmartSpecPro Research Agent (CMD-1 support)
**Status**: COMPLETE — Ready for implementation discussions

---

## Findings

### What "Draft with AI" Is
"Draft with AI" is an end-to-end presentation generation pipeline that transforms a user's topic or article into a fully laid-out slide deck with media (images/video), optional narration, and styled content in 7 sequential phases. Users configure generation options in a modal dialog, then the system polls progress while generating slides asynchronously.

### Architecture Overview
- **Frontend**: React modal (`AIDraftModal.tsx`) collects user choices
- **tRPC API**: Validates input, acquires per-user lock, initiates async task
- **Node.js backend**: 7-phase orchestration (article generation → slide splitting → media generation → layout → deck insertion)
- **Python backend**: Media provider integrations (Celery tasks)
- **Database**: Drizzle ORM; slides stored in `presentationSlides` table

### Current Implementation Status
- ✅ Full pipeline operational (7 phases implemented)
- ✅ Dynamic skill input system integrated (skill parameters passed through)
- ✅ Multiple media types supported (image, video, audio)
- ✅ Style presets & layout templates available
- ✅ Watermark & header/footer customization
- ✅ Progress polling with 2-second refresh
- ⚠️ **No template selection UI**: First slide forced to hero_center; other templates chosen by LLM
- ⚠️ **No real-time slide preview**: User waits for completion to see results

---

## Current Architecture

### User Flow Diagram

```
User Opens Draft with AI Modal
         ↓
User Fills Form (13 choices):
  - Topic / Custom Article
  - Slide Count
  - Article Skill + Skill Parameters
  - Language
  - Image/Video Model + Media Skill
  - Audio Model (if audio enabled)
  - Canvas Size / Aspect Ratio
  - Style Preset (7 options)
  - Header/Footer Text
  - Watermark Image + Clarity
  - Reference Images (up to 5)
  - Advanced Model Parameters
         ↓
User Clicks "Generate" → tRPC Mutation
         ↓
Backend: Acquire Per-User Lock + Initialize Progress
         ↓
Async Pipeline Starts (Fire-and-Forget)
         ↓
Client: Poll getDraftProgress Query Every 2s
         ↓
Backend Executes 7 Phases (see below)
         ↓
Client Receives Completion + Article Preview + Warnings
         ↓
Slides Inserted into Deck; User Can Edit
```

### 7-Phase Backend Pipeline

```
Phase 1: Article Preparation
  ├─ Custom article: Use as-is
  ├─ Topic→Slides: Skip article, go to Phase 2
  └─ Article skill: LLM generates from topic + skill params
      Output: articleText (320-3600 words)

Phase 2: Slide Planning / Splitting
  ├─ Article path: LLM splits into slides + extracts bullets
  └─ Topic path: LLM plans slides directly from topic + skill params
      Output: Array of AIPresentationSlide (LLM-structured JSON)

Phase 3: Media Generation (Parallel Tracks)
  ├─ Track A: Image/Video
  │   ├─ Select/fallback model (flux-2.0 / veo-3-1)
  │   ├─ Optional: Media skill enhances image prompts
  │   ├─ Submit to provider (FAL, Kie, etc.) per slide
  │   └─ Poll for completion (90s-300s timeout per slide)
  ├─ Track B: SVG Graphics
  │   └─ Random pick from graphicCategory (Business, Tech, etc.)
  └─ Track C: Audio (if generateAudio=true)
      ├─ Extract speaker notes from each slide
      └─ TTS each slide (180s-600s timeout per slide)
      Output: Media URLs stored in slide elements

Phase 4: Layout Engine Application
  Per slide:
    ├─ Load style preset (colors, fonts, spacing)
    ├─ Apply layout template (hero_center, split_left, etc.)
    ├─ Fit text to content area (font scaling)
    ├─ Position image/video element
    ├─ Add SVG graphic + geometric accents
    ├─ Apply watermark overlay (if enabled)
    └─ Generate speaker notes
    Output: PresentationSlideContent (canvas elements)

Phase 5: Slide Addition to Deck
  ├─ Insert each slide into presentationSlides table
  ├─ Track order index
  ├─ Handle deferred media (if still pending, queue for later)
  └─ Update deck version counter
      Output: Slides in database

Phase 6: Background Audio (async)
  └─ TTS generation for any unfinished slides

Phase 7: Finalization
  ├─ Update deck metadata
  ├─ Release per-user lock
  ├─ Compile warnings + article preview
  └─ Mark progress as completed
      Output: taskId result with slidesAdded, warnings, etc.
```

### Key Data Structures

**Input Schema** (`GenerateAIDraftInputSchema`):
- `prompt` (3-1000 chars): topic or custom article identifier
- `numSlides` (1-30): target slide count
- `useCustomArticle` (bool): use pasted text instead of generating
- `customArticleText` (optional): user-pasted article (≤20K chars)
- `selectedArticleSkill` (required if not custom): which skill generates article
- `selectedImageSkill` (optional): explicit media skill
- `imageModel` (optional): image/video model ID
- `generateAudio` (bool): whether to generate TTS narration
- `audioModel` (optional): TTS model ID
- `language` ("auto" | "en" | "th"): content language
- `stylePresetId` (7 options): visual theme
- `draftSkillParams`, `articleSkillParams`, `mediaSkillParams`: dynamic form data
- `watermark`, `headerEnabled`, `footerEnabled`, `headerCustomText`, `footerCustomText`
- `canvasWidth`, `canvasHeight`: slide dimensions
- `imagePromptContext`: optional image generation guidance
- `referenceImageUrls`: up to 5 URLs for reference
- `mediaModelExtraParams`, `audioModelExtraParams`: advanced model settings

**LLM Output** (`AIPresentationSlide`):
```typescript
{
  title: string;
  content: string | null;           // markdown bullets
  imagePromptKeywords: string;      // for image generation
  templateId: LayoutTemplateId;     // hero_center, split_left_image, etc.
  graphicCategory: GraphicCategoryId; // Business, Tech, Nature, etc.
  sections?: Array<{                // optional structured sections
    heading: string;
    details: string[];              // 1-4 detail lines per section
  }>;
}
```

**Final Slide** (`PresentationSlideContent`):
- `canvas`: { width, height, preset? }
- `elements`: Array of positioned slide objects (text, image, video, rect, line, ellipse)
- `notes`: Speaker notes (extracted from slide content)
- `audioTrack`: { sourceUrl?, startTimeMs?, duration? } (if audio generated)
- `background`: { type: "color" | "image", value } (optional, currently unused)

### Skills Integration Points

**Article Generation Skills**:
- User selects from `selectedArticleSkill` dropdown
- Skill's `input.schema.json` / `ui.schema.json` loaded dynamically
- User fills skill parameters via `DynamicSkillForm` component
- Parameters passed as `articleSkillParams` → `buildArticlePrompt()` → LLM system prompt context
- Skill's `systemPrompt` used as LLM instructions

**Media Skills** (Image/Video):
- Optional explicit selection via `selectedImageSkill`
- If skill attached: skill's LLM system prompt enhances image prompts
- Skill type determines video vs. image: `getDraftSkillMediaType(skill)`
- Media skill parameters passed as `mediaSkillParams` → merged into model extra params
- Can provide generation guidance, style preferences, etc.

### Layout Engine

**Location**: `aiPresentationLayoutEngine.ts`

**6 Layout Templates**:
1. `hero_center`: Title + image centered, text bottom (forced for slide 1)
2. `split_left_image`: Image left, text right
3. `split_right_image`: Image right, text left
4. `top_image_text_bottom`: Image top, text below
5. `bottom_image_text_top`: Text top, image below
6. `feature_boxes_right`: Feature cards right side

**7 Style Presets**:
- dark-professional, light-minimalist, corporate-blue, nature-green, warm-sunset, editorial-clean, midnight-luxe

**Processing per slide**:
- Apply preset colors, fonts, spacing
- Load layout template geometry
- Fit text to content area (auto-scale font)
- Position image/video element
- Add SVG graphic (if enabled)
- Apply watermark overlay (if enabled)
- Generate speaker notes
- Validate and return `PresentationSlideContent`

---

## Risks

### Technical Risks

1. **Media Provider Timeouts** (HIGH IMPACT)
   - Issue: Image/video generation may exceed timeout (90s-300s per slide)
   - Mitigation: Deferred media task queue; async polling; users see partial slides
   - Exposure: If provider is slow, user waits or gets incomplete deck

2. **LLM Prompt Injection via User Input** (MEDIUM IMPACT)
   - Issue: Topic/article text not sanitized before LLM system prompt
   - Current state: Some sanitization (`sanitizePromptContext()` line 4327)
   - Mitigation: Ensure all user input stripped of control chars; rate limiting in place
   - Exposure: Malicious topic could manipulate LLM behavior

3. **Deferred Media Not Resolved** (MEDIUM IMPACT)
   - Issue: If media task marked as deferred but never resolves
   - Current state: Background polling in `resolvePendingMediaForDeck()`
   - Mitigation: TTL on deferred tasks; manual retry button in editor
   - Exposure: Slides with placeholder images if background resolution fails

4. **Per-User Lock Stale** (LOW IMPACT)
   - Issue: Redis lock held if process crashes
   - Current state: TTL=300s; lock auto-releases
   - Mitigation: Heartbeat mechanism refreshes lock every 30s
   - Exposure: User must wait 5 min to retry if service crashes

5. **Credit Miscalculation** (MEDIUM IMPACT)
   - Issue: Estimated credit cost may not match actual deductions
   - Current state: Fast-fail if estimated insufficient; actual deductions in services
   - Mitigation: Pre-check + per-operation tracking; audit logs
   - Exposure: User charged more/less than expected

### Architectural Risks

6. **Skill Parameters Not Validated by Schema** (MEDIUM RISK)
   - Issue: Skill parameter form (`DynamicSkillForm`) may accept invalid data
   - Current state: Frontend validates against schema; backend does not re-validate
   - Mitigation: Add server-side schema validation in `buildArticlePrompt()`
   - Exposure: Invalid params passed to LLM; unpredictable output

7. **Watermark Clarity Not Previewed** (LOW RISK)
   - Issue: User sets clarity (5-100%) without seeing preview
   - Current state: No preview UI
   - Exposure: User may not like result; must re-run generation

8. **Template Not User-Selectable** (LOW RISK)
   - Issue: LLM chooses template per slide; user cannot override
   - Current state: First slide forced to `hero_center`; others chosen by LLM
   - Exposure: User may want different layout; no per-slide template picker

9. **No Real-Time Slide Preview** (UX RISK)
   - Issue: User sees only progress bar; no slide thumbnails during generation
   - Current state: `slidePreview` array tracks title + image status; not rendered
   - Exposure: User cannot see result until full completion

### Operational Risks

10. **Long Generation Times Timeout Client** (MEDIUM RISK)
    - Issue: Polling query may hit browser timeout or server circuit breaker
    - Current state: Configurable poll timeouts per media type (480s-3600s max)
    - Mitigation: Client keep-alive; server heartbeat; progress auto-cleanup
    - Exposure: User thinks generation failed when it's still running

11. **Skill Not Found at Generation Time** (LOW RISK)
    - Issue: Skill deleted from filesystem after user selected it
    - Current state: Skill loaded at Phase 1; error handled gracefully
    - Mitigation: Skill cache + fallback to default model
    - Exposure: User sees "Skill not found" error mid-generation

---

## Options

### Option A: Extend Current System (Recommended for Near-Term)
**Scope**: Add more automation + UX improvements without restructuring

**Changes**:
1. Add template picker UI (let user select per-slide layout)
2. Implement real-time slide thumbnail preview during generation
3. Auto-detect language from topic (improve "auto" mode)
4. Suggest style preset based on topic classification (LLM)
5. Recommend image model based on slide count + credits
6. Add watermark clarity preview
7. Validate skill parameters server-side against schema

**Benefits**: Quick wins; improves UX; no breaking changes
**Effort**: 40-60 hours (mostly frontend UI + preview rendering)
**Risk**: Low; incremental

---

### Option B: AgencySwarm/Automation Integration
**Scope**: Reduce manual selections via intelligent automation

**Changes**:
1. **Skill Recommender Agent**: Analyze topic → recommend top-3 article skills
2. **Slide Count Estimator**: Analyze topic length → suggest optimal slide count
3. **Style Matcher**: Classify topic → suggest best-matching style preset
4. **Model Cost Optimizer**: Calculate cost/time tradeoff → recommend model
5. **Header/Footer Generator**: Generate suggested header/footer text via LLM
6. **Reference Image Auto-Selector**: Search library → auto-select top-5 reference images based on topic

**Flow**:
```
User: "Generate presentation about sustainable fashion"
       ↓
AgencySwarm:
  - Classify topic: Fashion & Sustainability
  - Recommend skills: [fashion-advisor, eco-writer, trend-analyst]
  - Estimate slides: 8-10 (topic is medium-length)
  - Pick style: "nature-green" (matches eco-angle)
  - Select model: "flux-2.0" (fast, 40 credits/image, ~320 total credits)
  - Generate header: "Sustainable Fashion 2026"
  - Find refs: [eco-fabric.jpg, secondhand-market.jpg, certification-logo.png]
       ↓
User Reviews Auto-Suggested Config + Adjusts
       ↓
User Clicks Generate (all selections pre-filled)
```

**Benefits**:
- Reduced user decision paralysis
- Faster generation onset
- Consistent quality (learned from expert defaults)

**Effort**: 60-80 hours (design orchestration → implement recommenders → train/test)
**Risk**: Medium; requires careful prompt design for LLM classifiers

---

### Option C: Background Pre-Generation (Advanced)
**Scope**: Queue and pre-generate presentations asynchronously without blocking

**Changes**:
1. Queue system: User selects options, saves to queue (no generation yet)
2. Background worker: Dequeues tasks during low-traffic periods
3. Notification: Notify user when generation complete
4. Preview: Show completed slides before user opens editor

**Benefits**:
- Non-blocking user experience
- Batch generation optimization
- Cost prediction + approval workflow

**Effort**: 80-120 hours (queue DB schema, worker service, notification system)
**Risk**: High; complex state management; requires testing on multi-user scenarios

---

## Recommendation

**Implement Option A (Extend Current System) first**, then evaluate Option B (AgencySwarm) for next sprint.

### Rationale

1. **Option A is high-ROI**: Template picker + real-time preview address top UX friction points
2. **No architectural debt**: Incremental improvements don't break existing pipeline
3. **Skill parameter validation** is a must-have security fix
4. **Option B can wait**: Automation is a nice-to-have; current system works well with manual defaults
5. **Learn from Option A**: Real slide preview UI will inform Option B's design

### Phased Approach

**Phase 1 (Week 1-2)**: Security + Foundation
- [ ] Add server-side skill parameter schema validation
- [ ] Implement real-time slide preview rendering
- [ ] Add watermark clarity preview

**Phase 2 (Week 3-4)**: UX Improvements
- [ ] Template picker UI (per-slide layout selection)
- [ ] Language auto-detection improvement
- [ ] Recommended model/cost display

**Phase 3 (Future Sprint)**: AgencySwarm Integration
- [ ] Design recommendation architecture
- [ ] Implement skill recommender agent
- [ ] Implement style matcher agent

---

## Open Questions

1. **Template Override Scope**: Should users be able to override template per-slide, or only globally? (affects UX design)

2. **Deferred Media Resolution**: Currently deferred media has no guaranteed SLA. Should we add:
   - Manual retry button in editor?
   - Automatic re-queue after 5 minutes?
   - Notification when deferred media completes?

3. **Watermark Library**: Currently watermark must exist before generation. Should we allow:
   - Upload watermark during draft modal?
   - Generate watermark from topic/preset?

4. **Audio Voice Selection**: TTS model selected, but voice config not exposed in UI. Should we:
   - Add voice picker (Elevenlabs voices)?
   - Require audio model to have voice parameter in schema?

5. **Skill Parameter Persistence**: Currently skill parameters reset per generation. Should we:
   - Remember last-used parameters in localStorage?
   - Save as "draft templates"?

6. **Cost Estimation Accuracy**: Current estimate is ±20% due to media provider variance. Should we:
   - Show confidence range ("~300-400 credits, may vary")?
   - Implement credit insurance (refund overage)?

7. **Media Skill Chaining**: Can media skills build on article skill output (e.g., article skill suggests image topics, media skill enhances them)? Currently explicit, could be implicit.

8. **Presentation Template Support**: Should Draft with AI support starting from a presentation template (not blank deck)? Currently starts blank.

---

## Summary

"Draft with AI" is a mature, functional end-to-end presentation generation system. The core pipeline (7 phases, skill integration, layout engine, media generation) is solid and operationally sound. The main opportunities are:

1. **UX improvements** (real-time preview, template picker, watermark preview)
2. **Security hardening** (skill parameter validation, input sanitization review)
3. **Intelligent automation** (AgencySwarm-powered skill/style/model recommendations)
4. **Media resolution guarantees** (deferred task SLA + user visibility)

The system is ready for:
- Expanded skill ecosystem (more article/media skills)
- Production media provider scaling
- Multi-language feature expansion
- Integration with Agency/Workflow automation tools

**Recommended next step**: Implement Option A + security hardening in next sprint.

---

**Research completed by**: SmartSpecPro Research Agent
**Artifact location**: `/home/dev/projects/SmartSpecPro/.claude/agent-memory/ssp-research/draft-with-ai-comprehensive-research.md`
**For implementation details**: Consult comprehensive research artifact (sections 1-12)
