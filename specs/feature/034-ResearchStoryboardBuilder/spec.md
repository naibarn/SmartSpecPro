# 034 — Research, Storyboard & Deck Builder via AgencySwarm

Version: 1.0
Date: 2026-03-10
Status: Proposed
Audience: Product, Architecture, Backend (Node + Python), Frontend

---

## 1. Executive summary

Feature นี้เพิ่ม 3 ความสามารถใหม่ให้ SmartSpecPro ผ่านระบบ AgencySwarm + RAG ที่มีอยู่แล้ว **โดยไม่ต้องเพิ่ม runtime ภายนอก**:

1. **Deep Research Agent** — วิเคราะห์/สรุป/เปรียบเทียบเอกสารจำนวนมากจาก Library/RAG แล้วส่งผลลัพธ์เป็น structured report
2. **Storyboard Planner Agent** — รับ brief แล้วสร้าง scene list, shot list, narration, timing, media prompts สำหรับวิดีโอ
3. **Deck Builder Agent** — สร้าง presentation outline พร้อม slide content, speaker notes, asset suggestions แล้ว import เข้า Presentation Editor อัตโนมัติ

ทั้ง 3 agents ทำงานบน AgencySwarm orchestrator เดิม ใช้ LLM Gateway เดิม ใช้ RAG/Library เดิม โดยมี 2 สิ่งใหม่ที่เป็นแกนกลาง:

- **Structured Output Contract (AgencyResultEnvelope)** — schema กลางที่ agency results ทุกตัวต้อง conform เพื่อให้ route ไปยัง Chat, Presentation Editor, หรือ Media Studio ได้อัตโนมัติ
- **Artifact Tracking** — เพิ่ม columns ใน `agency_runs` + ตาราง `agency_run_artifacts` เพื่อติดตาม artifacts ที่สร้างขึ้น (reports, slides, storyboards) พร้อม refs กลับไปยัง library items

### Why not Deer Flow / external runtime?

จากการวิเคราะห์ codebase (ดู Deer Flow spec assessment, 2026-03-10):

- use cases ทั้ง 3 ทำได้ด้วยระบบที่มีอยู่ (AgencySwarm + RAG + Presentation API)
- LLM Gateway ปัจจุบันเป็น stub สำหรับ external services (`openaiCompatGateway.ts` throws errors)
- AgencySwarm มี tool system + orchestrator + 7 node types + 11 builtin tools รวม `builtin-rag-knowledge` อยู่แล้ว
- เพิ่ม external runtime = 11-15 สัปดาห์ effort + triple-moving-foundations risk
- approach นี้ใช้ ~4-5 สัปดาห์ effort ได้ 80%+ ของ value เดียวกัน

---

## 2. Background

### 2.1 What exists today

| Component | Current State | File |
|-----------|--------------|------|
| **AgencySwarm Adapter** | Version-isolated, gateway-routed LLM, retry logic | `python-backend/app/services/agency_swarm_adapter.py` |
| **Agency Orchestrator** | 7 node types (agent, supervisor, router, aggregator, knowledge_base, skill_call, human_approval) | `python-backend/app/services/agency_orchestrator.py` |
| **Agency Tools** | 11 builtin tools including `builtin-rag-knowledge`, `builtin-skill-executor`, `builtin-document-search` | `python-backend/app/services/agency_tools.py` |
| **Hybrid RAG Engine** | BM25 + Vector + Reranking, tenant-scoped, confidence scoring | `python-backend/app/orchestrator/rag/hybrid_rag.py` |
| **Library System** | libraryItems + libraryChunks + libraryPermissions + ACL + versioning | `apps/web/drizzle/schema.ts` (lines 1683-1835) |
| **Vector DB** | Multi-provider (Cloudflare Vectorize/pgvector/ChromaDB), tenant-isolated | `apps/web/server/services/vectorProvider.ts` |
| **Presentation Editor** | createDeck, addSlide, AI draft generation, PPTX/Google Slides import, export (PNG/JPG/PDF/MP4) | `apps/web/server/services/presentationService.ts`, `aiPresentationService.ts` |
| **AI Presentation Draft** | LLM generates `AIPresentationSlide[]` → layout engine → rendered slides with media | `apps/web/shared/presentation/aiTypes.ts` |
| **Storyboard Skill** | `video-storyboard-to-prompts` skill สร้าง scene list + video prompts (llm-only) | `apps/web/skills/video-storyboard-to-prompts/skill.md` |
| **Agency Runs/Messages** | Runtime tables with credit accounting, tool_calls JSON, status tracking | `python-backend/app/models/agency.py` |

### 2.2 What's missing

| Gap | Impact |
|-----|--------|
| Agency results เป็นแค่ `response: str` (plain text) | ไม่สามารถ route ไป studios/editors โดยอัตโนมัติ |
| ไม่มี artifact tracking ใน agency_runs | ไม่รู้ว่า run สร้างอะไรบ้าง ไม่สามารถ link กลับไปยัง library |
| ไม่มี pre-built agency templates สำหรับ research/storyboard/deck | ผู้ใช้ต้องสร้างเองจากศูนย์ |
| Agency ไม่สามารถเรียก Presentation API โดยตรง | ผลลัพธ์ต้อง copy-paste เข้า editor |
| ไม่มี structured output parsing สำหรับ agent responses | Text-only output ไม่สามารถ validate หรือ route ได้ |

---

## 3. Problem statement

ผู้ใช้ SmartSpecPro ต้องการ:
1. วิเคราะห์เอกสารจำนวนมากจาก Library แล้วได้ structured report
2. วางแผน video production แบบ end-to-end (brief → storyboard → scene prompts → media pipeline)
3. สร้าง presentation จาก topic/brief โดยผลลัพธ์เปิดใน Presentation Editor พร้อมแก้ไขได้ทันที

ระบบปัจจุบันมี building blocks ทั้งหมดแล้ว (AgencySwarm, RAG, Presentation Editor, Skill System) แต่ขาด:
- **glue layer** ที่เชื่อม agency output → downstream systems
- **pre-configured agents** ที่ปรับ prompt/tools ให้เหมาะกับแต่ละ use case
- **artifact lifecycle** ที่ track สิ่งที่ agents สร้างขึ้น

---

## 4. Goals

1. สร้าง 3 pre-configured agency templates ที่ทำงานได้ทันทีโดยไม่ต้อง configure: Deep Research, Storyboard Planner, Deck Builder
2. กำหนด `AgencyResultEnvelope` schema ที่ agent ทุกตัวต้อง output เมื่อต้อง route downstream
3. สร้าง `ResultRouter` service ที่รับ envelope แล้ว dispatch ไปยัง Chat / Presentation Editor / Media Studio โดยอัตโนมัติ
4. เพิ่ม artifact tracking ใน `agency_runs` / `agency_messages` สำหรับ audit และ UI
5. Deck Builder ต้องสร้าง presentation ที่เปิดใน editor ได้จริง ไม่ใช่แค่ text
6. ทุก LLM call ยังผ่าน SmartSpecPro gateway ตาม policy เดิม
7. ทุก RAG query ยังผ่าน tenant-scoped ACL เดิม

---

## 5. Non-goals

1. ไม่เพิ่ม external runtime (Deer Flow, CrewAI, AutoGen)
2. ไม่แก้ Agency Builder UI graph (ใช้ model เดิม)
3. ไม่สร้าง vector DB ใหม่ (ใช้ Vectorize/pgvector เดิม)
4. ไม่ทำ real-time streaming สำหรับ artifact generation (Phase 1 ใช้ polling)
5. ไม่สร้าง custom node types ใหม่ ใช้ agent + knowledge_base + skill_call nodes เดิม
6. ไม่ทำ Video Edit integration ใน Phase 1 (Phase 2)

---

## 6. Architecture overview

### 6.1 Data flow

```
User (Chat / Agency Chat)
  → AgencySwarm Entry Agent (research | storyboard | deck_builder)
  → Agent uses tools (selects dynamically based on need):
      ├─ builtin-rag-knowledge       → Hybrid RAG Engine → Library/Vector DB
      ├─ builtin-document-search     → Multi-collection search
      ├─ builtin-web-search          → External web search
      ├─ builtin-skill-discovery [NEW] → ค้นหา skills จาก Marketplace ตาม context
      ├─ builtin-skill-executor      → เรียกใช้ skills (article writers, prompt engineers, etc.)
      └─ builtin-presentation-create [NEW] → Presentation API
  → Agent outputs structured JSON (AgencyResultEnvelope)
  → ResultRouter parses envelope
      ├─ Chat: summary_text + artifact refs + action buttons
      ├─ Presentation Editor: auto-create deck + slides via existing API
      └─ Media Studio: prefill prompts (Phase 2)
  → Artifacts recorded in agency_runs.result_envelope + agency_messages
```

### 6.2 Core principle

**ไม่สร้าง orchestration layer ใหม่** — ใช้ AgencySwarm orchestrator + adapter + tools เดิมทั้งหมด เพิ่มแค่:
1. New builtin tool: `builtin-presentation-create` (สร้าง deck)
2. New builtin tool: `builtin-skill-discovery` (ค้นหา skills จาก marketplace)
3. Output parsing layer: `AgencyResultEnvelope`
4. Routing service: `ResultRouter`
5. DB columns สำหรับ artifact tracking
6. Skill-Augmented Agent Pattern: agents ใช้ existing skills แทนการเขียนเนื้อหาเอง

### 6.3 Component diagram

```
┌────────────────────────────────────────────────────────────────┐
│  SmartSpecPro Platform (existing)                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐            │
│  │  Chat UI │  │ Agency   │  │ Presentation     │            │
│  │          │  │ Chat UI  │  │ Editor           │            │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘            │
│       │              │                 │                       │
│  ┌────▼──────────────▼─────────────────▼──────────────────┐   │
│  │  Node.js Backend (tRPC + Express)                       │   │
│  │  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  │   │
│  │  │ agency   │  │ ResultRouter │  │ presentation     │  │   │
│  │  │ router   │  │   [NEW]      │  │ router + service │  │   │
│  │  └────┬─────┘  └──────┬───────┘  └──────────────────┘  │   │
│  └───────┼───────────────┼─────────────────────────────────┘   │
│          │               │                                     │
│  ┌───────▼───────────────▼─────────────────────────────────┐   │
│  │  Python Backend (FastAPI)                                │   │
│  │  ┌──────────────┐  ┌────────────────┐  ┌─────────────┐  │   │
│  │  │ AgencyService│  │ EnvelopeParser │  │ Hybrid RAG  │  │   │
│  │  │  (existing)  │  │   [NEW]        │  │  (existing) │  │   │
│  │  └──────┬───────┘  └────────────────┘  └─────────────┘  │   │
│  │         │                                                │   │
│  │  ┌──────▼───────────────────────────────────────────┐    │   │
│  │  │ AgencySwarm Adapter + Orchestrator (existing)    │    │   │
│  │  │  + builtin-presentation-create [NEW tool]        │    │   │
│  │  │  + builtin-skill-discovery [NEW tool]            │    │   │
│  │  │  + builtin-skill-executor (existing) → Skills    │    │   │
│  │  └──────────────────────────────────────────────────┘    │   │
│  │                                                            │   │
│  │  ┌────────────────────────────────────────────────────┐    │   │
│  │  │ Virtual Workflow Engine (existing, LangGraph)       │    │   │
│  │  │  AgencyExecutor node → uses AgencyService above     │    │   │
│  │  │  [UPDATE: expose envelope in node output]           │    │   │
│  │  └────────────────────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

---

## 7. Structured Output Contract: AgencyResultEnvelope

### 7.1 Problem

ปัจจุบัน `RunResult.response` เป็น `str` plain text เท่านั้น ไม่สามารถ:
- แยก summary จาก structured data
- route ไป downstream systems
- track artifacts
- validate output format

### 7.2 Design

Agent ที่ต้อง output structured result จะถูก instruct ให้ wrap output ใน JSON block ภายใน response text:

```
<sse:envelope>
{
  "version": "1.0",
  "intent": "presentation_deck",
  "summary": "สร้าง presentation 8 slides เรื่อง Customer Onboarding...",
  "payload": { ... },
  "artifacts": [ ... ],
  "references": [ ... ]
}
</sse:envelope>
```

### 7.3 Schema

```python
class AgencyResultEnvelope(BaseModel):
    """Structured output contract for agency results."""

    version: Literal["1.0"] = "1.0"
    intent: Literal[
        "chat_reply",           # plain text reply
        "research_report",      # structured research output
        "video_storyboard",     # storyboard + scene prompts
        "presentation_deck",    # slide content for Presentation Editor
        "media_prompt",         # image/video prompt for Media Studio
    ]
    summary: str                # human-readable summary (always shown in chat)

    payload: dict | None = None # intent-specific structured data

    artifacts: list[ArtifactRef] = []
    references: list[DocumentRef] = []

    metrics: EnvelopeMetrics | None = None


class ArtifactRef(BaseModel):
    """Reference to a generated artifact."""
    artifact_id: str
    title: str
    artifact_type: Literal["report", "storyboard", "slide_deck", "prompt_pack", "media"]
    mime_type: str = "application/json"
    storage_key: str | None = None        # R2/local storage key (if persisted)
    library_item_id: int | None = None    # linked library item (if imported)
    inline_data: dict | None = None       # small artifacts can be inline


class DocumentRef(BaseModel):
    """Reference to a source document from Library/RAG."""
    document_id: str
    title: str
    chunk_ids: list[str] = []
    relevance_score: float | None = None


class EnvelopeMetrics(BaseModel):
    """Execution metrics for observability."""
    rag_queries: int = 0
    documents_fetched: int = 0
    llm_calls: int = 0
    total_tokens: int = 0
    skill_calls: list[SkillCallMetric] = []    # track skill usage per run


class SkillCallMetric(BaseModel):
    """Track which marketplace skills the agent used."""
    skill_slug: str
    skill_name: str
    category: str
    tokens_used: int = 0
    duration_ms: int = 0
    discovered_via: Literal["recommended", "discovery", "user_specified"] = "recommended"
```

### 7.4 Intent-specific payload schemas

#### `research_report` payload

```python
class ResearchReportPayload(BaseModel):
    title: str
    executive_summary: str
    sections: list[ReportSection]
    key_findings: list[str]
    recommendations: list[str] = []

class ReportSection(BaseModel):
    heading: str
    content: str
    sources: list[str] = []  # document_id refs
