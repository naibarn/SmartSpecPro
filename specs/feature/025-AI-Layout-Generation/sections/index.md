<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-types-presets
section-02-callllm-structured
section-03-layout-engine
section-04-error-codes-feature-flag
section-05-built-in-skills
section-06-orchestrator
section-07-trpc-router
section-08-frontend-modal
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-shared-types-presets | - | 02, 03, 04, 06 | Yes (standalone) |
| section-02-callllm-structured | 01 | 06 | Yes (with 03, 04, 05) |
| section-03-layout-engine | 01 | 06 | Yes (with 02, 04, 05) |
| section-04-error-codes-feature-flag | 01 | 07 | Yes (with 02, 03, 05) |
| section-05-built-in-skills | - | 06 (E2E testing) | Yes (with 02, 03, 04) |
| section-06-orchestrator | 01, 02, 03, 05 | 07 | No |
| section-07-trpc-router | 04, 06 | 08 | No |
| section-08-frontend-modal | 07 | - | No |

## Execution Order (Batches)

1. **Batch 1:** section-01-shared-types-presets (foundation, no dependencies)
2. **Batch 2:** section-02-callllm-structured, section-03-layout-engine, section-04-error-codes-feature-flag, section-05-built-in-skills (all parallel after batch 1)
3. **Batch 3:** section-06-orchestrator (requires 01, 02, 03, 05)
4. **Batch 4:** section-07-trpc-router (requires 04, 06)
5. **Batch 5:** section-08-frontend-modal (requires 07)

## Section Summaries

### section-01-shared-types-presets
**Plan Sections:** A.1, A.2, A.3, A.4 (partial — types only)

Zod schemas (GenerateAIDraftInputSchema, AIPresentationSlideSchema, AIDraftProgressSchema, SlideStylePresetSchema), the SlideStylePreset interface, 5 built-in style preset definitions, SVG graphics catalog extraction from GraphicsPanel to shared module, and `pickRandomSvgFromCategory()` helper.

**New files:** `shared/presentation/aiTypes.ts`, `shared/presentation/aiStylePresets.ts`, `shared/presentation/svgGraphicsCatalog.ts`
**Modified files:** `client/src/presentation-canvas/components/GraphicsPanel.tsx` (re-import SVGs from shared)
**Test files:** `shared/presentation/__tests__/aiTypes.test.ts`, `shared/presentation/__tests__/aiStylePresets.test.ts`, `shared/presentation/__tests__/svgGraphicsCatalog.test.ts`

### section-02-callllm-structured
**Plan Sections:** B.1, B.2, B.3, B.4

Thin wrapper around existing `invokeLLM()` that adds JSON parsing + Zod validation + single retry. Used by Phase 2 (article → slide split). Does NOT duplicate provider resolution, credit tracking, or audit logging.

**New files:** `server/services/callLLMStructured.ts`
**Test files:** `server/services/__tests__/callLLMStructured.test.ts`

### section-03-layout-engine
**Plan Sections:** C.1, C.2, C.3, C.4, C.5, C.6

Converts slide data + image URL + SVG graphic + style preset into valid `PresentationSlideContent`. Implements 4 layout templates (hero_center, split_right_image, split_left_image, feature_boxes_right), all parameterized by style preset colors/fonts. Header/footer injection with content area adjustment. Null-image placeholder handling. Output validation against `presentationSlideContentSchema`.

**New files:** `server/services/aiPresentationLayoutEngine.ts`
**Test files:** `server/services/__tests__/aiPresentationLayoutEngine.test.ts`

### section-04-error-codes-feature-flag
**Plan Sections:** A.4 (constants), H.1, H.2

3 new error codes (AI_GENERATION_FAILED, AI_INSUFFICIENT_CREDITS, AI_INVALID_RESPONSE), feature flag (`PRESENTATION_AI_GENERATION_ENABLED`, default OFF), `isPresentationAIGenerationEnabled()` function, and extending the availability endpoint with optional `aiGenerationEnabled` field.

**Modified files:** `shared/presentation/constants.ts`, `server/routers/presentation.ts` (availability query)
**Test files:** Covered by existing constants tests + Section E router tests

### section-05-built-in-skills
**Plan Sections:** F.1, F.2, F.3

5 skill.md files for built-in article writers: general, business, education, marketing, lifestyle. Each with YAML frontmatter (execution_mode: llm-only, category: content_writing) and a system prompt body.

**New files:** `skills/general-article-writer/skill.md`, `skills/business-article-writer/skill.md`, `skills/education-article-writer/skill.md`, `skills/marketing-article-writer/skill.md`, `skills/lifestyle-article-writer/skill.md`
**Test files:** Validation tests in skill registry test or standalone

### section-06-orchestrator
**Plan Sections:** D.1 through D.8

The 6-phase pipeline orchestrator. Phase 1: load skill via skillRegistry + invokeLLM for article. Phase 2: callLLMStructured for slide split. Phase 3: invokeLLM for image prompt enhancement (concurrent, max 3). Phase 4: generateImageAsync + MediaTask polling (concurrent, max 3). Phase 5: layout compilation. Phase 6: DB transaction for deck insertion. Plus: Redis progress tracking, Redis lock with heartbeat, cancellation mechanism, credit pre-check, audit events.

**New files:** `server/services/aiPresentationService.ts`
**Test files:** `server/services/__tests__/aiPresentationService.test.ts`

### section-07-trpc-router
**Plan Sections:** E.1, E.2, E.3

Three new procedures in the presentation router's `ai` sub-router: `generateDraft` (mutation — validates, acquires lock, starts background pipeline), `getDraftProgress` (query — polls Redis), `cancelDraft` (mutation — sets Redis cancel flag). Error mapping for AI-specific error codes. Passes userToken to orchestrator.

**Modified files:** `server/routers/presentation.ts`
**Test files:** `server/routers/__tests__/presentation.ai.test.ts`

### section-08-frontend-modal
**Plan Sections:** G.1, G.2, G.3, G.4, G.5

AIDraftModal component with topic input, skill selectors, style preset card grid, progress view with polling, cancel button, slide thumbnails. PresentationEditor integration: "Draft with AI" button gated by aiGenerationEnabled. Preset selector sub-component.

**New files:** `client/src/components/presentation/AIDraftModal.tsx`
**Modified files:** `client/src/pages/PresentationEditor.tsx`
**Test files:** `client/src/components/presentation/__tests__/AIDraftModal.test.tsx`
