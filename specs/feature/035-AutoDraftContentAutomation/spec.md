# 035 — Auto Draft & Content Automation Engine

Version: 1.0
Date: 2026-03-10
Status: Proposed
Audience: Product, Architecture, Backend (Node + Python), Frontend
Depends on: Spec 034 (AgencyResultEnvelope, ResultRouter, Artifact Tracking, builtin-skill-discovery)

---

## 1. Executive summary

Feature นี้เปลี่ยน "Draft with AI" จากระบบที่ต้องเลือก 13+ options ด้วยมือ ให้เป็น **fully automatic** — ผู้ใช้พิมพ์ brief เดียว ระบบเลือก skill, model, style, และสร้าง presentation ให้อัตโนมัติ แล้วขยายต่อเป็น **Content Automation Engine** ที่สร้าง slides/videos เป็น batch ตาม spec file ที่กำหนดไว้ล่วงหน้า

**3 ระดับของ feature:**

1. **Level 1 — Auto Draft Agent**: AgencySwarm agent ที่เลือก options ทั้งหมดแทน user → เรียก Draft pipeline เดิม → ได้ presentation ทันที
2. **Level 2 — Multi-Source Input**: รองรับ input จากไฟล์ (CSV, Excel, Text), chat triggers, scheduled commands (พรุ่งนี้ 8 โมง สร้าง slide เรื่อง X)
3. **Level 3 — Content Automation Engine**: Spec file → batch production (1-10 slides/videos ต่อวัน) → notification → future: auto-post to social media

### Relationship to Spec 034

| Concern | Spec 034 | Spec 035 (this) |
|---------|----------|-----------------|
| AgencyResultEnvelope + Parser | **Defines** schema + parser | **Uses** (no changes) |
| ResultRouter | **Defines** routing rules | **Uses** + adds `auto_draft` routing |
| Artifact tracking | **Defines** tables + lifecycle | **Uses** (no changes) |
| `builtin-skill-discovery` | **Defines** tool | **Uses** for auto skill selection |
| `builtin-presentation-create` | **Defines** tool (slide-by-slide) | **Does NOT use** — uses `builtin-auto-draft` instead (calls full pipeline) |
| Deck Builder Agent | **Defines** (content → slides only) | **Replaces** for auto mode (content → slides + media + audio) |
| Workflow integration | **Defines** AgencyExecutor envelope | **Extends** with Content Automation Engine |
| Content Automation Engine | Not covered | **Defines** (spec file, batch, schedule, notification) |

---

## 2. Background

### 2.1 Current Draft with AI — Manual Selection Points

`AIDraftModal.tsx` requires user to manually select:

| # | Option | Type | Impact |
|---|--------|------|--------|
| 1 | Topic / Article text | Text input | Must provide |
| 2 | Article Skill | Dropdown (~10+ skills) | Determines content quality |
| 3 | Skill Parameters (tone, length, etc.) | Dynamic form | Varies per skill |
| 4 | Slide Count (1-30) | Slider | Affects time + cost |
| 5 | Language (auto/en/th) | Dropdown | Already has "auto" |
| 6 | Style Preset (7 options) | Dropdown | Visual theme |
| 7 | Image/Video Model | Combobox | Cost vs quality |
| 8 | Media Skill (prompt engineer) | Dropdown | Prompt quality |
| 9 | Media Skill Params | Dynamic form | Varies per skill |
| 10 | Canvas Size / Aspect Ratio | Dropdown | Output dimensions |
| 11 | Audio toggle + model | Switch + dropdown | TTS narration |
| 12 | Header/Footer | Toggles + text | Branding |
| 13 | Watermark | Toggle + image select | Branding |
| 14 | Reference Images | Upload/select (0-5) | Visual guidance |

**Problem**: แม้ pipeline จะใช้ LLM สร้างเนื้อหาอัตโนมัติ แต่ user ต้องเลือก options 12+ อย่างก่อนกด Generate — ไม่ใช่ "auto" จริง

### 2.2 Existing Draft Pipeline (7 Phases)

```
Phase 1: Article generation (skill + LLM)
Phase 2: Slide planning (LLM splits content → AIPresentationSlide[])
Phase 3: Media generation (image/video per slide, parallel)
Phase 4: Layout engine (template → positioned elements)
Phase 5: Add slides to deck (DB)
Phase 6: Audio generation (optional TTS, parallel)
Phase 7: Finalization (metadata, cleanup, notify)
```

Key files:
- Frontend: `apps/web/client/src/components/presentation/AIDraftModal.tsx`
- Backend: `apps/web/server/services/aiPresentationService.ts` (4000+ lines, `generateAIDraft()`)
- Layout: `apps/web/server/services/aiPresentationLayoutEngine.ts`
- Types: `apps/web/shared/presentation/aiTypes.ts`
- Router: `apps/web/server/routers/presentation.ts` (lines 269-355)

### 2.3 Existing Infrastructure to Reuse

| Component | Current State | Reuse in 035 |
|-----------|--------------|-------------|
| `generateAIDraft()` | Full 7-phase pipeline | **Wrap as tool** — don't rewrite |
| AgencySwarm | Agent orchestration + tools | Auto Draft Agent runs here |
| `builtin-skill-discovery` (034) | Skill search + ranking | Agent selects best skills |
| Workflow Engine | 57+ node types + cron schedule | Content Automation scheduling |
| Presentation Export | PNG/JPG/PDF/MP4 via Celery | Batch export for content automation |
| Celery Workers | Async task processing | Batch content generation |
| `emailService.ts` | Email delivery | Notification when batch complete |

---

## 3. Problem statement

1. **Draft with AI ไม่ auto จริง** — User ต้องเลือก 12+ options → friction สูง → ใช้งานได้ไม่เต็มศักยภาพ
2. **ไม่มี batch production** — ต้องสร้างทีละ 1 presentation → ไม่เหมาะกับ content creator ที่ต้องการ 1-10 ชิ้น/วัน
3. **ไม่มี scheduled content** — ไม่สามารถกำหนดล่วงหน้าว่า "ทุกวัน 8 โมง สร้าง slide 1 ชิ้นเรื่อง X" → ต้องมานั่งสร้างเอง
4. **ไม่มี spec-driven automation** — Content creators ที่โพสทุกวัน ต้องการ "วางแผนเนื้อหา 1 เดือน → ระบบสร้างให้อัตโนมัติ"

---

## 4. Goals

1. สร้าง **Auto Draft Agent** ที่รับ brief เดียว → เลือก skill/model/style/params ทั้งหมดอัตโนมัติ → เรียก generateAIDraft() pipeline เดิม
2. รองรับ **Multi-Source Input**: text, file upload (CSV/Excel/Text), chat command, scheduled trigger
3. สร้าง **Content Automation Engine** ที่ user เขียน Content Spec → ระบบสร้าง slides/videos แบบ batch ตามกำหนดเวลา
4. **Notification** เมื่อ batch เสร็จ (email, in-app, webhook)
5. รองรับ **output หลายรูปแบบ**: presentation deck (editable), PNG slide images, MP4 video
6. ออกแบบ architecture ที่ **future-proof** สำหรับ auto-post to social media

---

## 5. Non-goals

1. ไม่ implement social media posting ใน Phase 1-2 (design API contract เท่านั้น)
2. ไม่แก้ Draft pipeline เดิม (wrap as tool, ไม่ rewrite)
3. ไม่สร้าง UI ใหม่สำหรับ AIDraftModal — เพิ่ม "Auto" toggle แทน
4. ไม่สร้าง vector DB ใหม่ (reuse existing)
5. ไม่สร้าง file parsing library ใหม่ — ใช้ existing libraries (Papa Parse, SheetJS)

---

## 6. Architecture overview

### 6.1 Three-level architecture

```
Level 1: Auto Draft Agent
──────────────────────────
  User brief → Agent (skill discovery + option selection) → builtin-auto-draft tool
  → generateAIDraft() pipeline (unchanged) → presentation deck

Level 2: Multi-Source Input
──────────────────────────
  Sources:    [Text]  [File: CSV/Excel/Text]  [Chat command]  [Scheduled trigger]
                │            │                       │                │
                └────────────┴───────────────────────┴────────────────┘
                                        │
                                  InputResolver
                                        │
                              ┌─────────┴─────────┐
                              │ Auto Draft Agent   │
                              │ (per item/row)     │
                              └─────────┬──────────┘
                                        │
                              Presentation deck(s)

Level 3: Content Automation Engine
──────────────────────────────────
  Content Spec (JSON/YAML) → ContentAutomationScheduler → Celery beat
       │                              │
       │  ┌──────────────────────────┐│
       │  │ Daily/hourly triggers    ││
       │  └──────────┬───────────────┘│
       │             │                │
       │    InputResolver (pick next topic from spec)
       │             │
       │    Auto Draft Agent (or direct pipeline call)
       │             │
       │    ┌────────┴────────┐
       │    │ Post-processing │
       │    │ • Export PNG    │
       │    │ • Export MP4    │
       │    │ • Package files │
       │    └────────┬────────┘
       │             │
       │    Notification (email/webhook/in-app)
       │             │
       │    [Future: Social Media Posting API]
       │             │
       │    ContentAutomationLog (audit trail)
       └─────────────────────────────────────
```

### 6.2 Component diagram

```
┌────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ AIDraftModal │  │ Agency Chat  │  │ Content Auto  │ │
│  │ [Manual|Auto]│  │ (chat cmds)  │  │ Dashboard     │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬────────┘ │
└─────────┼──────────────────┼─────────────────┼──────────┘
          │                  │                 │
┌─────────┼──────────────────┼─────────────────┼──────────┐
│         ▼                  ▼                 ▼          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Node.js Backend (Express/tRPC)       │   │
│  │  ┌────────────────────────────────────────────┐  │   │
│  │  │ /api/internal/tools/auto-draft    [NEW]    │  │   │
│  │  │ /api/internal/tools/model-suggest  [NEW]   │  │   │
│  │  │ /api/internal/tools/file-parse    [NEW]    │  │   │
│  │  ├────────────────────────────────────────────┤  │   │
│  │  │ generateAIDraft() [EXISTING - no change]   │  │   │
│  │  │ presentationExport [EXISTING]              │  │   │
│  │  │ skillRegistry [EXISTING]                   │  │   │
│  │  └────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                              │
│  ┌───────────────────────┼──────────────────────────┐   │
│  │        Python Backend (FastAPI + Celery)          │   │
│  │  ┌────────────────────────────────────────────┐  │   │
│  │  │ Auto Draft Agent (AgencySwarm)             │  │   │
│  │  │  + builtin-auto-draft                      │  │   │
│  │  │  + builtin-skill-discovery (from 034)      │  │   │
│  │  │  + builtin-model-suggest                   │  │   │
│  │  │  + builtin-rag-knowledge                   │  │   │
│  │  ├────────────────────────────────────────────┤  │   │
│  │  │ ContentAutomationEngine         [NEW]      │  │   │
│  │  │  + ContentSpecParser                       │  │   │
│  │  │  + InputResolver (file/topic/schedule)     │  │   │
│  │  │  + BatchOrchestrator                       │  │   │
│  │  │  + ExportPostProcessor                     │  │   │
│  │  │  + NotificationDispatcher                  │  │   │
│  │  ├────────────────────────────────────────────┤  │   │
│  │  │ Celery Tasks                               │  │   │
│  │  │  + content_automation_batch_task   [NEW]   │  │   │
│  │  │  + content_export_task             [NEW]   │  │   │
│  │  │  + render_presentation [EXISTING]          │  │   │
│  │  └────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 7. Level 1: Auto Draft Agent

### 7.1 New builtin tool: `builtin-auto-draft`

#### Purpose

Thin wrapper ที่ให้ AgencySwarm agent เรียก `generateAIDraft()` pipeline เดิมทั้งหมด — รวม article generation, media generation, layout, audio

#### Tool registration

```python
# python-backend/app/services/agency_tools.py
_BUILTIN_ENDPOINTS["builtin-auto-draft"] = "/api/internal/tools/auto-draft"
_BUILTIN_RISK_LEVELS["builtin-auto-draft"] = "medium"
```

#### Request contract

```python
class AutoDraftRequest(BaseModel):
    """Agent sends this to create a full presentation via Draft pipeline."""
    # Content
    topic: str = Field(..., min_length=3, max_length=1000)
    custom_article_text: str | None = Field(None, max_length=20000)
    use_custom_article: bool = False

    # Skills (agent selects via builtin-skill-discovery)
    article_skill_slug: str | None = None      # e.g. "business-article-writer"
    article_skill_params: dict = Field(default_factory=dict)
    media_skill_slug: str | None = None        # e.g. "video-prompt-engineer"
    media_skill_params: dict = Field(default_factory=dict)

    # Generation options (agent decides)
    num_slides: int = Field(8, ge=1, le=30)
    language: str = "auto"                      # "auto" | "en" | "th"
    style_preset_id: str = "dark-professional"  # from AI_STYLE_PRESET_IDS
    image_model_id: str | None = None           # agent picks via builtin-model-suggest
    audio_model_id: str | None = None           # None = no audio
    generate_audio: bool = False
    canvas_preset: str = "16:9"                 # aspect ratio → mapped to canvasWidth/Height

    # Canvas preset mapping (handler translates to pixel values):
    # "16:9"  → canvasWidth=1920, canvasHeight=1080
    # "4:3"   → canvasWidth=1440, canvasHeight=1080
    # "1:1"   → canvasWidth=1080, canvasHeight=1080
    # "9:16"  → canvasWidth=1080, canvasHeight=1920 (vertical/mobile)
    # Reuse CANVAS_PRESETS from AIDraftModal.tsx

    # Optional enrichment
    image_prompt_context: str | None = None     # extra context for image prompts
    reference_image_urls: list[str] = Field(default_factory=list, max_length=5)
    header_text: str | None = None
    footer_text: str | None = None

    # Tracing — NOTE: source is SERVER-DERIVED, not agent-supplied.
    # The Node.js handler IGNORES any agent-supplied source value and derives it
    # from X-Service-Token context: "agency_auto_draft:{agency_run_id}" for agent calls,
    # "content_auto:{spec_id}" for batch calls. This prevents audit trail spoofing.
    source: str = "agency_auto_draft"           # default; overridden server-side
```

**Skill slug resolution**: The Node.js handler resolves `article_skill_slug` → database skill ID via `skillRegistry.getBySlug(slug)`. If resolution fails (slug not found), handler falls back to `general-article-writer` and adds a warning to `AutoDraftResponse.warnings`. This is NOT an error — the pipeline proceeds with the fallback skill.

**Actor bootstrap**: Since the request comes from the Python agent (not a real user HTTP request), the handler constructs a synthetic `PresentationActor` from the `tenantId`/`userId` embedded in the X-Service-Token payload. A `taskId` is created by inserting a new task record before calling `generateAIDraft()`. The `userToken` is a short-lived (15 min) internal JWT signed with `JWT_SECRET`, minted from the `userId`/`tenantId` in the X-Service-Token payload — same pattern as `presentation.ts` uses for user-initiated requests. This JWT is consumed only within the same request cycle by downstream services (e.g., credit deduction). See Spec 034 §9.4 for the X-Service-Token → user JWT minting pattern.

**`canvas_preset` → pixel mapping**: Handler translates `canvas_preset` string to `canvasWidth`/`canvasHeight` integers using the same `CANVAS_PRESETS` lookup table as `AIDraftModal.tsx`. Unknown presets → reject with 400.

#### Response contract

```python
class AutoDraftResponse(BaseModel):
    success: bool
    deck_id: int | None = None
    library_item_id: int | None = None
    slide_count: int = 0
    editor_url: str | None = None
    article_preview: str | None = None   # first 500 chars of generated article
    # ⚠ article_preview contains user-influenced content (LLM output from user topic).
    # Frontend MUST HTML-escape before rendering (React JSX auto-escapes, but
    # dangerouslySetInnerHTML MUST NOT be used). If passed to downstream LLM calls,
    # place in HumanMessage/user role only (see §12.6).
    warnings: list[str] = []
    error: str | None = None
    error_code: str | None = None
    # Tracing — FK back to agency run for dashboard
    agency_run_id: int | None = None
    task_id: str | None = None
    # Cost info for agent to report (integer credits, not float — avoid leaking model pricing)
    credits_used: int = 0
    generation_time_ms: int = 0
```

#### Node.js handler

```typescript
// POST /api/internal/tools/auto-draft
// Guarded by X-Service-Token — see §12.7 (and Spec 034 §9.4 for the original pattern)
// Feature flag gate: if (!process.env.ENABLE_CONTENT_AUTOMATION) return 503;

// Implementation:
// 1. Validate AutoDraftRequest via Zod
// 2. Resolve skill slugs → skill IDs via skillRegistry
// 3. Resolve model IDs from model name/slug
// 4. Build GenerateAIDraftInput (reuse existing Zod schema)
// 5. Create deck + library item (or use existing deckId if provided)
// 6. Call generateAIDraft() directly (same function AIDraftModal uses)
// 7. Poll progress internally (not via Redis — direct await)
// 8. Return AutoDraftResponse

// CRITICAL: This is a BLOCKING call (may take 30-180s for large decks with media)
// Agent tool framework handles timeout (300s default for medium-risk tools)
```

### 7.2 New builtin tool: `builtin-model-suggest`

#### Purpose

Read-only tool ที่ให้ agent query available models + recommend best option based on criteria

#### Tool registration

```python
_BUILTIN_ENDPOINTS["builtin-model-suggest"] = "/api/internal/tools/model-suggest"
_BUILTIN_RISK_LEVELS["builtin-model-suggest"] = "low"
```

#### Contract

```python
class ModelSuggestRequest(BaseModel):
    purpose: str  # "image" | "video" | "audio" | "text"
    quality: str = "balanced"  # "fast" | "balanced" | "best"
    budget_hint: str | None = None  # "low" | "medium" | "high"

class ModelSuggestResponse(BaseModel):
    recommended: ModelRecommendation
    alternatives: list[ModelRecommendation]  # up to 3

class ModelRecommendation(BaseModel):
    model_id: str
    model_name: str
    provider: str
    cost_tier: str         # "low" | "medium" | "high" — categorical, not raw float
    # NOTE: Do NOT expose raw cost_per_unit float. The agent reads tool results
    # as text in its LLM context. Raw pricing leaks internal margin structures.
    # Consistent with AutoDraftResponse.credits_used using integer credits (§7.1).
    quality_tier: str      # "fast" | "balanced" | "best"
    reason: str            # "Best balance of quality and cost for image generation"
```

```typescript
// Node.js: POST /api/internal/tools/model-suggest
// Guarded by X-Service-Token (same as all internal tools — see §12.7)
// Implementation:
// 1. Query llmModels/mediaModels via getModelsByTypeAsync() (existing function in aiPresentationService.ts)
//    — this already handles tenant-level model visibility and isEnabled flags
// 2. Filter by purpose (image/video/audio/text)
// 3. Rank by quality_tier preference + cost
// 4. Return top recommendation + alternatives (max 3)
```

### 7.3 Auto Draft Agent Template

```yaml
# Seed data for agencies table
name: "Auto Draft Agent"
description: "สร้าง presentation อัตโนมัติจาก brief เดียว — เลือก skill, model, style ให้ทั้งหมด"
visibility: "template"
tenantId: "__system__"
status: "active"
```

#### Agent instructions

```
คุณเป็น Auto Draft Agent — สร้าง presentation อัตโนมัติจาก brief ของผู้ใช้
คุณต้องเลือก options ทั้งหมดแทนผู้ใช้ให้ได้ผลลัพธ์ที่ดีที่สุด

