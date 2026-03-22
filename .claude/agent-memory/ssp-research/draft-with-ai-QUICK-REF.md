---
name: Draft with AI — Quick Reference
description: Fast lookup tables, code snippets, and file paths for AIDraftModal and model selection
type: reference
---

# Draft with AI — Quick Reference

## File Locations

| Component | File | Lines |
|-----------|------|-------|
| Dialog UI | `client/src/components/presentation/AIDraftModal.tsx` | 1–1900 |
| Generate handler | same | 1317–1477 |
| Article skill executor | same | 793–819 |
| Media model queries | same | 625–691 |
| Input schema | `shared/presentation/aiTypes.ts` | 198–242 |
| tRPC mutation | `server/routers/presentation.ts` | 393–482 |
| Backend service | `server/services/aiPresentationService.ts` | 10,200–12,950 |
| Text model resolver | same | 282–320 |
| Skill execution policy | `server/services/skillExecutionPolicy.ts` | 116–250 |
| Chat skill router | `server/routers/chat.ts` | 1292–1650 |

---

## State Variables (Quick Map)

```typescript
// Article source
useCustomArticle          // boolean - toggle between article skill vs custom text
customArticleText         // string - user-provided article content
selectedArticleSkill      // string - skill ID for article generation
articleGenSkill           // string - skill ID for "Use Your Own Article" phase
articleSkillParams        // Record - dynamic form inputs for article skill

// Media
selectedImageSkill        // string - skill ID for image/video generation
imageModel                // string - selected image/video model ID
audioModel                // string - selected audio model ID
generateAudio             // boolean - whether to generate audio
mediaSkillParams          // Record - dynamic form inputs for media skill

// Layout
numSlides                 // number - slides to generate (1-30)
language                  // "auto" | "en" | "th"
selectedCanvasWidth       // number - canvas width
selectedCanvasHeight      // number - canvas height
selectedPresetId          // string - style preset (dark-professional, etc.)

// Progress tracking
taskId                    // string | null - generation task ID
completed                 // boolean - generation complete flag
isGeneratingArticle       // boolean - article skill execution in progress
```

---

## Data Flow: One-Liner Summary

```
User fills form → handleGenerate() → generateDraft tRPC → Redis lock
→ Fire-and-forget: generateAIDraft() in backend
→ Phase 1: resolveDefaultTextModel() for article outline
→ Phase 2-7: Media generation, skill execution, layout
→ Progress persisted to Redis, polled every 2s via getDraftProgress
→ UI displays progress, warnings, completion
```

---

## tRPC Mutation: Input Shape (Minimal Example)

```typescript
generateDraft.mutate({
  deckId: 123,
  expectedVersion: 5,
  prompt: "How to use AI effectively",
  numSlides: 5,
  language: "en",

  // Optional: article skill (if NOT using custom article)
  draftSkillId: "general-article-writer",
  articleSkillParams: { tone: "professional" },

  // Optional: custom article text
  useCustomArticle: true,
  customArticleText: "Custom article here...",

  // Optional: media
  imageSkillId: "scenic-image-generator",
  imageModel: "fal-ai/flux-pro",
  generateAudio: true,
  audioModel: "uvoice/tts-premium",

  // Optional: advanced
  imagePromptContext: "modern, sleek design",
  referenceImageUrls: ["/uploads/style.jpg"],
  stylePresetId: "dark-professional",
  headerCustomText: "Company Name",

  // Note: textModel NOT exposed in UI (schema has it though)
})
```

---

## "Use Your Own Article" Flow (Copy-Paste Ready)

```typescript
// 1. User picks skill
const articleGenSkill = "professional-article-writer";  // from SearchableCombobox

// 2. Fetch schema
const articleGenSchemaQuery = trpc.skills.getInputSchema.useQuery(
  { skillId: articleGenSkill },
  { enabled: articleGenSkill !== "" && useCustomArticle }
);

// 3. User fills form
const articleGenParams = { tone: "formal", style: "academic" };

// 4. Generate article
const result = await executeSkillMutation.mutateAsync({
  skillId: articleGenSkill,
  prompt: topic,
  dynamicParams: articleGenParams,
  referenceImageUrls: [...],
});
// Returns: { success: true, message: "generated article..." }

// 5. Place in state
setCustomArticleText(result.message);

// 6. Later, user submits presentation with:
{
  useCustomArticle: true,
  customArticleText: result.message,
}
```

---

