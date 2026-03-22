# Draft with AI: Comprehensive Research

**Date**: 2026-03-10
**Status**: RESEARCH COMPLETE
**Artifacts**: This file serves as the master research output.

---

## Executive Summary

"Draft with AI" is a complete AI-driven presentation generation pipeline spanning React frontend → tRPC/Express backend → Node.js LLM services → Python backend for media generation. Users provide a topic, select skills, models, and style options, then the system generates a full slide deck with structured content, images/video, and optionally narration audio.

---

## 1. User Flow: Step-by-Step

### Entry Point
- **Trigger**: User clicks "Draft with AI" button in PresentationEditor.tsx (line 1595: `setIsAIDraftModalOpen(true)`)
- **Component**: `AIDraftModal.tsx` (modal dialog)

### Phase 1: User Configures Generation (Before Submit)

User fills out form with these mandatory/optional fields:

#### Core Content Options
1. **Topic** (mandatory, 3-1000 chars)
   - User input for presentation subject
   - Example: "How to start a sustainable fashion brand"
   - Stored in state: `topic` (line 348)

2. **Article Source** (mandatory choice):
   - **Option A**: "Use My Own Article" (toggle `useCustomArticle`)
     - Paste existing article text (textarea)
     - Max 20,000 chars
     - Stored in: `customArticleText` (line 350)
   - **Option B**: "Generate Article from Topic" (default)
     - Select article generation skill (`selectedArticleSkill`, line 358)
     - Fetch dynamic skill input schema (line 472-478)
     - Render skill parameters form (`DynamicSkillForm`, line 1024+)
     - Stored in: `articleSkillParams` (line 386)
     - Optional: "Article Generation Skill" (if `useCustomArticle` true, line 449-456)

3. **Slide Count** (mandatory, 1-30)
   - Slider: `numSlides` (default 5, line 356)

4. **Language** (mandatory, default "auto")
   - Dropdown: "auto" | "en" | "th" (line 357)

#### Media Options

5. **Image/Video Generation** (optional)
   - Select media model (`imageModel`, line 360)
   - Optional: explicit media skill (`selectedImageSkill`, line 359)
   - Media skill input parameters (`mediaSkillParams`, line 387)
   - Reference images (up to 5 URLs, line 375)
   - Image prompt context (optional, line 374)

6. **Advanced Media Options** (collapsed, line 372)
   - Toggle `advancedMediaOptionsEnabled`
   - Model extra parameters (e.g., width, height, inference steps)
   - Canvas size: aspect ratio preset (line 364-371)

7. **Audio Generation** (optional)
   - Toggle `generateAudio` (line 361)
   - Select audio model (`audioModel`, line 362)
   - Audio model extra parameters (`audioModelExtraParams`, line 363)

#### Style & Presentation Options

8. **Style Preset** (dropdown, default "dark-professional")
   - IDs: hero_center, split_left_image, split_right_image, top_image_text_bottom, bottom_image_text_top, feature_boxes_right
   - Stored in: `selectedPresetId` (line 380)

9. **Header/Footer** (toggles, default off)
   - Header enabled + custom title text (lines 391-392, 381)
   - Footer enabled + custom text (lines 393-394, 382)
   - Show deck title / page numbers (lines 392, 394)

10. **Watermark** (optional)
    - Toggle `watermarkEnabled` (line 395)
    - Select watermark image from library
    - Clarity percent (5-100, default 20, line 397)

11. **Text Display** (toggle, default off)
    - `hideTextOnSlides`: Removes text from slide display (only notes visible)

### Phase 2: User Clicks "Generate" Button

Handler: `handleGenerate()` (line 1155)

**Validation steps**:
1. Check required model fields (if advanced media enabled)
2. Check required audio fields (if audio enabled)
3. Validate watermark selection (if enabled)

**Payload construction** (lines 1193-1250):
- All form state is serialized into `GenerateAIDraftInput`
- Skill parameters are passed for both article and media skills
- Style overrides, header/footer text, watermark details included

**Call**: `generateDraft.mutate({ ... })` (line 1193)
- tRPC mutation: `presentation.ai.generateDraft`

### Phase 3: Backend Receives Request

**Router**: `apps/web/server/routers/presentation.ts` (line 269-355)
- Procedure: `generateDraft`
- Input validation: `GenerateAIDraftInputSchema` (Zod)
- Rate limiting: 5 requests per minute per user