เมื่อได้รับ request จากผู้ใช้:

STEP 1: วิเคราะห์ brief
- ระบุ topic หลัก
- ระบุ domain (business/marketing/education/tech/creative/lifestyle/health)
- ระบุ language จาก brief (ไทย→"th", English→"en", mixed→"auto")
- ระบุ desired output จากบริบท (สไลด์เยอะ/น้อย, มีรูป/ไม่มี, มีเสียง/ไม่มี)
- ถ้าผู้ใช้ระบุจำนวนสไลด์ → ใช้ค่านั้น, ถ้าไม่ → ประเมินจาก topic complexity (5-15)

STEP 2: เลือก article skill
- Call builtin-skill-discovery with topic description + category filter
- DECISION TABLE (verified against existing skills in apps/web/skills/):
  | Domain | Preferred Skill | Fallback | Notes |
  |--------|----------------|----------|-------|
  | Business/Strategy | business-article-writer | general-article-writer | ✅ exists |
  | Marketing/Pitch | marketing-article-writer | general-article-writer | ✅ exists |
  | Education/Training | education-article-writer | general-article-writer | ✅ exists |
  | Technology | general-article-writer | (none) | ⚠️ No dedicated tech skill yet — use general with tone=technical |
  | Creative/Story | creative-story-writer | general-article-writer | ✅ exists |
  | Health/Parenting | parenting-article-writer | general-article-writer | ✅ exists (covers health/family domain) |
  | Lifestyle | lifestyle-article-writer | general-article-writer | ✅ exists |
  | Product Review | fashion-clothing-reviewer / beauty-skincare-reviewer / household-product-reviewer | general-article-writer | ✅ 3 reviewer skills exist — agent selects by product_type |
  | Other/General | general-article-writer | (none — use topic directly) | ✅ exists |
- ถ้า discovery return skill ที่ตรงกว่า → ใช้ skill นั้นแทน default
- **Product Review routing**: ถ้า brief มี "รีวิว", "review", "สินค้า" → route to appropriate reviewer skill based on product category:
  - Fashion/clothing → fashion-clothing-reviewer (param: clothing_type)
  - Beauty/skincare → beauty-skincare-reviewer (param: product_category)
  - Household/general → household-product-reviewer (param: product_type)

STEP 3: เลือก media options
- Call builtin-model-suggest with purpose="image", quality="balanced"
- ถ้าผู้ใช้ขอวิดีโอ → purpose="video"
- ถ้าผู้ใช้ระบุ "ไม่ต้องมีรูป" → skip media model
- ถ้าผู้ใช้ระบุ "มีเสียง" / "narration" → generate_audio=true + purpose="audio"

STEP 4: เลือก style
- DECISION TABLE:
  | Domain | Default Style |
  |--------|--------------|
  | Business/Corporate | corporate-blue |
  | Marketing/Pitch | warm-sunset |
  | Education | light-minimalist |
  | Technology | dark-professional |
  | Creative | midnight-luxe |
  | Nature/Health | nature-green |
  | Editorial/News | editorial-clean |
- ถ้าผู้ใช้ระบุ style → override (e.g., "สไตล์มินิมอล" → light-minimalist)

STEP 5: เลือก skill parameters
- Article skill params: infer from topic
  - tone: "professional" (business), "friendly" (lifestyle), "academic" (education)
  - length: "medium" (≤10 slides), "long" (>10 slides)
  - audience: infer from brief context
- Media skill: use default params (skill defaults are tuned for good output)

STEP 6: สร้าง presentation
- Call builtin-auto-draft with ALL selected parameters
- Wait for result (may take 30-180 seconds)

STEP 7: Output envelope
- Wrap result as AgencyResultEnvelope with intent: "presentation_deck"
- Include deck_id, library_item_id, slide_count in artifacts
- Report credits_used in envelope metrics

ถ้าผู้ใช้แนบไฟล์ (CSV/Excel/Text):
- Call builtin-file-parse to extract content
- Use extracted content as custom_article_text
- Proceed with STEP 1 using extracted content as the brief

ถ้าผู้ใช้แนบรูปภาพ:
- Use image URL as reference_image_urls
- Add image description to image_prompt_context

IMPORTANT:
- ห้ามถามกลับ user ถ้าสามารถตัดสินใจเองได้
- ถ้าข้อมูลไม่เพียงพอที่จะเลือก → ใช้ defaults ที่เหมาะสม
- Output envelope MUST be wrapped in <sse:envelope>...</sse:envelope> tags
```

#### Tools assigned

```python
tools = [
    "builtin-skill-discovery",   # ค้นหา article + media skills
    "builtin-model-suggest",     # แนะนำ model ที่เหมาะ
    "builtin-auto-draft",        # สร้าง presentation (เรียก pipeline เดิม)
    "builtin-rag-knowledge",     # ค้นหา content จาก library (optional)
    "builtin-file-parse",        # อ่าน CSV/Excel/Text (Level 2)
]
```

### 7.4 UI Integration: "Auto" toggle in AIDraftModal

#### Option A: Toggle in existing modal (recommended for Phase 1)

```typescript
// AIDraftModal.tsx — add toggle at top
const [autoMode, setAutoMode] = useState(false);

// When autoMode = true:
// - Hide all option fields except: topic textarea + file upload + image attachments
// - Change "Generate" button to "Auto Generate"
// - On click: call agency.sendMessage() with Auto Draft Agent instead of generateDraft.mutate()
// - Show progress from agency run (polling agencyRun status)
// - On complete: open presentation in editor (same as manual mode)
```

#### Option B: Separate entry from Agency Chat

```
User opens Agency Chat → selects "Auto Draft Agent" template
→ types brief → agent handles everything → "Open in Editor" button
```

**Recommendation**: Implement **both** — Option A for quick access from Presentation Editor, Option B for users who prefer chat interface

### 7.5 Auto Draft → Spec 034 Deck Builder relationship

Spec 034 defines a `Deck Builder Agent` ที่สร้าง slides ผ่าน `builtin-presentation-create` (slide-by-slide, content only, ไม่มี media)

Auto Draft Agent ใน spec 035:
- **Does NOT replace** Deck Builder — ทั้งสองมี use case ต่างกัน
- **Deck Builder (034)**: เหมาะกับ agency workflows ที่ chain agents (e.g., research → deck)
- **Auto Draft (035)**: เหมาะกับ end-user ที่ต้องการ full presentation with media ทันที

| Feature | Deck Builder (034) | Auto Draft (035) |
|---------|-------------------|-----------------|
| Media generation | ❌ (slides only) | ✅ (images/videos/audio) |
| Pipeline used | `builtin-presentation-create` (custom) | `generateAIDraft()` (existing, proven) |
| Speed | Fast (~5-10s) | Slower (~30-180s) with media |
| Use case | Agent workflow chains | End-user one-shot |
| Chainable | ✅ (output → next agent) | ⚠️ (blocking, long-running) |

---

## 8. Level 2: Multi-Source Input

### 8.1 Input sources

```
┌──────────────────────────────────────────────────┐
│                   InputResolver                   │
│                                                   │
│  Sources:                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │  Direct   │ │   File   │ │  Chat    │         │
│  │  Text     │ │  Upload  │ │  Command │         │
│  │  (brief)  │ │ CSV/XLS  │ │ (NLP)   │         │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘         │
│       │             │            │                │
│       ▼             ▼            ▼                │
│  ┌─────────────────────────────────────┐         │
│  │        InputItem[]                   │         │
│  │  { topic, params?, attachments? }    │         │
│  └─────────────────────────────────────┘         │
└──────────────────────────────────────────────────┘
```

#### Source 1: Direct Text (existing)

User พิมพ์ brief โดยตรง → InputItem เดียว

#### Source 2: File Upload (NEW)

```typescript
// New builtin tool: builtin-file-parse
// POST /api/internal/tools/file-parse
// Guarded by X-Service-Token (same as all internal tools — see §12.7)

interface FileParseRequest {
  file_url: string;        // R2/S3 URL ของไฟล์ที่ upload
  file_type: "csv" | "xlsx" | "txt" | "auto";
  parse_mode: "single" | "per_row" | "per_line";
  // CSV/Excel specific:
  topic_column?: string;    // column name/index for topic
  params_columns?: Record<string, string>;  // mapping: param_name → column
  max_rows?: number;        // default 50, max 100
}

interface FileParseResponse {
  items: InputItem[];
  total_rows: number;
  parsed_rows: number;
  warnings: string[];
}

interface InputItem {
  topic: string;
  custom_article_text?: string;
  params?: Record<string, string>;
  attachments?: string[];    // URLs
  row_index?: number;        // for audit
}
```

**Python tool registration** (for agent dispatch via `agency_tools.py`):

```python
# In agency_tools.py — alongside builtin-auto-draft and builtin-model-suggest
_BUILTIN_ENDPOINTS["builtin-file-parse"] = "/api/internal/tools/file-parse"
_BUILTIN_RISK_LEVELS["builtin-file-parse"] = "medium"  # reads external files

# Pydantic model for Python callers (e.g., InputResolver._resolve_file)
class FileParseRequest(BaseModel):
    file_url: str
    file_type: Literal["csv", "xlsx", "txt", "auto"] = "auto"
    parse_mode: Literal["single", "per_row", "per_line"] = "per_row"
    topic_column: str | None = None
    params_columns: dict[str, str] | None = None
    max_rows: int = 50

class FileParseResponse(BaseModel):
    items: list[dict]
    total_rows: int
    parsed_rows: int
    warnings: list[str]
```

**File type support:**

| Type | Library | Parse mode |
|------|---------|-----------|
| CSV | Papa Parse (`papaparse`) | Per-row: each row → 1 InputItem |
| Excel (.xlsx) | SheetJS (`xlsx`) | Per-row: each row → 1 InputItem |
| Text (.txt) | Built-in | Per-line: each line → 1 InputItem (or single: whole file → 1 topic) |

**Example CSV:**
```csv
topic,style,slides,language
"Marketing Strategy สำหรับ SME ไทย",corporate-blue,10,th
"AI Trends 2026 for Startups",dark-professional,8,en
"สุขภาพดีเริ่มที่อาหาร",nature-green,5,th
```

**Security**: File size limit 5MB, max 100 rows, sanitize all cell values

#### Source 3: Chat Command (NEW)

User พิมพ์ใน Agency Chat ด้วยภาษาธรรมชาติ:

```
"พรุ่งนี้แปดโมง สร้าง slide เกี่ยวกับข่าวเทคโนโลยีที่น่าสนใจ 1 เรื่อง"
"สร้าง presentation สำหรับงานเปิดตัวสินค้าใหม่ สินค้า XXX ตามภาพที่แนบ"
"สร้าง slide สำหรับรีวิวสินค้า XXX ทุกวัน วันละ 1 presentation"
```

**Disambiguation with `chat-alert` skill**: The existing `chat-alert` skill (category: `automation`) already handles scheduling intents like "ทุกวัน 8 โมง เช็คราคาทอง". To avoid conflicts:
- **Auto Draft Agent** handles scheduling ONLY when the command contains **content-creation intent keywords**: `สร้าง slide`, `สร้าง presentation`, `สร้าง video`, `create slide`, `create presentation`, `auto draft`
- **`chat-alert` skill** continues to handle all other reminder/alert patterns ("แจ้งเตือน", "เช็ค", "ติดตาม")
- If both patterns match, the Auto Draft Agent takes priority (checked first via `priority` field)

**NLP Intent Detection**: Auto Draft Agent วิเคราะห์ command แล้วแยกเป็น:

```python
class ChatCommandParsed(BaseModel):
    intent: Literal["immediate", "scheduled", "recurring"]
    topic: str
    # Scheduling (for scheduled/recurring)
    schedule_time: datetime | None = None      # "พรุ่งนี้ 8 โมง"
    recurrence: str | None = None              # "ทุกวัน", "ทุกสัปดาห์"
    cron_expression: str | None = None         # derived: "0 8 * * *"
    # Attachments
    image_urls: list[str] = []
    file_urls: list[str] = []
    # Overrides
    style_override: str | None = None
    slide_count_override: int | None = None
```

**Scheduling flow:**

```
User: "ทุกวัน 8 โมง สร้าง slide รีวิวสินค้า ABC"
         │
Agent: parse intent → recurring
Agent: extract → topic="รีวิวสินค้า ABC", cron="0 8 * * *"
Agent: call builtin-schedule-draft (new tool)
         │
         ▼
auto_draft_schedules record created (NOT workflowSchedules — see §13 note)
         │
Celery beat picks up at 08:00 daily
         │
Auto Draft Agent runs → presentation created → notification sent
```

### 8.2 New builtin tool: `builtin-schedule-draft`

```python
_BUILTIN_ENDPOINTS["builtin-schedule-draft"] = "/api/internal/tools/schedule-draft"
_BUILTIN_RISK_LEVELS["builtin-schedule-draft"] = "high"  # persistent recurring pipeline — requires confirmation
```

```python
class ScheduleDraftRequest(BaseModel):
    """Schedule a recurring or one-time auto draft."""
    topic_template: str = Field(..., max_length=2000)  # topic with optional placeholders
    schedule_type: Literal["once", "recurring"]
    cron_expression: str | None = None   # for recurring — validated with 1-hour minimum interval
    run_at: datetime | None = None       # for one-time
    timezone: str = "Asia/Bangkok"
    # Auto draft params (same as AutoDraftRequest, agent fills these)
    # IMPORTANT: draft_params.source is ignored and overridden to
    # f"schedule:{schedule.id}" at execution time — see BullMQ integration
    # note in §9.2 (auto_draft_schedules table)
    draft_params: AutoDraftRequest
    # Notification
    notify_email: bool = True
    notify_webhook_url: str | None = None  # MUST pass SSRF validation (see §12.5)

    # Placeholder allowlist — ONLY these are permitted in topic_template
    # ClassVar prevents Pydantic v2 from treating this as a model field
    ALLOWED_PLACEHOLDERS: ClassVar[set[str]] = {"date", "day_of_week"}

    @validator("topic_template")
    def validate_topic_template(cls, v):
        """Validate topic_template placeholders against allowlist.
        Reject any {{...}} tokens not in ALLOWED_PLACEHOLDERS.
        After substitution, resolved topic must be 3-1000 chars (AutoDraftRequest.topic constraint)."""
        import re
        found = re.findall(r"\{\{(\w+)\}\}", v)
        invalid = set(found) - cls.ALLOWED_PLACEHOLDERS
        if invalid:
            raise ValueError(f"Unsupported placeholders: {invalid}. Allowed: {cls.ALLOWED_PLACEHOLDERS}")
        # Post-substitution length is checked at execution time (max 1000 chars)
        return v

    @validator("cron_expression")
    def validate_cron(cls, v):
        """Port of validateCronExpression from scheduledMessages.ts.
        Enforce minimum 1-hour interval for Content Automation
        (stricter than the 15-min chat-alert minimum).
        Reject: '* * * * *', '*/5 * * * *', etc."""
        if v:
            # validate_cron_min_interval returns list[str] of errors
            # (collect-all-errors pattern, same as ContentSpecValidator)
            errors = validate_cron_min_interval(v, min_minutes=60)
            if errors:
                raise ValueError(errors[0])
        return v

class ScheduleDraftResponse(BaseModel):
    schedule_id: int
    next_run: datetime
    status: str  # "active"
```

### 8.3 Batch execution for file input

เมื่อ input มาจากไฟล์ (CSV/Excel) ที่มีหลายแถว:

```
File upload (10 rows)
         │
    InputResolver
         │
    ┌────┴────┐
    │ Batch   │  (Celery task group)
    │ Queue   │
    └────┬────┘
         │
    ┌────┼────┬────┬────┐
    │    │    │    │    │  (parallel, max 3 concurrent)
    Row1 Row2 Row3 Row4 ...
    │    │    │    │
    Auto Draft (each)
    │    │    │    │
    Deck Deck Deck Deck
         │
    BatchResult {
      total: 10,
      success: 8,
      failed: 2,
      decks: [...],
      errors: [...]
    }
         │
    Notification
```

**Concurrency limit**: Max 3 concurrent auto-drafts per user (prevent credit drain)

**Rate limit**: Max 50 batch items per request, max 100 per day per user

---

## 9. Level 3: Content Automation Engine

### 9.1 Content Spec

User สร้าง **Content Spec** — เอกสาร JSON/YAML ที่กำหนดว่าระบบต้องสร้างอะไร ในรูปแบบไหน ตามกำหนดเวลาอะไร

```yaml
# Content Spec Example: Daily Facebook Content for Cosmetics Channel
name: "BellaGlow Daily Posts"
description: "สร้างเนื้อหาสำหรับ Facebook Page BellaGlow ทุกวัน"
channel:
  name: "BellaGlow Beauty Tips"
  platform: "facebook"          # informational only (Phase 1 ไม่ post จริง)
  niche: "ความงามและเครื่องสำอาง"
  target_audience: "ผู้หญิงไทย อายุ 25-45"
  tone: "friendly, informative"
  language: "th"

schedule:
  timezone: "Asia/Bangkok"     # Used for UI display + cron matching (see note below)
  items:
    - cron: "0 8 * * *"          # ทุกวัน 8 โมง (local time per timezone above)
      output_type: "slide"       # PNG slide image + caption text
      count: 1
      topic_source:
        type: "rotating_list"
        topics:
          - "เคล็ดลับดูแลผิวหน้าสำหรับหน้าฝน"
          - "วิธีเลือกครีมกันแดดที่เหมาะกับผิว"
          - "อาหารบำรุงผิวที่ควรกินทุกวัน"
          - "เทคนิคแต่งหน้าแบบ natural look"
          - "รีวิวครีมบำรุงผิวยอดนิยม 2026"
          # ... more topics
        rotation: "sequential"    # sequential | random | smart (AI picks based on trends)

    - cron: "0 10 * * 1,3,5"     # จันทร์ พุธ ศุกร์ 10 โมง
      output_type: "video"        # MP4 video (slideshow + narration)
      count: 1
      topic_source:
        type: "ai_generated"
        prompt: "สร้างหัวข้อเกี่ยวกับเทรนด์ความงามที่กำลังเป็นที่นิยมในเดือนนี้"
        constraints:
          min_slides: 5
          max_slides: 8
          include_audio: true
          style: "warm-sunset"

    - cron: "0 14 * * 6"         # เสาร์ บ่าย 2
      output_type: "presentation" # Full deck (editable in editor)
      count: 3                    # สร้าง 3 presentations
      topic_source:
        type: "file"
        file_url: "{{library:weekly-topics.csv}}"  # reference to library file
        column: "topic"

defaults:
  style_preset: "warm-sunset"
  num_slides: 5
  image_model: "auto"             # let system pick best
  article_skill: "auto"           # let agent pick
  generate_audio: false