## Model Selection: Decision Tree

```
generateAIDraft() called with input
  │
  ├─ input.textModel provided?
  │  ├─ YES → Use it (if available in DB)
  │  └─ NO → Continue
  │
  └─ Call resolveDefaultTextModel()
     └─ Check in-memory cache (60s TTL)
     │  └─ Return cached value
     │
     └─ Query DB:
        SELECT modelId FROM llmModels
        WHERE enabled=true AND isDefaultTextModel=true
        LIMIT 1
     │
     └─ Not found? → Use "gpt-4o-mini" (LAST_RESORT_MODEL)

For article skill (chat.executeSkill):
  │
  ├─ input.model provided?
  │  ├─ YES → Use it
  │  └─ NO → Continue
  │
  └─ Call resolveSkillExecutionPolicy({
       skill,
       conversationModel: ctx.conversation?.model
     })
     │
     ├─ skill.executionPolicy.mode === "requirements"?
     │  └─ YES → selectBestLlmModel(requirements) + fallback
     │
     ├─ skill.executionPolicy.mode === "fixed"?
     │  └─ YES → Use skill.llmModelId OR skill.defaultModel
     │
     └─ Otherwise:
        → skill.llmModelId
        → skill.defaultModel
        → conversationModel
        → system_default
```

---

## Query Reference (How Data Flows In)

| Query | Purpose | Stale Time | Lines |
|-------|---------|-----------|-------|
| `trpc.skills.getUserVisibleSkills.useQuery({ limit: 100 })` | List all available skills | N/A | 419 |
| `trpc.skills.getInputSchema.useQuery({ skillId })` | Get form schema for skill | 300s | 453, 476, 502 |
| `trpc.media.getModels.useQuery({ type: "image" \| "video" })` | Image/video models | 300s | 625 |
| `trpc.media.getModels.useQuery({ type: "audio" })` | Audio models | 300s | 652 |
| `trpc.presentation.ai.getDraftProgress.useQuery({ taskId })` | Poll generation progress | N/A, refetchInterval: 2000 | 822 |
| `trpc.library.listDocuments.useQuery(...)` | Reference/watermark images | N/A | 421, 436 |

---

## Progress Polling Structure

```typescript
// Poll every 2 seconds while generation is active
const progressQuery = trpc.presentation.ai.getDraftProgress.useQuery(
  { taskId: taskId! },
  {
    enabled: isOpen && taskId !== null && !completed,
    refetchInterval: 2000,  // ← Adjust here if needed
  }
);

// Returns:
{
  phase: 1,                     // 0-7
  phaseLabel: "Article Generation",
  phaseDetail: "Creating outline from topic",
  slidesCompleted: 2,
  totalSlides: 5,
  slidePreview: [
    { title: "Title", imageStatus: "pending" },
  ],
  completed: false,
  updatedAt: "2026-03-16T10:30:45.123Z",
  workerActive: true,
  diagnostics: {
    taskId: "uuid-here",
    operation: "planning",
    model: "gpt-4o-mini",        // ← Which LLM was used
    attempt: 1,
    startedAt: "2026-03-16T10:30:40.000Z",
    deadlineAt: "2026-03-16T10:40:40.000Z",
  },
  error: null,
  result: null,                  // Populated when completed
}
```

---

## Skill vs Model: What's the Difference?

| Concept | What It Is | Selectable in UI | Examples |
|---------|-----------|-----------------|----------|
| **Skill** | A pre-built prompt/workflow for a task | YES (SearchableCombobox) | "professional-article-writer", "scenic-image-gen" |
| **LLM Model** | Which AI model to use for text generation | PARTIALLY (only media models exposed) | "gpt-4o-mini", "claude-3-5-sonnet" |
| **Media Model** | Image/video/audio generation service | YES (combobox) | "fal-ai/flux-pro", "uvoice/tts-premium" |

Example: "professional-article-writer" skill (via `chat.executeSkill`)
- Skill defines: system prompt + validation rules
- Model resolution: skill's `llmModelId` OR capability matching OR system default
- User selects the **skill**, backend picks the **model**

---

## localStorage Keys

```javascript
localStorage.getItem("smartspec_aiDraft_articleSkill")           // String (skill ID)
localStorage.getItem("smartspec_aiDraft_imageSkill")            // String (skill ID)
localStorage.getItem("smartspec_aiDraft_imageModel")            // String (model ID)
localStorage.getItem("smartspec_aiDraft_audioModel")            // String (model ID)
localStorage.getItem("smartspec_aiDraft_imagePromptContext")    // String
localStorage.getItem("smartspec_aiDraft_referenceImages")       // JSON array
```