**Lock mechanism** (lines 284-300):
- Per-user Redis lock (300s TTL)
- Prevents simultaneous draft generation
- Returns existing taskId if already in progress

**Progress tracking** (lines 303-317):
- Redis key: `ai_draft_progress:${taskId}`
- Initial state: phase=0, slidesCompleted=0
- TTL: 300s (configurable via env)

**Fire-and-forget execution** (line 320):
- `generateAIDraft(input, actor, userToken, taskId).catch(...)`
- Async function starts in background
- Client polls for progress via `getDraftProgress` query

---

## 2. Backend Pipeline: 7 Phases

**Main function**: `generateAIDraft()` (line 4263 of aiPresentationService.ts)

### Phase 1: Draft Source Preparation (Article/Content)

**Inputs**:
- User topic or custom article text
- Article generation skill (if generating from topic)
- Skill parameters for article generation

**Three paths**:

1. **Custom Article Path** (if `useCustomArticle=true`)
   - Use user-provided text directly
   - No LLM call
   - Skip to Phase 2

2. **Prompt-to-Slides Path** (if draft skill is not article-capable)
   - Topic is treated as direct slide plan
   - Call LLM with `TOPIC_TO_SLIDES_SYSTEM_PROMPT`
   - Skip article generation
   - Jump to Phase 2: topic → slides directly

3. **Article Generation Path** (default)
   - Load selected skill's system prompt
   - Build article generation prompt via `buildArticlePrompt()` (line 4569)
   - Call LLM: `invokeSkillTextLLM()` (line 4577)
   - Result: full article text (320-3600 words)
   - Skill can specify preferred provider or strict pin

**LLM Call Details**:
- Model: skill's model or `DEFAULT_TEXT_MODEL` ("claude-sonnet-4-6")
- Billing context: credit deduction tracked
- Error handling: sanitize and return user-friendly error

**Output**: `articleText` (hundreds of words)

### Phase 2: Slide Planning / Splitting

**Input**: Article text (or topic for prompt-to-slides)

**Two paths**:

1. **Article Split Path**:
   - Call LLM with `SLIDE_SPLIT_SYSTEM_PROMPT`
   - Input: article excerpt (excerpt respects word count limits)
   - Prompt: `buildSlideSplitUserPrompt()`
   - LLM returns structured slides JSON (validated against `AIPresentationSchema`)
   - Result: array of `AIPresentationSlide` objects

2. **Topic-to-Slides Path**:
   - Call LLM with `TOPIC_TO_SLIDES_SYSTEM_PROMPT`
   - Input: topic + user's skill parameters
   - Prompt: `buildTopicToSlidesUserPrompt()`
   - LLM returns structured slides JSON
   - Result: array of `AIPresentationSlide` objects

**Slide normalization** (line 4672-4673):
- Normalize count to exact `numSlides` requested
- Normalize hierarchy (process slide structure)
- Force first slide to "hero_center" template

**Slide enhancement** (lines 4714-4722):
- Map article text to slides (coverage assessment)
- Or synchronize notes with visible content

**Output**: Array of `AIPresentationSlide` (up to 30 slides)

Each slide has:
```typescript
{
  title: string;
  content: string | null;  // bullet points
  imagePromptKeywords: string;
  templateId: "hero_center" | "split_left_image" | ...;
  graphicCategory: "Business" | "Technology" | ...;
  sections?: Array<{
    heading: string;
    details: string[];  // 1-4 bullet points per section
  }>;
}
```

### Phase 3: Media Generation (Images/Videos)

**Triggers if**:
- User selected image/video model, OR
- Media skill is attached, OR
- Default media generation enabled

**Three parallel tracks**:

#### Track A: Image/Video Generation
1. **Model selection**:
   - Use user-selected model or fallback
   - Determine if video or image based on skill/model
   - Select aspect ratio from canvas preset

2. **Prompt enhancement**:
   - If media skill attached: call skill LLM to enhance prompt
   - Result: refined `imagePromptKeywords` per slide
   - Skill can apply custom system prompt

3. **Media submission**:
   - For each slide: submit media task (image/video)
   - Models used: flux-2.0 (image), veo-3-1 (video) as fallbacks
   - Polling timeout: 90s-300s (configurable per media type)
   - Submitted to external providers via `mediaGenerationService`

