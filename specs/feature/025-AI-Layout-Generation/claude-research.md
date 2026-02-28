# Codebase Research: Feature 025 — AI Presentation Layout Auto-Generation

## 1. Skill Execution System

**Core function:** `executeSkill()` in `apps/web/server/services/skillExecutor.ts`

```typescript
export async function executeSkill(
  skill: SkillDefinition,
  params: SkillExecutionParams,
  userId: number,
  userToken: string
): Promise<SkillExecutionResult>
```

**Execution Modes:** `python`, `llm-only`, `enhance-prompt`, `image-generation`, `video-generation`, `audio-generation`

**SkillExecutionParams:**
```typescript
{
  prompt: string;
  conversationId?: string;
  context?: Record<string, unknown>;
  model?: string;
  aspectRatio?: string;
  quality?: string;
  style?: string;
  numImages?: number;
  duration?: number;
  voice?: string;
  referenceImageUrls?: string[];
  referenceStyleUrl?: string;
  apiConfig?: Record<string, string>;
  extraParams?: Record<string, any>;
  publicUrl?: string;
}
```

**SkillExecutionResult:**
```typescript
{
  success: boolean;
  skillId: string;
  type: "image" | "video" | "audio" | "text" | "action";
  data?: MediaGenerationResponse;
  resultUrl?: string;
  resultUrls?: string[];
  message?: string;
  error?: string;
  creditsUsed?: number;
  taskId?: string;
  isAsync?: boolean;
  _action?: SkillCreateAction;
}
```

**Skill Loading:** `skillRegistry.ts` loads `skill.md` from `apps/web/skills/*/`, parses YAML frontmatter.

**Rate Limiting:** In-memory per user per skill type (image=10/min, video=15/min, default=20/min).

**Credit Deduction:** `hasEnoughCredits()` before execution, `deductCredits()` after. Uses `creditService.ts`.

---

## 2. Media Generation System

**Location:** `apps/web/server/services/mediaGenerationService.ts`

**Image Models (MEDIA_MODELS):**
- `flux-2.0` → kie.ai, creditCost: 8 (default in Media Studio)
- `google-nano-banana-pro` → kie.ai, creditCost: 10
- `seedream-4-5-251128` → byteplus_modelark, creditCost: 15

**Provider Routing:** Kie.ai (primary) → BytePlus ModelArk → Fal.ai (fallback)

**Flow:** tRPC → mediaGenerationService → BullMQ/Python backend → External provider API

---

## 3. Presentation Canvas System

**Schema:** `apps/web/shared/presentation/contracts.ts`

```typescript
presentationSlideContentSchema = z.object({
  elements: z.array(presentationSlideElementSchema).max(250),
  canvas: presentationCanvasSizeSchema.optional(),
  transition: presentationTransitionSchema.optional(),
  durationMs: z.number().min(250).max(120_000).optional(),
}).strict();
```

**Element types:** `text`, `image`, `video`, `rect`, `line`
- text: color, fontSize, fontFamily, fontWeight, fontStyle, textAlign, lineHeight, backgroundColor, textShadow, textStroke
- image: src, alt, svgContent, svgColor
- rect: fill, stroke, strokeWidth
- line: stroke, strokeWidth

**Canvas presets:** "16:9", "9:16", "4:3", "3:4", "4:5", "5:4", "1:1", max 10000x10000

**Adding slides:** `addSlideToDeck(input, actor)` via `addSlide` protectedProcedure with `expectedVersion` optimistic locking.

---

## 4. Presentation Router

**Location:** `apps/web/server/routers/presentation.ts`

**Auth:** `protectedProcedure` → provides `ctx.user` + `ctx.tenantId`

**Actor model:**
```typescript
function toPresentationActor(ctx): PresentationActor {
  return { userId: ctx.user.id, tenantId: resolvePresentationTenantId(ctx), role: ctx.user.role };
}
```

**Error pattern:** `PresentationServiceError` → `mapPresentationServiceError()` → `TRPCError`

**Feature flag guard:** `ensureFeatureEnabled()` at top of each procedure.

---

## 5. Testing Setup

**Framework:** Vitest

**Mock pattern:**
```typescript
const dbMocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../db", () => ({ getDb: dbMocks.getDb }));
```

**Service testing:** Mock dependencies via `vi.mock()`, assert with `expect().rejects.toSatisfy()`

**Commands:** `pnpm test`, `pnpm vitest run <file>`, `pnpm test:coverage`

---

## 6. LLM Gateway

**Provider resolution:** `getProviderForModel(modelId)` → returns `ProviderCandidate` with baseUrl + apiKey + model mapping.

**No dedicated Node.js structured JSON function exists.** LLM calls go through OpenAI-compatible gateway or Python backend.

**Credit tracking:** `calculateCreditsForLLM()` → `hasEnoughCredits()` → `deductCredits()`

---

## 7. Audit Logging

**Location:** `apps/web/server/services/auditLogger.ts`

**Event types:** `llm_request`, `llm_response`, `media_request`, `media_response`, `skill_detect`, `skill_execute`, `error`

**JSONL format:** `apps/web/logs/audit/audit-YYYY-MM-DD.jsonl`

**Sanitization:** Strips API keys, truncates large payloads (500 chars), max 32KB per entry.

---

## 8. Feature Flags

**Pattern:**
```typescript
export const PRESENTATION_FEATURE_FLAG_ENV = "PRESENTATION_EDITOR_ENABLED";
export function isPresentationFeatureEnabled(): boolean {
  const raw = (process.env[PRESENTATION_FEATURE_FLAG_ENV] || "").trim().toLowerCase();
  if (!raw) return true;  // Default: enabled
  return !["0", "false", "off", "no", "disabled"].includes(raw);
}
```

**Error codes:** `PRESENTATION_ERROR_CODE` object in `constants.ts`, mapped via `mapPresentationServiceError()`.

**Limits:**
```typescript
PRESENTATION_LIMITS = {
  maxSlidesPerDeck: 200,
  maxAssetsPerDeck: 500,
  maxElementsPerSlide: 250,
  maxSlideContentBytes: 256 * 1024,
}
```
