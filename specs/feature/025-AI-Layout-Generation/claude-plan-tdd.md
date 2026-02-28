# TDD Plan: Feature 025 — AI Presentation Layout Auto-Generation

**Testing Framework:** Vitest
**Mock Pattern:** `vi.hoisted()` + `vi.mock()` + `vi.clearAllMocks()` in `beforeEach`
**Service Testing:** Mock deps, assert with `expect().rejects.toSatisfy()` for errors
**Commands:** `pnpm test`, `pnpm vitest run <file>`, `pnpm test:coverage`

---

## Section A: Shared Types, Style Presets & SVG Catalog

**Test file:** `shared/presentation/__tests__/aiTypes.test.ts`

### A.1 Zod Schemas
- Test: GenerateAIDraftInputSchema accepts valid input with all required fields
- Test: GenerateAIDraftInputSchema rejects prompt shorter than 3 chars
- Test: GenerateAIDraftInputSchema rejects numSlides > 10
- Test: GenerateAIDraftInputSchema defaults stylePresetId to "dark-professional"
- Test: GenerateAIDraftInputSchema defaults numSlides to 5
- Test: GenerateAIDraftInputSchema rejects unknown stylePresetId
- Test: AIPresentationSlideSchema validates correct slide data
- Test: AIPresentationSlideSchema rejects unknown templateId
- Test: AIDraftProgressSchema accepts completed state with result
- Test: AIDraftProgressSchema accepts error state
- Test: SlideStylePresetSchema validates a complete preset definition
- Test: SlideStylePresetSchema rejects preset with missing required color fields

### A.2 Built-in Style Presets

**Test file:** `shared/presentation/__tests__/aiStylePresets.test.ts`

- Test: All 5 built-in presets pass SlideStylePresetSchema validation
- Test: getBuiltInPreset returns correct preset for each valid id
- Test: getBuiltInPreset returns undefined for unknown id
- Test: Each preset has unique id, name, and color palette
- Test: BUILT_IN_PRESETS array contains exactly 5 entries
- Test: Each preset.colors has all required fields (background, backgroundAlt, primary, secondary, text, textMuted, cardBg[3], overlay)
- Test: Each preset.typography has all required fields (titleFontFamily, bodyFontFamily, titleFontWeight, bodyFontWeight)
- Test: Presets with header.enabled have all required header fields
- Test: Presets with footer.enabled have all required footer fields

### A.3 SVG Graphics Catalog

**Test file:** `shared/presentation/__tests__/svgGraphicsCatalog.test.ts`

- Test: SVG_GRAPHICS array is non-empty
- Test: Each SVG graphic has id, name, category, svgContent
- Test: pickRandomSvgFromCategory returns a graphic from the requested category
- Test: pickRandomSvgFromCategory returns null for non-existent category
- Test: All AI_SVG_CATEGORIES have at least one graphic in the catalog

### A.4 Constants

- Test: New error codes exist in PRESENTATION_ERROR_CODE_VALUES
- Test: isPresentationAIGenerationEnabled() returns false when env is unset
- Test: isPresentationAIGenerationEnabled() returns true when env is "true"
- Test: isPresentationAIGenerationEnabled() returns false when env is "false"

---

## Section B: callLLMStructured Utility

**Test file:** `server/services/__tests__/callLLMStructured.test.ts`

Mock: `invokeLLM` from `server/services/llm.ts`

- Test: Returns parsed data when LLM returns valid JSON matching Zod schema
- Test: Extracts tokensUsed and creditsUsed from invokeLLM response metadata
- Test: Retries once when first response is invalid JSON, succeeds on retry
- Test: Retries once when first response fails Zod validation, succeeds on retry
- Test: Throws after retry when both attempts return invalid JSON
- Test: Throws after retry when both attempts fail Zod validation
- Test: Passes systemPrompt with JSON instructions to invokeLLM
- Test: Passes userId and tenantId to invokeLLM
- Test: Uses default model when model param is omitted
- Test: Propagates invokeLLM errors (provider unavailable, credit insufficient) without wrapping

---

## Section C: Layout Engine

**Test file:** `server/services/__tests__/aiPresentationLayoutEngine.test.ts`

