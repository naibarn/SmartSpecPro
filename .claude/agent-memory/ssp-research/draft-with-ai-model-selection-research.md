---
name: Draft with AI - Dialog & Model Selection Research
description: Complete technical analysis of AIDraftModal UI, tRPC data flow, and LLM model selection for article generation and slide structuring
type: reference
---

# Draft with AI Dialog & Model Selection — Comprehensive Research Brief

**Last Updated**: 2026-03-16
**Status**: COMPLETE — All component flows, file locations, and model selection logic mapped

---

## Executive Summary

The "Draft with AI" dialog (AIDraftModal) is a comprehensive UI component that:
1. Accepts topic/article input and skill selection
2. Collects model preferences and advanced options
3. Fires a tRPC mutation (`presentation.ai.generateDraft`) with complete parameters
4. Streams progress back to the UI via polling (`presentation.ai.getDraftProgress`)
5. Uses **skill execution policy** to resolve LLM models at runtime (not hardcoded)

**Key Finding**: Model selection happens AFTER the UI form is submitted, during service execution. The UI can optionally pass `textModel` to override the default, but the backend's `resolveSkillExecutionPolicy` makes the final decision based on skill requirements, conversation context, and system availability.

---

## 1. UI Component Structure

### Location & Size
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/presentation/AIDraftModal.tsx`
- **Size**: ~1900 lines
- **Entry Point**: `export function AIDraftModal({ isOpen, onClose, deckId, ... }: AIDraftModalProps)`

### Component Hierarchy

```
AIDraftModal (main component)
├── Dialog (Radix UI wrapper)
│   ├── DialogHeader + DialogTitle
│   ├── DialogContent
│   │   ├── Configuration Phase (lines 1600–1700)
│   │   │   ├── Topic/Article Input Section
│   │   │   │   ├── Skill Selection (SearchableCombobox)
│   │   │   │   └── "Use Your Own Article" Toggle (lines 350–360)
│   │   │   ├── Article Generation Form (lines 452–460)
│   │   │   │   ├── Skill Schema Query (trpc.skills.getInputSchema)
│   │   │   │   └── DynamicSkillForm Component
│   │   │   ├── Media & Image Options
│   │   │   │   ├── Image Model Selector (ImageModelCombobox)
│   │   │   │   ├── Audio Model Selector
│   │   │   │   └── MediaModelCombobox for extra params
│   │   │   └── Advanced Options (Collapsible)
│   │   │       ├── Header/Footer Settings
│   │   │       ├── Watermark Settings
│   │   │       └── Canvas Preset Selector
│   │   └── Progress Phase (lines 1700–1900)
│   │       ├── Progress Bar
│   │       ├── Phase Label + Detail
│   │       ├── Warnings Display
│   │       └── Result Summary
│   └── DialogFooter
│       ├── Cancel Button
│       └── Generate / Close Button
```

### State Management

| State Variable | Type | Purpose | Lines |
|---|---|---|---|
| `autoMode` | boolean | Toggle between auto/manual generation | 349 |
| `useCustomArticle` | boolean | Use provided article vs skill generation | 353 |
| `customArticleText` | string | User-provided article content | 354 |
| `articleGenSkill` | string | Skill ID for "Use Your Own Article" phase | 355 |
| `selectedArticleSkill` | string | Skill ID for main article generation | 362 |
| `selectedImageSkill` | string | Skill ID for image/video generation | 363 |
| `imageModel` | string | Model ID for image generation | 364 |
| `audioModel` | string | Model ID for audio generation | 366 |
| `numSlides` | number | Number of slides to generate | 360 |
| `language` | "auto" \| "en" \| "th" | Content language | 361 |
| `taskId` | string \| null | Tracking ID for generation progress | 408 |
| `completed` | boolean | Generation completion status | 409 |

### Key localStorage Persistence (lines 341–345)

Skill selections and model choices are saved to localStorage for UX persistence:
```javascript
localStorage.getItem("smartspec_aiDraft_articleSkill")
localStorage.getItem("smartspec_aiDraft_imageSkill")
localStorage.getItem("smartspec_aiDraft_imageModel")
localStorage.getItem("smartspec_aiDraft_audioModel")
localStorage.getItem("smartspec_aiDraft_imagePromptContext")
```

---

## 2. "Use Your Own Article" Feature (Article Skill Selector)

### Component Location
Lines: 452–460 (schema query), 793–819 (skill execution handler)

### Flow Diagram

```
User clicks "Use Your Own Article" toggle
         ↓