notification:
  on_complete:
    - type: "email"
      to: "owner"                 # send to spec owner's email
      subject_template: "BellaGlow: {{count}} ชิ้นเนื้อหาใหม่พร้อมแล้ว"
    - type: "webhook"
      url: "https://hooks.example.com/content-ready"
      # payload_template is NOT supported — webhook sends fixed schema (§10.3)
  on_error:
    - type: "email"
      to: "owner"

output:
  storage: "r2"                   # store in R2/S3
  folder_pattern: "content-auto/{{channel.name}}/{{date}}"
  formats:
    slide: ["png"]                # export each slide as PNG
    video: ["mp4"]                # export as MP4
    presentation: ["native"]      # keep as editable deck
  metadata:
    include_caption: true         # generate social media caption per slide
    include_hashtags: true
    caption_language: "th"
```

### 9.2 Content Spec data model

```python
# python-backend/app/models/content_automation.py

class ContentSpec(Base):
    """Content Automation Spec — defines batch content production rules."""
    __tablename__ = "content_specs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(String(36), nullable=False, index=True)
    user_id = Column(Integer, nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    spec_data = Column(JSON, nullable=False)       # full YAML/JSON spec
    status = Column(String(20), nullable=False, default="active")  # active | paused | archived
    version = Column(Integer, nullable=False, default=1)

    # Scheduling state
    next_run = Column(DateTime(timezone=True), nullable=True)
    last_run = Column(DateTime(timezone=True), nullable=True)
    total_runs = Column(Integer, nullable=False, default=0)
    total_items_created = Column(Integer, nullable=False, default=0)

    # Failure tracking (Risk 5 mitigation: auto-pause after 3 consecutive failures)
    consecutive_failures = Column(Integer, nullable=False, default=0)
    # Reset to 0 on successful run; increment on failed run.
    # When consecutive_failures >= 3: set status = "paused", log reason.

    # Webhook HMAC secret (generated at creation, stored encrypted via crypto.ts)
    webhook_secret_encrypted = Column(Text, nullable=True)  # NULL if no webhook configured
    # Encryption ownership: webhook_secret is generated and encrypted by the tRPC
    # `createSpec`/`updateSpec` mutation (Node.js, using crypto.ts encrypt()).
    # Python batch task decrypts via smartspecweb_crypto.py (shared LLM_ENCRYPTION_KEY).
    # FastAPI endpoints MUST NOT create Content Specs directly — creation goes through tRPC only.

    # Budget control
    daily_credit_limit = Column(Integer, nullable=True)     # max credits per day
    monthly_credit_limit = Column(Integer, nullable=True)   # max credits per month
    credits_used_today = Column(Integer, nullable=False, default=0)
    credits_used_month = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime(timezone=True), nullable=False,
                        default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False,
                        default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("content_specs_tenant_idx", "tenant_id"),
        Index("content_specs_status_idx", "status"),
        Index("content_specs_next_run_idx", "next_run"),
        # Composite index for scheduler hot path: WHERE status='active' AND next_run <= NOW()
        # Single B-tree range scan instead of bitmap AND across two separate indexes
        Index("content_specs_sched_idx", "status", "next_run"),
    )


class ContentAutomationRun(Base):
    """Single execution of a Content Spec schedule item."""
    __tablename__ = "content_automation_runs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    spec_id = Column(Integer, ForeignKey("content_specs.id", ondelete="CASCADE"), nullable=False)
    tenant_id = Column(String(36), nullable=False)
    schedule_item_index = Column(Integer, nullable=False)  # which schedule item triggered

    status = Column(String(20), nullable=False, default="pending")
    # pending → running → completed | failed | export_failed
    # NOTE: 'exporting' and 'notifying' intermediate states were considered but are NOT
    # set in the batch task — status transitions directly from 'running' to final state.
    # export_failed: Phase 2 (drafts) succeeded but Phase 3-5 (export/upload) failed.
    #   Does NOT increment consecutive_failures (transient infra issue, not content failure).
    #   Presentations remain accessible via editor_url. Dashboard shows "Re-export" button.

    # Input
    topics_resolved = Column(JSON, nullable=True)           # resolved InputItem[]
    items_requested = Column(Integer, nullable=False, default=1)

    # Output
    items_completed = Column(Integer, nullable=False, default=0)
    items_failed = Column(Integer, nullable=False, default=0)
    item_errors = Column(JSON, nullable=True)               # per-item error details: [{topic, status, error_message, deck_id}]
    output_artifacts = Column(JSON, nullable=True)          # [{deck_id, topic, editor_url, credits_used}] — written after Phase 2, used by reExport
    export_urls = Column(JSON, nullable=True)               # list of download URLs

    # Cost
    credits_used = Column(Integer, nullable=False, default=0)

    # Timing
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False,
                        default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("content_auto_runs_spec_idx", "spec_id"),
        Index("content_auto_runs_status_idx", "status"),
        Index("content_auto_runs_tenant_idx", "tenant_id"),
        Index("content_auto_runs_created_idx", "created_at"),  # For cleanup_old_runs query
    )
```

#### `auto_draft_schedules` table (Phase 2)

```python
class AutoDraftSchedule(Base):
    """Standalone scheduled/recurring auto-draft (NOT part of Content Spec).
    Created by builtin-schedule-draft tool. Execution dispatched via BullMQ
    (same pattern as scheduledMessages — Node.js reads this table on cron tick)."""
    __tablename__ = "auto_draft_schedules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(String(36), nullable=False, index=True)
    user_id = Column(Integer, nullable=False)
    topic_template = Column(Text, nullable=False)          # with {{date}}, {{day_of_week}} placeholders (max 2000 chars)
    schedule_type = Column(String(20), nullable=False)     # "once" | "recurring"
    cron_expression = Column(String(100), nullable=True)   # validated: 1-hour minimum
    run_at = Column(DateTime(timezone=True), nullable=True)  # for one-time
    timezone = Column(String(50), nullable=False, default="Asia/Bangkok")
    draft_params = Column(JSON, nullable=False)            # serialized AutoDraftRequest
    notify_email = Column(Boolean, nullable=False, default=True)
    notify_webhook_url = Column(Text, nullable=True)       # SSRF-validated (§12.5)
    status = Column(String(20), nullable=False, default="active")  # active | paused | completed | cancelled
    next_run = Column(DateTime(timezone=True), nullable=True)
    last_run = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False,
                        default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("auto_draft_sched_tenant_idx", "tenant_id"),
        Index("auto_draft_sched_next_run_idx", "next_run"),
    )
```

> **BullMQ integration**: The Node.js `scheduler.ts` reads `auto_draft_schedules WHERE status = 'active' AND next_run <= NOW()` on a 1-minute interval (same as `scheduledMessages`). Each due row dispatches a BullMQ job that calls `builtin-auto-draft` internally. After execution, `next_run` is advanced based on `cron_expression` (or set to NULL for one-time schedules with `status = 'completed'`).
>
> **IMPORTANT**: When the BullMQ job processes a due `auto_draft_schedules` record, it MUST re-parse `draft_params` through the `AutoDraftRequest` Zod schema before calling the handler — do NOT trust raw JSON from the database (schema may have evolved, or record may have been manually edited). Also validate that the resolved `topic_template` (after placeholder substitution) satisfies `AutoDraftRequest.topic` constraints (3-1000 chars). `reference_image_urls` in `draft_params` MUST store stable R2/S3 object keys — NOT pre-signed URLs (pre-signed tokens expire and would persist in the JSON column indefinitely). After re-parsing, OVERRIDE `draft_params.source = f"schedule:{schedule.id}"` regardless of stored value — for accurate audit trail attribution.

### 9.3 Content Automation Scheduler

```python
# python-backend/app/services/content_automation_scheduler.py

class ContentAutomationScheduler:
    """
    Celery beat task ที่ scan content_specs ทุก 1 นาที
    → หา specs ที่ next_run <= now AND status = 'active'
    → dispatch content_automation_batch_task
    """

    async def tick(self):
        """Called by Celery beat every minute."""
        # get_due_specs uses SELECT ... FOR UPDATE SKIP LOCKED
        # to prevent duplicate dispatch when multiple beat workers run
        # Also JOINs users table: WHERE user.status = 'active' AND tenant.status != 'suspended'
        due_specs = await self.get_due_specs()
        for spec in due_specs:
            # Dispatch batch task — one task per due schedule item.
            # get_due_schedule_indices: scans spec.spec_data["schedule"]["items"],
            # returns indices of items whose cron expression matches current tick
            # time using croniter.match(datetime.now()). If multiple items are due
            # simultaneously, dispatch one task per due item.
            schedule_items = spec.spec_data.get("schedule", {}).get("items", [])
            # NOTE: get_due_schedule_indices converts spec's timezone to compute
            # local wall-clock time for croniter.match(). The cron expression
            # "0 8 * * *" with timezone "Asia/Bangkok" matches at UTC 01:00.
            # Implementation: use pytz/zoneinfo to localize datetime.now(timezone.utc)
            # to the spec's configured timezone before calling croniter.match().
            for idx in self.get_due_schedule_indices(spec):
                # Credit guard: reserve PER TASK (not per spec) using that item's count.
                # User-account balance is enforced inside auto_draft_pipeline()
                # via CreditInsufficientError → batch task calls atomic_budget_rollback()
                item_count = schedule_items[idx].get("count", 1)
                estimated = item_count * AVERAGE_COST_PER_DRAFT
                if not await atomic_budget_reserve(spec.id, estimated, spec.tenant_id):
                    await self.log_skip(spec, reason="credit_limit_exceeded", item_index=idx)
                    continue  # skip this item, try next due item

                task = content_automation_batch_task.delay(
                    spec_id=spec.id,
                    schedule_item_index=idx,
                    tenant_id=spec.tenant_id,
                )

            # IMPORTANT: advance_next_run MUST happen in the same DB transaction
            # as the dispatch decision to prevent duplicate runs. If the process
            # crashes between delay() and advance_next_run(), the next scheduler
            # tick will re-find this spec (stale next_run) and dispatch again.
            # Defense: advance_next_run uses an atomic UPDATE with a CAS guard
            # on the current next_run value, similar to persist_rotation_offset.
            # If the CAS fails (another tick already advanced it), skip silently.
            #
            # Update per-item next-fire timestamps in spec_data["_item_next_runs"]
            # (dict keyed by item index → ISO timestamp).
            # advance_next_run iterates ALL schedule items, computes next fire
            # for each via croniter, stores per-item values in _item_next_runs,
            # then sets spec.next_run = MIN(_item_next_runs.values()) as convenience.
            await self.advance_next_run(spec)

    @staticmethod
    async def reset_daily_credit_counters():
        """Celery beat task — runs at UTC midnight.
        Without this, credits_used_today accumulates permanently and all specs
        with daily_credit_limit stop triggering after day 1."""
        await db.execute(text("""
            UPDATE content_specs SET credits_used_today = 0
            WHERE credits_used_today > 0
        """))
```

Monthly reset is a separate static method and beat entry to ensure it fires even if
the daily task is down at midnight on the 1st:

```python
    @staticmethod
    async def reset_monthly_credit_counters():
        """Celery beat task — runs at UTC midnight on 1st of each month."""
        await db.execute(text("""
            UPDATE content_specs SET credits_used_month = 0
            WHERE credits_used_month > 0
        """))
```

Register in `celery_app.py` beat schedule:
```python
"reset-daily-credit-counters": {
    "task": "app.tasks.content_automation_tasks.reset_daily_credit_counters",
    "schedule": crontab(hour=0, minute=0),  # UTC midnight
},
"reset-monthly-credit-counters": {
    "task": "app.tasks.content_automation_tasks.reset_monthly_credit_counters",
    "schedule": crontab(hour=0, minute=0, day_of_month=1),  # UTC midnight, 1st of month
    # NOTE: Users in UTC+7 (Bangkok) see the monthly counter reset at 07:00 local time.
    # Tenant-timezone-aware reset is a future enhancement.
},
"cleanup-old-runs": {
    "task": "app.tasks.content_automation_tasks.cleanup_old_runs",
    "schedule": crontab(hour=3, minute=0, day_of_week="sunday"),  # Weekly at 03:00 UTC Sunday
},
"content-automation-scheduler-tick": {
    "task": "app.tasks.content_automation_tasks.run_scheduler_tick",
    "schedule": crontab(minute="*"),  # Every minute — the core scheduler loop
},
```

The scheduler tick wrapper task:

```python
@celery_app.task
def run_scheduler_tick():
    """Sync Celery task wrapping async ContentAutomationScheduler.tick().
    Feature flag gate: returns early if ENABLE_CONTENT_AUTOMATION != 'true'."""
    if os.environ.get("ENABLE_CONTENT_AUTOMATION", "false").lower() != "true":
        return
    _run_async(ContentAutomationScheduler().tick())