```

#### `video_storyboard` payload

```python
class VideoStoryboardPayload(BaseModel):
    title: str
    total_duration_seconds: int
    style: str
    scenes: list[StoryboardScene]

class StoryboardScene(BaseModel):
    scene_number: int
    duration_seconds: int
    description: str
    dialogue: str | None = None
    camera: str
    lighting: str
    video_prompt: str          # ready-to-use prompt for video generation
    audio_prompt: str | None = None
```

#### `presentation_deck` payload

```python
class PresentationDeckPayload(BaseModel):
    title: str
    description: str | None = None
    language: Literal["auto", "en", "th"] = "auto"
    style_preset: str | None = None    # maps to AI_STYLE_PRESET_IDS
    slides: list[AgencySlide]

class AgencySlide(BaseModel):
    """Maps to AIPresentationSlide schema for layout engine compatibility."""
    template_id: str           # maps to AI_LAYOUT_TEMPLATE_IDS
    title: str
    body: list[str]            # bullet points
    notes: str | None = None   # speaker notes
    sections: list[SlideSection] | None = None
    graphic_category: str = "business"

class SlideSection(BaseModel):
    heading: str
    details: list[str]
```

#### `media_prompt` payload

```python
class MediaPromptPayload(BaseModel):
    prompt_type: Literal["image", "video", "audio"]
    prompt: str
    negative_prompt: str | None = None
    style_hints: dict | None = None
    reference_image_url: str | None = None
```

### 7.5 Parsing strategy

**ไม่ใช้ function calling** เพราะ AgencySwarm agent อาจผ่าน tool chain หลายตัวก่อนสร้าง final output

ใช้ **marker-based extraction** แทน:
1. Agent instructions บังคับให้ wrap structured output ใน `<sse:envelope>...</sse:envelope>` tags
2. `EnvelopeParser` ค้นหา marker ใน response text
3. Extract JSON, validate ด้วย Pydantic
4. ถ้าไม่มี marker → ถือว่าเป็น `chat_reply` intent (backward compatible)

```python
class EnvelopeParser:
    MARKER_START = "<sse:envelope>"
    MARKER_END = "</sse:envelope>"

    @staticmethod
    def parse(response_text: str, run_id: str = "") -> AgencyResultEnvelope | None:
        start = response_text.find(EnvelopeParser.MARKER_START)
        if start == -1:
            return None
        end = response_text.find(EnvelopeParser.MARKER_END, start)
        if end == -1:
            return None
        json_str = response_text[
            start + len(EnvelopeParser.MARKER_START) : end
        ].strip()
        return AgencyResultEnvelope.model_validate_json(json_str)
```

### 7.6 Why this approach

- **Backward compatible** — existing agencies ที่ไม่ output envelope ทำงานเหมือนเดิม
- **No schema changes to AgencySwarm** — agent instructions drive the output format
- **Validatable** — Pydantic enforces schema
- **Extensible** — เพิ่ม intent ใหม่ได้โดยเพิ่ม payload schema
- **Debuggable** — envelope อยู่ใน response text ที่ log ได้ปกติ

### 7.7 EnvelopeParser error handling & edge cases

#### Multiple envelopes in response

Agent อาจ output `<sse:envelope>` มากกว่า 1 ครั้ง (e.g., จาก intermediate reasoning ที่ถูก wrap ผิด). ใช้ **first-match-wins** strategy:

```python
@staticmethod
def parse(response_text: str) -> AgencyResultEnvelope | None:
    start = response_text.find(EnvelopeParser.MARKER_START)
    if start == -1:
        return None
    end = response_text.find(EnvelopeParser.MARKER_END, start)
    if end == -1:
        return None

    # Size guard: reject oversized envelope JSON before parsing
    json_str = response_text[start + len(EnvelopeParser.MARKER_START) : end].strip()
    if len(json_str.encode("utf-8")) > MAX_ENVELOPE_SIZE_BYTES:  # 256 KB
        logger.warning("Envelope exceeds size limit", size=len(json_str))
        return None

    try:
        return AgencyResultEnvelope.model_validate_json(json_str)
    except ValidationError as e:
        logger.warning("Envelope validation failed", error=str(e), run_id=run_id)
        return None  # fallback to chat_reply
```

> **Design decision**: ใช้ first-match เท่านั้น, ไม่ merge หลาย envelopes เพราะจะเพิ่ม complexity โดยไม่จำเป็น. ถ้ามีหลาย markers → log warning เพื่อ prompt improvement

#### Pydantic validation failure

ถ้า JSON valid แต่ไม่ตรง schema (e.g., missing `intent`, unknown enum value):
- **Action**: return `None` → caller treats as `chat_reply` (backward compatible)
- **Logging**: log full validation error + raw JSON snippet (truncated 500 chars) สำหรับ debugging
- **Metric**: increment `envelope_parse_failures` counter for monitoring

#### Size check before parse

ป้องกัน DoS จาก agent ที่ output JSON ขนาดใหญ่มาก:
- **Limit**: `MAX_ENVELOPE_SIZE_BYTES = 262_144` (256 KB) — matches security control in Section 14.2
- **Action**: ถ้า exceed → return `None` + log warning
- **Rationale**: 256 KB เพียงพอสำหรับ 30 slides + metadata; ถ้า agent สร้าง content มากกว่านี้ให้ใช้ R2 storage แทน inline

#### Code-block false positives

Agent อาจ output `<sse:envelope>` ภายใน markdown code block เช่น:
````
```json
<sse:envelope>{ ... }</sse:envelope>
```
````

**Mitigation**: ไม่จำเป็นต้อง handle เป็นพิเศษ — ถ้า JSON valid + Pydantic pass ก็ยังเป็น valid envelope. ถ้า agent ตั้งใจจะแสดง example (ไม่ใช่ actual output) ต้อง instruct ให้ใช้ escaped markers ใน agent instructions (e.g., `\<sse:envelope\>`)

---

## 8. Artifact tracking

### 8.1 Data model changes

#### `agency_runs` — เพิ่ม columns (Alembic migration)

```python
# New columns on agency_runs
result_intent = Column(String(50), nullable=True)       # envelope intent
result_envelope = Column(JSON, nullable=True)            # full envelope JSON
artifact_count = Column(Integer, nullable=True, default=0)
downstream_targets = Column(JSON, nullable=True)         # ["chat", "presentation_editor"]
```

#### `agency_run_artifacts` — ตารางใหม่

```python
class AgencyRunArtifact(Base):
    __tablename__ = "agency_run_artifacts"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    run_id = Column(String(36), nullable=False, index=True)
    artifact_id = Column(String(64), nullable=False)
    title = Column(String(255), nullable=False)
    artifact_type = Column(String(30), nullable=False)  # report/storyboard/slide_deck/prompt_pack/media
    mime_type = Column(String(100), nullable=False, default="application/json")
    storage_key = Column(Text, nullable=True)             # R2 key if persisted
    library_item_id = Column(Integer, nullable=True)      # linked library item
    presentation_deck_id = Column(Integer, nullable=True) # linked deck (for deck_builder)
    size_bytes = Column(Integer, nullable=True)
    inline_data = Column(JSON, nullable=True)             # small artifacts inline
    created_at = Column(DateTime(timezone=True), nullable=False,
                        default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("agency_run_artifacts_run_idx", "run_id"),
        Index("agency_run_artifacts_type_idx", "artifact_type"),
    )
```

#### `RunResult` model — เพิ่ม fields

`RunResult` ใน `agency_swarm_adapter.py` เป็น **Pydantic `BaseModel`** (ไม่ใช่ dataclass) ต้องเพิ่ม fields ให้ carry envelope data กลับ:

```python
# python-backend/app/services/agency_swarm_adapter.py
class RunResult(BaseModel):
    run_id: str
    response: str
    agent_name: str
    total_tokens: int = 0
    step_count: int = 0
    duration_ms: int = 0
    # NEW — populated by EnvelopeParser in agency_service.py
    result_intent: str | None = None        # envelope intent (e.g. "research_report")
    result_envelope: dict | None = None     # full parsed envelope as dict
    artifacts: list[dict] | None = None     # list of ArtifactRef dicts
```

> **Note**: `RunResult` ในปัจจุบันคือ Pydantic `BaseModel` ไม่ใช่ `@dataclass` — ใช้ `.model_dump()` แทน `asdict()` เมื่อ serialize

`agency_service.py` จะ populate fields เหล่านี้หลังจาก `EnvelopeParser.parse()` สำเร็จ ก่อน return `RunResult` กลับให้ Node.js — กระบวนการนี้เกิดที่ **Python-side** ทั้งหมด (ไม่ใช่ Node.js)

### 8.2 Artifact lifecycle (Python-side, in `agency_service.py`)

> **Important**: Artifact recording เกิดที่ **Python backend** (`agency_service.py`) ทั้งหมด ไม่ใช่ Node.js
> Flow: `AgencySwarmAdapter.execute()` → `agency_service.py` calls `EnvelopeParser` → records artifacts → returns `RunResult` to Node.js

1. Agent produces `AgencyResultEnvelope` with `artifacts[]`
2. `EnvelopeParser` extracts envelope from response (Python-side)
3. For each artifact:
   - ถ้า `inline_data` → store ใน `agency_run_artifacts.inline_data` (enforced: max 64 KB per artifact, reject + log if exceeded)
   - ถ้า artifact ใหญ่ → persist to R2, store `storage_key`
   - ถ้า `intent == research_report` → optionally create library item, store `library_item_id`

> **Important — Presentation deck creation ownership**: สำหรับ `presentation_deck` intent, **deck ถูกสร้างโดย agent ผ่าน `builtin-presentation-create` tool ระหว่าง run** (ดู Section 9) ไม่ใช่โดย artifact lifecycle หรือ ResultRouter. Artifact recording เพียงแค่บันทึก `presentation_deck_id` ที่ tool สร้างไว้แล้ว. ResultRouter เพียงแค่สร้าง "Open in Presentation Editor" button — ไม่ได้สร้าง deck ซ้ำ
4. Update `agency_runs` with `result_intent`, `result_envelope`, `artifact_count`, `downstream_targets`

### 8.3 Size limits

| Limit | Value |
|-------|-------|
| Max artifacts per run | 10 |
| Max inline_data size | 64 KB |
| Max R2 artifact size | 10 MB |
| Max slides per deck (agency) | 30 (agency-specific limit; note: `PRESENTATION_LIMITS.maxSlidesPerDeck` = 200 in codebase — agency limit is intentionally stricter เพื่อจำกัดค่าใช้จ่าย LLM per run) |
| Max storyboard scenes | 20 |
| Max report sections | 15 |

---

## 9. New builtin tool: `builtin-presentation-create`

### 9.1 Purpose

ให้ AgencySwarm agent สามารถสร้าง presentation deck + slides ผ่าน SmartSpecPro API โดยตรง ไม่ต้องผ่าน chat

### 9.2 Tool contract

```python
# Request (from agent tool call)
{
    "title": "Customer Onboarding Strategy",
    "description": "Q2 2026 onboarding flow improvements",
    "slides": [
        {
            "templateId": "title_subtitle",
            "title": "Customer Onboarding Strategy",
            "body": ["Q2 2026 Improvement Plan"],
            "notes": "Welcome slide, introduce the team...",
            "graphicCategory": "business"
        },
        {
            "templateId": "bullets_with_graphic",
            "title": "Current Pain Points",
            "body": [
                "40% drop-off at email verification",
                "Average onboarding time: 12 minutes",
                "Support tickets per new user: 2.3"
            ],
            "notes": "Data from Q1 analytics dashboard...",
            "graphicCategory": "chart"
        }
    ]
}
```

```python
# Response — success (to agent)
{
    "success": true,
    "deck_id": 142,
    "library_item_id": 891,
    "slide_count": 8,
    "editor_url": "/presentation/891"
}

# Response — partial failure (some slides failed layout)
{
    "success": true,
    "deck_id": 142,
    "library_item_id": 891,
    "slide_count": 6,
    "editor_url": "/presentation/891",
    "warnings": [
        { "slide_index": 3, "error": "Unknown templateId 'invalid_layout'" },
        { "slide_index": 7, "error": "Body exceeds 20 bullet points limit" }
    ]
}

# Response — complete failure
{
    "success": false,
    "error": "Failed to create deck: insufficient permissions",
    "error_code": "PERMISSION_DENIED"
}
```

**Error codes**: `PERMISSION_DENIED`, `CREDIT_INSUFFICIENT`, `SLIDE_LIMIT_EXCEEDED`, `VALIDATION_ERROR`, `INTERNAL_ERROR`

### 9.3 Implementation

เพิ่มใน `agency_tools.py` builtin tool list:

```python
BUILTIN_TOOLS["builtin-presentation-create"] = {
    "name": "Create Presentation",
    "description": "Create a presentation deck with slides in SmartSpecPro Presentation Editor",
    "risk_level": "medium",
    "endpoint": "/api/internal/tools/presentation-create",
}
```

Node.js handler สร้าง Express route ที่:
1. Validate input ด้วย Zod (enforce max 30 slides — agency limit, not system limit of 200)
2. สร้าง library item (type: presentation)
3. createDeck via `presentationService.createPresentationDeck()`
4. สำหรับแต่ละ slide: pass through `aiPresentationLayoutEngine.generateSlide()` เพื่อ layout
5. addSlide via `presentationService.addSlideToDeck()`
6. Return deck_id + library_item_id + editor_url

#### Deck slide pre-validation rules (Zod, step 1)

| Field | Rule | On Failure |
|-------|------|------------|
| `title` (deck) | Required, 1-200 chars | Reject entire request |
| `slides` | Array, 1-30 items | Reject if empty or >30 |
| `slide.templateId` | Must be in `AI_LAYOUT_TEMPLATE_IDS` (see `aiTypes.ts`) | Skip slide + add to `warnings[]` |
| `slide.title` | Required, 1-200 chars | Skip slide + warning |
| `slide.body` | Array of strings, max 20 items, each max 500 chars | Truncate to 20 items |
| `slide.notes` | Optional, max 2000 chars | Truncate |
| `slide.graphicCategory` | Optional, must be valid category if present | Ignore invalid, use default |

> **Note**: Pre-validation เกิด **ก่อน** layout engine. Slides ที่ fail pre-validation จะถูก skip (partial success) แทนที่จะ reject ทั้ง deck

**Transaction semantics**: ทั้ง 6 steps ทำงานภายใน database transaction เดียว:
- ถ้า step 4-5 fail สำหรับ slide บางตัว → **partial success**: deck ถูกสร้างพร้อม slides ที่สำเร็จ + return `warnings[]` สำหรับ slides ที่ fail (ดี่กว่า rollback ทั้ง deck เพราะ user ยังแก้ไข slides ที่สำเร็จได้)
- ถ้า step 2-3 fail (deck creation) → **full rollback**: cleanup library item, return error
- ถ้า **ทุก** slides fail layout → rollback ทั้ง deck + library item, return `success: false`

### 9.4 Cross-Service Tool Protocol

`builtin-presentation-create` เป็น tool ที่ Python backend เรียก Node.js internal API — ต้องมี protocol สำหรับ auth และ tenant context propagation:

#### Request headers (Python → Node.js)

```
POST /api/internal/tools/presentation-create
Headers:
  X-Service-Token: <shared_secret>         # service-to-service auth (not user JWT)
  X-Tenant-Id: <tenant_id>                 # tenant context from agency run
  X-User-Id: <user_id>                     # user who initiated the agency run
  X-Agency-Run-Id: <run_id>                # tracing + audit
  Content-Type: application/json