Restored on component mount (lines 546–591).

---

## Stalled Detection

```typescript
// If no progress update for 60 seconds (60,000ms)
const AI_DRAFT_STALLED_PROGRESS_MS = 60_000;
const AI_DRAFT_STALLED_LOCK_TTL_SECONDS = 240;

// User sees message:
"No progress update for Xs while waiting for AI planning..."
"No active worker is attached to this task..."

// UI tracks:
stalledSeconds = Math.floor((Date.now() - lastProgressAtRef.current) / 1000)
```

---

## Error Categories (From formatAIDraftWarningMessage)

```typescript
// Pattern: "Slide 5: image generation returned no media (...)"
if (normalizedReason.includes("timeout_waiting_for_result")) {
  // → "Image is still being processed..."
}

// Pattern: "Slide coverage check: 80%, avg bullets 3.2"
// → "Slide coverage review: 80%, average bullets 3.2."

// Pattern: "Slide 3: deferred media task could not find target region"
// → "Media finished later, but the slide no longer had a valid target area..."

// Pattern: "Slide 2: audio generation failed (uvoice http 403)"
// → "Audio was rejected by UVoice (403). Current key doesn't allow this voice..."
```

---

## When Does Model Selection Actually Happen?

| Phase | When | Model Source | Code |
|-------|------|---|---|
| **UI form submission** | User clicks Generate | Not yet (user picks skills, not models for text) | AIDraftModal.tsx:1355 |
| **tRPC arrives at backend** | `presentation.ai.generateDraft` endpoint | Still deferred | presentation.ts:447 |
| **Fire-and-forget spawns** | `generateAIDraft()` starts | STILL deferred | aiPresentationService.ts:10,200 |
| **Phase 1: Article generation** | `resolveDefaultTextModel()` called | NOW resolved | aiPresentationService.ts:12,930 |
| **Phase 2+: Media generation** | Each slide's media task | Image/audio models from UI input | aiPresentationService.ts:10,400+ |
| **Article skill execution** | `chat.executeSkill` in handleGenerateArticle | `resolveSkillExecutionPolicy()` | skillExecutionPolicy.ts:116 |

**Key Insight**: Model selection for article/slide generation is **deferred until backend execution**, not determined at form submission time.

---

## Code Snippet: Custom Model Override (If Exposed)

If we wanted to add a text model selector to the UI:

```typescript
// Add to state
const [textModel, setTextModel] = useState(() =>
  localStorage.getItem("smartspec_aiDraft_textModel") || ""
);

// Query available text models
const textModelsQuery = trpc.llm.getModels.useQuery(  // hypothetical
  { type: "text" },
  { staleTime: 300_000 }
);

// Pass to mutation
generateDraft.mutate({
  ...,
  textModel: textModel.trim() || undefined,  // Let backend use default if empty
});

// Persist selection
useEffect(() => {
  if (textModel) {
    localStorage.setItem("smartspec_aiDraft_textModel", textModel);
  }
}, [textModel]);
```

---

## Common Patterns

### Skill with Dynamic Form

```typescript
// 1. User selects skill from dropdown
setSelectedArticleSkill("professional-article-writer");

// 2. Fetch its schema
const schemaQuery = trpc.skills.getInputSchema.useQuery(
  { skillId: "professional-article-writer" }
);

// 3. Render DynamicSkillForm
<DynamicSkillForm
  schema={schema}
  values={articleSkillParams}
  onChange={setArticleSkillParams}
/>

// 4. Pass to executeSkill
executeSkillMutation.mutateAsync({
  skillId: "professional-article-writer",
  dynamicParams: articleSkillParams,
})
```

### Model Combobox Selection

```typescript
// 1. Query available models
const modelsQuery = trpc.media.getModels.useQuery({ type: "image" });
const models = modelsQuery.data?.models ?? [];
const defaultModel = modelsQuery.data?.defaults?.image;

// 2. Render selector
<ImageModelCombobox
  models={models}
  selectedModelId={imageModel}
  onSelect={setImageModel}
  defaultModelId={defaultModel}
/>

// 3. Pass to generateDraft
generateDraft.mutate({
  ...,
  imageModel: imageModel || undefined,
})
```

---

**End of Quick Reference**