```

#### Run record cleanup

`content_automation_runs` accumulates rows rapidly (100+ specs × daily runs). Without cleanup, the table grows unbounded with JSON `output_artifacts` and `item_errors` columns.

```python
async def cleanup_old_runs(retention_days: int = 90):
    """Delete run records older than retention_days.
    Uses created_at index for efficient range scan.
    Also detects zombie runs (stuck in 'running' > 2 hours) from hard_time_limit SIGKILL."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    zombie_cutoff = datetime.now(timezone.utc) - timedelta(hours=2)

    # Phase 1: Mark zombie "running" records as "failed"
    # These are caused by hard_time_limit SIGKILL — the except block never ran.
    zombie_result = await db.execute(text("""
        UPDATE content_automation_runs
        SET status = 'failed', error_message = 'Task killed by hard_time_limit (zombie detected)'
        WHERE status = 'running' AND started_at IS NOT NULL AND started_at < :zombie_cutoff
    """), {"zombie_cutoff": zombie_cutoff})
    if zombie_result.rowcount > 0:
        logger.warning("content_auto.zombie_runs_detected", extra={
            "count": zombie_result.rowcount,
        })

    # Phase 2: Delete old completed/failed records (skip running).
    # export_failed records are kept longer (180 days) to allow re-export,
    # but are eventually cleaned up to prevent unbounded growth.
    result = await db.execute(text("""
        DELETE FROM content_automation_runs
        WHERE status != 'running'
          AND (
            (status != 'export_failed' AND created_at < :cutoff)
            OR (status = 'export_failed' AND created_at < :export_failed_cutoff)
          )
    """), {
        "cutoff": cutoff,
        "export_failed_cutoff": datetime.now(timezone.utc) - timedelta(days=180),
    })
    logger.info("content_auto.cleanup_old_runs", extra={
        "deleted_count": result.rowcount, "zombies_fixed": zombie_result.rowcount,
        "cutoff": cutoff.isoformat(),
    })
```

Add index for cleanup query:
```python
# In ContentAutomationRun.__table_args__
Index("content_auto_runs_created_idx", "created_at"),
```

### 9.3.1 Spec lifecycle operations

#### `resumeSpec(spec_id, tenant_id, force_run_now?: bool)`

Called from tRPC `contentAutomation.resumeSpec` procedure.

```python
async def resume_spec(spec_id: int, tenant_id: str, force_run_now: bool = False):
    """Resume a paused Content Spec.
    MUST reset consecutive_failures atomically alongside status change.
    Without reset, the spec would re-pause on the very next single failure."""
    result = await db.execute(text("""
        UPDATE content_specs
        SET status = 'active', consecutive_failures = 0
        WHERE id = :spec_id AND tenant_id = :tenant_id AND status = 'paused'
    """), {"spec_id": spec_id, "tenant_id": tenant_id})
    if result.rowcount == 0:
        raise ValueError("Spec not found or not in paused state")

    # Recalculate next_run to the NEXT future cron tick (not the stale past value).
    # Without this, a spec paused for days would trigger a burst of catch-up runs
    # on the next scheduler tick because next_run is still in the past.
    # NOTE: load_content_spec MUST use a fresh DB session (or call session.expire_all())
    # to avoid returning the stale pre-UPDATE state from SQLAlchemy's identity map.
    spec = await load_content_spec(spec_id)
    await advance_next_run(spec)  # sets next_run = MIN of next future cron fires

    if force_run_now:
        # DESIGN: force_run_now always dispatches schedule_item_index=0 (first item)
        # as a single-item test run. This is intentional — the purpose is to verify
        # the spec works after fixing the cause of auto-pause, not to run all items.
        # CAVEAT: If the original failure was caused by a broken item at index 1+,
        # this test run will succeed (false positive). The next scheduled run of the
        # broken item will re-pause the spec. Expose schedule_item_index as an
        # optional parameter in a future iteration for targeted testing.
        schedule_items = spec.spec_data.get("schedule", {}).get("items", [])
        if not schedule_items:
            raise ValueError("Spec has no schedule items — cannot dispatch test run")
        item_count = schedule_items[0].get("count", 1)
        estimated = item_count * AVERAGE_COST_PER_DRAFT
        if not await atomic_budget_reserve(spec_id, estimated, tenant_id):
            raise ValueError("Credit limit exceeded — cannot dispatch test run")
        content_automation_batch_task.delay(
            spec_id=spec_id, schedule_item_index=0, tenant_id=tenant_id)
```

#### `pauseSpec(spec_id, tenant_id)` (manual)

Manual pause does NOT reset `consecutive_failures` — preserves failure history for debugging.

```python
async def pause_spec(spec_id: int, tenant_id: str):
    await db.execute(text("""
        UPDATE content_specs SET status = 'paused'
        WHERE id = :spec_id AND tenant_id = :tenant_id AND status = 'active'
    """), {"spec_id": spec_id, "tenant_id": tenant_id})
```

### 9.4 Batch execution flow

```python
# python-backend/app/tasks/content_automation_tasks.py

@celery_app.task(bind=True, max_retries=0, soft_time_limit=1800, hard_time_limit=2100)
# No auto-retry — prevents credit double-spend.
# soft_time_limit=1800 (30 min): raises SoftTimeLimitExceeded (caught by except block).
# hard_time_limit=2100 (35 min): SIGKILL — last resort if soft limit handler hangs.
# Failed runs increment consecutive_failures; scheduler re-dispatches on next tick.
def content_automation_batch_task(self, spec_id: int, schedule_item_index: int, tenant_id: str):
    """
    Execute one Content Spec schedule item.
    NOTE: This is a sync Celery task — all async calls use _run_async() helper
    (same pattern as presentation_render.py).

    Flow:
    1. Load ContentSpec + verify tenant isolation
    2. Resolve topics (rotating_list | ai_generated | file)
    3. For each topic: call Auto Draft pipeline
    4. Export to requested formats (PNG/MP4/native)
    5. Upload to R2 storage
    6. Send notifications
    7. Update run record
    """
    # Tenant isolation guard — SECURITY: use raise, NOT assert (assert is removed by python -O)
    spec = _run_async(load_content_spec(spec_id))
    if spec.tenant_id != tenant_id:
        raise ValueError(f"Tenant mismatch: spec {spec_id} belongs to tenant {spec.tenant_id}, expected {tenant_id}")

    # Resolve schedule item from index
    schedule_items = spec.spec_data.get("schedule", {}).get("items", [])
    if not (0 <= schedule_item_index < len(schedule_items)):
        raise ValueError(f"schedule_item_index {schedule_item_index} out of range for {len(schedule_items)} items")
    schedule_item = schedule_items[schedule_item_index]

    # Phase 1: Resolve topics
    topics = _run_async(InputResolver.resolve(spec, schedule_item, schedule_item_index))
    # → InputItem[] (1-10 items based on schedule.count)

    # Persist rotation offset (if rotating_list source with sequential rotation)
    # Atomic JSON update: UPDATE content_specs SET spec_data = jsonb_set(
    #   spec_data, '{_rotation_offsets,<idx>}', to_jsonb(old_offset + count))
    if schedule_item.get("topic_source", {}).get("type") == "rotating_list" and len(topics) > 0:
        _run_async(persist_rotation_offset(spec.id, schedule_item_index, len(topics)))

    # Phase 1b: Create run record (MUST exist before processing loop
    # so items_completed/items_failed can be updated incrementally)
    run_record = _run_async(create_run_record(
        spec_id=spec.id,
        tenant_id=spec.tenant_id,
        schedule_item_index=schedule_item_index,
        topics_resolved=[t.dict() for t in topics],
        items_requested=len(topics),
    ))
    # run_record.status = "running" at this point
    # Updated to "completed"/"failed" in Phase 6 (or except block)
    #
    # IMPORTANT: update_run_record() is a PATCH (partial update), NOT a PUT (full replace).
    # It only updates the kwargs provided — omitted fields retain their current DB values.
    # This allows the Phase 2 call (output_artifacts only) to coexist with the Phase 6
    # call (status, items_completed, etc.) without either overwriting the other's fields.

    # §9.4.1 Structured log: task_started
    logger.info("content_auto.task_started", extra={
        "spec_id": spec.id, "run_id": run_record.id,
        "schedule_item_index": schedule_item_index,
        "items_requested": len(topics), "tenant_id": spec.tenant_id,
    })

    # Edge case: empty topics (e.g., rotating_list with empty list — validator guards
    # against this but defense-in-depth). Mark completed immediately and return.
    if not topics:
        _run_async(update_run_record(run_record, status="completed",
                                     items_completed=0, items_failed=0, credits_used=0))
        logger.info("content_auto.task_completed", extra={
            "run_id": run_record.id, "run_status": "completed",
            "items_completed": 0, "items_failed": 0, "credits_used": 0,
            "total_duration_ms": 0,
        })
        return

    # MANDATORY: Phase 2-6 wrapped in try/except to prevent orphaned run records.
    # Any exception between create_run_record and update_run_record would leave the
    # run permanently in "running" state without this guard.
    results = []
    exports = []
    download_urls = []
    phase2_completed = False  # Set to True after Phase 2 loop completes — used by except block
    current_phase = "phase2_draft"  # Sentinel for structured logging (§9.4.1 task_failed event)
    phase2_start = time.monotonic()
    try:
        # Phase 2: Create presentations (sequential to control cost)
        for topic_item in topics:
            try:
                result = _run_async(auto_draft_pipeline(
                    topic=topic_item.topic,
                    params=merge_defaults(spec.spec_data.get("defaults", {}), topic_item.params),
                    tenant_id=spec.tenant_id,
                    user_id=spec.user_id,
                    trace_source=f"content_auto:{spec.id}",
                ))
                # Adjust credit counters: delta only (estimated was already reserved by scheduler)
                estimated_per_item = AVERAGE_COST_PER_DRAFT  # ~30-100 credits
                _run_async(atomic_credit_adjust(spec.id, estimated_per_item, result.credits_used, spec.tenant_id))
                results.append(result)
            except CreditInsufficientError:
                # Roll back the reserved budget for remaining items and stop.
                # The current item raised BEFORE any deduction, so its
                # reservation must also be rolled back (no -1).
                remaining_items = len(topics) - len(results)
                if remaining_items > 0:
                    _run_async(atomic_budget_rollback(spec.id, remaining_items * AVERAGE_COST_PER_DRAFT, spec.tenant_id))
                break

        # IMPORTANT: Set phase2_completed BEFORE any I/O (logger, update_run_record).
        # If update_run_record raises between the flag set and Phase 3, the except block
        # correctly sees phase2_completed=True and skips credit rollback (all drafts done).
        phase2_completed = True

        # §9.4.1 Structured log: phase_complete (Phase 2)
        logger.info("content_auto.phase_complete", extra={
            "run_id": run_record.id, "phase": "phase2_draft",
            "duration_ms": int((time.monotonic() - phase2_start) * 1000),
            "items_processed": len(results),
        })

        # Persist output_artifacts after Phase 2 (before export) so reExport can
        # reconstruct deck_ids even if Phase 3-5 fails (export_failed status).
        _run_async(update_run_record(run_record, output_artifacts=[
            {"deck_id": r.deck_id, "topic": t.topic, "editor_url": r.editor_url, "credits_used": r.credits_used}
            for r, t in zip(results, topics)  # zip stops at shorter; safe if CreditInsufficientError cut Phase 2 short
        ]))

        # Phase 3: Export
        current_phase = "phase3_export"
        phase3_start = time.monotonic()
        # NOTE: zip(results, topics) to propagate topic text into each export dict
        # (needed by Phase 4 caption generation: export["topic"])
        # NOTE: exports tracks items that completed through export (not just drafting).
        # The except block uses len(exports) for items_completed to accurately
        # reflect how far processing got before failure.
        for result, topic_item in zip(results, topics):
            if schedule_item.get("output_type") == "slide":
                export = _run_async(export_presentation_slides(
                    deck_id=result.deck_id,
                    format="png",
                    quality="standard",
                ))
                export["topic"] = topic_item.topic
                exports.append(export)

            elif schedule_item.get("output_type") == "video":
                export = _run_async(export_presentation_video(
                    deck_id=result.deck_id,
                    format="mp4",
                    quality="standard",
                    include_audio=True,
                ))
                export["topic"] = topic_item.topic
                exports.append(export)

            elif schedule_item.get("output_type") == "presentation":
                exports.append({
                    "type": "presentation",
                    "deck_id": result.deck_id,
                    "editor_url": result.editor_url,
                    "topic": topic_item.topic,
                })

        # §9.4.1 Structured log: phase_complete (Phase 3)
        logger.info("content_auto.phase_complete", extra={
            "run_id": run_record.id, "phase": "phase3_export",
            "duration_ms": int((time.monotonic() - phase3_start) * 1000),
            "items_processed": len(exports),
        })

        # Phase 4: Generate captions (if configured)
        current_phase = "phase4_caption"
        # NOTE: spec.spec_data is a raw JSON dict — use dict access, NOT attribute access
        output_meta = spec.spec_data.get("output", {}).get("metadata", {})
        channel_cfg = spec.spec_data.get("channel", {})
        if output_meta.get("include_caption", False):
            for export in exports:
                export["caption"] = _run_async(generate_social_caption(
                    topic=export["topic"],
                    language=channel_cfg.get("language", "auto"),
                    platform=channel_cfg.get("platform", "facebook"),
                    include_hashtags=output_meta.get("include_hashtags", False),
                ))

        # Phase 5: Upload to R2 (validate folder path — no traversal)
        current_phase = "phase5_upload"
        folder = render_folder_pattern(
            spec.spec_data.get("output", {}).get("folder_pattern", "content-auto/{{channel.name}}/{{date}}"),
            spec,
        )
        # SECURITY: use raise, NOT assert (assert is removed by python -O)
        # Normalize + decode before checking to prevent %2e%2e bypass
        from pathlib import PurePosixPath
        from urllib.parse import unquote
        decoded_folder = unquote(folder)
        normalized = str(PurePosixPath(decoded_folder))
        if ".." in normalized or not normalized.startswith("content-auto/"):
            raise ValueError(f"Path traversal or invalid prefix in folder_pattern: {folder}")
        download_urls = _run_async(upload_batch_to_r2(
            exports=exports,
            folder=folder,
        ))

        # Phase 6: Finalize run record + notify + update consecutive_failures
        current_phase = "phase6_finalize"
        # DESIGN: Export failures abort the entire Phase 3. Partial exports are
        # NOT committed — run_status reflects "failed" with items_completed equal
        # to the number of exports that succeeded before abort. Do NOT add per-item
        # try/except in the export loop — this changes transactional semantics.
        # NOTE: Compare against len(topics), NOT len(results). If CreditInsufficientError
        # caused an early Phase 2 exit, len(results) < len(topics). Marking the run as
        # "completed" when only a subset was created is misleading to the user.
        # Empty topics are handled by the early return above (line ~1275).
        run_status = "completed" if len(exports) == len(topics) else "failed"
        # Build item_errors for any topic that didn't produce a successful export
        item_errors_list = [
            {"topic": t.topic, "status": "skipped", "error_message": "credit_insufficient or export_failed", "deck_id": None}
            for t in topics[len(results):]
        ]
        _run_async(update_run_record(
            run_record,
            status=run_status,
            items_completed=len(exports),
            items_failed=len(topics) - len(exports),
            credits_used=sum(r.credits_used for r in results),
            export_urls=download_urls,
            item_errors=item_errors_list if item_errors_list else None,
        ))

        # Update consecutive_failures — RETURNING to detect auto-pause trigger
        if run_status == "failed":
            cf_result = _run_async(db.execute(text("""
                UPDATE content_specs
                SET consecutive_failures = consecutive_failures + 1,
                    status = CASE WHEN consecutive_failures + 1 >= 3 THEN 'paused' ELSE status END
                WHERE id = :spec_id AND tenant_id = :tenant_id
                RETURNING consecutive_failures
            """), {"spec_id": spec.id, "tenant_id": spec.tenant_id}))
            new_cf = cf_result.scalar()
            if new_cf is not None and new_cf >= 3:
                # §9.4.1 Structured log: spec_auto_paused
                logger.warning("content_auto.spec_auto_paused", extra={
                    "spec_id": spec.id, "tenant_id": spec.tenant_id,
                    "consecutive_failures": new_cf,
                    "last_error": f"Export incomplete: {len(exports)}/{len(results)} items exported",
                })
                try:
                    _run_async(notify_spec_paused(
                        spec,
                        last_error=f"Export incomplete: {len(exports)}/{len(results)} items exported",
                    ))
                except Exception as pause_exc:
                    logger.error("notify_spec_paused failed", extra={
                        "spec_id": spec.id, "error": sanitize(str(pause_exc)),
                    })
        else:
            _run_async(db.execute(text("""
                UPDATE content_specs SET consecutive_failures = 0
                WHERE id = :spec_id AND tenant_id = :tenant_id
            """), {"spec_id": spec.id, "tenant_id": spec.tenant_id}))

        # §9.4.1 Structured log: task_completed
        logger.info("content_auto.task_completed", extra={
            "run_id": run_record.id, "run_status": run_status,
            "items_completed": len(exports), "items_failed": len(topics) - len(exports),
            "credits_used": sum(r.credits_used for r in results),
            "total_duration_ms": int((time.monotonic() - phase2_start) * 1000),
        })

        # Notification is best-effort — failure MUST NOT downgrade a completed
        # run to "failed" or double-update the run record.
        try:
            _run_async(notify_completion(
                spec=spec,
                run=run_record,
                exports=exports,
                download_urls=download_urls,
            ))
        except Exception as notify_exc:
            logger.error("content_auto.notify_failed", extra={
                "run_id": run_record.id, "spec_id": spec.id,
                "error": sanitize(str(notify_exc)),
            })
            # Do NOT re-raise — notification failure is non-fatal

    except (Exception, SoftTimeLimitExceeded) as exc:
        # NOTE: SoftTimeLimitExceeded inherits from BaseException (not Exception)
        # in Celery 5.x (via billiard). Must be caught explicitly.
        # Budget rollback for unprocessed items.
        # phase2_completed is initialized to False before the try block and set to True
        # after Phase 2 completes. If the exception occurred during Phase 2, it remains False.
        # Phase 2 failures: some items were never drafted — roll back their reservations.
        # Phase 3-6 failures: all items were drafted (budget consumed) — rollback is 0.
        if not phase2_completed:
            # Roll back ALL unprocessed items (including the one that failed mid-draft)
            unprocessed = len(topics) - len(results)
            if unprocessed > 0:
                _run_async(atomic_budget_rollback(
                    spec.id, unprocessed * AVERAGE_COST_PER_DRAFT, spec.tenant_id))

        # Emit task_failed structured log (§9.4.1) using current_phase sentinel
        logger.error("content_auto.task_failed", extra={
            "run_id": run_record.id, "phase_failed": current_phase,
            "error_type": type(exc).__name__,
            "items_completed_before_failure": len(exports),
        })

        # Determine if this is an export/upload failure (R2 down) vs content failure.
        # export_failed: drafts succeeded but Phase 3 or Phase 5 failed — transient infra issue.
        # IMPORTANT: Only classify as export_failed when the failure is in Phase 3 (export)
        # or Phase 5 (upload). Phase 4 (caption) is a content/LLM failure and MUST increment
        # consecutive_failures — using the broad condition `phase2_completed and not download_urls`
        # would misclassify Phase 4 failures as infra failures.
        if current_phase in ("phase3_export", "phase5_upload") and phase2_completed:
            # Export/upload infrastructure failure — do NOT penalize consecutive_failures
            _run_async(update_run_record(
                run_record,
                status="export_failed",
                items_completed=len(exports),
                items_failed=len(topics) - len(exports),
                error_message=sanitize(str(exc)),
            ))
            logger.warning("content_auto.export_failed", extra={
                "run_id": run_record.id, "spec_id": spec.id,
                "phase": current_phase, "error": sanitize(str(exc)),
            })
            return  # Do NOT raise — Celery records SUCCESS (infra failure, not content failure)

        # Content generation failure — mark run as failed
        _run_async(update_run_record(
            run_record,
            status="failed",
            items_completed=len(exports),
            items_failed=len(topics) - len(exports),
            error_message=sanitize(str(exc)),
        ))

        # Increment consecutive_failures atomically — RETURNING for pause notification
        cf_result = _run_async(db.execute(text("""
            UPDATE content_specs
            SET consecutive_failures = consecutive_failures + 1,
                status = CASE WHEN consecutive_failures + 1 >= 3 THEN 'paused' ELSE status END
            WHERE id = :spec_id AND tenant_id = :tenant_id
            RETURNING consecutive_failures
        """), {"spec_id": spec.id, "tenant_id": spec.tenant_id}))
        new_cf = cf_result.scalar()
        if new_cf is not None and new_cf >= 3:
            # §9.4.1 Structured log: spec_auto_paused (except block)
            logger.warning("content_auto.spec_auto_paused", extra={
                "spec_id": spec.id, "tenant_id": spec.tenant_id,
                "consecutive_failures": new_cf, "last_error": sanitize(str(exc)),
            })
            try:
                _run_async(notify_spec_paused(spec, last_error=sanitize(str(exc))))
            except Exception as pause_exc:
                logger.error("notify_spec_paused failed", extra={
                    "spec_id": spec.id, "error": sanitize(str(pause_exc)),
                })
        raise  # Re-raise so Celery marks task as FAILURE in result backend
```

#### 9.4.1 Structured logging requirements

The batch task MUST emit structured log events at lifecycle points using the project's existing `logger` (not `print()`). These enable dashboards, alerting, and log aggregation without DB polling.

| Event | When | Required fields |
|-------|------|----------------|
| `content_auto.task_started` | After tenant guard + topic resolution | `spec_id, run_id, schedule_item_index, items_requested, tenant_id` |
| `content_auto.phase_complete` | End of Phase 2 and Phase 3 | `run_id, phase, duration_ms, items_processed` |
| `content_auto.task_completed` | After Phase 6 finalization | `run_id, run_status, items_completed, items_failed, credits_used, total_duration_ms` |
| `content_auto.task_failed` | In except block | `run_id, phase_failed, error_type, items_completed_before_failure`. `phase_failed` values: `"phase2_draft"`, `"phase3_export"`, `"phase4_caption"`, `"phase5_upload"`, `"phase6_finalize"` (set based on which phase was executing when the exception occurred) |
| `content_auto.spec_auto_paused` | When `consecutive_failures >= 3` triggers pause | `spec_id, tenant_id, consecutive_failures, last_error` — `last_error` MUST be `sanitize(str(exc))` (same sanitized string as `run_record.error_message`, never raw exception) |
| `content_auto.notify_failed` | When `notify_completion()` raises | `run_id, spec_id, error` (already shown in code above) |

All events MUST use `logger.info()` (or `logger.error()` for failures) with JSON-serializable `extra` dict. Do NOT log `spec_data` contents (may contain user PII).

#### 9.4.2 Spec deleted mid-run guard

If a Content Spec is deleted via `CASCADE` while a Celery task is executing, DB writes targeting `spec.id` or `run_record.id` will silently succeed with `rowcount == 0`. To prevent confusing log noise:

```python
# After any UPDATE targeting content_specs or content_automation_runs,
# check rowcount. If 0 and no error, the spec/run was deleted mid-execution.
result = _run_async(db.execute(text("UPDATE content_specs SET ..."), {...}))
if result.rowcount == 0:
    logger.warning("content_auto.spec_deleted_mid_run", extra={
        "spec_id": spec.id, "run_id": run_record.id,
    })
    return  # Exit cleanly — do NOT call notify_completion for a deleted spec
```

**Behavior by location:**
- **In the try block** (Phase 6 `update_run_record` or `consecutive_failures` UPDATE): `return` — exits the task cleanly. Celery records SUCCESS (acceptable — the spec no longer exists, there is nothing to mark as failed).
- **In the except block**: Do NOT use `return` (this would swallow the exception and mark Celery task as SUCCESS, which is misleading). Instead, log the warning and skip the `update_run_record()` and `consecutive_failures` UPDATE calls (both are no-ops on a deleted spec), then continue to `raise` — Celery records FAILURE.
- **In the try block** (Phase 6): the `return` after `update_run_record` rowcount==0 means the subsequent `consecutive_failures` UPDATE is never reached — this is correct, as there is no spec row to update. No separate rowcount check is needed for the `consecutive_failures` UPDATE in the same try-block path.

#### 9.4.3 Rotation offset atomicity

When the scheduler dispatches two tasks for the same spec concurrently (possible if beat worker restarts), both tasks may read the same rotation offset, produce duplicate topics, and double-increment the offset. The `persist_rotation_offset()` function MUST use an atomic compare-and-swap (CAS) update:

```sql
-- COALESCE handles first-ever run: when _rotation_offsets key does not exist,
-- spec_data -> '_rotation_offsets' returns NULL, ->> returns NULL,
-- and NULL::int = 0 evaluates to NULL (not TRUE). COALESCE resolves to 0 = 0.
UPDATE content_specs
SET spec_data = jsonb_set(
    COALESCE(spec_data, '{}'::jsonb),
    '{_rotation_offsets,<idx>}',
    to_jsonb(:new_offset)
)
WHERE id = :spec_id AND tenant_id = :tenant_id
  AND COALESCE((spec_data -> '_rotation_offsets' ->> :idx_str)::int, 0) = :expected_old_offset
```

If `rowcount == 0` (another task already updated the offset), log a warning `content_auto.rotation_offset_conflict` and proceed with the already-resolved topics. Do NOT retry topic selection.

#### 9.4.4 Re-export task (`content_automation_reexport_task`)

Dispatched by the `reExport` tRPC procedure for runs with `status='export_failed'`.
Re-runs Phase 3-5 only — no re-drafting, no credit cost.

```python
@celery_app.task(bind=True, max_retries=0, soft_time_limit=600, hard_time_limit=720)
def content_automation_reexport_task(self, run_id: int, tenant_id: str):
    """Re-export a previously drafted run that failed during Phase 3-5.

    Reads output_artifacts from the run record to get deck_ids.
    Does NOT call auto_draft_pipeline or consume credits."""
    run = _run_async(load_run_record(run_id))
    if run is None or run.tenant_id != tenant_id:
        raise ValueError("Run not found or tenant mismatch")
    if run.status != "export_failed":
        raise ValueError(f"Run status must be 'export_failed', got: {run.status!r}")

    artifacts = run.output_artifacts or []
    if not artifacts:
        raise ValueError("No output_artifacts — cannot re-export")

    spec = _run_async(load_content_spec(run.spec_id))
    if spec is None or spec.tenant_id != tenant_id:
        raise ValueError("Spec not found or tenant mismatch")

    schedule_items = spec.spec_data.get("schedule", {}).get("items", [])
    if run.schedule_item_index >= len(schedule_items):
        raise ValueError(f"schedule_item_index {run.schedule_item_index} out of range "
                         f"(spec has {len(schedule_items)} items — spec may have been updated since original run)")
    schedule_item = schedule_items[run.schedule_item_index]

    _run_async(update_run_record(run, status="running"))

    exports = []
    download_urls = []
    try:
        # Phase 3: Re-export using deck_ids from output_artifacts
        for artifact in artifacts:
            deck_id = artifact["deck_id"]
            topic = artifact["topic"]
            # SECURITY: Verify deck_id belongs to the same tenant (defense-in-depth
            # against output_artifacts tampering or cross-tenant data leak)
            deck = _run_async(load_deck(deck_id))
            if deck is None or deck.tenant_id != tenant_id:
                raise ValueError(f"deck_id {deck_id} not found or belongs to different tenant")
            output_type = schedule_item.get("output_type", "presentation")

            if output_type == "slide":
                export = _run_async(export_presentation_slides(deck_id=deck_id, format="png", quality="standard"))
            elif output_type == "video":
                export = _run_async(export_presentation_video(deck_id=deck_id, format="mp4", quality="standard", include_audio=True))
            else:
                export = {"type": "presentation", "deck_id": deck_id, "editor_url": artifact.get("editor_url")}
            export["topic"] = topic
            exports.append(export)

        # Phase 4: Generate captions (if configured) — same logic as main task
        # Phase 5: Upload to R2/S3 — same logic as main task
        # (omitted for brevity — identical to content_automation_batch_task Phase 4-5)

        folder = render_folder_pattern(
            spec.spec_data.get("output", {}).get("folder_pattern", "content-auto/{{channel.name}}/{{date}}"),
            spec,
        )
        # SECURITY: Same path traversal guard as main batch task Phase 5
        validate_r2_folder_path(folder)  # Raises ValueError on traversal attempt

        download_urls = _run_async(upload_batch_to_r2(exports=exports, folder=folder))

        _run_async(update_run_record(
            run, status="completed",
            items_completed=len(exports), items_failed=len(artifacts) - len(exports),
            export_urls=download_urls,
        ))
        # Reset consecutive_failures on successful re-export — the spec is healthy
        _run_async(db.execute(text("""
            UPDATE content_specs SET consecutive_failures = 0
            WHERE id = :spec_id AND tenant_id = :tenant_id
        """), {"spec_id": spec.id, "tenant_id": spec.tenant_id}))
        logger.info("content_auto.reexport_completed", extra={
            "run_id": run.id, "spec_id": spec.id, "items_exported": len(exports),
        })

    except (Exception, SoftTimeLimitExceeded) as exc:
        _run_async(update_run_record(
            run, status="export_failed",
            error_message=sanitize(str(exc)),
        ))
        logger.error("content_auto.reexport_failed", extra={
            "run_id": run.id, "spec_id": spec.id, "error": sanitize(str(exc)),
        })
        raise
```

#### `render_folder_pattern()` specification

```python
def render_folder_pattern(pattern: str, spec: ContentSpec) -> str:
    """Substitute template variables in folder_pattern for R2 key construction.
    Located in: python-backend/app/services/content_automation_engine.py

    Supported variables:
      {{channel.name}} → percent-encoded via urllib.parse.quote(channel_name, safe='')
      {{date}}         → ISO 8601 date in UTC (e.g., '2026-03-10')

    Returns: string matching ^content-auto/[^/].{0,500}$
    Caller MUST validate result for path traversal (§9.4 Phase 5).
    """
    from urllib.parse import quote
    channel_name = spec.spec_data.get("channel", {}).get("name", "default")
    result = pattern.replace("{{channel.name}}", quote(channel_name, safe=""))
    result = result.replace("{{date}}", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    return result
```

### 9.5 Topic resolution strategies

```python
class InputResolver:
    """Resolve topic source → list of InputItem."""

    @staticmethod
    async def resolve(spec: ContentSpec, schedule_item: dict, schedule_item_index: int = 0) -> list[InputItem]:
        """schedule_item is a raw dict from spec.spec_data["schedule"]["items"][idx]."""
        source = schedule_item.get("topic_source", {})
        item_count = schedule_item.get("count", 1)

        if source.get("type") == "rotating_list":
            # NOTE: _resolve_rotating is sync (no DB calls) — no await needed.
            # It reads rotation offsets from spec.spec_data (already loaded in memory).
            return InputResolver._resolve_rotating(source, spec, schedule_item_index, item_count)
        elif source.get("type") == "ai_generated":
            return await InputResolver._resolve_ai_generated(source, item_count)
        elif source.get("type") == "file":
            return await InputResolver._resolve_file(source, spec)
        elif source.get("type") == "fixed":
            return [InputItem(topic=source.get("topic", ""))]
        else:
            raise ValueError(f"Unknown topic source type: {source.get('type')}")

    @staticmethod
    def _resolve_rotating(source: dict, spec, schedule_item_index: int, item_count: int) -> list[InputItem]:
        """Pick next topic(s) from rotating list."""
        topics = source.get("topics", [])
        if not topics:
            return []  # Defense-in-depth: validator rejects this, but guard anyway
        # Per-schedule-item rotation offset — NOT global total_runs
        rotation_offsets = spec.spec_data.get("_rotation_offsets", {})
        offset = rotation_offsets.get(str(schedule_item_index), 0) % len(topics)
        count = min(item_count, len(topics))

        if source.get("rotation") == "random":
            selected = random.sample(topics, count)
        elif source.get("rotation") == "smart":
            # AI picks based on what hasn't been used recently
            # → query content_automation_runs for recent topics → pick least used
            # SECURITY: query MUST filter on tenant_id = spec.tenant_id (§12.8)
            # NOTE: _smart_pick is a sync function that uses _run_async() internally
            # to execute its DB query (consistent with the Celery sync context).
            selected = _smart_pick(topics, spec.id, spec.tenant_id, count)
        else:  # sequential
            selected = [topics[(offset + i) % len(topics)] for i in range(count)]

        # Offset is persisted by caller via persist_rotation_offset() in §9.4
        return [InputItem(topic=t) for t in selected]

    @staticmethod
    async def _resolve_ai_generated(source: dict, item_count: int) -> list[InputItem]:
        """LLM generates fresh topics based on prompt."""
        # Validate constraints against strict allowlist BEFORE sending to LLM.
        # constraints comes from user-supplied spec_data — must not be interpolated
        # into system prompts without validation (see §12.6).
        ALLOWED_CONSTRAINT_KEYS = {"min_slides", "max_slides", "include_audio", "style"}
        ALLOWED_STYLE_VALUES = {"corporate-blue", "warm-sunset", "light-minimalist",
                                "dark-professional", "midnight-luxe", "nature-green", "editorial-clean"}
        constraints = source.get("constraints")
        if constraints:
            invalid_keys = set(constraints.keys()) - ALLOWED_CONSTRAINT_KEYS
            if invalid_keys:
                raise ValueError(f"Invalid constraint keys: {invalid_keys}")
            if "style" in constraints and constraints["style"] not in ALLOWED_STYLE_VALUES:
                raise ValueError(f"Invalid style constraint: {constraints['style']!r}")
            if "min_slides" in constraints and not isinstance(constraints["min_slides"], int):
                raise ValueError("min_slides must be int")
            if "max_slides" in constraints and not isinstance(constraints["max_slides"], int):
                raise ValueError("max_slides must be int")

        # Call LLM to generate N topic ideas
        # SECURITY: prompt goes in user role. Constraints are serialized as
        # JSON in user role (NOT interpolated into system prompt).
        topics = await generate_topics_via_llm(
            prompt=source.get("prompt", ""),
            count=item_count,
            constraints=constraints,  # validated above; placed in user turn
        )
        return [InputItem(topic=t) for t in topics]

    @staticmethod
    async def _resolve_file(source: dict, spec) -> list[InputItem]:
        """Parse file from library to get topics."""
        # Resolve {{library:filename}} → actual R2 URL
        # resolve_library_reference: queries library_items WHERE
        #   tenant_id = spec.tenant_id AND filename = extracted_name
        # Returns the stored R2 URL. Raises FileNotFoundError if not found.
        # SECURITY: Never passes raw user URL to HTTP client — always resolves via DB.
        file_url = resolve_library_reference(source.get("file_url", ""), spec.tenant_id)
        # Validate resolved URL against SSRF allowlist (§12.5)
        validate_outbound_url(file_url)
        return await parse_file_to_items(file_url, source.get("column", "topic"))
```

### 9.6 Social caption generation

```python
async def generate_social_caption(
    topic: str,
    language: str,
    include_hashtags: bool,
    platform: str = "facebook",
) -> str:
    """Generate social media caption for a content piece.

    SECURITY: topic is user-supplied content — MUST be in user role, never system prompt.
    Model selection goes through standard llm_gateway routing (respects tenant config).
    """
    # Allowlist validation — platform and language come from user-supplied spec_data
    ALLOWED_PLATFORMS = {"facebook", "youtube", "tiktok", "x", "instagram"}
    ALLOWED_LANGUAGES = {"th", "en", "auto"}
    # SECURITY: use raise, NOT assert (assert is removed by python -O)
    if platform not in ALLOWED_PLATFORMS:
        raise ValueError(f"Invalid platform: {platform!r}")
    if language not in ALLOWED_LANGUAGES:
        raise ValueError(f"Invalid language: {language!r}")

    # System prompt — no user data interpolated here (platform/language are allowlisted)
    system_prompt = f"""คุณเป็นผู้เชี่ยวชาญเขียน caption สำหรับ {platform}
    ภาษา: {language}
    {"รวม hashtags ที่เกี่ยวข้อง 5-10 อัน" if include_hashtags else "ไม่ต้องใส่ hashtags"}
    ความยาว: 2-3 ประโยค + hashtags"""

    # User data in HumanMessage role — prevents prompt injection
    user_message = f"สร้าง caption สำหรับเรื่อง:\n{topic}"

    # Route through standard llm_gateway (respects tenant model config + audit pipeline)
    # NOT hardcoded to a specific model — let gateway pick per-tenant default
    result = await llm_gateway.generate(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        purpose="caption_generation",  # gateway routes to fast/cheap model
    )
    return result.text
```

---

## 10. Notification system

### 10.1 Notification channels

| Channel | Implementation | Phase |
|---------|---------------|-------|
| **Email** | Existing `emailService.ts` + new template | Phase 1 |
| **In-app notification** | Existing notification system (if any) or new `notifications` table | Phase 1 |
| **Webhook** | HTTP POST with JSON payload | Phase 1 |
| **LINE Notify** | LINE Notify API (`https://notify-api.line.me/api/notify`) | Phase 2 |
| **Slack** | Existing `builtin-slack-message` tool | Phase 2 |

### 10.2 Email template: `content-automation-complete`

**SECURITY**: All user-supplied values (`spec_name`, `channel.name`, topic text) MUST be HTML-escaped before inserting into the HTML email template. `subject_template` values MUST be stripped of HTML AND newline characters (`\r`, `\n`) before rendering — newlines enable email header injection (Cc/Bcc spoofing). Max subject length: 200 chars. Only `{{count}}`, `{{spec_name}}`, `{{date}}` placeholders are allowed in `subject_template`.

```
Subject: {{spec_name | strip_html}}: {{count}} ชิ้นเนื้อหาใหม่พร้อมแล้ว

สวัสดีครับ/ค่ะ,

Content Automation "{{spec_name | html_escape}}" ทำงานสำเร็จ:

สรุป:
- สร้างสำเร็จ: {{success_count}} / {{total_count}} ชิ้น
- เครดิตที่ใช้: {{credits_used}}
- เวลาที่ใช้: {{duration}}  {# completed_at - started_at, formatted: "X min Y sec" #}
{{#if has_failures}}
- ล้มเหลว: {{failed_count}} ชิ้น
  {{#each failed_items}}
  - "{{this.topic | html_escape}}": {{this.error | html_escape}}
  {{/each}}
{{/if}}

ดาวน์โหลด:
{{#each exports}}
  - {{this.title | html_escape}} ({{this.format}}) — {{this.download_url | html_escape}}
{{/each}}

ดูทั้งหมดใน SmartSpecPro:
{{dashboard_url}}
```

> **Note**: Plain-text fallback template MUST be provided alongside HTML for enterprise email clients that strip emoji/HTML. Per-item failure details included when `failed_count > 0`.
>
> **download_url values**: MUST be public-access R2 object URLs (NOT presigned URLs with query string credentials). `upload_batch_to_r2()` returns public R2 URLs; if the storage strategy changes to presigned URLs, the email template must strip query parameters before rendering.
>
> **Plain-text template** (minimal):
> ```
> Content Automation "{{spec_name}}": {{success_count}}/{{total_count}} items completed.
> Credits used: {{credits_used}}
> {{#if has_failures}}Failed: {{failed_count}} items{{/if}}
> {{#each exports}}
> - {{this.title}} ({{this.format}}): {{this.download_url}}
> {{/each}}
> View in SmartSpecPro: {{dashboard_url}}
> ```

### 10.2.1 Auto-pause notification

When `consecutive_failures >= 3` triggers an automatic pause, the system MUST send a notification to inform the user. The `status = 'paused'` is set atomically in the same SQL as the `consecutive_failures` increment (CASE WHEN clause), and `notify_spec_paused()` is called AFTER the DB update. This ordering is intentional — if the notification fails, the spec is still paused (safety-first), and the failure is logged as `content_auto.notify_failed`.

**Email template: `content-automation-paused`**:
```
Subject: ⚠ Content Automation "{{spec_name | strip_html}}" หยุดชั่วคราว

Content Automation "{{spec_name | html_escape}}" ถูกหยุดอัตโนมัติเนื่องจากล้มเหลว 3 ครั้งติดต่อกัน

ข้อผิดพลาดล่าสุด:
{{last_error | html_escape}}

กรุณาตรวจสอบและแก้ไขปัญหา จากนั้นกด "Resume" ในหน้า Content Automation Dashboard:
{{dashboard_url}}
```

**Implementation**: Called from the batch task's except block AND from the try block when `run_status == "failed"` and the `consecutive_failures` UPDATE returns `consecutive_failures >= 3`. Also dispatches the `on_error` webhook configured in `notification.on_error[]` of the Content Spec YAML.

### 10.3 Webhook payload

**SECURITY**: Webhook URL MUST pass SSRF validation (§12.5) before every outbound request. Payload MUST be built using `json.dumps()` — NEVER string interpolation/concatenation (prevents JSON injection via topic strings containing `"` or `\n`).

**HMAC Webhook Signature**: Every outbound webhook request MUST include an `X-SmartSpec-Signature: sha256=<hmac_hex>` header. The HMAC is computed over the raw JSON body using a per-spec `webhook_secret` (generated at Content Spec creation, stored encrypted via `crypto.ts` in `content_specs.webhook_secret_encrypted`). This allows receiving systems to verify payload authenticity and prevent spoofing/replay attacks.

Sending (Python):
```python
import hmac, hashlib
signature = hmac.new(webhook_secret.encode(), raw_body, hashlib.sha256).hexdigest()
headers["X-SmartSpec-Signature"] = f"sha256={signature}"
```

Receiving (verification — MUST use constant-time comparison):
```python
expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
if not hmac.compare_digest(expected, received_signature):  # NOT ==
    raise ValueError("Invalid signature")
```

Webhook delivery is best-effort: 3 attempts with 5-second exponential backoff. Failure is logged as `content_auto.notify_failed` and does not affect run status.

`on_error` webhooks use `event: "content_automation.failed"` for run failures and `event: "content_automation.paused"` for auto-pause.

Pattern follows GitHub/Stripe webhook signing conventions.

> **Note**: The webhook always sends the fixed schema below. User-defined `payload_template` is NOT supported in Phase 1-2 (rejected by `ContentSpecValidator` — template injection risk). If templating is added in the future, it MUST use a sandboxed engine with an explicit allowlist of variables.

```json
{
  "event": "content_automation.completed",
  "spec_id": 42,
  "spec_name": "BellaGlow Daily Posts",
  "run_id": 1234,
  "timestamp": "2026-03-10T08:05:23Z",
  "summary": {
    "requested": 3,
    "completed": 3,
    "failed": 0,
    "credits_used": 150
  },
  "items": [
    {
      "topic": "เคล็ดลับดูแลผิวหน้าสำหรับหน้าฝน",
      "output_type": "slide",
      "deck_id": 142,
      "status": "success",
      "download_urls": {
        "png": ["https://r2.example.com/content-auto/.../slide-1.png", "..."]
      },
      "caption": "เคล็ดลับดูแลผิวหน้าช่วงหน้าฝน... #skincare #beauty"
    }
  ]
}
```

---

## 11. Future: Social Media Auto-Posting (Phase 3+ design direction)

> **Note**: Phase 1-2 ไม่ implement social posting — เฉพาะ design API contract เพื่อ future-proofing

### 11.1 Architecture concept

```
Content Automation Engine
         │
    Post-generation hook
         │
    ┌────┴────┐
    │ Social  │
    │ Media   │
    │ Router  │
    └────┬────┘
         │
    ┌────┼────┬────────┬────────┐
    │    │    │        │        │
   FB   YT  TikTok    X    Instagram
    │    │    │        │        │
    ▼    ▼    ▼        ▼        ▼
  Platform-specific APIs
```

### 11.2 Social media spec extension (future)

```yaml
# Extension to Content Spec
# SECURITY: spec_data JSON MUST NOT contain plaintext secrets (tokens, keys, passwords).
# Platform credentials are stored in system_settings with isSensitive: true
# and referenced here by symbolic key name only.
social_posting:
  enabled: false              # Phase 3+
  platforms:
    - platform: "facebook"
      page_id_ref: "system_settings:fb_page_id"        # reference, NOT inline value
      access_token_ref: "system_settings:fb_access_token"  # encrypted in system_settings
      auto_post: true
      post_delay_minutes: 30   # delay after creation for human review
      review_required: true    # require human approval before posting

    - platform: "youtube"
      channel_id_ref: "system_settings:yt_channel_id"   # reference, NOT inline value
      auto_post: false         # Phase 3: upload draft, don't publish
      visibility: "unlisted"   # default: unlisted for review

    - platform: "tiktok"
      # TikTok requires video format
      auto_post: false
```

> **Security note**: The `{{encrypted:...}}` notation from an earlier draft is deprecated. All platform credentials MUST be stored in `system_settings` table with `isSensitive: true` (auto-encrypted) and referenced by key name in `spec_data`. `ContentSpecValidator` rejects any field named `*token`, `*key`, `*secret`, `*password`, `*credential` to prevent accidental plaintext storage.

### 11.3 Platform API integration pattern

```python
class SocialMediaPoster(ABC):
    """Abstract base for social media posting."""

    @abstractmethod
    async def post(self, content: SocialContent) -> PostResult: ...

    @abstractmethod
    async def check_auth(self) -> bool: ...

    @abstractmethod
    async def get_analytics(self, post_id: str) -> PostAnalytics: ...

class SocialContent(BaseModel):
    """Unified content for all platforms."""
    text: str               # caption/description
    media_urls: list[str]   # image or video URLs
    media_type: str         # "image" | "video" | "carousel"
    hashtags: list[str]
    scheduled_at: datetime | None
    platform_specific: dict  # platform-specific metadata
```

---

## 12. Security & controls

### 12.1 Rate limits

| Control | Limit | Applies to | Enforcement |
|---------|-------|-----------|-------------|
| Auto Draft per user | 10 per hour (interactive) / 50 per hour (batch) | Both `builtin-auto-draft` tool AND `auto_draft_pipeline()` directly | Redis INCR+EXPIRE (`rate:auto_draft:{userId}`, TTL 3600s). **IMPORTANT**: Rate limit MUST be enforced inside `auto_draft_pipeline()` itself (not only the tool handler) so the Content Automation batch path cannot bypass it. Batch path uses a separate, higher ceiling (50/hr) to accommodate legitimate batch workflows while preventing abuse |
| Batch items per request | Max 50 | File upload batch | Zod validation in handler |
| Batch items per day | Max 100 | Per user | Redis counter (`daily:batch:{userId}`, midnight reset) |
| Concurrent auto-drafts | Max 3 | Per user | Redis semaphore (pattern from `redisSemaphore.ts`). Note: `release()` has a non-atomic EXISTS+DECR race window — acceptable under normal TTL (300s). **Recommended**: replace with a single Lua script (`if redis.call('EXISTS',k)==1 then return redis.call('DECR',k) end`) for atomicity. Implementors SHOULD monitor `rate:concurrent_draft:{userId}` Redis key values and alert if any go below 0. A periodic cleanup job should `DEL` any keys with value < 0 |
| Items per trigger | Max 10 | Per schedule item | `ContentSpecValidator.MAX_ITEMS_PER_TRIGGER` (distinct from 100/day per-user Redis limit) |
| Content Spec schedules | Max 10 active | Per user | DB count check on CREATE |
| Daily credit limit | Configurable per spec | Content Automation Engine | Atomic SQL check (§9.3) |
| Monthly credit limit | Configurable per spec | Content Automation Engine | Atomic SQL check (§9.3) |
| File upload size | 5 MB | `builtin-file-parse` | Middleware + SheetJS `sheetRows` limit |
| Max file rows | 100 | CSV/Excel parsing | Post-parse check + SheetJS `sheetRows: 101` |
| Cron minimum interval | 1 hour | Content Spec / schedule-draft | `validate_cron_min_interval()` (Python port of `validateCronExpression` from `scheduledMessages.ts`) |

### 12.2 Credit controls

```python
# ATOMIC credit budget check — prevents TOCTOU race condition
# Uses SQL atomic increment instead of read-modify-write pattern

async def atomic_budget_reserve(spec_id: int, estimated_cost: int, tenant_id: str) -> bool:
    """Atomically reserve credit budget against content_specs counters.
    Returns True if budget is available and reserved.

    NOTE: User-account balance is NOT checked here. It is enforced inside
    auto_draft_pipeline() via the existing deductCreditsForModel pattern
    (creditService.ts) which raises CreditInsufficientError. The batch task
    catches that error and calls atomic_budget_rollback() to undo the
    reservation. This avoids the TOCTOU gap of a non-atomic user-balance
    pre-check.

    Defense-in-depth: tenant_id in WHERE clause prevents cross-tenant
    credit manipulation even if spec_id is tampered with (§12.8)."""
    if estimated_cost <= 0:
        raise ValueError(f"estimated_cost must be positive, got: {estimated_cost}")
    result = await db.execute(text("""
        UPDATE content_specs
        SET credits_used_today = credits_used_today + :cost,
            credits_used_month = credits_used_month + :cost
        WHERE id = :spec_id AND tenant_id = :tenant_id
          AND (daily_credit_limit IS NULL OR credits_used_today + :cost <= daily_credit_limit)
          AND (monthly_credit_limit IS NULL OR credits_used_month + :cost <= monthly_credit_limit)
        RETURNING id
    """), {"spec_id": spec_id, "cost": estimated_cost, "tenant_id": tenant_id})
    # NOTE: Do NOT use result.rowcount — it is unreliable for RETURNING queries
    # in SQLAlchemy async (may return 0 even when a row was matched and returned).
    # Use fetchone() to check if the UPDATE actually returned a row.
    return result.fetchone() is not None

async def atomic_budget_rollback(spec_id: int, amount: int, tenant_id: str):
    """Roll back reserved budget when a batch item fails (e.g., CreditInsufficientError).
    Called to undo atomic_budget_reserve so counters stay accurate."""
    await db.execute(text("""
        UPDATE content_specs
        SET credits_used_today = GREATEST(0, credits_used_today - :amount),
            credits_used_month = GREATEST(0, credits_used_month - :amount)
        WHERE id = :spec_id AND tenant_id = :tenant_id
    """), {"spec_id": spec_id, "amount": amount, "tenant_id": tenant_id})

async def atomic_credit_adjust(spec_id: int, estimated_cost: int, actual_cost: int, tenant_id: str):
    """Adjust credit counters after item completion.
    Only applies the DELTA (actual - estimated) to avoid double-counting,
    since atomic_budget_reserve already incremented by estimated_cost.
    Uses GREATEST(0,...) floor to prevent negative counters from undercount."""
    delta = actual_cost - estimated_cost
    if delta == 0:
        return
    await db.execute(text("""
        UPDATE content_specs
        SET credits_used_today = GREATEST(0, credits_used_today + :delta),
            credits_used_month = GREATEST(0, credits_used_month + :delta)
        WHERE id = :spec_id AND tenant_id = :tenant_id
    """), {"spec_id": spec_id, "delta": delta, "tenant_id": tenant_id})
```

### 12.3 File parsing security

- **Sanitize all cell values**: strip HTML/script tags
- **Formula injection defense**: Strip leading `=`, `+`, `-`, `@` characters from all cell values (standard CSV/Excel injection markers). These are formula prefixes that can execute when re-exported to spreadsheet apps
- **No formula execution**: Excel formulas not evaluated — use `xlsx.read(buffer, { sheetRows: 101 })` to limit rows at library level
- **Zip bomb guard**: `.xlsx` files are ZIP archives. After unzipping, abort if total uncompressed XML exceeds 50 MB. Wrap SheetJS parse in a worker thread with memory limit to prevent OOM
- **Path traversal protection**: `file_url` validated via Pydantic/Zod regex — ONLY allow project's R2/S3 host prefix (`https://<account>.r2.cloudflarestorage.com/`) and `/uploads/` internal paths. Block `file://`, `gopher://`, `dict://`, `ftp://` schemes explicitly (see §12.5 SSRF validation)
- **Size limit**: 5 MB max file, 100 rows max. Node.js handler MUST issue a `HEAD` request to get `Content-Length` header and reject before streaming if size exceeds 5 MB. If `Content-Length` is absent, stream with a byte counter and abort at 5 MB
- **Content validation**: each cell max 5000 chars, reject binary data
- **MIME detection for `file_type: "auto"`**: Detect by magic bytes, NOT file extension or Content-Type header (both attacker-controlled). CSV: first 512 bytes must be valid UTF-8 text. XLSX: validate ZIP magic bytes (`PK\x03\x04`). Add max single-line length guard for CSV (50,000 bytes per line)
- **Column validation**: `topic_column` MUST match an actual column header in the parsed sheet — never fall back silently to column 0. `params_columns` entries must reference existing columns. Return clear 400 error if not found
- **Prompt injection guard**: All file-derived content (topics, article text) MUST be placed in `HumanMessage` / `user` role when sent to LLM — NEVER interpolated into system prompts (see §12.6)

### 12.4 Content Spec validation

```python
class ContentSpecValidator:
    MAX_SCHEDULE_ITEMS = 10
    MAX_TOPICS_PER_LIST = 365     # 1 year of daily topics
    MAX_ITEMS_PER_TRIGGER = 10   # max count per single schedule item trigger
    MAX_SLIDES_PER_ITEM = 30
    MAX_AI_PROMPT_LENGTH = 1000   # max chars for ai_generated.prompt
    ALLOWED_OUTPUT_TYPES = {"slide", "video", "presentation"}
    ALLOWED_ROTATIONS = {"sequential", "random", "smart"}
    # Reject secret-like fields stored in spec_data JSON (plaintext!)
    FORBIDDEN_FIELD_PATTERNS = {"*token", "*key", "*secret", "*password", "*credential"}
    # Use literal space instead of \s to prevent tabs, \r, \n, \v, \f from passing
    # (control characters produce malformed R2 object keys)
    CHANNEL_NAME_PATTERN = r"^[\w][\w \-\.]{0,99}$"  # must start with \w (letter/digit/_), no path separators
    # NOTE: \w includes Unicode (Thai, Chinese, etc.) which is valid for display
    # but may cause issues with presigned URLs and some S3 SDKs.
    # render_folder_pattern() MUST percent-encode or transliterate the channel.name
    # component before using it as an R2 object key segment.

    def validate(self, spec_data: dict) -> list[str]:
        """Return list of validation errors (empty = valid)."""
        errors = []
        # Reject system-reserved keys (starting with _) in user-supplied spec_data
        for key in spec_data:
            if key.startswith("_"):
                errors.append(f"Key '{key}' is system-reserved — user spec_data keys must not start with '_'")
        # Validate spec name (no control characters — header injection prevention)
        spec_name = spec_data.get("name", "")
        if spec_name and ("\r" in spec_name or "\n" in spec_name or "\t" in spec_name):
            errors.append("spec name must not contain control characters (\\r, \\n, \\t)")
        # Require at least one schedule item
        schedule_items = spec_data.get("schedule", {}).get("items", [])
        if not schedule_items:
            errors.append("schedule.items must contain at least one item")
            return errors  # no point validating further
        # Enforce MAX_SCHEDULE_ITEMS
        if len(schedule_items) > self.MAX_SCHEDULE_ITEMS:
            errors.append(f"schedule.items exceeds maximum of {self.MAX_SCHEDULE_ITEMS}")
        # Validate per-item constraints
        for i, item in enumerate(schedule_items):
            # output_type validation
            ot = item.get("output_type", "presentation")
            if ot not in self.ALLOWED_OUTPUT_TYPES:
                errors.append(f"items[{i}].output_type must be one of {self.ALLOWED_OUTPUT_TYPES}, got: {ot!r}")
            # count validation
            count = item.get("count", 1)
            if not isinstance(count, int) or count < 1 or count > self.MAX_ITEMS_PER_TRIGGER:
                errors.append(f"items[{i}].count must be 1-{self.MAX_ITEMS_PER_TRIGGER}")
            # topic_source.type validation
            src = item.get("topic_source", {})
            src_type = src.get("type")
            if src_type not in {"rotating_list", "ai_generated", "file", "fixed", None}:
                errors.append(f"items[{i}].topic_source.type unknown: {src_type!r}")
            # rotating_list.rotation validation
            if src_type == "rotating_list":
                rot = src.get("rotation", "sequential")
                if rot not in self.ALLOWED_ROTATIONS:
                    errors.append(f"items[{i}].topic_source.rotation must be one of {self.ALLOWED_ROTATIONS}")
                topics_list = src.get("topics", [])
                if len(topics_list) > self.MAX_TOPICS_PER_LIST:
                    errors.append(f"items[{i}].topic_source.topics exceeds maximum of {self.MAX_TOPICS_PER_LIST}")
            # constraints.max_slides validation
            constraints = item.get("constraints", {})
            max_slides = constraints.get("max_slides")
            if max_slides is not None and (not isinstance(max_slides, int) or max_slides > self.MAX_SLIDES_PER_ITEM):
                errors.append(f"items[{i}].constraints.max_slides must be <= {self.MAX_SLIDES_PER_ITEM}")
        # Validate boolean fields are strictly bool (not truthy strings)
        output_meta = spec_data.get("output", {}).get("metadata", {})
        for bool_field in ("include_caption", "include_hashtags", "generate_audio"):
            val = output_meta.get(bool_field)
            if val is not None and not isinstance(val, bool):
                errors.append(f"output.metadata.{bool_field} must be boolean, got {type(val).__name__}")
        # Validate cron expressions: minimum 1-hour interval
        for item in spec_data.get("schedule", {}).get("items", []):
            if item.get("cron"):
                cron_errors = validate_cron_min_interval(item["cron"], min_minutes=60)
                errors.extend(cron_errors)
        # Reject fields that look like secrets (recursive, case-insensitive)
        self._check_forbidden_fields(spec_data, errors)
        # Reject payload_template (template injection risk — §12.6)
        if "payload_template" in str(spec_data):
            errors.append("payload_template is not supported — use the fixed webhook schema from §10.3")
        # Validate channel.language and channel.platform at ingestion
        # (same allowlists as generate_social_caption — fail fast, not at runtime)
        ALLOWED_LANGUAGES = {"th", "en", "auto"}
        ALLOWED_PLATFORMS = {"facebook", "youtube", "tiktok", "x", "instagram"}
        ch_lang = spec_data.get("channel", {}).get("language")
        if ch_lang and ch_lang not in ALLOWED_LANGUAGES:
            errors.append(f"channel.language must be one of {ALLOWED_LANGUAGES}, got: {ch_lang!r}")
        ch_platform = spec_data.get("channel", {}).get("platform")
        if ch_platform and ch_platform not in ALLOWED_PLATFORMS:
            errors.append(f"channel.platform must be one of {ALLOWED_PLATFORMS}, got: {ch_platform!r}")
        # Validate channel.name against safe pattern (prevent R2 path traversal)
        channel_name = spec_data.get("channel", {}).get("name", "")
        if not re.match(self.CHANNEL_NAME_PATTERN, channel_name):
            errors.append(f"channel.name contains invalid characters: {channel_name[:50]}")
        # Validate subject_template: no newlines (header injection), max 200 chars,
        # only allowed placeholders (count, spec_name, date)
        ALLOWED_SUBJECT_PLACEHOLDERS = {"count", "spec_name", "date"}
        for notif in spec_data.get("notification", {}).get("on_complete", []):
            subj = notif.get("subject_template", "")
            if "\r" in subj or "\n" in subj:
                errors.append("subject_template must not contain newline characters (email header injection)")
            if len(subj) > 200:
                errors.append("subject_template exceeds 200 chars")
            subj_placeholders = set(re.findall(r"\{\{(\w+)", subj))
            invalid_subj = subj_placeholders - ALLOWED_SUBJECT_PLACEHOLDERS
            if invalid_subj:
                errors.append(f"subject_template has unsupported placeholders: {invalid_subj}")
        # Validate ai_generated prompt length + rotating_list non-empty
        for item in spec_data.get("schedule", {}).get("items", []):
            src = item.get("topic_source", {})
            if src.get("type") == "ai_generated" and len(src.get("prompt", "")) > self.MAX_AI_PROMPT_LENGTH:
                errors.append(f"ai_generated.prompt exceeds {self.MAX_AI_PROMPT_LENGTH} chars")
            if src.get("type") == "rotating_list" and len(src.get("topics", [])) == 0:
                errors.append("rotating_list.topics must contain at least one topic")
            if src.get("type") == "fixed":
                topic = src.get("topic", "")
                if len(topic) < 3 or len(topic) > 1000:
                    errors.append(f"fixed topic_source.topic must be 3-1000 chars (matches AutoDraftRequest.topic constraint), got {len(topic)}")
        return errors

    def _check_forbidden_fields(self, data: dict | list, errors: list, path: str = ""):
        """Recursively traverse all nested dicts/lists in spec_data.
        Case-insensitive glob matching using fnmatch.
        Rejects any key matching *token, *key, *secret, *password, *credential."""
        import fnmatch
        if isinstance(data, dict):
            for key, value in data.items():
                key_lower = key.lower()
                for pattern in self.FORBIDDEN_FIELD_PATTERNS:
                    if fnmatch.fnmatch(key_lower, pattern):
                        errors.append(f"Forbidden field '{path}.{key}' matches secret pattern '{pattern}' — store secrets in system_settings with isSensitive: true")
                self._check_forbidden_fields(value, errors, path=f"{path}.{key}")
        elif isinstance(data, list):
            for i, item in enumerate(data):
                self._check_forbidden_fields(item, errors, path=f"{path}[{i}]")
```

### 12.5 SSRF validation (webhook URLs and file URLs)

All outbound URLs (`notify_webhook_url`, `file_url`, Content Spec `notification.on_complete[].url`) MUST pass a shared SSRF validation function before use:

```python
SSRF_BLOCKED_RANGES = [
    "127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
    "169.254.0.0/16",  # AWS IMDS, link-local
    "::1", "fd00::/8",  # IPv6 loopback, private
]
ALLOWED_SCHEMES = {"https"}  # http blocked — webhooks must use TLS

def validate_outbound_url(url: str) -> list[tuple[int, str]]:
    """Validate URL is safe for outbound HTTP requests.
    Returns list of (address_family, ip_str) tuples for the caller to pin connections to.
    Raises ValueError if URL is unsafe.

    CRITICAL: Callers MUST use the returned resolved IPs for their HTTP connection
    (e.g., httpx custom transport with forced IP). Do NOT let the HTTP client
    re-resolve DNS — this closes the DNS rebinding TOCTOU window."""
    parsed = urlparse(url)
    if parsed.scheme not in ALLOWED_SCHEMES:
        raise ValueError(f"Scheme '{parsed.scheme}' not allowed — use https only")
    # Resolve DNS (both IPv4 and IPv6) and check ALL IPs against blocklist.
    # NOTE: gethostbyname() only resolves IPv4 — a hostname pointing to ::1 or
    # fc00::/7 ULA would bypass the blocklist. Use getaddrinfo() instead.
    resolved_addrs = socket.getaddrinfo(parsed.hostname, None)
    safe_ips: list[tuple[int, str]] = []
    for family, _, _, _, sockaddr in resolved_addrs:
        ip = sockaddr[0]
        if ip_in_blocked_range(ip, SSRF_BLOCKED_RANGES):
            raise ValueError(f"URL resolves to blocked IP range")
        safe_ips.append((family, ip))
    if not safe_ips:
        raise ValueError(f"URL hostname could not be resolved")
    # Redirect following MUST be disabled (followRedirects=false) to prevent
    # rebinding via 302 → internal IP.
    # Timeout: connect=5s, read=10s
    return safe_ips

def ip_in_blocked_range(ip: str, blocked_ranges: list[str]) -> bool:
    """Check if an IP address falls within any blocked CIDR range.
    Uses ipaddress module for both IPv4 and IPv6."""
    import ipaddress
    addr = ipaddress.ip_address(ip)
    for cidr in blocked_ranges:
        if "/" in cidr:
            if addr in ipaddress.ip_network(cidr, strict=False):
                return True
        else:
            if addr == ipaddress.ip_address(cidr):
                return True
    return False
```

**Callers** of `validate_outbound_url` must thread the returned IPs:

```python
# In _resolve_file, notify_completion (webhook), etc.:
safe_ips = validate_outbound_url(url)
# Use httpx with forced IP resolution:
response = httpx.get(url, transport=PinnedTransport(safe_ips),
                     headers={"Host": parsed.hostname},
                     follow_redirects=False, timeout=httpx.Timeout(connect=5, read=10))
```

**file_url** has additional restrictions:
- ONLY allow project's R2/S3 host prefix and `/uploads/` internal paths
- Block `file://`, `gopher://`, `dict://`, `ftp://` schemes
- `resolve_library_reference()` must resolve `{{library:...}}` tokens via database lookup (query `library_items WHERE tenant_id = :tid AND filename = :name`) — never pass raw user URL to HTTP client

### 12.6 Prompt injection prevention

**CRITICAL RULE**: All user-supplied content (file-parsed topics, custom_article_text, Content Spec topic strings, ai_generated prompt results, `channel.language`, `platform`, `source.constraints` values) MUST be either:
- Placed in `HumanMessage` / `user` role when sent to any LLM, OR
- Validated against a strict allowlist before interpolation into system prompts (e.g., `language in {"th","en","auto"}`, `platform in {"facebook","youtube","tiktok","x","instagram"}`)

NEVER interpolate arbitrary user content into system prompts via f-strings or template strings.

This applies to:
- `generate_social_caption()` — topic in user turn (see §9.6 fixed example)
- `generate_topics_via_llm()` — user prompt in user turn, constraints serialized as JSON in user turn (NOT interpolated into system prompt). Constraint keys/values must be allowlist-validated before use (see §9.5)
- `auto_draft_pipeline()` — topic passed as user input to article generation skill
- Any future LLM call that accepts user-derived data

Additional guards:
- Content Spec `ai_generated.prompt` max length: 1000 chars (§12.4)
- File-parsed cell values: sanitized for HTML, formula markers, and length

### 12.7 Internal tool authentication

**ALL four `/api/internal/tools/*` endpoints** MUST be guarded by `X-Service-Token` header validation — identical to the pattern established in Spec 034 §9.4:

| Endpoint | Auth Required |
|----------|--------------|
| `POST /api/internal/tools/auto-draft` | X-Service-Token ✅ (stated in §7.1) |
| `POST /api/internal/tools/model-suggest` | X-Service-Token ✅ (adding here) |
| `POST /api/internal/tools/file-parse` | X-Service-Token ✅ (adding here) |
| `POST /api/internal/tools/schedule-draft` | X-Service-Token ✅ (adding here) |

The Node.js `_core/index.ts` mount point MUST apply the service-token middleware before all four routes (not per-route). Integration test: each endpoint must return 401/403 without the header.

### 12.8 Tenant isolation mandate

**ALL tRPC procedures** in `contentAutomation.ts` that accept `specId`, `runId`, or `scheduleId` MUST enforce tenant isolation:

```typescript
// EVERY query/mutation accepting a resource ID:
const spec = await db.query.contentSpecs.findFirst({
  where: and(eq(contentSpecs.id, input.specId), eq(contentSpecs.tenantId, ctx.tenantId)),
});
if (!spec) throw new TRPCError({ code: "NOT_FOUND" });
```

**NEVER** query by `id` alone without `WHERE tenant_id = ctx.tenantId`. This applies to:
- `getSpec`, `updateSpec`, `deleteSpec`, `pauseSpec`, `resumeSpec`
- `listRuns`, `getRunDetail` (join through `content_specs.tenant_id`)
- `createSchedule`, `deleteSchedule`, `listSchedules`

**Same rule for FastAPI endpoints** in `api/content_automation.py`:
```python
spec = await db.execute(
    select(ContentSpec).where(
        ContentSpec.id == spec_id,
        ContentSpec.tenant_id == request.state.tenant_id
    )
)
```

Celery tasks receiving `tenant_id` as parameter MUST use `raise ValueError(...)` (NOT `assert` — stripped by `python -O`) to verify `spec.tenant_id == tenant_id` before processing (see §9.4 batch task).

### 12.9 Error message sanitization

`ContentAutomationRun.error_message` and all error responses MUST sanitize exception messages before storage:
- Strip connection strings (`postgresql://...`, `redis://...`)
- Strip URL query parameters (may contain signed S3/R2 credentials)
- Mask key fragments (any 20+ character hex/base64 sequence)
- Never include full stack traces in user-facing responses

---

## 13. Data model summary

### New tables

| Table | Purpose | Phase |
|-------|---------|-------|
| `auto_draft_schedules` | Scheduled/recurring auto-draft records (NOT `workflowSchedules` — that table has NOT NULL FK to `workflows.id`). Uses BullMQ for execution dispatch (same as `scheduledMessages`) | Phase 2 |
| `content_specs` | Content Automation Spec definitions | Phase 2 |
| `content_automation_runs` | Execution log per run, with `item_errors: JSON` for per-item error details | Phase 2 |

> **Design decision**: `builtin-schedule-draft` creates `auto_draft_schedules` records, NOT `workflowSchedules`. The `workflowSchedules` table requires a NOT NULL `workflowId` FK to `workflows.id` and is designed for workflow engine node triggers — standalone auto-draft schedules have no workflow. A dedicated table avoids schema gymnastics and keeps scheduling concerns separated.

### Modified tables

| Table | Change | Phase |
|-------|--------|-------|
| None — Level 1 uses existing agency tables | — | Phase 1 |

### Reused tables (from spec 034)

| Table | Usage |
|-------|-------|
| `agency_runs` | Auto Draft Agent runs |
| `agency_run_artifacts` | Presentation artifacts |
| `agencies` / `agency_agents` / `agency_agent_tools` | Agent template storage |

### tRPC procedures — `contentAutomation` router

File: `apps/web/server/routers/contentAutomation.ts`

All procedures use `protectedProcedure` and enforce `WHERE tenant_id = ctx.tenantId`.

| Procedure | Input | Output | Behavior |
|-----------|-------|--------|----------|
| `createSpec` | `{ name: string, spec_data: object }` (spec_data validated by `ContentSpecValidator`) | `{ id, name, status, created_at }` | Validates spec_data, generates `webhook_secret` (32-byte crypto.randomBytes hex), encrypts via `crypto.ts`, stores in `webhook_secret_encrypted`. Sets `status='active'`, computes initial `next_run` via `advance_next_run`. Returns created spec. |
| `updateSpec` | `{ id: number, spec_data?: object, name?: string }` | `{ id, name, status, updated_at }` | Re-validates spec_data if changed. If `spec_data.schedule` changed, recalculates `next_run`. **Safety**: if a batch task is currently running (any `content_automation_runs` with `status='running'` for this spec), reject with 409 Conflict — "Cannot update spec while a batch task is running." |
| `deleteSpec` | `{ id: number }` | `{ success: true }` | **Pre-check**: reject with 409 if any `content_automation_runs` with `status='running'`. Otherwise, DELETE cascades to `content_automation_runs`. |
| `getSpec` | `{ id: number }` | Full `ContentSpec` row (excluding `webhook_secret_encrypted`) | Read-only. |
| `listSpecs` | `{ limit?: number, cursor?: number }` | `{ specs: ContentSpec[], nextCursor }` | Paginated, ordered by `status ASC, created_at DESC` (active specs first, then paused, then archived). Includes summary fields: `total_runs`, `credits_used_today`, `credits_used_month`, `last_run_status`. |
| `getSpecStats` | `{ id: number }` | `{ success_rate, total_items_created, avg_credits_per_run, runs_last_30_days }` | Computed from last 30 `content_automation_runs`. `success_rate = completed / (completed + failed) if (completed + failed) > 0 else null` (guard against division by zero when no runs exist or all are in-progress). |
| `listRuns` | `{ spec_id: number, limit?: number, cursor?: number }` | `{ runs: ContentAutomationRun[], nextCursor }` | Paginated by `created_at DESC`. |
| `getRunDetail` | `{ run_id: number }` | Full `ContentAutomationRun` row with `export_urls`, `item_errors` | Read-only. Query MUST join through `content_specs` and enforce `WHERE content_specs.tenant_id = ctx.tenantId` (runs table has no direct tenant_id column). |
| `pauseSpec` | `{ id: number }` | `{ success: true }` | Calls `pause_spec()` (§9.3.1). |
| `resumeSpec` | `{ id: number, force_run_now?: boolean }` | `{ success: true, test_run_dispatched?: boolean }` | Calls `resume_spec()` (§9.3.1). Returns `test_run_dispatched: true` if `force_run_now` succeeded. |
| `reExport` | `{ run_id: number }` | `{ success: true }` | Re-triggers Phase 3-5 for runs with `status='export_failed'`. Reads `topics_resolved` and `output_artifacts` JSON from the run record to reconstruct deck_ids (stored as `[{deck_id, topic, ...}]` in `output_artifacts` by Phase 2). No re-draft, no credit cost. Reject with 409 if `status != 'export_failed'`. Dispatches `content_automation_reexport_task.delay(run_id, tenant_id)`. |

### Dashboard page — `ContentAutomation.tsx`

Data-fetching uses TanStack Query calling the tRPC procedures above.

**Page sections:**
1. **Spec list** — table showing name, status badge (active/paused/disabled), next_run, credits today/month, last run status. Actions: Pause, Resume, Edit, Delete.
2. **Spec detail** (on click) — stats card (success rate, total items, avg credits) + run history table (paginated).
3. **Run detail** (on click) — per-item results with topic, status, export URL, error message. "Re-export" button visible when `status='export_failed'`.
4. **Create Spec** — form/wizard that produces the YAML structure from §9.1.

---

## 14. Delivery plan

### Phase 1 — Auto Draft Agent (2-3 weeks)

| Week | Deliverable |
|------|-------------|
| **1** | `builtin-auto-draft` tool (Node.js handler wrapping generateAIDraft) |
| **1** | `builtin-model-suggest` tool (Node.js handler) |
| **1** | Auto Draft Agent template (instructions + seed) |
| **2** | "Auto" toggle in AIDraftModal + agency run integration |
| **2** | Agency Chat entry point for Auto Draft |
| **2** | Testing: auto selection accuracy, full pipeline end-to-end |
| **3** | Polish: progress UI, error handling, credit estimation display |

### Phase 2 — Multi-Source Input + Content Automation (3-4 weeks)

| Week | Deliverable |
|------|-------------|
| **4** | `builtin-file-parse` tool (CSV/Excel/Text parsing) |
| **4** | Chat command intent detection (immediate/scheduled/recurring) |
| **4** | `builtin-schedule-draft` tool + `auto_draft_schedules` table (Alembic migration) + BullMQ integration |
| **5** | `content_specs` + `content_automation_runs` tables (Alembic migration) |
| **5** | ContentSpecParser + InputResolver |
| **5** | Content Spec editor UI (basic YAML/form editor) |
| **6** | ContentAutomationScheduler (Celery beat integration) |
| **6** | Batch execution pipeline + ExportPostProcessor |
| **7** | Notification system (email + webhook) |
| **7** | Content Automation Dashboard UI |

### Phase 3 — Social Media Integration (future, design only)

| Deliverable |
|-------------|
| Social media account connection UI |
| Platform-specific poster implementations (Facebook, YouTube, TikTok, X) |
| Post scheduling + approval workflow |
| Analytics dashboard (engagement tracking) |
| Auto-post toggle per Content Spec |

---

## 15. Acceptance criteria

### Phase 1 — Auto Draft Agent

1. User เปิด AIDraftModal → toggle "Auto" → พิมพ์ brief → presentation ถูกสร้างทั้งหมดอัตโนมัติ (skill, model, style ถูกเลือกโดย agent)
2. Auto Draft Agent เลือก article skill ที่เหมาะสมกับ domain ของ topic — verified by unit tests: agent selects a domain-specific (non-general) skill for each of the 9 core domains when given a representative brief (Business, Marketing, Education, Creative, Lifestyle, Health/Parenting, Product Review/Fashion, Product Review/Beauty, Product Review/Household). See Appendix F for sample test briefs.
3. Auto Draft Agent เลือก style preset ที่เหมาะสมกับ domain (corporate → corporate-blue, etc.)
4. ผลลัพธ์จาก Auto Draft มี quality เทียบเท่า Manual mode (same pipeline)
5. User สามารถใช้ Auto Draft ผ่าน Agency Chat ได้ด้วย (ไม่จำเป็นต้องเปิด Presentation Editor ก่อน)
6. Auto Draft with image attachment → image ถูกใช้เป็น reference image
7. `builtin-model-suggest` return model ที่เหมาะสม + cost estimate
8. Credit deduction ถูกต้อง (ตรงกับ manual mode สำหรับ params เดียวกัน)

### Phase 2 — Multi-Source + Content Automation

9. User upload CSV file (10 rows) → 10 presentations ถูกสร้าง batch
10. User upload Excel file → topics ถูก extract จาก column ที่ระบุ
11. User พิมพ์ "พรุ่งนี้ 8 โมง สร้าง slide เรื่อง X" → schedule ถูกสร้าง → ทำงานตามเวลา
12. User พิมพ์ "ทุกวัน สร้าง slide เรื่อง X" → recurring schedule ถูกสร้าง
13. Content Spec ที่กำหนด output_type="slide" → export PNG ไฟล์ของแต่ละ slide
14. Content Spec ที่กำหนด output_type="video" → export MP4
15. Notification email ส่งเมื่อ batch เสร็จ พร้อม download links
16. Webhook ส่ง JSON payload เมื่อ batch เสร็จ
17. Content Spec มี daily/monthly credit limit → ระบบหยุดเมื่อเกิน limit
18. Content Automation Dashboard แสดง: active specs, recent runs, success rate, credits used
19. Content Spec with 3 consecutive failed runs → `status` auto-set to `"paused"`, no further tasks dispatched until manually resumed
20. Content Spec with 0 schedule items → rejected at creation with 422
21. Content Spec with `daily_credit_limit = 50` — a 51-credit request is rejected; a 50-credit request succeeds — verified against the `<=` boundary in `atomic_budget_reserve` (§12.2)
22. Auto-paused Content Spec sends pause notification email to owner with last error message (§10.2.1)
23. `resumeSpec` resets `consecutive_failures = 0` atomically — a single failure after resume does NOT trigger immediate re-pause (§9.3.1)
24. `resumeSpec` with `force_run_now=true` enqueues immediate test execution (§9.3.1)
25. Content Spec deleted while batch task running → task exits cleanly, no crash/orphaned state (§9.4.2)
26. `ENABLE_CONTENT_AUTOMATION=false` → scheduler `tick()` returns early, tRPC router returns 501 (§16 Risk 8)

### Batch task integration tests (required before merge)

These tests use a real DB with test isolation, mocking only `auto_draft_pipeline()` and external services:

| # | Scenario | Setup | Assert |
|---|----------|-------|--------|
| T1 | Credit exhaustion mid-loop | Mock `auto_draft_pipeline()` to raise `CreditInsufficientError` on item 3 of 5 | `results` has 2 items, `atomic_budget_rollback` called with `2 * AVERAGE_COST_PER_DRAFT`, `run_status="failed"` |
| T2 | Export failure after all drafts | Mock `export_presentation_slides()` to raise on item 2 of 3 | `items_completed=1`, `run_status="export_failed"` (Phase 3 is infrastructure failure), `consecutive_failures` NOT incremented, `output_artifacts` written with 3 deck_ids, "Re-export" button available |
| T3 | `notify_completion` raises | Mock `notify_completion()` to raise | `run_record.status` is NOT overwritten to "failed" if it was "completed", `consecutive_failures` handled correctly |
| T4 | Tenant mismatch guard | Call task with wrong `tenant_id` | Raises `ValueError`, no `run_record` created |
| T5 | Non-credit exception mid-draft | Mock `auto_draft_pipeline()` to raise `RuntimeError` on item 2 of 4 (1 succeeds, exception on 2nd) | Budget rolled back for 3 unprocessed items: `len(topics) - len(results)` = `4 - 1 = 3` |
| T6 | All items succeed | Mock everything to succeed | `run_status="completed"`, `consecutive_failures=0`, notification sent |
| T7 | Spec deleted mid-run | Delete spec after `create_run_record` | Task exits cleanly with `spec_deleted_mid_run` log |

### Non-functional

1. Auto Draft completion ≤ 180 seconds สำหรับ 10 slides with media
2. Batch processing throughput: ≥ 3 concurrent drafts per user
3. File parsing ≤ 5 seconds for 100-row CSV
4. Schedule trigger accuracy ± 1 minute จาก cron expression
5. All auto-draft calls ผ่าน existing credit/audit pipeline
6. File upload sanitized against XSS, formula injection, path traversal
7. Content Spec validation rejects malformed/oversized specs before scheduling

### Security (must pass before merge)

1. Webhook URL resolving to private IP range (169.254.x.x, 10.x.x.x, 127.x.x.x) → returns validation error (§12.5)
2. All 4 `/api/internal/tools/*` endpoints return 401 without X-Service-Token header (§12.7)
3. File-derived topic text placed in `user` role when sent to LLM — integration test against LLM mock (§12.6)
4. `file_url` with `file://`, `gopher://`, or private IP → rejected (§12.5)
5. Cron expression `"* * * * *"` → rejected with 422 (§12.1)
6. `ContentSpecValidator` rejects `spec_data` fields named `*token`, `*key`, `*secret` (§12.4)
7. `content_automation_batch_task` raises `ValueError` (NOT `AssertionError`) when `spec.tenant_id != tenant_id` — verified under `python -O` (§9.4)
8. Error messages in `ContentAutomationRun.error_message` contain no connection strings or key fragments (§12.9)
9. All tRPC procedures and FastAPI endpoints enforce `WHERE tenant_id = ctx.tenantId` — no resource accessible cross-tenant (§12.8)
10. `generate_social_caption(platform="<script>")` raises `ValueError` even when run under `python -O` — allowlist uses `raise`, not `assert` (§9.6)
11. Webhook payloads include `X-SmartSpec-Signature` HMAC header verifiable by receiving system (§10.3)
12. `topic_template` with `{{custom_payload}}` → rejected by `ScheduleDraftRequest` validator (§8.2)

---

## 16. Risks and mitigations

### Risk 1: Auto skill selection ไม่แม่นยำ

Agent อาจเลือก skill ที่ไม่เหมาะกับ topic

**Mitigation**:
- Agent instructions มี decision table ที่ cover 7 domains หลัก
- Fallback to `general-article-writer` ถ้าไม่มั่นใจ
- ผู้ใช้สามารถ switch กลับ Manual mode ได้ทันที
- Track skill selection accuracy in metrics → improve decision table over time

### Risk 2: Batch generation drain credits

50 items × 100 credits = 5,000 credits หมดภายในนาทีเดียว

**Mitigation**:
- Credit pre-check ก่อน batch start
- Per-spec daily/monthly credit limits
- Concurrent limit (3 per user)
- Pause + notify if approaching limit

### Risk 3: Content Spec cron produces too many items

Misconfigured cron (ทุกนาที) สร้าง content ไม่หยุด

**Mitigation**:
- Minimum cron interval: 1 hour — enforced by `validate_cron_min_interval()` in both `ScheduleDraftRequest` Pydantic validator and `ContentSpecValidator.validate()`. This is stricter than the 15-minute minimum for chat-alert in `scheduledMessages.ts`
- Max 10 items per schedule trigger
- Max 100 items per day per user
- Daily credit limit auto-stops (atomic SQL check — §12.2)
- Scheduler uses `SELECT FOR UPDATE SKIP LOCKED` to prevent duplicate dispatch (§9.3)

### Risk 4: File parsing malicious content

CSV/Excel อาจมี formula injection, oversized data, หรือ binary content

**Mitigation**:
- SheetJS safe mode (no formula evaluation)
- HTML/script tag stripping
- Max 5 MB file size
- Max 100 rows, 5000 chars per cell
- Content-type validation before parsing

### Risk 5: Scheduled tasks orphaned when user deactivated

User account ถูก deactivate แต่ Content Spec schedules ยังทำงาน

**Mitigation**:
- `get_due_specs()` query JOINs against `users` table: `WHERE user.status = 'active' AND tenant.status != 'suspended'` — this is a query-level filter, NOT a post-fetch Python check (TOCTOU-safe)
- Admin can bulk-pause specs per tenant
- Specs auto-pause after 3 consecutive failures

### Risk 6: Long-running auto-draft blocks agent

`builtin-auto-draft` อาจใช้เวลา 180+ seconds

**Mitigation**:
- Agent tool timeout: 300 seconds (configurable)
- Progress reporting via Redis (agent can poll status)
- If timeout: return partial result + warning
- For batch: use Celery task (not agent tool) directly

### Risk 7: R2 storage unavailable during export phase

R2/Cloudflare outage ทำให้ Phase 5 upload ล้มเหลว แต่ presentations ถูกสร้างสำเร็จแล้วใน DB

**Mitigation**:
- Presentations with `output_type="presentation"` are always accessible via `editor_url` regardless of R2 status (no upload needed)
- For slide/video exports: store `pending_export` status in `ContentAutomationRun.output_artifacts` with the local deck_id reference
- Provide a "Re-export" action in the Dashboard that re-triggers Phase 3-5 only (no re-draft, no additional credit cost)
- R2 upload / export failures do NOT increment `consecutive_failures` — they are transient infrastructure failures, not content generation failures. In the except block: if `current_phase in ("phase3_export", "phase5_upload") and phase2_completed`, set `run_record.status = "export_failed"` instead of `"failed"`, and do NOT increment `consecutive_failures`. Phase 4 (caption) failures are NOT classified as `export_failed` — they are content/LLM failures that MUST increment `consecutive_failures`

### Risk 8: Deployment without feature flag causes uncontrolled activation

Content Automation Engine และ Celery beat task จะเริ่มทำงานทันทีที่ deploy code — ไม่มี gate

**Mitigation**:
- Require `ENABLE_CONTENT_AUTOMATION` feature flag (env var, default `false`)
- Gates:
  1. `ContentAutomationScheduler.tick()` → returns early without scanning specs
  2. tRPC `contentAutomation.*` router → returns 501 for all procedures
  3. `/api/internal/tools/schedule-draft` → returns 501
  4. `builtin-auto-draft` / `builtin-schedule-draft` tool registration → excluded from `agency_tools.py` tool list
  5. `content_automation_batch_task` → check flag at task entry and `return` early if `ENABLE_CONTENT_AUTOMATION != "true"` (self-protecting regardless of how the task is dispatched)
- **Python worker reads** `os.environ.get("ENABLE_CONTENT_AUTOMATION", "false")` **at task-entry time** (not at import time) to allow hot changes without worker restart. If not set or set to anything other than `"true"`, the task returns immediately.
- **Node.js reads** `process.env.ENABLE_CONTENT_AUTOMATION` at router mount time. tRPC procedures throw `TRPCError({ code: "NOT_IMPLEMENTED" })` when disabled.
- Allows deploying code + running migrations without activating scheduler
- Rollout per tenant via `tenants.settings.featureFlags.contentAutomation`

---

## 17. Appendix

### A. Environment variables (new)

| Variable | Service | Purpose |
|----------|---------|---------|
| `ENABLE_CONTENT_AUTOMATION` | Both | Feature flag — gates scheduler, tRPC router, schedule-draft tool (default: `false`) |
| `CONTENT_AUTO_MAX_CONCURRENT` | Python | Max concurrent auto-drafts per user (default: 3) |
| `CONTENT_AUTO_MAX_DAILY_ITEMS` | Python | Max items per day per user (default: 100) |
| `CONTENT_AUTO_BATCH_MAX_ROWS` | Node.js | Max rows in uploaded file (default: 100) |

### B. New files

| File | Purpose |
|------|---------|
| `apps/web/server/routes/internalToolsAutoDraft.ts` | Auto Draft tool handler |
| `apps/web/server/routes/internalToolsModelSuggest.ts` | Model Suggest tool handler |
| `apps/web/server/routes/internalToolsFileParse.ts` | File Parse tool handler |
| `apps/web/server/routes/internalToolsScheduleDraft.ts` | Schedule Draft tool handler |
| `python-backend/app/services/content_automation_scheduler.py` | Celery beat scheduler |
| `python-backend/app/services/content_automation_engine.py` | Batch orchestration, `render_folder_pattern()` |
| `python-backend/app/services/input_resolver.py` | Topic source resolution |
| `python-backend/app/tasks/content_automation_tasks.py` | Celery tasks |
| `python-backend/app/models/content_automation.py` | DB models |
| `python-backend/app/api/v1/content_automation.py` | FastAPI endpoints |
| `apps/web/server/routers/contentAutomation.ts` | tRPC router for Content Automation Dashboard (CRUD specs, list runs, pause/resume) |
| `apps/web/client/src/pages/ContentAutomation.tsx` | Dashboard page |
| `apps/web/client/src/components/content-automation/ContentSpecEditor.tsx` | Spec editor |

### C. Modified files

| File | Change |
|------|--------|
| `apps/web/client/src/components/presentation/AIDraftModal.tsx` | Add "Auto" toggle mode |
| `python-backend/app/services/agency_tools.py` | Register 4 new builtin tools |
| `apps/web/server/_core/index.ts` | Mount 4 new internal tool routes |
| `apps/web/drizzle/seed.ts` | Add Auto Draft Agent template |
| `python-backend/app/core/celery_app.py` | Register content automation beat schedule + `reset-daily-credit-counters` task |

### D. Relationship to Spec 034 changes

Spec 034 currently defines `Deck Builder Agent` template ใน Section 10.4. **ไม่ต้องแก้ไข** — ทั้งสอง agents อยู่คู่กัน:

| Agent | Spec | Use Case |
|-------|------|----------|
| Deck Builder | 034 | Agent workflow chain (slides only, fast) |
| Auto Draft | 035 | End-user one-shot (full media, complete) |

**Cross-reference needed in Spec 034**:
- Section 7.5 (Deck Builder) → add note: "For full media presentation with auto option selection, see Spec 035 Auto Draft Agent"
- Section 17 (Delivery) → add note: "Auto Draft Agent delivery tracked separately in Spec 035"

### E. `image_model: "auto"` resolution

When `image_model = "auto"` (Level 1 agent-driven or Level 3 batch), the system resolves the model using a shared helper:

```python
async def resolve_default_media_model(tenant_id: str, purpose: str = "image") -> str:
    """Shared model resolution — used by both agent tool and batch pipeline.
    Calls the same logic as builtin-model-suggest (getModelsByTypeAsync)
    to ensure consistent model selection regardless of call path."""
    # 1. Query tenant-visible enabled models via getModelsByTypeAsync()
    # 2. Filter by purpose
    # 3. Return the top-ranked model for quality="balanced"
    # 4. Fallback: platform default model if no tenant models available
```

Both `builtin-auto-draft` handler and `content_automation_batch_task` call this helper when `image_model_id` is `None` or `"auto"`.

**`article_skill: "auto"` resolution**: In agent-driven mode (Level 1), the agent selects the article skill via `builtin-skill-discovery` + decision table. In batch mode (Level 3), `content_automation_batch_task` calls `auto_draft_pipeline()` directly — the agent does not run. When `article_skill` is `"auto"` or unset in the Content Spec, the batch pipeline falls back to `general-article-writer` (same fallback as the slug-not-found case in §7.1).

### F. Sample test briefs for AC#2 (skill selection accuracy)

| # | Brief (Thai) | Expected Domain | Expected Skill |
|---|---|---|---|
| 1 | "กลยุทธ์การตลาดสำหรับ SME ไทย 2026" | Business | business-article-writer |
| 2 | "แคมเปญโฆษณาออนไลน์สำหรับแบรนด์เครื่องสำอาง" | Marketing | marketing-article-writer |
| 3 | "บทเรียนออนไลน์สอน Python เบื้องต้น" | Education | education-article-writer |
| 4 | "เรื่องสั้นแฟนตาซีในโลกอนาคต" | Creative | creative-story-writer |
| 5 | "เคล็ดลับการดูแลผิวหน้าในหน้าฝน" | Lifestyle | lifestyle-article-writer |
| 6 | "การเลี้ยงลูกวัย 3-5 ปีให้มีพัฒนาการสมวัย" | Health/Parenting | parenting-article-writer |
| 7 | "รีวิวเสื้อกันหนาว Uniqlo รุ่นใหม่ 2026" | Product Review/Fashion | fashion-clothing-reviewer |
| 8 | "รีวิวครีมกันแดดยี่ห้อ XXX SPF50" | Product Review/Beauty | beauty-skincare-reviewer |
| 9 | "รีวิวเครื่องฟอกอากาศ Xiaomi รุ่น Pro 2" | Product Review/Household | household-product-reviewer |

Unit tests should verify the agent decision table routes each brief to the expected skill slug (not `general-article-writer`).

### G. Helper function signatures and imports

Required imports for `content_automation_tasks.py`:

```python
import os, time, hashlib, hmac
from datetime import datetime, timedelta, timezone
from billiard.exceptions import SoftTimeLimitExceeded  # BaseException in Celery 5.x
from celery import current_app as celery_app
from sqlalchemy import text

class CreditInsufficientError(Exception):
    """Raised by auto_draft_pipeline() when Node.js handler returns
    HTTP 402 with error_code='CREDIT_INSUFFICIENT'."""
```

#### `auto_draft_pipeline()` — transport and return type

```python
@dataclass
class AutoDraftPipelineResult:
    deck_id: int
    editor_url: str
    credits_used: int
    slide_count: int

async def auto_draft_pipeline(
    topic: str,
    params: dict,
    tenant_id: str,
    user_id: int,
    trace_source: str,
) -> AutoDraftPipelineResult:
    """Internal HTTP call to Node.js builtin-auto-draft handler.
    Transport: POST /api/internal/tools/auto-draft with X-Service-Token header.
    The Node.js handler calls generateAIDraft() and returns the result.
    Raises CreditInsufficientError (HTTP 402), RuntimeError (HTTP 5xx)."""
    response = await internal_http_client.post(
        "http://localhost:3000/api/internal/tools/auto-draft",
        json={"topic": topic, **params, "tenant_id": tenant_id, "user_id": user_id},
        headers={"X-Service-Token": SERVICE_TOKEN},
    )
    if response.status_code == 402:
        raise CreditInsufficientError(response.json().get("message", "Credit insufficient"))
    response.raise_for_status()
    data = response.json()
    return AutoDraftPipelineResult(
        deck_id=data["deck_id"], editor_url=data["editor_url"],
        credits_used=data["credits_used"], slide_count=data["slide_count"],
    )
```

#### Other helper signatures

```python
async def load_content_spec(spec_id: int, *, fresh_session: bool = False) -> ContentSpec | None:
    """Load ContentSpec by PK. Returns None if not found.
    Use fresh_session=True after an UPDATE (bypasses SQLAlchemy identity map cache)."""

async def load_run_record(run_id: int) -> ContentAutomationRun | None:
    """Load ContentAutomationRun by PK. Returns None if not found."""

async def load_deck(deck_id: int) -> Deck | None:
    """Load presentation deck by PK. Returns None if not found."""

async def advance_next_run(spec: ContentSpec) -> None:
    """Compute next fire time for all schedule items using croniter.
    Uses spec.spec_data['schedule']['timezone'] for timezone-aware matching.
    Stores per-item timestamps in spec_data['_item_next_runs'].
    Sets spec.next_run = MIN(_item_next_runs.values()).
    Uses CAS guard on current next_run value to prevent concurrent overwrites.
    NOTE: Called from both Python (scheduler tick) and Node.js (createSpec tRPC via
    internal HTTP endpoint POST /api/internal/content-automation/advance-next-run)."""

async def notify_completion(spec: ContentSpec, run: ContentAutomationRun,
                            exports: list[dict], download_urls: list[str]) -> None:
    """Dispatch on_complete notifications per spec.notification.on_complete config.
    Sends email (type='email') and webhook (type='webhook') in sequence.
    Webhook uses validate_outbound_url() with pinned IPs. Raises on first failure."""

async def notify_spec_paused(spec: ContentSpec, last_error: str) -> None:
    """Send pause notification email + on_error webhook.
    Template: 'content-automation-paused' (§10.2.1)."""

async def upload_batch_to_r2(exports: list[dict], folder: str) -> list[str]:
    """Upload export artifacts to R2/S3. Returns list of public download URLs.
    Iterates exports, calling upload_to_r2() for each item."""

async def upload_to_r2(export: dict, folder: str) -> str:
    """Upload a single export artifact to R2/S3. Returns public download URL."""

async def persist_rotation_offset(spec_id: int, schedule_item_index: int, topic_count: int) -> None:
    """Atomically update _rotation_offsets[schedule_item_index] += topic_count.
    Uses CAS guard: UPDATE content_specs SET spec_data = jsonb_set(...)
    WHERE id = :spec_id AND spec_data->'_rotation_offsets'->>:idx = :old_value.
    If CAS fails (concurrent update), retry once then log warning and continue."""

def _smart_pick(topics: list[str], spec_id: int, tenant_id: str, count: int) -> list[str]:
    """AI-based topic selection: pick least-recently-used topics.
    Query: content_automation_runs WHERE spec_id = :spec_id AND tenant_id = :tenant_id
    ORDER BY created_at DESC LIMIT 30, extract topics_resolved → count usage.
    SECURITY: tenant_id MUST be passed to the query (not inferred from spec_id alone)
    to prevent cross-tenant data leakage if spec_id is guessed."""

def merge_defaults(spec_defaults: dict, item_params: dict) -> dict:
    """Shallow merge: {**spec_defaults, **item_params} — item-level params take precedence."""
    return {**spec_defaults, **item_params}

async def generate_topics_via_llm(prompt: str, count: int, constraints: dict) -> list[str]:
    """Generate topic ideas using LLM. Returns list[str] of exactly `count` topics.
    If LLM returns fewer, pads with generic fallbacks. Raises RuntimeError on LLM failure."""

async def parse_file_to_items(file_url: str, column: str) -> list[InputItem]:
    """Download and parse CSV/Excel/text file. Same logic as builtin-file-parse handler.
    Uses validate_outbound_url() with pinned IPs for the download."""

def resolve_library_reference(file_url: str, tenant_id: str) -> str:
    """Resolve {{library:filename}} tokens via DB lookup.
    Query: library_items WHERE tenant_id = :tid AND filename = :name.
    Returns the resolved R2 URL or raises ValueError if not found."""

def sanitize(message: str) -> str:
    """Strip sensitive patterns from error messages before logging or storing.
    Removes: connection strings (postgresql://...), URL query params (?key=...),
    long hex/base64 tokens (>20 chars), file paths containing /home/ or /app/.
    Max output length: 500 chars."""

def validate_r2_folder_path(folder: str) -> None:
    """Validate R2 folder path against traversal attacks.
    Raises ValueError if path contains '..', does not start with 'content-auto/',
    or contains disallowed characters after URL decoding."""
    from urllib.parse import unquote
    from pathlib import PurePosixPath
    normalized = str(PurePosixPath(unquote(folder)))
    if ".." in normalized or not normalized.startswith("content-auto/"):
        raise ValueError(f"R2 folder path traversal detected: {folder[:50]}")
```

### H. Alembic migration guidance

#### Migration order

Phase 1 (Week 4): `auto_draft_schedules` table only.
Phase 2 (Week 5): `content_specs` + `content_automation_runs` tables.

```bash
# Phase 1 migration
cd python-backend
alembic revision --autogenerate -m "add_auto_draft_schedules_table"
alembic upgrade head

# Phase 2 migration
alembic revision --autogenerate -m "add_content_automation_tables"
alembic upgrade head
```

#### Table creation order (FK dependencies)

`upgrade()`: `content_specs` THEN `content_automation_runs` (FK on `spec_id`)
`downgrade()`: `content_automation_runs` THEN `content_specs` (reverse FK order)

#### Notes

- `content_specs.webhook_secret_encrypted` cannot be pre-populated in migration — it is generated per-spec at `createSpec` time via `crypto.randomBytes(32)`. Migration creates the column as `nullable=True`.
- `auto_draft_schedules.draft_params` is a JSON column — no migration needed for schema evolution of its contents.
- The code MUST handle the case where tables don't exist yet (Phase 1 code deployed before Phase 2 migration). The feature flag `ENABLE_CONTENT_AUTOMATION` gates all access.

### I. Rollback plan

If the feature must be disabled after deployment:

1. **Disable flag**: Set `ENABLE_CONTENT_AUTOMATION=false` in all worker `.env` files → stops new dispatches immediately (scheduler tick returns early, tRPC returns 501, batch task self-checks).
2. **Flush queued tasks** (optional): `celery -A app.core.celery_app purge -Q content_automation` — removes tasks already in the queue but not yet started.
3. **In-flight tasks**: Tasks currently executing will complete normally (they are past the flag gate). Alternatively, revoke specific tasks: `celery -A app.core.celery_app call celery.control.revoke --args='["task_id"]'`.
4. **Clean up zombie runs**: Run cleanup immediately: `celery -A app.core.celery_app call app.tasks.content_automation_tasks.cleanup_old_runs`
5. **Tables are safe to retain**: The feature flag prevents all access. Alembic `downgrade()` is optional and only needed if the feature is permanently removed.

**Recovery**: Set `ENABLE_CONTENT_AUTOMATION=true` → scheduler tick resumes within 1 minute. No data loss.
