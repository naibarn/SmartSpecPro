# Implementation Plan: Feature 025 — AI Presentation Layout Auto-Generation

## Overview

This plan describes how to build a "Draft with AI" feature for SmartSpecPro's Presentation Editor. The feature lets users type a topic, select an article-writing skill and an image prompt skill, choose a visual style preset, and receive a complete slide deck — content, images, and layout — generated automatically.

The system runs a 6-phase pipeline: article generation → article-to-slide splitting → per-slide image prompt enhancement → per-slide image generation → layout compilation with style preset → deck insertion. Phases 1 and 3 load skill definitions via `skillRegistry` and call the LLM directly through `invokeLLM()`. Phase 2 uses a new `callLLMStructured()` wrapper (also built on `invokeLLM()`). Phase 4 uses `mediaGenerationService.generateImageAsync()` with task-status polling. Phase 6 inserts slides within a database transaction. No existing surfaces (Media Studio, Chat, Virtual Workflow) are affected.

Progress is shown in real-time via a polling endpoint that returns phase status and slide thumbnails as they complete. Users can cancel in-progress generation.

---

## Architecture

### Pipeline Flow

```
User Input (topic, articleSkillId, imageSkillId, stylePresetId)
    │
    ▼
Phase 1: skillRegistry.load(articleSkillId) → invokeLLM(systemPrompt, topic) → article text
    │
    ▼
Phase 2: callLLMStructured(splitPrompt, article) → SlideData[]
    │
    ▼
Phase 3: skillRegistry.load(imageSkillId) → invokeLLM(systemPrompt, keywords) × N (concurrent, max 3)
    │                                         ↳ fallback: raw keywords on failure
    ▼
Phase 4: generateImageAsync({prompt}) → poll MediaTask status → imageUrl × N (concurrent, max 3)
    │                                     ↳ fallback: placeholder rect on timeout
    ▼
Phase 5: LayoutEngine.generateSlide(slideData, imageUrl, svg, stylePreset) × N slides
    │
    ▼
Phase 6: DB transaction { addSlideToDeck(deckId, slideContent, version++) × N } (sequential)
```

**Cancellation:** A Redis flag `ai_draft_cancel:{taskId}` is checked before each phase. If set, the pipeline stops early and reports partial results.

### Async Execution Model

The pipeline runs as a background task, not inline in the tRPC mutation. This is because:
1. Total execution is 25-35 seconds (too long for a synchronous mutation)
2. We need to report per-slide progress to the client
3. Client must remain responsive during generation

**Pattern:**
- `ai.generateDraft` mutation validates input, creates a task record in Redis, starts background execution, returns `{ taskId }`
- `ai.getDraftProgress` query polls Redis for progress updates
- Background function runs the 6 phases, updating Redis progress after each step
- On completion, progress record includes final result or error

### Redis Keys

| Key | TTL | Content |
|-----|-----|---------|
| `ai_draft_lock:{userId}` | 300s (heartbeat every 30s) | Prevents concurrent drafts per user. Acquired with `SET key value NX EX 300`. Renewed during pipeline. Deleted on completion/error. |
| `ai_draft_progress:{taskId}` | 300s | Progress object (phase, slides completed, previews, errors) |
| `ai_draft_cancel:{taskId}` | 300s | Set by `ai.cancelDraft` mutation. Checked before each phase. |

---

## Section A: Shared Types, Style Presets & SVG Catalog

### A.1 Zod Schemas (`shared/presentation/aiTypes.ts`)

Define these types:

**AI_LAYOUT_TEMPLATE_IDS** — `["hero_center", "split_left_image", "split_right_image", "feature_boxes_right"]`

**AI_SVG_CATEGORIES** — `["Arrows", "Business", "Communication", "Technology", "Education", "Nature", "Health", "Shapes", "Media", "Navigation", "Finance"]`

**AI_STYLE_PRESET_IDS** — `["dark-professional", "light-minimalist", "corporate-blue", "nature-green", "warm-sunset"]`