Form shows:
  - Article Generation Skill Selector (SearchableCombobox)
  - Article Generation Params (DynamicSkillForm)
  - Generate Button (handleGenerateArticle)
         ↓
executeSkillMutation.mutateAsync({
  skillId: articleGenSkill,
  prompt: topic.trim(),
  dynamicParams: articleGenParams,
  referenceImageUrls: normalizedReferenceImageUrls,
})
         ↓
LLM Skill Execution (via chat.executeSkill tRPC)
         ↓
Result placed in customArticleText state
         ↓
User submits presentation with custom article
```

### Skill Query & Schema Fetch (lines 452–460)

```typescript
// Fetch available skills
const skillsQuery = trpc.skills.getUserVisibleSkills.useQuery({ limit: 100 });

// Fetch input schema for selected article gen skill
const articleGenSchemaQuery = trpc.skills.getInputSchema.useQuery(
  { skillId: articleGenSkill },
  { enabled: articleGenSkill !== "" && useCustomArticle, staleTime: 300_000 }
);

const articleGenSchema = articleGenSchemaQuery.data?.hasSchema
  ? (articleGenSchemaQuery.data.schema as SkillInputSchema)
  : null;
```

### Article Generation Handler (lines 793–819)

```typescript
const handleGenerateArticle = useCallback(async () => {
  if (!articleGenSkill || isGeneratingArticle) return;
  setIsGeneratingArticle(true);
  try {
    const result = await executeSkillMutation.mutateAsync({
      skillId: articleGenSkill,
      prompt: topic.trim() || undefined,
      dynamicParams: Object.keys(articleGenParams).length > 0
        ? articleGenParams
        : undefined,
      referenceImageUrls:
        normalizedReferenceImageUrls.length > 0
          ? normalizedReferenceImageUrls
          : undefined,
    });
    if (result.success && result.message) {
      setCustomArticleText(result.message);
      toast.success("Article generated successfully");
    } else {
      toast.error(result.error || "Failed to generate article");
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Failed to generate article");
  } finally {
    setIsGeneratingArticle(false);
  }
}, [articleGenSkill, isGeneratingArticle, topic, articleGenParams, ...deps]);
```

**Note**: This is using `chat.executeSkill` (skill execution) not the presentation AI service. Model selection is handled by skill execution policy at the skill router level.

---

## 3. Main Data Flow: UI → tRPC → Backend Service

### 3A. UI: handleGenerate Function (lines 1317–1477)

The Generate button calls `handleGenerate()` which constructs the complete input:

```typescript
const handleGenerate = useCallback(() => {
  // ... validation ...

  generateDraft.mutate(
    {
      // Deck + version
      deckId,
      expectedVersion,

      // Article source
      prompt: effectivePrompt,
      numSlides,
      language: language as "auto" | "en" | "th",

      // Skill selection
      draftSkillId:
        !useCustomArticle && selectedArticleSkill ? selectedArticleSkill : undefined,
      articleSkillId:
        !useCustomArticle && selectedArticleSkill && isArticleDraftSkill(...)
          ? selectedArticleSkill : undefined,

      // Article input (if using custom)
      useCustomArticle,
      customArticleText: useCustomArticle && customArticleText.trim().length > 0
        ? customArticleText.trim() : undefined,

      // Layout & media
      imageSkillId: selectedImageSkill !== "__none__" ? selectedImageSkill : undefined,
      imageModel: selectedMediaModelId || undefined,
      generateAudio,
      audioModel: generateAudio ? selectedAudioModelId : undefined,

      // Advanced options
      canvasWidth: selectedCanvasWidth,
      canvasHeight: selectedCanvasHeight,
      imagePromptContext: imagePromptContext.trim() || undefined,
      referenceImageUrls: normalizedReferenceImageUrls.length > 0
        ? normalizedReferenceImageUrls : undefined,
      mediaModelExtraParams: advancedMediaOptionsEnabled
        && Object.keys(advancedMediaSyncedExtraParams).length > 0
        ? advancedMediaSyncedExtraParams : undefined,

      // Style
      stylePresetId: selectedPresetId,
      headerCustomText: headerTitleText.trim() || undefined,
      footerCustomText: footerText || undefined,
      styleOverrides: { headerEnabled, showDeckTitle, footerEnabled, showPageNumber },
      watermark: watermarkEnabled && selectedWatermarkOption
        ? { sourceUrl, format, clarityPercent } : undefined,

      // Skill params
      draftSkillParams: !useCustomArticle && Object.keys(articleSkillParams).length > 0
        ? articleSkillParams : undefined,
      articleSkillParams: !useCustomArticle && isArticleDraftSkill(...) && Object.keys(articleSkillParams).length > 0
        ? articleSkillParams : undefined,
      mediaSkillParams: Object.keys(mediaSkillParams).length > 0
        ? mediaSkillParams : undefined,
    },
    {
      onSuccess: (data) => {
        setTaskId(data.taskId);
        setCompleted(false);
      },
      onError: (err) => {
        toast.error(err.message || "Failed to start generation");
      },
    }
  );
}, [...dependencies...]);
```

### 3B. tRPC Mutation: presentation.ai.generateDraft

**Location**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/presentation.ts`, lines 393–482

**Input Schema**: `GenerateAIDraftInputSchema` (defined in `/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/aiTypes.ts`, lines 198–242)

```typescript
export const GenerateAIDraftInputSchema = z.object({
  deckId: z.number().int().positive(),
  expectedVersion: z.number().int().nonnegative(),
  prompt: z.string().min(3).max(1000),
  numSlides: z.number().int().min(1).max(MAX_AI_DRAFT_SLIDES).default(5),
  language: z.enum(["auto", "en", "th"]).default("auto"),

  // **KEY: Optional text model override**
  textModel: z.string().min(1).optional(),

  // Skill selection
  draftSkillId: z.string().min(1).optional(),
  articleSkillId: z.string().min(1).optional(),
  useCustomArticle: z.boolean().default(false),
  customArticleText: z.string().min(1).max(20_000).optional(),

  // Media
  hideTextOnSlides: z.boolean().default(false),
  imageSkillId: z.string().min(1).optional(),
  imageModel: z.string().min(1).optional(),
  generateAudio: z.boolean().default(false),
  audioModel: z.string().min(1).optional(),
  canvasWidth: z.number().int().positive().max(10_000).optional(),
  canvasHeight: z.number().int().positive().max(10_000).optional(),

  // Context & options
  imagePromptContext: z.string().max(1000).optional(),
  referenceImageUrls: z.array(referenceImageUrlSchema).max(5).optional(),
  mediaModelExtraParams: z.record(z.string(), z.any()).optional(),
  audioModelExtraParams: z.record(z.string(), z.any()).optional(),

  // Style & layout
  stylePresetId: z.enum(AI_STYLE_PRESET_IDS).default("dark-professional"),
  headerCustomText: z.string().max(200).optional(),
  footerCustomText: z.string().max(200).optional(),
  styleOverrides: z.object({...}).optional(),
  watermark: AIWatermarkSchema.optional(),

  // Skill-specific params
  draftSkillParams: z.record(z.string(), z.any()).optional(),
  articleSkillParams: z.record(z.string(), z.any()).optional(),
  mediaSkillParams: z.record(z.string(), z.any()).optional(),
});

type GenerateAIDraftInput = z.infer<typeof GenerateAIDraftInputSchema>;
```

**Mutation Handler** (lines 394–482):

```typescript
generateDraft: protectedProcedure
  .use(createRateLimitMiddleware({ namespace: "ai-draft-gen", limit: 5, windowMs: 60_000 }))
  .input(GenerateAIDraftInputSchema)
  .mutation(async ({ input, ctx }) => {
    try {
      ensureFeatureEnabled();
      ensureAIGenerationEnabled();

      const actor = toPresentationActor(ctx);
      const userToken = getPresentationToken(ctx, ["media:generate"]);
      const redis = getRedisClient();
      const taskId = crypto.randomUUID();

      // Acquire per-user lock
      const lockResult = await redis.set(lockKey, taskId, "EX", 300, "NX");
      if (lockResult === null) {
        const existingTaskId = await redis.get(lockKey);
        if (existingTaskId) {
          return { taskId: existingTaskId, alreadyInProgress: true };  // Resume existing
        }
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "AI draft already in progress for this user",
        });
      }

      // Initialize progress tracking
      const initialProgress = {
        userId: actor.userId,
        phase: 0,
        phaseLabel: "Starting...",
        slidesCompleted: 0,
        totalSlides: input.numSlides,
        slidePreview: [],
        completed: false,
        updatedAt: new Date().toISOString(),
      };
      await redis.set(`ai_draft_progress:${taskId}`, JSON.stringify(initialProgress), "EX", 300);

      // **FIRE-AND-FORGET**: Start generation in background
      generateAIDraft(input, actor, userToken, taskId).catch(async (err) => {
        // Error handling → persist error to Redis
      });

      return { taskId, alreadyInProgress: false };
    } catch (err) {
      // ...
    }
  }),
```

### 3C. Backend Service: generateAIDraft Function

**Location**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationService.ts`, lines 10,200–12,950

**Function Signature**:
```typescript
export async function generateAIDraft(
  input: GenerateAIDraftInput,
  actor: PresentationActor,
  userToken: string,
  taskId: string,
): Promise<void>
```

**Key Variables** (lines 10,250–10,260):
```typescript
const redis = getRedisClient();
const progressKey = `ai_draft_progress:${taskId}`;
const lockKey = `ai_draft_lock:${actor.userId}`;
const cancelKey = `ai_draft_cancel:${taskId}`;
const warnings: string[] = [];

// **KEY: Extract requested text model from input**
const requestedTextModel = input.textModel?.trim() || undefined;

let latestProgress: (AIDraftProgress & { userId: number }) | null = null;
```

---

## 4. LLM Model Selection System

### 4A. Two-Phase Model Selection

The AI draft generation has **TWO** distinct LLM model selection points:

#### Phase 1: Article Generation (Planning + Structure) — lines 10,500–10,650

For creating the slide outline and content structure from the article:

```typescript
// Phase 1 resolver
const textModel = resolveTextModelForArticleGeneration({
  requestedModel: requestedTextModel,
  skillId: primaryDraftSkillId,
  defaultFallback: await resolveDefaultTextModel(),
});
```

**Called at line 10,522**:
```typescript
const plannerResult = await runPlanner({
  sourceType: "presentation",
  userId: actor.userId,
  tenantId: actor.tenantId,
  conversationModel: await resolveDefaultTextModel(),
  skillSlug: "ai-presentation",
}).catch(() => null);
```

**Later (line 12,930)**:
```typescript
const textModel = await resolveDefaultTextModel();
```

**Used in structured LLM call (line 12,936)**:
```typescript
let aiSlide: AIPresentationSlide;
try {
  aiSlide = await callLLMStructured({
    systemPrompt,
    userMessage,
    model: textModel,  // <-- Here
    zodSchema: AIPresentationSlideSchema,
    userId: actor.userId,
  });
```

#### Phase 2: Media Generation — Lines 10,650+

For each slide's media (image/video), the system uses:
- `imageModel` parameter from UI (optional)
- Falls back to media model selection via `skillExecutor.ts`
- Media models are NOT LLM models — they're image/video generation models

### 4B. resolveDefaultTextModel() Function

**Location**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationService.ts`, lines 282–320

```typescript
// Cache with 60-second TTL
let _cachedDefaultTextModel: { modelId: string; ts: number } | null = null;
const DEFAULT_TEXT_MODEL_CACHE_TTL_MS = 60_000;
const LAST_RESORT_MODEL = "gpt-4o-mini";

async function resolveDefaultTextModel(): Promise<string> {
  const now = Date.now();

  // Return cached value if fresh
  if (_cachedDefaultTextModel && now - _cachedDefaultTextModel.ts < DEFAULT_TEXT_MODEL_CACHE_TTL_MS) {
    return _cachedDefaultTextModel.modelId;
  }

  try {
    // Query DB for system-wide default text model
    const db = await getDb();
    const [row] = await db
      .select({ modelId: llmModels.id })
      .from(llmModels)
      .where(
        and(
          eq(llmModels.enabled, true),
          eq(llmModels.isDefaultTextModel, true),
        )
      )
      .limit(1);

    const modelId = row?.modelId ?? LAST_RESORT_MODEL;
    _cachedDefaultTextModel = { modelId, ts: now };
    return modelId;
  } catch (err) {
    console.error("[resolveDefaultTextModel] DB query failed, using fallback:", err);
    return LAST_RESORT_MODEL;
  }
}
```

### 4C. Model Selection Override via textModel Parameter

The UI can pass an explicit `textModel` to override the default:

**Flow**:
1. UI collects `textModel` (optional, currently not exposed in UI) → sent in tRPC input
2. Backend checks `requestedTextModel = input.textModel?.trim()`
3. If provided and available, uses it; otherwise falls back to `resolveDefaultTextModel()`

**Current Status**: The `textModel` field exists in the schema but is **NOT currently surfaced in the AIDraftModal UI**. This means users cannot explicitly select a text model for article/slide generation through the UI.

---

## 5. Skill Execution Model Selection (for Article Skills)

When using the "Use Your Own Article" feature, the article generation skill is executed via `chat.executeSkill`, which has its own model selection logic.

### 5A. chat.executeSkill Mutation

**Location**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/chat.ts`, lines 1292–1650

**Input Schema** (lines 1293–1314):
```typescript
z.object({
  skillId: z.string().min(1).max(50),
  prompt: z.string().max(5000).optional(),
  model: z.string().max(50).optional(),  // <-- Optional model override
  aspectRatio: skillAspectRatioSchema.optional(),
  numImages: z.number().min(1).max(4).optional(),
  duration: z.number().min(1).max(60).optional(),
  voice: skillVoiceSchema.optional(),
  quality: skillQualitySchema.optional(),
  style: skillStyleSchema.optional(),
  conversationId: z.number().optional(),
  referenceImageUrls: z.array(z.string().min(1)).max(5).optional(),
  referenceStyleUrl: z.string().min(1).optional(),
  resolution: z.string().max(10).optional(),
  apiConfig: z.record(z.string()).optional(),
  extraParams: z.record(z.any()).optional(),
  dynamicParams: z.record(z.any()).optional(),  // <-- Form inputs
})
```

**Note**: The UI's `handleGenerateArticle` does NOT pass a `model` parameter, so skill model selection falls through to the execution policy system.

### 5B. Skill Execution Policy Resolution

**Location**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/skillExecutionPolicy.ts`, lines 116–250

**Function Signature**:
```typescript
export async function resolveSkillExecutionPolicy(
  input: SkillExecutionPolicyInput,
): Promise<SkillExecutionPolicyResult>

interface SkillExecutionPolicyInput {
  skill: SkillDefinition;
  conversationModel?: string | null;
}

interface SkillExecutionPolicyResult {
  modelId: string | null;
  preferredProviderId?: number;
  strictProviderPin?: boolean;
  modelSource:
    | "skill_llmModelId"           // Skill's custom model
    | "skill_defaultModel"          // Skill's fallback
    | "conversation"                // User's active conversation model
    | "system_default"              // System-wide default
    | "requirements_match"          // Capability-based selection
    | "skill_fixedModel";
  matchedCapabilities?: string[];
  requirementsFallback?: boolean;
}
```

**Resolution Cascade** (lines 141–200):

```
if (mode === "fixed")
  → Use skill.llmModelId OR skill.defaultModel OR conversation model OR system default
else if (mode === "hybrid" && policy.fixedModel)
  → Try skill.fixedModel first
  → Fall back to requirements matching
  → Fall back to legacy cascade
else if (mode === "requirements" OR hasReqs)
  → Use selectBestLlmModel() with skill capabilities
  → Fall back to legacy cascade if no match
else
  → Use legacy cascade: llmModelId → defaultModel → conversation → system_default
```

---

## 6. Progress Tracking

### 6A. Query: presentation.ai.getDraftProgress

**Location**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/presentation.ts`, lines TBD

Called every 2 seconds (line 826) while generation is active:

```typescript
const progressQuery = trpc.presentation.ai.getDraftProgress.useQuery(
  { taskId: taskId! },
  {
    enabled: isOpen && taskId !== null && !completed,
    refetchInterval: 2000,
  }
);
```

**Progress Data Structure** (lines 117–141):

```typescript
type DraftProgressStatus = {
  phase: number;                    // 0-7
  phaseLabel: string;               // "Article Generation", "Slide Planning", etc.
  phaseDetail?: string;             // Additional context
  slidesCompleted: number;
  totalSlides: number;
  slidePreview: Array<{ title: string; imageStatus: string }>;
  completed: boolean;
  updatedAt?: string;               // ISO timestamp
  workerActive?: boolean;           // Is a worker processing this task
  diagnostics?: {
    taskId: string;
    operation?: string;             // "planning", "media_gen", etc.
    model?: string;                 // Which LLM model was used
    recipeId?: string;
    compactionLevel?: "balanced" | "compact" | "aggressive";
    attempt?: number;
    maxAttempts?: number;
    startedAt?: string;
    deadlineAt?: string;
  };
  cancelled?: boolean;
  error?: { code: string; message: string };
  result?: {
    slidesAdded: number;
    newDeckVersion: number;
    articlePreview: string;
    warnings: string[];
  };
};
```

### 6B. Progress Storage

Stored in Redis with 5-minute expiry:
```
Key: ai_draft_progress:{taskId}
TTL: 300 seconds
Value: JSON serialized DraftProgressStatus
```

---

## 7. Available Models & Queries

### 7A. Media Models (Image/Video/Audio)

**Query**: `trpc.media.getModels.useQuery({ type: "image" | "video" | "audio" })`

**Used in AIDraftModal** (lines 625–691):

```typescript
// Image/video models
const mediaModelsQuery = trpc.media.getModels.useQuery(
  { type: mediaModelType },  // Derived from selectedImageSkill
  { staleTime: 300_000 }
);
const mediaModels = (mediaModelsQuery.data?.models ?? []) as MediaModelOption[];
const compatibleMediaModels = mediaModelType === "video"
  ? mediaModels.filter(isTextToVideoModel)
  : mediaModels.filter(isTextToImageModel);
const defaultMediaModelId = mediaModelType === "video"
  ? mediaModelsQuery.data?.defaults?.video
  : mediaModelsQuery.data?.defaults?.image;

// Audio models
const audioModelsQuery = trpc.media.getModels.useQuery(
  { type: "audio" },
  { staleTime: 300_000 }
);
const audioModels = (audioModelsQuery.data?.models ?? []) as MediaModelOption[];
const defaultAudioModelId = audioModelsQuery.data?.defaults?.audio || audioModels[0]?.id || "";
```

**MediaModelOption Type** (from context):
```typescript
interface MediaModelOption {
  id: string;
  name: string;
  provider?: string;
  supportedAspectRatios?: string[];
  inputFields?: Array<{ id: string; type: string; ... }>;
  // ... other fields
}
```

### 7B. Text Models (LLM for Article Generation)

**Query**: NO DIRECT QUERY in AIDraftModal

The text model for article generation is determined server-side:
1. From `input.textModel` parameter (if provided)
2. From `resolveDefaultTextModel()` query against database
3. Falls back to `"gpt-4o-mini"` if DB unavailable

**Available LLM Models** are configured in the database (`llmModels` table) and queried by `enabledLlmModels` service.

---

## 8. Code Location Reference Table

| Purpose | File | Lines | Key Symbol |
|---------|------|-------|-----------|
| **AIDraftModal Component** | client/src/components/presentation/AIDraftModal.tsx | 1–1900 | `AIDraftModal` |
| **Generate Handler** | client/src/components/presentation/AIDraftModal.tsx | 1317–1477 | `handleGenerate` |
| **Article Skill Executor** | client/src/components/presentation/AIDraftModal.tsx | 793–819 | `handleGenerateArticle` |
| **Model Selection (UI)** | client/src/components/presentation/AIDraftModal.tsx | 625–691 | `mediaModelsQuery`, `audioModelsQuery` |
| **tRPC Input Schema** | shared/presentation/aiTypes.ts | 198–242 | `GenerateAIDraftInputSchema` |
| **tRPC Mutation** | server/routers/presentation.ts | 393–482 | `generateDraft: protectedProcedure` |
| **Main Service** | server/services/aiPresentationService.ts | 10,200–12,950 | `generateAIDraft()` |
| **Text Model Resolution** | server/services/aiPresentationService.ts | 282–320 | `resolveDefaultTextModel()` |
| **Skill Execution Policy** | server/services/skillExecutionPolicy.ts | 116–250 | `resolveSkillExecutionPolicy()` |
| **Skill Router** | server/routers/chat.ts | 1292–1650 | `executeSkill: protectedProcedure` |
| **Progress Type Definition** | server/routers/presentation.ts | 117–141 | `DraftProgressStatus` |

---

## 9. Model Selection Examples

### Example 1: Default Flow (No Model Overrides)

```
User → AIDraftModal.tsx
  ├─ No textModel passed
  ├─ No imageModel selected → uses system default
  └─ No audioModel selected → uses system default

↓

presentation.ai.generateDraft tRPC mutation
  └─ input: {
       ...,
       textModel: undefined,           // Not provided
       imageModel: undefined,          // Not provided
       audioModel: undefined,          // Not provided
     }

↓

aiPresentationService.generateAIDraft()
  ├─ requestedTextModel = undefined
  └─ Calls resolveDefaultTextModel()
      └─ Returns cached or DB-queried "gpt-4o-mini" (or configured default)

↓

skill.executeSkill (for article skills)
  └─ input.model: undefined
  └─ Calls resolveSkillExecutionPolicy(skill, conversationModel)
      └─ Returns skill's llmModelId or system default
```

### Example 2: With Image Model Selection

```
User → AIDraftModal.tsx
  ├─ Selects imageModel: "fal-ai/flux-pro"
  └─ Sets generateAudio: true, audioModel: "uvoice/tts-premium"

↓

presentation.ai.generateDraft
  └─ input: {
       ...,
       imageModel: "fal-ai/flux-pro",
       audioModel: "uvoice/tts-premium",
       mediaSkillParams: { ... },
     }

↓

aiPresentationService.generateAIDraft()
  ├─ For image generation:
  │  └─ Uses input.imageModel directly (no model resolution needed)
  │
  └─ For audio generation:
     └─ Uses input.audioModel directly (no model resolution needed)
```

### Example 3: Article Generation with "Use Your Own Article"

```
User → AIDraftModal.tsx
  ├─ Toggles "Use Your Own Article"
  ├─ Selects articleGenSkill: "professional-article-writer"
  ├─ Fills in articleGenParams: { tone: "formal", length: "detailed" }
  └─ Clicks "Generate Article"

↓

handleGenerateArticle() calls:
  executeSkillMutation.mutateAsync({
    skillId: "professional-article-writer",
    prompt: topic,
    dynamicParams: { tone: "formal", length: "detailed" },
    referenceImageUrls: [...],
  })

↓

chat.executeSkill tRPC mutation
  └─ Calls resolveSkillExecutionPolicy({
       skill: skillDefinition,
       conversationModel: ctx.conversation?.model,
     })
  └─ Returns modelId based on skill's execution policy
  └─ Executes LLM with that model
  └─ Returns generated article

↓

UI displays result in customArticleText
  └─ User then submits presentation with custom article
```

---

## 10. Known Gaps & Opportunities

### Gaps

1. **No Text Model Selector in UI**: The `textModel` parameter exists in the schema but is not exposed in AIDraftModal. Users cannot override the text model for article/slide generation.

2. **No Model Source Visibility**: Users don't see which model was actually used (whether it was the default, skill's custom model, or capability-matched model).

3. **No Skill Requirements UI**: There's no way for users to understand why a particular model was chosen for skill execution (based on requirements like web search, structured output, etc.).

### Opportunities

1. **Add Text Model Selector**: Could expose `textModel` selector in AIDraftModal for advanced users (similar to image/audio model pickers).

2. **Display Model Info in Progress**: Add model name to diagnostics displayed during generation so users can see which LLM was used for each phase.

3. **Skill Requirements Explainer**: Show users what capabilities (web search, structured output, etc.) a skill requires, and which model will be used.

4. **Model Cost Estimation**: Display estimated token usage and cost before starting generation (based on selected model and slide count).

---

## 11. Important Implementation Notes

### Thread Safety
- Redis locking per user prevents concurrent AI drafts
- Lock TTL: 300 seconds
- Existing task resumption supported (returns taskId if already in progress)

### State Persistence
- localStorage persists skill + model selections between sessions
- Skill schemas fetched fresh each session (staleTime: 300s)
- Media models cached 5 minutes

### Error Handling
- All errors caught in fire-and-forget, persisted to Redis progress
- Stalled detection: 60-second inactivity threshold
- Worker tracking: `progress.workerActive` flag

### Performance
- Skill schemas fetched only when form rendered
- Progress polling: 2-second interval (user-configurable via refetchInterval)
- Default text model cached 60 seconds in-memory
- Media models cached 5 minutes in TanStack Query

---

## 12. Summary Table: Model Selection by Context

| Context | Model Selection | Source | User Override | Code Location |
|---------|---|---|---|---|
| **Article Generation Phase** | Via `resolveDefaultTextModel()` | DB query (cached 60s) or "gpt-4o-mini" | Via `textModel` param (not exposed in UI) | aiPresentationService.ts:282–320 |
| **Slide Structuring Phase** | Via `callLLMStructured()` | Same as above | N/A (inherits from phase 1) | aiPresentationService.ts:12,930–12,940 |
| **Article Skill (Use Your Own)** | Via `resolveSkillExecutionPolicy()` | Skill config + capability matching | Via conversation model or skill's llmModelId | skillExecutionPolicy.ts:116–250 |
| **Image Generation** | From UI `imageModel` | User selection or system default | Direct selection in UI (ImageModelCombobox) | AIDraftModal.tsx:625–635 |
| **Audio Generation** | From UI `audioModel` | User selection or system default | Direct selection in UI (combobox) | AIDraftModal.tsx:652–668 |
| **Media Skill (image/video)** | Via `skillExecutor.ts` | Skill definition + registry | Skill's default or media model selection logic | skillExecutor.ts (external) |

---

**End of Research Brief**
