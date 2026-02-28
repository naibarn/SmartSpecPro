# Feature 025: AI Layout Generation — Usage Guide

## Overview

This feature enables users to generate complete presentation slides from a text topic using AI. It follows a 6-phase pipeline: article generation, content splitting, image prompts, image generation, layout engine, and slide persistence.

## Feature Flag

The feature is **disabled by default**. To enable:

```bash
# In apps/web/.env
PRESENTATION_AI_GENERATION_ENABLED=true
```

The availability endpoint returns `aiGenerationEnabled: true/false` to the frontend, which gates the "Draft with AI" button in the toolbar.

## Architecture

```
User → AIDraftModal (React) → tRPC Router → aiPresentationService
                                                 ├── Phase 1: Article generation (skill + LLM)
                                                 ├── Phase 2: Split into slides (callLLMStructured)
                                                 ├── Phase 3: Image prompt generation
                                                 ├── Phase 4: Image generation (media service)
                                                 ├── Phase 5: Layout engine (SVG + positioning)
                                                 └── Phase 6: Persist slides (addSlideToDeck)
```

Progress is tracked in Redis and polled by the frontend every 2 seconds.

## Files Created/Modified

### Shared Types & Constants (Section 01)
- `apps/web/shared/presentation/aiTypes.ts` — Zod schemas for AI types, presets, progress
- `apps/web/shared/presentation/aiStylePresets.ts` — 5 built-in style presets
- `apps/web/shared/presentation/svgCatalog.ts` — SVG graphic catalog with 11 categories

### LLM Structured Output (Section 02)
- `apps/web/server/services/callLLMStructured.ts` — Generic structured LLM call with Zod validation

### Layout Engine (Section 03)
- `apps/web/server/services/aiPresentationLayoutEngine.ts` — 4 layout templates, SVG placement, element generation

### Error Codes & Feature Flag (Section 04)
- `apps/web/shared/presentation/constants.ts` — Added AI error codes, feature flag function
- `apps/web/shared/presentation/contracts.ts` — Extended availability schema with `aiGenerationEnabled`

### Article Writer Skills (Section 05)
- `apps/web/skills/general-article-writer/skill.md`
- `apps/web/skills/business-article-writer/skill.md`
- `apps/web/skills/education-article-writer/skill.md`
- `apps/web/skills/marketing-article-writer/skill.md`
- `apps/web/skills/lifestyle-article-writer/skill.md`

### Pipeline Orchestrator (Section 06)
- `apps/web/server/services/aiPresentationService.ts` — 6-phase pipeline with concurrency control

### tRPC Router (Section 07)
- `apps/web/server/routers/presentation.ts` — Added `ai` sub-router (generateDraft, getDraftProgress, cancelDraft)

### Frontend Modal (Section 08)
- `apps/web/client/src/components/presentation/AIDraftModal.tsx` — Config form + progress view
- `apps/web/client/src/pages/PresentationEditor.tsx` — "Draft with AI" button integration

## Test Files
- `shared/presentation/__tests__/constants.ai.test.ts` — 16 tests
- `server/services/__tests__/callLLMStructured.test.ts` — Tests for structured LLM calls
- `server/services/__tests__/aiPresentationLayoutEngine.test.ts` — Layout engine tests
- `server/services/__tests__/articleWriterSkills.test.ts` — 32 tests
- `server/services/__tests__/aiPresentationService.test.ts` — 22 tests
- `server/routers/__tests__/presentation.ai.test.ts` — 15 tests
- `client/src/components/presentation/__tests__/AIDraftModal.test.tsx` — 22 tests

**Total: 107+ tests across 7 test files**

## API Endpoints

### `presentation.ai.generateDraft` (mutation)
Starts an AI generation task. Returns `{ taskId }`.

Input:
```typescript
{
  deckId: number;
  expectedVersion: number;
  prompt: string;          // 3-1000 chars
  numSlides: number;       // 1-10, default 5
  language: "auto" | "en" | "th";
  articleSkillId: string;  // required
  imageSkillId?: string;   // optional
  imageModel?: string;     // optional
  stylePresetId: string;   // default "dark-professional"
  footerCustomText?: string;
}
```

### `presentation.ai.getDraftProgress` (query)
Polls progress by taskId. Returns phase, label, slide preview, completion status.

### `presentation.ai.cancelDraft` (mutation)
Sets cancel flag in Redis. Pipeline checks for cancellation between phases.

## Style Presets

| ID | Name | Theme |
|----|------|-------|
| `dark-professional` | Dark Professional | Dark bg, red accents |
| `light-minimalist` | Light Minimalist | White, minimal |
| `corporate-blue` | Corporate Blue | Blue/gray corporate |
| `nature-green` | Nature Green | Green earth tones |
| `warm-sunset` | Warm Sunset | Warm orange/coral |

## Credits

The pipeline uses credits for each LLM/media call:
- Article generation: ~30 credits
- Content splitting: ~10 credits
- Image generation: ~75-115 credits per image (skill + media)
- Total estimated: `(30 + 10 + numSlides * 115) * 1.2` buffer

## Next Steps

1. Enable the feature flag in production when ready
2. Consider adding more style presets
3. Add image model selection options (currently text input)
4. Consider WebSocket-based progress instead of polling