```

#### Authentication strategy

| Method | How | Where configured |
|--------|-----|-----------------|
| **Service-to-service token** | Shared secret (`INTERNAL_SERVICE_TOKEN` env var) ตรงกันทั้ง Python + Node.js | `.env` ทั้ง 2 services |
| **NOT user JWT** | Python backend ไม่มี user's JWT (โดยเฉพาะ scheduled workflows) → ใช้ service token แทน | — |
| **Tenant isolation** | Node.js handler verify ว่า `X-Tenant-Id` มีอยู่จริง + user belongs to tenant ก่อน create deck | `internalToolsPresentationCreate.ts` |

#### Node.js internal endpoint guard

```typescript
// apps/web/server/routes/internalToolsPresentationCreate.ts
function validateInternalRequest(req: Request): { tenantId: string; userId: number } {
  const serviceToken = req.headers["x-service-token"];
  if (serviceToken !== process.env.INTERNAL_SERVICE_TOKEN) {
    throw new ForbiddenError("Invalid service token");
  }
  const tenantId = req.headers["x-tenant-id"] as string;
  const userId = parseInt(req.headers["x-user-id"] as string, 10);
  if (!tenantId || !userId) {
    throw new BadRequestError("Missing tenant/user context");
  }
  // Verify tenant exists + user belongs to tenant
  return { tenantId, userId };
}
```

#### Python-side token propagation

```python
# python-backend/app/services/agency_tools.py — execute_tool()
async def _call_internal_tool(self, endpoint: str, payload: dict, context: AgencyContext):
    headers = {
        "X-Service-Token": settings.INTERNAL_SERVICE_TOKEN,
        "X-Tenant-Id": context.tenant_id,
        "X-User-Id": str(context.user_id),
        "X-Agency-Run-Id": context.run_id,
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.NODEJS_INTERNAL_URL}{endpoint}",
            json=payload,
            headers=headers,
            timeout=30.0,
        )
    return resp.json()
```

> **Security note**: `INTERNAL_SERVICE_TOKEN` ต้อง:
> - เป็น random string >= 32 chars
> - ไม่เหมือน JWT_SECRET หรือ LLM_ENCRYPTION_KEY
> - ไม่ expose ผ่าน `VITE_*` prefix
> - Rotate ได้โดย update `.env` ทั้ง 2 services + restart

### 9.5 Why use existing layout engine

`generateSlide()` ใน `aiPresentationLayoutEngine.ts` รับ `AIPresentationSlide` input แล้วสร้าง `PresentationSlideContent` ที่มี elements, positions, styles, canvas ครบ — เป็น pipeline เดียวกับที่ AI Draft ใช้

AgencySlide schema ใน envelope ถูกออกแบบให้ map 1:1 กับ `AIPresentationSlide`:

| AgencySlide field | AIPresentationSlide field |
|-------------------|--------------------------|
| `template_id` | `templateId` |
| `title` | `title` |
| `body` | `body` |
| `notes` | `notes` |
| `sections` | `sections` |
| `graphic_category` | `graphicCategory` |

---

## 10. Pre-configured agency templates

### 10.1 Skill Integration Strategy

#### Problem: RAG-only agents มีข้อจำกัด

Spec เดิมให้ agents ใช้แค่ RAG tools (`builtin-rag-knowledge`, `builtin-document-search`) เป็นหลัก ซึ่งจำกัดว่า:
- ต้องมีเอกสารใน Library ก่อนจึงจะทำงานได้ดี
- Agent ต้อง "เขียนเนื้อหาเอง" ทั้งหมด → ใช้ tokens มาก, คุณภาพไม่สม่ำเสมอ
- ไม่ได้ leverage skills 29 ตัวที่มีอยู่แล้วในระบบ (article writers, prompt engineers, storyboard writers)

#### Solution: Skill-Augmented Agent Pattern

ให้ agents เป็น **orchestrator** ที่เลือกใช้ skills ตามสถานการณ์ผ่าน `builtin-skill-executor`:

```
User Input → Agent (orchestrator)
  ├─ ต้องการข้อมูล?       → builtin-rag-knowledge (Library/RAG)
  ├─ ต้องการค้นเว็บ?      → builtin-web-search
  ├─ ต้องการเนื้อหา?      → builtin-skill-executor (article writer skill)
  ├─ ต้องการ storyboard?  → builtin-skill-executor (storyboard-writer skill)
  ├─ ต้องการ media prompt? → builtin-skill-executor (video/image prompt engineer)
  ├─ ต้องการวิเคราะห์?     → builtin-skill-executor (brainstorm skill)
  └─ synthesize ทั้งหมด   → AgencyResultEnvelope
```

**ข้อดี**:
- **ทำงานได้แม้ Library ว่าง** — ใช้ skills สร้างเนื้อหาจาก topic โดยตรง
- **คุณภาพสูงกว่า** — skills มี optimized prompts ที่ tune มาแล้วสำหรับแต่ละ domain
- **ต้นทุน tokens ต่ำกว่า** — skill prompts กระชับกว่า agent ที่ต้อง reason + เขียนเองทั้งหมด
- **Extensible** — เพิ่ม skill ใหม่ = agent มีความสามารถใหม่ทันทีโดยไม่ต้องแก้ agent instructions

#### Skills ที่มีอยู่แล้วและเกี่ยวข้อง (29 skills, 13 categories)

| กลุ่ม | Skills | Agent ที่ใช้ |
|-------|--------|------------|
| **Article Writers** (8 ตัว) | `general-article-writer`, `business-article-writer`, `marketing-article-writer`, `education-article-writer`, `lifestyle-article-writer`, `documentary-script-writer`, `creative-story-writer`, `storyboard-writer` | Research, Deck Builder |
| **Prompt Engineers** (4 ตัว) | `image_prompt_engineer`, `video-prompt-engineer`, `video-storyboard-to-prompts`, `smart-landscape-designer` | Storyboard Planner, Deck Builder |
| **Media Creators** (4 ตัว) | `image-creator`, `video-creator`, `cartoon-video-creator`, `audio-creator` | Storyboard Planner (Phase 2) |
| **Analysis** | `brainstorm` (multi-model debate) | Deep Research |
| **Product Reviews** (2 ตัว) | `beauty-skincare-reviewer`, `household-product-reviewer` | Deep Research (domain-specific) |
| **Translation** | `translation` (bilingual en/th) | ทุก Agent (multilingual output) |

#### Dynamic Skill Discovery (Marketplace-Ready)

เนื่องจากระบบ SmartSpecPro เป็น **Skill Marketplace** ที่มี skills เพิ่มขึ้นตลอด — agents ต้อง **ไม่ hardcode** skill list แต่ใช้ **dynamic discovery** แทน:

```python
# Agent instructions ไม่ระบุ skill slugs ตายตัว แต่ใช้ discovery pattern:
"""
You have access to the builtin-skill-executor tool which can run any skill
available in the SmartSpecPro Skill Marketplace.

Before using a skill, call builtin-skill-discovery to find the best skill
for your current need. The discovery tool returns:
- skill_slug: unique identifier
- skill_name: human-readable name
- category: skill type (article_generation, video_prompt_generation, etc.)
- description: what the skill does
- relevance_score: how well it matches your query

SKILL SELECTION STRATEGY:
1. Describe what you need (e.g., "write a business strategy article")
2. Call builtin-skill-discovery with your need description
3. Review returned skills and select the best match
4. Call builtin-skill-executor with the selected skill_slug + your input
5. Use the skill's output as building material for your final result

You may chain multiple skills in sequence:
  research → article writer → prompt engineer → media creator

IMPORTANT:
- Skills are pre-optimized for their domain — prefer skills over writing content yourself
- If no matching skill found, fall back to your own reasoning
- Always attribute skill usage in the envelope's metrics.skill_calls field
"""
```

#### Skill Discovery Tool (new builtin)

เพิ่ม `builtin-skill-discovery` tool (read-only, low risk) เพื่อให้ agent ค้นหา skills แบบ dynamic:

```python
# python-backend/app/services/agency_tools.py
BUILTIN_TOOLS["builtin-skill-discovery"] = {
    "name": "Skill Discovery",
    "description": "Search available skills in the Skill Marketplace by category or description",
    "risk_level": "low",
    "endpoint": "/api/internal/tools/skill-discovery",
}
```

#### Python-side: Request/Response models

```python
# python-backend/app/services/agency_tools.py — tool invocation
# Agent calls this tool → Python sends POST to Node.js handler
class SkillDiscoveryRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=200, description="Natural language search query")
    category: str | None = Field(None, description="Filter by skill category (e.g., 'prompt_enhancement')")
    execution_mode: str | None = Field(None, description="Filter by execution mode (e.g., 'llm-only')")
    limit: int = Field(10, ge=1, le=20, description="Max results to return")

class SkillSummary(BaseModel):
    slug: str
    name: str
    category: str
    description: str
    execution_mode: str   # "llm-only" | "media-generate" | "python" | "sandbox-python"
    input_fields: list[str]   # list of accepted input field names
    relevance_score: float    # 0.0-1.0, computed from query match
    tags: list[str] = []

class SkillDiscoveryResponse(BaseModel):
    skills: list[SkillSummary]
    total_available: int       # total skills in marketplace (before filtering)
    query_used: str            # echo back for debugging
```

#### Node.js handler

```typescript
// POST /api/internal/tools/skill-discovery
// (POST not GET — consistent with all other internal tool endpoints)
// Guarded by X-Service-Token validation (see Section 9.4)

interface SkillDiscoveryInput {
  query: string;
  category?: string;
  execution_mode?: string;
  limit?: number;  // default 10, max 20
}

interface SkillSummary {
  slug: string;
  name: string;
  category: string;
  description: string;
  executionMode: "llm-only" | "media-generate" | "python" | "sandbox-python";
  inputFields: string[];   // list of accepted input field names
  relevanceScore: number;  // 0-1, computed from query match
  tags: string[];
}
```

#### Relevance scoring algorithm

```typescript
// apps/web/server/services/internalToolsSkillDiscovery.ts
function computeRelevance(skill: Skill, query: string, category?: string): number {
  const terms = query.toLowerCase().split(/\s+/);
  let score = 0;

  // 1. Category exact match: +0.3
  if (category && skill.category === category) score += 0.3;

  // 2. Name contains query term: +0.25 per term (max 0.5)
  const nameHits = terms.filter(t => skill.name.toLowerCase().includes(t));
  score += Math.min(nameHits.length * 0.25, 0.5);

  // 3. Description contains query term: +0.1 per term (max 0.3)
  const descHits = terms.filter(t => skill.description.toLowerCase().includes(t));
  score += Math.min(descHits.length * 0.1, 0.3);

  // 4. Tag exact match: +0.15 per matching tag (max 0.3)
  const tagHits = terms.filter(t => skill.tags?.some(tag => tag.toLowerCase() === t));
  score += Math.min(tagHits.length * 0.15, 0.3);

  return Math.min(score, 1.0);  // cap at 1.0
}

// Full flow:
// 1. skillRegistry.getAllSkills() → get all enabled skills
// 2. Filter by category (if provided) and execution_mode (if provided)
// 3. Compute relevance score for each skill
// 4. Filter out skills with score < 0.1 (irrelevant)
// 5. Sort by relevance descending
// 6. Return top N (limit, max 20)
```

> **Note**: This ensures agents always see the LATEST skills from marketplace without needing to update agent instructions when new skills are added.

#### Skill Execution via `builtin-skill-executor`

`builtin-skill-executor` มีอยู่แล้วใน agency tools (endpoint: `/api/internal/tools/skill-executor`) — agent เรียกใช้ได้ทันที:

```python
# Agent calls skill-executor with:
{
    "query": "เขียนบทความเรื่อง Marketing Strategy สำหรับ SME ไทย",
    "skillSlug": "marketing-article-writer",
    "language": "th",
    "tone": "professional",
    "length": "medium"
}
# Returns: skill output text (article content, prompts, etc.)
```

#### Recommended Skills per Agent

ตาราง "recommended skills" ด้านล่างเป็น **default suggestions** ที่ seed ไว้ใน agent instructions — แต่ agent สามารถ discover + ใช้ skills อื่นจาก marketplace ได้ตามต้องการ:

| Agent | Recommended Skills (default) | ใช้ทำอะไร |
|-------|------------------------------|----------|
| **Deep Research** | `brainstorm` | Multi-model debate วิเคราะห์หลายมุม |
| | `general-article-writer` | สรุปผลวิจัยเป็นบทความ |
| | `documentary-script-writer` | เขียน narrative report |
| | *(+ ค้นหาเพิ่มผ่าน discovery)* | Domain-specific skills ตาม topic |
| **Storyboard Planner** | `storyboard-writer` | สร้าง scene-by-scene storyboard |
| | `video-storyboard-to-prompts` | แปลง storyboard → video prompts |
| | `video-prompt-engineer` | Optimize video prompts |
| | `image_prompt_engineer` | สร้าง reference frame prompts |
| | *(+ ค้นหาเพิ่มผ่าน discovery)* | New media/prompt skills |
| **Deck Builder** | `business-article-writer` | เนื้อหา business/strategy |
| | `marketing-article-writer` | เนื้อหา marketing/pitch |
| | `education-article-writer` | เนื้อหา education/training |
| | `creative-story-writer` | เนื้อหา storytelling |
| | *(+ ค้นหาเพิ่มผ่าน discovery)* | New domain writers, infographic skills |

#### Skill Chaining Patterns

Agent สามารถ chain skills ในลำดับเพื่อสร้างผลลัพธ์ที่ซับซ้อน:

```
Pattern A: Research → Article → Deck
  builtin-rag-knowledge → brainstorm → business-article-writer
  → builtin-presentation-create → AgencyResultEnvelope(presentation_deck)