4. **Polling & waiting**:
   - Poll media provider status every 2s
   - Track: pending, processing, complete, failed
   - Fallback: if media times out, queue deferred task for later fetch
   - Store media URLs in slide elements once ready

#### Track B: SVG Graphics Selection
- Pick random SVG from `graphicCategory` (from `svgGraphicsCatalog`)
- Add as accent shapes or geometric overlays
- Optional: enabled via `includeSvg`, `includeGeometricCrop`, `includeGeometricAccents`

#### Track C: Audio Generation (if enabled)
- For each slide: extract narration text from slide notes
- Call audio model (elevenlabs TTS as fallback)
- Store audio URL in slide element
- Polling timeout: 180s-600s
- Store in `slideContent.audioTrack` element

**Output**: Media URLs stored; slides ready for layout

### Phase 4: Layout Engine Application

**Function**: `generateSlide()` (imported from aiPresentationLayoutEngine.ts, line 49)

**Inputs per slide**:
- Slide data (title, content, image prompt)
- Image URL (or null if pending)
- SVG graphic selected
- Style preset (dark-professional, light-minimalist, etc.)
- Template ID (hero_center, split_left_image, etc.)
- Canvas dimensions

**Processing**:
1. Apply style preset (colors, fonts, spacing)
2. Apply layout template (position elements)
3. Fit text to available space
4. Position image / video element
5. Position SVG graphic accent
6. Apply watermark (if enabled)
7. Generate slide note (speaker notes)

**Output**: `PresentationSlideContent`
- Elements array: [text, image, rect shapes, video, etc.]
- Canvas: width, height, preset
- Metadata: notes, audio track reference

### Phase 5: Slide Addition to Deck

**Operation**:
- For each generated slide: `addSlideToDeck()` (line 38)
- Inserts into database: `presentationSlides` table
- Updates deck version counter
- Tracks: slide order, content, pending media

**Deferred media handling**:
- If media still pending: store `pendingMediaJob` reference
- Later poll via `resolvePendingMediaForDeck()` (line 71)
- Replace placeholder once media arrives

### Phase 6: Audio Generation (Background)

- If `generateAudio=true`: async TTS for each slide
- Uses selected audio model (or elevenlabs fallback)
- Stores in `audioTrack` element
- Updates slide if generation succeeds

### Phase 7: Finalization

**Operations**:
- Update deck metadata (version, updated_at)
- Clean up Redis progress key
- Release per-user lock
- Write warnings to result
- Return completion status

**Final output** (returned to frontend):
```typescript
{
  taskId: string;
  result: {
    slidesAdded: number;
    newDeckVersion: number;
    articlePreview: string;  // first 500 chars
    warnings: string[];      // model mismatches, timeouts, etc.
  };
}
```

---

## 3. Data Structures & Schemas

### GenerateAIDraftInputSchema
```typescript
{
  deckId: number;                              // presentation to add slides to
  expectedVersion: number;                     // optimistic concurrency control
  prompt: string (3-1000 chars);               // topic or custom article
  numSlides: number (1-30);                    // target slide count
  language: "auto" | "en" | "th";
  draftSkillId?: string;                       // article/prompt skill ID
  articleSkillId?: string;                     // article skill ID
  useCustomArticle: boolean;
  customArticleText?: string;                  // if useCustomArticle=true
  hideTextOnSlides: boolean;

  // Media options
  imageSkillId?: string;                       // explicit media skill
  imageModel?: string;                         // model ID
  generateAudio: boolean;
  audioModel?: string;                         // audio model ID
  canvasWidth?: number;
  canvasHeight?: number;
  imagePromptContext?: string;                 // extra context for image prompt
  referenceImageUrls?: string[];               // up to 5 reference images
  mediaModelExtraParams?: Record<string, any>; // user-set model parameters
  audioModelExtraParams?: Record<string, any>;

  // Style options
  stylePresetId: "dark-professional" | ...;
  headerEnabled?: boolean;
  headerCustomText?: string;
  footerEnabled?: boolean;
  footerCustomText?: string;
  watermark?: { sourceUrl, format, clarityPercent };

  // Skill parameters
  draftSkillParams?: Record<string, any>;      // from DynamicSkillForm
  articleSkillParams?: Record<string, any>;
  mediaSkillParams?: Record<string, any>;
}
```