**SlideStylePreset interface:**
```typescript
interface SlideStylePreset {
  id: string;
  name: string;
  nameLocalized?: { th?: string; en?: string };
  colors: {
    background: string;
    backgroundAlt: string;
    primary: string;
    secondary: string;
    text: string;
    textMuted: string;
    cardBg: [string, string, string];
    overlay: string;
  };
  typography: {
    titleFontFamily: string;
    bodyFontFamily: string;
    titleFontWeight: number;
    bodyFontWeight: number;
  };
  header?: SlideStylePresetHeader;
  footer?: SlideStylePresetFooter;
}
```

**SlideStylePresetHeader:** enabled, height, backgroundColor, logoPosition, showDeckTitle, titleFontSize, titleColor, borderBottom

**SlideStylePresetFooter:** enabled, height, backgroundColor, showPageNumber, showCustomText, customText, fontSize, textColor, borderTop

**AIPresentationSlideSchema** — per-slide data from Phase 2: templateId, title, body[], graphicCategory, imagePromptKeywords

**GenerateAIDraftInputSchema** — tRPC input: deckId, expectedVersion, prompt, numSlides, language, articleSkillId (required), imageSkillId (optional), imageModel (optional), stylePresetId (default "dark-professional"), footerCustomText (optional)

**GenerateAIDraftOutputSchema** — returns: taskId (string)

**AIDraftProgressSchema** — polling response: phase (1-6), phaseLabel, slidesCompleted, totalSlides, slidePreview[] (title + thumbnail status), completed (boolean), result? (slidesAdded, newDeckVersion, articlePreview, warnings), error? (code, message)

All schemas validated with Zod. SlideStylePreset also has a Zod schema for runtime validation of preset definitions.

### A.2 Built-in Style Presets (`shared/presentation/aiStylePresets.ts`)

Define 5 presets as a `Record<string, SlideStylePreset>` with a `getBuiltInPreset(id)` lookup function.