Pattern B: Brief → Storyboard → Prompts → Media (Phase 2)
  storyboard-writer → video-storyboard-to-prompts → video-prompt-engineer
  → image_prompt_engineer (reference frames)
  → AgencyResultEnvelope(video_storyboard)

Pattern C: Topic → Multi-domain Research
  builtin-web-search → builtin-rag-knowledge → brainstorm
  → documentary-script-writer → AgencyResultEnvelope(research_report)

Pattern D: Marketplace Skill Discovery
  builtin-skill-discovery("product review for cosmetics")
  → beauty-skincare-reviewer (discovered dynamically)
  → general-article-writer (synthesize)
  → AgencyResultEnvelope(research_report)
```

#### Future-Proofing: Marketplace Skill Compatibility

เมื่อ Skill Marketplace มี skill ใหม่ถูกเพิ่มเข้ามา (โดย users หรือ system):

| Scenario | Agent Behavior | ต้องแก้อะไร |
|----------|---------------|------------|
| Skill ใหม่ category เดิม (e.g., `health-article-writer`) | Agent discover + ใช้ได้ทันทีผ่าน `builtin-skill-discovery` | **ไม่ต้องแก้อะไร** |
| Skill ใหม่ category ใหม่ (e.g., `3d-model-generator`) | Agent discover ได้ แต่อาจไม่รู้วิธีใช้ output | อัพเดต agent instructions ให้รู้จัก category ใหม่ |
| Skill ที่มี structured output (JSON) | Agent parse output + integrate เข้า envelope | **ไม่ต้องแก้อะไร** (agent reasoning handles it) |
| Skill ที่ต้อง special input format | Agent ต้องดู `inputFields` จาก discovery แล้ว adapt | **ไม่ต้องแก้อะไร** (agent reads field names) |

> **Design principle**: Agent instructions อธิบาย **strategy** (how to discover and use skills) ไม่ใช่ **specific skill list** (which exact skills to use) — ทำให้ agents ปรับตัวกับ marketplace ที่เปลี่ยนแปลงได้เอง

#### Metrics: Skill Usage Tracking

เพิ่มใน `EnvelopeMetrics` เพื่อ track ว่า agent ใช้ skills อะไรบ้าง:

```python
class EnvelopeMetrics(BaseModel):
    """Execution metrics for observability."""
    rag_queries: int = 0
    documents_fetched: int = 0
    llm_calls: int = 0
    total_tokens: int = 0
    # NEW — skill usage tracking
    skill_calls: list[SkillCallMetric] = []

class SkillCallMetric(BaseModel):
    skill_slug: str
    skill_name: str
    category: str
    tokens_used: int = 0
    duration_ms: int = 0
    discovered_via: Literal["recommended", "discovery", "user_specified"] = "recommended"
```

### 10.2 Template: Deep Research Agent

**Agency structure**: Single supervisor agent + knowledge_base node

**Agent instructions** (summary):
```
You are a Deep Research Agent. Your task is to analyze documents from the user's
library, leverage specialized skills, and produce a structured research report.

SKILL SELECTION STRATEGY:
- You have access to builtin-skill-discovery to find skills matching your needs
- For multi-perspective analysis: use "brainstorm" skill (multi-model debate)
- For writing narrative reports: discover article-writer skills by topic
- For domain-specific analysis: discover review/analysis skills

When the user provides a research question:
1. Use builtin-rag-knowledge to search for relevant documents (top_k=20)
2. Use builtin-document-search for broader discovery if needed
3. Use builtin-web-search for external information if library is insufficient
4. Use builtin-skill-discovery to find skills matching the research domain
5. Use builtin-skill-executor to run relevant skills:
   - "brainstorm" for multi-model debate analysis
   - Article writer skills for narrative synthesis
   - Domain-specific skills (reviews, analysis) as discovered
6. Synthesize all findings into a structured report
7. Output your result as an AgencyResultEnvelope with intent "research_report"

IMPORTANT: If the user's library is empty or has insufficient documents,
you can still produce valuable output by using skills + web search.
Prefer using domain-specific skills over writing content from scratch.

You MUST wrap your final output in <sse:envelope>...</sse:envelope> tags.
The envelope payload MUST follow the ResearchReportPayload schema.
Always include document references with document_id and relevance_score.
Track all skill calls in envelope metrics.skill_calls[].
```

**Tools assigned**: `builtin-rag-knowledge`, `builtin-document-search`, `builtin-web-search`, `builtin-skill-discovery`, `builtin-skill-executor`

**Recommended skills** (seeded as suggestions, not hardcoded):
- `brainstorm` — multi-model debate analysis
- `general-article-writer` — general-purpose narrative synthesis
- `documentary-script-writer` — factual narrative report writing
- *(agent discovers additional domain skills via marketplace)*

**Output contract**: `research_report`

**Downstream**: Chat (summary + references + "Save to Library" action button)

### 10.3 Template: Storyboard Planner Agent

**Agency structure**: Supervisor agent + skill_call node

**Agent instructions** (summary):
```
You are a Storyboard Planner Agent. Your task is to take a video brief from
the user and create a complete storyboard with scene-by-scene video prompts.

SKILL SELECTION STRATEGY:
- Use builtin-skill-discovery to find the best storyboard and prompt skills
- Recommended chain: storyboard-writer → video-storyboard-to-prompts → video-prompt-engineer
- For reference frame images: use image prompt engineer skills
- You may discover new video/animation skills added to the marketplace

When the user provides a video brief:
1. Optionally use builtin-rag-knowledge to find reference materials from library
2. Use builtin-skill-discovery to find storyboard + prompt skills
3. Use builtin-skill-executor("storyboard-writer") to create scene outline
4. Use builtin-skill-executor("video-storyboard-to-prompts") to generate video prompts per scene
5. Use builtin-skill-executor("video-prompt-engineer") to optimize each prompt
6. Optionally use builtin-skill-executor("image_prompt_engineer") for reference frames
7. Synthesize into final storyboard with optimized prompts
8. Output your result as an AgencyResultEnvelope with intent "video_storyboard"

IMPORTANT: The skill chain produces higher quality prompts than writing them yourself.
Always prefer skill-generated prompts over self-written ones.

You MUST wrap your final output in <sse:envelope>...</sse:envelope> tags.
The envelope payload MUST follow the VideoStoryboardPayload schema.
Track all skill calls in envelope metrics.skill_calls[].
```

**Tools assigned**: `builtin-rag-knowledge`, `builtin-skill-discovery`, `builtin-skill-executor`

**Recommended skills** (seeded as suggestions):
- `storyboard-writer` — scene-by-scene visual storyboard creation
- `video-storyboard-to-prompts` — convert storyboard to video prompts
- `video-prompt-engineer` — optimize prompts for AI video platforms
- `image_prompt_engineer` — generate reference frame image prompts
- *(agent discovers additional media/animation skills via marketplace)*

**Output contract**: `video_storyboard`

**Downstream**: Chat (summary + storyboard view + "Send to Media Studio" action button for each scene prompt)

#### Storyboard prompt validation rules

Agent-generated video prompts ต้องผ่าน validation ก่อน include ใน envelope:

| Field | Rule | Fallback |
|-------|------|----------|
| `scene.video_prompt` | ต้องมี (non-empty), 10-2000 chars | Reject scene, log warning |
| `scene.duration_seconds` | 1-120 seconds, integer | Default: 10 |
| `scene.scene_number` | Sequential starting from 1, no gaps | Auto-renumber |
| `scene.description` | Non-empty, max 500 chars | Use video_prompt as fallback |
| `scene.camera_movement` | Optional, max 100 chars | Omit |
| `scene.dialogue` | Optional, max 1000 chars | Omit |
| `scene.audio_prompt` | Optional, max 500 chars | Omit |
| Total scenes | 1-20 (matches Section 8.3 limit) | Truncate to 20 with warning |

> **Note**: Validation เกิดที่ `EnvelopeParser` (Python-side) ตอน parse VideoStoryboardPayload — ใช้ Pydantic field validators. Scenes ที่ fail validation จะถูก drop พร้อม log warning แทนที่จะ reject ทั้ง envelope

### 10.4 Template: Deck Builder Agent

**Agency structure**: Supervisor agent + knowledge_base node

**Agent instructions** (summary):
```
You are a Deck Builder Agent. Your task is to create a complete presentation
deck from the user's topic or brief.

SKILL SELECTION STRATEGY:
- Use builtin-skill-discovery to find the best content writer for the topic
- For business/strategy: prefer "business-article-writer"
- For marketing/pitch: prefer "marketing-article-writer"
- For education/training: prefer "education-article-writer"
- For storytelling: prefer "creative-story-writer"
- You may discover new specialized writers added to the marketplace
- Use the skill output as source material, then structure into slides

When the user provides a topic:
1. Optionally use builtin-rag-knowledge to find relevant materials from library
2. Use builtin-skill-discovery to find the best article-writer for this topic's domain
3. Use builtin-skill-executor with the discovered writer to generate rich content
4. Plan slide structure (5-15 slides) based on skill output + RAG findings
5. Write content for each slide: title, bullet points, speaker notes
6. Use builtin-presentation-create to create the deck in Presentation Editor
7. Output your result as an AgencyResultEnvelope with intent "presentation_deck"

IMPORTANT: Using domain-specific article writers produces higher quality slide content
than writing from scratch. If the user's library is empty, skills alone can produce
a complete presentation.

You MUST wrap your final output in <sse:envelope>...</sse:envelope> tags.
The envelope payload MUST follow the PresentationDeckPayload schema.
Include the deck_id and library_item_id from the tool response in artifacts[].
Track all skill calls in envelope metrics.skill_calls[].
```

**Tools assigned**: `builtin-rag-knowledge`, `builtin-document-search`, `builtin-skill-discovery`, `builtin-skill-executor`, `builtin-presentation-create`

**Recommended skills** (seeded as suggestions):
- `business-article-writer` — business strategy content
- `marketing-article-writer` — marketing/pitch content
- `education-article-writer` — educational/training content
- `creative-story-writer` — narrative/storytelling content
- `lifestyle-article-writer` — lifestyle/wellness content
- *(agent discovers additional domain writers via marketplace)*

**Output contract**: `presentation_deck`

**Downstream**: Chat (summary + "Open in Presentation Editor" button) + auto-created deck

> **See also: Spec 035 — Auto Draft Agent**: Deck Builder Agent (034) สร้าง slides ผ่าน `builtin-presentation-create` (content-only, fast, chainable). สำหรับ **full presentation with media/audio + automatic option selection** ดู Spec 035 `Auto Draft Agent` ที่ wrap `generateAIDraft()` pipeline เดิม — ทั้งสอง agents อยู่คู่กัน ไม่ซ้ำซ้อน

---

## 11. ResultRouter service

### 11.1 Location

Node.js: `apps/web/server/services/agencyResultRouter.ts`

### 11.2 Responsibility

รับ parsed `AgencyResultEnvelope` จาก Python backend → dispatch actions ตาม `intent`:

```typescript
interface RouteResult {
  chatMessage: {
    summary: string;
    artifacts: ArtifactDisplay[];
    actions: ActionButton[];
  };
  sideEffects: SideEffect[];
}

type ActionButton = {
  label: string;
  action: "open_presentation" | "open_media_studio" | "save_to_library" | "view_storyboard";
  params: Record<string, unknown>;
};
```

### 11.3 Routing rules

| Intent | Chat Display | Side Effects | Action Buttons |
|--------|-------------|-------------|----------------|
| `chat_reply` | summary only | none | none |
| `research_report` | summary + key findings | optionally save report to library | "Save to Library", "View Full Report" |
| `video_storyboard` | summary + scene count + total duration | none (Phase 1) | "View Storyboard", "Send Scene N to Media Studio" |
| `presentation_deck` | summary + slide count | deck already created by tool | "Open in Presentation Editor" |
| `media_prompt` | summary + prompt preview | none | "Open in Media Studio" (prefill prompt) |

### 11.4 Validation rules

`ResultRouter` ต้อง validate envelope ก่อน dispatch — ไม่ trust ข้อมูลจาก agent โดยตรง:

#### Intent ↔ Artifacts consistency

| Intent | Required artifacts | Validation |
|--------|-------------------|------------|
| `chat_reply` | none | `artifacts` ต้อง empty |
| `research_report` | 0-1 (report) | ถ้ามี artifact ต้องเป็น `artifact_type: "report"` |
| `video_storyboard` | 0-1 (storyboard) | ถ้ามี artifact ต้องเป็น `artifact_type: "storyboard"` |
| `presentation_deck` | 1 (slide_deck) | **ต้องมี** artifact_type `"slide_deck"` + `presentation_deck_id` ≠ null |
| `media_prompt` | 0-1 (prompt_pack) | ถ้ามี artifact ต้องเป็น `artifact_type: "prompt_pack"` |

ถ้า inconsistent → log warning + treat as `chat_reply` (display summary only, don't dispatch side effects)

#### Tenant ownership verification

ก่อน link artifacts กลับไปยัง existing resources:
- `library_item_id` → verify ว่า item belongs to user's tenant (`libraryItems.tenantId == run.tenantId`)
- `presentation_deck_id` → verify ว่า deck's library item belongs to user's tenant
- ถ้า verification fail → **strip** the ID from artifact (set to null), log security warning

#### Cross-tenant protection

```typescript
async function verifyArtifactOwnership(
  artifact: ArtifactRef,
  tenantId: string,
  db: DrizzleDB
): Promise<ArtifactRef> {
  if (artifact.libraryItemId) {
    const item = await db.query.libraryItems.findFirst({
      where: and(eq(libraryItems.id, artifact.libraryItemId), eq(libraryItems.tenantId, tenantId))
    });
    if (!item) {
      logger.warn("Cross-tenant artifact reference blocked", { artifactId: artifact.artifactId, tenantId });
      return { ...artifact, libraryItemId: null };
    }
  }
  return artifact;
}
```

### 11.5 Integration point

ใน `apps/web/server/routers/agency.ts` ที่ `sendMessage` / `streamMessage`:

1. Receive `RunResult` from Python backend
2. Attempt `EnvelopeParser.parse(result.response)` (Python-side, returned as JSON in response metadata)
3. If envelope found → pass to `ResultRouter.route(envelope)`
4. Return `RouteResult` alongside normal chat response
5. Frontend renders summary + action buttons

### 11.6 Media Studio Prefill Protocol

#### Problem

`media_prompt` intent และ `video_storyboard` scene-level "Send to Media Studio" buttons ต้อง prefill prompt ใน Media Studio — แต่ยังไม่มี spec สำหรับ mechanism นี้

#### Prefill mechanism: URL query params

Media Studio (`/media-studio`) รับ prefill ผ่าน URL query parameters:

```typescript
// Navigation from Chat action button:
// /media-studio?prefill_type=video&prefill_prompt=<encoded>&prefill_source=agency_run:<run_id>