### C.1 Template Rendering (4 templates × 5 presets = 20 combos)
- Test: hero_center template produces valid PresentationSlideContent for each preset
- Test: split_right_image template produces valid PresentationSlideContent for each preset
- Test: split_left_image template produces valid PresentationSlideContent for each preset
- Test: feature_boxes_right template produces valid PresentationSlideContent for each preset

### C.2 Color/Font Parameterization
- Test: All text elements use fonts from stylePreset.typography (no hardcoded fonts)
- Test: All colored elements use colors from stylePreset.colors (no hardcoded colors)
- Test: dark-professional preset produces dark background + light text
- Test: light-minimalist preset produces light background + dark text

### C.3 Header/Footer
- Test: Header elements are prepended when preset.header.enabled is true
- Test: No header elements when preset.header.enabled is false
- Test: Footer elements are appended when preset.footer.enabled is true
- Test: Footer page number shows "slideIndex / totalSlides" format
- Test: Footer custom text renders when showCustomText is true
- Test: Content area Y coordinates shift down by header.height when header is enabled
- Test: Content area height is reduced by header.height + footer.height

### C.4 Edge Cases
- Test: Null imageUrl produces placeholder rect with preset.colors.backgroundAlt
- Test: Null imageUrl adds a warning to output
- Test: Output passes presentationSlideContentSchema.safeParse()
- Test: Elements have unique IDs (crypto.randomUUID)
- Test: Proportional scaling works for non-1920x1080 canvas sizes
- Test: Falls back to minimal slide when template rendering produces invalid content

---

## Section D: 6-Phase Orchestrator

**Test file:** `server/services/__tests__/aiPresentationService.test.ts`

Mocks: `skillRegistry`, `invokeLLM`, `callLLMStructured`, `mediaGenerationService`, `layoutEngine`, `addSlideToDeck`, `Redis`, `hasEnoughCredits`, `deductCredits`, `auditLogger`

### D.1 Happy Path
- Test: Full pipeline (5 slides) completes successfully — all 6 phases run in order
- Test: Redis progress is updated after each phase
- Test: Final progress shows completed=true with correct slidesAdded count

### D.2 Phase 1 (Article Generation)
- Test: Loads skill definition via skillRegistry.getSkill(articleSkillId)
- Test: Calls invokeLLM with skill's system prompt + user topic
- Test: Fails immediately when invokeLLM throws — sets Redis error, returns
- Test: Does NOT call executeSkill()

### D.3 Phase 2 (Split)
- Test: Calls callLLMStructured with article text
- Test: Slide 1 templateId is forced to hero_center even if LLM returns different
- Test: Validates split output with AIPresentationSchema

### D.4 Phase 3+4 (Image Enhancement + Generation)
- Test: Runs slides concurrently with max concurrency of 3
- Test: Loads image skill via skillRegistry when imageSkillId provided
- Test: Calls invokeLLM for image prompt enhancement
- Test: Falls back to raw keywords when image skill LLM call fails
- Test: Calls generateImageAsync for each slide
- Test: Polls MediaTask status until completion
- Test: Sets imageUrl=null on MediaTask timeout (15s)
- Test: Updates Redis slidesCompleted after each slide

### D.5 Phase 6 (Insertion)
- Test: All slides inserted within a single database transaction
- Test: Version increments sequentially starting from current deck version
- Test: Transaction rolls back on version conflict — no partial slides
- Test: Redis progress updated with final result on success

### D.6 Error Handling
- Test: Phase 1 failure stops entire pipeline immediately
- Test: Phase 3 failure for one slide uses raw keywords (continues)
- Test: Phase 4 failure for one slide uses placeholder (continues)
- Test: Credit pre-check fails before pipeline starts
- Test: Mid-pipeline credit exhaustion reports partial results

### D.7 Cancellation
- Test: Pipeline stops when ai_draft_cancel:{taskId} is set before Phase 2
- Test: Pipeline stops between slides in Phase 3+4 loop
- Test: Cancelled progress shows completed=true, cancelled=true
- Test: Redis lock is released on cancellation

