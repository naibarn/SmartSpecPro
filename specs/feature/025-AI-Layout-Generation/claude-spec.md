# Synthesized Specification: Feature 025 — AI Presentation Layout Auto-Generation

**Sources:** spec.md (v5.1), claude-research.md, claude-interview.md
**Date:** 2026-02-26

---

## 1. What We're Building

A **"Draft with AI"** feature in the Presentation Editor that auto-generates a complete, content-rich slide deck from a user-provided topic. The user makes 3 selections in a modal:

1. **Article Skill** — domain-specific content writer (required, 3-5 built-in skills shipped)
2. **Image Prompt Skill** — visual style optimizer (optional, defaults to raw keywords)
3. **Style Preset** — color palette, fonts, header/footer (5 built-in presets)

The system then runs a **6-phase pipeline**:
- Phase 1: Article generation via selected skill
- Phase 2: Article → slide splitting via direct LLM (new `callLLMStructured` utility)
- Phase 3: Per-slide image prompt enhancement via selected image skill
- Phase 4: Per-slide image generation via existing `mediaGenerationService`
- Phase 5: Layout compilation with style preset
- Phase 6: Sequential deck insertion with optimistic locking

**Progress is real-time** via a polling endpoint (async mutation returns taskId, client polls every 2s, shows slide thumbnails as they complete).

---

## 2. Key Design Decisions (from Interview)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Empty state (no skills) | Ship 3-5 built-in article skills | Feature works out of box |
| Default image model | Same as Media Studio (flux-2.0) | Consistent UX |
| Post-generation editing | Manual canvas editing only (MVP) | Simplest, slides are normal slides |
| Deck context | Any deck, warning on non-empty | Flexible, user in control |
| Phase 1 failure | Fail immediately, no retry | Critical phase, nothing to split |
| Loading UX | Real progress with slide thumbnails | Rich feedback via polling |
| LLM structured output | New Node.js `callLLMStructured()` utility | Keep pipeline in Node.js |
| Progress streaming | Polling with progress endpoint | Simpler than SSE, reliable |

---

## 3. Codebase Integration Points

### 3.1 Existing Functions to Use (NO changes needed)

| Function | Location | Used in Phase |
|----------|----------|---------------|
| `executeSkill()` | `server/services/skillExecutor.ts` | Phase 1 (article), Phase 3 (image prompt) |
| `mediaGenerationService.generateImageAsync()` | `server/services/mediaGenerationService.ts` | Phase 4 |
| `addSlideToDeck()` | `server/routers/presentation.ts` → service | Phase 6 |
| `hasEnoughCredits()` / `deductCredits()` | `server/services/creditService.ts` | Pre-check + each phase |
| `getProviderForModel()` | `server/_core/llmRoutes.ts` | Phase 2 (via new utility) |
| `auditLogger.log()` | `server/services/auditLogger.ts` | All phases |
| `ensureFeatureEnabled()` | `server/routers/presentation.ts` | tRPC guard |

### 3.2 New Code to Create

| File | Purpose |
|------|---------|
| `shared/presentation/aiTypes.ts` | Zod schemas, SlideStylePreset interface, AI_STYLE_PRESET_IDS |
| `shared/presentation/aiStylePresets.ts` | 5 built-in style presets |
| `shared/presentation/svgGraphicsCatalog.ts` | SVG catalog extracted from GraphicsPanel |
| `server/services/aiPresentationService.ts` | 6-phase orchestrator |
| `server/services/aiPresentationLayoutEngine.ts` | Layout compiler (slideData + preset → canvas JSON) |
| `server/services/callLLMStructured.ts` | Node.js utility for structured JSON LLM calls |
| `client/src/components/presentation/AIDraftModal.tsx` | Modal with 3 selections + progress polling |
| `skills/general-article-writer/skill.md` | Built-in general article skill |
| `skills/business-article-writer/skill.md` | Built-in business domain skill |
| `skills/education-article-writer/skill.md` | Built-in education domain skill |
| `skills/marketing-article-writer/skill.md` | Built-in marketing domain skill |
| `skills/lifestyle-article-writer/skill.md` | Built-in lifestyle domain skill |

### 3.3 Modified Existing Files

| File | Change |
|------|--------|
| `server/routers/presentation.ts` | Add `ai.generateDraft` + `ai.getDraftProgress` procedures |
| `shared/presentation/constants.ts` | 3 error codes + feature flag |
| `client/src/presentation-canvas/components/GraphicsPanel.tsx` | Re-import from shared catalog |
| `client/src/pages/PresentationEditor.tsx` | Mount AIDraftModal + button |

---

## 4. Style Preset System