interface MediaStudioPrefillParams {
  prefill_type: "image" | "video" | "audio";
  prefill_prompt: string;           // URL-encoded prompt text
  prefill_negative?: string;        // URL-encoded negative prompt
  prefill_style?: string;           // style hint key
  prefill_source?: string;          // tracing: "agency_run:<run_id>" or "storyboard:<run_id>:scene:<N>"
  prefill_ref_image?: string;       // reference image URL (if applicable)
}
```

#### Frontend implementation

```typescript
// apps/web/client/src/pages/MediaStudio.tsx — on mount
const searchParams = new URLSearchParams(location.search);
const prefillType = searchParams.get("prefill_type");
const prefillPrompt = searchParams.get("prefill_prompt");

useEffect(() => {
  if (prefillType && prefillPrompt) {
    setMediaType(prefillType as MediaType);
    setPromptText(decodeURIComponent(prefillPrompt));
    if (searchParams.get("prefill_negative")) {
      setNegativePrompt(decodeURIComponent(searchParams.get("prefill_negative")!));
    }
    // Don't auto-generate — let user review and click "Generate"
  }
}, []);
```

#### Action button generation per intent

| Intent | Action Button | URL |
|--------|--------------|-----|
| `media_prompt` | "Open in Media Studio" | `/media-studio?prefill_type={payload.prompt_type}&prefill_prompt={encode(payload.prompt)}&prefill_source=agency_run:{run_id}` |
| `video_storyboard` scene N | "Send Scene N to Media Studio" | `/media-studio?prefill_type=video&prefill_prompt={encode(scene.video_prompt)}&prefill_source=storyboard:{run_id}:scene:{N}` |
| `video_storyboard` scene N (image ref) | "Generate Reference Frame" | `/media-studio?prefill_type=image&prefill_prompt={encode(scene.description)}&prefill_source=storyboard:{run_id}:scene:{N}:ref` |

```typescript
// ResultRouter: generate action buttons for video_storyboard
function generateStoryboardActions(envelope: AgencyResultEnvelope, runId: string): ActionButton[] {
  const payload = envelope.payload as VideoStoryboardPayload;
  return payload.scenes.flatMap((scene, i) => [
    {
      label: `Send Scene ${scene.scene_number} to Media Studio`,
      action: "open_media_studio" as const,
      params: {
        url: `/media-studio?prefill_type=video&prefill_prompt=${encodeURIComponent(scene.video_prompt)}&prefill_source=storyboard:${runId}:scene:${i}`,
      },
    },
  ]);
}
```

#### Phase 1 vs Phase 2 scope

| Feature | Phase | Rationale |
|---------|-------|-----------|
| `presentation_deck` → auto-create deck | **Phase 1** | Core feature, agent tool handles creation |
| `media_prompt` → prefill Media Studio URL | **Phase 1** | Trivial (~1-2h), high value |
| `video_storyboard` → scene-level prefill | **Phase 1** | Same mechanism as media_prompt |
| `video_storyboard` → bulk generate all scenes | **Phase 2** | Requires queue/batch job integration |
| Video Editor → storyboard import to timeline | **Phase 2** | No import API exists yet (see Section 11.7) |

> **Note**: `media_prompt` intent ไม่มี agent template ใน Phase 1 (ไม่มี agent ที่ output `media_prompt` โดยตรง) แต่ `video_storyboard` scenes ใช้ prefill mechanism เดียวกัน. Agent template สำหรับ `media_prompt` จะเพิ่มใน Phase 2

### 11.7 Video Editor Integration (Phase 2 outline)

#### Current state

Video Editor ปัจจุบัน **ไม่มี programmatic import API** — ผู้ใช้สร้าง video project ด้วยมือเท่านั้น. Spec 034 Section 5.6 ระบุว่า Video Edit integration เป็น non-goal สำหรับ Phase 1

#### Phase 2 design direction

```
video_storyboard envelope
  → "Import to Video Editor" action button
  → Create video project via tRPC: videoEditor.createFromStoryboard
  → Map scenes to timeline clips:
      scene.scene_number → clip order
      scene.duration_seconds → clip duration
      scene.video_prompt → clip metadata (for later generation)
      scene.dialogue → subtitle track
      scene.audio_prompt → audio track metadata
  → Open Video Editor with pre-populated timeline
```

**Required Phase 2 work**:

| Component | Status | Effort |
|-----------|--------|--------|
| `videoEditor.createFromStoryboard` tRPC endpoint | ❌ ต้องสร้างใหม่ | ~3-4 วัน |
| Scene → Clip mapping logic | ❌ ต้องสร้างใหม่ | ~2 วัน |
| Timeline pre-population UI | ❌ ต้องสร้างใหม่ | ~3-4 วัน |
| Subtitle track from dialogue | ❌ ต้องสร้างใหม่ | ~1 วัน |
| Batch video generation from prompts | ❌ ต้องสร้างใหม่ | ~2-3 วัน |
| **Total Phase 2 Video Editor** | | **~11-14 วัน** |

> **Note**: Phase 2 design จะถูก detail เพิ่มเมื่อ Phase 1 เสร็จและมี feedback จาก users

---

## 12. Agency template seeding

### 12.1 Mechanism

เพิ่ม 3 seed templates ใน `apps/web/drizzle/seed.ts` หรือ migration script:

- Templates ใช้ `agencies.visibility = 'template'` (เพิ่ม value ใน visibility enum ถ้ายังไม่มี)
- `agencies.status = 'active'`
- `agencies.tenantId = '__system__'`
- แต่ละ template มี agents + tools + communication_flows pre-configured

### 12.2 User flow

1. User เปิด Agency Chat หรือ Agency Builder
2. เห็น "Templates" section แสดง 3 templates
3. กด "Use Template" → clone agency เข้า tenant ของ user
4. ใช้งานได้ทันที หรือ customize ใน Agency Builder ก่อน

### 12.3 Template cloning

`agency.useTemplate` tRPC endpoint (คล้าย `useTemplate` ที่มีอยู่ใน presentation):

1. Copy agency row ด้วย new ID + user's tenantId
2. Copy agency_agents rows (รวม `nodeType`, `nodeConfig` JSON)
3. Copy agency_agent_tools rows (รวม `toolConfig` JSON — ต้อง deep clone, ไม่ใช่ reference)
4. Copy agency_communication_flows rows
5. Set `agencies.templateSourceId = original_template_id`

> **Note**: `createFromTemplate` ปัจจุบันอาจไม่ clone `nodeConfig` และ `toolConfig` — ต้อง verify + fix ใน implementation (ดู Week 3 delivery plan). ถ้า `toolConfig` มี agent-specific defaults (e.g., RAG source IDs) ต้อง clone + allow user to override

---

## 13. Virtual Workflow Engine integration

### 13.1 Current state

Virtual Workflow Engine (`python-backend/app/orchestrator/`) เป็น LangGraph runtime ที่รองรับ 57+ node types พร้อม visual editor (ReactFlow) โดยมี `AgencyExecutor` node อยู่แล้วที่ `node_executors/agency_executor.py` ซึ่งเรียก `AgencyService.execute_run()` — **service เดียวกันกับที่ spec นี้จะ modify**

ปัจจุบัน `AgencyExecutor` return เฉพาะ `run_result.response` (plain text) ทำให้ workflow ที่ใช้ agency node ได้แค่ข้อความกลับ ไม่รู้ intent หรือ artifacts

### 13.2 Required change

หลังจาก EnvelopeParser integrate เข้า `agency_service.py` แล้ว ให้ update `AgencyExecutor.execute()` return envelope data:

```python
# python-backend/app/orchestrator/node_executors/agency_executor.py
return {
    "outputs": {
        "result": run_result.response,
        "status": "success",
        "envelope_intent": run_result.result_intent,       # NEW
        "envelope": run_result.result_envelope,             # NEW (parsed dict)
        "artifacts": run_result.artifacts,                  # NEW (list of ArtifactRef)
        "run_metadata": {
            "run_id": run_result.run_id,
            "agent_steps": run_result.step_count,
            "duration_ms": run_result.duration_ms,
            "agent_name": run_result.agent_name,
            "total_tokens": run_result.total_tokens,
        },
    },
}
```

### 13.3 Enabled use cases

เมื่อ workflow มี envelope data จาก agency node แล้ว สามารถสร้าง automation เช่น:

| Workflow pattern | Description |
|-----------------|-------------|
| `schedule_trigger → agency_run (Deep Research) → conditional (intent?) → send_email` | Auto-research + email report ทุกสัปดาห์ |
| `webhook_trigger → agency_run (Deck Builder) → conditional → send_notification` | สร้าง deck อัตโนมัติเมื่อมี request เข้ามา + แจ้ง Slack |
| `form_input → agency_run (Storyboard) → template_engine → write_file` | สร้าง storyboard จาก form → export เป็น document |

`conditional` node สามารถ branch ตาม `{{agency_node.envelope_intent}}` ได้ทันที (ใช้ expression resolution ที่มีอยู่แล้ว)

### 13.4 Pre-built workflow templates

สร้าง 3 workflow templates ที่ seed เข้า `workflowTemplates` table (ระบบ marketplace ที่มีอยู่แล้ว) เพื่อให้ user เห็นตัวอย่าง automation ที่ใช้ agency + envelope ได้ทันที

#### Template 1: Weekly Research Report

```
schedule_trigger (ทุกวันจันทร์ 08:00)
  → set_variable (topic = "สรุปข่าว AI ประจำสัปดาห์")
  → agency_run (agency_id = Deep Research Agent)
  → conditional ({{agency_run.envelope_intent}} == "research_report")
    → YES: template_engine (render report → HTML email body)
      → send_email (to = {{trigger.config.recipients}})
    → NO: send_notification (type = "slack", message = "Research agent returned non-report")
```

**ReactFlow JSON structure:**
```json
{
  "nodes": [
    { "id": "trigger_1", "type": "schedule_trigger", "data": {
        "schedule": "0 8 * * 1", "timezone": "Asia/Bangkok" }},
    { "id": "var_1", "type": "set_variable", "data": {
        "variables": { "topic": "สรุปข่าว AI ประจำสัปดาห์", "recipients": "team@company.com" }}},
    { "id": "agency_1", "type": "agency_run", "data": {
        "agency_id": "{{DEEP_RESEARCH_TEMPLATE_ID}}", "message": "{{var_1.topic}}" }},
    { "id": "cond_1", "type": "conditional", "data": {
        "condition": "{{agency_1.envelope_intent}} == 'research_report'" }},
    { "id": "tmpl_1", "type": "template_engine", "data": {
        "template": "research-email", "context": "{{agency_1.envelope}}" }},
    { "id": "email_1", "type": "send_email", "data": {
        "to": "{{var_1.recipients}}", "subject": "Weekly AI Research Report", "body": "{{tmpl_1.result}}" }},
    { "id": "notify_1", "type": "send_notification", "data": {
        "channel": "slack", "message": "Research agent returned unexpected intent: {{agency_1.envelope_intent}}" }}
  ],
  "edges": [
    { "source": "trigger_1", "target": "var_1" },
    { "source": "var_1", "target": "agency_1" },
    { "source": "agency_1", "target": "cond_1" },
    { "source": "cond_1", "target": "tmpl_1", "sourceHandle": "true" },
    { "source": "cond_1", "target": "notify_1", "sourceHandle": "false" },
    { "source": "tmpl_1", "target": "email_1" }
  ]
}
```

**Seed metadata:**
- `name`: "Weekly Research Report (AI Agency)"
- `category`: "AI Automation"
- `tags`: `["research", "agency", "email", "scheduled"]`
- `industry`: "general"
- `stepCount`: 7
- `estimatedSetupMinutes`: 5
- `isPublic`: true, `isFeatured`: true, `status`: "published"

#### Template 2: On-Demand Deck Builder

```
webhook_trigger (POST /api/webhooks/workflow/{id})
  → agency_run (agency_id = Deck Builder Agent, message = {{trigger.body.topic}})
  → conditional ({{agency_run.envelope_intent}} == "presentation_deck")
    → YES: send_notification (type = "slack",
        message = "Deck created: {{agency_run.envelope.payload.title}} ({{agency_run.artifacts[0].library_item_id}})")
    → NO: workflow_response (error = "Unexpected result from Deck Builder")
```

**Seed metadata:**
- `name`: "On-Demand Deck Builder (AI Agency)"
- `category`: "AI Automation"
- `tags`: `["presentation", "agency", "webhook", "deck"]`
- `stepCount`: 4
- `estimatedSetupMinutes`: 3

#### Template 3: Storyboard → Deck Pipeline

```
form_input [form_1] (fields: project_name, video_brief, target_audience)
  → agency_run [agency_1] (agency_id = Storyboard Planner, message = "{{form_1.video_brief}} target: {{form_1.target_audience}}")
  → conditional [cond_1] ({{agency_1.envelope_intent}} == "video_storyboard")
    → YES: agency_run [agency_2] (agency_id = Deck Builder, message = "สร้าง presentation จาก storyboard: {{agency_1.envelope.payload.title}}\n\nScenes:\n{{agency_1.envelope.payload.scenes}}")
      → send_notification [notify_1] (type = "slack", message = "Pipeline complete: storyboard + deck for {{form_1.project_name}}")
    → NO: workflow_response [resp_1] (result = "{{agency_1.result}}")