**dark-professional:** Dark background (#1a1a2e), red accent (#e94560), Inter/Sarabun fonts, header with deck title + red border, footer with page numbers.

**light-minimalist:** White background, black/gray text, Inter only, no header, minimal transparent footer.

**corporate-blue:** Light blue-gray background (#f0f4f8), navy headings (#102a43), dark header bar, footer with page numbers + custom text.

**nature-green:** Light green background (#f0f7f0), deep green headings (#1b4332), header with white title, footer with green tones.

**warm-sunset:** Warm cream background (#fff8f0), red accent (#d63031), no header, footer with red page numbers.

Each preset must pass `SlideStylePresetSchema.safeParse()`. Export a `BUILT_IN_PRESETS` array for the frontend to display.

### A.3 SVG Graphics Catalog (`shared/presentation/svgGraphicsCatalog.ts`)

Extract the `SvgGraphic` interface and `SVG_GRAPHICS` array from `client/src/presentation-canvas/components/GraphicsPanel.tsx` into a shared module. The shared module is importable by both server code (LayoutEngine) and client code (GraphicsPanel). GraphicsPanel re-imports from the shared module instead of defining inline.

Export a `pickRandomSvgFromCategory(category: string): SvgGraphic | null` helper.

### A.4 Constants Changes (`shared/presentation/constants.ts`)

Add error codes:
- `PRESENTATION_AI_GENERATION_FAILED`
- `PRESENTATION_AI_INSUFFICIENT_CREDITS`
- `PRESENTATION_AI_INVALID_RESPONSE`

Add feature flag:
- `PRESENTATION_AI_GENERATION_FLAG_ENV = "PRESENTATION_AI_GENERATION_ENABLED"`
- `isPresentationAIGenerationEnabled()` — default OFF (unlike the main editor which defaults ON)

---

## Section B: callLLMStructured Utility

### B.1 Purpose

A small Node.js utility for making direct LLM calls with structured JSON output. Used by Phase 2 (article → slide split) and potentially other future needs.

### B.2 Interface

```typescript
async function callLLMStructured<T>(params: {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  zodSchema: z.ZodType<T>;
  maxRetries?: number;
  userId: number;
  tenantId: string;
}): Promise<{ data: T; tokensUsed: number; creditsUsed: number }>
```

### B.3 Implementation Approach

This utility is a **thin wrapper** around the existing `invokeLLM()` function from `server/services/llm.ts`. It does NOT duplicate the provider resolution, credit tracking, or audit logging infrastructure — all of that is handled by `invokeLLM()`.

1. Append JSON formatting instructions + Zod schema description to the system prompt
2. Call `invokeLLM({ model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }], userId, tenantId })` — this handles provider resolution, credit deduction, and audit logging
3. Extract the text content from the LLM response
4. Parse the response as JSON (`JSON.parse()`)
5. Validate against the provided Zod schema
6. On parse/validation failure: retry once with error-correction context appended to the user message (include the raw response and the parse error)
7. Return `{ data, tokensUsed, creditsUsed }` extracted from `invokeLLM()`'s response metadata

**What invokeLLM() already handles (no duplication needed):**
- Provider resolution via `getProviderForModel()`
- Credit check + deduction via `hasEnoughCredits()` / `deductCredits()`
- Audit logging via `auditLogger.log()`
- Token counting and cost calculation

**What callLLMStructured adds:**
- JSON parse + Zod validation layer
- Single retry on parse failure
- Typed generic return (`T` from Zod schema)

**Error handling:** Throw typed errors for parse failure after retry. Provider errors, timeouts, and credit errors propagate from `invokeLLM()` unchanged.

### B.4 File Location

`apps/web/server/services/callLLMStructured.ts`

---

## Section C: Layout Engine

### C.1 Purpose

Converts a single slide's data (title, body, imageUrl, SVG graphic) plus a style preset into a valid `PresentationSlideContent` object with absolute-positioned elements.

### C.2 Interface

```typescript
interface LayoutEngineInput {
  slideData: AIPresentationSlide;
  imageUrl: string | null;
  svgGraphic: SvgGraphic;
  stylePreset: SlideStylePreset;
  deckTitle?: string;
  slideIndex: number;
  totalSlides: number;
  canvasWidth?: number;   // default 1920
  canvasHeight?: number;  // default 1080
}

interface LayoutEngineOutput {
  slideContent: PresentationSlideContent;
  warnings: string[];
}
```

### C.3 Template Implementations

4 layout templates, all parameterized by the style preset:

**hero_center:** Full-bleed background image with overlay, centered title and body text. Used for slide 1 and section breaks. Overlay uses `preset.colors.overlay`. Title uses `preset.colors.primary` and `typography.titleFontFamily`.

**split_right_image:** Left half is a colored panel (`preset.colors.backgroundAlt`) with SVG + title + body. Right half is the image. Text uses preset fonts and colors.

**split_left_image:** Mirror of split_right_image.

**feature_boxes_right:** Left side image, right side has title + 3 feature cards. Card backgrounds use `preset.colors.cardBg[0..2]`. Card text uses `preset.colors.text`.

### C.4 Header/Footer Injection

When `preset.header?.enabled` is true, the engine prepends header elements to every slide:
- Background rect (full width × header.height)
- Optional border-bottom line
- Optional deck title text (positioned per `logoPosition`)

When `preset.footer?.enabled` is true, the engine appends footer elements:
- Background rect (full width × footer.height, positioned at bottom)
- Optional border-top line
- Page number text (e.g., "3 / 5") if `showPageNumber` is true
- Custom text if `showCustomText` is true

**Content area adjustment:** All template element Y coordinates shift down by `headerHeight`, and the available content height is `canvasHeight - headerHeight - footerHeight`.

### C.5 Critical Rules

1. **No hardcoded colors.** Every color comes from `stylePreset.colors.*`.
2. **No hardcoded fonts.** Every font comes from `stylePreset.typography.*`.
3. **Element IDs** generated via `crypto.randomUUID()`.
4. **Output validation:** Every slide passes `presentationSlideContentSchema.safeParse()`. If validation fails, log error and return a minimal fallback slide.
5. **Proportional scaling:** All coordinates are based on 1920×1080. When canvas size differs, multiply by `canvasWidth/1920` and `canvasHeight/1080`.
6. **Null image handling:** When `imageUrl` is null, insert a colored placeholder rect with `preset.colors.backgroundAlt` and a warning.

### C.6 File Location

`apps/web/server/services/aiPresentationLayoutEngine.ts`

---

## Section D: 6-Phase Orchestrator

### D.1 Purpose

Coordinates the full pipeline from user input to completed slides. Runs as a background task, updating Redis progress at each step.

### D.2 File Location

`apps/web/server/services/aiPresentationService.ts`

### D.3 Main Function

```typescript
async function generateAIDraft(
  input: GenerateAIDraftInput,
  actor: PresentationActor,
  userToken: string,
  taskId: string,
): Promise<void>
```

`userToken` is the JWT captured at tRPC mutation time. It's needed for `invokeLLM()` and `mediaGenerationService` calls that require authentication. The JWT must have a TTL > 120s (the max pipeline duration) — this is already the case since our JWTs have 24h expiry.

This function is called from the tRPC mutation after validation. It does not return a value directly — it writes results to the Redis progress key.

**Cancellation check:** Before each phase, the function reads `ai_draft_cancel:{taskId}` from Redis. If set, it stops immediately, writes partial results to the progress key with `completed: true` and `cancelled: true`, and returns.

### D.4 Phase-by-Phase Logic

**Phase 1 — Article Generation:**

**Important:** `executeSkill()` for `llm-only` mode does NOT actually call the LLM — it echoes back the prompt. The orchestrator must call the LLM directly.

- Load the skill definition via `skillRegistry.getSkill(input.articleSkillId)` to retrieve the system prompt from `skill.md`
- Build the messages array: `[{ role: "system", content: skill.systemPrompt }, { role: "user", content: buildArticlePrompt(input.prompt, input.language, input.numSlides) }]`
- Call `invokeLLM({ model: "claude-sonnet-4-6", messages, userId: actor.userId, tenantId: actor.tenantId })` — this handles provider resolution, credit deduction, and audit logging
- Extract article text from the LLM response
- If the LLM call fails: **fail immediately** — update Redis with error, return
- Timeout: 30s
- Update Redis progress: phase=1, phaseLabel="Writing article..."

**Phase 2 — Article → Slide Split:**
- Call `callLLMStructured()` with the slide-split system prompt and the article text
- System prompt instructs: split into N slides, extract title/body/imageKeywords/graphicCategory/templateId per slide
- Validate output with `AIPresentationSchema`
- Slide 1 must use `hero_center`. If LLM didn't comply, override it.
- Update Redis progress: phase=2, phaseLabel="Splitting content..."

**Phase 3+4 — Image Enhancement + Generation (concurrent per slide):**
- Use `p-map` with concurrency=3
- For each slide:
  - **Phase 3 (Image Prompt Enhancement):** If `imageSkillId` provided:
    - Load the image prompt skill via `skillRegistry.getSkill(input.imageSkillId)`
    - Call `invokeLLM({ model: "claude-sonnet-4-6", messages: [{ role: "system", content: imageSkill.systemPrompt }, { role: "user", content: slide.imagePromptKeywords }], userId: actor.userId, tenantId: actor.tenantId })`
    - Extract enhanced prompt from LLM response
    - On failure: fall back to raw `slide.imagePromptKeywords` (add warning)
    - Timeout: 10s per slide
  - **Phase 4 (Image Generation):**
    - Call `mediaGenerationService.generateImageAsync({ prompt: enhancedPrompt, model: input.imageModel || "flux-2.0", aspectRatio: "16:9" })`
    - This returns a `MediaTask` with a `taskId`, NOT a URL directly
    - Poll the media task status (via `mediaGenerationService.getTaskStatus(mediaTaskId)` or equivalent BullMQ job check) every 2s with 15s timeout
    - On success: extract `imageUrl` from completed task
    - On timeout or failure: set `imageUrl=null` (placeholder rect will be used in Phase 5), add warning
  - Update Redis progress: slidesCompleted++, add slidePreview entry (title + image status)
- Update Redis progress: phase=4, phaseLabel="Generating images..."

**Phase 5 — Layout Compilation:**
- Resolve style preset from `stylePresetId`, apply `footerCustomText` override
- For each slide: call `layoutEngine.generateSlide()` with slideData, imageUrl, SVG graphic, and stylePreset
- Collect all compiled `PresentationSlideContent` objects
- Update Redis progress: phase=5, phaseLabel="Applying layouts..."

**Phase 6 — Deck Insertion (within database transaction):**
- Wrap all slide insertions in a **single database transaction**, following the same pattern as the import service (`importPresentationSlides` in `presentationImportService.ts`)
- Inside the transaction:
  - Read current deck version as starting point
  - Sequential loop: for each compiled slide, call `addSlideToDeck({ deckId, slideContent, expectedVersion: version++ })` within the transaction context
  - If any insertion fails: the transaction rolls back, no partial slides are left in the deck
- On version conflict (deck was modified by another user): fail with error — user must refresh and retry
- On transaction success: Update Redis progress: phase=6, completed=true, result={slidesAdded, newDeckVersion, articlePreview, warnings}

### D.5 Credit Management

Before starting the pipeline:
1. Estimate total credits: article skill (30) + split LLM (10) + image skill × N (75) + image gen × N (40) + 20% buffer
2. Pre-check with `hasEnoughCredits(userId, estimate)`
3. If insufficient, fail with `PRESENTATION_AI_INSUFFICIENT_CREDITS`

Credits are deducted per-call by the individual services (executeSkill, callLLMStructured, mediaGenerationService). The pre-check prevents starting a pipeline that will fail mid-way due to insufficient credits.

### D.6 Concurrency Control

Redis lock key `ai_draft_lock:{userId}` with TTL 300s, acquired atomically via `SET key taskId NX EX 300`. Renewed every 30s via a heartbeat `setInterval` that runs for the pipeline's duration. Cleared on completion, error, or cancellation. If lock exists when a new draft is requested, return error "Draft already in progress".

The 300s TTL (vs the ~60s p95 pipeline duration) provides headroom for slow image generation without risk of lock expiry mid-pipeline. The heartbeat ensures the lock stays alive even if individual phases are slow.

### D.7 Audit Events

Emit via `auditLogger.log()` for each phase transition and error:
- `ai_draft_request` — initial request details
- `ai_draft_article_done` — article length, skill used, latency
- `ai_draft_split_done` — slide count, latency
- `ai_draft_image_enhance` — per slide, skill used, raw→enhanced
- `ai_draft_image_done` / `ai_draft_image_failed` — per slide
- `ai_draft_complete` / `ai_draft_failed` — final status

### D.8 Cancellation Mechanism

A cancellation check function `isCancelled(taskId)` reads the Redis key `ai_draft_cancel:{taskId}`. It is called:
- Before Phase 1 starts
- Before Phase 2 starts
- Before each slide in Phase 3+4 loop
- Before Phase 5 starts
- Before Phase 6 starts

On cancellation:
1. Stop processing immediately (do not start the next phase/slide)
2. Images already generated are kept (no cleanup needed for MVP — orphaned image cleanup is a future concern)
3. No slides are inserted into the deck (Phase 6 hasn't run, or if it's mid-transaction, the transaction rolls back)
4. Update Redis progress: `{ completed: true, cancelled: true, slidesCompleted: N, phaseLabel: "Cancelled" }`
5. Release the Redis lock
6. Clear the heartbeat interval

---

## Section E: tRPC Router Integration

### E.1 New Procedures

Add an `ai` sub-router to the presentation router:

**`presentation.ai.generateDraft`** — `protectedProcedure.mutation`
1. `ensureAIGenerationEnabled()` (new feature flag check)
2. Validate input with `GenerateAIDraftInputSchema`
3. Resolve deck ownership via `resolvePresentationTenantId()`
4. Check slide count limit (existing slides + numSlides ≤ 200)
5. Acquire Redis lock
6. Generate taskId (`crypto.randomUUID()`)
7. Initialize Redis progress object
8. Capture `userToken` from `ctx` (the JWT from the authenticated request)
9. Start `generateAIDraft(input, actor, userToken, taskId)` as a background promise (fire-and-forget with error capture in `.catch()`)
10. Return `{ taskId }`

**`presentation.ai.getDraftProgress`** — `protectedProcedure.query`
1. Input: `{ taskId: string }`
2. Read Redis progress key
3. If not found, return `{ completed: false, error: "not_found" }`
4. Return progress object (validated with `AIDraftProgressSchema`)

**`presentation.ai.cancelDraft`** — `protectedProcedure.mutation`
1. Input: `{ taskId: string }`
2. Read Redis progress key — verify it exists and belongs to the current user (userId stored in progress object)
3. If not found or already completed: return `{ success: false }`
4. Set Redis key `ai_draft_cancel:{taskId}` with TTL 300s
5. Return `{ success: true }`

### E.2 Error Mapping

Map `PresentationServiceError` codes to tRPC error codes:
- `AI_GENERATION_FAILED` → `INTERNAL_SERVER_ERROR`
- `AI_INSUFFICIENT_CREDITS` → `PRECONDITION_FAILED`
- `AI_INVALID_RESPONSE` → `INTERNAL_SERVER_ERROR`

### E.3 Non-Empty Deck Warning

The tRPC mutation doesn't block non-empty decks. The **client** shows a warning dialog before calling the mutation if the deck already has slides. The server simply appends at the end.

---

## Section F: Built-in Article Skills

### F.1 Skills to Create

5 skill.md files in `apps/web/skills/`:

1. **general-article-writer** — All-purpose article writer. No domain assumptions. Works for any topic.
2. **business-article-writer** — Business-focused: strategy, operations, market analysis, case studies.
3. **education-article-writer** — Educational content: lesson plans, explainers, learning objectives.
4. **marketing-article-writer** — Marketing content: campaigns, audience targeting, brand messaging.
5. **lifestyle-article-writer** — Lifestyle/wellness: health tips, recipes, travel, personal development.

### F.2 Skill.md Structure

Each skill follows the existing pattern:
```yaml
---
name: General Article Writer
description: Write articles on any topic for presentation slides
category: content_writing
execution_mode: llm-only
icon: pen-tool
version: "1.0.0"
enabledByDefault: true
priority: 50
creditMultiplier: 1.0
---
```

The markdown body contains the system prompt for the LLM — writing style, tone, structure guidelines, and output format (plain text article with sections).

### F.3 Input/Output

- **Input:** User provides `topic` (required) and `language` (optional, defaults to auto-detect)
- **Output:** Full article text (500-2000 words), structured with numbered sections
- **No schemas directory needed** — these are `llm-only` mode skills with simple text input/output

---

## Section G: Frontend — AIDraftModal + Progress UI

### G.1 Modal Component

**File:** `client/src/components/presentation/AIDraftModal.tsx`

**Props:** `isOpen`, `onClose`, `deckId`, `expectedVersion`, `currentSlideCount`

**Sections:**
1. **Topic input** — textarea, required, max 1000 chars
2. **Slide count** — slider 1-10, default 5
3. **Language** — select: auto/en/th
4. **Content Settings** — Article skill dropdown (required). Populated from skill list. Shows skill name + description.
5. **Image Settings** — Image prompt skill dropdown (optional) + Image model dropdown (optional, defaults to Media Studio default).
6. **Slide Style** — Horizontal card grid of 5 presets. Each card shows a color swatch thumbnail (background + primary + secondary). Default: dark-professional.
7. **Footer text** — Optional text input. Only visible when selected preset has `footer.enabled`. Pre-filled with preset's default `customText`.
8. **Non-empty deck warning** — If `currentSlideCount > 0`, show inline warning: "X slides will be added at the end of your deck."
9. **Generate button** — Disabled until article skill is selected.

### G.2 Progress View

After mutation succeeds (returns `taskId`), the modal transitions to a progress view:

**Polling:** `trpc.presentation.ai.getDraftProgress.useQuery({ taskId }, { refetchInterval: 2000, enabled: !completed })`

**Display:**
- Phase label: "Phase 2/6: Splitting content..."
- Progress bar: fills proportionally (phase / 6)
- Slide thumbnails: As each slide completes in Phase 3-4, show a mini card with the slide title and image status (generated / placeholder). Thumbnails appear one by one as `slidePreview[]` grows.
- **Cancel button:** Visible while generation is in progress (`!completed`). Calls `trpc.presentation.ai.cancelDraft.mutate({ taskId })`. After clicking, button shows "Cancelling..." and disables. Polling continues until progress shows `cancelled: true`.
- On completion: Show success message with slidesAdded count, articlePreview snippet, and any warnings.
- On cancellation: Show "Generation cancelled" message. No slides were added to the deck.
- On error: Show error message with retry button.

### G.3 Skill Loading

Use `trpc.skills.list` (or equivalent existing endpoint) to fetch available skills. Filter:
- **Article skills:** All skills (user picks any). Could optionally filter by `category: "content_writing"` but the interview decision was to show all skills.
- **Image prompt skills:** Filter by `execution_mode: "enhance-prompt"` or `category: "image_generation"`.

### G.4 PresentationEditor Integration

In `client/src/pages/PresentationEditor.tsx`:
- Add a "✨ Draft with AI" button in the toolbar/sidebar
- Only visible when `isPresentationAIGenerationEnabled()` (client-side check via availability query)
- Opens `AIDraftModal` with current deck state
- On modal close (after success): Invalidate deck query to reload slides

### G.5 Preset Selector Component

A reusable horizontal card selector. Each card:
- Fixed width ~120px
- Shows 4 color circles (background, primary, secondary, text)
- Preset name below
- Selected state: ring/border highlight
- Clicking selects the preset and updates the footer text visibility

---

## Section H: Error Codes & Feature Flag

### H.1 Constants Changes

In `shared/presentation/constants.ts`:

Add 3 new error code values to `PRESENTATION_ERROR_CODE_VALUES`:
- `"PRESENTATION_AI_GENERATION_FAILED"`
- `"PRESENTATION_AI_INSUFFICIENT_CREDITS"`
- `"PRESENTATION_AI_INVALID_RESPONSE"`

Add corresponding entries to `PRESENTATION_ERROR_CODE` object.

Add feature flag:
- `PRESENTATION_AI_GENERATION_FLAG_ENV = "PRESENTATION_AI_GENERATION_ENABLED"`
- `isPresentationAIGenerationEnabled()` — same pattern as `isPresentationFeatureEnabled()` but defaults to `false` (OFF)

### H.2 Availability Endpoint

Extend the existing `presentation.availability` query to include `aiGenerationEnabled?: boolean` (optional) so the client knows whether to show the "Draft with AI" button. Making it optional (not required) avoids breaking the existing availability schema — older clients that don't know about AI generation will simply not see the field.

The env-var-reading function `isPresentationAIGenerationEnabled()` stays server-only. The client checks `availability.aiGenerationEnabled === true` from the tRPC query result.

---

## Dependency Order

Sections must be implemented in this order due to dependencies:

```
Section A (types, presets, SVG catalog) ← no dependencies
    ↓
Section B (callLLMStructured) ← depends on A for types
Section C (LayoutEngine) ← depends on A for types, presets, SVG catalog
Section H (error codes, feature flag) ← depends on A for types
    ↓
Section D (orchestrator) ← depends on A, B, C
Section F (built-in skills) ← no code dependencies, but needed for E2E testing
    ↓
Section E (tRPC router) ← depends on D, H
    ↓
Section G (frontend) ← depends on E for API contract
```

Sections A, B, C, H can be worked on in parallel. Sections D and F can be parallel. Section E depends on D. Section G depends on E.

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| LLM returns invalid JSON in Phase 2 | callLLMStructured retries once with error context. Zod validation catches malformed data. |
| Image generation slow (>15s per image) | Concurrent limit of 3 + per-slide 15s timeout via MediaTask polling. Placeholder rect on timeout. |
| Credit depletion mid-pipeline | Pre-check with 30% buffer. Partial results still saved if credits run out after Phase 1. |
| Version conflict during Phase 6 insertion | All insertions in a single DB transaction. Read version inside transaction. On conflict: transaction rolls back, user must refresh. |
| Style preset produces invalid slide content | LayoutEngine validates every slide against Zod schema. Fallback to minimal slide on validation failure. |
| Large article (>2000 words) overflows Phase 2 | Truncate article to 2000 words before sending to Phase 2 split LLM. |
| MediaTask polling never completes | 15s per-slide timeout with fallback to placeholder. Does not block other slides (concurrent). |
| User abandons long-running generation | Cancel button → Redis flag → checked before each phase. Lock released, no slides inserted. |
| Redis lock expires during slow pipeline | 300s TTL with 30s heartbeat renewal. Covers p99 execution times. |
| JWT token expires during pipeline | JWT TTL is 24h, pipeline max is ~60s. No risk in practice. |