### AIPresentationSlide (LLM output schema)
```typescript
{
  title: string;                    // slide title
  content: string | null;           // bullet points (markdown)
  imagePromptKeywords: string;      // image generation prompt
  templateId: LayoutTemplateId;     // layout choice
  graphicCategory: GraphicCategoryId; // SVG category
  sections?: Array<{                // optional structured content
    heading: string;
    details: string[];              // 1-4 bullets per section
  }>;
}
```

### PresentationSlideContent (final slide format)
```typescript
{
  canvas?: {
    width: number;
    height: number;
    preset?: "16:9" | "9:16" | "4:3" | ...;
  };
  elements: Array<{
    id: string;
    type: "text" | "image" | "video" | "rect" | "line" | "ellipse";
    x: number;
    y: number;
    width: number;
    height: number;
    // ... type-specific properties
  }>;
  notes?: string;                  // speaker notes
  audioTrack?: {
    sourceUrl: string;
    startTimeMs?: number;
    duration?: number;
  };
  background?: {
    type: "color" | "image";
    value: string;
  };
}
```

---

## 4. Current Manual Selection Points (User Choices)

### Mandatory Choices
1. **Topic or Article** - User types/pastes content
2. **Slide Count** - User selects 1-30 slides
3. **Article Skill** - User picks from available skills (if not using custom article)
4. **Language** - User picks "auto" | "en" | "th"

### Optional Choices
5. **Image/Video Model** - User selects from available models
6. **Media Skill** - User optionally picks explicit media skill
7. **Audio Model** - User selects if `generateAudio=true`
8. **Style Preset** - User picks visual theme (default: dark-professional)
9. **Canvas Size** - User picks aspect ratio preset or custom dimensions
10. **Image References** - User uploads/selects up to 5 reference images
11. **Watermark** - User optionally enables + selects watermark image
12. **Header/Footer** - User optionally enables + sets custom text
13. **Skill Parameters** - User fills dynamic form fields for selected skills

### Fully Automated (No User Choice)
- Slide splitting/planning (LLM decides)
- Image/video generation (API handles)
- Audio generation (TTS model handles)
- Layout application (engine auto-selects positions)
- SVG graphic selection (random from category)

---

## 5. Existing Skills Integration

### Skills System Overview
- Skills are YAML files in `apps/web/skills/{skill-name}/skill.md`
- Each skill has optional `schemas/input.schema.json` or `schemas/ui.schema.json`
- Skills are registered in database on startup by `skillRegistry.ts`

### Skill Types Used in Draft with AI

#### Article/Content Skills
- **Category**: "article_generation" or "prompt_enhancement"
- **Execution Mode**: "llm-only"
- **Role**: Generate article from topic
- **Example fields**: article length, tone, audience, style
- **Fetched via**: `selectedArticleSkill` (line 358)
- **Schema loaded**: line 472-478 (`getInputSchema` tRPC call)
- **Parameters form**: `DynamicSkillForm` (line 1024+)

#### Media Skills (Image/Video)
- **Category**: "image_generation" or "video_generation"
- **Execution Mode**: Can be auto-executable or llm-prompt-only
- **Role**: Generate or enhance image/video prompts
- **Example fields**: duration, resolution, aspect ratio, motion style
- **Fetched via**: `selectedImageSkill` (line 359)
- **Media type determination**: `getDraftSkillMediaType()` (line 44)
- **Capability classification**: `classifyDraftSkillCapability()` (line 42)

### Skill Parameter Passing
1. **Article skill params**: `articleSkillParams` → passed to `buildArticlePrompt()`
2. **Media skill params**: `mediaSkillParams` → merged into media extra params
3. **Both**: Stored in tRPC input, then passed to backend service

### Skill Execution Points
1. **Phase 1**: Article skill LLM call if generating article
2. **Phase 3**: Media skill LLM call if enhancing image prompts
3. **Phase 3**: Media skill may determine video vs. image output

---

## 6. Layout Engine Details

**Location**: `apps/web/server/services/aiPresentationLayoutEngine.ts`

**Main function**: `generateSlide(input: LayoutEngineInput): LayoutEngineOutput`