```

**Seed metadata:**
- `name`: "Storyboard → Deck Pipeline (Multi-Agent)"
- `category`: "AI Automation"
- `tags`: `["storyboard", "presentation", "agency", "pipeline", "multi-agent"]`
- `stepCount`: 6
- `estimatedSetupMinutes`: 10

### 13.5 Workflow template implementation

**ไม่ต้องเขียนโค้ดใหม่** — ใช้ระบบ `workflowTemplates` ที่มีอยู่ทั้งหมด:

| Component | Status | Note |
|-----------|--------|------|
| `workflowTemplates` table | มีอยู่แล้ว | Full marketplace schema with ratings, publishing, cloning |
| Template gallery UI | มีอยู่แล้ว | `workflow.listPublicTemplates` + `workflow.cloneTemplate` |
| ReactFlow → LangGraph compiler | มีอยู่แล้ว | `WorkflowCompiler` handles all node types |
| `AgencyExecutor` node | มีอยู่แล้ว | จะ update ให้ return envelope data (Section 13.2) |
| `conditional` node | มีอยู่แล้ว | Supports expression-based routing |
| `send_email` / `send_notification` nodes | มีอยู่แล้ว | Multiple providers (Slack, Discord, email) |

**สิ่งที่ต้องสร้าง:**
1. **Seed script** — `apps/web/scripts/seed-workflow-agency-templates.ts` สร้าง 3 ReactFlow JSON definitions + insert เข้า `workflowTemplates`
2. **Agency ID resolution + `{{lookup:}}` expression resolver [NEW IMPLEMENTATION]** — Workflow templates ต้อง reference agency templates by name (ไม่ใช่ hardcode UUID) เพราะ agency_id จะต่างกันในแต่ละ tenant.

   > **IMPORTANT**: `{{lookup:agency_template:NAME}}` expression **ยังไม่มีในระบบ** — ต้อง implement ใหม่ใน expression resolver (`python-backend/app/orchestrator/expression_resolver.py`):
   >
   > ```python
   > # NEW: lookup expression handler
   > # Pattern: {{lookup:<resource_type>:<resource_name>}}
   > # Supported resource_types:
   > #   - agency_template: resolve template name → cloned agency_id in current tenant
   > #
   > # Resolution flow:
   > # 1. Parse expression → extract resource_type + resource_name
   > # 2. Query: SELECT id FROM agencies WHERE template_source_id IN
   > #           (SELECT id FROM agencies WHERE name = :name AND visibility = 'template')
   > #           AND tenant_id = :current_tenant_id
   > #           ORDER BY created_at DESC LIMIT 1
   > # 3. If not found → auto-clone template into tenant, return new agency_id
   > # 4. Cache result per (tenant_id, template_name) for workflow duration
   > ```
   >
   > **Alternative approach** (simpler): ใช้ `agency_template_name` config field ใน `agency_run` node data แทน expression, resolve ที่ `AgencyExecutor.execute()` level:
   > ```python
   > # In AgencyExecutor.execute():
   > agency_id = node_data.get("agency_id")
   > if not agency_id and node_data.get("agency_template_name"):
   >     agency_id = await resolve_template_agency(
   >         template_name=node_data["agency_template_name"],
   >         tenant_id=context.tenant_id
   >     )
   > ```
   > **Recommendation**: ใช้ alternative approach (config field) สำหรับ Phase 2 เพราะง่ายกว่าและไม่ต้องแก้ expression resolver ที่ใช้กับ node types อื่นด้วย

3. **Template engine template** — สร้าง email template `research-email` สำหรับ render report เป็น HTML

### 13.6 Workflow user_token handling (scheduled/webhook triggers)

AgencySwarm LLM gateway ใช้ `user_token` (JWT) สำหรับ authenticate กับ Node.js LLM Gateway (`base_url = f"{NODEJS_INTERNAL_URL}/v1"`, `api_key = user_token`). ปัญหาคือ **scheduled workflows และ webhook triggers ไม่มี user JWT** — `context.extra_data.get("user_token", "")` return empty string

#### Solution: Workflow creator's stored service token

| Trigger type | Token source | Implementation |
|-------------|-------------|----------------|
| **User-initiated** (Agency Chat) | User's JWT from request | ปัจจุบัน — ไม่เปลี่ยน |
| **Scheduled trigger** | Workflow creator's **service token** | Store `creator_service_token` (encrypted) ตอน workflow activate |
| **Webhook trigger** | Same as scheduled | Same mechanism |
| **Manual trigger** (user clicks "Run") | Current user's JWT | Pass from request context |

```python
# python-backend/app/orchestrator/node_executors/agency_executor.py
async def execute(self, node_data, context):
    # Priority: 1) user JWT from request, 2) stored service token, 3) fail
    user_token = context.extra_data.get("user_token", "")
    if not user_token:
        user_token = context.extra_data.get("workflow_service_token", "")
    if not user_token:
        return {"outputs": {"status": "error", "error": "No auth token available for LLM gateway"}}
    ...