### D.8 Concurrency Control
- Test: Redis lock acquired at start, released on completion
- Test: Redis lock acquired at start, released on error
- Test: Second concurrent request rejected when lock exists
- Test: Lock heartbeat renews TTL every 30s

### D.9 Credit Estimation
- Test: Pre-check estimate includes 30% buffer
- Test: Pre-check uses correct formula: article(30) + split(10) + imageSkill×N(75) + imageGen×N(40)

---

## Section E: tRPC Router Integration

**Test file:** `server/routers/__tests__/presentation.ai.test.ts`

Mocks: `aiPresentationService.generateAIDraft`, `Redis`, feature flag

### E.1 ai.generateDraft
- Test: Returns { taskId } on valid input
- Test: Rejects when AI generation feature flag is OFF
- Test: Rejects when slide count would exceed PRESENTATION_LIMITS.maxSlidesPerDeck
- Test: Rejects when Redis lock exists (concurrent draft in progress)
- Test: Passes userToken from ctx to generateAIDraft
- Test: Starts background pipeline (fire-and-forget)
- Test: Initializes Redis progress object

### E.2 ai.getDraftProgress
- Test: Returns progress object for existing taskId
- Test: Returns { completed: false, error: "not_found" } for unknown taskId

### E.3 ai.cancelDraft
- Test: Sets Redis cancel flag for valid taskId
- Test: Returns { success: false } for unknown taskId
- Test: Returns { success: false } for already-completed task
- Test: Rejects when taskId belongs to different user

### E.4 Error Mapping
- Test: AI_GENERATION_FAILED maps to INTERNAL_SERVER_ERROR
- Test: AI_INSUFFICIENT_CREDITS maps to PRECONDITION_FAILED

---

## Section F: Built-in Article Skills

**Test file:** No unit test file needed — skills are markdown files with YAML frontmatter.

Validation tests (can be in a shared test file or as part of skill registry tests):
- Test: All 5 skill.md files parse successfully via skillRegistry
- Test: Each skill has execution_mode: "llm-only"
- Test: Each skill has category: "content_writing"
- Test: Each skill has enabledByDefault: true
- Test: Each skill has a non-empty system prompt in the markdown body
- Test: Skill IDs are unique

---

## Section G: Frontend — AIDraftModal + Progress UI

**Test file:** `client/src/components/presentation/__tests__/AIDraftModal.test.tsx`

Mock: tRPC hooks (trpc.presentation.ai.generateDraft, getDraftProgress, cancelDraft), trpc.skills.list

### G.1 Modal Rendering
- Test: Renders topic textarea, slide count slider, language select
- Test: Renders article skill dropdown populated from skills list
- Test: Renders image skill dropdown (optional)
- Test: Renders 5 style preset cards
- Test: Default selected preset is dark-professional
- Test: Generate button disabled when no article skill selected
- Test: Generate button enabled when article skill selected + topic filled

### G.2 Non-Empty Deck Warning
- Test: Shows warning when currentSlideCount > 0
- Test: No warning when currentSlideCount === 0

### G.3 Progress View
- Test: Transitions to progress view after generateDraft mutation succeeds
- Test: Shows phase label from progress data
- Test: Shows slide thumbnails as slidePreview[] grows
- Test: Shows success message when completed=true
- Test: Shows error message when error is present
- Test: Shows cancelled message when cancelled=true

### G.4 Cancel Button
- Test: Cancel button visible during in-progress generation
- Test: Cancel button calls cancelDraft mutation
- Test: Cancel button shows "Cancelling..." after click
- Test: Cancel button hidden after completion

### G.5 Preset Selector
- Test: Clicking a preset card selects it (ring highlight)
- Test: Footer text input visible when selected preset has footer.enabled
- Test: Footer text input hidden when selected preset has no footer

### G.6 PresentationEditor Integration
- Test: "Draft with AI" button visible when aiGenerationEnabled is true
- Test: "Draft with AI" button hidden when aiGenerationEnabled is false
- Test: Clicking button opens AIDraftModal
- Test: Deck query invalidated when modal closes after successful generation

---

## Section H: Error Codes & Feature Flag

Covered by Section A.4 tests (constants) and Section E.1 tests (feature flag guard).

No additional test file needed.