**Input**:
```typescript
{
  slideData: AIPresentationSlide;     // LLM output
  imageUrl: string | null;             // from media generation
  svgGraphic: SvgGraphic | null;       // from catalog
  stylePreset: SlideStylePreset;       // color scheme, fonts
  deckTitle?: string;                  // for header
  slideIndex: number;                  // 1-based
  totalSlides: number;
  canvasWidth: number;
  canvasHeight: number;
  visualOnly?: boolean;                // text rendering mode
}
```

**Output**:
```typescript
{
  slideContent: PresentationSlideContent;  // final slide
  warnings: string[];                       // layout warnings
}
```

**Templates** (line 11-14 of contracts.ts):
- `hero_center`: Title + image centered, text bottom
- `split_left_image`: Image left, text right
- `split_right_image`: Image right, text left
- `top_image_text_bottom`: Image top, text below
- `bottom_image_text_top`: Text top, image below
- `feature_boxes_right`: Feature cards right side

**Style Presets** (7 available):
- dark-professional, light-minimalist, corporate-blue, nature-green, warm-sunset, editorial-clean, midnight-luxe

**Processing steps**:
1. Load preset colors, fonts, spacing
2. Fit text to layout area (font scaling)
3. Position elements based on template
4. Apply geometric crops/accents
5. Add watermark overlay (if enabled)
6. Generate speaker notes from slide content

---

## 7. File Paths (Key Resources)

### Frontend
- **Modal component**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/presentation/AIDraftModal.tsx`
- **Editor page**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.tsx`
- **Style presets**: `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/aiStylePresets.ts`
- **SVG catalog**: `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/svgGraphicsCatalog.ts`

### Backend (Node.js)
- **Router**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/presentation.ts` (lines 269-355 for `generateDraft`)
- **AI Service**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationService.ts` (4263+ lines)
- **Layout Engine**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationLayoutEngine.ts`
- **Schema**: `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/aiTypes.ts`
- **Contracts**: `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/contracts.ts`
- **Skill Registry**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/skillRegistry.ts`

### Backend (Python)
- **Media tasks**: `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/media_tasks.py`

### Database Schema
- **Tables**: `presentationDecks`, `presentationSlides`, `skills`, `llmModels`, `mediaGenerations`
- **Schema file**: `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`

---

## 8. Integration Points for AgencySwarm/Automation

### Where Automation Could Reduce Manual Steps

1. **Skill Selection** (currently manual)
   - **Opportunity**: AI could recommend best skill based on topic
   - **Current**: User picks from dropdown
   - **Automation**: Auto-detect capability, suggest top-3 skills

2. **Slide Count** (currently manual slider)
   - **Opportunity**: AI could estimate optimal slides based on topic length
   - **Current**: User sets 1-30
   - **Automation**: LLM suggests count, user confirms

3. **Language Detection** (currently manual, has "auto" option)
   - **Opportunity**: Auto-detect from topic/article text
   - **Current**: User picks "auto" | "en" | "th"
   - **Automation**: Already has "auto" option; currently works

4. **Canvas Size** (currently manual preset selection)
   - **Opportunity**: Detect from context (16:9 is default)
   - **Current**: User selects ratio preset
   - **Automation**: Use context hint from user environment

5. **Style Preset** (currently manual selection)
   - **Opportunity**: AI recommends based on topic (e.g., "corporate-blue" for business)
   - **Current**: User picks from 7 presets
   - **Automation**: LLM classifies topic, suggests preset

6. **Header/Footer Customization** (currently manual text entry)
   - **Opportunity**: AI generates suggested header/footer text
   - **Current**: User types custom text
   - **Automation**: LLM generates suggestions

7. **Media Model Selection** (currently manual)
   - **Opportunity**: Select model based on slide count, topic, available credits
   - **Current**: User picks model, or defaults to best available
   - **Automation**: Auto-select based on cost/quality/time tradeoff

8. **Image References** (currently manual upload/selection)
   - **Opportunity**: AI could suggest reference images from topic
   - **Current**: User uploads up to 5 images
   - **Automation**: Search+auto-select from image library

---

## 9. Known Limitations & Edge Cases

### Current
- **No template selection UI**: User cannot choose layout template; LLM decides + first slide forced to hero_center
- **Watermark clarity**: Fixed percentage input; no visual preview
- **Audio generation**: Optional but no voice selection UI (uses model defaults)
- **Deferred media**: If media times out, stored for later fetch; not guaranteed to resolve
- **No presentation preview**: User must wait for all slides to be added before seeing result