No theme/style system exists in the codebase. Every element has individually hardcoded colors. Style presets are a **new concept** scoped only to AI-generated slides.

**SlideStylePreset** interface drives all LayoutEngine colors/fonts:
- `colors`: background, backgroundAlt, primary, secondary, text, textMuted, cardBg[3], overlay
- `typography`: titleFontFamily, bodyFontFamily, titleFontWeight, bodyFontWeight
- `header?`: enabled, height, backgroundColor, logoPosition, titleFontSize, titleColor, borderBottom
- `footer?`: enabled, height, backgroundColor, showPageNumber, customText, fontSize, textColor, borderTop

**5 built-in presets:** dark-professional, light-minimalist, corporate-blue, nature-green, warm-sunset

---

## 5. Pipeline Technical Details

### Phase 2: callLLMStructured Utility

New utility wrapping `getProviderForModel()` with OpenAI-compatible JSON response_format:

```typescript
async function callLLMStructured<T>(params: {
  systemPrompt: string;
  userMessage: string;
  model?: string;        // default: claude-sonnet-4-6 or equivalent
  zodSchema: z.ZodType<T>;
  maxRetries?: number;   // default: 1
  userId: number;
  tenantId: string;
}): Promise<{ data: T; tokensUsed: number; creditsUsed: number }>
```

Flow: `getProviderForModel()` → construct request with `response_format: { type: "json_object" }` → fetch → parse → validate with Zod → retry once on parse failure.

### Progress Polling (Async Mutation Pattern)

**New procedures:**
- `ai.generateDraft` → returns `{ taskId: string }` immediately, starts background work
- `ai.getDraftProgress` → returns `{ phase, phaseLabel, slidesCompleted, totalSlides, slidePreview[], completed, error? }`

**Storage:** Redis key `ai_draft_progress:{taskId}` with TTL 300s. Updated after each phase/slide completes.

**Client polling:** `useQuery` with `refetchInterval: 2000` while `!completed`. Shows:
- Current phase label
- Slide thumbnails as they complete (mini preview of generated slide content)
- Total progress percentage

---

## 6. Credit Estimation (5 slides)

| Phase | Calls | Estimated Credits |
|-------|-------|-------------------|
| Phase 1: Article skill | 1 | ~15-30 |
| Phase 2: LLM split | 1 | ~10 |
| Phase 3: Image prompt skill × 5 | 5 | ~50-75 |
| Phase 4: Image gen × 5 (flux-2.0 @ 8 credits) | 5 | ~40 |
| **Total** | **12** | **~115-155 credits** |

Pre-check with 20% buffer: require ~186 credits available before starting.

---

## 7. Error Handling

| Phase | Failure Mode | Behavior |
|-------|-------------|----------|
| Phase 1 (article) | Skill execution fails | **Fail immediately**, return error to user |
| Phase 2 (split) | JSON parse fails | Retry once with simplified prompt, then fail |
| Phase 3 (image prompt) | Skill fails for one slide | Use raw keywords for that slide, add warning |
| Phase 4 (image gen) | Image gen fails for one slide | Use placeholder rect, add warning |
| Phase 6 (insert) | Version conflict | Fail — user must refresh and retry |
| Any phase | Credit insufficient mid-pipeline | Fail with partial result info |

---

## 8. Testing Patterns (from codebase research)

**Framework:** Vitest
**Mock pattern:** `vi.hoisted()` + `vi.mock()` + `vi.clearAllMocks()` in `beforeEach`
**Service testing:** Mock deps, assert with `expect().rejects.toSatisfy()` for errors
**Commands:** `pnpm test`, `pnpm vitest run <file>`, `pnpm test:coverage`

Key test files to create:
- `aiPresentationLayoutEngine.test.ts` — 4 templates × 5 presets, header/footer, placeholders
- `aiPresentationService.test.ts` — 6-phase orchestration, error paths, partial failures
- `callLLMStructured.test.ts` — JSON parsing, retry, Zod validation
- `AIDraftModal.test.tsx` — 3 selectors, progress polling, error states

---

## 9. Non-Functional Requirements

| Metric | Target |
|--------|--------|
| E2E (5 slides, p50) | ≤ 35s |
| E2E (p95) | ≤ 60s |
| Phase 1 timeout | 30s |
| Phase 2 timeout | 15s |
| Phase 3 per-slide timeout | 10s |
| Phase 4 per-slide timeout | 15s (fallback to placeholder) |
| Concurrent images per request | Max 3 |
| Concurrent drafts per user | 1 (Redis lock) |
| Max slides per request | 10 |
| Progress poll interval | 2s |
| Feature flag | `PRESENTATION_AI_GENERATION_ENABLED` (default OFF) |