```

**Service token generation**:
- เมื่อ user activate scheduled workflow → generate long-lived service token (30 days, auto-renew)
- Token ถูก encrypt ด้วย `LLM_ENCRYPTION_KEY` ก่อน store ใน `workflow_runs.encrypted_service_token`
- Token มี scope จำกัด: `llm-gateway-only` (ใช้ได้เฉพาะ LLM calls, ไม่ใช่ full user access)
- ถ้า user ถูก deactivate → revoke ทุก service tokens → scheduled workflows auto-pause

> **Alternative (simpler, Phase 1)**: ใช้ **system-level API key** สำหรับ scheduled workflows (API key ของ tenant admin ที่ถูก assign ให้ workflow) — ไม่ต้องสร้าง service token mechanism ใหม่

### 13.7 Effort & delivery

**AgencyExecutor update (Phase 1):**
- **Effort**: ~2-4 ชั่วโมง (modify 1 file: `agency_executor.py`)
- **Dependency**: ต้องทำหลัง Phase 1 Week 1 (EnvelopeParser + RunResult changes)
- **Delivery**: Phase 1 Week 3 (alongside agency template work)
- **Risk**: None — เป็นการ extend output dict เท่านั้น, backward compatible

**Workflow templates (Phase 2):**
- **Effort**: ~1-2 วัน (seed script + 3 ReactFlow JSON + agency ID resolution + email template)
- **Dependency**: ต้องทำหลัง Phase 1 เสร็จ (agency templates + envelope + AgencyExecutor update)
- **Delivery**: Phase 2 Week 1-2
- **Risk**: Low — ใช้ infrastructure ที่มีอยู่ทั้งหมด, ต้อง test ว่า agency_id resolution ทำงานข้าม tenant ได้ถูกต้อง

---

## 14. Security considerations

### 14.1 Existing controls (unchanged)

- ทุก LLM call ผ่าน Node.js gateway → credit deduction + audit
- ทุก RAG query ผ่าน tenant-scoped ACL (`compute_effective_scopes`)
- Tool whitelist enforcement per agency
- SSRF protection ใน agency_tools
- PII redaction flag ใน agency_messages

### 14.2 New controls

| Control | Applies to | Implementation |
|---------|-----------|----------------|
| Envelope size limit | AgencyResultEnvelope JSON | Max 256 KB |
| Artifact count limit | artifacts[] array | Max 10 per run |
| Presentation slide limit | builtin-presentation-create | Max 30 slides (agency-specific limit; system `PRESENTATION_LIMITS.maxSlidesPerDeck` = 200) |
| Presentation tool rate limit | `/api/internal/tools/presentation-create` | Max 10 calls per hour per user (ป้องกัน agent loop ที่สร้าง deck ซ้ำ) |
| Internal tool auth | `/api/internal/tools/*` | `X-Service-Token` validation (shared secret, ไม่ใช่ user JWT) — ดู Section 9.4 |
| Skill discovery limit | `builtin-skill-discovery` | Max 20 results per query, read-only (no side effects) |
| Skill execution rate limit | `builtin-skill-executor` per agent run | Max 10 skill calls per agency run (prevent agent loop) |
| RAG query rate limit | `builtin-rag-knowledge` per agent run | Max 5 RAG queries per agency run (prevent excessive vector DB load + credit drain from embedding calls) |
| Template clone rate limit | useTemplate endpoint | Max 5 clones per hour per user |
| Envelope validation | EnvelopeParser | Strict Pydantic validation, reject malformed |
| Workflow credit guard | Scheduled workflows with agency_run nodes | Pre-check credit balance before execution, skip + alert if insufficient |
| Workflow run frequency limit | schedule_trigger workflows | Max 1 run per hour per workflow (configurable), prevent runaway credit drain |

### 14.3 Prompt injection protection

Agent instructions include output format requirements (envelope schema). Risk: user message could instruct agent to output malicious envelope.

**Mitigation**:
1. `EnvelopeParser` validates JSON strictly against Pydantic schemas
2. Presentation tool validates slides through existing `presentationSlideContentSchema`
3. `intent` field is enum — unknown values rejected
4. `storage_key` ถ้ามี ต้อง match allowed prefix patterns
5. `library_item_id` ถ้ามี ต้อง verify ownership ก่อน link

---

## 15. Showcase projects & example templates

### 15.1 Problem

แม้สร้าง template + envelope + routing เสร็จแล้ว ผู้ใช้ส่วนใหญ่จะ:
1. ไม่รู้ว่า feature นี้มีอยู่
2. ไม่รู้ว่าควรพิมพ์อะไรเข้าไป
3. ไม่รู้ว่าผลลัพธ์จะออกมาหน้าตาอย่างไร

ถ้าไม่มีตัวอย่างที่จับต้องได้ feature นี้จะถูกใช้น้อยมากแม้จะทำงานถูกต้อง

### 15.2 Solution: Pre-built showcase projects

สร้าง **3 showcase projects** ที่เป็น **ผลลัพธ์จริง** (ไม่ใช่ mock) ของแต่ละ template — มี input, output, artifacts ครบ พร้อมให้ผู้ใช้ดูเป็นตัวอย่างและ clone ไปแก้ไขต่อ

### 15.3 Showcase project definitions

#### Showcase 1: "AI Trends 2026 Research Report"

**Template ที่ใช้**: Deep Research Agent

**Scenario**: วิเคราะห์เทรนด์ AI ปี 2026 จากเอกสาร 5+ ชิ้นใน library

| Item | Detail |
|------|--------|
| **Pre-seeded library docs** | 5 markdown documents: "LLM Cost Trends", "Enterprise AI Adoption", "Agent Framework Comparison", "Multimodal AI State of Art", "AI Regulation Updates" |
| **Example input message** | "วิเคราะห์เทรนด์ AI ที่สำคัญที่สุดสำหรับธุรกิจไทยในปี 2026 จากเอกสารใน library พร้อมจัดอันดับและให้คำแนะนำ" |
| **Expected output** | AgencyResultEnvelope (intent: `research_report`) พร้อม 5 sections, 8+ references, key findings, recommendations |
| **Artifacts** | 1x research report (inline JSON), references to 5 library docs |
| **Chat display** | Summary + key findings bullets + "Save to Library" + "View Full Report" buttons |

**ผู้ใช้เห็นอะไร**:
- Agency Chat ที่มี conversation สำเร็จแล้ว 1 round
- Report แสดงผลใน chat พร้อม citations
- กดดู full report ได้
- กด "Save to Library" เก็บ report เป็น library item

---

#### Showcase 2: "Viral Product Launch Video Storyboard"

**Template ที่ใช้**: Storyboard Planner Agent

**Scenario**: วางแผน viral video สำหรับเปิดตัวสินค้า 60 วินาที

| Item | Detail |
|------|--------|
| **Pre-seeded library docs** | 2 documents: "Brand Guidelines", "Product Feature Sheet" |
| **Example input message** | "สร้าง storyboard วิดีโอ viral 60 วินาที สำหรับเปิดตัว AI Writing Assistant ของบริษัท เน้น hook แรง ให้คนดูจบ สไตล์ตลกแต่ professional" |
| **Expected output** | AgencyResultEnvelope (intent: `video_storyboard`) พร้อม 8 scenes, total 60s, style/camera/lighting per scene |
| **Artifacts** | 1x storyboard (inline JSON), 8x video prompts ready for Media Studio |
| **Chat display** | Summary + scene cards (expandable) + "Send Scene N to Media Studio" per scene |

**ผู้ใช้เห็นอะไร**:
- Agency Chat ที่มี storyboard สำเร็จแล้ว
- Scene cards แสดงรายละเอียดแต่ละฉาก (description, dialogue, camera, duration)
- แต่ละฉากมีปุ่ม "Send to Media Studio" ที่ prefill video prompt ได้

---

#### Showcase 3: "Q2 Strategy Presentation"

**Template ที่ใช้**: Deck Builder Agent

**Scenario**: สร้าง strategy presentation 10 slides จาก topic

| Item | Detail |
|------|--------|
| **Pre-seeded library docs** | 3 documents: "Q1 Performance Report", "Market Analysis", "Competitor Benchmark" |
| **Example input message** | "สร้าง presentation สำหรับ board meeting เรื่อง Q2 Strategy โดยอ้างอิงจาก Q1 report และ market analysis ใน library ต้องการ 10 slides มี speaker notes ทุก slide" |
| **Expected output** | AgencyResultEnvelope (intent: `presentation_deck`) พร้อม 10 slides + notes + references |
| **Artifacts** | 1x slide_deck (presentation_deck_id linked), library_item_id linked |
| **Chat display** | Summary + slide count + "Open in Presentation Editor" button |
| **Auto-created presentation** | 10 slides ที่เปิดใน Presentation Editor ได้ทันที มี elements/layout/style ครบ |

**ผู้ใช้เห็นอะไร**:
- Agency Chat ที่มี conversation สำเร็จ + สร้าง presentation แล้ว
- กด "Open in Presentation Editor" → เปิด deck 10 slides พร้อมแก้ไข
- Slides มี layout, bullet points, speaker notes, decorative graphics ครบตามที่ layout engine สร้าง

### 15.4 Showcase implementation strategy

#### A) Seeded as pre-computed results (recommended for Phase 1)

Showcase projects ถูกสร้างตอน **seed time** ไม่ใช่ตอน runtime:

1. **Library docs**: Seed 10 markdown documents เข้า `libraryItems` + `libraryChunks` ภายใต้ system tenant
2. **Agency + conversation**: Seed agency (cloned จาก template) + `agencyConversations` + `agency_messages` ที่มี input/output ครบ
3. **Result envelope**: Seed `agency_runs` ที่มี `result_envelope` JSON + `agency_run_artifacts` records
4. **Presentation deck**: Seed deck + slides ผ่าน layout engine (run once at seed time, store result)

```typescript
// Seed structure (in drizzle/seed.ts or dedicated seed script)
interface ShowcaseProject {
  id: string;
  templateId: string;             // links to agencyTemplates
  title: string;
  description: string;
  category: "research" | "storyboard" | "deck_builder";
  previewImageUrl: string;        // screenshot/thumbnail
  libraryDocs: SeedLibraryDoc[];  // pre-seeded reference docs
  exampleInput: string;           // the user message
  exampleEnvelope: object;        // the AgencyResultEnvelope JSON
  tags: string[];
}
```

#### B) Showcase data model

เพิ่ม `agency_showcase_projects` table:

> **Scope**: Showcase projects เป็น **global** (ไม่มี `tenant_id`) — ทุก tenant เห็นข้อมูลเดียวกัน เพราะเป็น read-only example content ที่ seed โดย system

```sql
CREATE TABLE agency_showcase_projects (
  id VARCHAR(36) PRIMARY KEY,
  template_id VARCHAR(36) REFERENCES agency_templates(id) ON DELETE SET NULL,  -- FK with SET NULL (ถ้า template ถูกลบ showcase ยังแสดงได้)
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(30) NOT NULL,
  preview_image_url TEXT,
  example_input TEXT NOT NULL,           -- the user message that produced this
  example_envelope JSONB NOT NULL,       -- the full AgencyResultEnvelope
  example_conversation_id VARCHAR(36),   -- link to seeded conversation (no FK — conversation may be cleaned up)
  example_deck_id INTEGER,              -- link to seeded presentation deck (no FK — deck may be cleaned up)
  library_doc_ids JSONB,                -- array of seeded library item IDs
  tags JSONB DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Note: example_conversation_id, example_deck_id ไม่มี FK constraint
-- เพราะ seeded data อาจถูก cleanup — showcase ยังแสดง envelope/summary ได้แม้ linked data หายไป
```

#### C) User-facing showcase gallery

ตำแหน่ง: แสดงใน 3 จุด

1. **Agency Templates page** — แต่ละ template card มี "View Example" button ที่เปิด showcase
2. **Agency Chat empty state** — เมื่อยังไม่มี agency "ลองดูตัวอย่าง" section แสดง 3 showcase cards
3. **Onboarding tour** — step ที่แนะนำ agency feature แสดง showcase preview

#### D) Showcase gallery UI

```
┌─────────────────────────────────────────────────────────────┐
│  Agency Templates                                            │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ [preview img]   │  │ [preview img]   │  │ [preview img]│ │
│  │                 │  │                 │  │              │ │
│  │ Deep Research   │  │ Storyboard      │  │ Deck Builder │ │
│  │ Agent           │  │ Planner         │  │              │ │
│  │                 │  │                 │  │              │ │
│  │ "AI Trends 2026 │  │ "Viral Product  │  │ "Q2 Strategy │ │
│  │  Research Report│  │  Launch Video"  │  │  Presentation│ │
│  │                 │  │                 │  │  "           │ │
│  │ [View Example]  │  │ [View Example]  │  │ [View Example│ │
│  │ [Use Template]  │  │ [Use Template]  │  │ [Use Template│ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### E) "View Example" modal

เมื่อกด "View Example" แสดง modal ที่จำลอง chat conversation:

```
┌──────────────────────────────────────────────────────────────┐
│  Example: AI Trends 2026 Research Report          [X Close]  │
│─────────────────────────────────────────────────────────────│
│                                                              │
│  ┌─ User ───────────────────────────────────────────────┐   │
│  │ วิเคราะห์เทรนด์ AI ที่สำคัญที่สุดสำหรับธุรกิจไทย    │   │
│  │ ในปี 2026 จากเอกสารใน library...                     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─ Deep Research Agent ────────────────────────────────┐   │
│  │ Searching library... Found 5 relevant documents       │   │
│  │ Analyzing: LLM Cost Trends, Enterprise AI Adoption... │   │
│  │                                                       │   │
│  │ ── Research Report ──────────────────────────────      │   │
│  │ Key Findings:                                         │   │
│  │ 1. LLM costs dropped 73% YoY...                      │   │
│  │ 2. Enterprise adoption reached 45%...                 │   │
│  │ 3. Agent frameworks matured significantly...          │   │
│  │                                                       │   │
│  │ [Save to Library]  [View Full Report]                 │   │
│  │                                                       │   │
│  │ References: 5 documents cited                         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ────────────────────────────────────────────────────────    │
│                                                              │
│  [Try it yourself — Use This Template]                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

สำหรับ Deck Builder showcase: modal มี embedded slide preview (mini carousel) + "Open in Presentation Editor" ที่เปิด seeded deck จริง

### 15.5 Showcase tRPC endpoints

เพิ่ม 3 endpoints ใน `apps/web/server/routers/agency.ts`:

```typescript
// 1. List all active showcase projects (public, no auth required for listing)
agency.listShowcaseProjects = publicProcedure
  .input(z.object({
    category: z.enum(["research", "storyboard", "deck_builder"]).optional(),
  }))
  .query(async ({ input }) => {
    return db.select().from(agencyShowcaseProjects)
      .where(and(
        eq(agencyShowcaseProjects.isActive, true),
        input.category ? eq(agencyShowcaseProjects.category, input.category) : undefined,
      ))
      .orderBy(agencyShowcaseProjects.sortOrder);
  });

// 2. Get showcase detail with full envelope (for "View Example" modal)
agency.getShowcaseDetail = publicProcedure
  .input(z.object({ showcaseId: z.string().uuid() }))
  .query(async ({ input }) => {
    const showcase = await db.query.agencyShowcaseProjects.findFirst({
      where: eq(agencyShowcaseProjects.id, input.showcaseId),
    });
    if (!showcase) throw new TRPCError({ code: "NOT_FOUND" });
    return showcase;
  });

// 3. Get seeded conversation messages (for "View Example" modal chat replay)
agency.getShowcaseConversation = publicProcedure
  .input(z.object({ showcaseId: z.string().uuid() }))
  .query(async ({ input }) => {
    const showcase = await db.query.agencyShowcaseProjects.findFirst({
      where: eq(agencyShowcaseProjects.id, input.showcaseId),
    });
    if (!showcase?.exampleConversationId) return { messages: [] };
    // Return seeded conversation messages (read-only snapshot)
    const messages = await getAgencyMessages(showcase.exampleConversationId);
    return { messages };
  });
```

> **Note**: Showcase endpoints ใช้ `publicProcedure` (ไม่ต้อง login) เพราะเป็น read-only marketing content. "Use This Template" ที่ต้อง clone ยังใช้ `protectedProcedure` ตามเดิม

### 15.6 "Try it yourself" flow

เมื่อ user กด "Use This Template" จาก showcase:

1. Clone template เข้า user's tenant (ใช้ `createFromTemplate` ที่มีอยู่)
2. Navigate to Agency Chat: `/agency/{newAgencyId}/chat?prefill={showcaseId}`
3. Frontend อ่าน `prefill` query param → fetch showcase's `example_input` via `getShowcaseDetail` → pre-fill input box (ไม่ส่งอัตโนมัติ ให้ user กด send เอง)
4. User สามารถแก้ message ก่อนส่ง หรือพิมพ์ใหม่ทั้งหมด

```typescript
// Agency Chat component — prefill from showcase
const searchParams = new URLSearchParams(location.search);
const prefillShowcaseId = searchParams.get("prefill");

useEffect(() => {
  if (prefillShowcaseId) {
    trpc.agency.getShowcaseDetail.query({ showcaseId: prefillShowcaseId })
      .then(data => { if (data) setInputValue(data.exampleInput); });
  }
}, [prefillShowcaseId]);
```

### 15.7 Template cloning gap fix

`createFromTemplate` ปัจจุบัน ([agency.ts:654-697](apps/web/server/routers/agency.ts#L654-L697)) clone เฉพาะ agents แต่ **ไม่ clone**:
- `agency_agent_tools` (tool assignments)
- `agency_communication_flows` (edges)
- `nodeType` / `nodeConfig` (node configuration)

ต้องแก้ให้ clone ครบ:

```typescript
// Fix: also clone tools and flows from template
// 1. agentTemplates already has defaultTools: string[]
//    → Insert into agency_agent_tools for each tool slug
// 2. Add templateFlows to agencyTemplates schema
//    → Insert into agency_communication_flows
// 3. agentTemplates already has isEntryPoint
//    → Ensure nodeType defaults to "agent" if not set

// New fields needed on agent_templates:
//   nodeType VARCHAR(30) DEFAULT 'agent'
//   nodeConfig JSONB
//   toolConfigs JSONB  -- { "builtin-rag-knowledge": { "top_k": 20 } }
```

### 15.8 Showcase content preparation

Showcase content ถูกเตรียมใน **build phase** ไม่ใช่ runtime:

1. **Dev เขียน library docs** — markdown files ใน `specs/feature/034-ResearchStoryboardBuilder/showcase-docs/`
2. **Dev รัน template agent** จริงกับ docs เหล่านี้ บน staging
3. **บันทึก envelope + conversation + artifacts** ที่ได้
4. **Pack เป็น seed script** ที่ insert ทั้งหมดเข้า DB
5. **สำหรับ deck showcase**: รัน layout engine ตอน seed เพื่อสร้าง slides จริง

Flow นี้ทำให้มั่นใจว่า:
- Showcase แสดงผลลัพธ์จริงจาก agent (ไม่ใช่ mock)
- ไม่ต้องเรียก LLM ตอน seed (ประหยัด credits)
- สามารถ QA showcase content ก่อน ship

### 15.9 Showcase content guidelines

| Rule | Rationale |
|------|-----------|
| ใช้ภาษาไทยเป็นหลัก (80/20 TH/EN) | ตรงกับ target users |
| Library docs ต้องมีเนื้อหาจริง ไม่ใช่ lorem ipsum | ให้ user เห็นว่า RAG ทำงานจริง |
| Research report ต้องมี citations ย้อนกลับ docs | แสดง traceability |
| Storyboard ต้องมี video prompts ที่ใช้ได้จริง | ส่งเข้า Media Studio ได้จริง |
| Presentation ต้องเปิดใน editor แล้วดูดี | ไม่ใช่แค่ text บน blank slides |
| แต่ละ showcase ไม่เกิน 2 นาทีในการดู | ไม่ให้ user เบื่อก่อนจะ try |

### 15.10 Delivery integration

Showcase projects เป็นส่วนหนึ่งของ Phase 1 delivery (ไม่ใช่ Phase 2):

| Week | Showcase deliverable |
|------|---------------------|
| **2** | เขียน library docs สำหรับ showcase (10 markdown files) |
| **3** | รัน agents บน staging + บันทึก envelope results |
| **3** | สร้าง seed script สำหรับ showcase data |
| **4** | Showcase gallery UI + "View Example" modal + "Try it yourself" flow |
| **4** | Fix `createFromTemplate` ให้ clone tools + flows + nodeConfig |

---

## 16. Observability

### 16.1 Audit trail

ทุก agency run ที่มี envelope จะ log เพิ่ม:

```python
await log_agency_event(
    event_type="agency_envelope_parsed",
    run_id=run_id,
    intent=envelope.intent,
    artifact_count=len(envelope.artifacts),
    downstream_targets=downstream_targets,
)
```

### 16.2 Metrics

เพิ่มใน agency admin dashboard:
- Runs by intent type (pie chart)
- Artifact creation rate
- Downstream dispatch success rate
- Template usage frequency

### 16.3 Tracing

`agency_run_id` propagates to:
- RAG queries (via existing tool metadata headers)
- Presentation creation (via new internal API header `X-Agency-Run-Id`)
- Library item creation (via metadata)

---

## 17. Delivery plan

> **Note**: Auto Draft Agent + Content Automation Engine delivery tracked in **Spec 035**. Spec 034 focuses on AgencyResultEnvelope infrastructure + 3 agent templates (Research, Storyboard, Deck Builder). Spec 035 depends on 034's EnvelopeParser, ResultRouter, and builtin-skill-discovery being complete.

### Phase 1 — Core + Showcase (4-5 weeks)

| Week | Deliverables |
|------|-------------|
| **1** | `AgencyResultEnvelope` Pydantic models + `EnvelopeParser` + tests |
| **1** | `agency_run_artifacts` table (Alembic migration) + new columns on `agency_runs` |
| **1** | `builtin-presentation-create` tool (Node.js handler + Python tool registration) |
| **1** | `builtin-skill-discovery` tool (Node.js handler + Python tool registration) |
| **2** | `ResultRouter` service (Node.js) + integration with agency router |
| **2** | Deep Research Agent template (instructions + tool config + seed) |
| **2** | เขียน showcase library docs (10 markdown files) |
| **3** | Storyboard Planner Agent template |
| **3** | Deck Builder Agent template |
| **3** | Fix `createFromTemplate` ให้ clone tools + flows + nodeConfig |
| **3** | Update `AgencyExecutor` ให้ return envelope data (Virtual Workflow integration) |
| **3** | รัน agents บน staging + บันทึก showcase envelope results |
| **4** | `agency_showcase_projects` table + seed script |
| **4** | Chat UI: action buttons + artifact display + "Open in Editor" flow |
| **4** | Showcase gallery UI + "View Example" modal |
| **5** | "Try it yourself" flow (clone + prefill) |
| **5** | Integration tests: full flow from message → envelope → downstream + showcase rendering |

### Phase 2 — Polish + Workflow Integration (2-3 weeks)

| Deliverable |
|-------------|
| Media Studio prefill integration (media_prompt intent) |
| Storyboard visual viewer in chat (scene cards) |
| Report viewer in chat (collapsible sections with citations) |
| Save research report to library as document |
| Template gallery UI with previews |
| Video Edit integration (storyboard → timeline import) |
| Workflow template seed script (3 templates: Weekly Research, On-Demand Deck, Storyboard→Deck pipeline) |
| Agency ID resolution for workflow templates (lookup by template name → tenant-specific agency_id) |
| Email template `research-email` for Weekly Research Report workflow |

### Phase 3 — Optimization

| Deliverable |
|-------------|
| Streaming envelope progress (partial results while agent works) |
| Agent self-improvement (track which templates produce best results) |
| Custom template creation by users |
| Multi-agent agency templates (chained agents within a single agency — ไม่ใช่ workflow, เป็น AgencySwarm multi-node graph) |

---

## 18. Acceptance criteria

### Functional

1. User สามารถ clone Deep Research template → ส่งคำถาม → ได้ structured report พร้อม references จาก library documents
2. User สามารถ clone Storyboard Planner template → ส่ง video brief → ได้ storyboard พร้อม scene prompts
3. User สามารถ clone Deck Builder template → ส่ง topic → presentation ถูกสร้างใน Presentation Editor โดยอัตโนมัติ เปิดแก้ไขได้ทันที
4. Chat แสดง action buttons ตาม intent (Open in Editor, Save to Library, etc.)
5. `agency_run_artifacts` มี records ครบทุก artifact ที่สร้าง
6. Deck Builder สร้าง slides ผ่าน layout engine เดิม → ผลลัพธ์มี elements, positions, styles ครบ
7. Template cloning ทำงานได้ + agency ที่ clone มาแก้ไขได้ใน Agency Builder (รวม tools, flows, nodeConfig)
8. Showcase gallery แสดง 3 example projects พร้อม "View Example" + "Use Template" ในหน้า Agency Templates
9. "View Example" modal แสดง example conversation + output ที่สมจริง (ไม่ใช่ mock)
10. "Try it yourself" flow: clone template → เปิด Agency Chat → prefill example input
11. Showcase deck presentation (Q2 Strategy) เปิดใน Presentation Editor ได้จริง มี slides ที่ render ครบ
12. `AgencyExecutor` workflow node return `envelope_intent`, `envelope`, `artifacts` ใน output (backward compatible — agencies ที่ไม่มี envelope return `null`)
13. *(Phase 2)* Workflow template "Weekly Research Report" สามารถ clone จาก gallery → configure recipients → run ได้จริง → ส่ง email พร้อม report
14. *(Phase 2)* Workflow template "On-Demand Deck Builder" สามารถ trigger ผ่าน webhook → สร้าง deck → แจ้ง notification
15. *(Phase 2)* Workflow template "Storyboard → Deck Pipeline" chain 2 agency nodes ได้สำเร็จ → storyboard + deck ถูกสร้างตามลำดับ

> **Note**: AC #13-15 เป็น **Phase 2 deliverables** (ดู Section 17 Phase 2: "Workflow template seed script"). Phase 1 delivers `AgencyExecutor` envelope support (AC #12) แต่ workflow templates ยังไม่ seed
16. `builtin-skill-discovery` return skills จาก marketplace ที่ match กับ query (category + keyword match + relevance ranking)
17. Agents ใช้ `builtin-skill-executor` เรียก skills จาก marketplace ได้ (เช่น article writers, prompt engineers) — envelope metrics.skill_calls[] มี records ครบ
18. Agents สามารถทำงานได้แม้ Library ว่าง (ใช้ skills + web search สร้างเนื้อหา)
19. เมื่อเพิ่ม skill ใหม่เข้า marketplace → agents discover + ใช้ skill ใหม่ได้ทันทีโดยไม่ต้องแก้ agent instructions

### Non-functional

1. ทุก LLM call ผ่าน SmartSpecPro gateway (ไม่มี direct provider calls)
2. ทุก RAG query ผ่าน tenant-scoped ACL (ไม่มี cross-tenant data leak)
3. Envelope parsing failure ไม่ crash agency run — fallback เป็น chat_reply
4. `builtin-presentation-create` สร้าง deck ใน < 5 วินาทีสำหรับ 10 slides
5. Artifact records linkable กลับไปยัง agency_run + library items
6. Existing agencies ที่ไม่ใช้ envelope ทำงานเหมือนเดิม 100% (backward compatible)
7. Internal tool endpoints (`/api/internal/tools/*`) ไม่ accessible จาก public internet — เฉพาะ internal network (Python → Node.js)
8. `INTERNAL_SERVICE_TOKEN` ถูก validate ทุก internal tool call

---

## 19. Risks and mitigations

### Risk 1: LLM ไม่ output valid JSON envelope

Agent อาจ output malformed JSON, missing fields, หรือ wrong schema

**Mitigation**:
- Agent instructions include explicit schema examples (few-shot)
- `EnvelopeParser` มี fallback: ถ้า parse fail → treat as `chat_reply`
- ใช้ structured output / JSON mode ของ LLM ถ้า model รองรับ (gpt-4o, claude-3)
- Log parse failures สำหรับ monitoring + prompt improvement

### Risk 2: Presentation layout engine ไม่รองรับ content จาก agent

Agent อาจสร้าง slide content ที่ layout engine ไม่สามารถ render ได้ดี

**Mitigation**:
- AgencySlide schema จำกัด fields ให้ตรงกับ AIPresentationSlide ทุกประการ
- `template_id` ต้องเป็น value จาก `AI_LAYOUT_TEMPLATE_IDS` enum
- ถ้า layout fail → skip slide + log warning, ไม่ fail ทั้ง deck

### Risk 3: Large RAG queries เพิ่มต้นทุน credits

Deep Research agent อาจเรียก RAG หลายครั้ง → LLM tokens สูง

**Mitigation**:
- Agent instructions กำหนด max RAG calls (ไม่เกิน 5 ครั้งต่อ run)
- Credit pre-check ยังทำงานเหมือนเดิม (`credit_manager.pre_check`)
- Agency `creditMultiplier` สามารถปรับสำหรับ research templates

### Risk 4: Template instructions drift หลัง LLM behavior เปลี่ยน

Model update อาจทำให้ agent output format เปลี่ยน

**Mitigation**:
- Templates มี version tracking (`agencyVersions`)
- Integration tests verify envelope output format
- Template instructions ถูก pin กับ specific model version ใน agent config

### Risk 5: Scheduled workflow templates ใช้ credits โดย user ไม่รู้ตัว

Workflow template เช่น "Weekly Research Report" ที่ใช้ `schedule_trigger` จะ auto-run LLM calls + RAG queries ตาม schedule → อาจใช้ credits โดยที่ user ไม่ได้ตั้งใจ หรือลืมว่าเปิดอยู่

**Mitigation**:
- Credit pre-check ก่อน workflow execution (existing: `credit_manager.pre_check` ใน AgencyService)
- Workflow with `schedule_trigger` ต้องมี notification ทุกครั้งที่ run (email/in-app) แสดง credits ที่ใช้
- เพิ่ม `maxRunsPerDay` config สำหรับ scheduled workflows (default: 1, max: 24)
- Admin dashboard แสดง "Scheduled workflow credit usage" metric
- ถ้า credit < threshold → auto-pause scheduled workflows + แจ้ง user

### Risk 6: Workflow double-charging (agency_run inside workflow)

เมื่อ agency_run node ถูกเรียกจาก Virtual Workflow Engine → credits ถูกหักที่ AgencyService (per LLM call). แต่ถ้า workflow runtime ยังหัก credits ด้วย (e.g., per-node execution fee) → user ถูก charge ซ้ำ

**Mitigation**:
- Credits สำหรับ LLM calls ถูกจัดการที่ **AgencyService level เท่านั้น** (ผ่าน `credit_manager`)
- Workflow runtime **ไม่หัก** credits สำหรับ agency_run node execution
- workflow `cost_tracking` metadata ต้องรวม agency credits ที่ใช้ (จาก `run_metadata.total_tokens`) เพื่อแสดงใน billing dashboard
- เพิ่ม `billing_source: "agency"` flag ใน workflow execution log เพื่อให้ billing system ไม่ double-count

---

## 20. Appendix A: Full sequence — Deck Builder flow

```
1. User clones "Deck Builder" template → agency created in tenant
2. User opens Agency Chat, sends: "สร้าง presentation เรื่อง AI Strategy 2026"
3. tRPC agency.sendMessage → Python agency_service.execute_run()
4. AgencySwarm entry agent receives message
5. Agent decides to search library first:
   → builtin-rag-knowledge(query="AI Strategy 2026", top_k=10)
   → gets 6 relevant documents with snippets
6. Agent synthesizes findings + creates slide plan
7. Agent calls builtin-presentation-create:
   → POST /api/internal/tools/presentation-create
   → Node.js creates library item + deck + 8 slides via layout engine
   → Returns { deck_id: 142, library_item_id: 891, slide_count: 8 }
8. Agent outputs final response with envelope:
   <sse:envelope>
   {
     "intent": "presentation_deck",
     "summary": "สร้าง presentation 'AI Strategy 2026' จำนวน 8 slides...",
     "payload": { "title": "AI Strategy 2026", "slides": [...] },
     "artifacts": [
       { "artifact_id": "deck_142", "title": "AI Strategy 2026",
         "artifact_type": "slide_deck", "library_item_id": 891 }
     ],
     "references": [
       { "document_id": "doc_45", "title": "AI Roadmap Q1" },
       { "document_id": "doc_67", "title": "Industry Trends 2026" }
     ]
   }
   </sse:envelope>
9. Python EnvelopeParser extracts envelope
10. agency_runs updated: result_intent="presentation_deck", artifact_count=1
11. agency_run_artifacts row created: artifact_type="slide_deck", presentation_deck_id=142
12. Response returned to Node.js
13. Node.js ResultRouter creates RouteResult:
    - chatMessage: summary + artifact card
    - actions: [{ label: "Open in Presentation Editor", action: "open_presentation", params: { libraryItemId: 891 } }]
14. Frontend renders chat message + "Open in Presentation Editor" button
15. User clicks button → navigates to /presentation/891
16. Presentation Editor opens with 8 fully-rendered slides ready to edit
```

---

## 21. Appendix B: Comparison with Deer Flow approach

| Aspect | This Spec (034) | Deer Flow Spec |
|--------|----------------|----------------|
| **Effort** | 4-5 weeks Phase 1 | 11-15 weeks Phase 0+1 |
| **New dependencies** | None | Deer Flow 2.0 (unstable rewrite) |
| **Gateway changes** | None (uses existing /v1 path) | Must complete stub gateway |
| **New tables** | 1 (agency_run_artifacts) | 2+ (deerflow_jobs, etc.) |
| **New services** | 3 (EnvelopeParser, ResultRouter, 1 tool) | 7+ (adapter, dispatch, import, etc.) |
| **Risk level** | Low (extends existing systems) | High (triple-moving-foundations) |
| **Presentation import** | Uses existing layout engine | Must build new import adapter |
| **RAG access** | Uses existing builtin-rag-knowledge | Must build SSPLibrarySearchTool/FetchTool bridge |
| **Artifact tracking** | New table + columns | New table + cross-system refs |
| **Backward compatible** | 100% (envelope is opt-in) | Requires execution_backend concept |

---

## 22. Appendix C: Files to create/modify

### New files

| File | Purpose |
|------|---------|
| `python-backend/app/services/agency_envelope.py` | AgencyResultEnvelope models + EnvelopeParser |
| `python-backend/app/models/agency_artifacts.py` | AgencyRunArtifact SQLAlchemy model |
| `python-backend/migrations/versions/XXX_agency_artifacts.py` | Alembic migration |
| `apps/web/server/services/agencyResultRouter.ts` | ResultRouter service |
| `apps/web/server/routes/internalToolsPresentationCreate.ts` | Internal tool endpoint for presentation creation |
| `apps/web/server/routes/internalToolsSkillDiscovery.ts` | Internal tool endpoint for skill discovery (marketplace search) |
| `apps/web/server/services/__tests__/agencyResultRouter.test.ts` | Tests |
| `python-backend/tests/test_agency_envelope.py` | Envelope parser tests |
| `python-backend/tests/test_builtin_presentation_tool.py` | builtin-presentation-create tool tests |
| `python-backend/tests/test_agency_executor_envelope.py` | AgencyExecutor envelope output tests |
| `apps/web/drizzle/XXX_agency_showcase.sql` | Drizzle migration for agency_showcase_projects |
| `apps/web/scripts/seed-showcase.ts` | Showcase data seed script (library docs + conversations + envelopes + decks) |
| `apps/web/client/src/components/agency/ShowcaseGallery.tsx` | Showcase gallery UI |
| `apps/web/client/src/components/agency/ShowcaseExampleModal.tsx` | "View Example" modal |
| `specs/feature/034-ResearchStoryboardBuilder/showcase-docs/` | 10 markdown library docs for showcase |
| `apps/web/scripts/seed-workflow-agency-templates.ts` | Seed 3 workflow templates ที่ใช้ agency_run node เข้า workflowTemplates |

### Modified files

| File | Change |
|------|--------|
| `python-backend/app/models/agency.py` | Add columns to AgencyRun (result_intent, result_envelope, artifact_count, downstream_targets) |
| `python-backend/app/services/agency_service.py` | Call EnvelopeParser after run, save artifacts (Python-side) |
| `python-backend/app/services/agency_swarm_adapter.py` | Add new fields to `RunResult` BaseModel |
| `python-backend/app/services/agency_tools.py` | Register `builtin-presentation-create` + `builtin-skill-discovery`, add `_call_internal_tool()` with service token auth |
| `apps/web/server/routers/agency.ts` | Integrate ResultRouter, fix `createFromTemplate` to clone tools/flows/nodeConfig, add showcase tRPC endpoints (listShowcaseProjects, getShowcaseDetail, getShowcaseConversation) |
| `apps/web/server/_core/index.ts` | Register internal tools route |
| `apps/web/drizzle/schema.ts` | Add `agencyShowcaseProjects` table, add `nodeType`/`nodeConfig`/`toolConfigs` to `agentTemplates` |
| `apps/web/drizzle/seed.ts` | Add 3 agency templates + 3 showcase projects |
| `python-backend/app/orchestrator/node_executors/agency_executor.py` | Expose envelope_intent, envelope, artifacts in node output + user_token fallback for scheduled workflows |
| `python-backend/app/orchestrator/expression_resolver.py` | Add `agency_template_name` config field support (Phase 2, for workflow template agency ID resolution) |
| `apps/web/client/src/components/agency/AgencyBuilder.tsx` | Add showcase section to empty state |
| `apps/web/.env.example` | Add `INTERNAL_SERVICE_TOKEN` variable |
| `python-backend/.env.example` | Add `INTERNAL_SERVICE_TOKEN` variable |

### New environment variables

| Variable | Service | Purpose |
|----------|---------|---------|
| `INTERNAL_SERVICE_TOKEN` | Both (Node.js + Python) | Shared secret for service-to-service auth on `/api/internal/tools/*` endpoints. Must be >= 32 random chars. |