### Potential Improvements
1. **Template selection UI**: Let user pick template per slide
2. **Real-time progress UI**: Show slide thumbnails as they generate
3. **Interactive skill parameters**: Show skill schema UI before generation
4. **Cost estimation**: Predict credits before generation
5. **Rollback**: Allow undo/delete generated slides
6. **Batch generation**: Queue multiple presentations

---

## 10. Credit System Integration

**Pre-generation check** (line 4451):
- Estimate total cost based on slide count + audio flag
- Deduct: Article (30 credits) + Slide split (10 credits) + Image gen (40 per slide) + Audio (40 per slide)
- Fast-fail if insufficient credits

**Per-slide deductions**:
- Article skill: handled by `invokeSkillTextLLM()`
- Image/video: handled by `mediaGenerationService`
- Audio: handled by audio skill execution

**Tracking**:
- `traceId` = taskId for audit trail
- All credits logged to `creditTransactions` table
- Billing context passed to each LLM/media call

---

## 11. Progress Polling (Frontend)

**Query**: `getDraftProgress` (line 810)
- Polls every 2 seconds (line 814)
- Redis key: `ai_draft_progress:${taskId}`

**Progress shape**:
```typescript
{
  phase: 0-7;                 // which phase
  phaseLabel: string;         // "Writing article...", "Generating images..."
  slidesCompleted: number;    // how many slides done
  totalSlides: number;        // target
  slidePreview: Array<{       // per-slide status
    title: string;
    imageStatus: "pending" | "done" | "placeholder";
  }>;
  completed: boolean;
  cancelled?: boolean;
  error?: {
    code: string;
    message: string;
  };
  result?: {
    slidesAdded: number;
    newDeckVersion: number;
    articlePreview: string;
    warnings: string[];
  };
}
```

---

## 12. Existing Presentation Skills (Examples)

### Skills that can be used for Draft with AI

**Article Generation Skills**:
- Any skill with `category: "article_generation"`
- Any skill with `executionMode: "llm-only"` that produces long-form text
- Must have `systemPrompt` (LLM instructions)

**Media Skills** (image/video):
- Any skill with `category: "image_generation"` or `video_generation"`
- Can be article-based (takes topic → prompts) or interactive
- Determines image vs. video output

**Example skill structure**:
```yaml
# skill.md
name: article-writer
version: 1.0.0
category: article_generation
icon: FileText
description: Generate comprehensive articles from topics
enabled_by_default: true
tags: [writing, content, articles]

---
# Markdown content: system prompt for LLM
You are an expert article writer...

# schemas/ui.schema.json
{
  "title": "Article Generation",
  "sections": [
    {
      "id": "style",
      "title": "Writing Style",
      "fields": [
        {
          "id": "tone",
          "type": "select",
          "label": "Tone",
          "options": [
            { "value": "formal", "label": "Formal" },
            { "value": "casual", "label": "Casual" }
          ]
        },
        {
          "id": "length",
          "type": "select",
          "label": "Target Length",
          "options": [
            { "value": "short", "label": "Short (400 words)" },
            { "value": "medium", "label": "Medium (700 words)" },
            { "value": "long", "label": "Long (1200+ words)" }
          ]
        }
      ]
    }
  ]
}
```

---

## Summary Table: Manual vs. Automated

| Choice | Current | Automated? | Where Automated |
|--------|---------|-----------|-----------------|
| Topic/Article | ✓ Manual | No | User enters |
| Slide count | ✓ Manual | No | User drags slider |
| Article skill | ✓ Manual | No | User selects |
| Language | ✓ Manual | Partial | Has "auto" option |
| Image model | ✓ Manual | Partial | Defaults to first available |
| Audio model | ✓ Manual | Partial | Defaults if audio enabled |
| Style preset | ✓ Manual | No | User selects |
| Layout per slide | Automatic | ✓ Yes | LLM decides |
| Image/video generation | Automatic | ✓ Yes | API generates |
| Audio generation | Automatic | ✓ Yes | TTS generates |
| SVG graphic selection | Automatic | ✓ Yes | Random from category |
| Slide layout | Automatic | ✓ Yes | Engine positions elements |
| Text fitting | Automatic | ✓ Yes | Engine scales fonts |
| Watermark application | Automatic | ✓ Yes | If enabled, always applied |

---

**End of Research**
